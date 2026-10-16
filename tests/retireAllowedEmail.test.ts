import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";

// AllowedEmail rows become Invites (one per address with no User of the same email in the same workspace) and the
// table is dropped. Rows are inserted with raw SQL because the Prisma client no longer knows the AllowedEmail model.
describe("migration 20261011130000_retire_allowed_email", () => {
  let db: TestDb;
  let adminId: string;
  let inactiveAdminId: string;
  beforeAll(async () => {
    db = await createTestDb({ upTo: "20261011121000_applicant_join_intent" });
    const r = db.raw;
    await r.$executeRaw`INSERT INTO "Workspace" (id, name, slug) VALUES ('ws2', 'Two', 'two'), ('ws3', 'Three', 'three')`;
    // clogent: an older inactive admin and the oldest ACTIVE admin (who must be picked), plus a newer active admin.
    await r.$executeRaw`INSERT INTO "User" (id, email, name, "fullName", "appRole", active, "workspaceId") VALUES
      ('u-old-inactive', 'old@clogent.co.id', 'Old', 'Old', 'ADMIN', false, 'clogent')`;
    await r.$executeRaw`INSERT INTO "User" (id, email, name, "fullName", "appRole", active, "workspaceId") VALUES
      ('u-admin', 'boss@clogent.co.id', 'Boss', 'Boss', 'ADMIN', true, 'clogent')`;
    await r.$executeRaw`INSERT INTO "User" (id, email, name, "fullName", "appRole", active, "workspaceId") VALUES
      ('u-admin2', 'boss2@clogent.co.id', 'Boss2', 'Boss2', 'ADMIN', true, 'clogent')`;
    await r.$executeRaw`INSERT INTO "User" (id, email, name, "fullName", "appRole", "workspaceId") VALUES
      ('u-member', 'member@gmail.com', 'Member', 'Member', 'CREATIVE', 'clogent')`;
    // ws2: only an inactive admin -> fallback. ws3: no admin at all -> its rows are skipped.
    await r.$executeRaw`INSERT INTO "User" (id, email, name, "fullName", "appRole", active, "workspaceId") VALUES
      ('u-ws2-admin', 'a@two.test', 'A2', 'A2', 'ADMIN', false, 'ws2')`;
    await r.$executeRaw`INSERT INTO "AllowedEmail" (id, email, note, "workspaceId") VALUES
      ('ae-free', 'free@gmail.com', NULL, 'clogent'),
      ('ae-member', 'Member@Gmail.com', 'login for Member', 'clogent'),
      ('ae-ws2', 'guest@partner.com', NULL, 'ws2'),
      ('ae-ws3', 'lost@partner.com', NULL, 'ws3')`;
    adminId = "u-admin";
    inactiveAdminId = "u-ws2-admin";
    await db.migrate();
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it("turns an AllowedEmail with no User into a Requester invite that must be resent", async () => {
    const invites = await db.raw.invite.findMany({ where: { email: "free@gmail.com" } });
    expect(invites).toHaveLength(1);
    const inv = invites[0];
    expect(inv).toMatchObject({ workspaceId: "clogent", appRole: "REQUESTER", jobRole: "OTHER", invitedById: adminId, acceptedAt: null, revokedAt: null });
    expect(inv.tokenHash).toBe("migrated:ae-free");
    expect(inv.tokenHash.startsWith("migrated:")).toBe(true);
    const days = (inv.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("makes no invite for an address that already belongs to a User (case-insensitive)", async () => {
    expect(await db.raw.invite.count({ where: { email: { equals: "member@gmail.com", mode: "insensitive" } } })).toBe(0);
  });

  it("falls back to the oldest admin when a workspace has no active admin, and skips workspaces with no admin", async () => {
    const ws2 = await db.raw.invite.findMany({ where: { workspaceId: "ws2" } });
    expect(ws2.map((i) => [i.email, i.invitedById])).toEqual([["guest@partner.com", inactiveAdminId]]);
    expect(await db.raw.invite.count({ where: { workspaceId: "ws3" } })).toBe(0);
    expect(await db.raw.invite.count()).toBe(2);
  });

  it("drops the AllowedEmail table", async () => {
    const rows = await db.raw.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'AllowedEmail'`;
    expect(Number(rows[0].n)).toBe(0);
  });
});
