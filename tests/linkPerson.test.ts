import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AdminError } from "@/lib/admin";
import { assertLinkable, attachLogin, listLinkablePeople } from "@/lib/linkPerson";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let n = 0;
const uniq = (p: string) => `${p}${++n}`;
const stale = () => new AdminError("NOT_FOUND", "stale");

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.stop();
});

describe("listLinkablePeople", () => {
  it("returns only email-less people of the workspace (inactive included), sorted by name", async () => {
    const other = await db.raw.workspace.create({ data: { name: "Other", slug: uniq("other") } });
    await db.raw.user.create({ data: { name: "Aa-other-ws", fullName: "X", workspaceId: other.id } });
    await db.prisma.user.create({ data: { name: "Zed Linkable", fullName: "Zed L" } });
    await db.prisma.user.create({ data: { name: "Amy Linkable", fullName: "Amy L", active: false } });
    await db.prisma.user.create({ data: { name: "Has Login", fullName: "Has Login", email: `${uniq("hl")}@x.test` } });
    const list = await listLinkablePeople(db.prisma);
    const names = list.map((p) => p.name);
    expect(names).toContain("Zed Linkable");
    expect(names).toContain("Amy Linkable");
    expect(names).not.toContain("Has Login");
    expect(names).not.toContain("Aa-other-ws");
    expect(names.indexOf("Amy Linkable")).toBeLessThan(names.indexOf("Zed Linkable"));
    expect(list.find((p) => p.name === "Amy Linkable")).toMatchObject({ fullName: "Amy L", active: false });
  });
});

describe("assertLinkable / attachLogin", () => {
  it("returns the person, and throws the given error for a login, a missing id and another workspace", async () => {
    const ok = await db.prisma.user.create({ data: { name: uniq("Ok"), fullName: "Ok" } });
    const withEmail = await db.prisma.user.create({ data: { name: uniq("Em"), fullName: "Em", email: `${uniq("e")}@x.test` } });
    const other = await db.raw.workspace.create({ data: { name: "Other2", slug: uniq("o2") } });
    const foreign = await db.raw.user.create({ data: { name: uniq("Fo"), fullName: "Fo", workspaceId: other.id } });
    await db.raw.$transaction(async (tx) => {
      expect(await assertLinkable(tx, "clogent", ok.id, stale)).toEqual({ id: ok.id, name: ok.name });
      for (const id of [withEmail.id, "nope", foreign.id]) {
        await expect(assertLinkable(tx, "clogent", id, stale)).rejects.toMatchObject({ code: "NOT_FOUND", message: "stale" });
      }
    });
  });

  it("attachLogin sets email, hash, roles, active, bumps passwordVersion and clears lockout", async () => {
    const u = await db.prisma.user.create({
      data: { name: uniq("At"), fullName: "At", active: false, passwordVersion: 2, failedLogins: 4, lockedUntil: new Date(Date.now() + 60_000) },
    });
    await db.raw.$transaction((tx) => attachLogin(tx, u.id, { email: "at@x.test", passwordHash: "h", appRole: "LEAD", jobRole: "DESIGNER" }));
    const after = await db.raw.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({
      email: "at@x.test", passwordHash: "h", appRole: "LEAD", jobRole: "DESIGNER", active: true, passwordVersion: 3, failedLogins: 0, lockedUntil: null,
    });
  });
});
