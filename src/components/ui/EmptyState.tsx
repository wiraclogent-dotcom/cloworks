import type { ReactNode } from "react";
import type { ArtName } from "@/lib/brand/art";
import { Card } from "@/components/shadcn/card";
import { BrandArt } from "./BrandArt";
import { cn } from "./cn";

/**
 * Empty list / no results: illustration (or icon), one-line headline, one sentence, optional action (e.g. a
 * `<Button asChild>` link). `art` shows a brand illustration that gently floats; `icon` is the fallback when art is off
 * or not given. `titleAs` makes the headline a real heading when the state replaces a whole page (403, not found:
 * `h1`); `role` announces it (e.g. "alert" for access denied).
 */
export function EmptyState({ icon, art, title, description, action, titleAs: Title = "p", role, className, children }: {
  icon?: ReactNode; art?: ArtName; title: string; description?: ReactNode; action?: ReactNode;
  titleAs?: "p" | "h1" | "h2" | "h3"; role?: "alert" | "status"; className?: string; children?: ReactNode;
}) {
  const showArt = art && process.env.NEXT_PUBLIC_BRAND_CLOUD;
  return (
    <Card role={role} className={cn("animate-rise flex flex-col items-center border-dashed border-border-strong px-6 py-10 text-center shadow-none", className)}>
      {showArt ? (
        <BrandArt name={art} width={144} className="animate-float mb-2 size-36 object-contain" />
      ) : icon ? (
        <span aria-hidden="true" className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon}</span>
      ) : null}
      <Title className={cn("font-display text-lg font-semibold tracking-[-0.01em] text-foreground", Title === "h1" && "text-heading")}>{title}</Title>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {children}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </Card>
  );
}
