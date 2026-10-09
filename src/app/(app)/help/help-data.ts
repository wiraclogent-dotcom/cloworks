import { cache } from "react";
import path from "node:path";
import type { AppRole } from "@prisma/client";
import { loadArticles, SECTIONS, type Article, type Section } from "@/lib/help/content";
import { visibleArticles } from "@/lib/help/access";

/** Every guide, parsed once per server render. Invalid guides throw here, so a bad file fails the page loudly. */
export const getArticles = cache(() => loadArticles(path.join(process.cwd(), "content/help")));

/** Guides the role may read, grouped by section in SECTIONS order. Sections with no visible guide are dropped. */
export function buildIndexSections(articles: Article[], role: AppRole): { section: Section; articles: Article[] }[] {
  const visible = visibleArticles(articles, role);
  return SECTIONS.map((section) => ({ section, articles: visible.filter((a) => a.section === section) })).filter(
    (s) => s.articles.length > 0,
  );
}
