"use client";

import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { tableClass } from "@/components/ui/table";

export type TrendPoint = { month: string; label: string; tasksDone: number; target: number | null };

const tick = { fill: "var(--foreground-secondary)", fontSize: 12 };

type TipProps = { active?: boolean; payload?: readonly { payload?: TrendPoint }[] };

/** Tooltip in the kit's card style (tokens only). */
function ChartTooltip({ active, payload }: TipProps) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-card-foreground shadow-raised">
      <p className="mb-1 font-semibold">{p.label}</p>
      <p className="flex items-center gap-2 tabular-nums"><span aria-hidden="true" className="size-2.5 rounded-sm bg-chart-done" />Tasks done: {p.tasksDone}</p>
      <p className="flex items-center gap-2 tabular-nums"><span aria-hidden="true" className="h-0.5 w-2.5 rounded-full bg-chart-target" />Target: {p.target ?? "—"}</p>
    </div>
  );
}

/**
 * Tasks done (Aqua bars, labelled) vs target (Deep Blue dashed line) per month, in a card. The chart is decorative for
 * assistive tech; the "View as table" data table is the accessible alternative (kept from before the redesign).
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const data = points.map((p) => ({ ...p, short: p.label.replace(/ \d{4}$/, "") }));
  const t = tableClass({ compact: true });
  return (
    <Card>
      <figure>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Last {points.length} months</h2>
            <figcaption className="text-[13px] text-foreground-secondary">Tasks done vs target, last {points.length} months</figcaption>
          </div>
          <ul aria-hidden="true" className="flex items-center gap-4 text-xs text-foreground-secondary">
            <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-done" />Tasks done</li>
            <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-chart-target" />Target</li>
          </ul>
        </div>
        <div aria-hidden="true" className="h-64 w-full text-card-foreground">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 256 }}>
            <ComposedChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="short" tick={tick} stroke="var(--chart-grid)" tickLine={false} />
              <YAxis allowDecimals={false} tick={tick} stroke="var(--chart-grid)" tickLine={false} axisLine={false} width={36} />
              <Tooltip content={ChartTooltip} cursor={{ fill: "var(--surface-muted)" }} isAnimationActive={false} />
              <Bar dataKey="tasksDone" name="Tasks done" fill="var(--chart-done)" radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                <LabelList dataKey="tasksDone" position="top" fill="var(--foreground)" fontSize={12} />
              </Bar>
              <Line dataKey="target" name="Target" type="monotone" stroke="var(--chart-target)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: "var(--chart-target)" }} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <details className="group mt-3 border-t border-border pt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-[13px] font-medium text-link [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 transition-transform duration-150 group-open:rotate-90" />
          View as table
        </summary>
        <div className="relative mt-2 overflow-x-auto">
          <table className={t.table}>
            <caption className="sr-only">Tasks done versus target by month</caption>
            <thead>
              <tr>
                <th scope="col" className={t.th}>Month</th>
                <th scope="col" className={`${t.th} ${t.numeric}`}>Tasks done</th>
                <th scope="col" className={`${t.th} ${t.numeric}`}>Target</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.month} className={t.tr}>
                  <th scope="row" className={`${t.td} font-normal`}>{p.label}</th>
                  <td className={`${t.td} ${t.numeric}`}>{p.tasksDone}</td>
                  <td className={`${t.td} ${t.numeric}`}>{p.target ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
