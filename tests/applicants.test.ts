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
    // The code email just sent counts toward the once-an-hour limit, so come back later.
    const { d, sent } = deps({ now: new Date(Date.now() + 61 * 60_000) });
    expect(await signUp(d, { name: "Again", email, password: PASSWORD })).toEqual({ applicantId: null });
    expect(sent[0].subject).toBe("You already have a Cloworks account");
    expect((await db.raw.applicant.findUniqueOrThrow({ where: { email } })).name).toBe("Andi");
  });

  it("already-have-account goes out at most once an hour per member address (R15)", async () => {
    const email = `${uniq("bomb")}@clogent.co.id`;
    await db.prisma.user.create({ data: { name: uniq("B"), fullName: "Bombed", email } });
    const t0 = new Date("2026-10-11T08:00:00Z");
    const sends: Msg[] = [];
    for (const [now, name] of [[t0, "A"], [new Date(t0.getTime() + 30 * 60_000), "B"]] as const) {
      const { d, sent } = deps({ now });
      expect(await signUp(d, { name, email, password: PASSWORD })).toEqual({ applicantId: null });
      sends.push(...sent);
    }
    expect(sends).toHaveLength(1);
    const { d, sent } = deps({ now: new Date(t0.getTime() + 61 * 60_000) });
    expect(await signUp(d, { name: "C", email, password: PASSWORD })).toEqual({ applicantId: null });
    sends.push(...sent);
    expect(sends).toHaveLength(2);
  });

  it("already-have-account for a verified applicant shares the hourly limit with code emails", async () => {
    const email = `${uniq("vbomb")}@gmail.com`;
    await verified(email);
    const soon = deps();
    expect(await signUp(soon.d, { name: "X", email, password: PASSWORD })).toEqual({ applicantId: null });
    expect(soon.sent).toHaveLength(0);
    const later = deps({ now: new Date(Date.now() + 61 * 60_000) });
    await signUp(later.d, { name: "X", email, password: PASSWORD });
    expect(later.sent).toHaveLength(1);
  });

  it("without a base url the notice has no link", async () => {
    const email = `${uniq("nolink")}@clogent.co.id`;
    await db.prisma.user.create({ data: { name: uniq("N"), fullName: "No link", email } });
    const { d, sent } = deps();
    await signUp({ ...d, baseUrl: "" }, { name: "Someone", email, password: PASSWORD });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).not.toContain("/signin");
  });

  it("sign-up again while unverified replaces the row with a fresh id (C1)", async () => {
    const email = `${uniq("over")}@gmail.com`;
    const t0 = new Date();
    const first = deps({ now: t0 });
    const a = await signUp(first.d, { name: "First", email, password: PASSWORD });
    const before = await db.raw.applicant.findUniqueOrThrow({ where: { email } });
    // Owner signs up 2 minutes later: new id, new name/password, a new code is sent.
    const later = deps({ now: new Date(t0.getTime() + 120_000) });
    const b = await signUp(later.d, { name: "Second", email, password: "another long password" });
    expect(b.applicantId).not.toBe(a.applicantId);
    expect(await db.raw.applicant.findUnique({ where: { id: a.applicantId! } })).toBeNull();
    expect(await lobbyState(db.raw, a.applicantId!)).toBeNull();
    const after = await db.raw.applicant.findUniqueOrThrow({ where: { email } });
    expect(after.id).toBe(b.applicantId);
    expect(after.name).toBe("Second");
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.codeHash).not.toBe(before.codeHash);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(later.sent).toHaveLength(1);
    // The earlier session's id can't be verified any more.
    expect(await errCode(verifyCode(later.d, a.applicantId!, codeOf(first.sent[0])))).toBe("CODE_INVALID");
    expect(await errCode(verifyCode(later.d, b.applicantId!, codeOf(first.sent[0])))).toBe("CODE_INVALID");
    expect(await errCode(verifyCode(later.d, b.applicantId!, codeOf(later.sent[0])))).toBe("OK");
  });

  it("re-sign-up within 60 s or over the hourly cap: no throw, no email, old code still works (I3)", async () => {
    const email = `${uniq("squat")}@gmail.com`;
    const t0 = new Date();
    const at = (s: number) => deps({ now: new Date(t0.getTime() + s * 1000) });
    const owner = at(0);
    const a = await signUp(owner.d, { name: "Owner", email, password: PASSWORD });
    const firstRow = await db.raw.applicant.findUniqueOrThrow({ where: { email } });
    // Within the gap.
    const quick = at(10);
    const b = await signUp(quick.d, { name: "Squatter", email, password: "squatter password!" });
    expect(b.applicantId).toBeTruthy();
    expect(b.applicantId).not.toBe(a.applicantId);
    expect(quick.sent).toHaveLength(0);
    let row = await db.raw.applicant.findUniqueOrThrow({ where: { email } });
    expect(row.codeHash).toBe(firstRow.codeHash);
    expect(row.codesSentInWindow).toBe(1);
    // Fill the hourly window (sends 2..5), then one more sign-up: still no throw and no email.
    for (let i = 1; i <= 4; i++) expect((await (async () => { const x = at(61 * i); await signUp(x.d, { name: "S", email, password: PASSWORD }); return x.sent.length; })())).toBe(1);
    const over = at(61 * 5);
    const c = await signUp(over.d, { name: "S", email, password: PASSWORD });
    expect(c.applicantId).toBeTruthy();
    expect(over.sent).toHaveLength(0);
    row = await db.raw.applicant.findUniqueOrThrow({ where: { email } });
    expect(row.codesSentInWindow).toBe(5);
    expect(row.createdAt.getTime()).toBe(firstRow.createdAt.getTime());
  });

  it("repeated re-sign-ups don't keep a squatted row alive past 7 days (I3)", async () => {
    const email = `${uniq("keepalive")}@gmail.com`;
    const day = 24 * 3_600_000;
    const t0 = Date.now() - 10 * day;
    await signUp(deps({ now: new Date(t0) }).d, { name: "S", email, password: PASSWORD });
    await signUp(deps({ now: new Date(t0 + 5 * day) }).d, { name: "S", email, password: PASSWORD });
    await signUp(deps().d, { name: "N", email: `${uniq("other")}@gmail.com`, password: PASSWORD });
    expect(await db.raw.applicant.findUnique({ where: { email } })).toBeNull();
  });

  it("two concurrent sign-ups for the same new email: no throw, one row (I2)", async () => {
    const email = `${uniq("race")}@gmail.com`;
    const x = deps();
    const results = await Promise.all([
      signUp(x.d, { name: "A", email, password: PASSWORD }),
      signUp(x.d, { name: "B", email, password: PASSWORD }),
    ]);
    expect(results.every((r) => typeof r.applicantId === "string")).toBe(true);
    expect(await db.raw.applicant.count({ where: { email } })).toBe(1);
    expect(x.sent.length).toBeGreaterThanOrEqual(1);
  });

  it("parallel wrong guesses can't exceed 5 attempts (I1)", async () => {
    const { d, sent } = deps();
    const { applicantId } = await signUp(d, { name: "A", email: `${uniq("par")}@gmail.com`, password: PASSWORD });
    const right = codeOf(sent[0]);
    const guesses = Array.from({ length: 20 }, (_, i) => String((Number(right) + 1 + i) % 1_000_000).padStart(6, "0"));
    const results = await Promise.all(guesses.map((g) => errCode(verifyCode(d, applicantId!, g))));
    expect(results.filter((r) => r === "CODE_INVALID").length).toBeLessThanOrEqual(4);
    expect(results.every((r) => r === "CODE_INVALID" || r === "TOO_MANY")).toBe(true);
    const row = await db.raw.applicant.findUniqueOrThrow({ where: { id: applicantId! } });
    expect(row.codeAttempts).toBeLessThanOrEqual(5);
    expect(await errCode(verifyCode(d, applicantId!, right))).toBe("TOO_MANY");
    expect((await db.raw.applicant.findUniqueOrThrow({ where: { id: applicantId! } })).emailVerifiedAt).toBeNull();
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

  it("a failed code email is a VALIDATION error and leaves nothing behind (I1)", async () => {
    const { d } = deps();
    const failing = { ...d, mailer: { async send() { throw new Error("mail down"); } } };
    const email = `${uniq("mf")}@gmail.com`;
    const e = await signUp(failing, { name: "A", email, password: PASSWORD }).catch((x) => x);
    expect(e).toBeInstanceOf(JoinError);
    expect(e.code).toBe("VALIDATION");
    expect(e.message).toBe("We couldn't send an email to that address. Check it and try again.");
    expect(await db.raw.applicant.findUnique({ where: { email } })).toBeNull();
  });

  it("a failed resend keeps the previous code working (I1)", async () => {
    const { d, sent } = deps();
    const t0 = new Date();
    const { applicantId } = await signUp({ ...d, now: t0 }, { name: "A", email: `${uniq("mf")}@gmail.com`, password: PASSWORD });
    const failing = { ...d, now: new Date(t0.getTime() + 61_000), mailer: { async send() { throw new Error("mail down"); } } };
    const e = await resendCode(failing, applicantId!).catch((x) => x);
    expect(e).toBeInstanceOf(JoinError);
    expect(e.code).toBe("VALIDATION");
    expect(e.message).toMatch(/couldn't send an email/);
    // Not counted as a send either: an immediate retry is allowed.
    const ok = deps();
    await resendCode({ ...ok.d, now: new Date(t0.getTime() + 62_000) }, applicantId!);
    expect(ok.sent).toHaveLength(1);
    // The code from before a failed resend still verifies.
    const { applicantId: id2 } = await signUp({ ...d, now: t0 }, { name: "B", email: `${uniq("mf")}@gmail.com`, password: PASSWORD });
    await resendCode({ ...failing }, id2!).catch(() => {});
    expect(await verifyCode({ ...d, now: new Date(t0.getTime() + 70_000) }, id2!, codeOf(sent.at(-1)!))).toEqual({ joined: false });
  });

  it("a failed code email on re-sign-up keeps the earlier row and code (I1)", async () => {
    const { d, sent } = deps();
    const t0 = new Date();
    const email = `${uniq("mfr")}@gmail.com`;
    const { applicantId } = await signUp({ ...d, now: t0 }, { name: "A", email, password: PASSWORD });
    const failing = { ...d, now: new Date(t0.getTime() + 61_000), mailer: { async send() { throw new Error("mail down"); } } };
    expect(await errCode(signUp(failing, { name: "A2", email, password: PASSWORD }))).toBe("VALIDATION");
    const row = await db.raw.applicant.findUniqueOrThrow({ where: { email } });
    expect(row.id).toBe(applicantId);
    expect(row.name).toBe("A");
    expect(await verifyCode({ ...d, now: new Date(t0.getTime() + 70_000) }, applicantId!, codeOf(sent[0]))).toEqual({ joined: false });
  });

  it("a failed already-have-account email stays silent (never reveals the account)", async () => {
    const email = `${uniq("silent")}@clogent.co.id`;
    await db.prisma.user.create({ data: { name: uniq("S"), fullName: "Silent", email } });
    const { d } = deps();
    const failing = { ...d, mailer: { async send() { throw new Error("mail down"); } } };
    expect(await signUp(failing, { name: "X", email, password: PASSWORD })).toEqual({ applicantId: null });
  });

  it("the already-have-account email also covers a deactivated account (M7)", async () => {
    const email = `${uniq("deact")}@gmail.com`;
    await db.prisma.user.create({ data: { name: uniq("D"), fullName: "Deact", email, active: false } });
    const { d, sent } = deps();
    await signUp(d, { name: "X", email, password: PASSWORD });
    expect(sent[0].text).toContain("Can't sign in? Contact your admin. Not you? Ignore this email.");
  });

  it("an email domain without a dot is invalid (I1)", async () => {
    const { d, sent } = deps();
    expect(await errCode(signUp(d, { name: "X", email: "andi@gmail", password: PASSWORD }))).toBe("VALIDATION");
    expect(await errCode(signUp(d, { name: "X", email: "andi@gmail.", password: PASSWORD }))).toBe("VALIDATION");
    expect(await errCode(signUp(d, { name: "X", email: "andi@.com", password: PASSWORD }))).toBe("VALIDATION");
    expect(await errCode(signUp(d, { name: "X", email: "andi@gmail..com", password: PASSWORD }))).toBe("VALIDATION");
    expect(sent).toHaveLength(0);
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
    // Verification is committed; the notice says why no request was made (R4).
    expect(await verifyCode(d, applicantId!, codeOf(sent[0]))).toEqual({ joined: false, notice: "LINK_INVALID" });
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

  it("rejected applicant can't request another workspace either (I4)", async () => {
    const ws = await clogent();
    const other = await db.raw.workspace.create({ data: { name: "Other Co", slug: uniq("other-co"), joinCode: newJoinCode() } });
    const { id } = await verified(`${uniq("rej2")}@gmail.com`, ws.joinCode!);
    await db.raw.applicant.update({ where: { id }, data: { rejectedAt: new Date() } });
    const { d, requested } = deps();
    expect(await errCode(requestJoinByCode(d, id, other.joinCode!))).toBe("REJECTED");
    const row = await db.raw.applicant.findUniqueOrThrow({ where: { id } });
    expect(row.requestedWorkspaceId).toBe("clogent");
    expect(row.rejectedAt).not.toBeNull();
    expect(requested).toHaveLength(0);
  });

  it("deactivated member's email → INACTIVE_MEMBER on requestJoinByCode/verify", async () => {
    const ws = await clogent();
    // verify: the person signed up, then an admin created and deactivated a user with that email.
    const e1 = `${uniq("inact")}@gmail.com`;
    const a = deps();
    const { applicantId } = await signUp(a.d, { name: "A", email: e1, password: PASSWORD });
    await db.prisma.user.create({ data: { name: uniq("I"), fullName: "Inactive", email: e1, active: false } });
    expect(await verifyCode(a.d, applicantId!, codeOf(a.sent[0]))).toEqual({ joined: false, notice: "INACTIVE_MEMBER" });
    expect((await db.raw.applicant.findUniqueOrThrow({ where: { id: applicantId! } })).emailVerifiedAt).not.toBeNull();
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

  it("oauthApplicant replaces an unverified row: fresh id, Google name, no password, no join intent (C2)", async () => {
    const ws = await clogent();
    const { d } = deps();
    const email = `${uniq("gl")}@gmail.com`;
    const { applicantId } = await signUp(d, { name: "Attacker", email, password: PASSWORD, joinCode: ws.joinCode! });
    const requested: string[] = [];
    const a = await oauthApplicant({ db: db.raw, onRequest: async (id) => { requested.push(id); } }, { email, name: "Google Name" });
    expect(a.id).not.toBe(applicantId);
    expect(await db.raw.applicant.findUnique({ where: { id: applicantId! } })).toBeNull();
    expect(a.name).toBe("Google Name");
    expect(a.passwordHash).toBeNull();
    expect(a.pendingJoinCode).toBeNull();
    expect(a.emailVerifiedAt).not.toBeNull();
    expect(a.codeHash).toBeNull();
    expect(a.requestedWorkspaceId).toBeNull();
    expect(requested).toHaveLength(0);
  });

  it("oauthApplicant on an unverified company-domain row still requests by domain", async () => {
    const { d } = deps();
    const email = `${uniq("gld")}@clogent.co.id`;
    await signUp(d, { name: "Someone", email, password: PASSWORD });
    const requested: string[] = [];
    const a = await oauthApplicant({ db: db.raw, onRequest: async (id) => { requested.push(id); } }, { email, name: "Real" });
    expect(a.requestSource).toBe("DOMAIN");
    expect(requested).toEqual([a.id]);
  });

  it("oauthApplicant skips domain routing when the email has an open invite to that workspace (I2/R18)", async () => {
    const email = `${uniq("invd")}@clogent.co.id`;
    const inviter = await db.raw.user.findFirstOrThrow({ where: { workspaceId: "clogent" } }).catch(async () =>
      db.raw.user.create({ data: { name: uniq("Inv"), fullName: "Inviter", email: `${uniq("inv")}@clogent.co.id`, appRole: "ADMIN" } }));
    await db.raw.invite.create({
      data: { email, appRole: "CREATIVE", jobRole: "DESIGNER", tokenHash: `h-${uniq("t")}`, invitedById: inviter.id, workspaceId: "clogent", expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const requested: string[] = [];
    const a = await oauthApplicant({ db: db.raw, onRequest: async (id) => { requested.push(id); } }, { email, name: "Invitee" });
    expect(a.requestedWorkspaceId).toBeNull();
    expect(requested).toHaveLength(0);
    // An expired or revoked invite doesn't count.
    const email2 = `${uniq("invx")}@clogent.co.id`;
    await db.raw.invite.create({
      data: { email: email2, appRole: "CREATIVE", jobRole: "DESIGNER", tokenHash: `h-${uniq("t")}`, invitedById: inviter.id, workspaceId: "clogent", expiresAt: new Date(Date.now() - 1000) },
    });
    const b = await oauthApplicant({ db: db.raw, onRequest: async (id) => { requested.push(id); } }, { email: email2, name: "Late" });
    expect(b.requestSource).toBe("DOMAIN");
  });

  it("a verified code sign-up with an open invite isn't routed by domain either", async () => {
    const email = `${uniq("invc")}@clogent.co.id`;
    const inviter = await db.raw.user.findFirstOrThrow({ where: { workspaceId: "clogent" } });
    await db.raw.invite.create({
      data: { email, appRole: "CREATIVE", jobRole: "DESIGNER", tokenHash: `h-${uniq("t")}`, invitedById: inviter.id, workspaceId: "clogent", expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const { res, requested } = await verified(email);
    expect(res).toEqual({ joined: false });
    expect(requested).toHaveLength(0);
  });

  it("oauthApplicant refuses a deactivated member's email", async () => {
    const email = `${uniq("gin")}@gmail.com`;
    await db.prisma.user.create({ data: { name: uniq("I"), fullName: "Inactive", email, active: false } });
    expect(await errCode(oauthApplicant({ db: db.raw }, { email, name: "X" }))).toBe("INACTIVE_MEMBER");
    expect(await db.raw.applicant.findUnique({ where: { email } })).toBeNull();
  });
});
