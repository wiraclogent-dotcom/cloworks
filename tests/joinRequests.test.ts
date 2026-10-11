import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { AppRole } from "@prisma/client";
import {
  listJoinRequests, approveApplicant, rejectApplicant, undoReject, resetJoinLink, setJoinLinkEnabled, notifyJoinRequest,
} from "@/lib/joinRequests";
import { describeJoinCode, oauthApplicant } from "@/lib/applicants";
import { AdminError, type Actor } from "@/lib/admin";
import type { Mailer } from "@/lib/mailer";
import { JOIN_REQUEST_NOTIFICATION } from "@/lib/notificationLinks";
import { createTestDb, type TestDb } from "./helpers/testDb";

type Msg = { to: string; subject: string; text: string };

let db: TestDb;
let n = 0;
const uniq = (p: string) => `${p}${++n}`;
const BASE = "https://cloworks.test";
const ROLES = { appRole: "CREATIVE" as AppRole, jobRole: "DESIGNER" as const };

let admin: Actor;
let otherAdmin: Actor;
let otherWs: string;

function fakeMailer() {
  const sent: Msg[] = [];
  const mailer: Mailer = { async send(m) { sent.push(m); } };
  return { mailer, sent };
}

async function mkUser(workspaceId: string, appRole: AppRole, active = true) {
  const name = uniq("U");
  return db.raw.user.create({
    data: { name, fullName: name, email: `${name.toLowerCase()}@x.test`, appRole, active, workspaceId },
  });
}

async function mkApplicant(over: { workspaceId?: string | null; verified?: boolean; rejected?: boolean; name?: string } = {}) {
  const email = `${uniq("app")}@gmail.com`;
  return db.raw.applicant.create({
    data: {
      email,
      name: over.name ?? "Andi",
      passwordHash: "scrypt$fake$hash",
      emailVerifiedAt: over.verified === false ? null : new Date(),
      requestedWorkspaceId: over.workspaceId === undefined ? "clogent" : over.workspaceId,
      requestedAt: new Date(),
      requestSource: "DOMAIN",
      rejectedAt: over.rejected ? new Date() : null,
    },
  });
}

const errCode = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AdminError) return e.code;
    throw e;
  }
  return "OK";
};

beforeAll(async () => {
  db = await createTestDb();
  const a = await mkUser("clogent", "ADMIN");
  admin = { id: a.id, appRole: "ADMIN", workspaceId: "clogent" };
  const ws = await db.raw.workspace.create({ data: { name: "Other Co", slug: "other-join", joinCode: "other-code-123" } });
  otherWs = ws.id;
  const oa = await mkUser(ws.id, "ADMIN");
  otherAdmin = { id: oa.id, appRole: "ADMIN", workspaceId: ws.id };
  await db.raw.workspace.update({ where: { id: "clogent" }, data: { joinCode: "clogent-code-123", joinLinkEnabled: true } });
});
afterAll(async () => {
  await db?.stop();
});

