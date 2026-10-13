import type { JobRole, KpiKind } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session-core";
import { listTeamKpiPeople } from "@/lib/team";
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

/** Everyone who may be put on a roster: active, not a requester, in this workspace. By name. */
export function rosterCandidates(db: ScopedDb): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: { active: true, appRole: { not: "REQUESTER" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

type Person = { id: string; name: string; jobRole: JobRole };

/**
 * Requests roster: the automatic people with the overrides applied, sorted by name. Added people are loaded in one
 * query; an override for someone who has since left or become a requester is ignored.
 */
export async function rosterPeople(db: ScopedDb, kind: KpiKind, automatic: Person[]): Promise<Person[]> {
  const entries = await loadRosterEntries(db, kind);
  if (entries.length === 0) return automatic;
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

/**
 * Leads and admins set the full list of people shown on a Team KPI table. `automaticIds` is what the table would show
 * with no overrides; only the differences are stored (an override that matches the automatic rule is deleted). Only
 * candidates are considered, so someone shown for another reason (e.g. an inactive designer with history) is untouched.
 */
export async function setRosterWith(
  db: ScopedDb,
  actor: Actor,
  input: { kind: KpiKind; userIds: string[]; automaticIds: string[] },
): Promise<RosterResult> {
  if (!can(actor.appRole, "dashboard.team")) return fail("FORBIDDEN", NOT_ALLOWED);
  if (!input || typeof input !== "object") return fail("VALIDATION", "Invalid request.");
  const { kind, userIds, automaticIds } = input;
  if (!KINDS.includes(kind)) return fail("VALIDATION", "Choose Requests or Projects.");
  if (!Array.isArray(userIds) || userIds.some((id) => typeof id !== "string" || !id)) return fail("VALIDATION", "Invalid list of people.");
  const desired = new Set(userIds);
  if (desired.size > MAX_PEOPLE) return fail("VALIDATION", `Choose at most ${MAX_PEOPLE} people.`);

  const candidates = await rosterCandidates(db);
  const known = new Set(candidates.map((c) => c.id));
  if ([...desired].some((id) => !known.has(id))) return fail("NOT_FOUND", "One of those people was not found.");

  const automatic = new Set(automaticIds);
  const ops = candidates.map((c) => {
    const want = desired.has(c.id);
    if (want === automatic.has(c.id)) return db.kpiRosterEntry.deleteMany({ where: { userId: c.id, kind } });
    return db.kpiRosterEntry.upsert({
      where: { userId_kind: { userId: c.id, kind } },
      create: { userId: c.id, kind, included: want, updatedById: actor.id },
      update: { included: want, updatedById: actor.id },
    });
  });
  await db.$transaction(ops);
  return { ok: true };
}

/** The ids the table shows with no overrides, recomputed on the server (never trusted from the client). */
export async function automaticRosterIds(db: ScopedDb, kind: KpiKind, scope: { month?: string; year?: number }): Promise<string[]> {
  if (kind === "REQUESTS") {
    const targets = await loadTargets(db, [scope.month!]);
    return (await listTeamKpiPeople(db, targets)).map((p) => p.id);
  }
  const rows = await db.projectKpiTarget.findMany({ where: { year: scope.year! }, select: { userId: true }, distinct: ["userId"] });
  return rows.map((r) => r.userId);
}

/** What the dialog sends: the full desired list, and the month (Requests) or year (Projects) it was looking at. */
export type SetKpiRosterInput = { kind: KpiKind; userIds: string[]; month?: string; year?: number };

export async function setKpiRosterWith(db: ScopedDb, actor: Actor, input: SetKpiRosterInput): Promise<RosterResult> {
  if (!can(actor.appRole, "dashboard.team")) return fail("FORBIDDEN", NOT_ALLOWED);
  if (!input || typeof input !== "object") return fail("VALIDATION", "Invalid request.");
  const { kind, userIds, month, year } = input;
  if (!KINDS.includes(kind)) return fail("VALIDATION", "Choose Requests or Projects.");
  if (kind === "REQUESTS" && (typeof month !== "string" || !isValidMonth(month))) return fail("VALIDATION", "Invalid month.");
  if (kind === "PROJECTS" && (typeof year !== "number" || !Number.isInteger(year) || year < 2020 || year > 2100)) {
    return fail("VALIDATION", "Year must be between 2020 and 2100.");
  }
  // Check the list before the lookups below so a malformed request does no database work.
  if (!Array.isArray(userIds) || userIds.some((id) => typeof id !== "string" || !id)) return fail("VALIDATION", "Invalid list of people.");
  const automaticIds = await automaticRosterIds(db, kind, { month, year });
  return setRosterWith(db, actor, { kind, userIds, automaticIds });
}
