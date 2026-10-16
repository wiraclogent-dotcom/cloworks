// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within, fireEvent, act } from "@testing-library/react";

import { ProjectsView } from "@/components/ProjectsView";
import { ProjectTable, type ProjectRow } from "@/components/ProjectTable";
import { ProjectTimeline } from "@/components/ProjectTimeline";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* not available */ } });
const d = (s: string) => new Date(`${s}T00:00:00+07:00`);
const now = d("2026-10-08");
const row = (o: Partial<ProjectRow> & { id: string }): ProjectRow => ({
  title: o.id, subTitle: null, brandName: null, ownerName: "Rina", status: "IN_PROGRESS", startDate: null, dueDate: null, fileUrl: null, ...o,
});
const KEY = (s: "completed" | "canceled") => `cloworks:projects:${s}-open`;
/** The Completed / Canceled sections (Collapsible roots); open state is data-state, the heading row is the trigger. */
const sections = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("[data-closed-section]")];
const isOpen = (s: HTMLElement) => s.getAttribute("data-state") === "open";
const toggle = (s: HTMLElement) => fireEvent.click(within(s).getAllByRole("button")[0]);

describe("deadline chip", () => {
  it("is shown for open projects and for neither Done nor Canceled", () => {
    const rows = [
      row({ id: "Open", status: "IN_PROGRESS", dueDate: d("2026-10-01") }),
      row({ id: "Finished", status: "DONE", dueDate: d("2026-10-01") }),
      row({ id: "Dropped", status: "CANCELLED", dueDate: d("2026-10-01") }),
    ];
    render(<ProjectTable rows={rows} canManage={false} now={now} />);
    expect(screen.getByRole("row", { name: /Open/ }).querySelector("[data-deadline]")).not.toBeNull();
    expect(screen.getByRole("row", { name: /Finished/ }).querySelector("[data-deadline]")).toBeNull();
    expect(screen.getByRole("row", { name: /Dropped/ }).querySelector("[data-deadline]")).toBeNull();
  });
  it("a Canceled status chip reads Canceled with the cancelled tone", () => {
    render(<ProjectTable rows={[row({ id: "Dropped", status: "CANCELLED" })]} canManage={false} now={now} />);
    const chip = within(screen.getByRole("row", { name: /Dropped/ })).getByText("Canceled");
    expect(chip.getAttribute("data-tone")).toBe("cancelled");
  });
});

