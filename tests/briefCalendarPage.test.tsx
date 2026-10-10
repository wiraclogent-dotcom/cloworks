// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AppRole } from "@prisma/client";

let role: AppRole = "LEAD";
let people = [{ id: "f", name: "Fafa" }, { id: "r", name: "Rifqy" }];
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/briefs", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ requireScope: async () => ({ user: { id: "u1", appRole: role }, db: {} }) }));
vi.mock("@/lib/briefCalendarQueries", () => ({ listBriefPeople: async () => people, loadBriefItems: async () => [] }));

import { BriefContent } from "@/app/(app)/dashboard/briefs/BriefContent";

afterEach(() => { cleanup(); role = "LEAD"; people = [{ id: "f", name: "Fafa" }, { id: "r", name: "Rifqy" }]; });

const show = async (month?: string) => render(await BriefContent({ searchParams: Promise.resolve({ month }) }));

describe("Brief Calendar page", () => {
  it("a requester gets the access message and no calendar", async () => {
    role = "REQUESTER";
    await show("2026-10");
    expect(screen.getByText("The brief calendar is only available to leads and admins.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Legend" })).toBeNull();
  });

  it("a lead sees the month and the social media team", async () => {
    await show("2026-10");
    expect(screen.getByRole("heading", { level: 1, name: "Brief Calendar" })).toBeTruthy();
    expect(document.querySelector("[data-page-title]")!.textContent).toContain("October 2026");
    expect(screen.getByRole("list", { name: "Legend" }).textContent).toContain("Rifqy");
  });

  it("with nobody on the social media team shows an empty state", async () => {
    people = [];
    await show("2026-10");
    expect(screen.getByText("No social media team members")).toBeTruthy();
  });
});
