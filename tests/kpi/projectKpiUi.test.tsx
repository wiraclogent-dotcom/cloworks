// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";

const addProjectTargets = vi.fn();
const removeProjectTarget = vi.fn();
const loadItemOptions = vi.fn();
vi.mock("@/app/(app)/dashboard/projects/actions", () => ({
  addProjectTargets: (...a: unknown[]) => addProjectTargets(...a),
  removeProjectTarget: (...a: unknown[]) => removeProjectTarget(...a),
  loadItemOptions: (...a: unknown[]) => loadItemOptions(...a),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), refresh: vi.fn() }) }));

import { ProjectKpiPanel } from "@/components/kpi/project/ProjectKpiPanel";
import { ProjectScoreHeader, MEASURE_HELP } from "@/components/kpi/project/ProjectScoreHeader";
import { MeasureInfo } from "@/components/kpi/project/MeasureInfo";
import { TargetRow, targetBadge } from "@/components/kpi/project/TargetList";
import { ManageTargetsModal } from "@/components/kpi/project/ManageTargetsModal";
import { parseProjectKpiParams } from "@/lib/kpi/projectParams";
import { parseViewParam, defaultKpiView } from "@/app/(app)/dashboard/params";
import { KpiViewToggle } from "@/components/kpi/project/KpiViewToggle";
import { ProjectTeamTable, projectTeamRows, type ProjectTeamRow } from "@/components/kpi/project/ProjectTeamTable";
import type { ItemFacts } from "@/lib/kpi/projectItems";
import type { PersonProjectKpi, TargetItem } from "@/lib/kpi/projectQueries";
import type { QuarterScore } from "@/lib/kpi/projectScore";

// jsdom has no showModal on <dialog>.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  addProjectTargets.mockReset(); removeProjectTarget.mockReset(); loadItemOptions.mockReset(); push.mockReset();
});
afterEach(cleanup);

const NOW = new Date();
const score = (over: Partial<QuarterScore> = {}): QuarterScore => ({
  score: 80, parts: { onTime: 90, completion: 70, speed: 80, revisions: 100, slips: 60 },
  usedParts: ["onTime", "completion", "speed", "revisions", "slips"], items: 2, done: 1, onTimeCount: 1, lateCount: 0, ...over,
});
const facts = (over: Partial<ItemFacts> = {}): ItemFacts => ({
  projectId: "p1", projectTitle: "Rebrand", itemTitle: "Logo", state: "open", dueDate: new Date(NOW.getTime() + 5 * 86_400_000),
  bucket: { year: 2026, quarter: 4 }, startAt: null, finishAt: null, progress: 0.4, onTime: null, revisions: 2, slips: 1, ...over,
});
const target = (over: Partial<TargetItem> = {}): TargetItem => ({ ...facts(), targetId: "t1", ...over });
const emptyQ = () => ({ score: score({ score: null, parts: { onTime: null, completion: null, speed: null, revisions: null, slips: null }, usedParts: [], items: 0, done: 0, onTimeCount: 0, lateCount: 0 }), items: [] as TargetItem[] });
const kpiOf = (over: Partial<PersonProjectKpi> = {}): PersonProjectKpi => ({
  userId: "u1", year: 2026,
  quarters: { 1: emptyQ(), 2: emptyQ(), 3: emptyQ(), 4: { score: score(), items: [target()] } },
  unscheduled: [], excluded: [], otherWork: [], yearScore: 80, ...over,
});
const hrefFor = ({ year, q }: { year?: number; q?: string }) => `/dashboard/projects/u1?year=${year ?? 2026}&q=${q ?? "4"}`;
const panel = (kpi: PersonProjectKpi, extra: Partial<Parameters<typeof ProjectKpiPanel>[0]> = {}) =>
  render(<ProjectKpiPanel kpi={kpi} quarter={4} years={[2026, 2025]} canManage={false} hrefFor={hrefFor} {...extra} />);

