// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { AppRole } from "@prisma/client";
import type { Article } from "@/lib/help/content";

let role: AppRole = "REQUESTER";

vi.mock("@/lib/session", () => ({
  requireUserOrRedirect: async () => ({ id: "u1", appRole: role, jobRole: "CREATIVE" }),
}));

const fixtures: Article[] = [
  { slug: "getting-started", title: "Getting started", section: "Getting started", order: 1, body: "Welcome aboard." },
  { slug: "creating-a-request", title: "Creating a request", section: "Requests", order: 2, requiresPermission: "request.create", body: "Open New request." },
  { slug: "admin-users", title: "Managing users", section: "Admin", order: 1, requiresPermission: "admin.manage", body: "Manage users here." },
];

vi.mock("@/app/(app)/help/help-data", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/(app)/help/help-data")>();
  return { ...real, getArticles: () => fixtures };
});

import { HelpContent } from "@/app/(app)/help/HelpContent";
import { buildIndexSections } from "@/app/(app)/help/help-data";

afterEach(cleanup);

async function renderIndex() {
  render(await HelpContent());
}

describe("help index page", () => {
  it("shows sections a requester may read and hides the Admin section", async () => {
    role = "REQUESTER";
    await renderIndex();
    expect(screen.getByRole("heading", { name: "Getting started" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Admin" })).toBeNull();
    expect(screen.getByRole("link", { name: "Getting started" }).getAttribute("href")).toBe("/help/getting-started");
  });

  it("shows the Admin section to an admin", async () => {
    role = "ADMIN";
    await renderIndex();
    expect(screen.getByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Managing users" }).getAttribute("href")).toBe("/help/admin-users");
  });

  it("filters the list when a search query is typed", async () => {
    role = "REQUESTER";
    await renderIndex();
    fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "request" } });
    expect(screen.getByRole("link", { name: "Creating a request" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Getting started" })).toBeNull();
  });

  it("shows a no-results message for a query that matches nothing", async () => {
    role = "REQUESTER";
    await renderIndex();
    fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "zzz" } });
    expect(screen.getByText("No guides match ‘zzz’")).toBeTruthy();
  });
});

describe("buildIndexSections", () => {
  it("drops a section whose only guide is hidden from the role", () => {
    const sections = buildIndexSections(fixtures, "REQUESTER");
    expect(sections.map((s) => s.section)).not.toContain("Admin");
    expect(sections.every((s) => s.articles.length > 0)).toBe(true);
  });

  it("keeps SECTIONS order", () => {
    const sections = buildIndexSections(fixtures, "ADMIN");
    expect(sections.map((s) => s.section)).toEqual(["Getting started", "Requests", "Admin"]);
  });
});
