"use client"

import * as React from "react"
import { cn } from "@/components/ui/cn"
import { Slider as SliderPrimitive } from "radix-ui"

/**
 * shadcn Slider on our tokens. `trackClassName` paints the track (e.g. a gradient legend); `showRange={false}` drops
 * the filled range for a two-way scale whose middle is neutral (a range from the minimum would read as "more").
 */
function Slider({
  className,
  trackClassName,
  showRange = true,
  thumbProps,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  trackClassName?: string; showRange?: boolean;
  /** Passed to every thumb: its accessible name (`aria-label`) and a spoken value (`aria-valuetext`). */
  thumbProps?: { "aria-label"?: string; "aria-valuetext"?: string };
}) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
          trackClassName
        )}
      >
        {showRange ? (
          <SliderPrimitive.Range
            data-slot="slider-range"
            className="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          />
        ) : null}
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          {...thumbProps}
          className="block size-5 shrink-0 rounded-full border-2 border-primary bg-card shadow-card transition-[color,box-shadow] duration-150 hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
