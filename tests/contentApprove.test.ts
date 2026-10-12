import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { ContentError } from "@/lib/content/errors";
import { CreateRequestError } from "@/lib/createRequest";
import { createChannelWith } from "@/lib/content/channels";
import { approveDefaults, approveContentPostWith, loadApproveForm, type ApproveInput } from "@/lib/content/approve";
import { setPostMediaWith } from "@/lib/content/posts";
import { transitionRequestWith } from "@/lib/transition";
import type { ContentActor } from "@/lib/content/permissions";

const NOW = new Date("2026-10-12T03:00:00Z"); // 10:00 Jakarta
const jakarta = (d: string) => new Date(`${d}T00:00:00+07:00`);
const base = { surface: "FEED", format: "SINGLE", brief: "Launch teaser", plannedAt: jakarta("2026-10-24"), mockupImageCount: 0, typeId: null } as const;

describe("approveDefaults", () => {
  it("deadline is plannedAt minus 3 days in Jakarta dates", () => {
    expect(approveDefaults(base, "Acme", NOW).deadline).toBe("2026-10-21");
  });
  it("clamps the deadline to today and is null without plannedAt", () => {
    expect(approveDefaults({ ...base, plannedAt: jakarta("2026-10-14") }, "Acme", NOW).deadline).toBe("2026-10-12");
    expect(approveDefaults({ ...base, plannedAt: null }, "Acme", NOW).deadline).toBeNull();
  });
  it("outputs follow the mock-up image count for a carousel, else 1", () => {
    expect(approveDefaults({ ...base, format: "CAROUSEL", mockupImageCount: 3 }, "Acme", NOW).outputCount).toBe(3);
    expect(approveDefaults({ ...base, format: "CAROUSEL", mockupImageCount: 0 }, "Acme", NOW).outputCount).toBe(1);
    expect(approveDefaults({ ...base, mockupImageCount: 3 }, "Acme", NOW).outputCount).toBe(1);
  });
  it("needs motion for a reel or video, not otherwise", () => {
    expect(approveDefaults({ ...base, surface: "REEL" }, "Acme", NOW).needsMotion).toBe(true);
    expect(approveDefaults({ ...base, format: "VIDEO" }, "Acme", NOW).needsMotion).toBe(true);
    expect(approveDefaults(base, "Acme", NOW).needsMotion).toBe(false);
  });
  it("builds the title from the first non-empty brief line and truncates at 80 chars", () => {
    expect(approveDefaults({ ...base, brief: "\n\n  Launch teaser  \nsecond line" }, "Acme", NOW).title).toBe("Acme · Feed · Launch teaser");
    expect(approveDefaults({ ...base, surface: "STORY" }, "Acme", NOW).title).toBe("Acme · Story · Launch teaser");
    const long = "x".repeat(90);
    expect(approveDefaults({ ...base, brief: long }, "Acme", NOW).title).toBe(`Acme · Feed · ${"x".repeat(79)}…`);
    expect(approveDefaults({ ...base, brief: "y".repeat(80) }, "Acme", NOW).title).toBe(`Acme · Feed · ${"y".repeat(80)}`);
  });
});

