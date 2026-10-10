import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { RequestStatus } from "@prisma/client";
import { canTransition } from "@/lib/workflow";
import { transitionRequestWith } from "@/lib/transition";
import { runTransitionAction } from "@/lib/transition-action";
import { createTestDb, type TestDb } from "./helpers/testDb";

const ALL: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE", "CANCELLED"];
const ALLOWED: [RequestStatus, RequestStatus][] = [
  ["REQUESTED", "ON_PROGRESS"],
  ["ON_PROGRESS", "REQUESTED"],
  ["ON_PROGRESS", "FIRST_LOOK"],
  ["FIRST_LOOK", "DONE"],
  ["FIRST_LOOK", "ON_PROGRESS"],
  ["DONE", "ON_PROGRESS"],
  ["REQUESTED", "CANCELLED"],
  ["ON_PROGRESS", "CANCELLED"],
  ["FIRST_LOOK", "CANCELLED"],
  ["DONE", "CANCELLED"],
];

describe("canTransition", () => {
  it.each(ALLOWED)("allows %s -> %s", (a, b) => expect(canTransition(a, b)).toBe(true));
  it("rejects every other pair", () => {
    for (const a of ALL)
      for (const b of ALL) {
        const expected = ALLOWED.some(([x, y]) => x === a && y === b);
        expect(canTransition(a, b), `${a}->${b}`).toBe(expected);
      }
  });
  it("negative cases", () => {
    expect(canTransition("REQUESTED", "DONE")).toBe(false);
    expect(canTransition("ON_PROGRESS", "DONE")).toBe(false);
    expect(canTransition("CANCELLED", "ON_PROGRESS")).toBe(false);
    expect(canTransition("DONE", "DONE")).toBe(false);
  });
});

