// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AppRole } from "@prisma/client";
import type { Article } from "@/lib/help/content";

let role: AppRole = "REQUESTER";

vi.mock("@/lib/session", () => ({
  requireUserOrRedirect: async () => ({ id: "u1", appRole: role, jobRole: "CREATIVE" }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
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

import ArticlePage, { generateMetadata } from "@/app/(app)/help/[slug]/page";

afterEach(cleanup);

const params = (slug: string) => Promise.resolve({ slug });

describe("help article page", () => {
  it("returns notFound for a guide the role may not read", async () => {
    role = "REQUESTER";
    await expect(ArticlePage({ params: params("admin") })).rejects.toThrow("NOT_FOUND");
  });

  it("returns notFound for an unknown slug", async () => {
    role = "REQUESTER";
    await expect(ArticlePage({ params: params("nope") })).rejects.toThrow("NOT_FOUND");
  });

  it("returns notFound for a wrong-case or encoded slug", async () => {
    role = "REQUESTER";
    await expect(ArticlePage({ params: params("Open") })).rejects.toThrow("NOT_FOUND");
    await expect(ArticlePage({ params: params("%2e%2e") })).rejects.toThrow("NOT_FOUND");
  });

  it("renders the title and body of a visible guide", async () => {
    role = "REQUESTER";
    render(await ArticlePage({ params: params("open") }));
    expect(screen.getByRole("heading", { level: 1, name: "Getting started" })).toBeTruthy();
    expect(screen.getByText("Welcome aboard.")).toBeTruthy();
  });

  it("links to the visible next guide and has no previous link on the first", async () => {
    role = "REQUESTER";
    render(await ArticlePage({ params: params("req") }));
    expect(screen.getByRole("link", { name: /Request details/ }).getAttribute("href")).toBe("/help/req2");
    expect(screen.queryByRole("link", { name: /Previous/ })).toBeNull();
  });

  it("generateMetadata uses the guide title when visible", async () => {
    role = "REQUESTER";
    await expect(generateMetadata({ params: params("open") })).resolves.toEqual({ title: "Getting started" });
  });

  it("generateMetadata never reveals a hidden guide's title", async () => {
    role = "REQUESTER";
    await expect(generateMetadata({ params: params("admin") })).resolves.toEqual({ title: "Help" });
  });
});
