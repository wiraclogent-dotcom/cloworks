import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole, JobRole } from "@prisma/client";
import { assigneeOptions, listCreativeTeam, listSocialKpiPeople, listTeamKpiPeople } from "@/lib/team";
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
    await mk("Syahda", "REQUESTER", "SOCIAL_MEDIA"); // a requester, but on the social media team
    await mk("Gone", "REQUESTER", "SOCIAL_MEDIA", false); // inactive
    await mk("Ex", "CREATIVE", "DESIGNER", false); // left; had a social media target
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

  it("Social media KPI people: active social media people of any app role, plus anyone with a social media target that month", async () => {
    const targets = [
      { userId: await idOf("Ex"), role: "SOCIAL_MEDIA" as const },
      { userId: await idOf("Irsyad"), role: "DESIGNER" as const }, // a designer target is not the social team
    ];
    const people = await listSocialKpiPeople(db.prisma, targets);
    expect(people.map((p) => p.name)).toEqual(["Ex", "Idzni", "Syahda"]);
    expect(people[2]).toMatchObject({ id: await idOf("Syahda"), jobRole: "SOCIAL_MEDIA" });
    expect((await listSocialKpiPeople(db.prisma, [])).map((p) => p.name)).toEqual(["Idzni", "Syahda"]);
  });
});

describe("assigneeOptions", () => {
  const team = [{ id: "a", name: "Adi" }, { id: "b", name: "Bea" }];
  it("is the team when nobody or only team members are assigned", () => {
    expect(assigneeOptions(team, [])).toEqual(team);
    expect(assigneeOptions(team, [{ id: "b", name: "Bea", active: true }])).toEqual(team);
  });
  it("keeps a current assignee who is off the team at the top, saying why", () => {
    expect(assigneeOptions(team, [{ id: "x", name: "Idzni", active: true }])[0]).toEqual({ id: "x", name: "Idzni (not on creative team)", offTeam: true });
    expect(assigneeOptions(team, [{ id: "d", name: "Daus", active: false }])[0]).toEqual({ id: "d", name: "Daus (inactive)", offTeam: true });
    expect(assigneeOptions(team, [{ id: "d", name: "Daus", active: false }])).toHaveLength(3);
  });
  it("keeps every off-team current person, in order, and not the team members", () => {
    const out = assigneeOptions(team, [
      { id: "x", name: "Idzni", active: true }, { id: "a", name: "Adi", active: true }, { id: "d", name: "Daus", active: false },
    ]);
    expect(out.map((o) => o.name)).toEqual(["Idzni (not on creative team)", "Daus (inactive)", "Adi", "Bea"]);
  });
});
