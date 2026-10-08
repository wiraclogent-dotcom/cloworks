import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { RequestStatus } from "@prisma/client";
import { listRequests } from "@/lib/requests";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("listRequests", () => {
  let db: TestDb;
  let u: Record<string, string>;
  let b: Record<string, string>;
  let d: Record<string, string>;
  let typeId: string;
  const ids: Record<string, string> = {};

  async function mk(key: string, o: {
    status?: RequestStatus; requester?: string; assignee?: string | null; brand?: string; division?: string;
    deadline?: string | null; requestedAt?: string; notes?: string; title?: string; outputCount?: number;
  } = {}) {
    const r = await db.prisma.request.create({
      data: {
        title: o.title ?? key,
        notes: o.notes,
        brandId: b[o.brand ?? "a"], divisionId: d[o.division ?? "x"], typeId,
        requesterId: u[o.requester ?? "req"], assigneeId: o.assignee ? u[o.assignee] : null,
        status: o.status ?? "REQUESTED",
        deadline: o.deadline ? new Date(`${o.deadline}T00:00:00+07:00`) : null,
        requestedAt: new Date(o.requestedAt ?? "2026-10-01T00:00:00Z"),
        outputCount: o.outputCount ?? 1,
      },
    });
    ids[key] = r.id;
  }
  const keys = async (f: Parameters<typeof listRequests>[1]) => (await listRequests(db.prisma, f)).map((r) => r.title);

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    u = {};
    for (const n of ["req", "req2", "cre", "cre2"])
      u[n] = (await p.user.create({ data: { email: `${n}@clogent.co.id`, name: n.toUpperCase(), fullName: n } })).id;
    b = { a: (await p.brand.create({ data: { name: "BrandA" } })).id, b: (await p.brand.create({ data: { name: "BrandB" } })).id };
    d = { x: (await p.division.create({ data: { name: "DivX" } })).id, y: (await p.division.create({ data: { name: "DivY" } })).id };
    typeId = (await p.requestType.create({ data: { name: "T" } })).id;

    await mk("late", { deadline: "2026-10-20", requestedAt: "2026-10-02T00:00:00Z" });
    await mk("soon", { deadline: "2026-10-10", assignee: "cre", status: "ON_PROGRESS" });
    await mk("nodl-old", { requestedAt: "2026-10-01T00:00:00Z", brand: "b", division: "y" });
    await mk("nodl-new", { requestedAt: "2026-10-05T00:00:00Z", requester: "req2", assignee: "cre2", status: "FIRST_LOOK" });
    await mk("Poster Launch", { notes: "needs QR", status: "DONE", outputCount: 3 });
    await mk("other", { notes: "Banner for the LAUNCH party", requester: "req2" });
    await mk("gone", { status: "CANCELLED", deadline: "2026-10-09" });
  });
  afterAll(async () => { await db?.stop(); });

  it("orders by deadline asc nulls last, then requestedAt desc; excludes CANCELLED", async () => {
    const t = await keys({});
    expect(t.slice(0, 3)).toEqual(["soon", "late", "nodl-new"]); // nulls last: newest requestedAt first
    expect(t).not.toContain("gone");
    expect(t).toHaveLength(6);
  });
  it("filters by status", async () => {
    expect(await keys({ status: "ON_PROGRESS" })).toEqual(["soon"]);
    expect(await keys({ status: "DONE" })).toEqual(["Poster Launch"]);
  });
  it("includes CANCELLED when explicitly filtered", async () => {
    expect(await keys({ status: "CANCELLED" })).toEqual(["gone"]);
  });
  it("filters by assignee, brand, division", async () => {
    expect(await keys({ assigneeId: u.cre })).toEqual(["soon"]);
    expect(await keys({ brandId: b.b })).toEqual(["nodl-old"]);
    expect(await keys({ divisionId: d.y })).toEqual(["nodl-old"]);
  });
  it("searches title and notes case-insensitively", async () => {
    expect((await keys({ q: "launch" })).sort()).toEqual(["Poster Launch", "other"]);
    expect(await keys({ q: "qr" })).toEqual(["Poster Launch"]);
    expect(await keys({ q: "  SOON " })).toEqual(["soon"]);
  });
  it("mine = requester OR assignee", async () => {
    expect((await keys({ mine: { userId: u.cre2 } }))).toEqual(["nodl-new"]);
    expect((await keys({ mine: { userId: u.req2 } })).sort()).toEqual(["nodl-new", "other"]);
    expect((await keys({ mine: { userId: u.cre } }))).toEqual(["soon"]);
  });
  it("combines filters with AND", async () => {
    expect(await keys({ mine: { userId: u.req2 }, status: "FIRST_LOOK" })).toEqual(["nodl-new"]);
    expect(await keys({ q: "launch", brandId: b.b })).toEqual([]);
  });
  it("returns an empty array when nothing matches", async () => {
    expect(await listRequests(db.prisma, { q: "zzzz-nothing" })).toEqual([]);
  });
  it("returns the row shape the views need", async () => {
    const [r] = await listRequests(db.prisma, { status: "DONE" });
    expect(r).toMatchObject({
      id: ids["Poster Launch"], title: "Poster Launch", brandName: "BrandA", divisionName: "DivX",
      requesterName: "REQ", assigneeName: null, status: "DONE", outputCount: 3, deadline: null,
    });
    expect(r.requestedAt).toBeInstanceOf(Date);
    const [s] = await listRequests(db.prisma, { assigneeId: u.cre });
    expect(s.assigneeName).toBe("CRE");
    expect(s.deadline).toBeInstanceOf(Date);
  });
});

import { sortRows } from "@/lib/requests";
import type { RequestRow } from "@/lib/requests";

describe("sortRows", () => {
  const row = (title: string, deadline: string | null): RequestRow => ({
    id: title, title, brandName: "b", divisionName: "d", requesterName: "r", assigneeName: null, status: "REQUESTED",
    requestedAt: new Date("2026-10-01"), deadline: deadline ? new Date(deadline) : null, outputCount: 1, daysLeft: null, needsMotion: false,
  });
  const rows = [row("b", "2026-10-12"), row("none", null), row("a", "2026-10-10")];
  it("sorts by deadline with nulls last in both directions", () => {
    expect(sortRows(rows, "deadline", "asc").map((r) => r.title)).toEqual(["a", "b", "none"]);
    expect(sortRows(rows, "deadline", "desc").map((r) => r.title)).toEqual(["b", "a", "none"]);
  });
  it("sorts text case-insensitively", () => {
    expect(sortRows(rows, "title", "desc").map((r) => r.title)).toEqual(["none", "b", "a"]);
  });
});
