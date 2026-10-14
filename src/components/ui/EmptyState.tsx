import type { ReactNode } from "react";
import type { ArtName } from "@/lib/brand/art";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { BrandArt } from "./BrandArt";
import { cn } from "./cn";

/**
 * Empty list / no results: illustration (or icon), one-line headline, one sentence, optional action (e.g. a
 * `<Button asChild>` link), on the shadcn `Empty` parts. `art` shows a brand illustration that gently floats; `icon`
 * is the fallback when art is off or not given. `titleAs` makes the headline a real heading when the state replaces a
 * whole page (403, not found: `h1`); `role` announces it (e.g. "alert" for access denied).
 *
 * `size="inline"` is a quiet one-line "nothing here yet" for inside a card or a section: no border, no media, left
 * aligned, the title only (description, action and children are ignored). It has no vertical padding; pass margins
 * in `className` (`mb-4`, `mt-2`) to match the spacing the line replaces.
 */
export function EmptyState({ icon, art, title, description, action, titleAs: Title = "p", role, size = "page", className, children }: {
  icon?: ReactNode; art?: ArtName; title: string; description?: ReactNode; action?: ReactNode;
  titleAs?: "p" | "h1" | "h2" | "h3"; role?: "alert" | "status"; size?: "page" | "inline"; className?: string; children?: ReactNode;
}) {
  if (size === "inline") {
    return (
      <Empty role={role} className={cn("items-start justify-start rounded-none border-0 bg-transparent px-0 py-0 text-left", className)}>
        <EmptyTitle asChild className="text-sm font-normal tracking-normal text-muted-foreground"><Title>{title}</Title></EmptyTitle>
      </Empty>
    );
  }
  const showArt = art && process.env.NEXT_PUBLIC_BRAND_CLOUD;
  return (
    <Empty role={role} className={cn("animate-rise", className)}>
      <EmptyHeader>
        {showArt ? (
          <EmptyMedia><BrandArt name={art} width={144} className="animate-float size-36 object-contain" /></EmptyMedia>
        ) : icon ? (
          <EmptyMedia variant="icon" aria-hidden="true">{icon}</EmptyMedia>
        ) : null}
        <EmptyTitle asChild className={cn("font-display", Title === "h1" && "text-heading")}><Title>{title}</Title></EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {children}
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
