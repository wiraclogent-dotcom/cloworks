import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { requestPasswordReset, resetPassword, isResetLinkUsable, RESET_TTL_MS } from "@/lib/passwordReset";
import { authenticateWithPassword } from "@/lib/passwordAuth";
import { hashPassword } from "@/lib/password";
import { hashToken } from "@/lib/joinTokens";
import { createTestDb, type TestDb } from "./helpers/testDb";

const OLD = "OldPassword-2026";
const NEW = "NewPassword-2026";
let db: TestDb;
let n = 0;
const uniq = (p: string) => `${p}${++n}`;

function fakeMailer() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return { sent, mailer: { send: async (m: { to: string; subject: string; text: string }) => void sent.push(m) } };
}
const tokenFrom = (text: string) => text.match(/\/reset\/([A-Za-z0-9_-]+)/)?.[1] ?? "";

async function mkUser(over: Record<string, unknown> = {}) {
  const name = uniq("U");
  return db.raw.user.create({
    data: {
      workspaceId: db.workspaceId, name, fullName: name, email: `${name.toLowerCase()}@clogent.co.id`, appRole: "REQUESTER", jobRole: "OTHER",
      passwordHash: await hashPassword(OLD), ...over,
    },
  });
}

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.stop();
});

describe("requestPasswordReset", () => {
  it("sends nothing and creates nothing for an unknown address (same result as a known one)", async () => {
    const { sent, mailer } = fakeMailer();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test" }, "nobody-here@clogent.co.id");
    expect(sent).toHaveLength(0);
    expect(await db.raw.passwordReset.count({ where: { email: "nobody-here@clogent.co.id" } })).toBe(0);
  });

  it("emails a link to an active member and stores only the hash", async () => {
    const u = await mkUser();
    const { sent, mailer } = fakeMailer();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test" }, u.email!.toUpperCase());
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(u.email);
    const token = tokenFrom(sent[0].text);
    expect(token).not.toBe("");
    const row = await db.raw.passwordReset.findFirstOrThrow({ where: { email: u.email! } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toContain(token);
  });

  it("sends nothing to a deactivated member", async () => {
    const u = await mkUser({ active: false });
    const { sent, mailer } = fakeMailer();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test" }, u.email!);
    expect(sent).toHaveLength(0);
  });

  it("rate-limits to one link per address per minute", async () => {
    const u = await mkUser();
    const { sent, mailer } = fakeMailer();
    const now = new Date();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test", now }, u.email!);
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test", now: new Date(now.getTime() + 30_000) }, u.email!);
    expect(sent).toHaveLength(1);
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test", now: new Date(now.getTime() + 61_000) }, u.email!);
    expect(sent).toHaveLength(2);
    expect(await db.raw.passwordReset.count({ where: { email: u.email!, usedAt: null } })).toBe(1);
  });

  it("sends a link without a URL when no base URL is configured (no bare path, no throw)", async () => {
    const u = await mkUser();
    const { sent, mailer } = fakeMailer();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "" }, u.email!);
    expect(sent[0].text).not.toMatch(/\/reset\//);
    expect(sent[0].text).toMatch(/could not be created/);
  });
});

describe("resetPassword", () => {
  it("sets the new password, ends old sessions and clears a lockout", async () => {
    const u = await mkUser({ failedLogins: 3, lockedUntil: new Date(Date.now() + 600_000) });
    const { sent, mailer } = fakeMailer();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test" }, u.email!);
    const token = tokenFrom(sent[0].text);
    await resetPassword({ db: db.raw }, token, NEW);
    const after = await db.raw.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.passwordVersion).toBe(u.passwordVersion + 1);
    expect(after.lockedUntil).toBeNull();
    expect(after.failedLogins).toBe(0);
    expect(await authenticateWithPassword(db.raw, u.email!, NEW)).not.toBeNull();
    expect(await authenticateWithPassword(db.raw, u.email!, OLD)).toBeNull();
  });

  it("works once: a used link is refused", async () => {
    const u = await mkUser();
    const { sent, mailer } = fakeMailer();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test" }, u.email!);
    const token = tokenFrom(sent[0].text);
    await resetPassword({ db: db.raw }, token, NEW);
    await expect(resetPassword({ db: db.raw }, token, "AnotherPassword-2026")).rejects.toMatchObject({ code: "LINK_INVALID" });
    expect(await isResetLinkUsable(db.raw, token)).toBe(false);
  });

  it("refuses an expired link", async () => {
    const u = await mkUser();
    const { sent, mailer } = fakeMailer();
    const now = new Date();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test", now }, u.email!);
    const token = tokenFrom(sent[0].text);
    const later = new Date(now.getTime() + RESET_TTL_MS + 1_000);
    expect(await isResetLinkUsable(db.raw, token, later)).toBe(false);
    await expect(resetPassword({ db: db.raw, now: later }, token, NEW)).rejects.toMatchObject({ code: "LINK_INVALID" });
  });

  it("a weak password is refused and the link is still usable", async () => {
    const u = await mkUser();
    const { sent, mailer } = fakeMailer();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test" }, u.email!);
    const token = tokenFrom(sent[0].text);
    await expect(resetPassword({ db: db.raw }, token, "short")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await isResetLinkUsable(db.raw, token)).toBe(true);
  });

  it("a deactivated member's old link no longer works", async () => {
    const u = await mkUser();
    const { sent, mailer } = fakeMailer();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test" }, u.email!);
    const token = tokenFrom(sent[0].text);
    await db.raw.user.update({ where: { id: u.id }, data: { active: false } });
    await expect(resetPassword({ db: db.raw }, token, NEW)).rejects.toMatchObject({ code: "LINK_INVALID" });
    expect(await isResetLinkUsable(db.raw, token)).toBe(true);
  });

  it("an applicant can reset and is verified by the link", async () => {
    const email = `${uniq("ap")}@gmail.com`;
    await db.raw.applicant.create({ data: { email, name: "Applicant" } });
    const { sent, mailer } = fakeMailer();
    await requestPasswordReset({ db: db.raw, mailer, baseUrl: "https://x.test" }, email);
    expect(sent).toHaveLength(1);
    await resetPassword({ db: db.raw }, tokenFrom(sent[0].text), NEW);
    const ap = await db.raw.applicant.findUniqueOrThrow({ where: { email } });
    expect(ap.emailVerifiedAt).not.toBeNull();
    expect(await authenticateWithPassword(db.raw, email, NEW)).not.toBeNull();
  });
});

describe("reset pages are public", () => {
  it("/forgot and /reset/<token> are open to anonymous visitors, applicants and members", async () => {
    const { routeDecision } = await import("@/lib/auth.config");
    for (const kind of ["anonymous", "applicant", "member"] as const) {
      expect(routeDecision("/forgot", kind)).toBe(true);
      expect(routeDecision("/reset/abc123DEF_-xyz", kind)).toBe(true);
    }
  });
});
