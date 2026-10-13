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

/** `view=projects|requests` for the KPI pages; anything else is undefined (the page picks its default). */
export function parseViewParam(raw: RawParam): "requests" | "projects" | undefined {
  const v = first(raw);
  return v === "projects" || v === "requests" ? v : undefined;
}

/**
 * My KPI's view. An explicit `view` wins; a chosen `month` means Requests (months are a Requests concept, and the
 * month picker drops `view`); otherwise Projects only for the viewer's own page when nothing was counted this month
 * and they have project targets this year.
 */
export function defaultKpiView({ view, month, own, countedZero, hasTargets }: {
  view: "requests" | "projects" | undefined; month: RawParam; own: boolean; countedZero: boolean; hasTargets: boolean;
}): "requests" | "projects" {
  if (view) return view;
  if (month !== undefined) return "requests";
  return own && countedZero && hasTargets ? "projects" : "requests";
}
