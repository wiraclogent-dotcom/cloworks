import type { AppRole } from "@prisma/client";
import { requireScope } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { ProfileMenuView } from "./ProfileMenuView";

const ROLE_LABEL: Record<AppRole, string> = { REQUESTER: "Requester", CREATIVE: "Creative", LEAD: "Lead", ADMIN: "Admin" };

/** Server wrapper for the sidebar profile card: reads the signed-in name, title, department and role and hands over the sign-out action. */
export async function ProfileMenu() {
  const { user: { id, name, appRole }, db } = await requireScope();
  const me = await db.user.findUnique({ where: { id }, select: { title: true, department: true } });
  return (
    <ProfileMenuView name={name} title={me?.title ?? null} department={me?.department ?? null} roleLabel={ROLE_LABEL[appRole]}
      signOut={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }} />
  );
}
