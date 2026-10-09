import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
const admin = { id: "a", appRole: "ADMIN" as const, jobRole: "OTHER" as const, workspaceId: "clogent", mustChangePassword: false };
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: async () => admin, dbFor: () => db.prisma }));

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
});
