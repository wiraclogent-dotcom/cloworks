import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CLOGENT_WORKSPACE_ID, makeScoped } from "@/lib/db";
import { createTestDb, type TestDb } from "./helpers/testDb";

// Request.assigneeId is copied into the RequestAssignee join table (addedAt = requestedAt); requests with no
// assignee get no row. The old column stays until a later migration.
describe("migration 20261014120000_request_assignees", () => {
  let db: TestDb;
  let assignedId: string;
  let unassignedId: string;
  let assigneeId: string;
  let requestedAt: Date;
  beforeAll(async () => {
    db = await createTestDb({ upTo: "20261013180000_kpi_roster" });
    const r = db.raw;
    const ws = CLOGENT_WORKSPACE_ID;
    const requester = await r.user.create({ data: { name: "Req", fullName: "Req", email: "req@clogent.co.id", workspaceId: ws } });
    const assignee = await r.user.create({ data: { name: "Dim", fullName: "Dim", email: "dim@clogent.co.id", workspaceId: ws } });
    const brand = await r.brand.create({ data: { name: "B", workspaceId: ws } });
    const division = await r.division.create({ data: { name: "D", workspaceId: ws } });
    const type = await r.requestType.create({ data: { name: "T", workspaceId: ws } });
    const base = { brandId: brand.id, divisionId: division.id, typeId: type.id, requesterId: requester.id, workspaceId: ws };
    const assigned = await r.request.create({ data: { ...base, title: "Assigned", assigneeId: assignee.id } });
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
