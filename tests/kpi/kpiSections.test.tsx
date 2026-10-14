// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";

vi.mock("@/app/(app)/dashboard/targets/actions", () => ({ setTarget: vi.fn() }));
vi.mock("@/app/(app)/dashboard/team/actions", () => ({ setKpiRoster: vi.fn() }));
vi.mock("@/app/(app)/dashboard/projects/actions", () => ({ addProjectTargets: vi.fn(), removeProjectTarget: vi.fn(), loadItemOptions: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), refresh: vi.fn() }) }));

const queries = vi.hoisted(() => ({ loadKpiRequests: vi.fn(), loadTargets: vi.fn() }));
vi.mock("@/lib/kpi/queries", () => queries);
const roster = vi.hoisted(() => ({ loadRosterEntries: vi.fn(), rosterCandidates: vi.fn(), rosterPeople: vi.fn() }));
vi.mock("@/lib/kpi/roster", () => roster);
const team = vi.hoisted(() => ({ listTeamKpiPeople: vi.fn() }));
vi.mock("@/lib/team", () => team);
const pq = vi.hoisted(() => ({ loadTeamProjectKpi: vi.fn(), loadPersonProjectKpi: vi.fn(), targetYears: vi.fn(), kpi: null as unknown }));
vi.mock("@/lib/kpi/projectQueries", () => pq);

// PersonProjectKpiSection is an async server component (jsdom cannot render those): stand in with the real panel.
vi.mock("@/components/kpi/project/PersonProjectKpiSection", async () => {
  const { ProjectKpiPanel } = await import("@/components/kpi/project/ProjectKpiPanel");
  return {
    PersonProjectKpiSection: (p: { quarter: "u" | 1 | 2 | 3 | 4; canManage: boolean; hrefFor: (x: { year?: number; q?: string }) => string; yearSelect?: boolean; headingLevel?: 2 | 3 }) =>
      <ProjectKpiPanel kpi={pq.kpi as PersonProjectKpi} quarter={p.quarter} years={[2026, 2025]} canManage={p.canManage} hrefFor={p.hrefFor} yearSelect={p.yearSelect} headingLevel={p.headingLevel} />,
  };
});

import type { ScopedDb } from "@/lib/db";
import type { PersonProjectKpi } from "@/lib/kpi/projectQueries";
import { keepParams } from "@/app/(app)/dashboard/params";
import { kpiHref } from "@/lib/kpi/href";
import { KpiSection } from "@/components/kpi/KpiSection";
import { ScrollIntoViewOnMount } from "@/components/kpi/ScrollIntoViewOnMount";
import { ProjectKpiPanel } from "@/components/kpi/project/ProjectKpiPanel";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { KpiSectionSkeleton } from "@/components/PageSkeletons";
import { TeamSummary } from "@/components/kpi/sections/TeamSummary";
import { SummaryStrip } from "@/components/kpi/SummaryStrip";
import { MySummary } from "@/components/kpi/sections/MySummary";
import { TeamRequestsSection } from "@/components/kpi/sections/TeamRequestsSection";
import { TeamProjectsSection } from "@/components/kpi/sections/TeamProjectsSection";
import { MyRequestsSection } from "@/components/kpi/sections/MyRequestsSection";
import { MyProjectsSection } from "@/components/kpi/sections/MyProjectsSection";

beforeEach(() => {
  push.mockReset();
  queries.loadKpiRequests.mockReset().mockResolvedValue([]);
  queries.loadTargets.mockReset().mockResolvedValue([]);
  roster.loadRosterEntries.mockReset().mockResolvedValue([]);
  roster.rosterCandidates.mockReset().mockResolvedValue([{ id: "a", name: "Ann" }]);
  roster.rosterPeople.mockReset().mockImplementation(async (_db: unknown, automatic: unknown[]) => automatic);
  team.listTeamKpiPeople.mockReset().mockResolvedValue([]);
  pq.loadTeamProjectKpi.mockReset().mockResolvedValue([]);
  pq.loadPersonProjectKpi.mockReset();
  pq.targetYears.mockReset().mockResolvedValue([2026, 2025]);
});
afterEach(cleanup);

const db = (count = 0) => ({
  projectKpiTarget: { count: vi.fn().mockResolvedValue(count) },
  project: { findMany: vi.fn().mockResolvedValue([]) },
}) as unknown as ScopedDb;