describe("transitionRequestWith", () => {
  let db: TestDb;
  let creative: { id: string; appRole: "CREATIVE" };
  let requester: { id: string; appRole: "REQUESTER" };
  let brandId: string, divisionId: string, typeId: string;
  let seq = 0;

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const c = await p.user.create({ data: { email: "c@clogent.co.id", name: "C", fullName: "C", appRole: "CREATIVE" } });
    const r = await p.user.create({ data: { email: "r@clogent.co.id", name: "R", fullName: "R" } });
    creative = { id: c.id, appRole: "CREATIVE" };
    requester = { id: r.id, appRole: "REQUESTER" };
    brandId = (await p.brand.create({ data: { name: "B" } })).id;
    divisionId = (await p.division.create({ data: { name: "D" } })).id;
    typeId = (await p.requestType.create({ data: { name: "T" } })).id;
  });
  afterAll(async () => {
    await db?.stop();
  });

  async function mk(status: RequestStatus, assigned = true) {
    return db.prisma.request.create({
      data: {
        title: `r${++seq}`,
        brandId,
        divisionId,
        typeId,
        requesterId: requester.id,
        assigneeId: assigned ? creative.id : null,
        status,
      },
    });
  }
  const events = (id: string) => db.prisma.statusEvent.findMany({ where: { requestId: id } });
  const status = async (id: string) => (await db.prisma.request.findUniqueOrThrow({ where: { id } })).status;

  it("success writes status and exactly one StatusEvent", async () => {
    const r = await mk("REQUESTED");
    await transitionRequestWith(db.prisma, creative, r.id, "ON_PROGRESS");
    expect(await status(r.id)).toBe("ON_PROGRESS");
    const ev = await events(r.id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ from: "REQUESTED", to: "ON_PROGRESS", actorId: creative.id });
  });

  it("invalid edge throws and writes nothing", async () => {
    const r = await mk("REQUESTED");
    await expect(transitionRequestWith(db.prisma, creative, r.id, "DONE")).rejects.toThrow();
    expect(await status(r.id)).toBe("REQUESTED");
    expect(await events(r.id)).toHaveLength(0);
  });

  it("DONE on unassigned request throws and writes nothing", async () => {
    const r = await mk("FIRST_LOOK", false);
    await expect(transitionRequestWith(db.prisma, creative, r.id, "DONE")).rejects.toThrow(/assignee/i);
    expect(await status(r.id)).toBe("FIRST_LOOK");
    expect(await events(r.id)).toHaveLength(0);
  });

  it("DONE persists outputCount and designFolderUrl", async () => {
    const r = await mk("FIRST_LOOK");
    await transitionRequestWith(db.prisma, creative, r.id, "DONE", {
      outputCount: 3,
      designFolderUrl: "https://drive.google.com/x",
    });
    const got = await db.prisma.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(got).toMatchObject({ status: "DONE", outputCount: 3, designFolderUrl: "https://drive.google.com/x" });
  });

  it.each([0, 1.5, -2, NaN])("rejects outputCount %s", async (n) => {
    const r = await mk("FIRST_LOOK");
    await expect(transitionRequestWith(db.prisma, creative, r.id, "DONE", { outputCount: n })).rejects.toThrow();
    expect(await status(r.id)).toBe("FIRST_LOOK");
    expect(await events(r.id)).toHaveLength(0);
  });

  it.each([1001, 99999999999999999999])("rejects outputCount above the cap (%s) with INVALID", async (n) => {
    const r = await mk("FIRST_LOOK");
    await expect(transitionRequestWith(db.prisma, creative, r.id, "DONE", { outputCount: n })).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("1000") });
    expect(await status(r.id)).toBe("FIRST_LOOK");
  });
  it("accepts the maximum outputCount", async () => {
    const r = await mk("FIRST_LOOK");
    await transitionRequestWith(db.prisma, creative, r.id, "DONE", { outputCount: 1000 });
    expect(await status(r.id)).toBe("DONE");
  });

  it("a concurrent unassign between the read and the update cannot produce a DONE request without an assignee", async () => {
    const r = await mk("FIRST_LOOK");
    const base = db.prisma;
    const racy = new Proxy(base, {
      get(t, prop, recv) {
        if (prop !== "$transaction") return Reflect.get(t, prop, recv);
        return (fn: (tx: unknown) => unknown, ...rest: unknown[]) =>
          (t.$transaction as (...a: unknown[]) => unknown)((tx: typeof base) => {
            let done = false;
            const wrapped = new Proxy(tx, {
              get(tt, p2) {
                if (p2 !== "request") return Reflect.get(tt, p2);
                return new Proxy(tt.request, {
                  get(rt, rp) {
                    const v = Reflect.get(rt, rp) as (...a: unknown[]) => Promise<unknown>;
                    if (rp !== "findUnique") return v.bind(rt);
                    return async (...a: unknown[]) => {
                      const out = await v.apply(rt, a);
                      if (!done) { done = true; await base.request.update({ where: { id: r.id }, data: { assigneeId: null } }); }
                      return out;
                    };
                  },
                });
              },
            });
            return fn(wrapped);
          }, ...rest);
      },
    });
    await expect(transitionRequestWith(racy, creative, r.id, "DONE", { outputCount: 1 })).rejects.toMatchObject({ code: "INVALID", message: expect.stringMatching(/needs an assignee/) });
    const got = await base.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(got.status).toBe("FIRST_LOOK");
    expect(got.assigneeId).toBeNull();
    expect(await events(r.id)).toHaveLength(0);
  });

  it.each(["ftp://x.com/a", "javascript:alert(1)", "not a url", ""])("rejects designFolderUrl %j", async (u) => {
    const r = await mk("FIRST_LOOK");
    await expect(transitionRequestWith(db.prisma, creative, r.id, "DONE", { designFolderUrl: u })).rejects.toThrow();
    expect(await status(r.id)).toBe("FIRST_LOOK");
  });

  it("REQUESTER is forbidden", async () => {
    const r = await mk("REQUESTED");
    await expect(transitionRequestWith(db.prisma, requester, r.id, "ON_PROGRESS")).rejects.toThrow(/forbidden|not allowed/i);
    expect(await status(r.id)).toBe("REQUESTED");
    expect(await events(r.id)).toHaveLength(0);
  });

  it("unknown request id gives not-found", async () => {
    await expect(transitionRequestWith(db.prisma, creative, "nope", "ON_PROGRESS")).rejects.toThrow(/not found/i);
  });

  it("concurrent identical transitions: exactly one succeeds", async () => {
    const r = await mk("ON_PROGRESS");
    const res = await Promise.allSettled([
      transitionRequestWith(db.prisma, creative, r.id, "FIRST_LOOK"),
      transitionRequestWith(db.prisma, creative, r.id, "FIRST_LOOK"),
      transitionRequestWith(db.prisma, creative, r.id, "FIRST_LOOK"),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await events(r.id)).toHaveLength(1);
  });
});

describe("runTransitionAction (action wrapper core)", () => {
  it("unauthenticated rejects before touching db", async () => {
    const getUser = async () => {
      throw new Error("Unauthenticated");
    };
    await expect(runTransitionAction(getUser, {} as never, "x", "ON_PROGRESS")).rejects.toThrow("Unauthenticated");
  });
  it("forbidden role rejects before touching db", async () => {
    const getUser = async () => ({ id: "u", appRole: "REQUESTER" as const, jobRole: "OTHER" as const, workspaceId: "clogent", mustChangePassword: false });
    await expect(runTransitionAction(getUser, {} as never, "x", "ON_PROGRESS")).rejects.toThrow(/forbidden/i);
  });
});
