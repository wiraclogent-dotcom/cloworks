import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let adminId: string;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: adminId, name: "A", appRole: "ADMIN", jobRole: "OTHER", workspaceId: "clogent", mustChangePassword: false }),
  dbFor: () => db.prisma,
}));

import { saveRequestType } from "@/app/(app)/admin/lists/actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const FIELDS = [{ key: "platform", label: "Platform", type: "select", options: ["TikTok"], required: true }];

describe("saveRequestType", () => {
  let typeId: string;
  beforeAll(async () => {
    db = await createTestDb();
    adminId = (await db.prisma.user.create({ data: { email: "a@clogent.co.id", name: "A", fullName: "A", appRole: "ADMIN" } })).id;
    typeId = (await db.prisma.requestType.create({ data: { name: "Social", fieldSchema: FIELDS, active: false } })).id;
  });
  afterAll(async () => { await db?.stop(); });
  const type = () => db.prisma.requestType.findUniqueOrThrow({ where: { id: typeId } });

  it("never treats a missing field list as 'no fields'", async () => {
    const r = await saveRequestType(null, fd({ id: typeId, name: "Social" }));
    expect(r).toMatchObject({ ok: false, code: "VALIDATION", message: "The field list is missing. Reload the page and try again." });
    expect((await type()).fieldSchema).toEqual(FIELDS);
  });

  it("refuses a half-edited field list", async () => {
    const r = await saveRequestType(null, fd({ id: typeId, name: "Social", fieldSchemaInvalid: "1", fieldRows: "[]" }));
    expect(r).toMatchObject({ ok: false, code: "VALIDATION", message: "Fix the fields marked below first." });
    expect((await type()).fieldSchema).toEqual(FIELDS);
  });

  it("saves the fields and keeps the type archived (no Active checkbox any more)", async () => {
    const next = [...FIELDS, { key: "notes", label: "Notes", type: "text" }];
    const r = await saveRequestType(null, fd({ id: typeId, name: "Social", fieldSchema: JSON.stringify(next) }));
    expect(r).toMatchObject({ ok: true });
    expect(await type()).toMatchObject({ fieldSchema: next, active: false });
  });
});
