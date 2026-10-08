import type { RequestStatus } from "@prisma/client";

/** Cards loaded per board column, and how many each "Show more" adds. */
export const BOARD_PAGE_SIZE = 25;
/** Hard cap per column, whatever the URL says. */
export const BOARD_MAX_PER_COLUMN = 500;
export const TABLE_PAGE_SIZE = 50;

const MORE_STATUSES: readonly RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE", "CANCELLED"];
export type MoreLimits = Partial<Record<RequestStatus, number>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Parses `?more=DONE:50` (repeatable, or comma separated). Only whitelisted statuses and plain 1-9 digit
 * integers are kept; values are clamped into [BOARD_PAGE_SIZE, BOARD_MAX_PER_COLUMN].
 */
export function parseMore(raw: string | string[] | undefined): MoreLimits {
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((s) => (s ?? "").split(","));
  const out: MoreLimits = {};
  for (const part of parts) {
    const m = /^([A-Z_]+):(\d{1,9})$/.exec(part.trim());
    if (!m) continue;
    const status = MORE_STATUSES.find((s) => s === m[1]);
    if (!status) continue;
    out[status] = Math.min(BOARD_MAX_PER_COLUMN, Math.max(BOARD_PAGE_SIZE, Number(m[2])));
  }
  return out;
}

export function serializeMore(more: MoreLimits): string | undefined {
  const s = MORE_STATUSES.filter((st) => more[st]).map((st) => `${st}:${more[st]}`).join(",");
  return s || undefined;
}

/** `?page=N`: positive whole numbers up to 6 digits, otherwise page 1 (clamped to the real count later). */
export function parsePage(raw: string | string[] | undefined): number {
  const s = one(raw);
  if (!s || !/^\d{1,6}$/.test(s)) return 1;
  return Math.max(1, Number(s));
}

export type PageWindow = { page: number; pageCount: number; skip: number; from: number; to: number };

/** Clamps `page` into 1..pageCount and returns the skip and the 1-based inclusive row range. */
export function pageWindow(total: number, page: number, size: number): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pageCount);
  const skip = (p - 1) * size;
  return { page: p, pageCount, skip, from: total === 0 ? 0 : skip + 1, to: Math.min(total, skip + size) };
}

export function rangeText(w: PageWindow, total: number): string {
  return total === 0 ? "Showing 0 of 0" : `Showing ${w.from}–${w.to} of ${total}`;
}
