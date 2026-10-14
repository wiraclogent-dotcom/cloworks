"use client";

import { UserPlus } from "lucide-react";
import { avatarColor, initials } from "@/lib/palette";
import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { cn } from "./cn";
import { usePhotoFor } from "./photoDirectory";

export type AvatarSize = "sm" | "md" | "lg";
const SIZE: Record<AvatarSize, string> = {
  // Initials never below 11px (QA D8): the small avatar is 24px.
  sm: "size-6 text-[11px]",
  md: "size-7 text-[11px]",
  lg: "size-9 text-compact",
};

type Common = {
  size?: AvatarSize;
  /** The person's profile photo URL. Defaults to their photo from the workspace directory; initials when there is none. */
  src?: string | null;
  /** A 2px surface-coloured ring (separates overlapping avatars in a stack). */
  ring?: boolean;
  /** true when the name is printed right next to the avatar: hides it from assistive tech. */
  decorative?: boolean;
  className?: string;
};

/**
 * Round initials avatar on the shadcn Avatar. Same person (short name, case/space-insensitive) = same colour everywhere.
 * The photo shows once it has loaded; the initials stay until then and when there is no photo or it fails.
 */
export function Avatar({ name, size = "md", ring, decorative, className, src }: Common & { name: string }) {
  const c = avatarColor(name);
  const known = usePhotoFor(name);
  const photo = src === undefined ? known : src;
  // No name = nothing to announce: hidden like a decorative avatar (never role="img" with aria-label="").
  const hidden = decorative || name.trim() === "";
  return (
    <AvatarRoot {...(hidden ? { "aria-hidden": true } : { role: "img", "aria-label": name })} title={hidden ? undefined : name}
      style={{ background: c.tint, color: c.text }}
      className={cn("inline-flex font-semibold tracking-wide uppercase", SIZE[size], ring && "ring-2 ring-card", className)}>
      {photo ? <AvatarImage src={photo} alt="" /> : null}
      <AvatarFallback className="bg-transparent text-inherit">{initials(name)}</AvatarFallback>
    </AvatarRoot>
  );
}

/** Dashed circle with a user-plus icon, for requests nobody is assigned to yet. */
export function UnassignedAvatar({ size = "md", ring, decorative, className }: Common) {
  return (
    <AvatarRoot {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Unassigned" })} title={decorative ? undefined : "Unassigned"}
      className={cn("inline-flex border border-dashed border-input bg-card text-muted-foreground", SIZE[size], ring && "ring-2 ring-card", className)}>
      <AvatarFallback className="bg-transparent text-inherit">
        <UserPlus aria-hidden="true" strokeWidth={1.75} className={size === "lg" ? "size-4" : "size-3.5"} />
      </AvatarFallback>
    </AvatarRoot>
  );
}

/** Overlapping avatars; shows `max` and a "+N" pill. The group is announced as one list of names. */
export function AvatarStack({ names, max = 3, size = "md", label = "People", className }: {
  names: string[]; max?: number; size?: AvatarSize; label?: string; className?: string;
}) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span role="img" aria-label={names.length ? `${label}: ${names.join(", ")}` : `${label}: none`} className={cn("inline-flex items-center -space-x-1.5", className)}>
      {shown.map((n, i) => <Avatar key={`${n}-${i}`} name={n} size={size} ring decorative />)}
      {extra > 0 ? (
        <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card tabular-nums", SIZE[size])}>+{extra}</span>
      ) : null}
    </span>
  );
}
