import { describe, it, expect } from "vitest";
import { computeContentKpi, type KpiPost } from "@/lib/kpi/contentMetrics";

const d = (s: string) => new Date(s);
let n = 0;
const post = (over: Partial<KpiPost>): KpiPost => ({
  id: `p${++n}`, authorId: "s1", approvedAt: d("2026-10-10T03:00:00Z"), plannedAt: d("2026-10-12T00:00:00Z"), ...over,
});

describe("computeContentKpi", () => {
  it("counts the author's posts approved in the Jakarta month", () => {
    const late = post({ approvedAt: d("2026-10-31T16:30:00Z") }); // 31 Oct 23:30 WIB
    const nov = post({ approvedAt: d("2026-10-31T17:10:00Z") }); // 1 Nov 00:10 WIB
    const other = post({ authorId: "s2" });
    const unapproved = post({ approvedAt: null });
    const k = computeContentKpi([late, nov, other, unapproved], "s1", "2026-10", null);
    expect([k.tasksDone, k.doneRequestIds]).toEqual([1, [late.id]]);
    expect(computeContentKpi([late, nov], "s1", "2026-11", null).tasksDone).toBe(1);
  });

  it("on time = approved on or before the planned day; no planned day is left out", () => {
    const onDay = post({ approvedAt: d("2026-10-12T15:00:00Z"), plannedAt: d("2026-10-12T00:00:00Z") }); // 22:00 WIB same day
    const after = post({ approvedAt: d("2026-10-13T02:00:00Z"), plannedAt: d("2026-10-12T00:00:00Z") });
    const none = post({ plannedAt: null });
    expect(computeContentKpi([onDay, after, none], "s1", "2026-10", null).onTimeRate).toBe(0.5);
    expect(computeContentKpi([none], "s1", "2026-10", null).onTimeRate).toBeNull();
  });

  it("target and progress like requests; target 0 has no progress; request-only numbers stay empty", () => {
    const ps = [post({}), post({})];
    expect(computeContentKpi(ps, "s1", "2026-10", { targetTasks: 4 })).toMatchObject({ target: 4, progress: 0.5 });
    expect(computeContentKpi(ps, "s1", "2026-10", { targetTasks: 0 }).progress).toBeNull();
    expect(computeContentKpi(ps, "s1", "2026-10", null)).toMatchObject({
      target: null, progress: null, avgTurnaroundDays: null, revisionRounds: 0, totalOutputs: 0, activeWorkload: 0,
    });
  });
});
