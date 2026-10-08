// @vitest-environment jsdom
/**
 * Regression (QA fix round 1, D1): `.sr-only` (and any `absolute` element) is positioned against its nearest POSITIONED
 * ancestor. If that ancestor is outside a scroll container, the scroller does not clip it, so 500 board cards each
 * left an invisible 1px span far below the column and the whole document grew to ~4200px. Invariant: between every
 * absolutely positioned element and its nearest scroll container there is a positioned element (the scroller itself or
 * something inside it). jsdom has no layout, so this checks the Tailwind classes that establish the containing block.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("@/app/(app)/requests/actions", () => ({ moveRequest: vi.fn() }));
vi.mock("@/app/(app)/dashboard/targets/actions", () => ({ setTarget: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/requests" }));

import { Board, type BoardColumnView } from "@/components/Board";
import { BOARD_STATUSES } from "@/components/status";
import { RequestTable } from "@/components/RequestTable";
import { TeamTable } from "@/components/kpi/TeamTable";
import { TrendChart } from "@/components/kpi/TrendChart";
import { ProjectTable } from "@/components/ProjectTable";
import { ProjectTimeline } from "@/components/ProjectTimeline";
import { AppFrame } from "@/components/shell/AppFrame";
import { NavItem } from "@/components/shell/NavItem";
import type { RequestRow } from "@/lib/requests";

afterEach(cleanup);

const SCROLLER = /^overflow(-[xy])?-(auto|scroll|hidden)$/;
const POSITIONED = /^(relative|absolute|fixed|sticky)$/;
const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
const isAbsolute = (el: Element) => tokens(el).some((t) => t === "sr-only" || t === "absolute");

/** Absolutely positioned elements that would escape their scroll container's clipping. */
function escapees(root: Element): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll("*")) {
    if (!isAbsolute(el)) continue;
    let positioned = false;
    for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
      if (tokens(a).some((t) => POSITIONED.test(t))) positioned = true;
      if (tokens(a).some((t) => SCROLLER.test(t))) {
        if (!positioned) out.push(`${el.tagName.toLowerCase()}.${tokens(el).join(".")} "${el.textContent}"`);
        break;
      }
    }
  }
  return out;
}

const row = (i: number, status: RequestRow["status"]): RequestRow => ({
  id: `r${i}`, title: `Task ${i}`, status, brandName: "Clogent", divisionName: "Marketing", requesterName: "Rina Sari",
  assigneeName: i % 2 ? "Cami" : null, requestedAt: new Date("2026-10-01T00:00:00Z"), deadline: null, outputCount: 1, daysLeft: 3, needsMotion: true,
});

describe("absolutely positioned content stays inside its scroll container", () => {
  it("board: column scroller and cards are positioned; no sr-only escapes", () => {
    const rows = BOARD_STATUSES.flatMap((s, k) => Array.from({ length: 30 }, (_, i) => row(k * 100 + i, s)));
    const columns: BoardColumnView[] = BOARD_STATUSES.map((status) => ({
      status, total: 30, rows: rows.filter((r) => r.status === status), moreHref: null, tableHref: "/requests?view=table",
    }));
    const { container } = render(<Board columns={columns} canMove />);
    for (const body of container.querySelectorAll("[data-column-body]")) expect(tokens(body)).toContain("relative");
    for (const li of container.querySelectorAll("[data-card]")) expect(tokens(li)).toContain("relative");
    expect(container.querySelectorAll(".sr-only").length).toBeGreaterThan(100);
    expect(escapees(container)).toEqual([]);
  });

  it("request table, team table, project table + timeline, chart table, sidebar nav", () => {
    const { container } = render(<>
      <RequestTable rows={[row(1, "REQUESTED"), row(2, "DONE")]} sort="deadline" dir="asc" hrefFor={() => "/requests"} />
      <TeamTable month="2026-10" canEdit rows={[{ userId: "u", name: "Fadli", role: "DESIGNER", kpi: { tasksDone: 3, target: 5, progress: 0.6, onTimeRate: 1, avgTurnaroundDays: 1, revisionRounds: 0, totalOutputs: 3, activeWorkload: 1 } }]} />
      <ProjectTable canManage now={new Date("2026-10-08T00:00:00+07:00")} rows={[{ id: "p", title: "P", subTitle: null, brandName: "Zed", ownerName: "Rina", status: "IN_PROGRESS", startDate: new Date("2026-10-01T00:00:00+07:00"), dueDate: new Date("2026-10-20T00:00:00+07:00"), fileUrl: "https://x.test" }]} />
      <ProjectTimeline today={new Date("2026-10-08T00:00:00+07:00")} projects={[{ id: "p", title: "P", status: "IN_PROGRESS", startDate: new Date("2026-10-01T00:00:00+07:00"), dueDate: new Date("2026-10-20T00:00:00+07:00") }]} />
      <TrendChart points={[{ month: "2026-10", label: "October 2026", tasksDone: 1, target: 2 }]} />
      <AppFrame nav={<nav aria-label="Main"><ul><NavItem href="/requests" label="Requests" icon={<svg />} /></ul></nav>} footer={null}><p>x</p></AppFrame>
    </>);
    expect(container.querySelectorAll(".sr-only").length).toBeGreaterThan(5);
    expect(escapees(container)).toEqual([]);
  });

  it("the checker itself catches an unpositioned scroller", () => {
    const { container } = render(<div className="overflow-y-auto"><ul><li><span className="sr-only">x</span></li></ul></div>);
    expect(escapees(container)).toHaveLength(1);
  });
});
