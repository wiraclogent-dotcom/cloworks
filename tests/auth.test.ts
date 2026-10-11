import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolveUser } from "@/lib/import/aliases";
import { emailDomainOf, resolveSignIn, isTrustedIdentity, decideSignIn } from "@/lib/signin";
import { refreshJwt, loadActiveUser, requireUserWith, bindSignInToken } from "@/lib/session-core";
import { authenticateWithPassword } from "@/lib/passwordAuth";
import { hashPassword } from "@/lib/password";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("emailDomainOf", () => {
  it("returns the lowercased domain of a well-formed address", () => {
    expect(emailDomainOf("Wira@CLOGENT.co.id")).toBe("clogent.co.id");
    expect(emailDomainOf(" a@sub.clogent.co.id ")).toBe("sub.clogent.co.id");
  });
  it("returns null for malformed input", () => {
    expect(emailDomainOf("")).toBeNull();
    expect(emailDomainOf("clogent.co.id")).toBeNull();
    expect(emailDomainOf("a@b@clogent.co.id")).toBeNull();
    expect(emailDomainOf("@clogent.co.id")).toBeNull();
    expect(emailDomainOf("a@")).toBeNull();
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
    await p.user.create({ data: { email: "fadli@gmail.com", name: "Fadli", fullName: "Fadli", appRole: "CREATIVE" } });
  });
  afterAll(async () => {
    await db?.stop();
  });

  it("links existing user by email (case-insensitive)", async () => {
    const r = await resolveSignIn(db.prisma, { email: "Wira.Budi@Clogent.co.id" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.appRole).toBe("ADMIN");
      expect(r.created).toBe(false);
    }
  });
  it("rejects inactive users", async () => {
    const r = await resolveSignIn(db.prisma, { email: "gone@clogent.co.id" });
    expect(r).toEqual({ ok: false, reason: "inactive" });
  });
  it("refuses an unknown email whose domain is no workspace's email domain", async () => {
    expect(await resolveSignIn(db.prisma, { email: "someone@gmail.com" })).toEqual({ ok: false, reason: "not-allowed" });
    expect((await resolveSignIn(db.prisma, { email: "x@evil-clogent.co.id" })).ok).toBe(false);
    expect((await resolveSignIn(db.prisma, { email: "x@sub.clogent.co.id" })).ok).toBe(false);
    expect((await resolveSignIn(db.prisma, { email: "a@b@clogent.co.id" })).ok).toBe(false);
    expect(await db.prisma.user.count({ where: { email: "someone@gmail.com" } })).toBe(0);
  });
  it("an existing User signs in whatever their email domain", async () => {
    const r = await resolveSignIn(db.prisma, { email: "Fadli@gmail.com" });
    expect(r.ok && !r.created && r.user.appRole).toBe("CREATIVE");
  });
  it("does not let an outside address claim a roster row by alias or name", async () => {
    const r1 = await resolveSignIn(db.prisma, { email: "rina.p@gmail.com", name: "Rina" });
    expect(r1).toEqual({ ok: false, reason: "not-allowed" });
    const row = await db.prisma.user.findFirst({ where: { name: "Rina", fullName: "Rina Putri" } });
    expect(row?.email).toBeNull();
    expect(row?.appRole).toBe("CREATIVE");
  });
  it("creates the user in the workspace whose emailDomain matches (case-insensitive)", async () => {
    await db.raw.workspace.create({ data: { id: "ws-partner", name: "Partner", slug: "partner", emailDomain: "Partner.Test" } });
    const r = await resolveSignIn(db.raw, { email: "Newbie@partner.test", name: "Newbie" });
    expect(r.ok && r.created && r.user.workspaceId).toBe("ws-partner");
  });
  it("same-domain local-part equal to alias does not link either", async () => {
    const r = await resolveSignIn(db.prisma, { email: "rina.p@clogent.co.id" });
    expect(r.ok && r.created && r.user.appRole).toBe("REQUESTER");
  });
  it("creates a REQUESTER for a new permitted email, once", async () => {
    const a = await resolveSignIn(db.prisma, { email: "New.Person@clogent.co.id", name: "New Person" });
    const b = await resolveSignIn(db.prisma, { email: "new.person@clogent.co.id", name: "New Person" });
    expect(a.ok && a.created && a.user.appRole).toBe("REQUESTER");
    expect(b.ok && !b.created && b.user.id).toBe(a.ok ? a.user.id : "");
    expect(await db.prisma.user.count({ where: { email: "new.person@clogent.co.id" } })).toBe(1);
  });
});

