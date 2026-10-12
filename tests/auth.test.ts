import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolveSignIn, isTrustedIdentity, decideSignIn } from "@/lib/signin";
import { refreshJwt, loadActiveUser, requireUserWith, bindSignInToken, bindApplicantToken, loadSessionApplicant } from "@/lib/session-core";
import { authenticateWithPassword } from "@/lib/passwordAuth";
import { hashPassword } from "@/lib/password";
import { createTestDb, type TestDb } from "./helpers/testDb";

type Tok = { uid?: string; aid?: string; loginEmail?: string; pwv?: number; appRole?: "ADMIN" | "REQUESTER"; jobRole?: "OTHER" };

describe("resolveSignIn (never creates anything)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    const p = db.raw;
    await p.user.create({
      data: { email: "wira.budi@clogent.co.id", name: "Wira", fullName: "Wira Budi", appRole: "ADMIN", jobRole: "OTHER", workspaceId: "clogent" },
    });
    await p.user.create({ data: { email: "gone@clogent.co.id", name: "Gone", fullName: "Gone", active: false, workspaceId: "clogent" } });
    await p.user.create({
      data: { email: null, name: "Rina", fullName: "Rina Putri", aliases: ["rina.p"], jobRole: "DESIGNER", appRole: "CREATIVE", workspaceId: "clogent" },
    });
    await p.user.create({ data: { email: "fadli@gmail.com", name: "Fadli", fullName: "Fadli", appRole: "CREATIVE", workspaceId: "clogent" } });
    await p.applicant.create({ data: { email: "andi@gmail.com", name: "Andi", emailVerifiedAt: new Date() } });
  });
  afterAll(async () => {
    await db?.stop();
  });

  it("links an existing user by email (case-insensitive)", async () => {
    const r = await resolveSignIn(db.raw, { email: "Wira.Budi@Clogent.co.id" });
    expect(r.ok && r.kind === "user" && r.user.appRole).toBe("ADMIN");
  });
  it("rejects inactive users", async () => {
    expect(await resolveSignIn(db.raw, { email: "gone@clogent.co.id" })).toEqual({ ok: false, reason: "inactive" });
  });
  it("finds an applicant by email (case-insensitive)", async () => {
    const r = await resolveSignIn(db.raw, { email: " Andi@Gmail.com " });
    expect(r.ok && r.kind === "applicant" && r.applicant.email).toBe("andi@gmail.com");
  });
  it("an unknown email, even on a workspace email domain, is not found and creates nothing", async () => {
    const before = { users: await db.raw.user.count(), applicants: await db.raw.applicant.count() };
    expect(await resolveSignIn(db.raw, { email: "someone@gmail.com" })).toEqual({ ok: false, reason: "not-found" });
    expect(await resolveSignIn(db.raw, { email: "new.person@clogent.co.id", name: "New" })).toEqual({ ok: false, reason: "not-found" });
    expect(await resolveSignIn(db.raw, { email: "" })).toEqual({ ok: false, reason: "no-email" });
    expect({ users: await db.raw.user.count(), applicants: await db.raw.applicant.count() }).toEqual(before);
  });
  it("does not let an outside address claim a roster row by alias or name", async () => {
    expect(await resolveSignIn(db.raw, { email: "rina.p@gmail.com", name: "Rina" })).toEqual({ ok: false, reason: "not-found" });
    const row = await db.raw.user.findFirst({ where: { name: "Rina", fullName: "Rina Putri" } });
    expect(row?.email).toBeNull();
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
    const bad = await decideSignIn(db.raw, "google", { email: "a@clogent.co.id", email_verified: false }, env);
    expect(bad).toEqual({ ok: false, reason: "untrusted" });
    const good = await decideSignIn(db.raw, "google", { email: "a@clogent.co.id", email_verified: true }, env);
    expect(good.ok).toBe(true);
  });
  it("entra: wrong tid or missing env rejected; right tid accepted", async () => {
    expect((await decideSignIn(db.raw, "microsoft-entra-id", { email: "b@clogent.co.id", tid: "x" }, env)).ok).toBe(false);
    expect((await decideSignIn(db.raw, "microsoft-entra-id", { email: "b@clogent.co.id", tid: "t1" }, {})).ok).toBe(false);
    expect((await decideSignIn(db.raw, "microsoft-entra-id", { email: "b@clogent.co.id", tid: "t1" }, env)).ok).toBe(true);
  });
  it("decideSignIn: trusted unknown gmail → applicant; inactive user → inactive; unverified Google → untrusted", async () => {
    const users = await db.raw.user.count();
    const r = await decideSignIn(db.raw, "google", { email: "stranger@gmail.com", name: "Stranger", email_verified: true }, env);
    expect(r.ok && r.kind).toBe("applicant");
    if (!r.ok || r.kind !== "applicant") throw new Error("expected applicant");
    expect(r.applicant).toMatchObject({ email: "stranger@gmail.com", name: "Stranger", requestedWorkspaceId: null });
    expect(r.applicant.emailVerifiedAt).not.toBeNull();
    expect(await db.raw.user.count()).toBe(users);

    await db.raw.user.create({ data: { email: "off@gmail.com", name: "Off", fullName: "Off", active: false, workspaceId: "clogent" } });
    expect(await decideSignIn(db.raw, "google", { email: "Off@gmail.com", email_verified: true }, env)).toEqual({ ok: false, reason: "inactive" });
    expect(await decideSignIn(db.raw, "google", { email: "new@gmail.com", email_verified: false }, env)).toEqual({ ok: false, reason: "untrusted" });
    expect(await db.raw.applicant.count({ where: { email: "new@gmail.com" } })).toBe(0);
  });
  it("decideSignIn: an existing User signs in as a member; a workspace-domain email becomes an applicant with a join request, not a User", async () => {
    const g = await decideSignIn(db.raw, "google", { email: "G@gmail.com", email_verified: true }, env);
    expect(g.ok && g.kind === "user" && g.user.email).toBe("g@gmail.com");
    const before = await db.raw.user.count();
    const d = await decideSignIn(db.raw, "google", { email: "Fresh@clogent.co.id", name: "Fresh", email_verified: true }, env);
    expect(d.ok && d.kind === "applicant" && d.applicant.requestedWorkspaceId).toBe("clogent");
    expect(await db.raw.user.count()).toBe(before);
  });
  it("decideSignIn: Andi@Gmail.com matches applicant andi@gmail.com", async () => {
    const a = await db.raw.applicant.create({ data: { email: "andi@gmail.com", name: "Andi", emailVerifiedAt: new Date() } });
    const r = await decideSignIn(db.raw, "google", { email: "Andi@Gmail.com", name: "Someone Else", email_verified: true }, env);
    expect(r.ok && r.kind === "applicant" && r.applicant.id).toBe(a.id);
    expect(await db.raw.applicant.count({ where: { email: { equals: "andi@gmail.com", mode: "insensitive" } } })).toBe(1);
  });

  it("refreshJwt upgrades an aid token once a User with that id exists", async () => {
    const a = await db.raw.applicant.create({ data: { email: "up@gmail.com", name: "Up", emailVerifiedAt: new Date() } });
    const tok = bindApplicantToken<Tok>({ uid: "stale", appRole: "ADMIN", jobRole: "OTHER", pwv: 3 }, a);
    expect(tok).toEqual({ aid: a.id, loginEmail: "up@gmail.com" });
    expect(await refreshJwt(db.raw, { ...tok })).toEqual(tok);
    // Approval: same id, applicant row gone.
    await db.raw.$transaction([
      db.raw.applicant.delete({ where: { id: a.id } }),
      db.raw.user.create({ data: { id: a.id, email: "up@gmail.com", name: "Up", fullName: "Up", appRole: "REQUESTER", workspaceId: "clogent" } }),
    ]);
    const up = await refreshJwt(db.raw, { ...tok });
    expect(up).toEqual({ uid: a.id, loginEmail: "up@gmail.com", pwv: 0, appRole: "REQUESTER", jobRole: "OTHER" });
    expect(await refreshJwt(db.raw, up!)).not.toBeNull();
  });
  it("refreshJwt returns null when neither row exists", async () => {
    expect(await refreshJwt(db.raw, { aid: "nobody", loginEmail: "x@gmail.com" })).toBeNull();
  });
  it("refreshJwt refuses an aid token whose email no longer matches, or whose User is inactive or has another email", async () => {
    const a = await db.raw.applicant.create({ data: { email: "m1@gmail.com", name: "M", emailVerifiedAt: new Date() } });
    expect(await refreshJwt(db.raw, { aid: a.id, loginEmail: "other@gmail.com" })).toBeNull();
    expect(await refreshJwt(db.raw, { aid: a.id })).toBeNull();
    await db.raw.applicant.delete({ where: { id: a.id } });
    const u = await db.raw.user.create({ data: { id: a.id, email: "m2@gmail.com", name: "M2", fullName: "M2", workspaceId: "clogent" } });
    expect(await refreshJwt(db.raw, { aid: a.id, loginEmail: "m1@gmail.com" })).toBeNull();
    await db.raw.user.update({ where: { id: u.id }, data: { email: "m1@gmail.com", active: false } });
    expect(await refreshJwt(db.raw, { aid: a.id, loginEmail: "m1@gmail.com" })).toBeNull();
  });
  it("an applicant session is never a user session; loadSessionApplicant tells the kinds apart", async () => {
    const a = await db.raw.applicant.create({ data: { email: "lob@gmail.com", name: "Lob" } });
    const sess = { user: { applicantId: a.id, loginEmail: "lob@gmail.com" } };
    await expect(requireUserWith(async () => sess, db.raw)).rejects.toThrow();
    expect(await loadSessionApplicant(db.raw, sess)).toEqual({ kind: "applicant", applicant: { id: a.id, email: "lob@gmail.com", name: "Lob" } });
    expect(await loadSessionApplicant(db.raw, { user: { applicantId: a.id, loginEmail: "no@gmail.com" } })).toEqual({ kind: "none" });
    expect(await loadSessionApplicant(db.raw, { user: { id: "u1", applicantId: a.id } })).toEqual({ kind: "member" });
    expect(await loadSessionApplicant(db.raw, null)).toEqual({ kind: "none" });
    expect(await loadSessionApplicant(db.raw, { user: { applicantId: "gone", loginEmail: "lob@gmail.com" } })).toEqual({ kind: "none" });
  });

  it("an active gmail User with a password signs in without any allow-list row", async () => {
    const u = await db.prisma.user.create({
      data: { email: "solo@gmail.com", name: "Solo", fullName: "Solo", passwordHash: await hashPassword("correct horse battery") },
    });
    const r = await authenticateWithPassword(db.raw, "Solo@Gmail.com", "correct horse battery");
    expect(r?.kind === "user" && r.user.id).toBe(u.id);
    expect(await authenticateWithPassword(db.raw, "solo@gmail.com", "wrong password here")).toBeNull();
    await db.prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect(await authenticateWithPassword(db.raw, "solo@gmail.com", "correct horse battery")).toBeNull();
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
});
