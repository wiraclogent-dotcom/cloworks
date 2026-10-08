/**
 * Admin table chips (pure): label + palette tone for app roles, job roles and the active flag.
 * The label is always the text of the chip, so the tone is never the only signal.
 */
import type { Tone } from "./palette";

/** "SOCIAL_MEDIA" → "Social media" (same wording the admin forms use for their options). */
export const enumLabel = (r: string) => r.charAt(0) + r.slice(1).toLowerCase().replace("_", " ");

const APP_ROLE_TONE: Record<string, Tone> = { ADMIN: "first-look", LEAD: "in-progress", CREATIVE: "done", REQUESTER: "requested" };

export function appRoleChip(role: string): { label: string; tone: Tone } {
  return { label: enumLabel(role), tone: APP_ROLE_TONE[role] ?? "tag-neutral" };
}

export function jobRoleChip(role: string): { label: string; tone: Tone } {
  return { label: enumLabel(role), tone: "tag-neutral" };
}

export function activeChip(active: boolean): { label: string; tone: Tone } {
  return active ? { label: "Active", tone: "done" } : { label: "Inactive", tone: "tag-neutral" };
}