describe("isTrustedIdentity", () => {
  const env = { AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: "tenant-1" };
  it("google requires email_verified === true", () => {
    expect(isTrustedIdentity("google", { email_verified: true }, env)).toBe(true);
    expect(isTrustedIdentity("google", { email_verified: false }, env)).toBe(false);
    expect(isTrustedIdentity("google", {}, env)).toBe(false);
    expect(isTrustedIdentity("google", { email_verified: "true" }, env)).toBe(false);
  });
  it("entra requires tid to equal configured tenant", () => {
    expect(isTrustedIdentity("microsoft-entra-id", { tid: "tenant-1" }, env)).toBe(true);
    expect(isTrustedIdentity("microsoft-entra-id", { tid: "other" }, env)).toBe(false);
    expect(isTrustedIdentity("microsoft-entra-id", {}, env)).toBe(false);
  });
  it("entra fails closed when tenant env missing/empty", () => {
    expect(isTrustedIdentity("microsoft-entra-id", { tid: "tenant-1" }, {})).toBe(false);
    expect(isTrustedIdentity("microsoft-entra-id", { tid: "" }, { AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: "" })).toBe(false);
  });
  it("unknown provider denied", () => {
    expect(isTrustedIdentity("github", { email_verified: true }, env)).toBe(false);
  });
});

