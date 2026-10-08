import type { RequestStatus } from "@prisma/client";
import { parseMore, parsePage, type MoreLimits } from "@/lib/paging";
import { parseMonth } from "@/lib/calendar";
import { SORT_KEYS, type RequestFilter, type SortKey } from "@/lib/requests";

const STATUSES: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE", "CANCELLED"];
export type RawParams = Record<string, string | string[] | undefined>;

export type ViewParams = {
  view: "board" | "table" | "calendar";
  /** YYYY-MM shown by the calendar view; always set (defaults to the current Jakarta month). */
  month: string;
  status?: RequestStatus; assigneeId?: string; brandId?: string; divisionId?: string; q?: string;
  /** ?motion=yes|no (anything else = any). */
  motion?: "yes" | "no";
  mine: boolean; sort: SortKey; dir: "asc" | "desc";
  /** Per-column board limits from ?more=STATUS:n (whitelisted, capped). */
  more: MoreLimits;
  /** Table page, 1-based; clamped to the real page count by the query. */
  page: number;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export const MAX_Q = 200;
export const MAX_ID = 64;
/** Ids are short cuids; anything longer is garbage and is ignored rather than sent to the database. */
const id = (v: string | string[] | undefined) => {
  const s = one(v);
  return s && s.length <= MAX_ID ? s : undefined;
};

/** The view alone: needs no clock, so the Suspense fallback can resolve it while prerendering. */
export function parseView(v: string | string[] | undefined): ViewParams["view"] {
  const s = one(v);
  return s === "table" ? "table" : s === "calendar" ? "calendar" : "board";
}

export function parseParams(raw: RawParams, now: Date = new Date()): ViewParams {
  const status = one(raw.status);
  const sort = one(raw.sort);
  return {
    view: parseView(raw.view),
    month: parseMonth(one(raw.month), now),
    status: STATUSES.find((s) => s === status),
    assigneeId: id(raw.assignee), brandId: id(raw.brand), divisionId: id(raw.division), q: one(raw.q)?.trim().slice(0, MAX_Q).trim() || undefined,
    motion: one(raw.motion) === "yes" ? "yes" : one(raw.motion) === "no" ? "no" : undefined,
    mine: one(raw.mine) === "1",
    sort: SORT_KEYS.find((k) => k === sort) ?? "deadline",
    dir: one(raw.dir) === "desc" ? "desc" : "asc",
    more: parseMore(raw.more),
    page: parsePage(raw.page),
  };
}

export function toFilter(p: ViewParams, userId: string): RequestFilter {
  return {
    status: p.status, assigneeId: p.assigneeId, brandId: p.brandId, divisionId: p.divisionId, q: p.q,
    needsMotion: p.motion === "yes" ? true : p.motion === "no" ? false : undefined,
    mine: p.mine ? { userId } : undefined,
  };
}

/** Builds a /requests URL from the current params with overrides (undefined removes a key). `page` and `more` are never carried over: they only appear when passed explicitly, so changing a filter, sort or view resets them. */
export function hrefWith(p: ViewParams, over: Partial<Record<"view" | "month" | "status" | "assignee" | "brand" | "division" | "q" | "motion" | "mine" | "sort" | "dir" | "more" | "page", string | undefined>>): string {
  const cur: Record<string, string | undefined> = {
    view: p.view === "board" ? undefined : p.view, month: p.view === "calendar" ? p.month : undefined, status: p.status, assignee: p.assigneeId, brand: p.brandId, division: p.divisionId,
    q: p.q, mine: p.mine ? "1" : undefined, sort: p.view === "table" && p.sort !== "deadline" ? p.sort : undefined,
    dir: p.dir === "desc" ? "desc" : undefined, motion: p.motion,
  };
  const merged = { ...cur, ...over };
  if (merged.view !== "calendar") delete merged.month;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/requests?${s}` : "/requests";
}
