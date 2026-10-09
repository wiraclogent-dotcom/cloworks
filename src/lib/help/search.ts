import type { Article } from "@/lib/help/content";

/**
 * Case-insensitive substring match on title and body. Plain `includes`, never a RegExp, so a query like `(` is
 * just text. An empty query returns everything. Title matches come first, then body-only matches; each group keeps
 * input order.
 */
export function searchArticles(articles: Article[], query: string): Article[] {
  const q = query.trim().toLowerCase();
  if (q === "") return articles;

  const titleHits: Article[] = [];
  const bodyHits: Article[] = [];
  for (const a of articles) {
    if (a.title.toLowerCase().includes(q)) titleHits.push(a);
    else if (a.body.toLowerCase().includes(q)) bodyHits.push(a);
  }
  return [...titleHits, ...bodyHits];
}
