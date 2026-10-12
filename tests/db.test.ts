import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeScoped } from "@/lib/db";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("test database helper", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db?.stop();
  });

  it("creates a Brand row and reads it back", async () => {
    const created = await db.prisma.brand.create({ data: { name: "Clogent" } });
    const found = await db.prisma.brand.findUnique({ where: { id: created.id } });
    expect(found?.name).toBe("Clogent");
  });

  it("scopes Invite but not Applicant", async () => {
    await db.raw.workspace.create({ data: { id: "other", name: "Other", slug: "other" } });
    const admin = await db.raw.user.create({
      data: { name: "A", fullName: "A", email: "a@clogent.co.id", workspaceId: "clogent" },
    });
    await db.raw.invite.create({
      data: {
        email: "x@clogent.co.id", appRole: "REQUESTER", jobRole: "OTHER", tokenHash: "h1",
        invitedById: admin.id, expiresAt: new Date(Date.now() + 1000), workspaceId: "clogent",
      },
    });
    await db.raw.applicant.create({ data: { email: "ap@example.com", name: "Ap" } });

    const other = makeScoped(db.raw, "other");
    expect(await other.invite.findFirst()).toBeNull();
    expect(await db.prisma.invite.findFirst()).not.toBeNull();
    expect(await other.applicant.findFirst({ where: { email: "ap@example.com" } })).not.toBeNull();
  });
});
