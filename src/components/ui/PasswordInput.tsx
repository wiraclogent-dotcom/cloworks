"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn, focusRing } from "./cn";
import { fieldClass } from "./Field";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Password field with a show/hide toggle inside it on the right. Takes every input prop except `type`; `className`
 * defaults to `fieldClass()` (pass the form's own control class to match its other fields). The toggle is a real
 * `type="button"` (never submits), keyboard focusable, labelled "Show password" / "Hide password" with aria-pressed.
 */
export function PasswordInput({ className, ...props }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={cn(className ?? fieldClass(), "pr-10")} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={props.id}
        className={cn(
          "absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground",
          "transition-colors duration-150 ease-out hover:text-foreground disabled:cursor-not-allowed",
          focusRing,
        )}
        disabled={props.disabled}
      >
        {shown ? <EyeOff aria-hidden="true" strokeWidth={1.75} className="size-4" /> : <Eye aria-hidden="true" strokeWidth={1.75} className="size-4" />}
      </button>
    </div>
  );
}

/** "Remember me" for the password sign-in forms: unchecked by default; checked posts `remember=1` (30-day session). */
export function RememberMe({ id }: { id: string }) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} name="remember" type="checkbox" value="1" className="size-4 accent-primary" />
      <label htmlFor={id} className="text-sm text-foreground">Remember me</label>
    </div>
  );
}
