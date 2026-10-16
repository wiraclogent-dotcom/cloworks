/** A person's photo URL. Carries the upload time (?v=), so a changed photo gets a new URL past the long-lived cache. */
export function photoUrl(userId: string, updatedAt: Date): string {
  return `/api/avatar/${userId}?v=${updatedAt.getTime()}`;
}
