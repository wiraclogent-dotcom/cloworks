/** Notification type for Library adds/edits (no request attached; clicking opens the Library). */
export const LIBRARY_NOTIFICATION = "LIBRARY";

/** Notification type for a new join request (no request attached; clicking opens Members → Requests). */
export const JOIN_REQUEST_NOTIFICATION = "JOIN_REQUEST";

/** Notification type for Content Plan events (no request attached; clicking opens the post). */
export const CONTENT_NOTIFICATION = "CONTENT";

/** Where clicking a notification goes: its request, its Content Plan post, the Library, the join requests, or nowhere. */
export function notificationHref(n: { type: string; requestId: string | null; contentPostId?: string | null }): string | null {
  if (n.requestId) return `/requests/${encodeURIComponent(n.requestId)}`;
  if (n.contentPostId) return `/content?post=${encodeURIComponent(n.contentPostId)}`;
  if (n.type === LIBRARY_NOTIFICATION) return "/library";
  if (n.type === JOIN_REQUEST_NOTIFICATION) return "/admin/users?tab=requests";
  return null;
}
