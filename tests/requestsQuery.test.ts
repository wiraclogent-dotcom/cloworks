import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { RequestStatus } from "@prisma/client";
import { listRequests, listCalendarRequests, listTimelineRequests, listBoardColumns, listRequestsPage } from "@/lib/requests";
import { parseParams, toFilter } from "@/app/(app)/requests/params";
import { OVERVIEW_SCOPES, todayOverview } from "@/lib/todayOverview";
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
    deadline?: string | null; requestedAt?: string; notes?: string; title?: string; outputCount?: number; assignees?: string[];
  } = {}) {
    const who = o.assignees ?? (o.assignee ? [o.assignee] : []);
    const r = await db.prisma.request.create({
      data: {
        title: o.title ?? key,
        notes: o.notes,
        brandId: b[o.brand ?? "a"], divisionId: d[o.division ?? "x"], typeId,
        requesterId: u[o.requester ?? "req"], assigneeId: who[0] ? u[who[0]] : null,
        status: o.status ?? "REQUESTED",
        deadline: o.deadline ? new Date(`${o.deadline}T00:00:00+07:00`) : null,
        requestedAt: new Date(o.requestedAt ?? "2026-10-01T00:00:00Z"),
        outputCount: o.outputCount ?? 1,
      },
    });
    if (who.length) await db.prisma.requestAssignee.createMany({ data: who.map((n, i) => ({ requestId: r.id, userId: u[n], addedAt: new Date(Date.UTC(2026, 9, 1, 0, i)) })) });
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
  it("mine = requests I filed (assigned work is \"My work\", i.e. the assignee filter)", async () => {
    expect((await keys({ mine: { userId: u.cre2 } }))).toEqual([]);
    expect((await keys({ mine: { userId: u.req2 } })).sort()).toEqual(["nodl-new", "other"]);
    expect((await keys({ mine: { userId: u.cre } }))).toEqual([]);
  });
  it("each summary tile's list (?scope=) holds exactly the requests its number counts", async () => {
    const now = new Date("2026-10-10T03:00:00Z"); // Jakarta 10 Oct: "soon" is due today, nothing is overdue yet
    await db.prisma.statusEvent.create({ data: { requestId: ids["Poster Launch"], from: "FIRST_LOOK", to: "DONE", actorId: u.cre, at: now } });
    const counts = await todayOverview(db.prisma, now);
    const byScope = { "open": counts.open, "due-today": counts.dueToday, "overdue": counts.overdue, "done-today": counts.doneToday };
    for (const scope of OVERVIEW_SCOPES) expect((await keys({ scope, now })).length, scope).toBe(byScope[scope]);
    expect(await keys({ scope: "due-today", now })).toEqual(["soon"]);
    expect(await keys({ scope: "done-today", now })).toEqual(["Poster Launch"]);
    expect((await keys({ scope: "overdue", now: new Date("2026-10-21T03:00:00Z") })).sort()).toEqual(["late", "soon"]);
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
      requesterName: "REQ", assignees: [], status: "DONE", outputCount: 3, deadline: null,
    });
    expect(r.requestedAt).toBeInstanceOf(Date);
    const [s] = await listRequests(db.prisma, { assigneeId: u.cre });
    expect(s.assignees).toEqual([{ id: u.cre, name: "CRE" }]);
    expect(s.deadline).toBeInstanceOf(Date);
  });
});

import { sortRows } from "@/lib/requests";
import type { RequestRow } from "@/lib/requests";

