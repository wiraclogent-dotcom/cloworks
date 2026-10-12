import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AdminError, type Actor } from "@/lib/admin";
import { INVITE_STALE_MESSAGE, acceptInvite, createInvite, describeInvite, resendInvite, revokeInvite } from "@/lib/invites";
import { resolveSignIn } from "@/lib/signin";
import { pickShortName } from "@/lib/shortName";
import { hashToken } from "@/lib/joinTokens";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { Mailer } from "@/lib/mailer";
import { createTestDb, type TestDb } from "./helpers/testDb";

type Msg = { to: string; subject: string; text: string };

let db: TestDb;
let admin: Actor;
let n = 0;
const uniq = (p: string) => `${p}${++n}`;
const BASE = "https://cloworks.test";
const PASSWORD = "correct horse battery";
const DAY = 24 * 3_600_000;

function rec() {
  const sent: Msg[] = [];
  const mailer: Mailer = { async send(m) { sent.push(m); } };
  return { sent, mailer };
}

const tokenOf = (m: Msg) => m.text.match(/\/join\/invite\/([A-Za-z0-9_-]+)/)![1];

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AdminError) return e.code;
    throw e;
  }
  return "OK";
};

/** Creates an invite and returns its id and raw token. */
async function invite(email: string, roles: { appRole?: "REQUESTER" | "CREATIVE" | "LEAD" | "ADMIN"; jobRole?: "DESIGNER" | "SOCIAL_MEDIA" | "OTHER" } = {}) {
  const { sent, mailer } = rec();
  const { id } = await createInvite(db.prisma, admin, mailer, { email, appRole: roles.appRole ?? "CREATIVE", jobRole: roles.jobRole ?? "DESIGNER" }, BASE);
  return { id, token: tokenOf(sent[0]), sent };
}

beforeAll(async () => {
  db = await createTestDb();
  const a = await db.prisma.user.create({ data: { name: "Wira", fullName: "Wira Budi", email: "wira@clogent.co.id", appRole: "ADMIN" } });
  admin = { id: a.id, appRole: "ADMIN", workspaceId: "clogent" };
});
afterAll(async () => {
  await db?.stop();
});

