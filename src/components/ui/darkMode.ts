"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_KEY, applyTheme, readThemePref, setThemePref } from "@/lib/theme";

const CHANGE = "ct-theme-change";
function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY || e.key === null) cb(); };
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", onStorage);
  // Re-read when the choice changes (also in another tab) or when <html data-theme> is re-applied.
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => { window.removeEventListener(CHANGE, cb); window.removeEventListener("storage", onStorage); mo.disconnect(); };
}
/** Night if the choice is dark, or system while the OS is dark (the same rule the boot script applies). */
function isDark(): boolean {
  const pref = readThemePref();
  if (pref === "dark") return true;
  return pref === "system" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * The current day/night state and a flip (used by the profile menu). Light and Dark only; a "system" choice made
 * earlier keeps following the OS until the person flips it. Writes localStorage `ct-theme` and `<html data-theme>`.
 */
export function useDarkMode(): { dark: boolean; flip: () => void } {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const flip = () => {
    setThemePref(dark ? "light" : "dark");
    window.dispatchEvent(new Event(CHANGE));
  };
  return { dark, flip };
}

/**
 * Keeps `<html data-theme>` applied and, for a "system" choice, following the OS. Mounted once in the app shell so it
 * runs on every page, whether or not a switch is on screen.
 */
export function ThemeSync() {
  const pref = useSyncExternalStore(subscribe, readThemePref, () => "light" as const);
  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [pref]);
  return null;
}
