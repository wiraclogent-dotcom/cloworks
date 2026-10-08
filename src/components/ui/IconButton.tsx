import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, focusRing } from "./cn";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  /** Required: the button has no visible text. Also used as the tooltip (title) unless `title` is given. */
  "aria-label": string;
  icon: ReactNode;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary";
};

/** Square icon-only button (32px sm / 36px md). */
export function IconButton({ icon, size = "md", variant = "ghost", className, type = "button", title, ...rest }: IconButtonProps) {
  return (
    <button type={type} title={title ?? rest["aria-label"]} {...rest}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:size-[18px] [&_svg]:shrink-0",
        size === "sm" ? "relative size-8 after:absolute after:-inset-0.5 after:content-['']" : "size-9",
        variant === "secondary"
          ? "border border-border-strong bg-surface text-foreground hover:bg-surface-muted"
          : "text-foreground-secondary hover:bg-surface-muted hover:text-foreground",
        focusRing, className,
      )}>
      {icon}
    </button>
  );
}
