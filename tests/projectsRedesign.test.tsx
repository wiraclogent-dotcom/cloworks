// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("@/app/(app)/projects/actions", () => ({ submitProject: vi.fn() }));

import { ProjectTable, type ProjectRow } from "@/components/ProjectTable";
import { ProjectTimeline } from "@/components/ProjectTimeline";
import { ProjectForm } from "@/app/(app)/projects/ProjectForm";
import { ProjectsSkeleton, FormSkeleton } from "@/components/PageSkeletons";

afterEach(cleanup);
const d = (s: string) => new Date(`${s}T00:00:00+07:00`);
const now = d("2026-10-08");
const row = (o: Partial<ProjectRow> & { id: string }): ProjectRow => ({
  title: o.id, subTitle: null, brandName: null, ownerName: "Rina", status: "IN_PROGRESS", startDate: null, dueDate: null, fileUrl: null, ...o,
});

describe("Projects table (card, groups, chips)", () => {
  const rows = [
    row({ id: "Zed late", brandName: "Zed", status: "ON_HOLD", dueDate: d("2026-10-01") }),
    row({ id: "Clo 1", brandName: "Clogent", status: "IN_REVIEW", dueDate: d("2026-10-09") }),
    row({ id: "Clo 2", brandName: "Clogent", status: "NOT_STARTED", dueDate: d("2026-12-01") }),
    row({ id: "None", brandName: null, status: "DONE", dueDate: d("2026-10-02") }),
  ];
  it("one card with a group header strip per brand (brand tone, h2, count) in the same order as before", () => {
    const { container } = render(<ProjectTable rows={rows} canManage={false} now={now} />);
    const headers = [...container.querySelectorAll("[data-group-header]")];
    expect(headers.map((h) => h.querySelector("h2")!.textContent)).toEqual(["Clogent", "Zed", "No brand"]);
    expect(headers.map((h) => h.getAttribute("data-tone"))).toEqual(["tag-clogent", "tag-neutral", "tag-neutral"]);
    expect(within(headers[0] as HTMLElement).getByLabelText("2 projects")).toBeTruthy();
    expect(container.querySelectorAll(".rounded-xl.bg-card").length).toBe(1);
  });
  it("status chips use the project tones (icon + label)", () => {
    render(<ProjectTable rows={rows} canManage={false} now={now} />);
    const chip = (name: RegExp, label: string) => within(screen.getByRole("row", { name })).getByText(label);
    expect(chip(/Clo 1/, "In review").getAttribute("data-tone")).toBe("first-look");
    expect(chip(/Clo 2/, "Not started").getAttribute("data-tone")).toBe("requested");
    expect(chip(/Zed late/, "On hold").getAttribute("data-tone")).toBe("due-soon");
    expect(chip(/None/, "Done").getAttribute("data-tone")).toBe("done");
    expect(chip(/Clo 1/, "In review").querySelector("svg")).not.toBeNull();
  });
  it("owner avatar + name; due date with a deadline chip for open projects only", () => {
    render(<ProjectTable rows={rows} canManage={false} now={now} />);
    const zed = screen.getByRole("row", { name: /Zed late/ });
    expect(zed.querySelector('[aria-hidden="true"]')!.textContent).toBe("RI");
    expect(within(zed).getByText("Rina")).toBeTruthy();
    expect(zed.querySelector("[data-deadline]")!.getAttribute("data-deadline")).toBe("overdue");
    expect(screen.getByRole("row", { name: /Clo 1/ }).querySelector("[data-deadline]")!.getAttribute("data-deadline")).toBe("due-soon");
    expect(screen.getByRole("row", { name: /None/ }).querySelector("[data-deadline]")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Days left" })).toBeNull();
  });
  it("Edit links stay unique per row", () => {
    render(<ProjectTable rows={rows} canManage now={now} />);
    expect(screen.getAllByRole("link", { name: /^Edit / }).map((l) => l.textContent)).toEqual(["Edit Clo 1", "Edit Clo 2", "Edit Zed late", "Edit None"]);
  });
  it("empty state uses the kit EmptyState", () => {
    render(<ProjectTable rows={[]} canManage now={now} />);
    expect(screen.getByText("No projects yet.")).toBeTruthy();
    expect(screen.getByText(/Use “New project”/)).toBeTruthy();
  });
});

describe("Projects timeline", () => {
  const projects = [
    { id: "a", title: "Alpha", status: "DONE" as const, startDate: d("2026-10-05"), dueDate: d("2026-10-16") },
    { id: "b", title: "Beta", status: "IN_PROGRESS" as const, startDate: d("2026-10-01"), dueDate: d("2026-10-20") },
  ];
  it("bars take the status tone, carry the status in text, today marker and a status legend", () => {
    const { container } = render(<ProjectTimeline today={now} projects={projects} />);
    const alpha = screen.getByTitle(/^Alpha: 5 Oct 2026 to 16 Oct 2026 · Done$/);
    expect(alpha.getAttribute("data-tone")).toBe("done");
    expect(alpha.className).toContain("bg-tone-text");
    expect(screen.getByRole("list", { name: "Project timeline" }).textContent).toContain("Beta, 1 Oct 2026 to 20 Oct 2026 · In progress");
    expect(container.querySelector("[data-today]")!.textContent).toBe("Today");
    expect(container.textContent).toContain("Bar colour = status:");
    expect(container.querySelectorAll('ul [data-tone]').length).toBe(2);
  });
});

describe("Project form (cards, kit fields, buttons)", () => {
  it("two card sections, kit fields, primary submit and ghost cancel", () => {
    render(<ProjectForm brands={[]} owners={[{ id: "u1", name: "Rina" }]} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Project", "Schedule and file"]);
    expect(screen.getByLabelText(/^Title/).className).toContain("border-input");
    expect(screen.getByLabelText("Brand").className).toContain("pr-8");
    expect(screen.getByRole("button", { name: "Create project" }).className).toContain("bg-primary");
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/projects");
  });
});

describe("Projects skeletons", () => {
  it("are loading statuses with skeleton blocks", () => {
    const { container, unmount } = render(<ProjectsSkeleton />);
    expect(screen.getByRole("status").textContent).toContain("Loading projects…");
    expect(container.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(5);
    unmount();
    render(<FormSkeleton header={false} />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  });
});
