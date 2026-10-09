import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole, JobRole } from "@prisma/client";
import { listCreativeTeam } from "@/lib/team";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("listCreativeTeam", () => {
  let db: TestDb;
  const mk = (name: string, appRole: AppRole, jobRole: JobRole, active = true) =>
    db.prisma.user.create({ data: { email: `${name.toLowerCase()}@clogent.co.id`, name, fullName: name, appRole, jobRole, active } });

  beforeAll(async () => {
    db = await createTestDb();
    await mk("Wira", "ADMIN", "DESIGNER");
    await mk("Irsyad", "CREATIVE", "DESIGNER");
    await mk("Idzni", "LEAD", "SOCIAL_MEDIA"); // a lead, but not on the creative team
    await mk("Daus", "CREATIVE", "DESIGNER", false); // inactive
    await mk("Rina", "REQUESTER", "DESIGNER"); // requesters never count
    await mk("Bayu", "CREATIVE", "OTHER");
  });
  afterAll(async () => { await db?.stop(); });

  it("is the active designers who use the tracker as creative, lead or admin, by name", async () => {
    expect(await listCreativeTeam(db.prisma)).toEqual([
      { id: expect.any(String), name: "Irsyad" },
      { id: expect.any(String), name: "Wira" },
    ]);
  });
});
