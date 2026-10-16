// URL state for the Content Plan page. Pure (client-safe): no DB or server imports.
import type { ContentSurface } from "@prisma/client";

export type ContentTab = "feed" | "reels" | "stories";

export const TAB_SURFACE: Record<ContentTab, ContentSurface> = { feed: "FEED", reels: "REEL", stories: "STORY" };

/** Unknown or missing tab → feed. */
export function parseTab(raw: unknown): ContentTab {
  return raw === "reels" || raw === "stories" ? raw : "feed";
}

/** `/content?channel=…&tab=…&post=…`; the default feed tab and empty values are left out. */
export function planHref(p: { channel?: string | null; tab?: ContentTab; post?: string | null }): string {
  const q = new URLSearchParams();
  if (p.channel) q.set("channel", p.channel);
  if (p.tab && p.tab !== "feed") q.set("tab", p.tab);
  if (p.post) q.set("post", p.post);
  const s = q.toString();
  return s ? `/content?${s}` : "/content";
}
