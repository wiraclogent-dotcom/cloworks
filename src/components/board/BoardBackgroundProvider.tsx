"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { BoardBackground } from "@/lib/boardBackground";

type Value = { background: BoardBackground; setBackground: (next: BoardBackground) => void };
const Ctx = createContext<Value | null>(null);

const keyOf = (b: BoardBackground) => `${b.id}|${b.veil}|${b.src ?? ""}`;

/**
 * The board background while the person edits it: the picker (in the toolbar) and the board (below it) share this
 * state, so every change shows at once; the picker saves it. A new value from the server (another tab, a reload)
 * replaces local state only when it actually differs.
 */
export function BoardBackgroundProvider({ initial, children }: { initial: BoardBackground; children: ReactNode }) {
  const [seen, setSeen] = useState(keyOf(initial));
  const [background, setBackground] = useState(initial);
  if (seen !== keyOf(initial)) { setSeen(keyOf(initial)); setBackground(initial); }
  return <Ctx.Provider value={{ background, setBackground }}>{children}</Ctx.Provider>;
}

/** The shared state, or null outside a provider (the board then uses its own `background` prop). */
export const useBoardBackground = () => useContext(Ctx);
