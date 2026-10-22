import type { JobRole, KpiKind } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session-core";
import { listSocialKpiPeople, listTeamKpiPeople } from "@/lib/team";
import { KPI_TEAMS, type KpiTeam } from "./team";
import { isValidMonth } from "./months";
import { loadTargets } from "./queries";

// Who appears on Team KPI. The automatic rule (creative team + designer targets for Requests; people with targets for
// Projects) plus standing manual overrides: `included: true` adds, `included: false` removes, overrides win.

export type RosterCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "UNAUTHENTICATED";
export type RosterFailure = { ok: false; code: RosterCode; message: string };
export type RosterResult = { ok: true } | RosterFailure;

const fail = (code: RosterCode, message: string): RosterFailure => ({ ok: false, code, message });
const MAX_PEOPLE = 200;
const KINDS: readonly KpiKind[] = ["REQUESTS", "PROJECTS"];
type Actor = Pick<SessionUser, "id" | "appRole">;
const NOT_ALLOWED = "Only leads and admins can manage who is on the team KPI.";

/** The automatic people plus those added, minus those removed. Order is not significant. */
export function resolveRoster(automaticIds: string[], entries: { userId: string; included: boolean }[]): string[] {
  const ids = new Set(automaticIds);
  for (const e of entries) if (e.included) ids.add(e.userId);
  for (const e of entries) if (!e.included) ids.delete(e.userId);
  return [...ids];
}

export async function loadRosterEntries(db: ScopedDb, kind: KpiKind): Promise<{ userId: string; included: boolean }[]> {
  return db.kpiRosterEntry.findMany({ where: { kind }, select: { userId: true, included: true } });
}

/**
 * Everyone who may be put on a team's roster, in this workspace, by name: for the creative team the active
 * non-requesters, for the social media team the active social media people of any app role.
 */
