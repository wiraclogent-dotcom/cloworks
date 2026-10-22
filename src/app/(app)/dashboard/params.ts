import type { AppRole } from "@prisma/client";
import { can } from "@/lib/permissions";
import { isValidMonth, jakartaMonth } from "@/lib/kpi/months";
import { KPI_TEAMS, type KpiTeam } from "@/lib/kpi/team";

export type RawParam = string | string[] | undefined;
const first = (v: RawParam) => (Array.isArray(v) ? v[0] : v);

/** `month=YYYY-MM` (whitelisted, real month); anything else falls back to the current Jakarta month. */
export function parseMonthParam(raw: RawParam, now: Date = new Date()): string {
  const v = first(raw);
  return v !== undefined && isValidMonth(v) ? v : jakartaMonth(now);
}

/** `user=<id>` restricted to a conservative id alphabet and length. */
export function parseUserParam(raw: RawParam): string | undefined {
  const v = first(raw);
  return v && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v) ? v : undefined;
}

/** Whose KPI to show. `user=` is honoured only for viewers with dashboard.team; otherwise it is ignored. */
export function resolveSubject(viewer: { id: string; appRole: AppRole }, userParam: string | undefined): string {
  return userParam && can(viewer.appRole, "dashboard.team") ? userParam : viewer.id;
}

/** Person KPI pages: team viewers may open anyone's; everyone else only their own, and only with dashboard.self. */
export function canViewPersonKpi(viewer: { id: string; appRole: AppRole }, userId: string | undefined): boolean {
  return can(viewer.appRole, "dashboard.team") || (userId !== undefined && userId === viewer.id && can(viewer.appRole, "dashboard.self"));
}

/** Legacy `view=projects|requests`. The KPI pages show both sections now; `view=projects` only scrolls to Projects. */
export function parseViewParam(raw: RawParam): "requests" | "projects" | undefined {
  const v = first(raw);
  return v === "projects" || v === "requests" ? v : undefined;
}

/** `team=creative|social` (Team KPI); anything else is ignored. Whether the viewer may choose is `resolveTeam`'s call. */
export function parseTeamParam(raw: RawParam): KpiTeam | undefined {
  const v = first(raw);
  return KPI_TEAMS.find((t) => t === v);
}

/** The first value of each named param that is present, so a picker's links can carry the other section's state. */
export function keepParams(sp: Record<string, RawParam>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = first(sp[k]);
    if (v) out[k] = v;
  }
  return out;
}