describe("ProjectsView: active list + closed sections", () => {
  const rows = [
    row({ id: "Act A", brandName: "Zed", dueDate: d("2026-10-20"), startDate: d("2026-10-01") }),
    row({ id: "Act B", brandName: "Alpha", status: "ON_HOLD", dueDate: d("2026-10-25"), startDate: d("2026-10-02") }),
    row({ id: "Done old", status: "DONE", brandName: "Alpha", dueDate: d("2026-08-01"), startDate: d("2026-07-01") }),
    row({ id: "Done new", status: "DONE", brandName: "Zed", dueDate: d("2026-09-15"), startDate: d("2026-09-01") }),
    row({ id: "Done none", status: "DONE", dueDate: null }),
    row({ id: "Cx 1", status: "CANCELLED", dueDate: d("2026-09-01"), startDate: d("2026-08-20") }),
  ];
  const view = (rs = rows, canManage = false) => render(<ProjectsView rows={rs} canManage={canManage} now={now} />);

  it("main list is active projects only, grouped by brand as before", () => {
    const { container } = view();
    const headers = [...container.querySelectorAll("[data-group-header]")];
    expect(headers.map((h) => h.querySelector("h2")!.textContent)).toEqual(["Alpha", "Zed"]);
    const main = container.querySelector("[data-active-projects]") as HTMLElement;
    expect(within(main).getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["Act B", "Act A"]);
    expect(within(main).queryByText("Done new")).toBeNull();
  });
  it("header count is the active count; the sub line adds completed and canceled counts", () => {
    view();
    const h1 = screen.getByRole("heading", { level: 1, name: "Projects" });
    expect(h1.parentElement!.textContent).toContain("2");
    expect(h1.closest("[data-page-title]")!.textContent).toMatch(/· 3 completed · 1 canceled/);
  });
  it("zero parts of the sub line are omitted", () => {
    const { unmount } = view(rows.filter((r) => r.status !== "CANCELLED"));
    expect(document.querySelector("[data-page-title]")!.textContent).toMatch(/· 3 completed$/);
    expect(document.querySelector("[data-page-title]")!.textContent).not.toMatch(/canceled/);
    unmount();
    view(rows.filter((r) => r.status === "IN_PROGRESS" || r.status === "ON_HOLD"));
    expect(document.querySelector("[data-page-title]")!.textContent).not.toMatch(/completed|canceled/);
  });
  it("renders collapsed Completed / Canceled sections with counts; closed by default", () => {
    const { container } = view();
    expect(sections(container)).toHaveLength(2);
    expect(sections(container).some(isOpen)).toBe(false);
    expect(screen.getByText("Completed projects (3)")).toBeTruthy();
    expect(screen.getByText("Canceled projects (1)")).toBeTruthy();
  });
  it("sections sort by due date desc (no date last) in one flat table, same columns", () => {
    const { container } = view();
    sections(container).forEach(toggle);
    const completed = container.querySelector("[data-closed-section='completed']") as HTMLElement;
    expect(within(completed).getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["Done new", "Done old", "Done none"]);
    expect(completed.querySelectorAll("[data-group-header]")).toHaveLength(0);
    expect(within(completed).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Project", "Owner", "Status", "Start", "Due", "File"]);
    const cx = container.querySelector("[data-closed-section='canceled']") as HTMLElement;
    expect(within(cx).getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["Cx 1"]);
    expect(within(cx).getByText("Canceled")).toBeTruthy();
    // no deadline chips on closed rows
    expect(completed.querySelector("[data-deadline]")).toBeNull();
  });
  it("omits a section when it is empty", () => {
    const { container } = view(rows.filter((r) => r.status !== "CANCELLED"));
    expect(sections(container)).toHaveLength(1);
    expect(screen.queryByText(/Canceled projects/)).toBeNull();
  });
  it("no closed projects: no sections at all", () => {
    const { container } = view(rows.filter((r) => r.status === "IN_PROGRESS" || r.status === "ON_HOLD"));
    expect(sections(container)).toHaveLength(0);
  });
  it("only closed projects: EmptyState 'No active projects.' and no timeline", () => {
    const { container } = view(rows.filter((r) => r.status === "DONE" || r.status === "CANCELLED"));
    expect(screen.getByText("No active projects.")).toBeTruthy();
    expect(screen.queryByText("No projects yet.")).toBeNull();
    expect(container.querySelector("#timeline-h")).toBeNull();
    expect(sections(container)).toHaveLength(2);
  });
  it("no projects at all: 'No projects yet.'", () => {
    view([]);
    expect(screen.getByText("No projects yet.")).toBeTruthy();
    expect(screen.queryByText("No active projects.")).toBeNull();
  });
  it("Edit links are available inside the closed sections when the viewer can manage", () => {
    const { container } = view(rows, true);
    sections(container).forEach(toggle);
    expect(screen.getAllByRole("link", { name: "Edit Cx 1" })).toHaveLength(1);
  });
});

describe("ProjectsView: timeline", () => {
  const rows = [
    row({ id: "t1", title: "Alpha launch", status: "IN_PROGRESS", startDate: d("2026-10-05"), dueDate: d("2026-10-16") }),
    row({ id: "t2", title: "Gone done", status: "DONE", startDate: d("2026-10-05"), dueDate: d("2026-10-16") }),
    row({ id: "t3", title: "Gone canceled", status: "CANCELLED", startDate: d("2026-10-05"), dueDate: d("2026-10-16") }),
  ];
  it("draws active projects only, each a link to its detail page with a descriptive name", () => {
    render(<ProjectsView rows={rows} canManage={false} now={now} />);
    const list = screen.getByRole("list", { name: "Project timeline" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    const link = within(list).getByRole("link", { name: "Alpha launch, 5 Oct 2026 to 16 Oct 2026, In progress" });
    expect(link.getAttribute("href")).toBe("/projects/t1");
    expect(within(list).queryByText(/Gone/)).toBeNull();
  });
});

describe("ProjectTimeline links", () => {
  const items = [{ id: "a", title: "Alpha", status: "DONE" as const, startDate: d("2026-10-05"), dueDate: d("2026-10-16") }];
  it("without href (the project detail page) rows stay plain, with no links", () => {
    render(<ProjectTimeline today={now} projects={items} />);
    expect(within(screen.getByRole("list", { name: "Project timeline" })).queryAllByRole("link")).toHaveLength(0);
  });
  it("with href each row is one focusable link wrapping title and bar, with a visible hover/focus style", () => {
    render(<ProjectTimeline today={now} projects={items} href={(p) => `/projects/${p.id}`} />);
    const link = screen.getByRole("link", { name: "Alpha, 5 Oct 2026 to 16 Oct 2026, Done" });
    expect(link.getAttribute("href")).toBe("/projects/a");
    expect(link.textContent).toContain("Alpha");
    expect(link.querySelector("[data-tone='done']")).not.toBeNull();
    expect(link.className).toMatch(/hover:bg-muted/);
    expect(link.className).toMatch(/focus-visible:outline-ring/);
  });
  it("the legend lists the statuses present, including Canceled", () => {
    const { container } = render(<ProjectTimeline today={now} projects={[...items, { ...items[0], id: "b", title: "Beta", status: "CANCELLED" as const }]} />);
    const legend = [...container.querySelectorAll("ul [data-tone]")].map((e) => e.textContent);
    expect(legend).toEqual(["Done", "Canceled"]);
  });
});

describe("collapsible sections remember open/closed", () => {
  const rows = [row({ id: "Done 1", status: "DONE" }), row({ id: "Cx 1", status: "CANCELLED" })];
  beforeEach(() => { try { localStorage.clear(); } catch { /* not available */ } });
  const sec = (c: HTMLElement, k: string) => c.querySelector(`[data-closed-section='${k}']`) as HTMLElement;

  it("opens a section that was left open last time", async () => {
    localStorage.setItem(KEY("completed"), "1");
    const { container } = render(<ProjectsView rows={rows} canManage={false} now={now} />);
    await act(async () => {});
    expect(isOpen(sec(container, "completed"))).toBe(true);
    expect(isOpen(sec(container, "canceled"))).toBe(false);
  });
  it("stores the choice when toggled", async () => {
    const { container } = render(<ProjectsView rows={rows} canManage={false} now={now} />);
    const s = sec(container, "canceled");
    await act(async () => { toggle(s); });
    expect(localStorage.getItem(KEY("canceled"))).toBe("1");
    await act(async () => { toggle(s); });
    expect(localStorage.getItem(KEY("canceled"))).toBe("0");
  });
  it("renders closed and works when localStorage throws", async () => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error("denied"); };
    Storage.prototype.setItem = () => { throw new Error("denied"); };
    try {
      const { container } = render(<ProjectsView rows={rows} canManage={false} now={now} />);
      await act(async () => {});
      const s = sec(container, "completed");
      expect(isOpen(s)).toBe(false);
      await act(async () => { toggle(s); });
      expect(isOpen(s)).toBe(true);
    } finally { Storage.prototype.getItem = get; Storage.prototype.setItem = set; }
  });
});
