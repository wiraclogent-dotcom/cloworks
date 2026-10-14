"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { fieldClass } from "@/components/ui/Field";

/** Year picker for the KPI views. Hrefs are built on the server (the page owns the URL shape); changing it navigates. */
export function YearSelect({ value, options }: { value: number; options: { year: number; href: string }[] }) {
  const router = useRouter();
  const id = useId();
  return (
    <div className="inline-flex items-center gap-2">
      <label htmlFor={id} className="text-[13px] text-muted-foreground">Year</label>
      <select id={id} value={value} onChange={(e) => { const o = options.find((x) => x.year === Number(e.target.value)); if (o) router.push(o.href); }}
        className={fieldClass({ kind: "select", size: "sm", className: "w-auto tabular-nums" })}>
        {options.map((o) => <option key={o.year} value={o.year}>{o.year}</option>)}
      </select>
    </div>
  );
}
