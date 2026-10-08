import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { RequestStatus } from "@prisma/client";
import { listBoardColumns, listRequestsPage, listRequests, sortRows, type SortKey } from "@/lib/requests";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("listBoardColumns / listRequestsPage", () => {
  let db: TestDb;
  let u: Record<string, string>;
  let b: Record<string, string>;
  let d: Record<string, string>;
  let typeId: string;

  async function mk(title: string, o: {
    status?: RequestStatus; requester?: string; assignee?: string | null; brand?: string; division?: string;
    deadline?: string | null; requestedAt?: string; notes?: string;
  } = {}) {
    await db.prisma.request.create({
      data: {
        title, notes: o.notes,
        brandId: b[o.brand ?? "a"], divisionId: d[o.division ?? "x"], typeId,
        requesterId: u[o.requester ?? "req"], assigneeId: o.assignee ? u[o.assignee] : null,
        status: o.status ?? "REQUESTED",
        deadline: o.deadline ? new Date(`${o.deadline}T00:00:00+07:00`) : null,
        requestedAt: new Date(o.requestedAt ?? "2026-10-01T00:00:00Z"),
      },
    });
  }

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    u = {};
    for (const n of ["req", "req2", "cre"]) u[n] = (await p.user.create({ data: { email: `${n}@clogent.co.id`, name: n.toUpperCase(), fullName: n } })).id;
    b = { a: (await p.brand.create({ data: { name: "BrandA" } })).id, b: (await p.brand.create({ data: { name: "brandB" } })).id };
    d = { x: (await p.division.create({ data: { name: "DivX" } })).id, y: (await p.division.create({ data: { name: "DivY" } })).id };
    typeId = (await p.requestType.create({ data: { name: "T" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  describe("empty board", () => {
    it("returns the four board columns with total 0 and no rows", async () => {
      const cols = await listBoardColumns(db.prisma, {});
      expect(cols.map((c) => c.status)).toEqual(["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE"]);
      expect(cols.every((c) => c.total === 0 && c.rows.length === 0)).toBe(true);
    });
  });

  describe("with data", () => {
    beforeAll(async () => {
      // REQUESTED: 30 rows, deadlines on 20 of them
      for (let i = 0; i < 30; i++) {
        await mk(`req-${String(i).padStart(2, "0")}`, {
          deadline: i < 20 ? `2026-11-${String(i + 1).padStart(2, "0")}` : null,
          requestedAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
        });
      }
      await mk("prog-late", { status: "ON_PROGRESS", deadline: "2026-12-01", assignee: "cre" });
      await mk("prog-soon", { status: "ON_PROGRESS", deadline: "2026-10-10", assignee: "cre" });
      await mk("prog-none-old", { status: "ON_PROGRESS", requestedAt: "2026-09-01T00:00:00Z" });
      await mk("prog-none-new", { status: "ON_PROGRESS", requestedAt: "2026-09-20T00:00:00Z" });
      // DONE: 40 rows with distinct requestedAt, plus a deadline on an old one (must NOT matter)
      for (let i = 0; i < 40; i++) {
        await mk(`done-${String(i).padStart(2, "0")}`, {
          status: "DONE", requestedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
          deadline: i === 0 ? "2026-01-02" : null, assignee: "cre",
        });
      }
      await mk("gone-1", { status: "CANCELLED", requestedAt: "2026-02-01T00:00:00Z" });
      await mk("gone-2", { status: "CANCELLED", requestedAt: "2026-03-01T00:00:00Z" });
    });

    it("returns total and at most the default 25 rows per column", async () => {
      const cols = await listBoardColumns(db.prisma, {});
      const by = Object.fromEntries(cols.map((c) => [c.status, c]));
      expect(by.REQUESTED.total).toBe(30);
      expect(by.REQUESTED.rows).toHaveLength(25);
      expect(by.ON_PROGRESS.total).toBe(4);
      expect(by.ON_PROGRESS.rows).toHaveLength(4);
      expect(by.FIRST_LOOK.total).toBe(0);
      expect(by.DONE.total).toBe(40);
      expect(by.DONE.rows).toHaveLength(25);
      expect(cols.map((c) => c.status)).not.toContain("CANCELLED");
    });

    it("keeps deadline asc nulls last then requestedAt desc in active columns", async () => {
      const cols = await listBoardColumns(db.prisma, {});
      expect(cols[1].rows.map((r) => r.title)).toEqual(["prog-soon", "prog-late", "prog-none-new", "prog-none-old"]);
      const req = cols[0].rows.map((r) => r.title);
      expect(req.slice(0, 3)).toEqual(["req-00", "req-01", "req-02"]);
      // The 5 deadline-less rows that fit come after all 20 dated ones
      expect(req.slice(0, 20).every((t) => Number(t.slice(4)) < 20)).toBe(true);
    });

    it("orders DONE newest first by requestedAt, ignoring deadline", async () => {
      const done = (await listBoardColumns(db.prisma, {}))[3];
      expect(done.rows.slice(0, 3).map((r) => r.title)).toEqual(["done-39", "done-38", "done-37"]);
      expect(done.rows[24].title).toBe("done-15");
    });

    it("honours per-status limits, clamped to the total", async () => {
      const cols = await listBoardColumns(db.prisma, {}, { byStatus: { DONE: 30, REQUESTED: 1000 } });
      expect(cols[3].rows).toHaveLength(30);
      expect(cols[0].rows).toHaveLength(30);
      expect(cols[3].total).toBe(40);
      const small = await listBoardColumns(db.prisma, {}, { limit: 2 });
      expect(small.map((c) => c.rows.length)).toEqual([2, 2, 0, 2]);
    });

    it("uses the same row shape as listRequests", async () => {
      const [r] = (await listBoardColumns(db.prisma, { assigneeId: u.cre }))[1].rows;
      const [expected] = await listRequests(db.prisma, { status: "ON_PROGRESS", assigneeId: u.cre });
      expect(r).toEqual(expected);
    });

    it("applies the shared filters to totals and rows", async () => {
      const f = await listBoardColumns(db.prisma, { assigneeId: u.cre });
      expect(f.map((c) => c.total)).toEqual([0, 2, 0, 40]);
      const q = await listBoardColumns(db.prisma, { q: "done-3" });
      expect(q[3].total).toBe(10); // done-30 … done-39
      expect(q[0].total).toBe(0);
      const mine = await listBoardColumns(db.prisma, { mine: { userId: u.req } });
      expect(mine.map((c) => c.total)).toEqual([30, 4, 0, 40]);
      const none = await listBoardColumns(db.prisma, { mine: { userId: u.req2 } });
      expect(none.every((c) => c.total === 0)).toBe(true);
      const brand = await listBoardColumns(db.prisma, { brandId: b.b });
      expect(brand.every((c) => c.total === 0)).toBe(true);
    });

    it("a status filter keeps the four columns but only fills the matching one", async () => {
      const f = await listBoardColumns(db.prisma, { status: "DONE" });
      expect(f.map((c) => c.total)).toEqual([0, 0, 0, 40]);
    });

    it("adds a CANCELLED column (newest first) only when the status filter is Cancelled", async () => {
      const f = await listBoardColumns(db.prisma, { status: "CANCELLED" });
      expect(f.map((c) => c.status)).toEqual(["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE", "CANCELLED"]);
      expect(f.map((c) => c.total)).toEqual([0, 0, 0, 0, 2]);
      expect(f[4].rows.map((r) => r.title)).toEqual(["gone-2", "gone-1"]);
    });

    describe("table pagination", () => {
      it("pages 50 at a time with totals, clamping the page", async () => {
        const all = await listRequests(db.prisma, {});
        expect(all).toHaveLength(74);
        const p1 = await listRequestsPage(db.prisma, {}, { sort: "deadline", dir: "asc", page: 1 });
        expect(p1.total).toBe(74);
        expect(p1.rows).toHaveLength(50);
        expect(p1.window).toMatchObject({ page: 1, pageCount: 2, from: 1, to: 50 });
        const p2 = await listRequestsPage(db.prisma, {}, { sort: "deadline", dir: "asc", page: 2 });
        expect(p2.rows).toHaveLength(24);
        expect(p2.window).toMatchObject({ from: 51, to: 74 });
        const clamped = await listRequestsPage(db.prisma, {}, { sort: "deadline", dir: "asc", page: 99 });
        expect(clamped.window.page).toBe(2);
        expect(clamped.rows.map((r) => r.id)).toEqual(p2.rows.map((r) => r.id));
        expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(74);
      });

      it("applies filters before counting", async () => {
        const r = await listRequestsPage(db.prisma, { status: "DONE" }, { sort: "deadline", dir: "asc", page: 1 });
        expect(r.total).toBe(40);
        expect(r.rows).toHaveLength(40);
        const none = await listRequestsPage(db.prisma, { q: "zzzz" }, { sort: "deadline", dir: "asc", page: 3 });
        expect(none).toMatchObject({ total: 0, rows: [] });
      });

      it("sorts across the FULL result then pages, matching the in-memory sortRows semantics for every key", async () => {
        const all = await listRequests(db.prisma, {});
        const keys: SortKey[] = ["title", "brand", "division", "requester", "assignee", "status", "requested", "deadline"];
        for (const key of keys) for (const dir of ["asc", "desc"] as const) {
          const expected = sortRows(all, key, dir).map((r) => r.id);
          const p1 = await listRequestsPage(db.prisma, {}, { sort: key, dir, page: 1 });
          const p2 = await listRequestsPage(db.prisma, {}, { sort: key, dir, page: 2 });
          const got = [...p1.rows, ...p2.rows].map((r) => r.id);
          // Rows that tie on the sort key may differ in order only by id tie-break; compare sort-key sequence plus membership.
          expect(new Set(got).size, `${key} ${dir} unique`).toBe(74);
          const keyOf = (id: string) => {
            const r = all.find((x) => x.id === id)!;
            const k = { title: r.title.toLowerCase(), brand: r.brandName.toLowerCase(), division: r.divisionName.toLowerCase(),
              requester: r.requesterName.toLowerCase(), assignee: r.assigneeName?.toLowerCase() ?? null, status: r.status,
              requested: r.requestedAt.getTime(), deadline: r.deadline?.getTime() ?? null }[key];
            return k;
          };
          expect(got.map(keyOf), `${key} ${dir} key sequence`).toEqual(expected.map(keyOf));
        }
      });

      it("puts nulls last in both directions for deadline and assignee across pages", async () => {
        for (const dir of ["asc", "desc"] as const) {
          const p1 = await listRequestsPage(db.prisma, {}, { sort: "assignee", dir, page: 1 });
          expect(p1.rows[0].assigneeName).not.toBeNull();
          const p2 = await listRequestsPage(db.prisma, {}, { sort: "deadline", dir, page: 2 });
          expect(p2.rows.at(-1)!.deadline).toBeNull();
        }
      });
    });
  });
});
