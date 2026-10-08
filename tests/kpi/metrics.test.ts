import { describe, it, expect } from "vitest";
import { JobRole, RequestStatus as S } from "@prisma/client";
import { computeKpi, type KpiRequest } from "@/lib/kpi/metrics";

const designer = { id: "d1", jobRole: JobRole.DESIGNER };
const d = (s: string) => new Date(s);

let n = 0;
function req(p: Partial<KpiRequest> & { doneAt?: string }): KpiRequest {
  const { doneAt, ...rest } = p;
  const base: KpiRequest = {
    id: `r${++n}`,
    requesterId: "s1",
    assigneeId: "d1",
    requestedAt: d("2026-10-05T00:00:00Z"),
    deadline: null,
    originalDeadline: null,
    status: S.DONE,
    includeKpi: true,
    outputCount: 1,
    events: [],
    ...rest,
  };
  if (doneAt && base.events.length === 0) {
    base.events = [{ from: S.FIRST_LOOK, to: S.DONE, at: d(doneAt) }];
  }
  return base;
}

describe("computeKpi", () => {
  it("designer: 3 done assigned in month, target 50", () => {
    const rs = [req({ doneAt: "2026-10-06T00:00:00Z" }), req({ doneAt: "2026-10-07T00:00:00Z" }), req({ doneAt: "2026-10-08T00:00:00Z" })];
    const r = computeKpi(rs, designer, "2026-10", { role: JobRole.DESIGNER, targetTasks: 50 });
    expect(r.tasksDone).toBe(3);
    expect(r.target).toBe(50);
    expect(r.progress).toBeCloseTo(0.06, 10);
  });

  it("no target -> target and progress null", () => {
    const r = computeKpi([req({ doneAt: "2026-10-06T00:00:00Z" })], designer, "2026-10", null);
    expect(r.target).toBeNull();
    expect(r.progress).toBeNull();
    expect(r.tasksDone).toBe(1);
  });

  it("social media counts requester, not assignee", () => {
    const sm = { id: "s1", jobRole: JobRole.SOCIAL_MEDIA };
    const rs = [req({ doneAt: "2026-10-06T00:00:00Z" }), req({ requesterId: "other", assigneeId: "s1", doneAt: "2026-10-06T00:00:00Z" })];
    expect(computeKpi(rs, sm, "2026-10", null).tasksDone).toBe(1);
  });

  it("OTHER role counts nothing", () => {
    const o = { id: "d1", jobRole: JobRole.OTHER };
    expect(computeKpi([req({ doneAt: "2026-10-06T00:00:00Z" })], o, "2026-10", null).tasksDone).toBe(0);
  });

  it("totalOutputs sums outputCount 1+4+2", () => {
    const rs = [1, 4, 2].map((o) => req({ outputCount: o, doneAt: "2026-10-06T00:00:00Z" }));
    expect(computeKpi(rs, designer, "2026-10", null).totalOutputs).toBe(7);
  });

  it("revisionRounds counts FIRST_LOOK -> ON_PROGRESS", () => {
    const r1 = req({
      events: [
        { from: S.ON_PROGRESS, to: S.FIRST_LOOK, at: d("2026-10-06T00:00:00Z") },
        { from: S.FIRST_LOOK, to: S.ON_PROGRESS, at: d("2026-10-07T00:00:00Z") },
        { from: S.ON_PROGRESS, to: S.DONE, at: d("2026-10-08T00:00:00Z") },
      ],
    });
    expect(computeKpi([r1], designer, "2026-10", null).revisionRounds).toBe(1);
  });

  it("request dated 30 Sep belongs to 2026-09 even if done 1 Oct", () => {
    const r1 = req({ requestedAt: d("2026-09-30T10:00:00Z"), doneAt: "2026-10-01T10:00:00Z" });
    expect(computeKpi([r1], designer, "2026-09", null).tasksDone).toBe(1);
    expect(computeKpi([r1], designer, "2026-10", null).tasksDone).toBe(0);
  });

  it("target role SOCIAL_MEDIA in 2026-09 -> requester; no target + DESIGNER jobRole in 2026-10 -> assignee", () => {
    const u = { id: "u1", jobRole: JobRole.DESIGNER };
    const sep = req({ requesterId: "u1", assigneeId: "x", requestedAt: d("2026-09-10T00:00:00Z"), doneAt: "2026-09-12T00:00:00Z" });
    const sepAsAssignee = req({ requesterId: "y", assigneeId: "u1", requestedAt: d("2026-09-10T00:00:00Z"), doneAt: "2026-09-12T00:00:00Z" });
    const oct = req({ requesterId: "y", assigneeId: "u1", doneAt: "2026-10-07T00:00:00Z" });
    const octAsRequester = req({ requesterId: "u1", assigneeId: "x", doneAt: "2026-10-07T00:00:00Z" });
    const all = [sep, sepAsAssignee, oct, octAsRequester];
    const sepRes = computeKpi(all, u, "2026-09", { role: JobRole.SOCIAL_MEDIA, targetTasks: 10 });
    expect(sepRes.tasksDone).toBe(1);
    const octRes = computeKpi(all, u, "2026-10", null);
    expect(octRes.tasksDone).toBe(1);
  });

  it("no-deadline skipped in onTimeRate; null when none have deadlines", () => {
    const noDl = req({ doneAt: "2026-10-06T00:00:00Z" });
    expect(computeKpi([noDl], designer, "2026-10", null).onTimeRate).toBeNull();
    const onTime = req({ deadline: d("2026-10-07T00:00:00Z"), doneAt: "2026-10-07T00:00:00Z" });
    const late = req({ deadline: d("2026-10-07T00:00:00Z"), doneAt: "2026-10-08T00:00:00Z" });
    expect(computeKpi([noDl, onTime, late], designer, "2026-10", null).onTimeRate).toBe(0.5);
  });

  it("on-time uses originalDeadline when set", () => {
    const moved = { deadline: d("2026-10-20T00:00:00+07:00"), originalDeadline: d("2026-10-10T00:00:00+07:00"), doneAt: "2026-10-15T00:00:00+07:00" };
    expect(computeKpi([req(moved)], designer, "2026-10", null).onTimeRate).toBe(0);
    expect(computeKpi([req({ ...moved, originalDeadline: null })], designer, "2026-10", null).onTimeRate).toBe(1);
  });

  it("includeKpi=false and CANCELLED excluded", () => {
    const rs = [
      req({ doneAt: "2026-10-06T00:00:00Z" }),
      req({ includeKpi: false, doneAt: "2026-10-06T00:00:00Z" }),
      req({ status: S.CANCELLED, doneAt: "2026-10-06T00:00:00Z" }),
    ];
    const r = computeKpi(rs, designer, "2026-10", null);
    expect(r.tasksDone).toBe(1);
    expect(r.totalOutputs).toBe(1);
  });

  it("DONE -> ON_PROGRESS -> DONE counts once, latest DONE for turnaround and on-time", () => {
    const r1 = req({
      requestedAt: d("2026-10-05T00:00:00Z"), // Mon
      deadline: d("2026-10-07T00:00:00Z"),
      events: [
        { from: S.FIRST_LOOK, to: S.DONE, at: d("2026-10-06T00:00:00Z") },
        { from: S.DONE, to: S.ON_PROGRESS, at: d("2026-10-06T12:00:00Z") },
        { from: S.ON_PROGRESS, to: S.DONE, at: d("2026-10-08T00:00:00Z") },
      ],
    });
    const r = computeKpi([r1], designer, "2026-10", null);
    expect(r.tasksDone).toBe(1);
    expect(r.avgTurnaroundDays).toBeCloseTo(3, 10);
    expect(r.onTimeRate).toBe(0);
  });

  it("reopened and still open does not count as done", () => {
    const r1 = req({
      status: S.ON_PROGRESS,
      events: [
        { from: S.FIRST_LOOK, to: S.DONE, at: d("2026-10-06T00:00:00Z") },
        { from: S.DONE, to: S.ON_PROGRESS, at: d("2026-10-07T00:00:00Z") },
      ],
    });
    const r = computeKpi([r1], designer, "2026-10", null);
    expect(r.tasksDone).toBe(0);
    expect(r.activeWorkload).toBe(1);
  });

  it("unassigned excluded for designers", () => {
    const r = computeKpi([req({ assigneeId: null, doneAt: "2026-10-06T00:00:00Z" })], designer, "2026-10", null);
    expect(r.tasksDone).toBe(0);
  });

  it("avgTurnaroundDays null when none done; activeWorkload counts open assigned (any month)", () => {
    const open1 = req({ status: S.REQUESTED });
    const open2 = req({ status: S.FIRST_LOOK, requestedAt: d("2026-08-01T00:00:00Z") });
    const cancelled = req({ status: S.CANCELLED });
    const other = req({ status: S.REQUESTED, assigneeId: "zz" });
    const r = computeKpi([open1, open2, cancelled, other], designer, "2026-10", null);
    expect(r.avgTurnaroundDays).toBeNull();
    expect(r.activeWorkload).toBe(2);
  });

  it("month bucketing uses Jakarta time", () => {
    const a = req({ requestedAt: d("2026-09-30T23:00:00Z"), doneAt: "2026-10-05T00:00:00Z" });
    const b = req({ requestedAt: d("2026-09-30T16:59:00Z"), doneAt: "2026-10-05T00:00:00Z" });
    expect(computeKpi([a, b], designer, "2026-10", null).tasksDone).toBe(1);
    expect(computeKpi([a, b], designer, "2026-09", null).tasksDone).toBe(1);
  });

  it("on-time compares Jakarta calendar dates", () => {
    const deadline = d("2026-10-05T00:00:00+07:00");
    const ok = req({ deadline, doneAt: "2026-10-05T15:00:00+07:00" });
    const late = req({ deadline, doneAt: "2026-10-06T00:30:00+07:00" });
    expect(computeKpi([ok], designer, "2026-10", null).onTimeRate).toBe(1);
    expect(computeKpi([late], designer, "2026-10", null).onTimeRate).toBe(0);
  });

  it("targetTasks 0 gives progress null", () => {
    const r = computeKpi([req({ doneAt: "2026-10-06T00:00:00Z" })], designer, "2026-10", { role: JobRole.DESIGNER, targetTasks: 0 });
    expect(r.progress).toBeNull();
  });
});
