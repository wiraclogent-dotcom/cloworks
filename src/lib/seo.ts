/** Public-site SEO constants shared by the landing metadata, robots, sitemap and JSON-LD. */
export const SITE_URL = "https://clowork.my.id";

/**
 * Open Graph and Twitter fields every page shares. Next merges metadata shallowly, so a page that sets its own
 * `openGraph` or `twitter` replaces the layout's whole object: spread these into each one that does.
 */
export const OPEN_GRAPH_DEFAULTS = { siteName: "Clowork", type: "website", locale: "en_US" } as const;
export const TWITTER_DEFAULTS = { card: "summary_large_image" } as const;

export const LANDING_TITLE = "Clowork: Design Request Management for Creative Teams";

export const LANDING_DESCRIPTION =
  "Clowork is a design request tool for in-house creative teams: one brief form, a board for every request, review and approval in one place, and each designer's workload at a glance.";

/** App, auth and admin paths crawlers must not index (robots.txt disallow list). */
export const NOINDEX_PATHS: readonly string[] = [
  "/requests",
  "/projects",
  "/content",
  "/library",
  "/dashboard",
  "/admin",
  "/settings",
  "/notifications",
  "/help",
  "/lobby",
  "/signin",
  "/signup",
  "/forgot",
  "/reset",
  "/verify",
  "/join",
  "/change-password",
  "/api",
];

/** schema.org SoftwareApplication for the landing page. No offers, rating or reviews: nothing to state truthfully yet. */
export function landingJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Clowork",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: LANDING_DESCRIPTION,
    url: SITE_URL,
  };
}
