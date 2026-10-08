"use client";

import { Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, XAxis, YAxis } from "recharts";
import { ResponsiveContainer } from "recharts";

export type TrendPoint = { month: string; label: string; tasksDone: number; target: number | null };

const tick = { fill: "var(--muted-foreground)", fontSize: 12 };

/** Tasks done (bars, labelled) vs target (line) per month, with a data table as the accessible alternative. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const data = points.map((p) => ({ ...p, short: p.label.replace(/ \d{4}$/, "") }));
  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption className="mb-3 font-semibold">Tasks done vs target, last {points.length} months</figcaption>
      <div aria-hidden="true" className="h-64 w-full text-card-foreground">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 256 }}>
          <ComposedChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="short" tick={tick} stroke="var(--border)" />
            <YAxis allowDecimals={false} tick={tick} stroke="var(--border)" width={36} />
            <Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 12 }} />
            <Bar dataKey="tasksDone" name="Tasks done" fill="var(--chart-done)" isAnimationActive={false}>
              <LabelList dataKey="tasksDone" position="top" fill="var(--foreground)" fontSize={12} />
            </Bar>
            <Line dataKey="target" name="Target" type="monotone" stroke="var(--chart-target)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: "var(--chart-target)" }} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer rounded-md text-sm focus-visible:outline-2 focus-visible:outline-ring">View as table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Tasks done versus target by month</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-1 pr-4 font-medium">Month</th>
              <th scope="col" className="py-1 pr-4 font-medium">Tasks done</th>
              <th scope="col" className="py-1 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="border-b border-border last:border-0">
                <th scope="row" className="py-1 pr-4 font-normal">{p.label}</th>
                <td className="py-1 pr-4">{p.tasksDone}</td>
                <td className="py-1">{p.target ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
