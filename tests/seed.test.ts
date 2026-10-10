import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { seed } from "../prisma/seedCore";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => db.stop());

async function counts() {
  const p = db.prisma;
  return {
    users: await p.user.count(), brands: await p.brand.count(), divisions: await p.division.count(),
    types: await p.requestType.count(), allowed: await p.allowedEmail.count(),
  };
}

describe("seed", () => {
  it("is idempotent and does not overwrite admin edits", async () => {
    await seed(db.prisma);
    const first = await counts();
    expect(first).toEqual({ users: 13, brands: 2, divisions: 5, types: 3, allowed: 0 });

    await db.prisma.user.update({ where: { id: (await db.prisma.user.findFirstOrThrow({ where: { name: "Idzni" } })).id }, data: { email: "idzni@example.com", appRole: "ADMIN" } });
    await seed(db.prisma);
    expect(await counts()).toEqual(first);
    for (const m of ["user", "brand", "division", "requestType"] as const)
      expect(await (db.raw[m] as unknown as { count(a: object): Promise<number> }).count({ where: { workspaceId: { not: "clogent" } } })).toBe(0);

    const withEmail = await db.prisma.user.findMany({ where: { email: { not: null } }, orderBy: { name: "asc" } });
    expect(withEmail.map((u) => u.name)).toEqual(["Idzni", "Wira"]);
    const idzni = withEmail[0];
    expect(idzni.appRole).toBe("ADMIN");
    const wira = withEmail[1];
    expect(wira).toMatchObject({ email: "wira.budi@clogent.co.id", appRole: "ADMIN", jobRole: "DESIGNER", fullName: "Wira Budi Prasetyo" });
    expect((await db.prisma.user.findFirstOrThrow({ where: { name: "Daus" } })).active).toBe(false);
    expect((await db.prisma.user.findFirstOrThrow({ where: { name: "Irsyad" } })).aliases).toEqual(["Irshyad"]);
    const social = await db.prisma.requestType.findFirstOrThrow({ where: { name: "Social Media" } });
    expect((social.fieldSchema as unknown[]).length).toBe(6);
    const motion = await db.prisma.requestType.findFirstOrThrow({ where: { name: "Motion Support" } });
    expect(motion).toMatchObject({ fieldSchema: [], active: true });
  });
});
