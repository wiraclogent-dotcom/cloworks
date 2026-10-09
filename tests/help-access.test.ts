import { describe, it, expect } from "vitest";
import { visibleArticles, findVisible } from "@/lib/help/access";
import type { Article } from "@/lib/help/content";

const article = (over: Partial<Article> & Pick<Article, "slug">): Article => ({
  title: over.slug,
  section: "Requests",
  order: 1,
  body: "",
  ...over,
});

const fixtures: Article[] = [
  article({ slug: "open", section: "Getting started", order: 1 }),
  article({ slug: "req", section: "Requests", order: 1, requiresPermission: "request.create" }),
  article({ slug: "req2", section: "Requests", order: 2 }),
  article({ slug: "admin", section: "Admin", order: 1, requiresPermission: "admin.manage" }),
];

describe("visibleArticles", () => {
  it("keeps articles with no permission and those the role may use", () => {
    expect(visibleArticles(fixtures, "REQUESTER").map((a) => a.slug)).toEqual(["open", "req", "req2"]);
    expect(visibleArticles(fixtures, "ADMIN").map((a) => a.slug)).toEqual(["open", "req", "req2", "admin"]);
  });
});

describe("findVisible", () => {
  it("returns null for a hidden article", () => {
    expect(findVisible(fixtures, "REQUESTER", "admin")).toBeNull();
  });

  it("returns null for an unknown or wrong-case slug", () => {
    expect(findVisible(fixtures, "REQUESTER", "ADMIN")).toBeNull();
    expect(findVisible(fixtures, "REQUESTER", "nope")).toBeNull();
  });

  it("returns the article with its visible neighbours", () => {
    expect(findVisible(fixtures, "REQUESTER", "req")).toMatchObject({ article: { slug: "req" }, prev: null, next: { slug: "req2" } });
  });

  it("skips a hidden article when looking for the previous neighbour", () => {
    expect(findVisible(fixtures, "REQUESTER", "req2")).toMatchObject({ prev: { slug: "req" }, next: null });
  });

  it("does not use a hidden article in the same section as a neighbour", () => {
    const sameSection: Article[] = [
      article({ slug: "a", section: "Requests", order: 1 }),
      article({ slug: "secret", section: "Requests", order: 2, requiresPermission: "admin.manage" }),
      article({ slug: "b", section: "Requests", order: 3 }),
    ];
    expect(findVisible(sameSection, "REQUESTER", "a")).toMatchObject({ next: { slug: "b" } });
  });
});
