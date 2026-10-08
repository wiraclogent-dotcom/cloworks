import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { seed } from "../../prisma/seedCore";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { runImport } from "@/lib/import/run";
import { parseArgs } from "@/lib/import/cliArgs";
import { loadKpiRequests } from "@/lib/kpi/queries";
import { computeKpi } from "@/lib/kpi/metrics";
import { buildFixtureWorkbook, DIMAS_LOG, DIMAS_SEPT } from "./xlsxFixtures";

let db: TestDb;
let fx: Awaited<ReturnType<typeof buildFixtureWorkbook>>;
beforeAll(async () => {
  db = await createTestDb();
  await seed(db.prisma);
  fx = await buildFixtureWorkbook();
});
afterAll(async () => { fx?.cleanup(); await db?.stop(); });
beforeEach(async () => { await db.prisma.request.deleteMany(); });

const run = (apply: boolean, log: (l: string) => void = () => {}) => runImport(db.prisma, { workbookPath: fx.file, apply }, { log });

describe("workbook import into a real database", () => {
  it("dry-run writes nothing and reports each source", async () => {
    const lines: string[] = [];
    expect(await run(false, (l) => lines.push(l))).toBeNull();
    expect(await db.prisma.request.count()).toBe(0);
    const out = lines.join("\n");
    expect(out).toMatch(/DRY-RUN/);
    for (const s of ["== requests ==", "== socmed ==", "== dimas =="]) expect(out).toContain(s);
    expect(out).toMatch(/Ibnu" x1/);
    expect(out).toMatch(/Completion dates are not in the sheet/);
    expect(out).toMatch(/Re-run caveat/);
    expect(out).toMatch(/04\/06\/2026 → 2026-06-04/);
  });

  it("apply: counts per source, Motion Support type, event chains, idempotent re-run", async () => {
    const r1 = await run(true);
    expect(r1!.inserted).toBe(6 + 4 + DIMAS_LOG.length);
    const bySource = async (s: string) => db.prisma.request.count({ where: { fields: { path: ["importSource"], equals: s } } });
    expect([await bySource("requests"), await bySource("socmed"), await bySource("dimas")]).toEqual([6, 4, DIMAS_LOG.length]);
    const motion = await db.prisma.requestType.findFirstOrThrow({ where: { name: "Motion Support" } });
    expect(await db.prisma.request.count({ where: { typeId: motion.id } })).toBe(DIMAS_LOG.length);
    const dimas = await db.prisma.user.findFirstOrThrow({ where: { name: "Dimas Pandu" } });
    const one = await db.prisma.request.findFirstOrThrow({ where: { title: "RIO 12 SEPT 1" }, include: { statusEvents: { orderBy: { at: "asc" } }, requester: true, brand: true } });
    expect(one.assigneeId).toBe(dimas.id);
    expect(one.requester.name).toBe("Robertino");
    expect(one.statusEvents.map((e) => e.to)).toEqual(["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE"]);
    expect(new Set(one.statusEvents.map((e) => e.at.toISOString())).size).toBe(1);
    expect(one.statusEvents.every((e) => e.actorId === dimas.id)).toBe(true);
    expect(await db.prisma.request.count({ where: { title: "MOTION DEMO" } })).toBe(3);

    const r2 = await run(true);
    expect(r2!.inserted).toBe(0);
    expect(r2!.alreadyImported).toEqual({ requests: 6, socmed: 4, dimas: DIMAS_LOG.length });
    expect(await db.prisma.request.count()).toBe(6 + 4 + DIMAS_LOG.length);
  });

  it("KPI proof: Dimas Pandu's DONE tasks for 2026-09 equal the September log rows", async () => {
    await run(true);
    const dimas = await db.prisma.user.findFirstOrThrow({ where: { name: "Dimas Pandu" } });
    const kreqs = await loadKpiRequests(db.prisma, ["2026-09", "2026-10"]);
    const kpi = (m: string) => computeKpi(kreqs, { id: dimas.id, jobRole: dimas.jobRole }, m, { role: "DESIGNER", targetTasks: 35 });
    expect(DIMAS_SEPT).toBe(6);
    expect(kpi("2026-09").tasksDone).toBe(DIMAS_SEPT);
    expect(kpi("2026-10").tasksDone).toBe(DIMAS_LOG.length - DIMAS_SEPT);
  });

  it("missing 'Motion Support' type aborts before any write, naming it (dry-run too)", async () => {
    const t = await db.prisma.requestType.findFirstOrThrow({ where: { name: "Motion Support" } });
    await db.prisma.requestType.update({ where: { id: t.id }, data: { name: "Renamed" } });
    try {
      await expect(run(true)).rejects.toThrow(/Motion Support/);
      await expect(run(false)).rejects.toThrow(/Motion Support/);
      expect(await db.prisma.request.count()).toBe(0);
    } finally {
      await db.prisma.requestType.update({ where: { id: t.id }, data: { name: "Motion Support" } });
    }
  });
});

describe("workbook mode lookup checks", () => {
  it("aborts naming every missing brand/division/user, in dry-run too, writing nothing", async () => {
    const p = db.prisma;
    const bw = await p.brand.findFirstOrThrow({ where: { name: "Bubble Wash" } });
    const sm = await p.division.findFirstOrThrow({ where: { name: "Social Media" } });
    const dm = await p.user.findFirstOrThrow({ where: { name: "Dimas Pandu" } });
    const wi = await p.user.findFirstOrThrow({ where: { name: "Wira" } });
    await p.brand.update({ where: { id: bw.id }, data: { name: "X1" } });
    await p.division.update({ where: { id: sm.id }, data: { name: "X2" } });
    await p.user.update({ where: { id: dm.id }, data: { name: "X3" } });
    await p.user.update({ where: { id: wi.id }, data: { name: "X4" } });
    try {
      for (const apply of [false, true]) {
        const err = await run(apply).then(() => null, (e: Error) => e.message);
        expect(err).toMatch(/Bubble Wash/);
        for (const n of ["division \"Social Media\"", "user \"Dimas Pandu\"", "user \"Wira\""]) expect(err).toContain(n);
      }
      expect(await p.request.count()).toBe(0);
    } finally {
      await p.brand.update({ where: { id: bw.id }, data: { name: "Bubble Wash" } });
      await p.division.update({ where: { id: sm.id }, data: { name: "Social Media" } });
      await p.user.update({ where: { id: dm.id }, data: { name: "Dimas Pandu" } });
      await p.user.update({ where: { id: wi.id }, data: { name: "Wira" } });
    }
  });
});

describe("CLI wiring for workbook mode", () => {
  it("parseArgs: .xlsx first arg selects workbook mode; dry-run by default", () => {
    expect(parseArgs(["m.xlsx"])).toEqual({ workbookPath: "m.xlsx", apply: false });
    expect(parseArgs(["M.XLSX", "--apply"])).toEqual({ workbookPath: "M.XLSX", apply: true });
    expect(parseArgs(["--apply", "m.xlsx"])).toEqual({ workbookPath: "m.xlsx", apply: true });
    expect(() => parseArgs(["m.xlsx", "x.csv"])).toThrow(/one file/i);
    expect(() => parseArgs(["a.csv", "m.xlsx"])).toThrow(/xlsx/i);
  });
  it("runImport(workbook): never applies without --apply; applies once with it", async () => {
    const apply = vi.fn(async () => ({ inserted: 0, alreadyImported: {} }));
    await runImport(db.prisma, { workbookPath: fx.file, apply: false }, { apply, log: () => {} });
    expect(apply).not.toHaveBeenCalled();
    await runImport(db.prisma, { workbookPath: fx.file, apply: true }, { apply, log: () => {} });
    expect(apply).toHaveBeenCalledTimes(1);
    expect((apply.mock.calls[0] as unknown as [unknown, unknown[]])[1]).toHaveLength(6 + 4 + DIMAS_LOG.length);
  });
  it("missing workbook file: clear error", async () => {
    await expect(runImport(db.prisma, { workbookPath: "/nope/missing.xlsx", apply: false }, { log: () => {} })).rejects.toThrow(/File not found/);
  });
});
