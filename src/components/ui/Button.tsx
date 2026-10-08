import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { LoaderCircle } from "lucide-react";
import { cn, focusRing } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none " +
  "transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 " +
  "[&_svg]:size-4 [&_svg]:shrink-0 " + focusRing;

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover",
  secondary: "border border-border-strong bg-surface text-foreground shadow-card hover:bg-surface-muted",
  ghost: "text-foreground-secondary hover:bg-surface-muted hover:text-foreground",
  danger: "bg-destructive text-destructive-foreground shadow-card hover:bg-destructive-hover",
};

const SIZES: Record<ButtonSize, string> = {
  // 32px visual, 36px touch target (transparent ::after extends the hit area 2px up and down).
  sm: "relative h-8 px-3 text-[13px] after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']",
  md: "h-9 px-4 text-sm",
};

/**
 * Button styles for anything that should look like a button, including `<Link>` and `<a>`:
 * `<Link href="/requests/new" className={buttonClass({ variant: "primary" })}>New request</Link>`.
 */
export function buttonClass({ variant = "secondary", size = "md", block = false, className }: {
  variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** React 19: refs are plain props (focus management, e.g. confirm steps). */
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner, sets aria-busy and disables the button. Keep the label (e.g. "Saving…"). */
  loading?: boolean;
  /** Icon before the label (lucide icon element; sized 16px automatically). */
  icon?: ReactNode;
  /** Icon after the label. */
  iconRight?: ReactNode;
};

/** `type` defaults to "button" (pass type="submit" inside forms). */
export function Button({ variant = "secondary", size = "md", block, loading = false, icon, iconRight, className, disabled, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} {...rest} disabled={disabled || loading} aria-busy={loading || undefined}
      className={buttonClass({ variant, size, block, className })}>
      {loading ? <LoaderCircle aria-hidden="true" strokeWidth={1.75} className="animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
}