describe("ProjectScoreHeader", () => {
  it("shows 'Based on 3 of 5 measures' when two parts have no data", () => {
    const s = score({ parts: { onTime: 90, completion: 70, speed: null, revisions: null, slips: 60 }, usedParts: ["onTime", "completion", "slips"] });
    render(<ProjectScoreHeader label="Q4 score" score={s.score} parts={s.parts} usedParts={s.usedParts} />);
    expect(screen.getByText("Based on 3 of 5 measures")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBe(2);
  });
  it("hides the caption when all five measures are used", () => {
    const s = score();
    render(<ProjectScoreHeader label="Q4 score" score={s.score} parts={s.parts} usedParts={s.usedParts} />);
    expect(screen.queryByText(/Based on/)).toBeNull();
    for (const l of ["On time", "Completion", "Speed", "Revisions", "Slips"]) expect(screen.getByText(l)).toBeTruthy();
  });
  it("shows a dash and no caption when the score is null", () => {
    const e = emptyQ().score;
    render(<ProjectScoreHeader label="Q4 score" score={e.score} parts={e.parts} usedParts={e.usedParts} />);
    expect(screen.queryByText(/Based on/)).toBeNull();
    expect(screen.getAllByText("—").length).toBe(6);
  });
});

describe("measure info", () => {
  const LABELS = { onTime: "On time", completion: "Completion", speed: "Speed", revisions: "Revisions", slips: "Slips" } as const;
  it("gives each of the five tiles an info button", () => {
    const s = score();
    render(<ProjectScoreHeader label="Q4 score" score={s.score} parts={s.parts} usedParts={s.usedParts} />);
    for (const l of Object.values(LABELS)) {
      const b = screen.getByRole("button", { name: `What is ${l}?` });
      expect(b.getAttribute("type")).toBe("button");
    }
    expect(screen.getAllByRole("button").length).toBe(5);
  });
  it("has the exact help copy", () => {
    expect(MEASURE_HELP).toEqual({
      onTime: "Share of items finished on or before their current due date. An item past its due date and not yet finished counts as late straight away.",
      completion: "How far the items have moved through the stages, on average. Final artwork = 100%, Approval = 80%, First preview = 20%.",
      speed: "Days from start to Final artwork, compared with the team's usual time. As fast as the team or faster = 100. Needs at least 3 finished items across the team this quarter.",
      revisions: "Starts at 100 and drops 25 points each time an item moves back a stage, averaged across the items.",
      slips: "Starts at 100 and drops 25 points each time a due date is pushed later, averaged across the items. Pushes made together within a minute count once.",
    });
  });
  it("opens on click with the weighted title, the help and the muted footer, and closes on Escape", async () => {
    const s = score();
    render(<ProjectScoreHeader label="Q4 score" score={s.score} parts={s.parts} usedParts={s.usedParts} />);
    expect(screen.queryByText("On time · 50%")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "What is On time?" }));
    expect(await screen.findByText("On time · 50%")).toBeTruthy();
    expect(screen.getByText(MEASURE_HELP.onTime)).toBeTruthy();
    expect(screen.getByText("— means there's no data yet. This measure's weight is shared among the others.")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("On time · 50%")).toBeNull());
  });
  it("a mouse click after hover keeps the popover open (pinned); a second click closes it", async () => {
    render(<MeasureInfo label="Speed" weight={0.1} help={MEASURE_HELP.speed} />);
    const btn = screen.getByRole("button", { name: "What is Speed?" });
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    expect(await screen.findByText("Speed · 10%")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByText("Speed · 10%")).toBeTruthy();
    fireEvent.pointerLeave(btn, { pointerType: "mouse" });
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByText("Speed · 10%")).toBeTruthy(); // pinned: leaving does not close
    fireEvent.click(btn);
    await waitFor(() => expect(screen.queryByText("Speed · 10%")).toBeNull());
  });
  it("hover-close waits 150 ms and is cancelled by entering the popover", async () => {
    render(<MeasureInfo label="Speed" weight={0.1} help={MEASURE_HELP.speed} />);
    const btn = screen.getByRole("button", { name: "What is Speed?" });
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    const title = await screen.findByText("Speed · 10%");
    const content = title.closest("[data-slot='popover-content']") as HTMLElement;
    vi.useFakeTimers();
    try {
      fireEvent.pointerLeave(btn, { pointerType: "mouse" });
      act(() => { vi.advanceTimersByTime(100); });
      fireEvent.pointerEnter(content, { pointerType: "mouse" });
      act(() => { vi.advanceTimersByTime(500); });
      expect(screen.queryByText("Speed · 10%")).toBeTruthy();
      fireEvent.pointerLeave(content, { pointerType: "mouse" });
      act(() => { vi.advanceTimersByTime(200); });
    } finally { vi.useRealTimers(); }
    await waitFor(() => expect(screen.queryByText("Speed · 10%")).toBeNull());
  });
  it("extends the info button's hit area to 24px (14px icon + 5px each side)", () => {
    render(<MeasureInfo label="Speed" weight={0.1} help={MEASURE_HELP.speed} />);
    const btn = screen.getByRole("button", { name: "What is Speed?" });
    expect(btn.className).toContain("relative");
    expect(btn.className).toContain("after:absolute");
    expect(btn.className).toContain("after:-inset-[5px]");
    expect(btn.querySelector("svg")?.getAttribute("class")).toContain("size-3.5");
  });
  it("titles every measure with its weight", async () => {
    render(<MeasureInfo label="Speed" weight={0.1} help={MEASURE_HELP.speed} />);
    fireEvent.click(screen.getByRole("button", { name: "What is Speed?" }));
    expect(await screen.findByText("Speed · 10%")).toBeTruthy();
    expect(screen.getByText(MEASURE_HELP.speed)).toBeTruthy();
  });
});