describe("sortRows", () => {
  const row = (title: string, deadline: string | null): RequestRow => ({
    id: title, title, brandName: "b", divisionName: "d", requesterName: "r", assignees: [], status: "REQUESTED",
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

describe("listCalendarRequests", () => {
  let db: TestDb;
  let cre: string;
  let cre2: string;
  const range = { from: "2026-09-28", to: "2026-11-01", today: "2026-10-08" };

  async function mk(title: string, o: { status?: RequestStatus; deadline?: string | null; assigneeId?: string | null; requestedAt?: string } = {}) {
    const r = await db.prisma.request.create({
      data: {
        title, brandId: brandId, divisionId: divisionId, typeId, requesterId: cre, assigneeId: o.assigneeId ?? null,
        status: o.status ?? "REQUESTED",
        deadline: o.deadline ? new Date(`${o.deadline}T00:00:00+07:00`) : null,
        requestedAt: new Date(o.requestedAt ?? "2026-10-01T00:00:00Z"),
      },
    });
    if (o.assigneeId) await db.prisma.requestAssignee.createMany({ data: [{ requestId: r.id, userId: o.assigneeId }] });
  }
  let brandId: string; let divisionId: string; let typeId: string;

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    cre = (await p.user.create({ data: { email: "c@clogent.co.id", name: "C", fullName: "c" } })).id;
    cre2 = (await p.user.create({ data: { email: "c2@clogent.co.id", name: "C2", fullName: "c2" } })).id;
    brandId = (await p.brand.create({ data: { name: "B" } })).id;
    divisionId = (await p.division.create({ data: { name: "D" } })).id;
    typeId = (await p.requestType.create({ data: { name: "T" } })).id;
    await mk("in", { deadline: "2026-10-14", assigneeId: cre2 });
    await mk("later", { deadline: "2026-11-20" });
    await mk("done", { deadline: "2026-10-14", status: "DONE" });
    await mk("nodl");
    await mk("edge-end", { deadline: "2026-11-01", requestedAt: "2026-10-03T00:00:00Z" });
    await mk("edge-start", { deadline: "2026-09-28", requestedAt: "2026-10-02T00:00:00Z" });
    await mk("before", { deadline: "2026-09-27" });
  });
  afterAll(async () => { await db?.stop(); });

  it("returns open rows in range plus no-deadline rows when today is in range, deadline asc", async () => {
    const rows = await listCalendarRequests(db.prisma, {}, range);
    expect(rows.map((r) => r.title)).toEqual(["edge-start", "in", "edge-end", "nodl"]);
    expect(rows[1]).toMatchObject({ deadlineDay: "2026-10-14", requestDay: "2026-10-01" });
    expect(rows[3].deadlineDay).toBeNull();
  });
  it("excludes no-deadline rows when today is outside the range", async () => {
    const rows = await listCalendarRequests(db.prisma, {}, { ...range, today: "2026-12-01" });
    expect(rows.map((r) => r.title)).toEqual(["edge-start", "in", "edge-end"]);
  });
  it("returns nothing for a closed status filter", async () => {
    expect(await listCalendarRequests(db.prisma, { status: "DONE" }, range)).toEqual([]);
  });
  it("still applies the assignee filter", async () => {
    const rows = await listCalendarRequests(db.prisma, { assigneeId: cre2 }, range);
    expect(rows.map((r) => r.title)).toEqual(["in"]);
  });
});

describe("listTimelineRequests", () => {
  let db: TestDb;
  let cre: string;
  let cre2: string;
  let brandId: string; let divisionId: string; let typeId: string;
  const range = { from: "2026-09-28", to: "2026-10-11", today: "2026-10-08" };

  async function mk(title: string, requested: string, o: { status?: RequestStatus; deadline?: string | null; assigneeId?: string | null } = {}) {
    const r = await db.prisma.request.create({
      data: {
        title, brandId, divisionId, typeId, requesterId: cre, assigneeId: o.assigneeId ?? null,
        status: o.status ?? "REQUESTED",
        deadline: o.deadline ? new Date(`${o.deadline}T00:00:00+07:00`) : null,
        requestedAt: new Date(`${requested}T00:00:00+07:00`),
      },
    });
    if (o.assigneeId) await db.prisma.requestAssignee.createMany({ data: [{ requestId: r.id, userId: o.assigneeId }] });
  }

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    cre = (await p.user.create({ data: { email: "t@clogent.co.id", name: "T", fullName: "t" } })).id;
    cre2 = (await p.user.create({ data: { email: "t2@clogent.co.id", name: "T2", fullName: "t2" } })).id;
    brandId = (await p.brand.create({ data: { name: "B" } })).id;
    divisionId = (await p.division.create({ data: { name: "D" } })).id;
    typeId = (await p.requestType.create({ data: { name: "T" } })).id;
    await mk("run", "2026-10-01", { deadline: "2026-10-14", assigneeId: cre2 });
    await mk("overdue-old", "2026-09-10", { deadline: "2026-09-20" });
    await mk("nodl", "2026-10-02");
    await mk("future", "2026-10-20", { deadline: "2026-10-25" });
    await mk("done", "2026-10-01", { deadline: "2026-10-05", status: "DONE" });
    await mk("last-day", "2026-10-11", { deadline: "2026-10-12", status: "FIRST_LOOK" });
  });
  afterAll(async () => { await db?.stop(); });

  it("returns open requests whose bar meets the window, oldest request first", async () => {
    const rows = await listTimelineRequests(db.prisma, {}, range);
    expect(rows.map((r) => r.title)).toEqual(["overdue-old", "run", "nodl", "last-day"]);
    expect(rows[1]).toMatchObject({ assignees: [{ id: cre2, name: "T2" }], requestDay: "2026-10-01", deadlineDay: "2026-10-14" });
    expect(rows[2]).toMatchObject({ assignees: [], deadlineDay: null });
    expect(rows[1]).not.toHaveProperty("assigneeId");
  });
  it("for a future window needs a deadline on or after its first day", async () => {
    const rows = await listTimelineRequests(db.prisma, {}, { from: "2026-10-12", to: "2026-10-25", today: "2026-10-08" });
    expect(rows.map((r) => r.title)).toEqual(["run", "last-day", "future"]);
  });
  it("returns nothing for a closed status filter", async () =>
    expect(await listTimelineRequests(db.prisma, { status: "DONE" }, range)).toEqual([]));
  it("applies an open status filter and the other filters", async () => {
    expect((await listTimelineRequests(db.prisma, { status: "FIRST_LOOK" }, range)).map((r) => r.title)).toEqual(["last-day"]);
    expect((await listTimelineRequests(db.prisma, { assigneeId: cre2 }, range)).map((r) => r.title)).toEqual(["run"]);
  });
});

