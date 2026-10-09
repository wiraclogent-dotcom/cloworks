import { redirect } from "next/navigation";
import { requireUserForPasswordChange } from "@/lib/session";
import { isUnauthenticated } from "@/lib/session-core";

/**
 * Reads the session (dynamic), so it sits in its own Suspense boundary and the page shell stays static. Signed-out
 * visitors go to sign-in; anyone without a pending password change goes to Settings, where voluntary changes live.
 * The action re-checks the session, so briefly showing the static form first is harmless.
 */
export async function SessionGate() {
  let mustChange: boolean;
  try {
    mustChange = (await requireUserForPasswordChange()).mustChangePassword;
  } catch (e) {
    if (!isUnauthenticated(e)) throw e;
    redirect("/signin");
  }
  if (!mustChange) redirect("/settings");
  return null;
}
