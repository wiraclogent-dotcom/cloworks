import type { JobRole, PrismaClient } from "@prisma/client";

/**
 * The creative team: active designers (job role DESIGNER) who use the tracker as creative, lead or admin. Other
 * leads (e.g. social media) are not on the team even though they can work requests. Sorted by name.
 */
/** Who is on the creative team; shared by every team list so they all agree. */
const CREATIVE_TEAM = { active: true, jobRole: "DESIGNER", appRole: { not: "REQUESTER" } } as const;

export function listCreativeTeam(db: Pick<PrismaClient, "user">): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: CREATIVE_TEAM,
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Assign-picker options: the team, plus the current assignee at the top when they are not on it (so the picker does
 * not silently show "Unassigned"), labelled with why.
 */
export function assigneeOptions(
  team: { id: string; name: string }[],
  current: { id: string; name: string; active: boolean } | null,
): { id: string; name: string }[] {
  if (!current || team.some((t) => t.id === current.id)) return team;
  return [{ id: current.id, name: `${current.name} (${current.active ? "not on creative team" : "inactive"})` }, ...team];
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
