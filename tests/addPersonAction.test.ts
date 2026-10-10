import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
const admin = { id: "a", appRole: "ADMIN" as const, jobRole: "OTHER" as const, workspaceId: "clogent", mustChangePassword: false };
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: async () => admin, dbFor: () => db.prisma }));

const failPassword = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/admin")>();
  return {
    ...real,
    setUserPassword: (...a: Parameters<typeof real.setUserPassword>) => {
      if (failPassword.on) throw new real.AdminError("VALIDATION", "That password is too common");
      return real.setUserPassword(...a);
    },
  };
});

import { addPerson } from "@/app/(app)/admin/users/actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries({ appRole: "REQUESTER", jobRole: "OTHER", ...o })) f.set(k, v); return f; };
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db?.stop(); });

describe("addPerson with email and password", () => {
  it("creates the person with a login email and a temporary password flagged for change", async () => {
    const r = await addPerson(null, fd({ name: "Tia", email: "Tia@Clogent.co.id", password: "temporary-pass-1" }));
    expect(r).toMatchObject({ ok: true });
    expect(r?.values.password ?? "").toBe("");
    const u = await db.prisma.user.findFirstOrThrow({ where: { name: "Tia" } });
    expect(u.email).toBe("tia@clogent.co.id");
    expect(u.mustChangePassword).toBe(true);
    expect(u.passwordHash).toBeTruthy();
  });
  it("a password without an email is a VALIDATION error and creates nothing", async () => {
    const r = await addPerson(null, fd({ name: "Nobody", password: "temporary-pass-1" }));
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(r?.values.password ?? "").toBe("");
    expect(await db.prisma.user.count({ where: { name: "Nobody" } })).toBe(0);
  });
  it("a too-short password is refused before anything is created", async () => {
    const r = await addPerson(null, fd({ name: "Shorty", email: "shorty@clogent.co.id", password: "short" }));
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await db.prisma.user.count({ where: { name: "Shorty" } })).toBe(0);
  });
  it("still works with neither email nor password", async () => {
    expect(await addPerson(null, fd({ name: "Plain" }))).toMatchObject({ ok: true });
    expect((await db.prisma.user.findFirstOrThrow({ where: { name: "Plain" } })).email).toBeNull();
  });
  it("a malformed email is a VALIDATION error and creates nothing", async () => {
    const r = await addPerson(null, fd({ name: "Badmail", email: "not-an-email" }));
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await db.prisma.user.count({ where: { name: "Badmail" } })).toBe(0);
  });
  it("an email already used as a login is refused and creates nothing", async () => {
    const r = await addPerson(null, fd({ name: "Dupe", email: "TIA@clogent.co.id" }));
    expect(r).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await db.prisma.user.count({ where: { name: "Dupe" } })).toBe(0);
  });
  it("a later-step failure keeps the person and says so, with punctuation", async () => {
    failPassword.on = true;
    try {
      const r = await addPerson(null, fd({ name: "Partial", email: "partial@clogent.co.id", password: "temporary-pass-1" }));
      expect(r).toMatchObject({ ok: false });
      expect(r?.message).toBe("Partial was added, but that password is too common. Finish with Edit in their row.");
      expect(await db.prisma.user.count({ where: { name: "Partial" } })).toBe(1);
    } finally { failPassword.on = false; }
  });
});
