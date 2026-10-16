"use client";

import { useSyncExternalStore } from "react";
import { normalizeName } from "@/lib/palette";

/**
 * Profile photos of the signed-in workspace, keyed by normalised name (short name and full name). Filled once per page
 * by `PhotoDirectory` in the app shell, so every `<Avatar name=…>` shows the person's photo without each list query
 * having to carry a photo URL. Empty on the server and outside the app (landing pages) = initials.
 */
let photos: ReadonlyMap<string, string> = new Map();
const listeners = new Set<() => void>();
const EMPTY: ReadonlyMap<string, string> = new Map();

export type PhotoEntry = { names: string[]; src: string };

export function setPhotoDirectory(entries: PhotoEntry[]) {
  const next = new Map<string, string>();
  for (const e of entries) for (const n of e.names) {
    const k = normalizeName(n);
    if (k && !next.has(k)) next.set(k, e.src);
  }
  photos = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** The photo URL for this person's name, or null. */
export function usePhotoFor(name: string): string | null {
  const map = useSyncExternalStore(subscribe, () => photos, () => EMPTY);
  return map.get(normalizeName(name)) ?? null;
}
