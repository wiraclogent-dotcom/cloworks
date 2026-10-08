import type { ReactNode } from "react";
import type { Tone } from "@/lib/palette";
import { cn } from "./cn";

/** KPI tile: tinted icon tile, label, big tabular number, optional sub-line (delta, ratio, hint). */
export function KpiTile({ icon, label, value, sub, tone = "done", className }: {
  icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-card", className)}>
      <span aria-hidden="true" data-tone={tone} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tone-tint text-tone-text [&_svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] text-foreground-secondary">{label}</p>
        <p className="mt-0.5 text-2xl leading-8 font-semibold text-foreground tabular-nums">{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-foreground-secondary">{sub}</p> : null}
      </div>
    </div>
  );
}
