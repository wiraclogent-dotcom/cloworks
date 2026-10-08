import type { AppRole } from "@prisma/client";
import { can } from "@/lib/permissions";
import { isValidMonth, jakartaMonth } from "@/lib/kpi/months";

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
