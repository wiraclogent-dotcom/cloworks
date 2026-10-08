import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { listBoardColumns, listRequestsPage } from "@/lib/requests";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("board query on a realistic import (~600 requests)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const user = await p.user.create({ data: { email: "r@clogent.co.id", name: "R", fullName: "R" } });
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    const mix: Array<["REQUESTED" | "ON_PROGRESS" | "FIRST_LOOK" | "DONE", number]> = [["REQUESTED", 40], ["ON_PROGRESS", 25], ["FIRST_LOOK", 12], ["DONE", 523]];
    let n = 0;
    const data = mix.flatMap(([status, count]) => Array.from({ length: count }, () => ({
      title: `r${n}`, brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: user.id, status,
      requestedAt: new Date(Date.UTC(2025, 0, 1) + n++ * 3_600_000),
    })));
    await p.request.createMany({ data });
  }, 120_000);
  afterAll(async () => { await db?.stop(); });

  it("returns every total but never more than the limit rows per column", async () => {
    const cols = await listBoardColumns(db.prisma, {});
    expect(cols.map((c) => c.total)).toEqual([40, 25, 12, 523]);
    expect(cols.map((c) => c.rows.length)).toEqual([25, 25, 12, 25]);
    const more = await listBoardColumns(db.prisma, {}, { byStatus: { DONE: 50 } });
    expect(more[3].rows).toHaveLength(50);
    expect(more[0].rows).toHaveLength(25);
  });

  it("pages the table 50 at a time over all 600 rows", async () => {
    const p = await listRequestsPage(db.prisma, {}, { sort: "title", dir: "asc", page: 3 });
    expect(p.total).toBe(600);
    expect(p.rows).toHaveLength(50);
    expect(p.window).toMatchObject({ page: 3, pageCount: 12, from: 101, to: 150 });
  });
});
