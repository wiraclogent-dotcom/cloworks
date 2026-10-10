/** Notification type for Library adds/edits (no request attached; clicking opens the Library). */
export const LIBRARY_NOTIFICATION = "LIBRARY";

/** Where clicking a notification goes: its request, the Library, or nowhere. */
export function notificationHref(n: { type: string; requestId: string | null }): string | null {
  if (n.requestId) return `/requests/${encodeURIComponent(n.requestId)}`;
  return n.type === LIBRARY_NOTIFICATION ? "/library" : null;
}
