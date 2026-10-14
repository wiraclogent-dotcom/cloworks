"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { cn, focusRing } from "@/components/ui/cn"

/** Same look as `<Button variant="ghost" size="icon-sm">`: 32px square, rounded-lg, muted hover, app focus ring. */
const navButton = cn(
  "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4",
  focusRing,
)

/**
 * react-day-picker (v9) styled with the app's tokens only: Monday-first, selected day in the primary colour,
 * today ringed, outside days muted, disabled days dimmed, app focus ring. Pass any DayPicker prop
 * (`mode="single"`, `selected`, `onSelect`, `disabled`, ...). The `rdp-*` default classes are not styled: this file is the stylesheet.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  fixedWeeks = true,
  weekStartsOn = 1,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      weekStartsOn={weekStartsOn}
      showOutsideDays={showOutsideDays}
      fixedWeeks={fixedWeeks}
      className={cn("w-fit text-sm text-foreground", className)}
      classNames={{
        root: "relative",
        months: "relative flex flex-col gap-2",
        month: "grid gap-2",
        month_caption: "flex h-8 items-center justify-center",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between",
        button_previous: navButton,
        button_next: navButton,
        chevron: "size-4",
        month_grid: "border-collapse",
        weekdays: "",
        weekday: "size-9 text-center text-xs font-medium text-muted-foreground",
        week: "",
        day: "group size-9 p-0 text-center",
        day_button: cn(
          "inline-flex size-9 items-center justify-center rounded-md tabular-nums transition-colors duration-150 ease-out",
          "hover:bg-muted disabled:pointer-events-none",
          "group-data-[today=true]:outline group-data-[today=true]:outline-1 group-data-[today=true]:-outline-offset-1 group-data-[today=true]:outline-ring group-data-[today=true]:font-semibold",
          "group-data-[selected=true]:bg-primary group-data-[selected=true]:text-primary-foreground group-data-[selected=true]:hover:bg-primary-hover group-data-[selected=true]:font-medium",
          focusRing,
        ),
        selected: "",
        today: "",
        outside: "text-foreground-muted",
        disabled: "opacity-55",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: c }) =>
          orientation === "left" ? (
            <ChevronLeftIcon aria-hidden="true" className={cn("size-4", c)} />
          ) : (
            <ChevronRightIcon aria-hidden="true" className={cn("size-4", c)} />
          ),
        ...components,
      }}
      {...props}
    />
  )
}

export { Calendar }
