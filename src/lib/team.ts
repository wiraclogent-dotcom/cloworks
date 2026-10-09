import type { PrismaClient } from "@prisma/client";

/**
 * The creative team: active designers (job role DESIGNER) who use the tracker as creative, lead or admin. Other
 * leads (e.g. social media) are not on the team even though they can work requests. Sorted by name.
 */
export function listCreativeTeam(db: Pick<PrismaClient, "user">): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: { active: true, jobRole: "DESIGNER", appRole: { not: "REQUESTER" } },
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
