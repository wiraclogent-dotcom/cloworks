import { describe, it, expect } from "vitest";
import { searchArticles } from "@/lib/help/search";
import type { Article } from "@/lib/help/content";

const article = (over: Partial<Article> & Pick<Article, "slug">): Article => ({
  title: over.slug,
  section: "Requests",
  order: 1,
  body: "",
  ...over,
});

const fixtures: Article[] = [
  article({ slug: "body-only", title: "Sharing", body: "Open the request board." }),
  article({ slug: "title-match", title: "Request basics", body: "Start here." }),
  article({ slug: "plain", title: "Projects", body: "Group work into projects (and folders)." }),
];

describe("searchArticles", () => {
  it("returns every article in input order for an empty or whitespace query", () => {
    expect(searchArticles(fixtures, "").map((a) => a.slug)).toEqual(["body-only", "title-match", "plain"]);
    expect(searchArticles(fixtures, "   ").map((a) => a.slug)).toEqual(["body-only", "title-match", "plain"]);
  });

  it("ranks title matches before body-only matches regardless of input order", () => {
    expect(searchArticles(fixtures, "request").map((a) => a.slug)).toEqual(["title-match", "body-only"]);
  });

  it("matches case-insensitively", () => {
    expect(searchArticles(fixtures, "REQUEST").map((a) => a.slug)).toEqual(["title-match", "body-only"]);
  });

  it("treats regex metacharacters literally and does not throw", () => {
    expect(() => searchArticles(fixtures, "(")).not.toThrow();
    expect(searchArticles(fixtures, "(").map((a) => a.slug)).toEqual(["plain"]);
    expect(searchArticles(fixtures, ".*")).toEqual([]);
    expect(searchArticles(fixtures, "[a")).toEqual([]);
  });
});
