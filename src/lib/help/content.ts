import fs from "node:fs";
import path from "node:path";
import { ACTIONS, type Action } from "@/lib/permissions";

export const SECTIONS = ["Getting started", "Requests", "Projects", "KPI", "Admin"] as const;
export type Section = (typeof SECTIONS)[number];

export type Article = {
  slug: string;
  title: string;
  section: Section;
  order: number;
  requiresPermission?: Action;
  body: string;
};

export class HelpContentError extends Error {
  constructor(slug: string, problem: string) {
    super(`Help guide "${slug}": ${problem}`);
    this.name = "HelpContentError";
  }
}

const FRONTMATTER_KEYS = ["title", "section", "order", "requiresPermission"] as const;

/** Removes one pair of matching surrounding quotes, so a title containing a colon can be quoted in YAML style. */
function unquote(value: string): string {
  const q = value[0];
  return (q === '"' || q === "'") && value.length >= 2 && value.endsWith(q) ? value.slice(1, -1) : value;
}

/** Reads `key: value` frontmatter between two `---` fences. Returns the fields and the body after the closing fence. */
function splitFrontmatter(slug: string, source: string): { fields: Record<string, string>; body: string } {
  const text = source.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (lines[0] !== "---") throw new HelpContentError(slug, "missing frontmatter");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new HelpContentError(slug, "frontmatter is not closed");

  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    const idx = line.indexOf(":");
    if (idx === -1) throw new HelpContentError(slug, `frontmatter line "${line.trim()}" has no key`);
    const key = line.slice(0, idx).trim();
    if (!(FRONTMATTER_KEYS as readonly string[]).includes(key)) {
      // Unknown keys are rejected, not ignored: a misspelled requiresPermission would otherwise open the guide to every role.
      throw new HelpContentError(slug, `unknown frontmatter key "${key}"`);
    }
    fields[key] = unquote(line.slice(idx + 1).trim());
  }
  return { fields, body: lines.slice(end + 1).join("\n").replace(/^\n+/, "").trim() };
}

export function parseArticle(slug: string, source: string): Article {
  const { fields, body } = splitFrontmatter(slug, source);

  const title = fields.title;
  if (!title) throw new HelpContentError(slug, "title is required");

  const section = fields.section;
  if (!(SECTIONS as readonly string[]).includes(section)) {
    throw new HelpContentError(slug, `section "${section ?? ""}" is not one of ${SECTIONS.join(", ")}`);
  }

  if (!/^\d+$/.test(fields.order ?? "")) throw new HelpContentError(slug, "order must be an integer");

  let requiresPermission: Action | undefined;
  if (fields.requiresPermission !== undefined) {
    if (!(ACTIONS as readonly string[]).includes(fields.requiresPermission)) {
      throw new HelpContentError(slug, `requiresPermission "${fields.requiresPermission}" is not a known permission`);
    }
    requiresPermission = fields.requiresPermission as Action;
  }

  return {
    slug,
    title,
    section: section as Section,
    order: Number(fields.order),
    requiresPermission,
    body,
  };
}

/** Every `*.md` file in `dir`, parsed and sorted by section order, then `order`, then `title`. */
export function loadArticles(dir: string): Article[] {
  const articles = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseArticle(f.slice(0, -3), fs.readFileSync(path.join(dir, f), "utf8")));

  return articles.sort(
    (a, b) =>
      SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) ||
      a.order - b.order ||
      a.title.localeCompare(b.title),
  );
}
