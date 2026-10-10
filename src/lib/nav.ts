/** Every sidebar destination (whether or not the current user sees it). Order does not matter. */
export const NAV_HREFS = ["/requests", "/projects", "/dashboard", "/dashboard/team", "/dashboard/briefs"] as const;

/** Section roots that should stay active for their sub-pages even though the link points deeper. None today. */
const SECTION_OF: Record<string, string> = {};

/**
 * The nav item to mark active for a pathname: the longest href (or section root) that is the path itself or a parent
 * of it. "/requests/new" and "/requests/abc" → Requests, "/dashboard/team" → Team KPI,
 * null when nothing matches (e.g. Settings and Admin, which open from the top-bar gear).
 */
export function activeNavHref(pathname: string | null | undefined, hrefs: readonly string[] = NAV_HREFS): string | null {
  if (!pathname) return null;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: string | null = null;
  let bestLen = -1;
  for (const href of hrefs) {
    const root = SECTION_OF[href] ?? href;
    if ((path === root || path.startsWith(`${root}/`)) && root.length > bestLen) {
      best = href;
      bestLen = root.length;
    }
  }
  return best;
}
