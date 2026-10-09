"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_KEY, applyTheme, readThemePref, setThemePref } from "@/lib/theme";
import { cn } from "./cn";

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
 * Day / night toggle: a pill with a sun (day) or moon (night) knob that slides across. Light and Dark only; a
 * "system" choice made earlier still follows the OS until the user flips the switch. Writes localStorage `ct-theme`
 * and updates `<html data-theme>` at once. In the collapsed rail (`.sb-collapsed-only`) it is a round icon button.
 */
export function ThemeSwitch({ className }: { tone?: "surface" | "sidebar"; className?: string }) {
  const pref = useSyncExternalStore(subscribe, readThemePref, () => "light" as const);
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [pref]);

  const flip = () => {
    setThemePref(dark ? "light" : "dark");
    window.dispatchEvent(new Event(CHANGE));
  };

  return (
    <>
      <div className={cn("sb-expanded-only flex h-9 items-center justify-between gap-3 rounded-lg px-2.5 text-sm text-sidebar-foreground-secondary", className)}>
        <span id="theme-switch-label">Dark mode</span>
      <button type="button" role="switch" aria-checked={dark} aria-labelledby="theme-switch-label" title={dark ? "Night: switch to day" : "Day: switch to night"} onClick={flip}
        className={cn(
          "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors duration-300 ease-out",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
          dark ? "bg-toggle-night" : "bg-toggle-day",
        )}>
        {/* Stars, shown at night only. */}
        <span aria-hidden="true" className={cn("pointer-events-none absolute inset-0 transition-opacity duration-300", dark ? "opacity-100" : "opacity-0")}>
          <span className="absolute top-2 left-7 size-0.5 rounded-full bg-toggle-star" />
          <span className="absolute top-4 left-9 size-1 rounded-full bg-toggle-star" />
          <span className="absolute top-2.5 left-11 size-0.5 rounded-full bg-toggle-star" />
        </span>
        {/* Clouds, shown by day only. */}
        <span aria-hidden="true" className={cn("pointer-events-none absolute right-2 bottom-1.5 h-2 w-4 rounded-full bg-toggle-cloud transition-opacity duration-300", dark ? "opacity-0" : "opacity-100")} />
        <span aria-hidden="true"
          className={cn(
            "relative flex size-6 items-center justify-center rounded-full shadow-card transition-[transform,background-color,color] duration-300 ease-out motion-reduce:transition-none",
            dark ? "translate-x-6 bg-toggle-moon text-toggle-moon-ink" : "translate-x-0 bg-toggle-sun text-toggle-sun-ink",
          )}>
          {dark ? <Moon strokeWidth={1.75} className="size-3.5" /> : <Sun strokeWidth={1.75} className="size-3.5" />}
        </span>
      </button>
      </div>
      {/* Collapsed rail: one round icon button that flips the same way. */}
      <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? "Night: switch to day" : "Day: switch to night"} onClick={flip}
        className="sb-collapsed-only mx-auto inline-flex size-9 items-center justify-center rounded-lg text-sidebar-foreground-secondary transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring">
        {dark ? <Moon aria-hidden="true" strokeWidth={1.75} className="size-[18px]" /> : <Sun aria-hidden="true" strokeWidth={1.75} className="size-[18px]" />}
      </button>
    </>
  );
}
