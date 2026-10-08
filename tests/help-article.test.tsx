// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AppRole } from "@prisma/client";
import type { Article } from "@/lib/help/content";

let role: AppRole = "REQUESTER";
const calls = vi.hoisted(() => ({ notFound: 0 }));

vi.mock("@/lib/session", () => ({
  requireUserOrRedirect: async () => ({ id: "u1", appRole: role, jobRole: "CREATIVE" }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    calls.notFound++;
  },
}));

const fixtures: Article[] = [
  { slug: "open", title: "Getting started", section: "Getting started", order: 1, body: "Welcome aboard." },
  { slug: "req", title: "Creating a request", section: "Requests", order: 1, requiresPermission: "request.create", body: "## Steps\n\nOpen New request." },
  { slug: "req2", title: "Request details", section: "Requests", order: 2, body: "Details here." },
  { slug: "admin", title: "Managing users", section: "Admin", order: 1, requiresPermission: "admin.manage", body: "Secret admin steps." },
];

vi.mock("@/app/(app)/help/help-data", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/(app)/help/help-data")>();
  return { ...real, getArticles: () => fixtures };
});

import { metadata } from "@/app/(app)/help/[slug]/page";
import { ArticleContent } from "@/app/(app)/help/[slug]/ArticleContent";

beforeEach(() => {
  calls.notFound = 0;
});
afterEach(cleanup);

const params = (slug: string) => Promise.resolve({ slug });

async function renderArticle(slug: string) {
  render(await ArticleContent({ params: params(slug) }));
}

describe("help article page", () => {
  it("calls notFound for a guide the role may not read, and renders nothing", async () => {
    role = "REQUESTER";
    await renderArticle("admin");
    expect(calls.notFound).toBe(1);
    expect(screen.queryByText("Managing users")).toBeNull();
    expect(screen.queryByText("Secret admin steps.")).toBeNull();
  });

  it("calls notFound for an unknown, wrong-case, or encoded slug", async () => {
    role = "REQUESTER";
    for (const slug of ["nope", "Open", "%2e%2e"]) {
      calls.notFound = 0;
      cleanup();
      await renderArticle(slug);
      expect(calls.notFound).toBe(1);
    }
  });

  it("renders the title and body of a visible guide", async () => {
    role = "REQUESTER";
    await renderArticle("open");
    expect(screen.getByRole("heading", { level: 1, name: "Getting started" })).toBeTruthy();
    expect(screen.getByText("Welcome aboard.")).toBeTruthy();
    expect(calls.notFound).toBe(0);
  });

  it("links to the visible next guide and has no previous link on the first", async () => {
    role = "REQUESTER";
    await renderArticle("req");
    expect(screen.getByRole("link", { name: /Request details/ }).getAttribute("href")).toBe("/help/req2");
    expect(screen.queryByRole("link", { name: /Previous/ })).toBeNull();
  });

  it("uses a generic static title so no guide title is read per user", () => {
    expect(metadata).toEqual({ title: "Help" });
  });
});
