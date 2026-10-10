import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole, JobRole } from "@prisma/client";
import { assigneeOptions, listCreativeTeam, listTeamKpiPeople } from "@/lib/team";
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
  const idOf = async (name: string) => (await db.prisma.user.findFirstOrThrow({ where: { name } })).id;

  it("is the active designers who use the tracker as creative, lead or admin, by name", async () => {
    expect(await listCreativeTeam(db.prisma)).toEqual([
      { id: expect.any(String), name: "Irsyad" },
      { id: expect.any(String), name: "Wira" },
    ]);
  });

  it("Team KPI people: the creative team, plus anyone with a designer target that month (past members keep their history)", async () => {
    const targets = [
      { userId: await idOf("Daus"), role: "DESIGNER" as const }, // inactive designer with a target: kept
      { userId: await idOf("Idzni"), role: "SOCIAL_MEDIA" as const }, // social media target: not the creative team
    ];
    const people = await listTeamKpiPeople(db.prisma, targets);
    expect(people.map((p) => p.name)).toEqual(["Daus", "Irsyad", "Wira"]);
    expect(people[0]).toMatchObject({ id: await idOf("Daus"), jobRole: "DESIGNER" });
    expect((await listTeamKpiPeople(db.prisma, [])).map((p) => p.name)).toEqual(["Irsyad", "Wira"]);
  });
});

describe("assigneeOptions", () => {
  const team = [{ id: "a", name: "Adi" }, { id: "b", name: "Bea" }];
  it("is the team when nobody or a team member is assigned", () => {
    expect(assigneeOptions(team, null)).toEqual(team);
    expect(assigneeOptions(team, { id: "b", name: "Bea", active: true })).toEqual(team);
  });
  it("keeps a current assignee who is off the team at the top, saying why", () => {
    expect(assigneeOptions(team, { id: "x", name: "Idzni", active: true })[0]).toEqual({ id: "x", name: "Idzni (not on creative team)" });
    expect(assigneeOptions(team, { id: "d", name: "Daus", active: false })[0]).toEqual({ id: "d", name: "Daus (inactive)" });
    expect(assigneeOptions(team, { id: "d", name: "Daus", active: false })).toHaveLength(3);
  });
});
