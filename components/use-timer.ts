"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type FocusSession, type Preferences, type TimerState } from "@/lib/types";

const initial = (minutes: number, round = 1): TimerState => ({
  mode: "focus",
  remaining: minutes * 60,
  running: false,
  endsAt: null,
  id: crypto.randomUUID(),
  startedAt: null,
  elapsed: 0,
  round,
});
export function useTimer(
  preferences: Preferences,
  ready: boolean,
  userId: string | undefined,
  record: (session: FocusSession) => Promise<void>,
  notify: (message: string) => void,
) {
  const [timer, setTimer] = useState<TimerState>(() => ({
    mode: "focus",
    remaining: 1800,
    running: false,
    endsAt: null,
    id: "initial",
    startedAt: null,
    elapsed: 0,
    round: 1,
  }));
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;
  const recordRef = useRef(record);
  recordRef.current = record;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const initialized = useRef(false);
  const finished = useRef(new Set<string>());
  const key = `pom.timer.${userId || "guest"}`;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null") as TimerState | null;
      if (
        saved &&
        ["focus", "rest", "longRest"].includes(saved.mode) &&
        Number.isFinite(saved.remaining) &&
        saved.id
      )
        setTimer(saved);
      else setTimer(initial(prefsRef.current.focus));
    } catch {
      setTimer(initial(prefsRef.current.focus));
    }
    setHydrated(true);
  }, [ready, key]);
  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(key, JSON.stringify(timer));
      } catch {
        /* workspace hook reports storage issues */
      }
    }
  }, [timer, key, hydrated]);

  const finish = useCallback((completed: boolean, reset = false) => {
    const t = timerRef.current,
      p = prefsRef.current;
    if (finished.current.has(t.id)) return;
    finished.current.add(t.id);
    const now = Date.now();
    const elapsed =
      t.elapsed +
      (t.running && t.endsAt
        ? Math.min(t.remaining, Math.max(0, (now - (t.endsAt - t.remaining * 1000)) / 1000))
        : 0);
    if (t.mode === "focus" && t.startedAt && elapsed >= 1)
      void recordRef.current({
        id: t.id,
        startedAt: t.startedAt,
        endedAt: new Date(Math.min(now, t.endsAt && completed ? t.endsAt : now)).toISOString(),
        seconds: Math.floor(elapsed),
        completed,
        taskId: t.taskId,
      });
    if (completed) {
      notifyRef.current(
        t.mode === "focus"
          ? "A little progress, a well-earned pause. Time to rest. 🌿"
          : "Feeling refreshed? Your next focus session is ready.",
      );
      if (p.sound) {
        try {
          const audio = new AudioContext();
          const osc = audio.createOscillator(),
            gain = audio.createGain();
          osc.type = "sine";
          osc.frequency.value = 660;
          gain.gain.setValueAtTime(0.12, audio.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 1.5);
          osc.connect(gain);
          gain.connect(audio.destination);
          osc.start();
          osc.stop(audio.currentTime + 1.5);
          osc.onended = () => void audio.close();
        } catch {
          /* browsers can require another user gesture */
        }
      }
    }
    const round = t.mode === "focus" && completed ? t.round + 1 : t.round;
    const mode = reset
      ? t.mode
      : t.mode === "focus"
        ? completed && t.round % p.sessionsBeforeLongBreak === 0
          ? "longRest"
          : "rest"
        : "focus";
    const minutes = p[mode];
    const next: TimerState = { ...initial(minutes, round), mode, taskId: t.taskId };
    if (completed && p.autoStart) {
      next.running = true;
      next.endsAt = now + minutes * 60000;
      next.startedAt = new Date(now).toISOString();
    }
    timerRef.current = next;
    setTimer(next);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const tick = () => {
      const t = timerRef.current;
      if (t.running && t.endsAt && Date.now() >= t.endsAt) finish(true);
      else if (t.running) setTick(Math.floor(Date.now() / 1000));
    };
    tick();
    const interval = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [hydrated, finish]);
  const [, setTick] = useState(0);
  const remaining =
    timer.running && timer.endsAt
      ? Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000))
      : Math.ceil(timer.remaining);
  const toggle = () => {
    const t = timerRef.current,
      now = Date.now();
    let next: TimerState;
    if (t.running && t.endsAt) {
      const left = Math.max(0, (t.endsAt - now) / 1000);
      next = {
        ...t,
        running: false,
        remaining: left,
        endsAt: null,
        elapsed: t.elapsed + Math.max(0, t.remaining - left),
      };
    } else
      next = {
        ...t,
        running: true,
        endsAt: now + t.remaining * 1000,
        startedAt: t.startedAt || new Date(now).toISOString(),
      };
    timerRef.current = next;
    setTimer(next);
  };
  const selectMode = (mode: TimerState["mode"]) => {
    if (timerRef.current.mode === mode) return;
    finish(false, true);
    const next = {
      ...initial(prefsRef.current[mode], timerRef.current.round),
      mode,
      taskId: timerRef.current.taskId,
    };
    timerRef.current = next;
    setTimer(next);
  };
  const selectTask = (taskId: string | undefined) => {
    const next = { ...timerRef.current, taskId };
    timerRef.current = next;
    setTimer(next);
  };
  // Apply new durations only to a session that hasn't started.
  useEffect(() => {
    const t = timerRef.current;
    if (hydrated && !t.startedAt && !t.running) {
      const next = { ...t, remaining: preferences[t.mode] * 60 };
      timerRef.current = next;
      setTimer(next);
    }
  }, [preferences.focus, preferences.rest, preferences.longRest, hydrated]);
  return {
    timer,
    remaining,
    toggle,
    selectMode,
    selectTask,
    reset: () => finish(false, true),
    skip: () => finish(false),
    hydrated,
  };
}
