/**
 * Theme and sidebar preferences (client-side only, no server state).
 * localStorage `ct-theme` = light | dark | system (default light, never the OS unless "system" was chosen);
 * localStorage `ct-sidebar` = expanded | collapsed (default expanded).
 * `<html data-theme>` is always the RESOLVED theme (light | dark); `<html data-sidebar="collapsed">` collapses the rail.
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

export function readThemePref(): ThemePref {
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
  } catch {
    /* storage blocked: the choice still applies to this page */
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

export function setSidebarCollapsed(collapsed: boolean): void {
  const root = document.documentElement;
  if (collapsed) root.setAttribute("data-sidebar", "collapsed");
  else root.removeAttribute("data-sidebar");
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
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,s=window.localStorage,t=s.getItem("${THEME_KEY}"),r="light";if(t==="dark")r="dark";else if(t==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)r="dark";d.setAttribute("data-theme",r);d.style.colorScheme=r;if(s.getItem("${SIDEBAR_KEY}")==="collapsed")d.setAttribute("data-sidebar","collapsed");}catch(e){}})();`;