describe("target badge", () => {
  it.each([
    [{ state: "cancelled" as const }, "Cancelled"],
    [{ state: "removed" as const }, "Item removed"],
    [{ state: "finishedUntracked" as const }, "Finished before tracking"],
    [{ state: "done" as const, onTime: true }, "On time"],
    [{ state: "done" as const, onTime: false }, "Late"],
    [{ state: "open" as const, onTime: false }, "Late"],
    [{ state: "open" as const, onTime: null }, "In progress"],
  ])("%j -> %s", (over, text) => {
    expect(targetBadge(facts(over)).text).toBe(text);
    render(<ul><TargetRow item={target(over)} canManage={false} /></ul>);
    expect(screen.getByText(text)).toBeTruthy();
  });
  it("tones: success, danger, neutral, muted", () => {
    expect(targetBadge(facts({ state: "done", onTime: true })).tone).toBe("done");
    expect(targetBadge(facts({ state: "done", onTime: false })).tone).toBe("overdue");
    expect(targetBadge(facts()).tone).toBe("tag-neutral");
    expect(targetBadge(facts({ state: "finishedUntracked" })).tone).toBe("tag-neutral");
    expect(targetBadge(facts({ state: "cancelled" })).muted).toBe(true);
    expect(targetBadge(facts({ state: "removed" })).muted).toBe(true);
  });
});

describe("TargetRow", () => {
  it("links Project > Item to the project, with progress, slips and revisions", () => {
    render(<ul><TargetRow item={target()} canManage={false} /></ul>);
    const link = screen.getByRole("link", { name: /Rebrand/ });
    expect(link.getAttribute("href")).toBe("/projects/p1");
    expect(link.textContent).toContain("Logo");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("1 slip · 2 revisions")).toBeTruthy();
    expect(document.querySelector("[data-deadline]")).toBeTruthy();
  });
  it("pluralizes the counts: 2 slips · 1 revision, 0 slips · 0 revisions", () => {
    const { rerender } = render(<ul><TargetRow item={target({ slips: 2, revisions: 1 })} canManage={false} /></ul>);
    expect(screen.getByText("2 slips · 1 revision")).toBeTruthy();
    rerender(<ul><TargetRow item={target({ slips: 0, revisions: 0 })} canManage={false} /></ul>);
    expect(screen.getByText("0 slips · 0 revisions")).toBeTruthy();
  });
  it("has no remove button without canManage, and removes with it", async () => {
    const { rerender } = render(<ul><TargetRow item={target()} canManage={false} /></ul>);
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    removeProjectTarget.mockResolvedValue({ ok: true });
    rerender(<ul><TargetRow item={target()} canManage /></ul>);
    fireEvent.click(screen.getByRole("button", { name: "Remove target Rebrand › Logo" }));
    await waitFor(() => expect(removeProjectTarget).toHaveBeenCalledWith("t1"));
  });
  it("shows the failure message when removing fails", async () => {
    removeProjectTarget.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Only leads and admins can set project targets." });
    render(<ul><TargetRow item={target()} canManage /></ul>);
    fireEvent.click(screen.getByRole("button", { name: /Remove target/ }));
    expect(await screen.findByText(/Only leads and admins/)).toBeTruthy();
  });
});

