import { requireScope } from "@/lib/session";
import { chatUnreadCountWith, latestUnreadChatWith } from "@/lib/chat";
import { ChatDockView } from "./ChatDockView";

/** Server wrapper for the bottom-right chat dock: reads the signed-in person's unread count and newest unread chat. */
export async function ChatDock() {
  const { user, db } = await requireScope();
  const me = { id: user.id, workspaceId: user.workspaceId };
  const [unread, latestUnread] = await Promise.all([chatUnreadCountWith(db, me), latestUnreadChatWith(db, me)]);
  return <ChatDockView unread={unread} latestUnread={latestUnread} userId={user.id} />;
}
