"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_KEY, applyTheme, readThemePref, setThemePref, type ThemePref } from "@/lib/theme";
import { cn } from "./cn";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

const CHANGE = "ct-theme-change";
function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY || e.key === null) cb(); };
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(CHANGE, cb); window.removeEventListener("storage", onStorage); };
}

function choose(pref: ThemePref) {
  setThemePref(pref);
  window.dispatchEvent(new Event(CHANGE));
}

/**
 * Light / Dark / System switch (buttons with aria-pressed). Writes localStorage `ct-theme` and updates
 * `<html data-theme>` at once. `tone="sidebar"` styles it for the Deep Blue sidebar. In the collapsed rail
 * (`.sb-collapsed-only`) it becomes one button that cycles through the three options.
 */
export function ThemeSwitch({ tone = "surface", className }: { tone?: "surface" | "sidebar"; className?: string }) {
  const pref = useSyncExternalStore(subscribe, readThemePref, () => "light" as ThemePref);

  // Re-apply on load and follow the OS while "System" is chosen (also another tab changing the choice).
  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [pref]);

  const sidebar = tone === "sidebar";
  const current = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[0];
  const next = OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length];
  return (
    <>
      <div role="group" aria-label="Theme"
        className={cn("sb-expanded-only grid grid-cols-3 gap-0.5 rounded-lg p-0.5", sidebar ? "bg-sidebar-hover" : "border border-border bg-surface-muted", className)}>
        {OPTIONS.map(({ value, label, Icon }) => {
          const on = value === pref;
          return (
            <button key={value} type="button" aria-pressed={on} onClick={() => choose(value)}
              className={cn(
                "inline-flex h-7 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1",
                sidebar
                  ? cn("focus-visible:outline-sidebar-ring", on ? "bg-sidebar-active text-sidebar-foreground" : "text-sidebar-foreground-secondary hover:text-sidebar-foreground")
                  : cn("focus-visible:outline-ring", on ? "bg-surface text-foreground shadow-card" : "text-foreground-secondary hover:text-foreground"),
              )}>
              <Icon aria-hidden="true" strokeWidth={1.75} className={cn("size-3.5", on && sidebar && "text-sidebar-accent")} />
              {label}
            </button>
          );
        })}
      </div>
      {sidebar ? (
        <button type="button" onClick={() => choose(next.value)} title={`Theme: ${current.label}. Switch to ${next.label}`}
          aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
          className="sb-collapsed-only mx-auto inline-flex size-9 items-center justify-center rounded-lg text-sidebar-foreground-secondary transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring">
          <current.Icon aria-hidden="true" strokeWidth={1.75} className="size-[18px]" />
        </button>
      ) : null}
    </>
  );
}
