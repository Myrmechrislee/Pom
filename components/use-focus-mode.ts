"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "pom.focus-mode";

export function useFocusMode({
  hydrated,
  running,
  autoFullscreen,
}: {
  hydrated: boolean;
  running: boolean;
  autoFullscreen: boolean;
}) {
  const [zen, setZen] = useState(false);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const savedMode = useRef<string | null>(null);
  const timerRestored = useRef(false);
  const leavingPage = useRef(false);

  const setFocusMode = useCallback((enabled: boolean) => {
    savedMode.current = String(enabled);
    setZen(enabled);
    try {
      sessionStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // Focus mode still works when browser storage is unavailable.
    }
  }, []);
  const enterFocusMode = useCallback(() => {
    setFocusMode(true);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => {
        // Reloads may require a new click; keep the full-window focus layout.
      });
    }
  }, [setFocusMode]);
  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [setFocusMode]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector("dialog[open]")
      )
        exitFocusMode();
    };
    const fullscreenChanged = () => {
      const fullscreen = Boolean(document.fullscreenElement);
      setBrowserFullscreen(fullscreen);
      // Browsers also leave fullscreen while unloading the current document.
      if (!leavingPage.current) setFocusMode(fullscreen);
    };
    const leaving = () => {
      leavingPage.current = true;
    };
    const returned = () => {
      leavingPage.current = false;
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("beforeunload", leaving);
    window.addEventListener("pagehide", leaving);
    window.addEventListener("pageshow", returned);
    document.addEventListener("fullscreenchange", fullscreenChanged);
    setFullscreenSupported(Boolean(document.documentElement.requestFullscreen));
    setBrowserFullscreen(Boolean(document.fullscreenElement));
    try {
      savedMode.current = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      // A blocked browser store starts in the regular workspace.
    }
    if (savedMode.current === "true") enterFocusMode();
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("beforeunload", leaving);
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener("pageshow", returned);
      document.removeEventListener("fullscreenchange", fullscreenChanged);
    };
  }, [enterFocusMode, exitFocusMode, setFocusMode]);

  useEffect(() => {
    if (!hydrated || timerRestored.current) return;
    timerRestored.current = true;
    // Preserve recovery for running timers saved before focus mode was persisted.
    if (savedMode.current === null && running && autoFullscreen) enterFocusMode();
  }, [hydrated, running, autoFullscreen, enterFocusMode]);

  return { zen, browserFullscreen, fullscreenSupported, enterFocusMode, exitFocusMode };
}
