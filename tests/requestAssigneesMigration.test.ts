import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CLOGENT_WORKSPACE_ID, makeScoped } from "@/lib/db";
import { createTestDb, type TestDb } from "./helpers/testDb";

// Request.assigneeId is copied into the RequestAssignee join table (addedAt = requestedAt); requests with no
// assignee get no row. The drop migration (20261014130000) then removes the old column and keeps the rows.
describe("migrations 20261014120000_request_assignees + 20261014130000_drop_request_assignee_id", () => {
  let db: TestDb;
  let assignedId: string;
  let unassignedId: string;
  let assigneeId: string;
  let requestedAt: Date;
  beforeAll(async () => {
    db = await createTestDb({ upTo: "20261013180000_kpi_roster" });
    const r = db.raw;
    const ws = CLOGENT_WORKSPACE_ID;
    // Users by SQL: the current client writes User columns that later migrations add (e.g. boardBackground).
    const requester = { id: "u-req" };
    const assignee = { id: "u-dim" };
    await r.$executeRaw`INSERT INTO "User" ("id", "name", "fullName", "email", "workspaceId") VALUES (${requester.id}, 'Req', 'Req', 'req@clogent.co.id', ${ws}), (${assignee.id}, 'Dim', 'Dim', 'dim@clogent.co.id', ${ws})`;
    const brand = await r.brand.create({ data: { name: "B", workspaceId: ws } });
    // Division by SQL too: later migrations add columns (marketing calendar colour, order) the old table lacks.
    const division = { id: "d-1" };
    await r.$executeRaw`INSERT INTO "Division" ("id", "name", "workspaceId") VALUES (${division.id}, 'D', ${ws})`;
    const type = await r.requestType.create({ data: { name: "T", workspaceId: ws } });
    const base = { brandId: brand.id, divisionId: division.id, typeId: type.id, requesterId: requester.id, workspaceId: ws };
    // The generated client no longer knows Request.assigneeId, so set it with SQL while the old column still exists.
    const assigned = await r.request.create({ data: { ...base, title: "Assigned" } });
    await r.$executeRaw`UPDATE "Request" SET "assigneeId" = ${assignee.id} WHERE "id" = ${assigned.id}`;
    const unassigned = await r.request.create({ data: { ...base, title: "Unassigned" } });
    assigneeId = assignee.id;
    assignedId = assigned.id;
    unassignedId = unassigned.id;
    requestedAt = assigned.requestedAt;
    await db.migrate();
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it("backfills one row per assigned request and none for unassigned ones", async () => {
    const rows = await db.raw.requestAssignee.findMany();
    expect(rows).toEqual([
      { requestId: assignedId, userId: assigneeId, addedAt: requestedAt, workspaceId: CLOGENT_WORKSPACE_ID },
    ]);
    expect(rows.some((row) => row.requestId === unassignedId)).toBe(false);
  });

  it("drops the legacy Request.assigneeId column, its index and its foreign key", async () => {
    const cols = await db.raw.$queryRaw<unknown[]>`SELECT 1 FROM information_schema.columns WHERE table_name = 'Request' AND column_name = 'assigneeId'`;
    expect(cols).toHaveLength(0);
    const idx = await db.raw.$queryRaw<unknown[]>`SELECT 1 FROM pg_indexes WHERE indexname = 'Request_assigneeId_idx'`;
    expect(idx).toHaveLength(0);
    const fk = await db.raw.$queryRaw<unknown[]>`SELECT 1 FROM pg_constraint WHERE conname = 'Request_assigneeId_fkey'`;
    expect(fk).toHaveLength(0);
  });

  it("is scoped to the workspace", async () => {
    expect(await db.prisma.requestAssignee.count()).toBe(1);
    await db.raw.workspace.create({ data: { id: "other", name: "Other", slug: "other" } });
    expect(await makeScoped(db.raw, "other").requestAssignee.count()).toBe(0);
  });

  it("cascades when the request is deleted", async () => {
    await db.raw.request.delete({ where: { id: assignedId } });
    expect(await db.raw.requestAssignee.count()).toBe(0);
  });
});