export function rosterCandidates(db: ScopedDb, team: KpiTeam = "creative"): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: team === "social" ? { active: true, jobRole: "SOCIAL_MEDIA" } : { active: true, appRole: { not: "REQUESTER" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

type Person = { id: string; name: string; jobRole: JobRole };

/**
 * Requests roster: the automatic people with the overrides applied, always sorted by name. Added people are loaded in
 * one query; an override for someone who has since left or become a requester is ignored.
 */
export async function rosterPeople(db: ScopedDb, automatic: Person[], entries: { userId: string; included: boolean }[]): Promise<Person[]> {
  const wanted = new Set(resolveRoster(automatic.map((p) => p.id), entries));
  const have = new Set(automatic.map((p) => p.id));
  const missing = [...wanted].filter((id) => !have.has(id));
  const added: Person[] = missing.length
    ? await db.user.findMany({
        where: { id: { in: missing }, active: true, appRole: { not: "REQUESTER" } },
        select: { id: true, name: true, jobRole: true },
      })
    : [];
  return [...automatic.filter((p) => wanted.has(p.id)), ...added].sort((a, b) => a.name.localeCompare(b.name));
}

/** Drops duplicates; null when the list is over the cap. */
function capped(userIds: string[]): string[] | null {
  const ids = [...new Set(userIds)];
  return ids.length > MAX_PEOPLE ? null : ids;
}

/**
 * Leads and admins set the full list of people shown on a Team KPI table. `automaticIds` is what the table would show
 * with no overrides for the period being edited; combined with the stored entries it gives who is shown now, and an
 * override is upserted for each candidate whose ticked state differs from that. Existing overrides are never deleted
 * here: they are standing, and one that is irrelevant to this month or year may matter for another. Only candidates
 * are considered, so someone shown for another reason (e.g. an inactive designer with history) is untouched.
 *
 * It TRUSTS the caller's `automaticIds`: never wire it directly to a server action. `setKpiRosterWith` recomputes
 * the list on the server.
 */
export async function setRosterWith(
  db: ScopedDb,
  actor: Actor,
  input: { kind: KpiKind; userIds: string[]; automaticIds: string[]; team?: KpiTeam },
): Promise<RosterResult> {
  if (!can(actor.appRole, "dashboard.team")) return fail("FORBIDDEN", NOT_ALLOWED);
  if (!input || typeof input !== "object") return fail("VALIDATION", "Invalid request.");
  const { kind, userIds, automaticIds } = input;
  if (!KINDS.includes(kind)) return fail("VALIDATION", "Choose Requests or Projects.");
  if (!Array.isArray(userIds) || userIds.some((id) => typeof id !== "string" || !id)) return fail("VALIDATION", "Invalid list of people.");
  const ids = capped(userIds);
  if (!ids) return fail("VALIDATION", `Choose at most ${MAX_PEOPLE} people.`);
  const desired = new Set(ids);

  const candidates = await rosterCandidates(db, input.team);
  const known = new Set(candidates.map((c) => c.id));
  if (ids.some((id) => !known.has(id))) return fail("NOT_FOUND", "One of those people was not found.");

  const shown = new Set(resolveRoster(automaticIds, await loadRosterEntries(db, kind)));
  const ops = candidates
    .filter((c) => desired.has(c.id) !== shown.has(c.id))
    .map((c) => {
      const included = desired.has(c.id);
      return db.kpiRosterEntry.upsert({
        where: { userId_kind: { userId: c.id, kind } },
        create: { userId: c.id, kind, included, updatedById: actor.id },
        update: { included, updatedById: actor.id },
      });
    });
  if (ops.length > 0) await db.$transaction(ops);
  return { ok: true };
}

/** The ids the table shows with no overrides, recomputed on the server (never trusted from the client). */
export async function automaticRosterIds(db: ScopedDb, kind: KpiKind, scope: { month?: string; year?: number }, team: KpiTeam = "creative"): Promise<string[]> {
  if (kind === "REQUESTS") {
    const targets = await loadTargets(db, [scope.month!]);
    return (await (team === "social" ? listSocialKpiPeople : listTeamKpiPeople)(db, targets)).map((p) => p.id);
  }
  // Projects: the year's target holders of this team (job role SOCIAL_MEDIA → social, anyone else → creative).
  const rows = await db.projectKpiTarget.findMany({ where: { year: scope.year! }, select: { userId: true, user: { select: { jobRole: true } } }, distinct: ["userId"] });
  return rows.filter((r) => (r.user.jobRole === "SOCIAL_MEDIA") === (team === "social")).map((r) => r.userId);
}

/** What the dialog sends: the full desired list, the month (Requests) or year (Projects) and the team it was looking at. */
export type SetKpiRosterInput = { kind: KpiKind; userIds: string[]; month?: string; year?: number; team?: KpiTeam };

export async function setKpiRosterWith(db: ScopedDb, actor: Actor, input: SetKpiRosterInput): Promise<RosterResult> {
  if (!can(actor.appRole, "dashboard.team")) return fail("FORBIDDEN", NOT_ALLOWED);
  if (!input || typeof input !== "object") return fail("VALIDATION", "Invalid request.");
  const { kind, userIds, month, year, team = "creative" } = input;
  if (!KINDS.includes(kind)) return fail("VALIDATION", "Choose Requests or Projects.");
  if (!KPI_TEAMS.includes(team)) return fail("VALIDATION", "Choose a team.");
  if (kind === "REQUESTS" && (typeof month !== "string" || !isValidMonth(month))) return fail("VALIDATION", "Invalid month.");
  if (kind === "PROJECTS" && (typeof year !== "number" || !Number.isInteger(year) || year < 2020 || year > 2100)) {
    return fail("VALIDATION", "Year must be between 2020 and 2100.");
  }
  // Check the list before the lookups below so a malformed request does no database work.
  if (!Array.isArray(userIds) || userIds.some((id) => typeof id !== "string" || !id)) return fail("VALIDATION", "Invalid list of people.");
  const ids = capped(userIds);
  if (!ids) return fail("VALIDATION", `Choose at most ${MAX_PEOPLE} people.`);
  const automaticIds = await automaticRosterIds(db, kind, { month, year }, team);
  return setRosterWith(db, actor, { kind, userIds: ids, automaticIds, team });
}
