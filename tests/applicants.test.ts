import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  JoinError, signUp, verifyCode, resendCode, requestJoinByCode, oauthApplicant, describeJoinCode, lobbyState,
} from "@/lib/applicants";
import type { Mailer } from "@/lib/mailer";
import { newJoinCode } from "@/lib/joinTokens";
import { createTestDb, type TestDb } from "./helpers/testDb";

type Msg = { to: string; subject: string; text: string };

let db: TestDb;
let n = 0;
const uniq = (p: string) => `${p}${++n}`;
const PASSWORD = "correct horse battery";

function deps(over: { now?: Date } = {}) {
  const sent: Msg[] = [];
  const requested: string[] = [];
  const mailer: Mailer = { async send(m) { sent.push(m); } };
  const d = {
    db: db.raw,
    mailer,
    secret: "test-secret",
    baseUrl: "https://cloworks.test",
    now: over.now,
    onRequest: async (id: string) => { requested.push(id); },
  };
  return { d, sent, requested };
}

const errCode = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof JoinError) return e.code;
    throw e;
  }
  return "OK";
};

const codeOf = (m: Msg) => m.text.match(/\d{6}/)![0];
const wrong = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, "0");

async function clogent() {
  return db.raw.workspace.findUniqueOrThrow({ where: { id: "clogent" } });
}

/** Signs up and verifies a fresh applicant; returns its id. */
async function verified(email: string, joinCode?: string) {
  const { d, sent, requested } = deps();
  const { applicantId } = await signUp(d, { name: "Andi", email, password: PASSWORD, joinCode });
  const res = await verifyCode(d, applicantId!, codeOf(sent[0]));
  return { id: applicantId!, res, requested };
}

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.stop();
});

