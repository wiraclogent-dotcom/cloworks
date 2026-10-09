import type { AppRole } from "@prisma/client";
import { can } from "@/lib/permissions";
import type { Article } from "@/lib/help/content";

/** Articles the role may read, in input order. An article with no `requiresPermission` is visible to everyone. */
export function visibleArticles(articles: Article[], role: AppRole): Article[] {
  return articles.filter((a) => a.requiresPermission === undefined || can(role, a.requiresPermission));
}

/**
 * The article for `slug` if the role may see it, with its neighbours within the same section.
 * Neighbours come only from the visible list, so a hidden guide never leaks through prev/next.
 */
export function findVisible(
  articles: Article[],
  role: AppRole,
  slug: string,
): { article: Article; prev: Article | null; next: Article | null } | null {
  const visible = visibleArticles(articles, role);
  const index = visible.findIndex((a) => a.slug === slug);
  if (index === -1) return null;

  const article = visible[index];
  const sameSection = visible.filter((a) => a.section === article.section);
  const pos = sameSection.indexOf(article);
  return {
    article,
    prev: sameSection[pos - 1] ?? null,
    next: sameSection[pos + 1] ?? null,
  };
}