describe("join requests", () => {
  it("non-admin → FORBIDDEN on every function", async () => {
    const u = await mkUser("clogent", "LEAD");
    const actor: Actor = { id: u.id, appRole: "LEAD", workspaceId: "clogent" };
    const a = await mkApplicant();
    const { mailer } = fakeMailer();
    expect(await errCode(listJoinRequests(db.raw, actor))).toBe("FORBIDDEN");
    expect(await errCode(approveApplicant(db.raw, actor, mailer, a.id, ROLES, BASE))).toBe("FORBIDDEN");
    expect(await errCode(rejectApplicant(db.raw, actor, a.id))).toBe("FORBIDDEN");
    expect(await errCode(undoReject(db.raw, actor, a.id))).toBe("FORBIDDEN");
    expect(await errCode(resetJoinLink(db.raw, actor))).toBe("FORBIDDEN");
    expect(await errCode(setJoinLinkEnabled(db.raw, actor, false))).toBe("FORBIDDEN");
    expect(await db.raw.applicant.findUnique({ where: { id: a.id } })).not.toBeNull();
  });

  it("admin of another workspace sees no requests and cannot approve (NOT_FOUND)", async () => {
    const a = await mkApplicant();
    const r = await mkApplicant({ rejected: true });
    const { mailer, sent } = fakeMailer();
    const list = await listJoinRequests(db.raw, otherAdmin);
    expect([...list.pending, ...list.rejected].map((x) => x.applicantId)).not.toContain(a.id);
    expect(await errCode(approveApplicant(db.raw, otherAdmin, mailer, a.id, ROLES, BASE))).toBe("NOT_FOUND");
    expect(await errCode(rejectApplicant(db.raw, otherAdmin, a.id))).toBe("NOT_FOUND");
    expect(await errCode(undoReject(db.raw, otherAdmin, r.id))).toBe("NOT_FOUND");
    expect(sent).toHaveLength(0);
    expect(await db.raw.applicant.findUnique({ where: { id: a.id } })).not.toBeNull();
    expect(await db.raw.user.findUnique({ where: { id: a.id } })).toBeNull();
    // and the own admin does see it, newest first, without unverified or lobby applicants
    const unverified = await mkApplicant({ verified: false });
    const lobby = await mkApplicant({ workspaceId: null });
    const own = await listJoinRequests(db.raw, admin);
    const ids = own.pending.map((x) => x.applicantId);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(unverified.id);
    expect(ids).not.toContain(lobby.id);
    expect(own.rejected.map((x) => x.applicantId)).toContain(r.id);
    const times = own.pending.map((x) => x.requestedAt.getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    expect(own.pending.find((x) => x.applicantId === a.id)).toMatchObject({ name: "Andi", email: a.email, source: "DOMAIN", rejectedAt: null });
  });

  it("approve creates User with same id, roles, password hash; applicant gone; approved email sent", async () => {
    const a = await mkApplicant({ name: "Andi Approved" });
    const { mailer, sent } = fakeMailer();
    const { userId } = await approveApplicant(db.raw, admin, mailer, a.id, ROLES, BASE);
    expect(userId).toBe(a.id);
    const u = await db.raw.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(u).toMatchObject({
      email: a.email, fullName: "Andi Approved", appRole: "CREATIVE", jobRole: "DESIGNER",
      passwordHash: "scrypt$fake$hash", passwordVersion: 0, workspaceId: "clogent", active: true,
    });
    expect(u.name).toBeTruthy();
    expect(await db.raw.applicant.findUnique({ where: { id: a.id } })).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(a.email);
    expect(sent[0].text).toContain(`${BASE}/signin`);
  });

  it("approving an email that already belongs to a User → CONFLICT, applicant kept", async () => {
    const a = await mkApplicant();
    await db.raw.user.create({ data: { name: uniq("Dup"), fullName: "Dup", email: a.email, workspaceId: otherWs } });
    const { mailer, sent } = fakeMailer();
    expect(await errCode(approveApplicant(db.raw, admin, mailer, a.id, ROLES, BASE))).toBe("CONFLICT");
    expect(await db.raw.applicant.findUnique({ where: { id: a.id } })).not.toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("approval closes an open invite for the same email in this workspace only (I2/R18)", async () => {
    const a = await mkApplicant();
    const mk = (workspaceId: string, invitedById: string, over: object = {}) => db.raw.invite.create({
      data: { email: a.email, appRole: "REQUESTER", jobRole: "OTHER", tokenHash: `h-${uniq("t")}`, invitedById, workspaceId, expiresAt: new Date(Date.now() + 86_400_000), ...over },
    });
    const mine = await mk("clogent", admin.id);
    const revoked = await mk("clogent", admin.id, { revokedAt: new Date() });
    const theirs = await mk(otherWs, otherAdmin.id);
    const { mailer } = fakeMailer();
    await approveApplicant(db.raw, admin, mailer, a.id, ROLES, BASE);
    expect((await db.raw.invite.findUniqueOrThrow({ where: { id: mine.id } })).acceptedAt).not.toBeNull();
    expect((await db.raw.invite.findUniqueOrThrow({ where: { id: revoked.id } })).acceptedAt).toBeNull();
    expect((await db.raw.invite.findUniqueOrThrow({ where: { id: theirs.id } })).acceptedAt).toBeNull();
  });

  it("a failing mailer does not fail the approval", async () => {
    const a = await mkApplicant();
    const mailer: Mailer = { async send() { throw new Error("smtp down"); } };
    await expect(approveApplicant(db.raw, admin, mailer, a.id, ROLES, BASE)).resolves.toEqual({ userId: a.id });
  });

  it("approving twice in parallel → one User, one NOT_FOUND", async () => {
    const a = await mkApplicant();
    const { mailer, sent } = fakeMailer();
    const res = await Promise.allSettled([
      approveApplicant(db.raw, admin, mailer, a.id, ROLES, BASE),
      approveApplicant(db.raw, admin, mailer, a.id, ROLES, BASE),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = res.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(AdminError);
    expect((rejected[0].reason as AdminError).code).toBe("NOT_FOUND");
    expect(await db.raw.user.count({ where: { id: a.id } })).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("reject → listed under rejected; undo → pending again", async () => {
    const a = await mkApplicant();
    await rejectApplicant(db.raw, admin, a.id);
    let list = await listJoinRequests(db.raw, admin);
    expect(list.rejected.map((x) => x.applicantId)).toContain(a.id);
    expect(list.pending.map((x) => x.applicantId)).not.toContain(a.id);
    expect(list.rejected.find((x) => x.applicantId === a.id)!.rejectedAt).toBeInstanceOf(Date);
    await undoReject(db.raw, admin, a.id);
    list = await listJoinRequests(db.raw, admin);
    expect(list.pending.map((x) => x.applicantId)).toContain(a.id);
    expect(list.rejected.map((x) => x.applicantId)).not.toContain(a.id);
  });

  it("approve a rejected applicant → NOT_FOUND", async () => {
    const a = await mkApplicant({ rejected: true });
    const { mailer } = fakeMailer();
    expect(await errCode(approveApplicant(db.raw, admin, mailer, a.id, ROLES, BASE))).toBe("NOT_FOUND");
    expect(await db.raw.applicant.findUnique({ where: { id: a.id } })).not.toBeNull();
    expect(await db.raw.user.findUnique({ where: { id: a.id } })).toBeNull();
  });

  it("approve an unverified applicant → NOT_FOUND", async () => {
    const a = await mkApplicant({ verified: false });
    const { mailer } = fakeMailer();
    expect(await errCode(approveApplicant(db.raw, admin, mailer, a.id, ROLES, BASE))).toBe("NOT_FOUND");
  });

  it("resetJoinLink returns a new code; old code describeJoinCode → null", async () => {
    const before = (await db.raw.workspace.findUniqueOrThrow({ where: { id: "clogent" } })).joinCode!;
    expect(await describeJoinCode(db.raw, before)).not.toBeNull();
    const code = await resetJoinLink(db.raw, admin);
    expect(code).not.toBe(before);
    expect(await describeJoinCode(db.raw, before)).toBeNull();
    expect(await describeJoinCode(db.raw, code)).toEqual({ workspaceName: expect.any(String) });
    // the other workspace's link is untouched
    expect(await describeJoinCode(db.raw, "other-code-123")).toEqual({ workspaceName: "Other Co" });
  });

  it("setJoinLinkEnabled(false) → describeJoinCode null", async () => {
    const code = (await db.raw.workspace.findUniqueOrThrow({ where: { id: "clogent" } })).joinCode!;
    await setJoinLinkEnabled(db.raw, admin, false);
    expect(await describeJoinCode(db.raw, code)).toBeNull();
    await setJoinLinkEnabled(db.raw, admin, true);
    expect(await describeJoinCode(db.raw, code)).not.toBeNull();
  });

  it("notifyJoinRequest notifies every active admin only", async () => {
    await mkUser("clogent", "ADMIN", false);
    await mkUser("clogent", "REQUESTER");
    const a = await db.raw.applicant.create({
      data: {
        email: "andi.notify@gmail.com", name: "Andi\nNotify", emailVerifiedAt: new Date(),
        requestedWorkspaceId: "clogent", requestedAt: new Date(), requestSource: "LINK",
      },
    });
    const { mailer, sent } = fakeMailer();
    await notifyJoinRequest(db.raw, mailer, a.id);
    const admins = await db.raw.user.findMany({ where: { workspaceId: "clogent", appRole: "ADMIN", active: true } });
    const message = "Andi Notify (andi.notify@gmail.com) asked to join";
    const rows = await db.raw.notification.findMany({ where: { message } });
    expect(rows.map((r) => r.userId).sort()).toEqual(admins.map((u) => u.id).sort());
    expect(rows.every((r) => r.type === JOIN_REQUEST_NOTIFICATION && r.requestId === null && r.workspaceId === "clogent")).toBe(true);
    expect(rows.every((r) => r.emailedAt !== null)).toBe(true);
    expect(sent.map((m) => m.to).sort()).toEqual(admins.map((u) => u.email).sort());
    expect(sent[0].text).toContain(message);
  });

  it("notifyJoinRequest without a requested workspace does nothing", async () => {
    const a = await mkApplicant({ workspaceId: null });
    const { mailer, sent } = fakeMailer();
    await notifyJoinRequest(db.raw, mailer, a.id);
    expect(sent).toHaveLength(0);
    expect(await db.raw.notification.count({ where: { message: { contains: a.email } } })).toBe(0);
  });

  it("a new join request notifies the admins by default (no onRequest given)", async () => {
    await db.raw.workspace.update({ where: { id: "clogent" }, data: { emailDomain: "notify-default.test" } });
    const { mailer, sent } = fakeMailer();
    const row = await oauthApplicant({ db: db.raw, mailer }, { email: "budi@notify-default.test", name: "Budi" });
    expect(row.requestedWorkspaceId).toBe("clogent");
    const rows = await db.raw.notification.findMany({ where: { message: "Budi (budi@notify-default.test) asked to join" } });
    const admins = await db.raw.user.count({ where: { workspaceId: "clogent", appRole: "ADMIN", active: true } });
    expect(rows).toHaveLength(admins);
    expect(sent).toHaveLength(admins);
  });

  it("a failing notification never fails the join request", async () => {
    await db.raw.workspace.update({ where: { id: "clogent" }, data: { emailDomain: "notify-fail.test" } });
    const onRequest = async () => { throw new Error("boom"); };
    const row = await oauthApplicant({ db: db.raw, onRequest }, { email: "cici@notify-fail.test", name: "Cici" });
    expect(row.requestedWorkspaceId).toBe("clogent");
  });

  describe("join-request email link", () => {
    afterEach(() => { vi.unstubAllEnvs(); });
    const LINK = "/admin/users?tab=requests";
    const pending = () => mkApplicant();

    it("uses APP_BASE_URL like the other notifications", async () => {
      vi.stubEnv("APP_BASE_URL", "https://app.example.test/");
      vi.stubEnv("AUTH_URL", "https://auth.example.test");
      const { mailer, sent } = fakeMailer();
      await notifyJoinRequest(db.raw, mailer, (await pending()).id);
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.every((m) => m.text.includes(`https://app.example.test${LINK}`))).toBe(true);
      expect(sent.some((m) => m.text.includes("auth.example.test"))).toBe(false);
    });

    it("an explicit baseUrl wins over APP_BASE_URL", async () => {
      vi.stubEnv("APP_BASE_URL", "https://app.example.test");
      const { mailer, sent } = fakeMailer();
      await notifyJoinRequest(db.raw, mailer, (await pending()).id, "https://given.example.test");
      expect(sent.every((m) => m.text.includes(`https://given.example.test${LINK}`))).toBe(true);
    });

    it("no base at all → no link and no throw", async () => {
      vi.stubEnv("APP_BASE_URL", "");
      vi.stubEnv("AUTH_URL", "https://auth.example.test");
      const { mailer, sent } = fakeMailer();
      await expect(notifyJoinRequest(db.raw, mailer, (await pending()).id)).resolves.toBeUndefined();
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.some((m) => m.text.includes(LINK) || m.text.includes("http"))).toBe(false);
    });

    it("the default applicant notification passes the deps baseUrl", async () => {
      vi.stubEnv("APP_BASE_URL", "");
      await db.raw.workspace.update({ where: { id: "clogent" }, data: { emailDomain: "notify-base.test" } });
      const { mailer, sent } = fakeMailer();
      await oauthApplicant({ db: db.raw, mailer, baseUrl: "https://deps.example.test" }, { email: "dodi@notify-base.test", name: "Dodi" });
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.every((m) => m.text.includes(`https://deps.example.test${LINK}`))).toBe(true);
    });
  });
});
