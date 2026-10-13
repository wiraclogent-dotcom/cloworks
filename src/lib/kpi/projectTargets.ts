import type { ScopedDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session-core";

export type ProjectTargetCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "UNAUTHENTICATED";
export type ProjectTargetResult = { ok: true } | { ok: false; code: ProjectTargetCode; message: string };

const fail = (code: ProjectTargetCode, message: string): ProjectTargetResult => ({ ok: false, code, message });

type Actor = Pick<SessionUser, "id" | "appRole">;

/** Leads and admins pick the project items (by title) a person is measured on for a year. Adding an existing one is a no-op. */
export async function addProjectTargetsWith(
  db: ScopedDb,
  actor: Actor,
  input: { userId: string; year: number; projectId: string; itemTitles: string[] },
): Promise<ProjectTargetResult> {
  if (!can(actor.appRole, "dashboard.team")) return fail("FORBIDDEN", "Only leads and admins can set project targets.");
  const { userId, year, projectId, itemTitles } = input;
  if (typeof userId !== "string" || !userId) return fail("VALIDATION", "Choose a person.");
  if (typeof projectId !== "string" || !projectId) return fail("VALIDATION", "Choose a project.");
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2020 || year > 2100) {
    return fail("VALIDATION", "Year must be between 2020 and 2100.");
  }
  if (!Array.isArray(itemTitles) || itemTitles.length === 0 || itemTitles.some((t) => typeof t !== "string" || !t)) {
    return fail("VALIDATION", "Choose at least one item.");
  }
  const titles = [...new Set(itemTitles)];

  const person = await db.user.findFirst({ where: { id: userId, active: true }, select: { id: true } });
  if (!person) return fail("NOT_FOUND", "Person not found.");
  const project = await db.project.findFirst({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail("NOT_FOUND", "Project not found.");

  const rows = await db.projectTask.findMany({ where: { projectId, title: { in: titles } }, select: { title: true }, distinct: ["title"] });
  if (rows.length !== titles.length) return fail("NOT_FOUND", "One of those items is not in this project.");

  await db.projectKpiTarget.createMany({
    data: titles.map((itemTitle) => ({ userId, year, projectId, itemTitle, createdById: actor.id })),
    skipDuplicates: true,
  });
  return { ok: true };
}

export async function removeProjectTargetWith(db: ScopedDb, actor: Actor, targetId: string): Promise<ProjectTargetResult> {
  if (!can(actor.appRole, "dashboard.team")) return fail("FORBIDDEN", "Only leads and admins can set project targets.");
  if (typeof targetId !== "string" || !targetId) return fail("NOT_FOUND", "Target not found.");
  const { count } = await db.projectKpiTarget.deleteMany({ where: { id: targetId } });
  return count === 0 ? fail("NOT_FOUND", "Target not found.") : { ok: true };
}
