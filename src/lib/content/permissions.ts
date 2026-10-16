import type { AppRole, JobRole } from "@prisma/client";

export type ContentActor = { id: string; appRole: AppRole; jobRole: JobRole };

const isLeadOrAdmin = (u: ContentActor) => u.appRole === "LEAD" || u.appRole === "ADMIN";

// Drafters: creatives, leads and admins, plus any social media owner.
export function canDraftContent(u: ContentActor): boolean {
  return u.appRole === "CREATIVE" || isLeadOrAdmin(u) || u.jobRole === "SOCIAL_MEDIA";
}

export function canApproveContent(u: ContentActor): boolean {
  return isLeadOrAdmin(u);
}

export function canManageChannels(u: ContentActor): boolean {
  return isLeadOrAdmin(u);
}