describe("invites", () => {
  it("non-admin cannot create/resend/revoke", async () => {
    const { id } = await invite(`${uniq("x")}@gmail.com`);
    for (const role of ["REQUESTER", "CREATIVE", "LEAD"] as const) {
      const a: Actor = { id: admin.id, appRole: role, workspaceId: "clogent" };
      const { mailer, sent } = rec();
      expect(await code(createInvite(db.prisma, a, mailer, { email: "n@gmail.com", appRole: "REQUESTER", jobRole: "OTHER" }, BASE))).toBe("FORBIDDEN");
      expect(await code(resendInvite(db.prisma, a, mailer, id, BASE))).toBe("FORBIDDEN");
      expect(await code(revokeInvite(db.prisma, a, id))).toBe("FORBIDDEN");
      expect(sent).toHaveLength(0);
    }
  });

  it("create sends one invite email with a /join/invite/ link; DB holds only the hash", async () => {
    const email = `${uniq("new")}@gmail.com`;
    const { id, token, sent } = await invite(email);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].text).toContain(`${BASE}/join/invite/${token}`);
    expect(sent[0].subject).toContain("Wira");
    const row = await db.raw.invite.findUniqueOrThrow({ where: { id } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.invitedById).toBe(admin.id);
    expect(row.workspaceId).toBe("clogent");
  });

  it("inviting a member → CONFLICT", async () => {
    const { mailer, sent } = rec();
    expect(await code(createInvite(db.prisma, admin, mailer, { email: "WIRA@clogent.co.id", appRole: "REQUESTER", jobRole: "OTHER" }, BASE))).toBe("CONFLICT");
    expect(sent).toHaveLength(0);
  });

  it("inviting twice resends the same row (one open invite)", async () => {
    const email = `${uniq("twice")}@gmail.com`;
    const first = await invite(email);
    const second = await invite(email.toUpperCase(), { appRole: "LEAD" });
    expect(second.id).toBe(first.id);
    expect(second.token).not.toBe(first.token);
    expect(await db.raw.invite.count({ where: { email } })).toBe(1);
    expect((await db.raw.invite.findUniqueOrThrow({ where: { id: first.id } })).appRole).toBe("LEAD");
  });

  it("resend replaces the token: the old link is NOT_FOUND", async () => {
    const email = `${uniq("resend")}@gmail.com`;
    const { id, token } = await invite(email);
    const { mailer, sent } = rec();
    await resendInvite(db.prisma, admin, mailer, id, BASE);
    expect(sent).toHaveLength(1);
    const fresh = tokenOf(sent[0]);
    expect(fresh).not.toBe(token);
    expect(await describeInvite(db.raw, token)).toBeNull();
    expect(await code(acceptInvite(db.raw, token, { name: "Old", password: PASSWORD }))).toBe("NOT_FOUND");
    expect((await describeInvite(db.raw, fresh))?.status).toBe("open");
  });

  it("a failed invite email is a VALIDATION error naming the address, and creates no invite (I1)", async () => {
    const email = `${uniq("bounce")}@gmail.com`;
    const failing: Mailer = { async send() { throw new Error("Resend responded 422"); } };
    const e = await createInvite(db.prisma, admin, failing, { email, appRole: "CREATIVE", jobRole: "DESIGNER" }, BASE).catch((x) => x);
    expect(e).toBeInstanceOf(AdminError);
    expect(e.code).toBe("VALIDATION");
    expect(e.message).toBe(`Couldn't email ${email} — check the address.`);
    expect(await db.raw.invite.count({ where: { email } })).toBe(0);
  });

  it("a failed resend keeps the current link and roles working (I1)", async () => {
    const email = `${uniq("bounce2")}@gmail.com`;
    const { id, token } = await invite(email);
    const failing: Mailer = { async send() { throw new Error("Resend responded 500"); } };
    expect(await code(resendInvite(db.prisma, admin, failing, id, BASE))).toBe("VALIDATION");
    expect(await code(createInvite(db.prisma, admin, failing, { email, appRole: "LEAD", jobRole: "OTHER" }, BASE))).toBe("VALIDATION");
    expect((await describeInvite(db.raw, token))?.status).toBe("open");
    expect((await db.raw.invite.findUniqueOrThrow({ where: { id } })).appRole).toBe("CREATIVE");
  });

  it("an email domain without a dot is refused before anything is sent (I1)", async () => {
    const { mailer, sent } = rec();
    expect(await code(createInvite(db.prisma, admin, mailer, { email: "andi@gmail", appRole: "CREATIVE", jobRole: "DESIGNER" }, BASE))).toBe("VALIDATION");
    expect(sent).toHaveLength(0);
  });

  it("revoke → describe status used/expired, accept NOT_FOUND", async () => {
    const email = `${uniq("rev")}@gmail.com`;
    const { id, token } = await invite(email);
    const before = await describeInvite(db.raw, token);
    expect(before).toMatchObject({ status: "open", workspaceName: "Clogent", inviterName: "Wira Budi", appRole: "CREATIVE", jobRole: "DESIGNER", email });
    expect(before!.maskedEmail).toBe(`r***@gmail.com`);
    await revokeInvite(db.prisma, admin, id);
    expect(["used", "expired"]).toContain((await describeInvite(db.raw, token))!.status);
    expect(await code(acceptInvite(db.raw, token, { name: "Rev", password: PASSWORD }))).toBe("NOT_FOUND");
  });

  it("accept with name+password creates the User with invite roles, email lowercased", async () => {
    const { token } = await invite("Sari@Gmail.com", { appRole: "LEAD", jobRole: "SOCIAL_MEDIA" });
    const res = await acceptInvite(db.raw, token, { name: " Sari Dewi ", password: PASSWORD });
    expect(res.email).toBe("sari@gmail.com");
    const u = await db.raw.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(u).toMatchObject({ email: "sari@gmail.com", fullName: "Sari Dewi", name: "Sari Dewi", appRole: "LEAD", jobRole: "SOCIAL_MEDIA", workspaceId: "clogent", active: true });
    expect(await verifyPassword(PASSWORD, u.passwordHash!)).toBe(true);
    expect((await describeInvite(db.raw, token))!.status).toBe("used");
  });

  it("accept by a pending applicant keeps the applicant id as User.id and deletes the applicant", async () => {
    const email = `${uniq("app")}@gmail.com`;
    const hash = await hashPassword(PASSWORD);
    const ap = await db.raw.applicant.create({ data: { email, name: "Andi", passwordHash: hash, requestedWorkspaceId: "clogent", requestedAt: new Date(), requestSource: "LINK" } });
    const { token } = await invite(email);
    const res = await acceptInvite(db.raw, token, { applicantId: ap.id });
    expect(res).toEqual({ userId: ap.id, email, linked: false });
    const u = await db.raw.user.findUniqueOrThrow({ where: { id: ap.id } });
    expect(u).toMatchObject({ email, fullName: "Andi", appRole: "CREATIVE", jobRole: "DESIGNER", passwordHash: hash });
    expect(await db.raw.applicant.findUnique({ where: { id: ap.id } })).toBeNull();
  });

  it("password-path accept over an existing applicant creates a fresh id and deletes the applicant", async () => {
    const email = `${uniq("squat")}@gmail.com`;
    const ap = await db.raw.applicant.create({ data: { email, name: "Squatter", passwordHash: await hashPassword("squatter password") } });
    const { token } = await invite(email);
    const res = await acceptInvite(db.raw, token, { name: "Real Owner", password: PASSWORD });
    expect(res.userId).not.toBe(ap.id);
    expect(await db.raw.user.findUnique({ where: { id: ap.id } })).toBeNull();
    expect(await db.raw.applicant.findUnique({ where: { email } })).toBeNull();
    const u = await db.raw.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(u.fullName).toBe("Real Owner");
    expect(await verifyPassword(PASSWORD, u.passwordHash!)).toBe(true);
  });

  it("accept by an applicant with another email → VALIDATION mentioning the masked email", async () => {
    const ap = await db.raw.applicant.create({ data: { email: `${uniq("other")}@gmail.com`, name: "Other" } });
    const { token } = await invite("target@gmail.com");
    const err = await acceptInvite(db.raw, token, { applicantId: ap.id }).catch((e) => e);
    expect(err).toBeInstanceOf(AdminError);
    expect(err.code).toBe("VALIDATION");
    expect(err.message).toContain("t***@gmail.com");
    expect(await db.raw.applicant.findUnique({ where: { id: ap.id } })).not.toBeNull();
    expect((await describeInvite(db.raw, token))!.status).toBe("open");
  });

  it("password path validates name and password", async () => {
    const { token } = await invite(`${uniq("val")}@gmail.com`);
    expect(await code(acceptInvite(db.raw, token, { name: "  ", password: PASSWORD }))).toBe("VALIDATION");
    expect(await code(acceptInvite(db.raw, token, { name: "Ok", password: "short" }))).toBe("VALIDATION");
  });

  it("an email of an inactive User → FORBIDDEN Contact your admin", async () => {
    const email = `${uniq("gone")}@gmail.com`;
    const { token } = await invite(email);
    await db.prisma.user.create({ data: { name: uniq("Gone"), fullName: "Gone", email, active: false } });
    const err = await acceptInvite(db.raw, token, { name: "Gone", password: PASSWORD }).catch((e) => e);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toContain("Contact your admin");
  });

  it("expired invite (now + 8 days) → NOT_FOUND", async () => {
    const { token } = await invite(`${uniq("exp")}@gmail.com`);
    const later = new Date(Date.now() + 8 * DAY);
    expect((await describeInvite(db.raw, token, later))!.status).toBe("expired");
    expect(await code(acceptInvite(db.raw, token, { name: "Late", password: PASSWORD }, later))).toBe("NOT_FOUND");
  });

  it("accepting twice → second NOT_FOUND", async () => {
    const { token } = await invite(`${uniq("dup")}@gmail.com`);
    const [a, b] = await Promise.allSettled([
      acceptInvite(db.raw, token, { name: "One", password: PASSWORD }),
      acceptInvite(db.raw, token, { name: "Two", password: PASSWORD }),
    ]);
    const ok = [a, b].filter((r) => r.status === "fulfilled");
    const bad = [a, b].filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason.code).toBe("NOT_FOUND");
    expect(await code(acceptInvite(db.raw, token, { name: "Three", password: PASSWORD }))).toBe("NOT_FOUND");
  });

  it("two invites accepted at once with the same name both get distinct short names (M3: roster lock)", async () => {
    const [x, y] = await Promise.all([invite(`${uniq("twinA")}@gmail.com`), invite(`${uniq("twinB")}@gmail.com`)]);
    const [ra, rb] = await Promise.all([
      acceptInvite(db.raw, x.token, { name: "Twin Racer", password: PASSWORD }),
      acceptInvite(db.raw, y.token, { name: "Twin Racer", password: PASSWORD }),
    ]);
    const names = await db.raw.user.findMany({ where: { id: { in: [ra.userId, rb.userId] } }, select: { name: true } });
    expect(new Set(names.map((u) => u.name)).size).toBe(2);
  });

  it("pickShortName falls back to local part then numeric suffix on collision", async () => {
    await db.prisma.user.create({ data: { name: "Budi", fullName: "Budi Santoso", email: "budi.s@clogent.co.id", aliases: ["bsan"] } });
    expect(await pickShortName(db.raw, "clogent", "Free Name", "free@x.com")).toBe("Free Name");
    expect(await pickShortName(db.raw, "clogent", "Budi Santoso", "bsan.k@x.com")).toBe("bsan.k");
    expect(await pickShortName(db.raw, "clogent", "budi", "bsan@x.com")).toBe("bsan2");
    expect(await pickShortName(db.raw, "clogent", "!!!", "zz@x.com")).toBe("zz");
  });
});