describe("requests with several assignees", () => {
  let db: TestDb;
  let ana: string; let bima: string; let cika: string;

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const user = async (n: string) => (await p.user.create({ data: { email: `${n}@clogent.co.id`, name: n, fullName: n } })).id;
    [ana, bima, cika] = [await user("Ana"), await user("Bima"), await user("Cika")];
    const brandId = (await p.brand.create({ data: { name: "B" } })).id;
    const divisionId = (await p.division.create({ data: { name: "D" } })).id;
    const typeId = (await p.requestType.create({ data: { name: "T" } })).id;
    const mk = async (title: string, who: { id: string; at: number }[]) => {
      const r = await p.request.create({
        data: { title, brandId, divisionId, typeId, requesterId: ana, assigneeId: who[0]?.id ?? null, deadline: new Date("2026-10-20T00:00:00+07:00") },
      });
      if (who.length) await p.requestAssignee.createMany({ data: who.map((w) => ({ requestId: r.id, userId: w.id, addedAt: new Date(Date.UTC(2026, 9, 1, 0, w.at)) })) });
    };
    // "pair" was added in reverse alphabetical order on purpose: Bima first, then Ana.
    await mk("pair", [{ id: bima, at: 0 }, { id: ana, at: 1 }]);
    await mk("solo-cika", [{ id: cika, at: 0 }]);
    await mk("nobody", []);
  });
  afterAll(async () => { await db?.stop(); });

  const titles = async (f: Parameters<typeof listRequests>[1]) => (await listRequests(db.prisma, f)).map((r) => r.title).sort();

  it("lists the assignees of a row in the order they were added", async () => {
    const rows = await listRequests(db.prisma, {});
    expect(rows.find((r) => r.title === "pair")!.assignees).toEqual([{ id: bima, name: "Bima" }, { id: ana, name: "Ana" }]);
    expect(rows.find((r) => r.title === "nobody")!.assignees).toEqual([]);
  });
  it("the assignee filter finds a shared request for either assignee, once", async () => {
    expect(await titles({ assigneeId: ana })).toEqual(["pair"]);
    expect(await titles({ assigneeId: bima })).toEqual(["pair"]);
    expect(await titles({ assigneeId: cika })).toEqual(["solo-cika"]);
  });
  it("\"My work\" (?work=1) finds a shared request for either assignee", async () => {
    const mine = (id: string) => titles(toFilter(parseParams({ work: "1" }), id));
    expect(await mine(ana)).toEqual(["pair"]);
    expect(await mine(bima)).toEqual(["pair"]);
  });
  it("board columns count a shared request once and the filter works there too", async () => {
    const col = (await listBoardColumns(db.prisma, { assigneeId: ana }))[0];
    expect(col.total).toBe(1);
    expect(col.rows.map((r) => r.title)).toEqual(["pair"]);
  });
  it("the calendar and timeline filters see the second assignee", async () => {
    const range = { from: "2026-09-28", to: "2026-11-01", today: "2026-10-08" };
    expect((await listCalendarRequests(db.prisma, { assigneeId: ana }, range)).map((r) => r.title)).toEqual(["pair"]);
    expect((await listTimelineRequests(db.prisma, { assigneeId: ana }, range)).map((r) => r.title)).toEqual(["pair"]);
  });
  it("the table sorts by the first assignee, unassigned last in both directions", async () => {
    for (const dir of ["asc", "desc"] as const) {
      const page = await listRequestsPage(db.prisma, {}, { sort: "assignee", dir, page: 1 });
      const order = page.rows.map((r) => r.title);
      expect(order.at(-1), dir).toBe("nobody");
      expect(order.slice(0, 2), dir).toEqual(dir === "asc" ? ["pair", "solo-cika"] : ["solo-cika", "pair"]);
    }
  });
});

describe("sortRows with assignees", () => {
  const row = (title: string, names: string[]): RequestRow => ({
    id: title, title, brandName: "b", divisionName: "d", requesterName: "r", assignees: names.map((name, i) => ({ id: `${title}${i}`, name })),
    status: "REQUESTED", requestedAt: new Date("2026-10-01"), deadline: null, outputCount: 1, daysLeft: null, needsMotion: false,
  });
  const rows = [row("none", []), row("b-first", ["Bima", "Ana"]), row("a", ["ana"])];
  it("uses the first assignee's lowercased name; unassigned last in both directions", () => {
    expect(sortRows(rows, "assignee", "asc").map((r) => r.title)).toEqual(["a", "b-first", "none"]);
    expect(sortRows(rows, "assignee", "desc").map((r) => r.title)).toEqual(["b-first", "a", "none"]);
  });
});
