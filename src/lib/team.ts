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
