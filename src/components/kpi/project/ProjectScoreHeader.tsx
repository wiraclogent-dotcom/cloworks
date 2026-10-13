import { CalendarCheck, CircleCheckBig, Gauge, Hourglass, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/palette";
import type { PartKey } from "@/lib/kpi/projectScore";
import { CountUp } from "@/components/ui/CountUp";
import { KpiTile } from "@/components/ui/KpiTile";

const PARTS: { key: PartKey; label: string; icon: ReactNode; tone: Tone }[] = [
  { key: "onTime", label: "On time", icon: <CalendarCheck />, tone: "done" },
  { key: "completion", label: "Completion", icon: <CircleCheckBig />, tone: "in-progress" },
  { key: "speed", label: "Speed", icon: <Gauge />, tone: "first-look" },
  { key: "revisions", label: "Revisions", icon: <Repeat />, tone: "requested" },
  { key: "slips", label: "Slips", icon: <Hourglass />, tone: "due-soon" },
];

/**
 * The 0..100 score with the five measures behind it. `parts` is left out where there is no single quarter to explain
 * (the Unscheduled tab shows the year score only). The caption says how many measures had data.
 */
export function ProjectScoreHeader({ label, score, parts, usedParts, sub }: {
  label: string;
  score: number | null;
  parts?: Record<PartKey, number | null>;
  usedParts?: PartKey[];
  sub?: ReactNode;
}) {
  const used = usedParts?.length ?? PARTS.length;
  return (
    <section aria-label="Project KPI score" className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <p className="font-display text-5xl leading-none font-bold tracking-[-0.02em] text-heading tabular-nums">
          {score === null ? "—" : <CountUp value={score} />}
        </p>
        <div className="pb-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {sub ? <p className="text-xs text-foreground-secondary">{sub}</p> : null}
        </div>
      </div>
      {parts ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {PARTS.map((p) => (
              <li key={p.key} data-kpi={p.key}>
                <KpiTile icon={p.icon} tone={p.tone} label={p.label} value={parts[p.key] ?? "—"} />
              </li>
            ))}
          </ul>
          {score !== null && used < PARTS.length ? (
            <p className="text-xs text-foreground-secondary">Based on {used} of {PARTS.length} measures</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
