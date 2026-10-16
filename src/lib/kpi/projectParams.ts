import { jakartaQuarter, type Quarter } from "./projectItems";

export type RawParam = string | string[] | undefined;
const first = (v: RawParam) => (Array.isArray(v) ? v[0] : v);

export type ProjectKpiParams = { year: number; quarter: Quarter | "u" };

/**
 * `year=YYYY` (2020..2100) and `q=1|2|3|4|u` for the Project KPI views. A bad or missing year is the current Jakarta
 * year; a bad or missing q is the current quarter in the current year and Q1 in any other year.
 */
export function parseProjectKpiParams(sp: { year?: RawParam; q?: RawParam }, now: Date = new Date()): ProjectKpiParams {
  const current = jakartaQuarter(now);
  const rawYear = first(sp.year);
  const y = rawYear !== undefined && /^\d{4}$/.test(rawYear) ? Number(rawYear) : NaN;
  const year = y >= 2020 && y <= 2100 ? y : current.year;
  const q = first(sp.q);
  if (q === "u") return { year, quarter: "u" };
  if (q === "1" || q === "2" || q === "3" || q === "4") return { year, quarter: Number(q) as Quarter };
  return { year, quarter: year === current.year ? current.quarter : 1 };
}
