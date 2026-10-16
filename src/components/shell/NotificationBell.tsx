import { requireScope } from "@/lib/session";
import { unreadCountWith } from "@/lib/inbox";
import { NotificationBellView } from "./NotificationBellView";

/** Server wrapper for the top-bar bell: reads the signed-in person's unread count. */
export async function NotificationBell() {
  const { user, db } = await requireScope();
  return <NotificationBellView unread={await unreadCountWith(db, user.id)} />;
}
