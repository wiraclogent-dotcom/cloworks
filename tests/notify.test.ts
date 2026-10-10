import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { notifyWith, buildMessage, type Mailer, type NotifyInput } from "@/lib/notify";
import { createMailerFromEnv } from "@/lib/mailer";
import { addAttachmentWith, addCommentWith, assignRequestWith } from "@/lib/collab";
import { transitionRequestWith } from "@/lib/transition";
import { createTestDb, type TestDb } from "./helpers/testDb";

type Sent = { to: string; subject: string; text: string };
const recorder = (failFor: string[] = []) => {
  const sent: Sent[] = [];
  const mailer: Mailer = {
    async send(m) {
      if (failFor.includes(m.to)) throw new Error("boom");
      sent.push(m);
    },
  };
  return { sent, mailer };
};

describe("notifications", () => {
  let db: TestDb;
  const ids: Record<string, string> = {};
  let reqId: string, evilId: string;

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const mk = async (k: string, appRole: "REQUESTER" | "CREATIVE" | "LEAD", extra: { email?: string | null; active?: boolean; aliases?: string[] } = {}) => {
      ids[k] = (await p.user.create({ data: { email: k === "noemail" ? null : `${k}@clogent.co.id`, name: k[0].toUpperCase() + k.slice(1), fullName: k, appRole, jobRole: appRole === "CREATIVE" ? "DESIGNER" : "OTHER", ...extra } })).id;
    };
    await mk("rina", "REQUESTER");
    await mk("dimas", "CREATIVE");
    await mk("irsyad", "CREATIVE");
    await mk("lia", "LEAD");
    await mk("gone", "CREATIVE", { active: false });
    await mk("noemail", "CREATIVE");
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    const base = { brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: ids.rina };
    reqId = (await p.request.create({ data: { ...base, title: "Poster" } })).id;
    evilId = (await p.request.create({ data: { ...base, title: "Hi\r\nBcc: evil@x.com " + "x".repeat(300) } })).id;
  });
  afterAll(async () => { await db?.stop(); });
  beforeEach(async () => { await db.prisma.notification.deleteMany(); });

  const input = (o: Partial<NotifyInput> = {}): NotifyInput => ({ actorId: ids.lia, userIds: [ids.dimas], requestId: reqId, type: "ASSIGNED", message: "Lia assigned you to “Poster”", ...o });
  const rows = () => db.prisma.notification.findMany();

  describe("notifyWith", () => {
    it("excludes the actor", async () => {
      const { sent, mailer } = recorder();
      await notifyWith(db.prisma, mailer, input({ actorId: ids.dimas }), { baseUrl: undefined });
      expect(await rows()).toHaveLength(0);
      expect(sent).toHaveLength(0);
    });
    it("excludes inactive users and dedupes ids", async () => {
      const { sent, mailer } = recorder();
      await notifyWith(db.prisma, mailer, input({ userIds: [ids.dimas, ids.dimas, ids.gone] }));
      const r = await rows();
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ userId: ids.dimas, type: "ASSIGNED", requestId: reqId });
      expect(sent).toHaveLength(1);
    });
    it("writes a row but sends no mail for a user without email", async () => {
      const { sent, mailer } = recorder();
      await notifyWith(db.prisma, mailer, input({ userIds: [ids.noemail] }));
      const r = await rows();
      expect(r).toHaveLength(1);
      expect(r[0].emailedAt).toBeNull();
      expect(sent).toHaveLength(0);
    });
    it("emails users with an address and sets emailedAt, with a link when baseUrl is valid", async () => {
      const { sent, mailer } = recorder();
      await notifyWith(db.prisma, mailer, input(), { baseUrl: "https://t.example.com/" });
      expect(sent[0].to).toBe("dimas@clogent.co.id");
      expect(sent[0].subject).toBe("Assigned to you: Poster");
      expect(sent[0].text).toContain(`https://t.example.com/requests/${reqId}`);
      expect((await rows())[0].emailedAt).toBeInstanceOf(Date);
    });
    it("sends no link for a missing or non-http base URL", async () => {
      for (const baseUrl of [undefined, "javascript:alert(1)", "not a url"]) {
        const { sent, mailer } = recorder();
        await notifyWith(db.prisma, mailer, input(), { baseUrl });
        expect(sent[0].text).not.toContain("/requests/");
      }
    });
    it("one failing mailer recipient does not stop others and never throws", async () => {
      const { sent, mailer } = recorder(["dimas@clogent.co.id"]);
      vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(notifyWith(db.prisma, mailer, input({ userIds: [ids.dimas, ids.irsyad] }))).resolves.toBeUndefined();
      expect(sent.map((s) => s.to)).toEqual(["irsyad@clogent.co.id"]);
      const r = await rows();
      expect(r).toHaveLength(2);
      expect(r.find((x) => x.userId === ids.dimas)!.emailedAt).toBeNull();
      expect(r.find((x) => x.userId === ids.irsyad)!.emailedAt).not.toBeNull();
      vi.restoreAllMocks();
    });
    it("does not throw on a database error", async () => {
      const { mailer } = recorder();
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const broken = { user: { findMany: async () => { throw new Error("db down"); } }, request: { findUnique: async () => null } } as never;
      await expect(notifyWith(broken, mailer, input())).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalled();
      vi.restoreAllMocks();
    });
    it("neutralizes header injection and caps the subject", async () => {
      const { sent, mailer } = recorder();
      await notifyWith(db.prisma, mailer, input({ requestId: evilId, message: "x\r\nBcc: a@b.c" }));
      expect(sent[0].subject).not.toMatch(/[\r\n]/);
      expect(sent[0].subject.length).toBeLessThanOrEqual(160);
      expect(sent[0].text.split("\n")[0]).not.toMatch(/\r/);
    });

    it("email: false stores the row and sends no mail", async () => {
      const { sent, mailer } = recorder();
      await notifyWith(db.prisma, mailer, input({ type: "ATTACHMENT", email: false }));
      const r = await rows();
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ userId: ids.dimas, type: "ATTACHMENT" });
      expect(r[0].emailedAt).toBeNull();
      expect(sent).toHaveLength(0);
    });
  });

  describe("notifyWith deadline and parallelism", () => {
    const never = () => new Promise<void>(() => {});
    it("returns near the deadline when the mailer hangs; rows kept, emailedAt null", async () => {
      const t0 = Date.now();
      vi.spyOn(console, "error").mockImplementation(() => {});
      await notifyWith(db.prisma, { send: never }, input(), { baseUrl: undefined, deadlineMs: 50 });
      expect(Date.now() - t0).toBeLessThan(2000); // 50 ms deadline; generous bound so slow CI cannot flake
      const r = await rows();
      expect(r).toHaveLength(1);
      expect(r[0].emailedAt).toBeNull();
      vi.restoreAllMocks();
    });
    it("a hanging recipient does not block a fast one", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const mailer: Mailer = { send: (m) => (m.to.startsWith("dimas") ? never() : Promise.resolve()) };
      await notifyWith(db.prisma, mailer, input({ userIds: [ids.dimas, ids.irsyad] }), { baseUrl: undefined, deadlineMs: 300 });
      const r = await rows();
      expect(r.find((x) => x.userId === ids.irsyad)!.emailedAt).not.toBeNull();
      expect(r.find((x) => x.userId === ids.dimas)!.emailedAt).toBeNull();
      vi.restoreAllMocks();
    });
    it("sends to recipients in parallel", async () => {
      // Assert overlap (all three sends in flight at once) rather than elapsed wall-clock time. Each send waits at a
      // barrier until the other two have started, so the overlap is deterministic (no 200 ms race under load).
      let inFlight = 0, maxInFlight = 0, started = 0;
      let release!: () => void;
      const barrier = new Promise<void>((r) => { release = r; });
      const mailer: Mailer = { send: async () => {
        inFlight++; started++; maxInFlight = Math.max(maxInFlight, inFlight);
        if (started === 3) release();
        await Promise.race([barrier, new Promise((r) => setTimeout(r, 2000))]);
        inFlight--;
      } };
      await notifyWith(db.prisma, mailer, input({ userIds: [ids.dimas, ids.irsyad, ids.rina] }), { baseUrl: undefined });
      expect(maxInFlight).toBe(3);
      expect(await rows()).toHaveLength(3);
    });
  });

  describe("createMailerFromEnv", () => {
    it("rejects when the fetch hangs past the timeout", async () => {
      const f = (_u: string, init: RequestInit) =>
        new Promise<{ ok: boolean; status: number }>((_, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))));
      await expect(
        createMailerFromEnv({ RESEND_API_KEY: "k", EMAIL_FROM: "f" }, f, 30).send({ to: "a@b.c", subject: "s", text: "t" }),
      ).rejects.toThrow();
    });
    it("is a no-op without keys", async () => {
      const f = vi.fn();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await createMailerFromEnv({}, f).send({ to: "a@b.c", subject: "s", text: "t" });
      await createMailerFromEnv({ RESEND_API_KEY: "k" }, f).send({ to: "a@b.c", subject: "s", text: "t" });
      expect(f).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });
    it("posts to Resend with auth and JSON body", async () => {
      const f = vi.fn(async () => ({ ok: true, status: 200 }));
      await createMailerFromEnv({ RESEND_API_KEY: "key1", EMAIL_FROM: "T <n@x.com>" }, f).send({ to: "a@b.c", subject: "s", text: "t" });
      const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.resend.com/emails");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key1");
      expect(JSON.parse(init.body as string)).toEqual({ from: "T <n@x.com>", to: ["a@b.c"], subject: "s", text: "t" });
      expect(init.signal).toBeDefined();
    });
    it("throws on a non-2xx response", async () => {
      const f = vi.fn(async () => ({ ok: false, status: 500 }));
      await expect(createMailerFromEnv({ RESEND_API_KEY: "k", EMAIL_FROM: "f" }, f).send({ to: "a@b.c", subject: "s", text: "t" })).rejects.toThrow(/500/);
    });
  });

  describe("wiring", () => {
    const calls: NotifyInput[] = [];
    const notifier = async (i: NotifyInput) => { calls.push(i); };
    const lead = () => ({ id: ids.lia, appRole: "LEAD" as const });
    beforeEach(async () => {
      calls.length = 0;
      await db.prisma.request.update({ where: { id: reqId }, data: { assigneeId: null, status: "REQUESTED" } });
    });

    it("assign notifies only the new assignee; not on unassign or same assignee", async () => {
      await assignRequestWith(db.prisma, lead(), reqId, ids.dimas, notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ userIds: [ids.dimas], type: "ASSIGNED", actorId: ids.lia, requestId: reqId });
      expect(calls[0].message).toBe("Lia assigned you to “Poster”");
      await assignRequestWith(db.prisma, lead(), reqId, ids.dimas, notifier);
      await assignRequestWith(db.prisma, lead(), reqId, null, notifier);
      expect(calls).toHaveLength(1);
    });
    it("failed assignment does not notify", async () => {
      await assignRequestWith(db.prisma, { id: ids.rina, appRole: "REQUESTER" }, reqId, ids.dimas, notifier);
      expect(calls).toHaveLength(0);
    });
    it("comment: mention beats comment, requester/assignee get COMMENT, author excluded", async () => {
      await db.prisma.request.update({ where: { id: reqId }, data: { assigneeId: ids.irsyad } });
      await addCommentWith(db.prisma, { id: ids.dimas, appRole: "CREATIVE" }, reqId, "ping @Irsyad please", new Date(), notifier);
      const m = calls.find((c) => c.type === "MENTION")!;
      const c = calls.find((c) => c.type === "COMMENT")!;
      expect(m.userIds).toEqual([ids.irsyad]);
      expect(c.userIds).toEqual([ids.rina]);
      expect(c.message).toBe("Dimas commented on “Poster”");
      expect(m.message).toBe("Dimas mentioned you in “Poster”");
    });
    it("comment by the requester notifies the assignee only", async () => {
      await db.prisma.request.update({ where: { id: reqId }, data: { assigneeId: ids.irsyad } });
      await addCommentWith(db.prisma, { id: ids.rina, appRole: "REQUESTER" }, reqId, "hello", new Date(), notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0].userIds).toEqual([ids.irsyad]);
    });
    it("comment: mention and comment notifications run concurrently", async () => {
      await db.prisma.request.update({ where: { id: reqId }, data: { assigneeId: ids.lia } });
      const started: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const slow = async (i: NotifyInput) => { started.push(i.type); await gate; };
      const p = addCommentWith(db.prisma, { id: ids.dimas, appRole: "CREATIVE" }, reqId, "cc @Irsyad", new Date(), slow);
      await new Promise((r) => setTimeout(r, 100));
      expect(started.sort()).toEqual(["COMMENT", "MENTION"]);
      release();
      await p;
    });
    it("comment: requester also mentioned gets MENTION only", async () => {
      await addCommentWith(db.prisma, { id: ids.dimas, appRole: "CREATIVE" }, reqId, "hi @Rina", new Date(), notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: "MENTION", userIds: [ids.rina] });
    });
    it("comment: requester == assignee gets exactly one COMMENT", async () => {
      await db.prisma.request.update({ where: { id: reqId }, data: { assigneeId: ids.rina } });
      await addCommentWith(db.prisma, { id: ids.dimas, appRole: "CREATIVE" }, reqId, "hello", new Date(), notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0].userIds).toEqual([ids.rina]);
    });
    it("comment: author == requester is not notified", async () => {
      await addCommentWith(db.prisma, { id: ids.rina, appRole: "REQUESTER" }, reqId, "note", new Date(), notifier);
      expect(calls.flatMap((c) => c.userIds)).not.toContain(ids.rina);
    });
    it("transition notifies requester and distinct assignee; failing notifier does not fail it", async () => {
      await db.prisma.request.update({ where: { id: reqId }, data: { assigneeId: ids.irsyad } });
      await transitionRequestWith(db.prisma, { id: ids.dimas, appRole: "CREATIVE" }, reqId, "ON_PROGRESS", {}, notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: "STATUS", actorId: ids.dimas });
      expect(new Set(calls[0].userIds)).toEqual(new Set([ids.rina, ids.irsyad]));
      expect(calls[0].message).toBe("Dimas moved “Poster” from Requested to On progress");
      vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(
        transitionRequestWith(db.prisma, { id: ids.dimas, appRole: "CREATIVE" }, reqId, "FIRST_LOOK", {}, async () => { throw new Error("x"); }),
      ).resolves.toBeUndefined();
      expect((await db.prisma.request.findUnique({ where: { id: reqId } }))!.status).toBe("FIRST_LOOK");
      vi.restoreAllMocks();
    });
    it("moving to First Look sends DESIGN_SENT to the requester, not the actor", async () => {
      await db.prisma.request.update({ where: { id: reqId }, data: { assigneeId: ids.dimas, status: "ON_PROGRESS" } });
      await transitionRequestWith(db.prisma, { id: ids.dimas, appRole: "CREATIVE" }, reqId, "FIRST_LOOK", {}, notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: "DESIGN_SENT", userIds: [ids.rina], actorId: ids.dimas });
      expect(calls[0].message).toBe("Dimas sent the design for “Poster” for review");
    });
    it("adding a link sends ATTACHMENT in-app only to requester, not the actor", async () => {
      await db.prisma.request.update({ where: { id: reqId }, data: { assigneeId: ids.dimas } });
      const r = await addAttachmentWith(db.prisma, { id: ids.dimas, appRole: "CREATIVE" }, reqId, { name: "Final v2", url: "https://drive.google.com/x" }, notifier);
      expect(r.ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: "ATTACHMENT", userIds: [ids.rina], email: false, requestId: reqId });
      expect(calls[0].message).toBe("Dimas added a design link “Final v2” to “Poster”");
    });
    it("adding a link: a throwing notifier does not fail it", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await db.prisma.request.update({ where: { id: reqId }, data: { assigneeId: ids.dimas } });
      const r = await addAttachmentWith(db.prisma, { id: ids.rina, appRole: "REQUESTER" }, reqId, { name: "Ref", url: "https://x.example.com" }, async () => { throw new Error("x"); });
      expect(r.ok).toBe(true);
      vi.restoreAllMocks();
    });
  });
});

describe("buildMessage DEADLINE", () => {
  it("describes a move and a first-time set", () => {
    expect(buildMessage("DEADLINE", "Wira", "Banner", { from: "10 Oct", to: "14 Oct" })).toBe("Wira moved the deadline of “Banner” from 10 Oct to 14 Oct");
    expect(buildMessage("DEADLINE", "Wira", "Banner", { from: "", to: "14 Oct" })).toBe("Wira set the deadline of “Banner” to 14 Oct");
  });
});

describe("buildMessage DESIGN_SENT and ATTACHMENT", () => {
  it("says the design was sent for review", () => {
    expect(buildMessage("DESIGN_SENT", "Dimas", "Banner")).toBe("Dimas sent the design for “Banner” for review");
  });
  it("names the added design link", () => {
    expect(buildMessage("ATTACHMENT", "Dimas", "Banner", undefined, { name: "Final v2" })).toBe("Dimas added a design link “Final v2” to “Banner”");
  });
});