describe("kpiHref", () => {
  it("builds a query from the given params, skipping empty ones, with an optional hash", () => {
    expect(kpiHref("/dashboard", { month: "2026-09", user: undefined, year: "2026", q: "" }, "projects")).toBe("/dashboard?month=2026-09&year=2026#projects");
    expect(kpiHref("/dashboard/team", {})).toBe("/dashboard/team");
    expect(kpiHref("/dashboard", { user: "u 1" })).toBe("/dashboard?user=u+1");
  });
});

describe("keepParams", () => {
  it("takes the first value of the named params that are present", () => {
    expect(keepParams({ month: "2026-09", year: ["2025", "2024"], q: "", user: undefined, other: "x" }, ["month", "year", "q", "user"])).toEqual({ month: "2026-09", year: "2025" });
  });
});

describe("KpiSection", () => {
  it("is a labelled section with the title (h2) and its controls in the header", () => {
    render(<KpiSection id="projects" title="Projects" controls={<button>Ctl</button>}><p>body</p></KpiSection>);
    const section = screen.getByRole("region", { name: "Projects" });
    expect(section.id).toBe("projects");
    expect(within(section).getByRole("heading", { level: 2, name: "Projects" })).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Ctl" })).toBeTruthy();
    expect(within(section).getByText("body")).toBeTruthy();
  });
  it("header wraps on narrow widths", () => {
    render(<KpiSection id="requests" title="Requests">x</KpiSection>);
    expect(screen.getByRole("heading", { name: "Requests" }).parentElement!.className).toContain("flex-wrap");
  });
});

describe("ScrollIntoViewOnMount", () => {
  it("scrolls to the target when there is no hash, and not when there is one", () => {
    const el = document.createElement("div"); el.id = "projects"; el.scrollIntoView = vi.fn(); document.body.append(el);
    window.history.replaceState(null, "", "/dashboard?view=projects");
    render(<ScrollIntoViewOnMount targetId="projects" />);
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    cleanup();
    window.history.replaceState(null, "", "/dashboard?view=projects#projects");
    render(<ScrollIntoViewOnMount targetId="projects" />);
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    el.remove(); window.history.replaceState(null, "", "/");
  });
});

