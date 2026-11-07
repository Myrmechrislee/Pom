"use client";

import { useCallback, useEffect, useRef } from "react";

const notes = {
  start: [523.25, 659.25],
  pause: [392, 293.66],
  complete: [523.25, 659.25, 783.99],
} as const;

export function useSoundEffects(enabled: boolean) {
  const audioRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const prepare = useCallback(() => {
    if (!enabledRef.current) return null;
    try {
      let audio = audioRef.current;
      if (!audio || audio.state === "closed") {
        audio = new AudioContext();
        audioRef.current = audio;
      }
      // Unlock during the click, before task saving or fullscreen can consume activation.
      if (audio.state === "suspended") void audio.resume().catch(() => {});
      return audio;
    } catch {
      return null;
    }
  }, []);

  const play = useCallback(
    (effect: keyof typeof notes) => {
      const audio = prepare();
      if (!audio) return;
      try {
        const now = audio.currentTime;
        const duration = effect === "complete" ? 0.28 : 0.16;
        notes[effect].forEach((frequency, index) => {
          const start = now + index * 0.09;
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.07, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
          oscillator.connect(gain);
          gain.connect(audio.destination);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
          oscillator.start(start);
          oscillator.stop(start + duration);
        });
      } catch {
        // Audio support must never prevent a timer or task action.
      }
    },
    [prepare],
  );

  useEffect(
    () => () => {
      const audio = audioRef.current;
      audioRef.current = null;
      if (audio && audio.state !== "closed") void audio.close().catch(() => {});
    },
    [],
  );

  return { play, prepare };
}
