import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setIncludeKpiWith } from "@/lib/collab";
import { loadKpiRequests } from "@/lib/kpi/queries";
import { computeKpi } from "@/lib/kpi/metrics";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
const ids: Record<string, string> = {};
let reqId: string;
const actor = (k: string, appRole: "REQUESTER" | "CREATIVE" | "LEAD" | "ADMIN") => ({ id: ids[k], appRole });
const MONTH = "2026-10";

beforeAll(async () => {
  db = await createTestDb();
  const p = db.prisma;
  const mk = async (k: string, appRole: "REQUESTER" | "CREATIVE" | "LEAD" | "ADMIN") => {
    ids[k] = (await p.user.create({ data: { email: `${k}@clogent.co.id`, name: k, fullName: k, appRole, jobRole: "DESIGNER" } })).id;
  };
  await mk("req", "REQUESTER"); await mk("des", "CREATIVE"); await mk("lead", "LEAD"); await mk("adm", "ADMIN");
  const brand = await p.brand.create({ data: { name: "B" } });
  const div = await p.division.create({ data: { name: "D" } });
  const type = await p.requestType.create({ data: { name: "T" } });
  const r = await p.request.create({
    data: { title: "x", brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: ids.req, assigneeId: ids.des, status: "DONE", requestedAt: new Date("2026-10-05T03:00:00Z"), deadline: new Date("2026-10-20T00:00:00+07:00") },
  });
  reqId = r.id;
  await p.statusEvent.create({ data: { requestId: reqId, from: "FIRST_LOOK", to: "DONE", actorId: ids.des, at: new Date("2026-10-10T03:00:00Z") } });
});
afterAll(async () => { await db?.stop(); });

const tasksDone = async () => computeKpi(await loadKpiRequests(db.prisma, [MONTH]), { id: ids.des, jobRole: "DESIGNER" }, MONTH, null).tasksDone;

describe("setIncludeKpiWith", () => {
  it("is FORBIDDEN for requesters and creatives and changes nothing", async () => {
    for (const k of ["req", "des"] as const)
      expect(await setIncludeKpiWith(db.prisma, actor(k, k === "req" ? "REQUESTER" : "CREATIVE"), reqId, false)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: reqId } })).includeKpi).toBe(true);
  });
  it("returns NOT_FOUND for an unknown request", async () => {
    expect(await setIncludeKpiWith(db.prisma, actor("lead", "LEAD"), "nope", false)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
  it("lets leads and admins persist the flag, and the DONE request leaves and re-enters tasksDone", async () => {
    expect(await tasksDone()).toBe(1);
    expect(await setIncludeKpiWith(db.prisma, actor("lead", "LEAD"), reqId, false)).toEqual({ ok: true });
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: reqId } })).includeKpi).toBe(false);
    expect(await tasksDone()).toBe(0);
    expect(await setIncludeKpiWith(db.prisma, actor("adm", "ADMIN"), reqId, true)).toEqual({ ok: true });
    expect(await tasksDone()).toBe(1);
  });
});