describe("approve content post", () => {
  let db: TestDb;
  let lead: ContentActor;
  let creative: ContentActor;
  let author: ContentActor;
  let channelId: string;
  let divisionA: string;
  let divisionB: string;
  const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as ContentError | CreateRequestError; } };
  const input = (o: Partial<ApproveInput> = {}): ApproveInput => ({ title: "Approved post", divisionId: divisionA, deadline: "2099-01-01", outputCount: 1, ...o });

  const mkUser = async (email: string, appRole: "LEAD" | "CREATIVE" | "REQUESTER") => {
    const u = await db.prisma.user.create({ data: { email, name: email.split("@")[0], fullName: email, appRole } });
    return { id: u.id, appRole, jobRole: u.jobRole } as ContentActor;
  };
  const submitted = async (o: { media?: ("IMAGE" | "VIDEO")[]; caption?: string | null; by?: ContentActor } = {}) => {
    const p = await db.prisma.contentPost.create({
      data: {
        channelId, surface: "FEED", format: "CAROUSEL", status: "SUBMITTED", position: 1, authorId: (o.by ?? author).id,
        brief: "Launch teaser\nmore", caption: o.caption === undefined ? "Caption text" : o.caption, plannedAt: jakarta("2099-02-01"),
      },
    });
    for (const [order, type] of (o.media ?? []).entries()) {
      const m = await db.prisma.media.create({
        data: { publicId: `clowork/x/content/${p.id}-${order}`, type, width: 1, height: 1, bytes: 100 + order, uploadedById: lead.id },
      });
      await db.prisma.contentPostMedia.create({ data: { postId: p.id, mediaId: m.id, role: "MOCKUP", order } });
    }
    return p.id;
  };

  beforeAll(async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "democloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "k");
    vi.stubEnv("CLOUDINARY_API_SECRET", "s");
    db = await createTestDb();
    lead = await mkUser("alead@clogent.co.id", "LEAD");
    creative = await mkUser("acreative@clogent.co.id", "CREATIVE");
    author = await mkUser("aauthor@clogent.co.id", "CREATIVE");
    const brand = await db.prisma.brand.create({ data: { name: "Approve Brand" } });
    divisionA = (await db.prisma.division.create({ data: { name: "Zeta Division" } })).id;
    divisionB = (await db.prisma.division.create({ data: { name: "Alpha Division" } })).id;
    await db.prisma.requestType.create({ data: { name: "General Design" } });
    channelId = (await createChannelWith(db.prisma, lead, { brandId: brand.id, handle: "approvebrand", displayName: "AB" })).id;
  });
  afterAll(async () => { vi.unstubAllEnvs(); await db?.stop(); });

  it("a lead approves: request for the author, attachments in order, post APPROVED", async () => {
    const id = await submitted({ media: ["IMAGE", "VIDEO"] });
    const { requestId } = await approveContentPostWith(db.prisma, lead, id, input({ outputCount: 2, needsMotion: true }), NOW);
    const req = await db.prisma.request.findUniqueOrThrow({ where: { id: requestId }, include: { attachments: { orderBy: { name: "asc" } }, statusEvents: true } });
    expect(req.requesterId).toBe(author.id);
    expect(req.title).toBe("Approved post");
    expect(req.outputCount).toBe(2);
    expect(req.needsMotion).toBe(true);
    expect(req.notes).toBe("Launch teaser\nmore\n\nCaption draft:\nCaption text");
    expect(req.statusEvents).toHaveLength(1);
    expect(req.statusEvents[0].actorId).toBe(lead.id);
    expect(req.attachments.map((a) => [a.name, a.mimeType, a.sizeBytes, a.uploaderId])).toEqual([
      ["mockup-1.jpg", "image/jpeg", 100, author.id],
      ["mockup-2.mp4", "video/mp4", 101, author.id],
    ]);
    expect(req.attachments[0].url).toBe(`https://res.cloudinary.com/democloud/image/upload/c_limit,w_2048,f_auto,q_auto/clowork/x/content/${id}-0`);
    expect(req.attachments[1].url).toContain("/video/upload/");
    const p = await db.prisma.contentPost.findUniqueOrThrow({ where: { id } });
    expect([p.status, p.requestId, p.approvedById]).toEqual(["APPROVED", requestId, lead.id]);
    expect(p.approvedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("after a cancel, a mock-up the request's attachments still use is not returned for destruction", async () => {
    const id = await submitted({ media: ["IMAGE"] });
    const [link] = await db.prisma.contentPostMedia.findMany({ where: { postId: id } });
    const { requestId } = await approveContentPostWith(db.prisma, lead, id, input(), NOW);
    await transitionRequestWith(db.prisma, lead, requestId, "CANCELLED", {}, async () => {});
    expect((await db.prisma.contentPost.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT");
    const { removedMediaIds } = await setPostMediaWith(db.prisma, author, id, []);
    expect(removedMediaIds).not.toContain(link.mediaId);
    expect(removedMediaIds).toEqual([]);
  });

  it("omits the caption heading when there is no caption", async () => {
    const id = await submitted({ caption: null });
    const { requestId } = await approveContentPostWith(db.prisma, lead, id, input(), NOW);
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: requestId } })).notes).toBe("Launch teaser\nmore");
  });

  it("two simultaneous approvals: one succeeds, one CONFLICT, one request", async () => {
    for (let round = 0; round < 3; round++) {
      const id = await submitted({ media: ["IMAGE"] });
      const before = await db.prisma.request.count();
      const r = await Promise.all([
        code(approveContentPostWith(db.prisma, lead, id, input({ title: `A${round}` }), NOW)),
        code(approveContentPostWith(db.prisma, lead, id, input({ title: `B${round}` }), NOW)),
      ]);
      expect(r.filter((e) => e === null)).toHaveLength(1);
      expect(r.filter((e) => e instanceof ContentError && e.code === "CONFLICT")).toHaveLength(1);
      expect(await db.prisma.request.count()).toBe(before + 1);
      expect(await db.prisma.attachment.count({ where: { request: { title: { in: [`A${round}`, `B${round}`] } } } })).toBe(1);
    }
  });

  it("refuses a second approval, a non-approver, and a post that is not submitted", async () => {
    const id = await submitted();
    await approveContentPostWith(db.prisma, lead, id, input(), NOW);
    expect((await code(approveContentPostWith(db.prisma, lead, id, input(), NOW)))).toMatchObject({ code: "CONFLICT" });
    const id2 = await submitted();
    expect((await code(approveContentPostWith(db.prisma, creative, id2, input(), NOW)))).toMatchObject({ code: "FORBIDDEN" });
    const draft = await db.prisma.contentPost.create({ data: { channelId, surface: "FEED", status: "DRAFT", position: 2, authorId: author.id } });
    expect((await code(approveContentPostWith(db.prisma, lead, draft.id, input(), NOW)))).toMatchObject({ code: "CONFLICT" });
    expect(await db.prisma.contentPost.findUniqueOrThrow({ where: { id: id2 } })).toMatchObject({ status: "SUBMITTED", requestId: null });
  });

  it("an invalid division is a VALIDATION error with field errors and writes nothing", async () => {
    const id = await submitted({ media: ["IMAGE"] });
    const before = await db.prisma.request.count();
    const e = await code(approveContentPostWith(db.prisma, lead, id, input({ divisionId: "nope" }), NOW));
    expect(e).toBeInstanceOf(CreateRequestError);
    expect((e as CreateRequestError).code).toBe("VALIDATION");
    expect((e as CreateRequestError).fieldErrors?.divisionId).toBeTruthy();
    expect(await db.prisma.request.count()).toBe(before);
    expect(await db.prisma.attachment.count({ where: { url: { contains: id } } })).toBe(0);
    expect(await db.prisma.contentPost.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "SUBMITTED", requestId: null });
  });

  it("rejects a bad output count", async () => {
    const id = await submitted();
    const before = await db.prisma.request.count();
    for (const outputCount of [0, 1001, 1.5]) {
      const e = await code(approveContentPostWith(db.prisma, lead, id, input({ outputCount }), NOW));
      expect((e as CreateRequestError).code).toBe("VALIDATION"); // the action maps this to INVALID
      expect((e as CreateRequestError).fieldErrors?.outputCount).toBeTruthy();
    }
    expect(await db.prisma.request.count()).toBe(before);
    expect(await db.prisma.contentPost.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "SUBMITTED", requestId: null });
  });

  it("clamps notes to 5000 chars: brief whole, caption cut with an ellipsis", async () => {
    const brief = "b".repeat(4000);
    const p = await db.prisma.contentPost.create({
      data: { channelId, surface: "FEED", status: "SUBMITTED", position: 3, authorId: author.id, brief, caption: "c".repeat(2000), plannedAt: jakarta("2099-02-01") },
    });
    const { requestId } = await approveContentPostWith(db.prisma, lead, p.id, input(), NOW);
    const notes = (await db.prisma.request.findUniqueOrThrow({ where: { id: requestId } })).notes!;
    expect(notes.length).toBeLessThanOrEqual(5000);
    expect(notes.startsWith(`${brief}\n\nCaption draft:\n`)).toBe(true);
    expect(notes.endsWith("…")).toBe(true);
    const full = await db.prisma.contentPost.create({
      data: { channelId, surface: "FEED", status: "SUBMITTED", position: 4, authorId: author.id, brief: "b".repeat(5000), caption: "cap", plannedAt: jakarta("2099-02-01") },
    });
    const r2 = await approveContentPostWith(db.prisma, lead, full.id, input(), NOW);
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: r2.requestId } })).notes).toBe("b".repeat(5000));
  });

  it("writes nothing when mock-ups exist but storage is not configured", async () => {
    const id = await submitted({ media: ["IMAGE"] });
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");
    const before = await db.prisma.request.count();
    const e = await code(approveContentPostWith(db.prisma, lead, id, input(), NOW));
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "democloud");
    expect(e).toMatchObject({ code: "INVALID", message: "Media storage is not configured" });
    expect(await db.prisma.request.count()).toBe(before);
  });

  it("loadApproveForm drops a suggested type that is no longer active and falls back to the default", async () => {
    const id = await submitted();
    const retired = await db.prisma.requestType.create({ data: { name: "Retired type", active: false } });
    await db.prisma.contentPost.update({ where: { id }, data: { typeId: retired.id } });
    const form = await loadApproveForm(db.prisma, lead, id);
    expect(form.types.some((t) => t.id === retired.id)).toBe(false);
    expect(form.defaults.typeId).toBe(form.types.find((t) => t.name === "General Design")?.id);
  });

  it("loadApproveForm: approver only, SUBMITTED only, division from the author's latest request", async () => {
    const fresh = await mkUser("afresh@clogent.co.id", "CREATIVE"); // no requests yet
    const id = await submitted({ media: ["IMAGE", "IMAGE"], by: fresh });
    expect((await code(loadApproveForm(db.prisma, creative, id)))).toMatchObject({ code: "FORBIDDEN" });
    const first = await loadApproveForm(db.prisma, lead, id);
    expect(first.divisionId).toBe(divisionB); // no requests yet: first division by name
    expect(first.defaults).toMatchObject({ title: "Approve Brand · Feed · Launch teaser", outputCount: 2, needsMotion: false });
    expect(first.defaults.typeId).toBe(first.types.find((t) => t.name === "General Design")?.id);
    const type = first.types[0].id;
    const old = await db.prisma.request.create({ data: { title: "old", brandId: (await db.prisma.brand.findFirstOrThrow()).id, divisionId: divisionA, typeId: type, requesterId: fresh.id, requestedAt: new Date("2026-01-01") } });
    expect(old.id).toBeTruthy();
    expect((await loadApproveForm(db.prisma, lead, id)).divisionId).toBe(divisionA);
    await approveContentPostWith(db.prisma, lead, id, input(), NOW);
    expect((await code(loadApproveForm(db.prisma, lead, id)))).toMatchObject({ code: "CONFLICT" });
  });
});