describe("invite link column", () => {
  it("stores userId and clears it when the person is deleted", async () => {
    const u = await db.prisma.user.create({ data: { name: uniq("Roster"), fullName: "Roster Person", appRole: "REQUESTER" } });
    const email = `${uniq("link")}@gmail.com`;
    const inv = await db.prisma.invite.create({
      data: { email, appRole: "REQUESTER", jobRole: "OTHER", tokenHash: hashToken("t" + uniq("")), invitedById: admin.id, expiresAt: new Date(Date.now() + DAY), userId: u.id },
    });
    expect(inv.userId).toBe(u.id);
    await db.prisma.user.delete({ where: { id: u.id } });
    const after = await db.raw.invite.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.userId).toBeNull();
  });
});

describe("linked invites", () => {
  const person = (extra: Record<string, unknown> = {}) =>
    db.prisma.user.create({ data: { name: uniq("Person"), fullName: "Full Person", appRole: "REQUESTER", jobRole: "OTHER", ...extra } });
  const linkedInvite = async (userId: string, email = `${uniq("li")}@gmail.com`) => {
    const { sent, mailer } = rec();
    const { id } = await createInvite(db.prisma, admin, mailer, { email, appRole: "CREATIVE", jobRole: "DESIGNER", userId }, BASE);
    return { id, email, token: tokenOf(sent[0]) };
  };

  it("createInvite stores userId; refuses a person with a login; resend with another userId updates it", async () => {
    const a = await person();
    const b = await person();
    const { id, email } = await linkedInvite(a.id);
    expect((await db.raw.invite.findUniqueOrThrow({ where: { id } })).userId).toBe(a.id);
    const withEmail = await person({ email: `${uniq("has")}@gmail.com` });
    const { mailer } = rec();
    expect(await code(createInvite(db.prisma, admin, mailer, { email: `${uniq("z")}@gmail.com`, appRole: "CREATIVE", jobRole: "DESIGNER", userId: withEmail.id }, BASE))).toBe("VALIDATION");
    await createInvite(db.prisma, admin, mailer, { email, appRole: "CREATIVE", jobRole: "DESIGNER", userId: b.id }, BASE);
    expect((await db.raw.invite.findUniqueOrThrow({ where: { id } })).userId).toBe(b.id);
  });

  it("re-inviting the same email without a person clears the old link", async () => {
    const p = await person();
    const { id, email } = await linkedInvite(p.id);
    const { mailer } = rec();
    await createInvite(db.prisma, admin, mailer, { email, appRole: "CREATIVE", jobRole: "DESIGNER" }, BASE);
    expect((await db.raw.invite.findUniqueOrThrow({ where: { id } })).userId).toBeNull();
  });

  it("describeInvite shows linkedName; null when unlinked", async () => {
    const p = await person();
    const { token } = await linkedInvite(p.id);
    expect((await describeInvite(db.raw, token))?.linkedName).toBe(p.name);
    const plain = await invite(`${uniq("pl")}@gmail.com`);
    expect((await describeInvite(db.raw, plain.token))?.linkedName).toBeNull();
  });

  it("accept attaches the login to the person: no new User, roster names kept, roles from the invite", async () => {
    const p = await person({ active: false });
    const { token, email } = await linkedInvite(p.id, `${uniq("Mixed")}@Case.test`);
    const before = await db.raw.user.count();
    const res = await acceptInvite(db.raw, token, { name: "Typed Name", password: PASSWORD });
    expect(res).toMatchObject({ userId: p.id, linked: true, email: email.toLowerCase() });
    expect(await db.raw.user.count()).toBe(before);
    const after = await db.raw.user.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ email: email.toLowerCase(), name: p.name, fullName: "Full Person", appRole: "CREATIVE", jobRole: "DESIGNER", active: true });
    expect(await verifyPassword(PASSWORD, after.passwordHash!)).toBe(true);
  });

  it("accept needs no name for a linked invite", async () => {
    const p = await person();
    const { token } = await linkedInvite(p.id);
    expect(await acceptInvite(db.raw, token, { name: "", password: PASSWORD })).toMatchObject({ userId: p.id, linked: true });
  });

  it("applicant accept keeps the Google-style null hash, deletes the applicant and resolves the sign-in to the person", async () => {
    const p = await person();
    const { token, email } = await linkedInvite(p.id);
    const ap = await db.raw.applicant.create({ data: { email, name: "Andi", passwordHash: null } });
    const res = await acceptInvite(db.raw, token, { applicantId: ap.id });
    expect(res).toMatchObject({ userId: p.id, linked: true });
    expect((await db.raw.user.findUniqueOrThrow({ where: { id: p.id } })).passwordHash).toBeNull();
    expect(await db.raw.applicant.findUnique({ where: { id: ap.id } })).toBeNull();
    const r = await resolveSignIn(db.raw, { email });
    expect(r).toMatchObject({ ok: true, kind: "user" });
    if (r.ok && r.kind === "user") expect(r.user.id).toBe(p.id);
  });

  it("stale link (person got an email since): NOT_FOUND with the stale copy and the invite stays open", async () => {
    const p = await person();
    const { token, email } = await linkedInvite(p.id);
    await db.raw.user.update({ where: { id: p.id }, data: { email: `${uniq("took")}@gmail.com` } });
    const err = await acceptInvite(db.raw, token, { name: "X", password: PASSWORD }).catch((e) => e);
    expect(err).toBeInstanceOf(AdminError);
    expect(err).toMatchObject({ code: "NOT_FOUND", message: INVITE_STALE_MESSAGE });
    expect((await db.raw.invite.findFirstOrThrow({ where: { email } })).acceptedAt).toBeNull();
  });

  it("a deleted person unlinks the invite (onDelete SetNull); it then behaves as a plain invite", async () => {
    const p = await person();
    const { token } = await linkedInvite(p.id);
    await db.raw.user.delete({ where: { id: p.id } });
    expect((await describeInvite(db.raw, token))?.linkedName).toBeNull();
    expect(await acceptInvite(db.raw, token, { name: "Fresh Face", password: PASSWORD })).toMatchObject({ linked: false });
  });
});