describe("decideSignIn + session", () => {
  let db: TestDb;
  const env = { AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: "t1" };
  beforeAll(async () => {
    db = await createTestDb();
    await db.prisma.user.create({ data: { email: "g@gmail.com", name: "G", fullName: "G" } });
  });
  afterAll(async () => {
    await db?.stop();
  });

  it("unverified google email rejected; verified accepted", async () => {
    const bad = await decideSignIn(db.prisma, "google", { email: "a@clogent.co.id", email_verified: false }, env);
    expect(bad.ok).toBe(false);
    const good = await decideSignIn(db.prisma, "google", { email: "a@clogent.co.id", email_verified: true }, env);
    expect(good.ok).toBe(true);
  });
  it("entra: wrong tid or missing env rejected; right tid accepted", async () => {
    expect((await decideSignIn(db.prisma, "microsoft-entra-id", { email: "b@clogent.co.id", tid: "x" }, env)).ok).toBe(false);
    expect((await decideSignIn(db.prisma, "microsoft-entra-id", { email: "b@clogent.co.id", tid: "t1" }, {})).ok).toBe(false);
    expect((await decideSignIn(db.prisma, "microsoft-entra-id", { email: "b@clogent.co.id", tid: "t1" }, env)).ok).toBe(true);
  });
  it("an existing gmail User signs in through Google; an unknown gmail address is refused", async () => {
    expect((await decideSignIn(db.prisma, "google", { email: "G@gmail.com", email_verified: true }, env)).ok).toBe(true);
    expect(await decideSignIn(db.prisma, "google", { email: "stranger@gmail.com", email_verified: true }, env)).toEqual({ ok: false, reason: "not-allowed" });
  });

  it("an active gmail User with a password signs in without any allow-list row", async () => {
    const u = await db.prisma.user.create({
      data: { email: "solo@gmail.com", name: "Solo", fullName: "Solo", passwordHash: await hashPassword("correct horse battery") },
    });
    expect((await authenticateWithPassword(db.prisma, "Solo@Gmail.com", "correct horse battery"))?.id).toBe(u.id);
    expect(await authenticateWithPassword(db.prisma, "solo@gmail.com", "wrong password here")).toBeNull();
    await db.prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect(await authenticateWithPassword(db.prisma, "solo@gmail.com", "correct horse battery")).toBeNull();
  });
  it("loadActiveUser accepts any active user with matching claims", async () => {
    const u = await db.prisma.user.create({ data: { email: "anyone@partner.test", name: "Any", fullName: "Any", appRole: "CREATIVE" } });
    expect(await loadActiveUser(db.prisma, u.id, { loginEmail: "Anyone@Partner.test", pwv: 0 })).toMatchObject({ id: u.id, appRole: "CREATIVE" });
    expect(await loadActiveUser(db.prisma, u.id)).toMatchObject({ id: u.id });
    expect(await loadActiveUser(db.prisma, u.id, { loginEmail: "other@partner.test", pwv: 0 })).toBeNull();
    expect(await loadActiveUser(db.prisma, u.id, { loginEmail: "anyone@partner.test", pwv: 1 })).toBeNull();
  });

  it("jwt refresh: deactivated -> null; demotion reflected; missing -> null", async () => {
    const u = await db.prisma.user.create({ data: { email: "lead@clogent.co.id", name: "L", fullName: "L", appRole: "LEAD" } });
    const tok = { uid: u.id, loginEmail: "lead@clogent.co.id", appRole: "LEAD" as const, jobRole: "OTHER" as const };
    expect((await refreshJwt(db.prisma, { ...tok }))?.appRole).toBe("LEAD");
    await db.prisma.user.update({ where: { id: u.id }, data: { appRole: "REQUESTER" } });
    expect((await refreshJwt(db.prisma, { ...tok }))?.appRole).toBe("REQUESTER");
    await db.prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect(await refreshJwt(db.prisma, { ...tok })).toBeNull();
    expect(await refreshJwt(db.prisma, { ...tok, uid: "nope" })).toBeNull();
  });
  it("requireUser uses DB state and throws for no session / inactive / missing", async () => {
    const u = await db.prisma.user.create({ data: { email: "c@clogent.co.id", name: "C", fullName: "C", appRole: "CREATIVE" } });
    const sess = (id: string) => async () => ({ user: { id, loginEmail: "c@clogent.co.id", appRole: "ADMIN" } });
    const ok = await requireUserWith(sess(u.id), db.prisma);
    expect(ok).toEqual({ id: u.id, name: "C", appRole: "CREATIVE", jobRole: "OTHER", workspaceId: "clogent", mustChangePassword: false });
    await expect(requireUserWith(async () => null, db.prisma)).rejects.toThrow();
    await expect(requireUserWith(sess("nope"), db.prisma)).rejects.toThrow();
    await db.prisma.user.update({ where: { id: u.id }, data: { active: false } });
    await expect(requireUserWith(sess(u.id), db.prisma)).rejects.toThrow();
    expect(await loadActiveUser(db.prisma, u.id)).toBeNull();
  });
  it("revocation: deactivating an outside-domain user denies on the very next request", async () => {
    const u = await db.prisma.user.create({ data: { email: "outsider@gmail.com", name: "Out", fullName: "Out", appRole: "CREATIVE" } });
    const sess = async () => ({ user: { id: u.id, loginEmail: "outsider@gmail.com" } });
    expect((await requireUserWith(sess, db.prisma)).id).toBe(u.id);
    expect(await refreshJwt(db.prisma, { uid: u.id, loginEmail: "outsider@gmail.com" })).not.toBeNull();
    await db.prisma.user.update({ where: { id: u.id }, data: { active: false } });
    await expect(requireUserWith(sess, db.prisma)).rejects.toThrow();
    expect(await refreshJwt(db.prisma, { uid: u.id, loginEmail: "outsider@gmail.com" })).toBeNull();
  });
  it("revocation: a user with no email is denied", async () => {
    const u = await db.prisma.user.create({ data: { email: null, name: "NoMail", fullName: "NoMail" } });
    await expect(requireUserWith(async () => ({ user: { id: u.id } }), db.prisma)).rejects.toThrow();
    expect(await refreshJwt(db.prisma, { uid: u.id })).toBeNull();
    expect(await loadActiveUser(db.prisma, u.id)).toBeNull();
  });
  it("rebinding the email invalidates the old holder's token; claim must match; missing claim denied", async () => {
    const u = await db.prisma.user.create({ data: { email: "contractor@gmail.com", name: "X", fullName: "X" } });
    const tok = { uid: u.id, loginEmail: "Contractor@Gmail.com" };
    const sess = (loginEmail?: string) => async () => ({ user: { id: u.id, loginEmail } });
    expect(await refreshJwt(db.prisma, { ...tok })).not.toBeNull();
    expect((await requireUserWith(sess("contractor@gmail.com"), db.prisma)).id).toBe(u.id);
    expect(await refreshJwt(db.prisma, { uid: u.id })).toBeNull();
    await expect(requireUserWith(sess(undefined), db.prisma)).rejects.toThrow();
    await db.prisma.user.update({ where: { id: u.id }, data: { email: "newhire@gmail.com" } });
    expect(await refreshJwt(db.prisma, { ...tok })).toBeNull();
    await expect(requireUserWith(sess("contractor@gmail.com"), db.prisma)).rejects.toThrow();
    expect((await requireUserWith(sess("NewHire@gmail.com"), db.prisma)).id).toBe(u.id);
  });
  it("sign-in binds the loginEmail claim (normalised) and refresh keeps it valid", async () => {
    const u = await db.prisma.user.create({ data: { email: "bind@clogent.co.id", name: "Bind", fullName: "Bind", appRole: "LEAD" } });
    const tok = bindSignInToken({} as { uid?: string; loginEmail?: string }, u);
    expect(tok.loginEmail).toBe("bind@clogent.co.id");
    expect(tok.uid).toBe(u.id);
    expect(await refreshJwt(db.prisma, tok)).not.toBeNull();
  });
  it("an OAuth display name that collides with the roster gets the email local part as name and keeps the display name as fullName", async () => {
    const wira = await db.prisma.user.create({ data: { email: "wira.x@clogent.co.id", name: "Wira", fullName: "Wira Budi Prasetyo", appRole: "ADMIN", aliases: ["Wiro"] } });
    const a = await resolveSignIn(db.prisma, { email: "wira.second@clogent.co.id", name: "Wira Budi Prasetyo" });
    expect(a.ok && a.created).toBe(true);
    if (!a.ok) throw new Error("setup");
    expect(a.user.name).toBe("wira.second");
    expect(a.user.fullName).toBe("Wira Budi Prasetyo");
    const roster = await db.prisma.user.findMany({ select: { id: true, name: true, fullName: true, aliases: true, active: true } });
    expect(resolveUser("Wira", roster)).toBe(wira.id);
    expect(resolveUser("Wiro", roster)).toBe(wira.id);
  });
  it("numeric suffix when the local part collides as well, and a free display name is kept", async () => {
    await db.prisma.user.create({ data: { email: "pat@clogent.co.id", name: "Pat Roster", fullName: "Pat Roster", appRole: "CREATIVE" } });
    const a = await resolveSignIn(db.prisma, { email: "pat.roster@clogent.co.id", name: "Pat Roster" }); // local "pat.roster" collides with name
    expect(a.ok && a.user.name).toBe("pat.roster2");
    const b = await resolveSignIn(db.prisma, { email: "zed@clogent.co.id", name: "Zed Unique" });
    expect(b.ok && b.user.name).toBe("Zed Unique");
  });
});
