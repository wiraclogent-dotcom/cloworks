import type { RequestStatus } from "@prisma/client";
import { SORT_KEYS, type RequestFilter, type SortKey } from "@/lib/requests";

const STATUSES: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE", "CANCELLED"];
export type RawParams = Record<string, string | string[] | undefined>;

export type ViewParams = {
  view: "board" | "table";
  status?: RequestStatus; assigneeId?: string; brandId?: string; divisionId?: string; q?: string;
  mine: boolean; sort: SortKey; dir: "asc" | "desc";
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function parseParams(raw: RawParams): ViewParams {
  const status = one(raw.status);
  const sort = one(raw.sort);
  return {
    view: one(raw.view) === "table" ? "table" : "board",
    status: STATUSES.find((s) => s === status),
    assigneeId: one(raw.assignee), brandId: one(raw.brand), divisionId: one(raw.division), q: one(raw.q)?.trim() || undefined,
    mine: one(raw.mine) === "1",
    sort: SORT_KEYS.find((k) => k === sort) ?? "deadline",
    dir: one(raw.dir) === "desc" ? "desc" : "asc",
  };
}

export function toFilter(p: ViewParams, userId: string): RequestFilter {
  return {
    status: p.status, assigneeId: p.assigneeId, brandId: p.brandId, divisionId: p.divisionId, q: p.q,
    mine: p.mine ? { userId } : undefined,
  };
}

/** Builds a /requests URL from the current params with overrides (undefined removes a key). */
export function hrefWith(p: ViewParams, over: Partial<Record<"view" | "status" | "assignee" | "brand" | "division" | "q" | "mine" | "sort" | "dir", string | undefined>>): string {
  const cur: Record<string, string | undefined> = {
    view: p.view === "table" ? "table" : undefined, status: p.status, assignee: p.assigneeId, brand: p.brandId, division: p.divisionId,
    q: p.q, mine: p.mine ? "1" : undefined, sort: p.view === "table" && p.sort !== "deadline" ? p.sort : undefined,
    dir: p.dir === "desc" ? "desc" : undefined,
  };
  const merged = { ...cur, ...over };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/requests?${s}` : "/requests";
}
