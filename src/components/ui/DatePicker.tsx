"use client";

import { useId, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/shadcn/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { formatJakartaDay, jakartaIso } from "@/lib/projectTasks";
import { cn, focusRing } from "./cn";
import { fieldClass } from "./Field";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Dates here are Jakarta calendar days kept as `YYYY-MM-DD` strings. react-day-picker works with local Date objects,
 * so a day is turned into local noon (never midnight: a DST or UTC shift can't move it onto a neighbouring day)
 * and read back with the local getters. The same wall-clock day comes out in every time zone.
 */
export function isoToLocal(iso: string): Date | undefined {
  const m = ISO.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : undefined;
}
export function localToIso(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today's Jakarta calendar day as a local-noon Date, for the Calendar's `today` / `defaultMonth`. */
export function jakartaTodayLocal(): Date {
  return isoToLocal(jakartaIso(new Date()))!;
}

export type DatePickerProps = {
  /** Submitted as a hidden `<input type="hidden">` (`YYYY-MM-DD`, empty when there is no date), so plain form actions keep working. */
  name?: string;
  /** `YYYY-MM-DD` or null. Changing the prop later replaces what is shown. */
  value: string | null;
  onChange?: (iso: string | null) => void;
  /** Shows a clear button while a date is set. */
  allowClear?: boolean;
  placeholder?: string;
  /** Earliest and latest pickable `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  id?: string;
  disabled?: boolean;
  size?: "default" | "sm";
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

/**
 * A field-looking button that opens a calendar. Looks like `fieldClass()`, shows "19 Oct 2026" (Jakarta), picking a day
 * closes the popover. Esc or an outside click closes without changing anything.
 */
export function DatePicker({
  name, value, onChange, allowClear = false, placeholder = "Select date", min, max, id, disabled, size = "default", className,
  "aria-label": ariaLabel, "aria-labelledby": labelledBy, "aria-describedby": describedBy, "aria-invalid": invalid,
}: DatePickerProps) {
  const autoId = useId();
  const triggerId = id ?? autoId;
  const [current, setCurrent] = useState<string | null>(value);
  const [seen, setSeen] = useState<string | null>(value);
  if (value !== seen) { setSeen(value); setCurrent(value); } // a new prop wins over what was picked before
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = current ? isoToLocal(current) : undefined;
  const display = current && selected ? formatJakartaDay(current) : null;
  const minDate = min ? isoToLocal(min) : undefined;
  const maxDate = max ? isoToLocal(max) : undefined;
  const disabledDays = [minDate && { before: minDate }, maxDate && { after: maxDate }].filter((m): m is NonNullable<typeof m> => !!m);
  const isInvalid = invalid === true || invalid === "true";
  const clearable = allowClear && !!current && !disabled;

  function pick(iso: string | null) {
    setCurrent(iso);
    onChange?.(iso);
  }

  const label = ariaLabel ? `${ariaLabel}${display ? `: ${display}` : ""}` : undefined;

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* aria-invalid is not announced on a button, but forms look for [aria-invalid="true"] to focus the first problem;
              the message itself is linked through aria-describedby. */}
          {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
          <button
            ref={triggerRef}
            type="button"
            id={triggerId}
            disabled={disabled}
            aria-label={label}
            aria-labelledby={!ariaLabel && labelledBy ? `${labelledBy} ${triggerId}` : undefined}
            aria-describedby={describedBy}
            aria-invalid={isInvalid ? true : undefined}
            className={cn(
              fieldClass({ invalid: isInvalid, size: size === "sm" ? "sm" : "md" }),
              "flex items-center justify-between gap-2 text-left",
              clearable && "pr-14",
            )}
          >
            <span className={cn("truncate tabular-nums", !display && "text-placeholder")}>{display ?? placeholder}</span>
            <CalendarDays aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-3"
          aria-label={ariaLabel ? `Choose ${ariaLabel}` : undefined}
          aria-labelledby={!ariaLabel ? labelledBy : undefined}
          onOpenAutoFocus={(e) => {
            // Land on the roving-tabindex day (selected, else today) so arrow keys work straight away.
            e.preventDefault();
            contentRef.current?.querySelector<HTMLElement>('button[tabindex="0"]')?.focus();
          }}
          ref={contentRef}
        >
          <Calendar
            mode="single"
            required
            selected={selected}
            defaultMonth={selected ?? jakartaTodayLocal()}
            today={jakartaTodayLocal()}
            disabled={disabledDays.length ? disabledDays : undefined}
            onSelect={(d) => { if (d) { pick(localToIso(d)); setOpen(false); } }}
          />
        </PopoverContent>
      </Popover>
      {clearable && (
        <button
          type="button"
          id={`${triggerId}-clear`}
          aria-label={ariaLabel ? `Clear ${ariaLabel}` : labelledBy ? "Clear" : "Clear date"}
          aria-labelledby={!ariaLabel && labelledBy ? `${triggerId}-clear ${labelledBy}` : undefined}
          title="Clear"
          onClick={() => { pick(null); triggerRef.current?.focus(); }}
          className={cn(
            "absolute top-1/2 right-8 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground",
            focusRing,
          )}
        >
          <X aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
        </button>
      )}
      {name && <input type="hidden" name={name} value={current ?? ""} disabled={disabled} />}
    </div>
  );
}
