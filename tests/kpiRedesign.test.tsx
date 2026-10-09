// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";

vi.mock("@/app/(app)/dashboard/targets/actions", () => ({ setTarget: vi.fn() }));

import { PROGRESS_THRESHOLDS, myKpiTiles, progressLevel, teamSummary } from "@/lib/kpi/presentation";
import { ProgressBar } from "@/components/kpi/ProgressBar";
import { TeamProgress, TeamTable, type TeamRow } from "@/components/kpi/TeamTable";
import { TrendChart } from "@/components/kpi/TrendChart";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { KpiSkeleton, TeamKpiSkeleton } from "@/components/PageSkeletons";
import { AccessDenied } from "@/components/AccessDenied";

afterEach(cleanup);

const kpi = { tasksDone: 3, target: 50, progress: 0.06, onTimeRate: 0.5, avgTurnaroundDays: 1.5, revisionRounds: 0, totalOutputs: 1234, activeWorkload: 2 };
const empty = { tasksDone: 0, target: null, progress: null, onTimeRate: null, avgTurnaroundDays: null, revisionRounds: 0, totalOutputs: 0, activeWorkload: 4 };

describe("My KPI tiles", () => {
  it("formats every value like before (percent, days, counts with separators)", () => {
    const tiles = myKpiTiles(kpi, "DESIGNER");
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ["Tasks done", "3"], ["Target", "50"], ["Progress", "6%"], ["On-time rate", "50%"],
      ["Avg turnaround (working days)", "1.5"], ["Revision rounds", "0"], ["Total outputs", "1,234"], ["Active workload", "2"],
    ]);
    expect(tiles.find((t) => t.key === "workload")!.hint).toBe("Open requests assigned to this person.");
    expect(tiles.find((t) => t.key === "onTime")!.hint).toBeUndefined();
  });
  it("null values become an em dash with the existing hints; workload only for designers", () => {
    const tiles = Object.fromEntries(myKpiTiles(empty, "SOCIAL_MEDIA").map((t) => [t.key, t]));
    expect(tiles.target.value).toBe("—");
    expect(tiles.progress.value).toBe("—");
    expect(tiles.onTime).toMatchObject({ value: "—", hint: "No finished tasks with a deadline this month." });
    expect(tiles.turnaround).toMatchObject({ value: "—", hint: "No finished tasks this month." });
    expect(tiles.workload).toMatchObject({ value: "—", hint: "Only tracked for designers." });
  });
});

describe("progress thresholds", () => {
  it.each([[0, "low"], [49, "low"], [50, "mid"], [99, "mid"], [100, "complete"], [140, "complete"]])("%i%% → %s", (pct, level) => {
    expect(progressLevel(pct)).toBe(level);
  });
  it("documents the boundaries", () => {
    expect(PROGRESS_THRESHOLDS).toEqual({ mid: 50, complete: 100 });
  });
  it("the monthly target bar uses the threshold fill and a check + words at 100%", () => {
    const { container, unmount } = render(<ProgressBar done={3} target={50} progress={0.06} label="Tasks" />);
    expect(container.querySelector("[data-level]")!.getAttribute("data-level")).toBe("low");
    expect(screen.getByRole("progressbar").firstElementChild!.className).toContain("bg-progress-low");
    expect(screen.getByText("Below half of target")).toBeTruthy();
    unmount();
    render(<ProgressBar done={50} target={50} progress={1} label="Tasks" />);
    expect(screen.getByRole("progressbar").firstElementChild!.className).toContain("bg-progress-complete");
    expect(screen.getByText("Target reached").querySelector("svg")).not.toBeNull();
  });
  it("compact team bar: colour by level, % always printed, level in words for screen readers", () => {
    const { container } = render(<><TeamProgress name="A" pct={30} /><TeamProgress name="B" pct={75} /><TeamProgress name="C" pct={120} /></>);
    const bars = screen.getAllByRole("progressbar");
    expect(bars.map((b) => b.firstElementChild!.className.match(/bg-progress-\w+/)![0])).toEqual(["bg-progress-low", "bg-progress-mid", "bg-progress-complete"]);
    expect(bars[2].getAttribute("aria-valuenow")).toBe("100");
    expect(bars[2].getAttribute("aria-valuetext")).toBe("120%");
    expect(container.textContent).toContain("30% (below half of target)");
    expect(container.textContent).toContain("120% (target reached)");
    expect(container.querySelectorAll("[data-level=complete] svg").length).toBe(1);
  });
});

describe("Team summary", () => {
  it("counts people, sums tasks and averages the whole percent over people with a target", () => {
    expect(teamSummary([
      { kpi: { tasksDone: 3, progress: 0.06 } },
      { kpi: { tasksDone: 10, progress: 0.5 } },
      { kpi: { tasksDone: 7, progress: null } },
    ])).toEqual({ people: 3, tasksDone: 20, avgProgress: 28, withTarget: 2 });
  });
  it("no targets → null average; no rows → zeros", () => {
    expect(teamSummary([{ kpi: { tasksDone: 2, progress: null } }]).avgProgress).toBeNull();
    expect(teamSummary([])).toEqual({ people: 0, tasksDone: 0, avgProgress: null, withTarget: 0 });
  });
});

