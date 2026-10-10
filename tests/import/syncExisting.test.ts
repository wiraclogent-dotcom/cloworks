import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { seed } from "../../prisma/seedCore";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { parseRequestRows } from "@/lib/import/parseRequests";
import { applyImport } from "@/lib/import/applyImport";
import { applySync, planSync } from "@/lib/import/syncExisting";
import { reqRow, socRow, REQ_HEADERS, SOC_HEADERS } from "./fixtures";

describe("sync of already imported rows", () => {
  let db: TestDb;
  let ctx: Parameters<typeof parseRequestRows>[2];
  let names: Map<string, string>;
  beforeAll(async () => {
    db = await createTestDb();
    await seed(db.prisma);
  });
  afterAll(async () => { await db?.stop(); });
  beforeEach(async () => {
    await db.prisma.request.deleteMany();
    const [users, brands, divisions] = await Promise.all([db.prisma.user.findMany(), db.prisma.brand.findMany(), db.prisma.division.findMany()]);
    ctx = { users, brands, divisions };
    names = new Map(users.map((u) => [u.id, u.name]));
  });

  const reqs = (rows: Record<string, string>[]) => parseRequestRows("requests", rows, ctx, REQ_HEADERS).records;
  const socs = (rows: Record<string, string>[]) => parseRequestRows("socmed", rows, ctx, SOC_HEADERS).records;
  const sync = async (records: ReturnType<typeof reqs>) => {
    const plan = await planSync(db.prisma, db.workspaceId, records, names);
    await applySync(db.prisma, plan);
    return plan;
  };

  it("moves status forward with events, fills the designer, and is a no-op on re-run", async () => {
    await applyImport(db.prisma, db.workspaceId, reqs([reqRow({ Progress: "Requested", Designer: "", "Jumlah Output": "" })]));
    const newer = reqs([reqRow({ Progress: "Done", Designer: "Irshyad", "Jumlah Output": "3", "Design Folder": "https://t.ly/abc" })]);
    const plan = await sync(newer);
    expect(plan.updates).toHaveLength(1);
    const r = await db.prisma.request.findFirstOrThrow({ include: { statusEvents: { orderBy: { at: "asc" } }, assignee: true } });
    expect(r.status).toBe("DONE");
    expect(r.assignee?.name).toBe("Irsyad");
    expect(r.outputCount).toBe(3);
    expect(r.designFolderUrl).toBe("https://t.ly/abc");
    expect(r.statusEvents.map((e) => e.to)).toEqual(["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE"]);
    expect((await sync(newer)).updates).toHaveLength(0);
  });

  it("never moves status back, never replaces a designer, keeps outputs when the sheet is blank", async () => {
    await applyImport(db.prisma, db.workspaceId, reqs([reqRow({ Progress: "Requested", Designer: "Fadli" })]));
    const r0 = await db.prisma.request.findFirstOrThrow();
    await db.prisma.request.update({ where: { id: r0.id }, data: { status: "FIRST_LOOK", outputCount: 5 } });
    const plan = await sync(reqs([reqRow({ Progress: "On Progress", Designer: "Irshyad", "Jumlah Output": "" })]));
    expect(plan.updates).toHaveLength(0);
    expect(plan.statusKept).toHaveLength(1);
    const r = await db.prisma.request.findFirstOrThrow({ include: { assignee: true } });
    expect(r.status).toBe("FIRST_LOOK");
    expect(r.assignee?.name).toBe("Fadli");
    expect(r.outputCount).toBe(5);
  });

  it("updates SocMed flags and published link, keeps other fields, records a deadline move", async () => {
    await applyImport(db.prisma, db.workspaceId, socs([socRow({ Upload: "FALSE" })]));
    const r0 = await db.prisma.request.findFirstOrThrow();
    await db.prisma.request.update({ where: { id: r0.id }, data: { fields: { ...(r0.fields as object), custom: "kept" } } });
    await sync(socs([socRow({ Upload: "TRUE", "Link Upload": "https://www.tiktok.com/@x/video/1", Deadline: "10/5/2026" })]));
    const r = await db.prisma.request.findFirstOrThrow({ include: { deadlineEvents: true } });
    expect(r.fields).toMatchObject({ upload: true, publishedUrl: "https://www.tiktok.com/@x/video/1", custom: "kept", platform: "TikTok" });
    expect(r.deadlineEvents).toHaveLength(1);
    expect(r.originalDeadline?.toISOString()).toBe(r0.deadline?.toISOString());
  });
});