describe("applicants", () => {
  it("sign-up stores lowercase email, hashed code, sends one code email", async () => {
    const { d, sent } = deps();
    const { applicantId } = await signUp(d, { name: " Andi ", email: " Andi@Gmail.COM ", password: PASSWORD });
    const row = await db.raw.applicant.findUniqueOrThrow({ where: { id: applicantId! } });
    expect(row.email).toBe("andi@gmail.com");
    expect(row.name).toBe("Andi");
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(row.emailVerifiedAt).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("andi@gmail.com");
    expect(sent[0].text).toMatch(/\d{6}/);
    expect(row.codeHash).toBeTruthy();
    expect(row.codeHash).not.toBe(codeOf(sent[0]));
    expect(row.codesSentInWindow).toBe(1);
  });

  it("sign-up validates name, email and password", async () => {
    const { d, sent } = deps();
    expect(await errCode(signUp(d, { name: "  ", email: "x@gmail.com", password: PASSWORD }))).toBe("VALIDATION");
    expect(await errCode(signUp(d, { name: "X", email: "nope", password: PASSWORD }))).toBe("VALIDATION");
    expect(await errCode(signUp(d, { name: "X", email: "a@b@c", password: PASSWORD }))).toBe("VALIDATION");
    expect(await errCode(signUp(d, { name: "X", email: "x@gmail.com", password: "short" }))).toBe("VALIDATION");
    expect(sent).toHaveLength(0);
  });

  it("sign-up with a member's email creates nothing and sends already-have-account", async () => {
    const email = `${uniq("member")}@clogent.co.id`;
    await db.prisma.user.create({ data: { name: uniq("M"), fullName: "Member", email } });
    const { d, sent } = deps();
    const res = await signUp(d, { name: "Someone", email: email.toUpperCase(), password: PASSWORD });
    expect(res).toEqual({ applicantId: null });
    expect(await db.raw.applicant.findUnique({ where: { email } })).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].subject).toBe("You already have a Cloworks account");
    expect(sent[0].text).toContain("https://cloworks.test/signin");
  });

  it("sign-up with a verified applicant's email sends already-have-account", async () => {
    const email = `${uniq("ver")}@gmail.com`;
    await verified(email);
    const { d, sent } = deps();
    expect(await signUp(d, { name: "Again", email, password: PASSWORD })).toEqual({ applicantId: null });
    expect(sent[0].subject).toBe("You already have a Cloworks account");
    expect((await db.raw.applicant.findUniqueOrThrow({ where: { email } })).name).toBe("Andi");
  });

  it("sign-up again while unverified overwrites name, password and code", async () => {
    const email = `${uniq("over")}@gmail.com`;
    const { d, sent } = deps();
    const a = await signUp(d, { name: "First", email, password: PASSWORD });
    const before = await db.raw.applicant.findUniqueOrThrow({ where: { email } });
    const b = await signUp(d, { name: "Second", email, password: "another long password" });
    expect(b.applicantId).toBe(a.applicantId);
    const after = await db.raw.applicant.findUniqueOrThrow({ where: { email } });
    expect(after.name).toBe("Second");
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.codeHash).not.toBe(before.codeHash);
    expect(sent).toHaveLength(2);
    expect(await errCode(verifyCode(d, a.applicantId!, codeOf(sent[0])))).toBe("CODE_INVALID");
    expect(await errCode(verifyCode(d, a.applicantId!, codeOf(sent[1])))).toBe("OK");
  });

  it("wrong code 5 times → TOO_MANY, then even the right code fails", async () => {
    const { d, sent } = deps();
    const { applicantId } = await signUp(d, { name: "A", email: `${uniq("tm")}@gmail.com`, password: PASSWORD });
    const right = codeOf(sent[0]);
    for (let i = 0; i < 4; i++) expect(await errCode(verifyCode(d, applicantId!, wrong(right)))).toBe("CODE_INVALID");
    expect(await errCode(verifyCode(d, applicantId!, wrong(right)))).toBe("TOO_MANY");
    expect(await errCode(verifyCode(d, applicantId!, right))).toBe("TOO_MANY");
    const row = await db.raw.applicant.findUniqueOrThrow({ where: { id: applicantId! } });
    expect(row.emailVerifiedAt).toBeNull();
  });

  it("code older than 15 minutes → CODE_EXPIRED", async () => {
    const t0 = new Date();
    const { d, sent } = deps({ now: t0 });
    const { applicantId } = await signUp(d, { name: "A", email: `${uniq("exp")}@gmail.com`, password: PASSWORD });
    const later = deps({ now: new Date(t0.getTime() + 15 * 60_000 + 1) }).d;
    expect(await errCode(verifyCode(later, applicantId!, codeOf(sent[0])))).toBe("CODE_EXPIRED");
    const inTime = deps({ now: new Date(t0.getTime() + 14 * 60_000) }).d;
    expect(await errCode(verifyCode(inTime, applicantId!, codeOf(sent[0])))).toBe("OK");
  });

  it("resend within 60 s → RATE_LIMITED; 6th resend in an hour → RATE_LIMITED", async () => {
    // The sign-up code counts as the first of five sends per hour, so the 6th code (5th resend) is refused.
    const t0 = new Date();
    const at = (s: number) => deps({ now: new Date(t0.getTime() + s * 1000) });
    const first = at(0);
    const { applicantId } = await signUp(first.d, { name: "A", email: `${uniq("rs")}@gmail.com`, password: PASSWORD });
    expect(await errCode(resendCode(at(30).d, applicantId!))).toBe("RATE_LIMITED");
    const sends: Msg[] = [];
    for (let i = 1; i <= 4; i++) {
      const x = at(61 * i);
      expect(await errCode(resendCode(x.d, applicantId!))).toBe("OK");
      sends.push(...x.sent);
    }
    expect(sends).toHaveLength(4);
    expect(await errCode(resendCode(at(61 * 5).d, applicantId!))).toBe("RATE_LIMITED");
    // The window resets once the last send is more than an hour old.
    const reset = at(61 * 4 + 3601);
    expect(await errCode(resendCode(reset.d, applicantId!))).toBe("OK");
    expect(reset.sent).toHaveLength(1);
    // The newest code works; older ones don't.
    expect(await errCode(verifyCode(reset.d, applicantId!, codeOf(sends[0])))).toBe("CODE_INVALID");
    expect(await errCode(verifyCode(reset.d, applicantId!, codeOf(reset.sent[0])))).toBe("OK");
  });

  it("mailer failure propagates from sign-up and resend", async () => {
    const { d } = deps();
    const failing = { ...d, mailer: { async send() { throw new Error("mail down"); } } };
    await expect(signUp(failing, { name: "A", email: `${uniq("mf")}@gmail.com`, password: PASSWORD })).rejects.toThrow("mail down");
    const t0 = new Date();
    const { applicantId } = await signUp({ ...d, now: t0 }, { name: "A", email: `${uniq("mf")}@gmail.com`, password: PASSWORD });
    await expect(resendCode({ ...failing, now: new Date(t0.getTime() + 61_000) }, applicantId!)).rejects.toThrow("mail down");
  });

  it("verified @clogent.co.id → request to clogent with source DOMAIN, onRequest called", async () => {
    const { id, res, requested } = await verified(`${uniq("dom")}@Clogent.co.id`);
    expect(res).toEqual({ joined: true });
    const row = await db.raw.applicant.findUniqueOrThrow({ where: { id } });
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(row.codeHash).toBeNull();
    expect(row.requestedWorkspaceId).toBe("clogent");
    expect(row.requestSource).toBe("DOMAIN");
    expect(row.requestedAt).not.toBeNull();
    expect(requested).toEqual([id]);
    expect(await lobbyState(db.raw, id)).toEqual({ kind: "waiting", workspaceName: (await clogent()).name });
  });

  it("domain request still created when joinLinkEnabled = false", async () => {
    await db.raw.workspace.update({ where: { id: "clogent" }, data: { joinLinkEnabled: false } });
    try {
      const { id, requested } = await verified(`${uniq("off")}@clogent.co.id`);
      const row = await db.raw.applicant.findUniqueOrThrow({ where: { id } });
      expect(row.requestedWorkspaceId).toBe("clogent");
      expect(row.requestSource).toBe("DOMAIN");
      expect(requested).toEqual([id]);
    } finally {
      await db.raw.workspace.update({ where: { id: "clogent" }, data: { joinLinkEnabled: true } });
    }
  });

  it("verified gmail with no code → lobby state none", async () => {
    const { d, sent, requested } = deps();
    const { applicantId } = await signUp(d, { name: "A", email: `${uniq("none")}@gmail.com`, password: PASSWORD });
    expect(await lobbyState(db.raw, applicantId!)).toEqual({ kind: "unverified" });
    expect(await verifyCode(d, applicantId!, codeOf(sent[0]))).toEqual({ joined: false });
    expect(requested).toHaveLength(0);
    expect(await lobbyState(db.raw, applicantId!)).toEqual({ kind: "none" });
    expect(await lobbyState(db.raw, "missing-id")).toBeNull();
  });

  it("sign-up via join code → request with source LINK", async () => {
    const ws = await clogent();
    expect(await describeJoinCode(db.raw, ws.joinCode!)).toEqual({ workspaceName: ws.name });
    expect(await describeJoinCode(db.raw, "nope")).toBeNull();
    const { id, res, requested } = await verified(`${uniq("link")}@gmail.com`, ws.joinCode!);
    expect(res).toEqual({ joined: true });
    const row = await db.raw.applicant.findUniqueOrThrow({ where: { id } });
    expect(row.requestedWorkspaceId).toBe("clogent");
    expect(row.requestSource).toBe("LINK");
    expect(row.pendingJoinCode).toBeNull();
    expect(requested).toEqual([id]);
  });

  it("requestJoinByCode from the lobby → request with source LINK", async () => {
    const ws = await clogent();
    const { id } = await verified(`${uniq("lobby")}@gmail.com`);
    const { d, requested } = deps();
    await requestJoinByCode(d, id, ws.joinCode!);
    const row = await db.raw.applicant.findUniqueOrThrow({ where: { id } });
    expect(row.requestedWorkspaceId).toBe("clogent");
    expect(row.requestSource).toBe("LINK");
    expect(requested).toEqual([id]);
    // Asking again for the same workspace is a no-op.
    await requestJoinByCode(d, id, ws.joinCode!);
    expect(requested).toEqual([id]);
  });

  it("after reset the old code → LINK_INVALID, no request", async () => {
    const old = (await clogent()).joinCode!;
    const { d, sent, requested } = deps();
    const { applicantId } = await signUp(d, { name: "A", email: `${uniq("reset")}@gmail.com`, password: PASSWORD, joinCode: old });
    await db.raw.workspace.update({ where: { id: "clogent" }, data: { joinCode: newJoinCode() } });
    expect(await describeJoinCode(db.raw, old)).toBeNull();
    expect(await errCode(verifyCode(d, applicantId!, codeOf(sent[0])))).toBe("LINK_INVALID");
    let row = await db.raw.applicant.findUniqueOrThrow({ where: { id: applicantId! } });
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(row.requestedWorkspaceId).toBeNull();
    expect(row.pendingJoinCode).toBeNull();
    expect(await errCode(requestJoinByCode(d, applicantId!, old))).toBe("LINK_INVALID");
    row = await db.raw.applicant.findUniqueOrThrow({ where: { id: applicantId! } });
    expect(row.requestedWorkspaceId).toBeNull();
    expect(requested).toHaveLength(0);
  });

  it("link off → LINK_INVALID", async () => {
    const ws = await clogent();
    const { id } = await verified(`${uniq("linkoff")}@gmail.com`);
    await db.raw.workspace.update({ where: { id: "clogent" }, data: { joinLinkEnabled: false } });
    try {
      expect(await describeJoinCode(db.raw, ws.joinCode!)).toBeNull();
      const { d, requested } = deps();
      expect(await errCode(requestJoinByCode(d, id, ws.joinCode!))).toBe("LINK_INVALID");
      expect((await db.raw.applicant.findUniqueOrThrow({ where: { id } })).requestedWorkspaceId).toBeNull();
      expect(requested).toHaveLength(0);
    } finally {
      await db.raw.workspace.update({ where: { id: "clogent" }, data: { joinLinkEnabled: true } });
    }
  });

  it("rejected applicant re-requesting → REJECTED", async () => {
    const ws = await clogent();
    const { id } = await verified(`${uniq("rej")}@gmail.com`, ws.joinCode!);
    await db.raw.applicant.update({ where: { id }, data: { rejectedAt: new Date() } });
    expect(await lobbyState(db.raw, id)).toEqual({ kind: "rejected", workspaceName: ws.name });
    const { d, requested } = deps();
    expect(await errCode(requestJoinByCode(d, id, ws.joinCode!))).toBe("REJECTED");
    expect(requested).toHaveLength(0);
    expect((await db.raw.applicant.findUniqueOrThrow({ where: { id } })).rejectedAt).not.toBeNull();
  });

  it("deactivated member's email → INACTIVE_MEMBER on requestJoinByCode/verify", async () => {
    const ws = await clogent();
    // verify: the person signed up, then an admin created and deactivated a user with that email.
    const e1 = `${uniq("inact")}@gmail.com`;
    const a = deps();
    const { applicantId } = await signUp(a.d, { name: "A", email: e1, password: PASSWORD });
    await db.prisma.user.create({ data: { name: uniq("I"), fullName: "Inactive", email: e1, active: false } });
    expect(await errCode(verifyCode(a.d, applicantId!, codeOf(a.sent[0])))).toBe("INACTIVE_MEMBER");
    expect((await db.raw.applicant.findUniqueOrThrow({ where: { id: applicantId! } })).requestedWorkspaceId).toBeNull();
    expect(a.requested).toHaveLength(0);
    // requestJoinByCode: a verified applicant in the lobby.
    const e2 = `${uniq("inact")}@gmail.com`;
    const { id } = await verified(e2);
    await db.prisma.user.create({ data: { name: uniq("I"), fullName: "Inactive", email: e2, active: false } });
    const b = deps();
    expect(await errCode(requestJoinByCode(b.d, id, ws.joinCode!))).toBe("INACTIVE_MEMBER");
    expect(b.requested).toHaveLength(0);
  });

  it("unverified applicant older than 7 days is removed on next sign-up", async () => {
    const old = deps({ now: new Date(Date.now() - 8 * 24 * 3_600_000) });
    const stale = await signUp(old.d, { name: "Old", email: `${uniq("stale")}@gmail.com`, password: PASSWORD });
    const recent = deps({ now: new Date(Date.now() - 6 * 24 * 3_600_000) });
    const fresh = await signUp(recent.d, { name: "Recent", email: `${uniq("fresh")}@gmail.com`, password: PASSWORD });
    const keep = await verified(`${uniq("keep")}@gmail.com`);
    await db.raw.applicant.update({ where: { id: keep.id }, data: { createdAt: new Date(Date.now() - 30 * 24 * 3_600_000) } });
    const { d } = deps();
    await signUp(d, { name: "New", email: `${uniq("new")}@gmail.com`, password: PASSWORD });
    expect(await db.raw.applicant.findUnique({ where: { id: stale.applicantId! } })).toBeNull();
    expect(await db.raw.applicant.findUnique({ where: { id: fresh.applicantId! } })).not.toBeNull();
    expect(await db.raw.applicant.findUnique({ where: { id: keep.id } })).not.toBeNull();
  });

  it("oauthApplicant creates a verified applicant and requests domain workspace", async () => {
    const requested: string[] = [];
    const d = { db: db.raw, onRequest: async (id: string) => { requested.push(id); } };
    const email = `${uniq("google")}@clogent.co.id`;
    const a = await oauthApplicant(d, { email: email.toUpperCase(), name: "Gina" });
    expect(a.email).toBe(email);
    expect(a.name).toBe("Gina");
    expect(a.passwordHash).toBeNull();
    expect(a.emailVerifiedAt).not.toBeNull();
    expect(a.requestedWorkspaceId).toBe("clogent");
    expect(a.requestSource).toBe("DOMAIN");
    expect(requested).toEqual([a.id]);
    // Signing in again returns the same row without a second request.
    const again = await oauthApplicant(d, { email, name: "Gina" });
    expect(again.id).toBe(a.id);
    expect(requested).toEqual([a.id]);
    // A gmail account lands in the lobby.
    const g = await oauthApplicant(d, { email: `${uniq("google")}@gmail.com`, name: "Gus" });
    expect(g.requestedWorkspaceId).toBeNull();
    expect(await lobbyState(db.raw, g.id)).toEqual({ kind: "none" });
  });

  it("oauthApplicant verifies an unverified applicant and uses its join intent", async () => {
    const ws = await clogent();
    const { d } = deps();
    const email = `${uniq("gl")}@gmail.com`;
    const { applicantId } = await signUp(d, { name: "Form Name", email, password: PASSWORD, joinCode: ws.joinCode! });
    const requested: string[] = [];
    const a = await oauthApplicant({ db: db.raw, onRequest: async (id) => { requested.push(id); } }, { email, name: "Google Name" });
    expect(a.id).toBe(applicantId);
    expect(a.emailVerifiedAt).not.toBeNull();
    expect(a.codeHash).toBeNull();
    expect(a.requestSource).toBe("LINK");
    expect(requested).toEqual([a.id]);
  });

  it("oauthApplicant refuses a deactivated member's email", async () => {
    const email = `${uniq("gin")}@gmail.com`;
    await db.prisma.user.create({ data: { name: uniq("I"), fullName: "Inactive", email, active: false } });
    expect(await errCode(oauthApplicant({ db: db.raw }, { email, name: "X" }))).toBe("INACTIVE_MEMBER");
    expect(await db.raw.applicant.findUnique({ where: { email } })).toBeNull();
  });
});
