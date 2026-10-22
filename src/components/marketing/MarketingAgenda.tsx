"use client";

import { useId } from "react";
import { STATUS_LABEL, activityLabel, rangeLabel } from "@/lib/marketing/format";
import type { CalDivision, MarketingMonthData } from "@/lib/marketing/types";
import { Card } from "@/components/shadcn/card";
import { cn, focusRing } from "../ui/cn";
import { useMarketingSheet } from "./sheetState";

/** Narrow screens: one section per visible division with its activities by start day. */
export function MarketingAgenda({ data, divisions }: { data: MarketingMonthData; divisions: CalDivision[] }) {
  const first = `${data.month}-01`;
  const last = `${data.month}-31`; // string compare: no month has a later day
  const inMonth = (s: string, e: string) => s <= last && e >= first;
  return (
    <div className="space-y-3">
      {divisions.map((d) => (
        <DivisionSection key={d.id} data={data} division={d} inMonth={inMonth} />
      ))}
    </div>
  );
}

function DivisionSection({ data, division: d, inMonth }: { data: MarketingMonthData; division: CalDivision; inMonth: (s: string, e: string) => boolean }) {
  const sheet = useMarketingSheet();
  const items = data.activities.filter((a) => a.divisionId === d.id && inMonth(a.startDay, a.endDay));
  return (
    <AgendaSection title={d.name} icon={<span aria-hidden="true" data-tone={d.tone} className="size-2.5 rounded-xs bg-tone-accent" />}>
      {items.length === 0 ? <li className="py-2 text-sm text-muted-foreground">No activities this month</li> : items.map((a) => (
        <li key={a.id}>
          <button type="button" aria-label={activityLabel(d.name, a)} onClick={() => sheet.open({ mode: "edit", activityId: a.id })}
            className={cn("flex w-full cursor-pointer items-center gap-3 rounded-md py-2 text-left text-sm hover:bg-muted", focusRing)}>
            <span className="w-24 shrink-0 text-muted-foreground tabular-nums">{rangeLabel(a.startDay, a.endDay)}</span>
            <span className={cn("min-w-0 flex-1 truncate text-foreground", a.status === "CANCELLED" && "text-muted-foreground line-through")}>{a.title}</span>
            <span data-tone={d.tone} className="shrink-0 rounded-md bg-tone-tint px-1.5 py-0.5 text-xs font-medium text-tone-text">{STATUS_LABEL[a.status]}</span>
          </button>
        </li>
      ))}
    </AgendaSection>
  );
}

function AgendaSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const id = useId();
  return (
    <Card asChild className="p-3 shadow-none">
      <section aria-labelledby={id}>
        <h3 id={id} className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-heading">{icon}{title}</h3>
        <ul className="divide-y divide-border">{children}</ul>
      </section>
    </Card>
  );
}
