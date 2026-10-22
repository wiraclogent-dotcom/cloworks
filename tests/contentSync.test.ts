import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { RequestStatus } from "@prisma/client";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { createChannelWith } from "@/lib/content/channels";
import { approveContentPostWith } from "@/lib/content/approve";
import { transitionRequestWith } from "@/lib/transition";
import type { ContentActor } from "@/lib/content/permissions";

const NOW = new Date("2026-10-12T03:00:00Z");
const noNotify = async () => {};

describe("request status drives the content post", () => {
  let db: TestDb;
  let lead: ContentActor;
  let author: ContentActor;
  let channelId: string;
  let divisionId: string;

  const mkUser = async (email: string, appRole: "LEAD" | "CREATIVE") => {
    const u = await db.prisma.user.create({ data: { email, name: email.split("@")[0], fullName: email, appRole } });
    return { id: u.id, appRole, jobRole: u.jobRole } as ContentActor;
  };
  const submit = (id: string) => db.prisma.contentPost.update({ where: { id }, data: { status: "SUBMITTED" } });
  const approve = async (id: string) =>
    (await approveContentPostWith(db.prisma, lead, id, { title: "Synced post", divisionId, deadline: "2099-01-01", outputCount: 1 }, NOW)).requestId;
  const approved = async () => {
    const p = await db.prisma.contentPost.create({
      data: { channelId, surface: "FEED", format: "SINGLE", status: "SUBMITTED", position: 1, authorId: author.id, brief: "Teaser", plannedAt: new Date("2099-02-01T00:00:00+07:00") },
    });
    return { postId: p.id, requestId: await approve(p.id) };
  };
  const move = (requestId: string, ...path: RequestStatus[]) =>
    path.reduce((prev, to) => prev.then(() => transitionRequestWith(db.prisma, lead, requestId, to, {}, noNotify)), Promise.resolve());
  const post = (id: string) => db.prisma.contentPost.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    db = await createTestDb();
    lead = await mkUser("slead@clogent.co.id", "LEAD");
    author = await mkUser("sauthor@clogent.co.id", "CREATIVE");
    const brand = await db.prisma.brand.create({ data: { name: "Sync Brand" } });
    divisionId = (await db.prisma.division.create({ data: { name: "Sync Division" } })).id;
    await db.prisma.requestType.create({ data: { name: "General Design" } });
    channelId = (await createChannelWith(db.prisma, lead, { brandId: brand.id, handle: "syncbrand", displayName: "SB" })).id;
  });
  afterAll(async () => { await db?.stop(); });

  it("starting work moves the post to IN_PRODUCTION; later moves that do not apply leave it alone", async () => {
    const { postId, requestId } = await approved();
    expect((await post(postId)).status).toBe("APPROVED");
    await move(requestId, "ON_PROGRESS");
    expect((await post(postId)).status).toBe("IN_PRODUCTION");
    await move(requestId, "FIRST_LOOK");
    expect((await post(postId)).status).toBe("IN_PRODUCTION");
    await move(requestId, "ON_PROGRESS"); // nextStatus is null here: no throw, no change
    expect((await post(postId)).status).toBe("IN_PRODUCTION");
  });

  it("moving back to Requested changes nothing", async () => {
    const { postId, requestId } = await approved();
    await move(requestId, "ON_PROGRESS", "REQUESTED");
    expect((await post(postId)).status).toBe("IN_PRODUCTION");
  });

  it("Done stamps doneAt; reopening returns to IN_PRODUCTION", async () => {
    const { postId, requestId } = await approved();
    await db.prisma.requestAssignee.create({ data: { requestId, userId: lead.id } });
    await move(requestId, "ON_PROGRESS", "FIRST_LOOK", "DONE");
    const done = await post(postId);
    expect(done.status).toBe("DONE");
    expect(done.doneAt).not.toBeNull();
    await move(requestId, "ON_PROGRESS");
    expect(await post(postId)).toMatchObject({ status: "IN_PRODUCTION", doneAt: null });
  });

  it("cancelling sends the post back to DRAFT and frees it; resubmit + approve makes a new request", async () => {
    const { postId, requestId } = await approved();
    await move(requestId, "ON_PROGRESS", "CANCELLED");
    expect(await post(postId)).toMatchObject({ status: "DRAFT", requestId: null, approvedById: null, approvedAt: null, doneAt: null });
    await submit(postId);
    const second = await approve(postId);
    expect(second).not.toBe(requestId);
    expect(await post(postId)).toMatchObject({ status: "APPROVED", requestId: second });
  });

  it("restoring a cancelled request relinks the post it was cancelled from", async () => {
    const { postId, requestId } = await approved();
    await move(requestId, "CANCELLED");
    expect(await post(postId)).toMatchObject({ status: "DRAFT", requestId: null, cancelledRequestId: requestId });
    await move(requestId, "REQUESTED");
    expect(await post(postId)).toMatchObject({ status: "APPROVED", requestId, cancelledRequestId: null });
    // The relinked post follows the request again.
    await move(requestId, "ON_PROGRESS");
    expect((await post(postId)).status).toBe("IN_PRODUCTION");
  });

  it("restoring a cancelled request re-stamps the approval so the post counts again", async () => {
    const { postId, requestId } = await approved();
    await move(requestId, "CANCELLED");
    expect((await post(postId)).approvedAt).toBeNull();
    await move(requestId, "REQUESTED");
    const restored = await post(postId);
    expect(restored.status).toBe("APPROVED");
    // Stamped with the transition's own time, the same instant as its status event.
    const restoredAt = (await db.prisma.statusEvent.findFirstOrThrow({ where: { requestId, from: "CANCELLED", to: "REQUESTED" } })).at;
    expect(restored.approvedAt).toEqual(restoredAt);
    expect(restored.approvedById).toBeNull();
  });

  it("restoring leaves a post that was resubmitted since the cancel alone", async () => {
    const { postId, requestId } = await approved();
    await move(requestId, "CANCELLED");
    await submit(postId);
    await move(requestId, "REQUESTED");
    expect(await post(postId)).toMatchObject({ status: "SUBMITTED", requestId: null });
  });

  it("restoring the old request leaves a post approved into a new one linked to the new one", async () => {
    const { postId, requestId } = await approved();
    await move(requestId, "CANCELLED");
    await submit(postId);
    const second = await approve(postId);
    expect(await post(postId)).toMatchObject({ status: "APPROVED", requestId: second, cancelledRequestId: null });
    await move(requestId, "REQUESTED");
    expect(await post(postId)).toMatchObject({ status: "APPROVED", requestId: second });
  });

  it("cancelling a DONE request clears doneAt", async () => {
    const { postId, requestId } = await approved();
    await db.prisma.requestAssignee.create({ data: { requestId, userId: lead.id } });
    await move(requestId, "ON_PROGRESS", "FIRST_LOOK", "DONE", "CANCELLED");
    expect(await post(postId)).toMatchObject({ status: "DRAFT", requestId: null, doneAt: null });
  });

  it("a request with no post transitions normally", async () => {
    const r = await db.prisma.request.create({
      data: {
        title: "Plain", brandId: (await db.prisma.brand.findFirstOrThrow()).id, requesterId: author.id, divisionId,
        typeId: (await db.prisma.requestType.findFirstOrThrow()).id, deadline: new Date("2099-01-01"), outputCount: 1,
      },
    });
    await move(r.id, "ON_PROGRESS");
    expect((await db.prisma.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("ON_PROGRESS");
  });
});
