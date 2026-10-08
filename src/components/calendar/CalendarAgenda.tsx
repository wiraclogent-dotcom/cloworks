import type { CalendarRow } from "@/lib/requests";
import { dayLabel } from "@/lib/calendar";
import { StaticCalendarCard } from "../CalendarCard";

/** Narrow screens: the days that have cards, in date order, without dragging (reschedule from the request page). */
export function CalendarAgenda({ byDay, today }: { byDay: Map<string, CalendarRow[]>; today: string }) {
  const days = [...byDay.keys()].sort();
  return (
    <ol role="list" aria-label="Days with requests" className="space-y-4">
      {days.map((day) => (
        <li key={day} aria-current={day === today ? "date" : undefined}>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            {dayLabel(day)}
            {day === today && <span className="ml-1.5 font-medium text-link">Today</span>}
          </h3>
          <ul className="space-y-2">
            {byDay.get(day)!.map((c) => <StaticCalendarCard key={c.id} card={c} today={today} />)}
          </ul>
        </li>
      ))}
    </ol>
  );
}
