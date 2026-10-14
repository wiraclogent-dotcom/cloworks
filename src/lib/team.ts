import type { JobRole, PrismaClient } from "@prisma/client";

/**
 * The creative team: active designers (job role DESIGNER) who use the tracker as creative, lead or admin. Other
 * leads (e.g. social media) are not on the team even though they can work requests. Sorted by name.
 */
/** Who is on the creative team; shared by every team list so they all agree. */
export const CREATIVE_TEAM = { active: true, jobRole: "DESIGNER", appRole: { not: "REQUESTER" } } as const;

export function listCreativeTeam(db: Pick<PrismaClient, "user">): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: CREATIVE_TEAM,
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Assign-picker options: the team, plus every current assignee who is not on it at the top (so the picker does not
 * silently drop them), each labelled with why.
 */
export function assigneeOptions(
  team: { id: string; name: string }[],
  current: { id: string; name: string; active: boolean }[],
): { id: string; name: string }[] {
  const onTeam = new Set(team.map((t) => t.id));
  const offTeam = current
    .filter((c) => !onTeam.has(c.id))
    .map((c) => ({ id: c.id, name: `${c.name} (${c.active ? "not on creative team" : "inactive"})` }));
  return offTeam.length ? [...offTeam, ...team] : team;
}

/**
 * Team KPI rows for a month: the creative team, plus anyone who had a DESIGNER target that month (so a designer who
 * has since left keeps their history). Other roles (social media, requesters) are not shown. Sorted by name.
 */
export function listTeamKpiPeople(
  db: Pick<PrismaClient, "user">,
  targets: { userId: string; role: JobRole }[],
): Promise<{ id: string; name: string; jobRole: JobRole }[]> {
  const designerTargets = targets.filter((t) => t.role === "DESIGNER").map((t) => t.userId);
  return db.user.findMany({
    where: { OR: [CREATIVE_TEAM, { id: { in: designerTargets } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, jobRole: true },
  });
}