describe("ProjectKpiPanel", () => {
  it("renders tabs as links, the year select and the rows of the quarter", () => {
    panel(kpiOf());
    const nav = screen.getByRole("navigation", { name: /quarter/i });
    const labels = within(nav).getAllByRole("link").map((a) => a.textContent);
    expect(labels).toEqual(["Q1", "Q2", "Q3", "Q4", "Unscheduled"]);
    expect(within(nav).getByRole("link", { name: "Q2" }).getAttribute("href")).toBe("/dashboard/projects/u1?year=2026&q=2");
    expect(within(nav).getByRole("link", { name: "Unscheduled" }).getAttribute("href")).toBe("/dashboard/projects/u1?year=2026&q=u");
    expect(within(nav).getByRole("link", { name: "Q4" }).getAttribute("aria-current")).toBe("page");
    const select = screen.getByLabelText("Year") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["2026", "2025"]);
    expect(select.value).toBe("2026");
    expect(screen.getByText("In progress")).toBeTruthy();
  });
  it("year select navigates with the href built by hrefFor", () => {
    panel(kpiOf());
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2025" } });
    expect(push).toHaveBeenCalledWith("/dashboard/projects/u1?year=2025&q=4");
  });
  it("hides remove buttons when canManage is false", () => {
    panel(kpiOf());
    expect(screen.queryByRole("button", { name: /Remove target/ })).toBeNull();
  });
  it("empty quarter: message, and a Manage targets button only for managers", () => {
    const { unmount } = panel(kpiOf(), { quarter: 1 });
    expect(screen.getByText("No targets due this quarter.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Manage targets" })).toBeNull();
    unmount();
    panel(kpiOf(), { quarter: 1, canManage: true, manage: <button type="button">Manage targets</button> });
    expect(screen.getByText("No targets due this quarter.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Manage targets" })).toHaveLength(1);
  });
  it("the unscheduled tab lists unscheduled targets and shows the year score", () => {
    panel(kpiOf({ unscheduled: [target({ targetId: "t9", itemTitle: "Moodboard", dueDate: null, bucket: "unscheduled" })] }), { quarter: "u" });
    expect(screen.getByText(/Moodboard/)).toBeTruthy();
    expect(screen.getByText("Year score")).toBeTruthy();
  });
  it("lists excluded items in a muted Not scored group", () => {
    panel(kpiOf({ excluded: [target({ targetId: "t2", itemTitle: "Old banner", state: "cancelled" })] }));
    const group = screen.getByRole("region", { name: "Not scored" });
    expect(within(group).getByText("Cancelled")).toBeTruthy();
    expect(within(group).getByText(/Old banner/)).toBeTruthy();
  });
  it("other work is a collapsed details element", () => {
    panel(kpiOf({ otherWork: [facts({ itemTitle: "Side job", projectTitle: "Misc" }), facts({ itemTitle: "Other job" })] }));
    const d = screen.getByText("Other work (2)").closest("details") as HTMLDetailsElement;
    expect(d.open).toBe(false);
    expect(within(d).getByText(/Side job/)).toBeTruthy();
  });
  it("omits other work when there is none", () => {
    panel(kpiOf());
    expect(screen.queryByText(/Other work/)).toBeNull();
  });
});

describe("parseProjectKpiParams", () => {
  const now = new Date("2026-10-13T03:00:00Z"); // Q4 2026 in Jakarta
  it("defaults to the current Jakarta year and quarter", () => {
    expect(parseProjectKpiParams({}, now)).toEqual({ year: 2026, quarter: 4 });
  });
  it("accepts q 1..4 and u, rejects the rest", () => {
    expect(parseProjectKpiParams({ q: "2" }, now)).toEqual({ year: 2026, quarter: 2 });
    expect(parseProjectKpiParams({ q: "u" }, now)).toEqual({ year: 2026, quarter: "u" });
    expect(parseProjectKpiParams({ q: "9" }, now).quarter).toBe(4);
    expect(parseProjectKpiParams({ q: ["3", "1"] }, now).quarter).toBe(3);
  });
  it("another year without a valid q falls back to Q1", () => {
    expect(parseProjectKpiParams({ year: "2025" }, now)).toEqual({ year: 2025, quarter: 1 });
    expect(parseProjectKpiParams({ year: "2025", q: "x" }, now)).toEqual({ year: 2025, quarter: 1 });
    expect(parseProjectKpiParams({ year: "2025", q: "3" }, now)).toEqual({ year: 2025, quarter: 3 });
  });
  it("an invalid year is the current year", () => {
    for (const y of ["abc", "1999", "2101", "2025.5", "", "20x6"]) expect(parseProjectKpiParams({ year: y }, now).year).toBe(2026);
  });
});

