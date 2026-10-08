import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { seed } from "../../prisma/seedCore";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { parseRequestRows } from "@/lib/import/parseRequests";
import { applyImport } from "@/lib/import/applyImport";
import { loadKpiRequests } from "@/lib/kpi/queries";
import { computeKpi } from "@/lib/kpi/metrics";
import { reqRow, socRow, REQ_HEADERS, SOC_HEADERS } from "./fixtures";

describe("applyImport", () => {
  let db: TestDb;
  let ctx: Parameters<typeof parseRequestRows>[2];
  beforeAll(async () => {
    db = await createTestDb();
    await seed(db.prisma);
  });
  afterAll(async () => { await db?.stop(); });
  beforeEach(async () => {
    await db.prisma.request.deleteMany();
    const [users, brands, divisions] = await Promise.all([db.prisma.user.findMany(), db.prisma.brand.findMany(), db.prisma.division.findMany()]);
    ctx = { users, brands, divisions };
  });

  const reqs = (rows: Record<string, string>[]) => parseRequestRows("requests", rows, ctx, REQ_HEADERS).records;

  it("inserts requests and event chains; second run is idempotent", async () => {
    const records = reqs([reqRow({ Requester: "Rio", Designer: "Irshyad" }), reqRow({ Task: "B", Progress: "Requested", Designer: "" }), reqRow({ Task: "C", Progress: "On Progress" })]);
    const r1 = await applyImport(db.prisma, records);
    expect(r1.inserted).toBe(3);
    expect(r1.alreadyImported).toEqual({});
    expect(await db.prisma.request.count()).toBe(3);
    const done = await db.prisma.request.findFirstOrThrow({ where: { title: "Banner Promo" }, include: { statusEvents: { orderBy: { at: "asc" } } } });
    expect(done.statusEvents).toHaveLength(4);
    expect(done.statusEvents.at(-1)!.to).toBe("DONE");
    expect(done.statusEvents.at(-1)!.at.toISOString()).toBe("2026-06-03T17:00:00.000Z");
    expect(await db.prisma.statusEvent.count()).toBe(4 + 1 + 2);

    const r2 = await applyImport(db.prisma, records);
    expect(r2.inserted).toBe(0);
    expect(r2.alreadyImported).toEqual({ requests: 3 });
    expect(await db.prisma.request.count()).toBe(3);
  });

  it("duplicate identical rows in one file insert both once", async () => {
    const records = reqs([reqRow({}), reqRow({})]);
    expect((await applyImport(db.prisma, records)).inserted).toBe(2);
    expect((await applyImport(db.prisma, records)).inserted).toBe(0);
    expect(await db.prisma.request.count()).toBe(2);
  });

  it("aborts before writing when the request type is missing", async () => {
    const records = reqs([reqRow({})]);
    const t = await db.prisma.requestType.findFirstOrThrow({ where: { name: "General Design" } });
    await db.prisma.requestType.update({ where: { id: t.id }, data: { name: "Renamed" } });
    await expect(applyImport(db.prisma, records)).rejects.toThrow(/General Design/);
    expect(await db.prisma.request.count()).toBe(0);
    await db.prisma.requestType.update({ where: { id: t.id }, data: { name: "General Design" } });
  });

  it("mid-run failure keeps earlier batches; re-run completes", async () => {
    const records = reqs([reqRow({ Task: "A" }), reqRow({ Task: "B" }), reqRow({ Task: "C" }), reqRow({ Task: "D" })]);
    records[2].assigneeId = "does-not-exist";
    await expect(applyImport(db.prisma, records, { batchSize: 2 })).rejects.toThrow(/batch 2/i);
    expect(await db.prisma.request.count()).toBe(2);
    records[2].assigneeId = null;
    const r = await applyImport(db.prisma, records, { batchSize: 2 });
    expect(r.inserted).toBe(2);
    expect(r.alreadyImported).toEqual({ requests: 2 });
    expect(await db.prisma.request.count()).toBe(4);
  });

  it("imported DONE request counts in KPI for its request month", async () => {
    const records = parseRequestRows("socmed", [socRow({ "Otomatis Request Date": "10/5/2026", Deadline: "10/7/2026", "Jumlah Output": "3" })], ctx, SOC_HEADERS).records;
    await applyImport(db.prisma, records);
    const fadli = await db.prisma.user.findFirstOrThrow({ where: { name: "Fadli" } });
    const kreqs = await loadKpiRequests(db.prisma, ["2026-10"]);
    const k = computeKpi(kreqs, { id: fadli.id, jobRole: fadli.jobRole }, "2026-10", { role: "DESIGNER", targetTasks: 50 });
    expect(k.tasksDone).toBe(1);
    expect(k.totalOutputs).toBe(3);
  });

  it("request-month rule: request 09-30, DONE with deadline 10-02 counts in 2026-09 not 2026-10", async () => {
    const records = parseRequestRows("socmed", [socRow({ "Otomatis Request Date": "9/30/2026", Deadline: "10/2/2026" })], ctx, SOC_HEADERS).records;
    await applyImport(db.prisma, records);
    const fadli = await db.prisma.user.findFirstOrThrow({ where: { name: "Fadli" } });
    const kreqs = await loadKpiRequests(db.prisma, ["2026-09", "2026-10"]);
    const kpi = (m: string) => computeKpi(kreqs, { id: fadli.id, jobRole: fadli.jobRole }, m, { role: "DESIGNER", targetTasks: 50 });
    expect(kpi("2026-09").tasksDone).toBe(1);
    expect(kpi("2026-10").tasksDone).toBe(0);
  });
});
