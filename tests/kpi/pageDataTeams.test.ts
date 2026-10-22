import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole, JobRole } from "@prisma/client";
import { myRequestsData, teamProjectsData, teamRequestsData } from "@/lib/kpi/pageData";
import { createTestDb, type TestDb } from "../helpers/testDb";

describe("Team KPI data per team", () => {
  let db: TestDb;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const mk = async (name: string, appRole: AppRole, jobRole: JobRole) =>
      (ids[name] = (await p.user.create({ data: { email: `${name.toLowerCase()}@clogent.co.id`, name, fullName: name, appRole, jobRole } })).id);
    await mk("Idzni", "LEAD", "SOCIAL_MEDIA");
    await mk("Syahda", "REQUESTER", "SOCIAL_MEDIA");
    await mk("Fafa", "REQUESTER", "SOCIAL_MEDIA");
    await mk("Rifqy", "REQUESTER", "SOCIAL_MEDIA");
    await mk("Dimas", "CREATIVE", "DESIGNER");

    const brand = await p.brand.create({ data: { name: "B" } });
    const division = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    const ch = await p.socialChannel.create({ data: { brandId: brand.id, platform: "INSTAGRAM", handle: "b", displayName: "B" } });
    const mkPost = (author: string, approvedAt: string, plannedAt: string) =>
      p.contentPost.create({ data: { channelId: ch.id, surface: "FEED", position: 1, authorId: ids[author], approvedAt: new Date(approvedAt), plannedAt: new Date(plannedAt) } });
    await mkPost("Syahda", "2026-10-05T03:00:00Z", "2026-10-06T00:00:00+07:00"); // on time
    await mkPost("Syahda", "2026-10-09T03:00:00Z", "2026-10-08T00:00:00+07:00"); // late
    await mkPost("Fafa", "2026-10-15T03:00:00Z", "2026-10-20T00:00:00+07:00");
    await p.kpiTarget.create({ data: { userId: ids.Fafa, month: "2026-10", role: "DESIGNER", targetTasks: 5 } }); // saved with the wrong role

    const req = await p.request.create({
      data: { title: "t", brandId: brand.id, divisionId: division.id, typeId: type.id, requesterId: ids.Syahda, requestedAt: new Date("2026-10-07T03:00:00Z"), status: "DONE" },
    });
    await p.requestAssignee.create({ data: { requestId: req.id, userId: ids.Dimas } });

    const project = await p.project.create({ data: { title: "Alpha", ownerId: ids.Idzni, status: "IN_PROGRESS" } });
    for (const who of ["Syahda", "Dimas"]) await p.projectKpiTarget.create({ data: { userId: ids[who], year: 2026, projectId: project.id, itemTitle: "X", createdById: ids.Idzni } });
  });
  afterAll(async () => { await db?.stop(); });

  it("the social team lists Syahda, Fafa and Rifqy (and Idzni) with their approved posts", async () => {
    const { rows, automaticCount } = await teamRequestsData(db.prisma, "2026-10", "social");
    expect(rows.map((r) => r.name)).toEqual(["Fafa", "Idzni", "Rifqy", "Syahda"]);
    expect(automaticCount).toBe(4);
    const syahda = rows.find((r) => r.name === "Syahda")!;
    expect([syahda.role, syahda.kpi.tasksDone, syahda.kpi.onTimeRate]).toEqual(["SOCIAL_MEDIA", 2, 0.5]);
  });

  it("a member with a DESIGNER target this month is still a Content Plan row with that target and role SOCIAL_MEDIA", async () => {
    const fafa = (await teamRequestsData(db.prisma, "2026-10", "social")).rows.find((r) => r.name === "Fafa")!;
    expect([fafa.role, fafa.kpi.tasksDone, fafa.kpi.target, fafa.kpi.progress]).toEqual(["SOCIAL_MEDIA", 1, 5, 0.2]);
  });

  it("the creative team is unchanged: designers counting assigned requests", async () => {
    const { rows } = await teamRequestsData(db.prisma, "2026-10");
    // As before, a DESIGNER target puts anyone on the creative table (here Fafa's mistaken one).
    expect(rows.map((r) => [r.name, r.kpi.tasksDone])).toEqual([["Dimas", 1], ["Fafa", 0]]);
  });

  it("Projects on each team keeps only that team's people", async () => {
    expect((await teamProjectsData(db.prisma, 2026, "social")).kpis.map((k) => k.name)).toEqual(["Syahda"]);
    expect((await teamProjectsData(db.prisma, 2026)).kpis.map((k) => k.name)).toEqual(["Dimas"]);
  });

  it("My KPI counts posts for a social media person and says so", async () => {
    const sm = await myRequestsData(db.prisma, ids.Syahda, "SOCIAL_MEDIA", "2026-10");
    expect([sm.measure, sm.kpi.tasksDone, sm.isEmpty]).toEqual(["posts", 2, false]);
    expect(sm.points.at(-1)).toMatchObject({ month: "2026-10", tasksDone: 2 });
    const rifqy = await myRequestsData(db.prisma, ids.Rifqy, "SOCIAL_MEDIA", "2026-10");
    expect([rifqy.measure, rifqy.isEmpty]).toEqual(["posts", true]);
    const designer = await myRequestsData(db.prisma, ids.Dimas, "DESIGNER", "2026-10");
    expect([designer.measure, designer.kpi.tasksDone]).toEqual(["requests", 1]);
  });
});
