import type { AppRole } from "@prisma/client";
import { requireScope } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { ProfileMenuView } from "./ProfileMenuView";

const ROLE_LABEL: Record<AppRole, string> = { REQUESTER: "Requester", CREATIVE: "Creative", LEAD: "Lead", ADMIN: "Admin" };

/** Server wrapper for the top-right profile menu: reads the signed-in name and role and hands over the sign-out action. */
export async function ProfileMenu() {
  const { user: { id, appRole }, db } = await requireScope();
  const me = await db.user.findUnique({ where: { id }, select: { name: true } });
  return (
    <ProfileMenuView name={me?.name ?? ""} roleLabel={ROLE_LABEL[appRole]}
      signOut={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }} />
  );
}
