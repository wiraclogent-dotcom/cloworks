import { requireScope } from "@/lib/session";
import { chatUnreadCountWith, latestUnreadChatWith } from "@/lib/chat";
import { ChatDockView, type LatestUnread } from "./ChatDockView";

/**
 * Server wrapper for the bottom-right chat dock: reads the signed-in person's unread count and newest unread chat.
 * The badge is not worth breaking the page for: if those reads fail, the dock renders with nothing unread.
 */
export async function ChatDock() {
  const { user, db } = await requireScope();
  const me = { id: user.id, workspaceId: user.workspaceId };
  let unread = 0;
  let latestUnread: LatestUnread | null = null;
  try {
    [unread, latestUnread] = await Promise.all([chatUnreadCountWith(db, me), latestUnreadChatWith(db, me)]);
  } catch (e) {
    console.error("chat dock: unread query failed", e);
  }
  return <ChatDockView unread={unread} latestUnread={latestUnread} userId={user.id} />;
}
