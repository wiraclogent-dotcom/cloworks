"use client";

import { useEffect } from "react";

/**
 * Scrolls `targetId` into view once on mount, unless the URL already has a hash (the browser handles that itself).
 * Legacy `?view=projects` links use it to land on the Projects section. Sections above it stream in afterwards and
 * push it down, so for about a second it scrolls again whenever the page resizes, and stops at once on user input.
 */
export function ScrollIntoViewOnMount({ targetId }: { targetId: string }) {
  useEffect(() => {
    if (window.location.hash) return;
    const go = () => document.getElementById(targetId)?.scrollIntoView();
    go();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(go);
    ro?.observe(document.body);
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const stop = () => {
      ro?.disconnect();
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, stop);
    };
    const timer = setTimeout(stop, 1000);
    for (const e of events) window.addEventListener(e, stop, { passive: true });
    return stop;
  }, [targetId]);
  return null;
}
