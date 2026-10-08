import { UserPlus } from "lucide-react";
import { avatarColor, initials } from "@/lib/palette";
import { cn } from "./cn";

export type AvatarSize = "sm" | "md" | "lg";
const SIZE: Record<AvatarSize, string> = {
  sm: "size-5 text-[9px]",
  md: "size-7 text-[11px]",
  lg: "size-9 text-[13px]",
};

type Common = {
  size?: AvatarSize;
  /** A 2px surface-coloured ring (separates overlapping avatars in a stack). */
  ring?: boolean;
  /** true when the name is printed right next to the avatar: hides it from assistive tech. */
  decorative?: boolean;
  className?: string;
};

/** Round initials avatar. Same person (short name, case/space-insensitive) = same colour everywhere. */
export function Avatar({ name, size = "md", ring, decorative, className }: Common & { name: string }) {
  const c = avatarColor(name);
  return (
    <span {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })} title={decorative ? undefined : name}
      style={{ background: c.tint, color: c.text }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide uppercase select-none", SIZE[size], ring && "ring-2 ring-surface", className)}>
      {initials(name)}
    </span>
  );
}

/** Dashed circle with a user-plus icon, for requests nobody is assigned to yet. */
export function UnassignedAvatar({ size = "md", ring, decorative, className }: Common) {
  return (
    <span {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Unassigned" })} title={decorative ? undefined : "Unassigned"}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-input bg-surface text-foreground-secondary", SIZE[size], ring && "ring-2 ring-surface", className)}>
      <UserPlus aria-hidden="true" strokeWidth={1.75} className={size === "sm" ? "size-3" : size === "md" ? "size-3.5" : "size-4"} />
    </span>
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
        <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-surface-muted font-semibold text-foreground-secondary ring-2 ring-surface tabular-nums", SIZE[size])}>+{extra}</span>
      ) : null}
    </span>
  );
}
