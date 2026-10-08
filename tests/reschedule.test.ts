import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rescheduleRequestWith } from "@/lib/reschedule";
import type { NotifyInput } from "@/lib/notify";
import { createTestDb, type TestDb } from "./helpers/testDb";

const at = (d: string) => new Date(`${d}T00:00:00+07:00`);

describe("rescheduleRequestWith", () => {
  let db: TestDb;
  let creative: { id: string; appRole: "CREATIVE"; jobRole: "DESIGNER" };
  let requester: { id: string; appRole: "REQUESTER"; jobRole: "OTHER" };
  let reqUserId: string;
  let ref: { brandId: string; divisionId: string; typeId: string };
  const calls: NotifyInput[] = [];
  const notifier = async (i: NotifyInput) => { calls.push(i); };

  const mk = (data: Record<string, unknown> = {}) =>
    db.prisma.request.create({ data: { title: "Banner", ...ref, requesterId: reqUserId, status: "ON_PROGRESS", requestedAt: new Date("2026-10-01T03:00:00Z"), deadline: at("2026-10-10"), ...data } as never });
  const run = (id: string, day: string, user: object = creative) => rescheduleRequestWith(async () => user as never, db.prisma, id, day, notifier);

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const c = await p.user.create({ data: { email: "c@clogent.co.id", name: "Cee", fullName: "Cee", appRole: "CREATIVE" } });
    const r = await p.user.create({ data: { email: "r@clogent.co.id", name: "R", fullName: "R" } });
    creative = { id: c.id, appRole: "CREATIVE", jobRole: "DESIGNER" };
    requester = { id: r.id, appRole: "REQUESTER", jobRole: "OTHER" };
    reqUserId = r.id;
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    ref = { brandId: brand.id, divisionId: div.id, typeId: type.id };
  });
  afterAll(async () => { await db?.stop(); });

  it("rejects requester, unauthenticated, and missing id", async () => {
    const q = await mk();
    expect(await run(q.id, "2026-10-14", requester)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const r = await rescheduleRequestWith(async () => { throw new Error("Unauthenticated"); }, db.prisma, q.id, "2026-10-14", notifier);
    expect(r).toEqual({ ok: false, code: "UNAUTHENTICATED", message: "Your session has expired. Sign in again." });
    expect(await run("nope", "2026-10-14")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("rejects closed requests with a status-specific message", async () => {
    const d = await mk({ status: "DONE" });
    const c = await mk({ status: "CANCELLED" });
    expect(await run(d.id, "2026-10-14")).toEqual({ ok: false, code: "CLOSED", message: "This request is already done." });
    expect(await run(c.id, "2026-10-14")).toEqual({ ok: false, code: "CLOSED", message: "This request is already cancelled." });
  });

  it("rejects invalid dates", async () => {
    const q = await mk();
    expect(await run(q.id, "2026-02-30")).toMatchObject({ ok: false, code: "INVALID_DATE" });
    expect(await run(q.id, "abc")).toMatchObject({ ok: false, code: "INVALID_DATE" });
  });

  it("uses the Jakarta request day", async () => {
    const q = await mk({ requestedAt: new Date("2026-10-09T17:30:00Z") });
    expect(await run(q.id, "2026-10-09")).toMatchObject({ ok: false, code: "INVALID_DATE" });
    expect(await run(q.id, "2026-10-10")).toEqual({ ok: true });
  });

  it("same day is a no-op", async () => {
    const q = await mk({ assigneeId: creative.id });
    calls.length = 0;
    expect(await run(q.id, "2026-10-10")).toEqual({ ok: true });
    expect(await db.prisma.deadlineEvent.count({ where: { requestId: q.id } })).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("moves, keeps the first original deadline, and logs events", async () => {
    const q = await mk();
    expect(await run(q.id, "2026-10-14")).toEqual({ ok: true });
    let row = await db.prisma.request.findUniqueOrThrow({ where: { id: q.id } });
    expect(row.deadline).toEqual(at("2026-10-14"));
    expect(row.originalDeadline).toEqual(at("2026-10-10"));
    const ev = await db.prisma.deadlineEvent.findMany({ where: { requestId: q.id } });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ from: at("2026-10-10"), to: at("2026-10-14"), actorId: creative.id });
    expect(await run(q.id, "2026-10-16")).toEqual({ ok: true });
    row = await db.prisma.request.findUniqueOrThrow({ where: { id: q.id } });
    expect(row.originalDeadline).toEqual(at("2026-10-10"));
    expect(row.deadline).toEqual(at("2026-10-16"));
  });

  it("leaves originalDeadline null when there was no deadline", async () => {
    const q = await mk({ deadline: null });
    expect(await run(q.id, "2026-10-12")).toEqual({ ok: true });
    const row = await db.prisma.request.findUniqueOrThrow({ where: { id: q.id } });
    expect(row.originalDeadline).toBeNull();
    expect(row.deadline).toEqual(at("2026-10-12"));
    const ev = await db.prisma.deadlineEvent.findMany({ where: { requestId: q.id } });
    expect(ev[0]).toMatchObject({ from: null, to: at("2026-10-12") });
  });

  it("notifies assignee and requester but never the actor", async () => {
    const other = await db.prisma.user.create({ data: { email: "o@clogent.co.id", name: "O", fullName: "O", appRole: "CREATIVE" } });
    const q = await mk({ assigneeId: other.id });
    calls.length = 0;
    await run(q.id, "2026-10-15");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ type: "DEADLINE", actorId: creative.id, requestId: q.id });
    expect([...calls[0].userIds].sort()).toEqual([other.id, reqUserId].sort());
    expect(calls[0].userIds).not.toContain(creative.id);
    const q2 = await mk({ assigneeId: creative.id });
    calls.length = 0;
    await run(q2.id, "2026-10-15");
    expect(calls[0].userIds).toEqual([reqUserId]);
  });
});
