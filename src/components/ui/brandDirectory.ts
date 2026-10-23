"use client";

import { useSyncExternalStore } from "react";
import { brandColorTone, brandTone, normalizeName, type BrandTone, type Tone } from "@/lib/palette";

/**
 * Brand colours of the signed-in workspace, keyed like `brandTone` (case- and whitespace-insensitive name). Filled once
 * per page by `BrandDirectory` in the app shell, so every `<BrandTag name=…>` shows the brand's chosen colour without
 * each list query carrying it. Empty on the server and outside the app = `brandTone(name)` (today's colours).
 */
let colours: ReadonlyMap<string, BrandTone> = new Map();
const listeners = new Set<() => void>();
const EMPTY: ReadonlyMap<string, BrandTone> = new Map();
const keyOf = (name: string) => normalizeName(name).replace(/\s+/g, "");

export function setBrandDirectory(entries: { name: string; color: string }[]) {
  colours = new Map(entries.map((e) => [keyOf(e.name), brandColorTone(e.color)]));
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** The badge tone for this brand name. */
export function useBrandTone(name: string): BrandTone | Tone {
  const map = useSyncExternalStore(subscribe, () => colours, () => EMPTY);
  return map.get(keyOf(name)) ?? brandTone(name);
}
