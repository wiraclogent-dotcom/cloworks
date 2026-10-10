"use client";
import { useEffect, useRef } from "react";

/**
 * Calls `fn` every `intervalMs` after the previous call settles. Pauses while the tab is hidden and
 * runs once immediately when it becomes visible again. `immediate` also runs on enable/mount.
 * The latest `fn` is read through a ref, so a new closure per render does not restart the timer.
 */
export function usePoll(
  fn: () => Promise<unknown>,
  intervalMs: number,
  opts: { enabled?: boolean; immediate?: boolean } = {},
): void {
  const { enabled = true, immediate = false } = opts;
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      clearTimeout(timer);
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await fnRef.current();
      } catch {
        // swallowed: keep polling
      } finally {
        running = false;
      }
      schedule();
    };
    // While hidden the chain stops; the visibilitychange handler restarts it.
    const tick = () => {
      if (!document.hidden) void run();
    };
    const onVisibility = () => {
      if (document.hidden || cancelled) return;
      clearTimeout(timer);
      void run();
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (immediate && !document.hidden) void run();
    else schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled, immediate]);
}
