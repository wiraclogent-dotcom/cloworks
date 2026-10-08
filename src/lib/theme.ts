/**
 * Theme and sidebar preferences (client-side only, no server state).
 * localStorage `ct-theme` = light | dark | system (default light, never the OS unless "system" was chosen);
 * localStorage `ct-sidebar` = expanded | collapsed (no value = rail below 1280px, expanded above; CSS only).
 * `<html data-theme>` is always the RESOLVED theme (light | dark); `<html data-sidebar>` mirrors the stored sidebar choice.
 */
export const THEME_KEY = "ct-theme";
export const SIDEBAR_KEY = "ct-sidebar";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function parseThemePref(v: unknown): ThemePref {
  return v === "dark" || v === "system" ? v : "light";
}

export function resolveTheme(pref: ThemePref, prefersDark: boolean): ResolvedTheme {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

function prefersDark(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/**
 * In-memory fallback for this page when storage is blocked (setItem throws: private mode, quota, policy). Without it the
 * switch would read the old stored value back and aria-pressed would disagree with the applied theme.
 */
let memoryPref: ThemePref | null = null;

/** Test helper: forget the in-memory fallback. */
export function resetThemeMemory(): void {
  memoryPref = null;
}

export function readThemePref(): ThemePref {
  if (memoryPref !== null) return memoryPref;
  try {
    return parseThemePref(window.localStorage.getItem(THEME_KEY));
  } catch {
    return "light";
  }
}

/** Sets `data-theme` (+ color-scheme) on <html> to the resolved theme. Returns the resolved value. */
export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved = resolveTheme(pref, prefersDark());
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
  return resolved;
}

/** Stores the choice (best effort) and applies it immediately. */
export function setThemePref(pref: ThemePref): void {
  try {
    window.localStorage.setItem(THEME_KEY, pref);
    memoryPref = null;
  } catch {
    /* storage blocked: the choice still applies to this page (and is what the switch shows) */
    memoryPref = pref;
  }
  applyTheme(pref);
}

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/**
 * Without a stored choice the sidebar is the icon rail between 768px and 1279.98px (CSS in globals.css, same query).
 * A stored choice (`data-sidebar="collapsed" | "expanded"`) always wins.
 */
export const RAIL_DEFAULT_QUERY = "(min-width: 768px) and (max-width: 1279.98px)";

/** What the CSS currently shows (client only; never call during the first render). */
export function sidebarIsCollapsed(): boolean {
  const v = document.documentElement.getAttribute("data-sidebar");
  if (v === "collapsed") return true;
  if (v === "expanded") return false;
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(RAIL_DEFAULT_QUERY).matches;
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(collapsed: boolean): void {
  const root = document.documentElement;
  // Always explicit, so the user's choice overrides the width-based default.
  root.setAttribute("data-sidebar", collapsed ? "collapsed" : "expanded");
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* ignore */
  }
}

/**
 * Inlined, blocking, in <head> of the root layout: runs before first paint so there is no theme or sidebar flash.
 * Must stay dependency-free ES5 and must never throw.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,s=window.localStorage,t=s.getItem("${THEME_KEY}"),r="light";if(t==="dark")r="dark";else if(t==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)r="dark";d.setAttribute("data-theme",r);d.style.colorScheme=r;var b=s.getItem("${SIDEBAR_KEY}");if(b==="collapsed"||b==="expanded")d.setAttribute("data-sidebar",b);}catch(e){}})();`;
