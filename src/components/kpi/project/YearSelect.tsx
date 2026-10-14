"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/shadcn/native-select";

/** Year picker for the KPI views. Hrefs are built on the server (the page owns the URL shape); changing it navigates. */
export function YearSelect({ value, options }: { value: number; options: { year: number; href: string }[] }) {
  const router = useRouter();
  const id = useId();
  return (
    <div className="inline-flex items-center gap-2">
      <label htmlFor={id} className="text-compact text-muted-foreground">Year</label>
      <NativeSelect id={id} value={value} onChange={(e) => { const o = options.find((x) => x.year === Number(e.target.value)); if (o) router.push(o.href); }}
        size="sm" className="w-fit" selectClassName="tabular-nums">
        {options.map((o) => <option key={o.year} value={o.year}>{o.year}</option>)}
      </NativeSelect>
    </div>
  );
}
