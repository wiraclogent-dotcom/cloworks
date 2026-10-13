import type { ItemFacts } from "@/lib/kpi/projectItems";

export const PROJECT_KPI_WEIGHTS = { onTime: 0.5, completion: 0.2, speed: 0.1, revisions: 0.1, slips: 0.1 } as const;
export type PartKey = keyof typeof PROJECT_KPI_WEIGHTS;

export type QuarterScore = {
  /** 0..100 rounded, null when no part has data. */
  score: number | null;
  /** Each 0..100 rounded, null = no data. */
  parts: Record<PartKey, number | null>;
  /** For "Based on N of 5 measures". */
  usedParts: PartKey[];
  items: number;
  done: number;
  onTimeCount: number;
  lateCount: number;
};

const DAY_MS = 86_400_000;
const PART_KEYS = Object.keys(PROJECT_KPI_WEIGHTS) as PartKey[];

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** (finishAt - startAt) in days; only for tracked done items. */
export function cycleDays(f: ItemFacts): number | null {
  if (f.state !== "done" || !f.startAt || !f.finishAt) return null;
  return (f.finishAt.getTime() - f.startAt.getTime()) / DAY_MS;
}

const penalty = (total: number, items: number) => Math.max(0, 100 - (25 * total) / items);

export function scoreQuarter(all: ItemFacts[], teamCycleDays: number[]): QuarterScore {
  const items = all.filter((f) => f.state !== "cancelled" && f.state !== "removed");
  const n = items.length;

  const onTimeCount = items.filter((f) => f.onTime === true).length;
  const lateCount = items.filter((f) => f.onTime === false).length;
  const judged = onTimeCount + lateCount;
  const done = items.filter((f) => f.state === "done" || f.state === "finishedUntracked").length;

  const personMedian = median(items.map(cycleDays).filter((d): d is number => d !== null));
  const teamMedian = teamCycleDays.length >= 3 ? median(teamCycleDays) : null;

  const raw: Record<PartKey, number | null> = {
    onTime: judged > 0 ? (onTimeCount / judged) * 100 : null,
    completion: n > 0 ? (items.reduce((a, f) => a + f.progress, 0) / n) * 100 : null,
    speed:
      personMedian !== null && teamMedian !== null
        ? personMedian > 0 ? Math.min(100, (100 * teamMedian) / personMedian) : 100
        : null,
    revisions: n > 0 ? penalty(items.reduce((a, f) => a + f.revisions, 0), n) : null,
    slips: n > 0 ? penalty(items.reduce((a, f) => a + f.slips, 0), n) : null,
  };

  const usedParts = PART_KEYS.filter((k) => raw[k] !== null);
  const weightSum = usedParts.reduce((a, k) => a + PROJECT_KPI_WEIGHTS[k], 0);
  const score = usedParts.length
    ? Math.round(usedParts.reduce((a, k) => a + PROJECT_KPI_WEIGHTS[k] * (raw[k] as number), 0) / weightSum)
    : null;

  const parts = {} as Record<PartKey, number | null>;
  for (const k of PART_KEYS) parts[k] = raw[k] === null ? null : Math.round(raw[k] as number);

  return { score, parts, usedParts, items: n, done, onTimeCount, lateCount };
}

/** Item-count weighted mean of the non-null quarter scores. */
export function scoreYear(quarters: QuarterScore[]): number | null {
  const q = quarters.filter((x) => x.score !== null && x.items > 0);
  const total = q.reduce((a, x) => a + x.items, 0);
  if (total === 0) return null;
  return Math.round(q.reduce((a, x) => a + (x.score as number) * x.items, 0) / total);
}
