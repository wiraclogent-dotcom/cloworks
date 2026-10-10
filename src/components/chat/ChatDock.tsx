import { requireScope } from "@/lib/session";
import { chatUnreadCountWith } from "@/lib/chat";
import { ChatDockView } from "./ChatDockView";

/** Server wrapper for the bottom-right chat dock: reads the signed-in person's unread chat count. */
export async function ChatDock() {
  const { user, db } = await requireScope();
  const unread = await chatUnreadCountWith(db, { id: user.id, workspaceId: user.workspaceId });
  return <ChatDockView unread={unread} userId={user.id} />;
}
