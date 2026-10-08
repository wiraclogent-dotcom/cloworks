import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isAllowedEmail, resolveSignIn } from "@/lib/signin";
import { createTestDb, type TestDb } from "./helpers/testDb";

const D = "clogent.co.id";

describe("isAllowedEmail", () => {
  it("accepts exact domain, case-insensitive", () => {
    expect(isAllowedEmail("wira.budi@clogent.co.id", D, [])).toBe(true);
    expect(isAllowedEmail("Wira@CLOGENT.co.id", D, [])).toBe(true);
    expect(isAllowedEmail("a@clogent.co.id", "Clogent.CO.id", [])).toBe(true);
  });
  it("rejects lookalike domains", () => {
    expect(isAllowedEmail("a@evil.com.clogent.co.id", D, [])).toBe(false);
    expect(isAllowedEmail("x@evil-clogent.co.id", D, [])).toBe(false);
    expect(isAllowedEmail("x@sub.clogent.co.id", D, [])).toBe(false);
    expect(isAllowedEmail("clogent.co.id", D, [])).toBe(false);
    expect(isAllowedEmail("a@b@clogent.co.id", D, [])).toBe(false);
  });
  it("rejects unlisted outside address, accepts listed (case-insensitive)", () => {
    expect(isAllowedEmail("someone@gmail.com", D, ["fadli@gmail.com"])).toBe(false);
    expect(isAllowedEmail("Fadli@gmail.com", D, ["fadli@gmail.com"])).toBe(true);
    expect(isAllowedEmail("fadli@gmail.com", D, ["Fadli@Gmail.com"])).toBe(true);
  });
  it("rejects empty input", () => {
    expect(isAllowedEmail("", D, [])).toBe(false);
  });
});

describe("resolveSignIn", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    await p.user.create({
      data: { email: "wira.budi@clogent.co.id", name: "Wira", fullName: "Wira Budi", appRole: "ADMIN", jobRole: "OTHER" },
    });
    await p.user.create({
      data: { email: "gone@clogent.co.id", name: "Gone", fullName: "Gone", active: false },
    });
    await p.user.create({
      data: { email: null, name: "Rina", fullName: "Rina Putri", aliases: ["rina.p"], jobRole: "DESIGNER", appRole: "CREATIVE" },
    });
    await p.user.create({ data: { email: null, name: "Dup", fullName: "Dup A", aliases: ["dup"] } });
    await p.user.create({ data: { email: null, name: "dup", fullName: "Dup B" } });
    await p.allowedEmail.create({ data: { email: "fadli@gmail.com" } });
    await p.user.create({ data: { email: "fadli@gmail.com", name: "Fadli", fullName: "Fadli", appRole: "CREATIVE" } });
  });
  afterAll(async () => {
    await db?.stop();
  });

  it("links existing user by email (case-insensitive)", async () => {
    const r = await resolveSignIn(db.prisma, { email: "Wira.Budi@Clogent.co.id" }, D);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.appRole).toBe("ADMIN");
      expect(r.created).toBe(false);
    }
  });
  it("rejects inactive users", async () => {
    const r = await resolveSignIn(db.prisma, { email: "gone@clogent.co.id" }, D);
    expect(r).toEqual({ ok: false, reason: "inactive" });
  });
  it("rejects disallowed domains", async () => {
    expect((await resolveSignIn(db.prisma, { email: "someone@gmail.com" }, D)).ok).toBe(false);
    expect((await resolveSignIn(db.prisma, { email: "x@evil-clogent.co.id" }, D)).ok).toBe(false);
  });
  it("accepts allow-listed outside email and links its user", async () => {
    const r = await resolveSignIn(db.prisma, { email: "Fadli@gmail.com" }, D);
    expect(r.ok && r.user.appRole).toBe("CREATIVE");
  });
  it("links an unclaimed user by alias on email local-part and stores email", async () => {
    const r = await resolveSignIn(db.prisma, { email: "rina.p@clogent.co.id" }, D);
    expect(r.ok && r.user.name).toBe("Rina");
    const row = await db.prisma.user.findFirst({ where: { name: "Rina" } });
    expect(row?.email).toBe("rina.p@clogent.co.id");
  });
  it("does not alias-link when ambiguous; creates REQUESTER instead", async () => {
    const r = await resolveSignIn(db.prisma, { email: "dup@clogent.co.id", name: "Dup" }, D);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.created).toBe(true);
      expect(r.user.appRole).toBe("REQUESTER");
    }
  });
  it("creates a REQUESTER for a new permitted email, once", async () => {
    const a = await resolveSignIn(db.prisma, { email: "New.Person@clogent.co.id", name: "New Person" }, D);
    const b = await resolveSignIn(db.prisma, { email: "new.person@clogent.co.id", name: "New Person" }, D);
    expect(a.ok && a.created && a.user.appRole).toBe("REQUESTER");
    expect(b.ok && !b.created && b.user.id).toBe(a.ok ? a.user.id : "");
    expect(await db.prisma.user.count({ where: { email: "new.person@clogent.co.id" } })).toBe(1);
  });
});