describe("ManageTargetsModal", () => {
  const open = () => {
    render(<ManageTargetsModal userId="u1" name="Dina" year={2026} projects={[{ id: "p1", title: "Rebrand" }, { id: "p2", title: "Site" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage targets" }));
  };
  it("loads item options when a project is picked and shows who else has each item", async () => {
    loadItemOptions.mockResolvedValue({ ok: true, options: [
      { itemTitle: "Logo", assignedTo: [{ userId: "u2", name: "Eko" }, { userId: "u3", name: "Fina" }] },
      { itemTitle: "Poster", assignedTo: [] },
      { itemTitle: "Mine", assignedTo: [{ userId: "u1", name: "Dina" }] },
    ] });
    open();
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
    await screen.findByLabelText(/Logo/);
    expect(loadItemOptions).toHaveBeenCalledWith("p1", 2026);
    expect(screen.getByText("· also Eko, Fina")).toBeTruthy();
    expect(screen.queryByText(/also Dina/)).toBeNull();
  });
  it("saves the chosen items and closes", async () => {
    loadItemOptions.mockResolvedValue({ ok: true, options: [{ itemTitle: "Logo", assignedTo: [] }, { itemTitle: "Poster", assignedTo: [] }] });
    addProjectTargets.mockResolvedValue({ ok: true });
    open();
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
    fireEvent.click(await screen.findByLabelText(/Poster/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(addProjectTargets).toHaveBeenCalledWith({ userId: "u1", year: 2026, projectId: "p1", itemTitles: ["Poster"] }));
    await waitFor(() => expect(screen.queryByRole("dialog", { hidden: true })).toBeNull());
  });
  it("shows an Alert when saving fails and keeps the dialog open", async () => {
    loadItemOptions.mockResolvedValue({ ok: true, options: [{ itemTitle: "Logo", assignedTo: [] }] });
    addProjectTargets.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Only leads and admins can set project targets." });
    open();
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
    fireEvent.click(await screen.findByLabelText(/Logo/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Only leads and admins");
    expect(screen.getByLabelText("Project")).toBeTruthy();
  });
  it("shows an Alert when loading the items fails", async () => {
    loadItemOptions.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Only leads and admins can set project targets." });
    open();
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p2" } });
    expect((await screen.findByRole("alert")).textContent).toContain("Only leads and admins");
  });
  it("Save is disabled until something is checked", async () => {
    loadItemOptions.mockResolvedValue({ ok: true, options: [{ itemTitle: "Logo", assignedTo: [] }] });
    open();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("parseViewParam", () => {
  it("accepts projects and requests, rejects the rest", () => {
    expect(parseViewParam("projects")).toBe("projects");
    expect(parseViewParam("requests")).toBe("requests");
    expect(parseViewParam("x")).toBeUndefined();
    expect(parseViewParam(undefined)).toBeUndefined();
    expect(parseViewParam(["projects", "x"])).toBe("projects");
  });
});

describe("defaultKpiView", () => {
  const base = { view: undefined, month: undefined, own: true, countedZero: true, hasTargets: true } as const;
  it("an explicit view wins", () => {
    expect(defaultKpiView({ ...base, view: "requests" })).toBe("requests");
    expect(defaultKpiView({ ...base, view: "projects", countedZero: false, hasTargets: false })).toBe("projects");
  });
  it("a chosen month means requests", () => {
    expect(defaultKpiView({ ...base, month: "2026-09" })).toBe("requests");
  });
  it("projects only when own, nothing counted, has targets, and neither view nor month is set", () => {
    expect(defaultKpiView(base)).toBe("projects");
    expect(defaultKpiView({ ...base, own: false })).toBe("requests");
    expect(defaultKpiView({ ...base, countedZero: false })).toBe("requests");
    expect(defaultKpiView({ ...base, hasTargets: false })).toBe("requests");
  });
});

describe("KpiViewToggle", () => {
  it("links Requests (no view) and Projects (view=projects), keeping the other params", () => {
    render(<KpiViewToggle view="projects" base="/dashboard" params={{ month: "2026-10", year: "2026", q: "3", view: "projects", junk: undefined }} />);
    const nav = screen.getByRole("navigation", { name: "View" });
    const req = within(nav).getByRole("link", { name: "Requests" });
    const proj = within(nav).getByRole("link", { name: "Projects" });
    expect(req.getAttribute("href")).toBe("/dashboard?month=2026-10&year=2026&q=3");
    expect(proj.getAttribute("href")).toBe("/dashboard?month=2026-10&year=2026&q=3&view=projects");
    expect(proj.getAttribute("aria-current")).toBe("page");
    expect(req.getAttribute("aria-current")).toBeNull();
  });
  it("can make the Requests link explicit for pages whose default is Projects", () => {
    render(<KpiViewToggle view="projects" base="/dashboard" params={{ month: "2026-10" }} explicitRequests />);
    expect(screen.getByRole("link", { name: "Requests" }).getAttribute("href")).toBe("/dashboard?month=2026-10&view=requests");
  });
  it("links to the bare path when there is nothing to keep", () => {
    render(<KpiViewToggle view="requests" base="/dashboard/team" params={{}} />);
    expect(screen.getByRole("link", { name: "Requests" }).getAttribute("href")).toBe("/dashboard/team");
    expect(screen.getByRole("link", { name: "Projects" }).getAttribute("href")).toBe("/dashboard/team?view=projects");
  });
});

describe("ProjectTeamTable", () => {
  const row = (userId: string, name: string, year: number | null, over: Partial<ProjectTeamRow> = {}): ProjectTeamRow =>
    ({ userId, name, quarters: [null, null, null, year], year, done: 1, items: 2, onTimePct: year === null ? null : 50, hasTargets: true, ...over });
  it("sorts by year score descending with null last", () => {
    render(<ProjectTeamTable rows={[row("a", "Ann", null), row("b", "Bo", 60), row("c", "Cy", 90)]} year={2026} />);
    const names = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("rowheader")[0]?.textContent ?? r.querySelector("a")?.textContent);
    expect(names).toEqual(["Cy", "Bo", "Ann"]);
    const cy = screen.getByRole("link", { name: "Cy" });
    expect(cy.getAttribute("href")).toBe("/dashboard/projects/c?year=2026");
  });
  it("shows scores, dashes, done and on time", () => {
    render(<ProjectTeamTable rows={[row("a", "Ann", null), row("c", "Cy", 90, { done: 3, items: 4, onTimePct: 75 })]} year={2026} />);
    for (const h of ["Person", "Q1", "Q2", "Q3", "Q4", "Year", "Done", "On time"]) expect(screen.getByRole("columnheader", { name: h })).toBeTruthy();
    const cy = screen.getByRole("link", { name: "Cy" }).closest("tr")!;
    expect(cy.textContent).toContain("3/4");
    expect(cy.textContent).toContain("75%");
    expect(within(screen.getByRole("link", { name: "Ann" }).closest("tr")!).getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });
  it("does not link names when canOpen is false", () => {
    render(<ProjectTeamTable rows={[row("c", "Cy", 90)]} year={2026} canOpen={false} />);
    expect(screen.queryByRole("link", { name: "Cy" })).toBeNull();
    expect(screen.getByText("Cy")).toBeTruthy();
  });
  it("shows the empty state with no rows", () => {
    render(<ProjectTeamTable rows={[]} year={2026} />);
    expect(screen.getByText("No project targets for 2026 yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("projectTeamRows", () => {
  it("sums the quarters and flags people without targets", () => {
    const withTargets = { ...kpiOf({ userId: "u1" }), name: "Ann" };
    const none = { ...kpiOf({ userId: "u2", yearScore: null, quarters: { 1: emptyQ(), 2: emptyQ(), 3: emptyQ(), 4: emptyQ() } }), name: "Bo" };
    const rows = projectTeamRows([withTargets, none]);
    expect(rows.map((r) => [r.userId, r.hasTargets])).toEqual([["u1", true], ["u2", false]]);
    expect(rows[0]).toMatchObject({ name: "Ann", year: 80, quarters: [null, null, null, 80], done: 1, items: 2, onTimePct: 100 });
  });
});

void (null as unknown as ReactNode);