describe("Team table", () => {
  const rows: TeamRow[] = [
    { userId: "u1", name: "Fadli", role: "DESIGNER", kpi },
    { userId: "u2", name: "Sari", role: "SOCIAL_MEDIA", kpi: { ...kpi, target: null, progress: null } },
  ];
  it("person cell = decorative avatar + name link + role chip; caption and headers kept", () => {
    render(<TeamTable rows={rows} month="2026-10" canEdit />);
    const table = screen.getByRole("table", { name: "KPI per person for the selected month" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(
      ["Name", "Tasks done", "Target", "Progress", "On-time", "Turnaround (days)", "Workload", "Set target"]);
    const fadli = screen.getByRole("rowheader", { name: /Fadli/ });
    expect(fadli.querySelector('[aria-hidden="true"]')!.textContent).toBe("FA");
    expect(within(fadli).getByText("Designer").getAttribute("data-tone")).toBe("tag-neutral");
    expect(within(screen.getByRole("rowheader", { name: /Sari/ })).getByText("Social media")).toBeTruthy();
  });
  it("repeated row controls keep unique accessible names", () => {
    render(<TeamTable rows={rows} month="2026-10" canEdit />);
    expect(screen.getByRole("button", { name: "Save target for Fadli" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save target for Sari" })).toBeTruthy();
    expect(screen.getByLabelText("Target tasks for Sari")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Fadli progress" })).toBeTruthy();
    expect(screen.queryByRole("progressbar", { name: "Sari progress" })).toBeNull();
  });
});

describe("Trend chart card", () => {
  it("has a section heading, a text legend, and keeps the View as table alternative", () => {
    render(<TrendChart points={[{ month: "2026-09", label: "September 2026", tasksDone: 4, target: 50 }, { month: "2026-10", label: "October 2026", tasksDone: 7, target: null }]} />);
    expect(screen.getByRole("heading", { level: 2, name: "Last 2 months" })).toBeTruthy();
    expect(screen.getByText("Tasks done vs target, last 2 months").tagName).toBe("FIGCAPTION");
    expect(screen.getByText("View as table").closest("summary")).not.toBeNull();
    expect(screen.getByRole("table", { name: "Tasks done versus target by month", hidden: true })).toBeTruthy();
  });
});

describe("month picker, skeletons, access denied", () => {
  it("month picker: design-system popover of month links that keep user=", () => {
    render(<MonthPicker month="2026-03" current="2026-10" userId="u9" action="/dashboard" />);
    const trigger = screen.getByText("March 2026").closest("summary")!;
    expect(trigger.getAttribute("aria-label")).toBe("Month: March 2026");
    expect(document.querySelector('input[type="month"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Show" })).toBeNull();
    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: "Choose a month" });
    expect(within(panel).getByText("2026")).toBeTruthy();
    const mar = within(panel).getByRole("link", { name: "March 2026" });
    expect(mar.getAttribute("href")).toBe("/dashboard?month=2026-03&user=u9");
    expect(mar.getAttribute("aria-current")).toBe("true");
    expect(within(panel).getByRole("link", { name: "October 2026" }).hasAttribute("data-this-month")).toBe(true);
    // Months after the current one have no data yet: shown, not linked.
    expect(within(panel).queryByRole("link", { name: "November 2026" })).toBeNull();
    expect(within(panel).getByText("Nov").getAttribute("aria-disabled")).toBe("true");
    expect(within(panel).getByRole("button", { name: "Next year" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(panel).getByRole("button", { name: "Previous year" }));
    expect(within(panel).getByRole("link", { name: "December 2025" }).getAttribute("href")).toBe("/dashboard?month=2025-12&user=u9");
    expect(within(panel).getByRole("link", { name: "This month" }).getAttribute("href")).toBe("/dashboard?month=2026-10&user=u9");
  });
  it("month picker without a user links to the month alone", () => {
    render(<MonthPicker month="2026-10" current="2026-10" action="/dashboard/team" />);
    fireEvent.click(screen.getByText("October 2026").closest("summary")!);
    expect(screen.getByRole("link", { name: "January 2026" }).getAttribute("href")).toBe("/dashboard/team?month=2026-01");
  });
  it("KPI fallbacks are skeletons with a loading status", () => {
    const { container, unmount } = render(<KpiSkeleton />);
    expect(screen.getByRole("status").textContent).toContain("Loading KPI…");
    expect(container.querySelectorAll("[data-skeleton-tile]").length).toBe(8);
    unmount();
    render(<TeamKpiSkeleton />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("Loading team KPI…");
  });
  it("403 panel: alert, h1, lock icon, link back", () => {
    const { container } = render(<AccessDenied description="The team KPI page is only available to leads and admins." backHref="/dashboard" backLabel="Back to My KPI" />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { level: 1 }).textContent).toBe("403 · Access denied");
    expect(alert.textContent).toContain("only available to leads and admins");
    expect(screen.getByRole("link", { name: "Back to My KPI" }).getAttribute("href")).toBe("/dashboard");
    expect(container.querySelector("svg.lucide-lock, svg[class*=lock]")).not.toBeNull();
  });
});
