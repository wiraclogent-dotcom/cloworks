import type { ReactNode } from "react";
import type { Tone } from "@/lib/palette";
import { cn } from "./cn";

/** KPI tile: tinted icon tile (its tone) on top, big tabular number, label and optional sub-line (delta, ratio, hint). */
export function KpiTile({ icon, label, value, sub, tone = "done", className }: {
  icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string;
}) {
  return (
    <div className={cn("lift animate-rise flex h-full flex-col gap-5 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-card", className)}>
      <span aria-hidden="true" data-tone={tone} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tone-tint text-tone-text [&_svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <p className="font-display text-[2rem] leading-9 font-bold tracking-[-0.02em] text-foreground tabular-nums">{value}</p>
        <p className="mt-1 text-[13px] text-foreground-secondary">{label}</p>
        {sub ? <p className="mt-0.5 text-xs text-foreground-secondary">{sub}</p> : null}
      </div>
    </div>
  );
}
