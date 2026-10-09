"use client";

import { useSyncExternalStore } from "react";

const NARROW_QUERY = "(max-width: 639px)";

function subscribeNarrow(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const narrowNow = () => typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;

/** Narrow-screen (< 640px) flag. The server snapshot is "wide", so hydration always renders the wide layout first. */
export const useNarrow = () => useSyncExternalStore(subscribeNarrow, narrowNow, () => false);