describe("ScrollIntoViewOnMount re-scroll", () => {
  let cb: (() => void) | null = null;
  const disconnect = vi.fn();
  beforeEach(() => {
    cb = null; disconnect.mockReset();
    vi.stubGlobal("ResizeObserver", class { constructor(f: () => void) { cb = f; } observe() {} disconnect() { cb = null; disconnect(); } });
    window.history.replaceState(null, "", "/dashboard?view=projects");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.getElementById("projects")?.remove(); window.history.replaceState(null, "", "/"); });
  const target = () => { const el = document.createElement("div"); el.id = "projects"; el.scrollIntoView = vi.fn(); document.body.append(el); return el; };

  it("scrolls again when the layout above resizes, then stops after a second", () => {
    vi.useFakeTimers();
    const el = target();
    render(<ScrollIntoViewOnMount targetId="projects" />);
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    cb!();
    expect(el.scrollIntoView).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1100);
    expect(disconnect).toHaveBeenCalled();
  });
  it.each(["wheel", "keydown", "pointerdown", "touchstart"])("stops on %s", (type) => {
    const el = target();
    render(<ScrollIntoViewOnMount targetId="projects" />);
    window.dispatchEvent(new Event(type));
    expect(disconnect).toHaveBeenCalled();
    cb?.();
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
  });
  it.each(["mousemove", "pointermove", "pointerover", "mouseover", "scroll"])("keeps going on %s (mere pointer movement is not intent)", (type) => {
    const el = target();
    render(<ScrollIntoViewOnMount targetId="projects" />);
    window.dispatchEvent(new Event(type));
    document.body.dispatchEvent(new Event(type, { bubbles: true }));
    expect(disconnect).not.toHaveBeenCalled();
    cb!();
    expect(el.scrollIntoView).toHaveBeenCalledTimes(2);
  });
  it("scrolls immediately on mount even before any resize", () => {
    const el = target();
    render(<ScrollIntoViewOnMount targetId="projects" />);
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

describe("MonthPicker keep", () => {
  it("carries the other section's params (and user) on every link", () => {
    render(<MonthPicker month="2026-03" current="2026-10" userId="u9" keep={{ year: "2025", q: "3", junk: undefined }} action="/dashboard" />);
    fireEvent.click(screen.getByText("March 2026").closest("summary")!);
    expect(screen.getByRole("link", { name: "May 2026" }).getAttribute("href")).toBe("/dashboard?month=2026-05&year=2025&q=3&user=u9");
    expect(screen.getByRole("link", { name: "This month" }).getAttribute("href")).toBe("/dashboard?month=2026-10&year=2025&q=3&user=u9");
  });
});

describe("MonthPicker keep order", () => {
  it("keep cannot override month or user", () => {
    render(<MonthPicker month="2026-03" current="2026-10" userId="u9" keep={{ month: "1999-01", user: "evil", year: "2025" }} action="/dashboard" />);
    fireEvent.click(screen.getByText("March 2026").closest("summary")!);
    expect(screen.getByRole("link", { name: "May 2026" }).getAttribute("href")).toBe("/dashboard?month=2026-05&year=2025&user=u9");
  });
});

describe("KpiSectionSkeleton", () => {
  it("can carry the section anchor so #projects exists while loading", () => {
    const { container } = render(<KpiSectionSkeleton title="Projects" id="projects" />);
    const anchor = container.querySelector("#projects")!;
    expect(anchor.className).toContain("scroll-mt-4");
    expect(anchor.textContent).toContain("Projects");
  });
  it("has no id by default", () => {
    const { container } = render(<KpiSectionSkeleton title="Requests" />);
    expect(container.querySelector("[id]")).toBeNull();
  });
  it("shows the real title and a loading status", () => {
    render(<KpiSectionSkeleton title="Projects" />);
    expect(screen.getByRole("status").textContent).toContain("Loading Projects…");
    expect(screen.getByRole("heading", { level: 2, name: "Projects" })).toBeTruthy();
  });
});

describe("TeamRequestsSection", () => {
  const person = { id: "a", name: "Ann", jobRole: "DESIGNER" };
  const target = { userId: "a", month: "2026-10", role: "DESIGNER", targetTasks: 10, note: null };
  const run = async (canManage: boolean, over: Record<string, unknown> = {}) =>
    render(await TeamRequestsSection({ db: db(), month: "2026-10", canManage, keep: { year: "2025" }, ...over } as Parameters<typeof TeamRequestsSection>[0]));

  it("renders a Requests section with the month picker (keeping year) and summary + table", async () => {
    team.listTeamKpiPeople.mockResolvedValue([person]);
    queries.loadTargets.mockResolvedValue([target]);
    await run(false);
    const section = screen.getByRole("region", { name: "Requests" });
    expect(section.id).toBe("requests");
    expect(within(section).getByRole("heading", { level: 2, name: "Requests" })).toBeTruthy();
    expect(within(section).queryByText("Average progress")).toBeNull();
    expect(section.querySelector("[data-kpi]")).toBeNull();
    expect(within(section).getByRole("table")).toBeTruthy();
    fireEvent.click(within(section).getByText("October 2026").closest("summary")!);
    expect(within(section).getByRole("link", { name: "May 2026" }).getAttribute("href")).toBe("/dashboard/team?month=2026-05&year=2025");
    expect(within(section).queryByRole("button", { name: "Manage people" })).toBeNull();
  });
  it("shows Manage people (REQUESTS) only for dashboard.team", async () => {
    team.listTeamKpiPeople.mockResolvedValue([person]);
    await run(true);
    expect(screen.getByRole("button", { name: "Manage people" })).toBeTruthy();
    expect(roster.rosterCandidates).toHaveBeenCalled();
  });
  it("keeps the roster empty states", async () => {
    await run(true);
    expect(screen.getByText("No team members to show")).toBeTruthy();
    cleanup();
    team.listTeamKpiPeople.mockResolvedValue([person]);
    roster.rosterPeople.mockResolvedValue([]);
    await run(true);
    expect(screen.getByText("No one is shown.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage people" })).toBeTruthy();
  });
});

describe("TeamProjectsSection", () => {
  const run = async (canManage: boolean, over: Record<string, unknown> = {}) =>
    render(await TeamProjectsSection({ db: db(), year: 2026, canManage, keep: { month: "2026-09" }, ...over } as Parameters<typeof TeamProjectsSection>[0]));

  it("renders Projects with id=projects, a year select keeping month and landing on #projects", async () => {
    await run(false);
    const section = screen.getByRole("region", { name: "Projects" });
    expect(section.id).toBe("projects");
    expect(within(section).getByRole("heading", { level: 2, name: "Projects" })).toBeTruthy();
    expect(within(section).getByText("No project targets for 2026 yet.")).toBeTruthy();
    fireEvent.change(within(section).getByLabelText("Year"), { target: { value: "2025" } });
    expect(push).toHaveBeenCalledWith("/dashboard/team?month=2026-09&year=2025#projects");
    expect(within(section).queryByRole("button", { name: "Manage people" })).toBeNull();
  });
  it("shows Manage people (PROJECTS) for dashboard.team and the roster-hidden empty state", async () => {
    roster.loadRosterEntries.mockResolvedValue([{ userId: "a", included: false }]);
    await run(true, { db: db(2) });
    expect(screen.getByRole("button", { name: "Manage people" })).toBeTruthy();
    expect(screen.getByText("No one is shown for 2026.")).toBeTruthy();
  });
  it("adds the scroll effect only when asked", async () => {
    const spy = vi.fn(); Element.prototype.scrollIntoView = spy;
    window.history.replaceState(null, "", "/dashboard/team?view=projects");
    await run(false, { autoScroll: true });
    expect(spy).toHaveBeenCalled();
    window.history.replaceState(null, "", "/");
  });
});

describe("MyRequestsSection", () => {
  const subject = { id: "u1", name: "Ann", jobRole: "DESIGNER" as const };
  const run = async (over: Record<string, unknown> = {}) =>
    render(await MyRequestsSection({ db: db(), subject, own: true, canTeam: false, month: "2026-10", keep: { year: "2025", q: "2" }, ...over } as Parameters<typeof MyRequestsSection>[0]));

  it("shows the compact empty line (header and picker kept) when nothing happened and there is no target", async () => {
    await run();
    const section = screen.getByRole("region", { name: "Requests" });
    expect(within(section).getByText("No request work in October 2026.")).toBeTruthy();
    expect(within(section).getByText("October 2026", { selector: "summary span" })).toBeTruthy();
    expect(section.querySelector("[data-kpi]")).toBeNull();
  });
  it("the trend heading is an h3 inside the section", async () => {
    queries.loadTargets.mockResolvedValue([{ userId: "u1", month: "2026-10", role: "DESIGNER", targetTasks: 10, note: null }]);
    await run();
    expect(within(screen.getByRole("region", { name: "Requests" })).getByRole("heading", { level: 3, name: "Last 6 months" })).toBeTruthy();
  });
  it("renders the tiles when the person has a target that month, and the picker keeps year, q and user", async () => {
    queries.loadTargets.mockResolvedValue([{ userId: "u1", month: "2026-10", role: "DESIGNER", targetTasks: 10, note: null }]);
    await run({ own: false, subject: { ...subject, id: "u9" } });
    const section = screen.getByRole("region", { name: "Requests" });
    expect(section.querySelector('[data-kpi="target"]')).not.toBeNull();
    expect(section.querySelector('[data-kpi="tasksDone"]')).toBeNull(); // the page summary has it now
    expect(within(section).queryByText(/No request work/)).toBeNull();
    fireEvent.click(within(section).getByText("October 2026", { selector: "summary span" }).closest("summary")!);
    expect(within(section).getByRole("link", { name: "May 2026" }).getAttribute("href")).toBe("/dashboard?month=2026-05&year=2025&q=2&user=u9");
  });
});

describe("MyProjectsSection", () => {
  const subject = { id: "u1", name: "Ann" };
  const emptyQ = () => ({ score: { score: null, parts: { onTime: null, completion: null, speed: null, revisions: null, slips: null }, usedParts: [], items: 0, done: 0, onTimeCount: 0, lateCount: 0 }, items: [] });
  const kpi: PersonProjectKpi = { userId: "u1", year: 2026, quarters: { 1: emptyQ(), 2: emptyQ(), 3: emptyQ(), 4: emptyQ() }, unscheduled: [], excluded: [], otherWork: [], yearScore: null };
  const run = async (over: Record<string, unknown> = {}) =>
    render(await MyProjectsSection({ db: db(0), subject, canTeam: false, year: 2026, quarter: 4, keep: { month: "2026-09" }, ...over } as Parameters<typeof MyProjectsSection>[0]));

  it("empty year: one compact line, header + year picker kept, no Set targets for non-leads", async () => {
    await run();
    const section = screen.getByRole("region", { name: "Projects" });
    expect(section.id).toBe("projects");
    expect(within(section).getByText("No project targets for 2026.")).toBeTruthy();
    expect(within(section).getByLabelText("Year")).toBeTruthy();
    expect(within(section).queryByRole("link", { name: "Set targets" })).toBeNull();
  });
  it("empty year: Set targets link for dashboard.team", async () => {
    await run({ canTeam: true });
    expect(screen.getByRole("link", { name: "Set targets" }).getAttribute("href")).toBe("/dashboard/projects/u1?year=2026");
  });
  it("Not scored is an h3 inside the section, and an h2 in a bare panel (person page)", async () => {
    const item = { projectId: "p", projectTitle: "P", itemTitle: "I", state: "cancelled", dueDate: null, bucket: null, startAt: null, finishAt: null, progress: 0, onTime: null, revisions: 0, slips: 0, targetId: "t" } as unknown as PersonProjectKpi["excluded"][number];
    pq.kpi = { ...kpi, excluded: [item] };
    await run({ db: db(3) });
    expect(within(screen.getByRole("region", { name: "Projects" })).getByRole("heading", { level: 3, name: "Not scored" })).toBeTruthy();
    cleanup();
    render(<ProjectKpiPanel kpi={pq.kpi as PersonProjectKpi} quarter={4} years={[2026]} canManage={false} hrefFor={() => "/x"} />);
    expect(screen.getByRole("heading", { level: 2, name: "Not scored" })).toBeTruthy();
  });
  it("with targets: the panel, a single year select, quarter tabs and year links that keep month and end with #projects", async () => {
    pq.kpi = kpi;
    await run({ db: db(3), keep: { month: "2026-09", user: "u1" } });
    const section = screen.getByRole("region", { name: "Projects" });
    expect(within(section).queryByText(/No project targets/)).toBeNull();
    expect(within(section).getAllByLabelText("Year")).toHaveLength(1);
    const q3 = within(section).getByRole("link", { name: "Q3" });
    expect(q3.getAttribute("href")).toBe("/dashboard?month=2026-09&user=u1&year=2026&q=3#projects");
    fireEvent.change(within(section).getByLabelText("Year"), { target: { value: "2025" } });
    expect(push).toHaveBeenCalledWith("/dashboard?month=2026-09&user=u1&year=2025&q=4#projects");
  });
});

describe("TeamSummary", () => {
  const person = (id: string, name: string) => ({ id, name, jobRole: "DESIGNER" });
  const qs = (done: number, items: number, onTimeCount: number, lateCount: number) =>
    ({ score: { score: 80, parts: {}, usedParts: [], items, done, onTimeCount, lateCount }, items: [] });
  const empty = qs(0, 0, 0, 0);
  const pk = (userId: string) => ({ userId, name: userId, jobRole: "DESIGNER", year: 2026, quarters: { 1: qs(1, 2, 1, 1), 2: empty, 3: empty, 4: empty }, unscheduled: [], excluded: [], otherWork: [], yearScore: 80 });
  const run = async () => render(await TeamSummary({ db: db(), month: "2026-10", year: 2026 }));

  it("summarises both rosters in five cards under period labels", async () => {
    team.listTeamKpiPeople.mockResolvedValue([person("a", "Ann"), person("b", "Bo")]);
    queries.loadTargets.mockResolvedValue([{ userId: "a", month: "2026-10", role: "DESIGNER", targetTasks: 10, note: null }]);
    pq.loadTeamProjectKpi.mockResolvedValue([pk("b"), pk("c")]);
    await run();
    const strip = screen.getByRole("region", { name: "Summary" });
    const cards = [...strip.querySelectorAll("[data-kpi]")];
    expect(cards.map((c) => c.getAttribute("data-kpi"))).toEqual(["people", "reqDone", "reqProgress", "projDone", "projOnTime"]);
    expect(within(strip).getByText("Request tasks done · Oct 2026")).toBeTruthy();
    expect(within(strip).getByText("Project on time · 2026")).toBeTruthy();
    expect(within(strip).getByText("2 requests · 2 projects")).toBeTruthy();
    expect(strip.querySelector('[data-kpi="people"]')!.textContent).toContain("3"); // a, b, c
    expect(strip.querySelector('[data-kpi="projDone"]')!.textContent).toContain("2/4");
    expect(strip.querySelector('[data-kpi="projOnTime"]')!.textContent).toContain("50%");
    expect(strip.querySelector("ul")!.className).toMatch(/grid-cols-2.*md:grid-cols-6/);
  });
  it("counts a request shared by two people once and says so under Request tasks done", async () => {
    const shared = { id: "r1", requesterId: "x", assigneeIds: ["a", "b"], requestedAt: new Date("2026-10-05T00:00:00Z"), deadline: null, originalDeadline: null, status: "DONE", includeKpi: true, outputCount: 1, events: [{ from: "FIRST_LOOK", to: "DONE", at: new Date("2026-10-06T00:00:00Z") }] };
    team.listTeamKpiPeople.mockResolvedValue([person("a", "Ann"), person("b", "Bea")]);
    queries.loadKpiRequests.mockResolvedValue([shared]);
    await run();
    const tile = screen.getByRole("region", { name: "Summary" }).querySelector<HTMLElement>('[data-kpi="reqDone"]')!;
    expect(tile.querySelector(".text-2xl")!.textContent).toBe("1"); // not 2: both assignees share r1
    expect(within(tile).getByText("Each request counted once, even when several people worked on it.")).toBeTruthy();
  });
});

describe("MySummary", () => {
  const subject = { id: "u1", name: "Ann", jobRole: "DESIGNER" as const };
  const qs = (done: number, items: number, onTimeCount: number, lateCount: number) =>
    ({ score: { score: 80, parts: {}, usedParts: [], items, done, onTimeCount, lateCount }, items: [] });
  const empty = qs(0, 0, 0, 0);
  const pk = (quarters: unknown) => ({ userId: "u1", year: 2026, quarters, unscheduled: [], excluded: [], otherWork: [], yearScore: null });
  const run = async () => render(await MySummary({ db: db(), subject, month: "2026-10", year: 2026 }));

  it("has four cards with no People", async () => {
    queries.loadTargets.mockResolvedValue([{ userId: "u1", month: "2026-10", role: "DESIGNER", targetTasks: 10, note: null }]);
    pq.loadPersonProjectKpi.mockResolvedValue(pk({ 1: qs(1, 2, 1, 1), 2: empty, 3: empty, 4: empty }));
    await run();
    const strip = screen.getByRole("region", { name: "Summary" });
    expect([...strip.querySelectorAll("[data-kpi]")].map((c) => c.getAttribute("data-kpi"))).toEqual(["reqDone", "reqProgress", "projDone", "projOnTime"]);
    expect(strip.querySelector('[data-kpi="projDone"]')!.textContent).toContain("1/2");
    expect(strip.querySelector("ul")!.className).toMatch(/grid-cols-2.*md:grid-cols-4/);
  });
  it("shows — when both sections are empty", async () => {
    pq.loadPersonProjectKpi.mockResolvedValue(pk({ 1: empty, 2: empty, 3: empty, 4: empty }));
    await run();
    const strip = screen.getByRole("region", { name: "Summary" });
    for (const k of ["reqDone", "reqProgress", "projDone", "projOnTime"]) expect(strip.querySelector(`[data-kpi="${k}"]`)!.textContent).toContain("—");
  });
});

describe("SummaryStrip layout", () => {
  const c = (key: "people" | "reqDone" | "reqProgress" | "projDone" | "projOnTime") => ({ key, label: key, value: "1" });
  const spans = (cells: ReturnType<typeof c>[]) => {
    const { container } = render(<SummaryStrip cells={cells} />);
    return { ul: container.querySelector("ul")!, items: [...container.querySelectorAll("li")].map((li) => li.className) };
  };
  it("five cards: 6 columns from md, People + request cards span 2, project cards span 3, last card spans the phone row", () => {
    const { ul, items } = spans([c("people"), c("reqDone"), c("reqProgress"), c("projDone"), c("projOnTime")]);
    expect(ul.className).toContain("grid-cols-2");
    expect(ul.className).toContain("md:grid-cols-6");
    for (const i of [0, 1, 2]) expect(items[i]).toContain("md:col-span-2");
    for (const i of [3, 4]) expect(items[i]).toContain("md:col-span-3");
    expect(items[4]).toContain("col-span-2 ");
    expect(items[3]).not.toMatch(/(^| )col-span-2 /);
  });
  it("four cards: 2x2 on phones, one row from md, no spans", () => {
    const { ul, items } = spans([c("reqDone"), c("reqProgress"), c("projDone"), c("projOnTime")]);
    expect(ul.className).toContain("md:grid-cols-4");
    for (const cls of items) expect(cls).not.toContain("col-span");
  });
});
