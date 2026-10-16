type Env = Record<string, string | undefined>;

/**
 * Platform admins are the people who run Clowork itself (not admins of one workspace), configured by the
 * comma-separated PLATFORM_ADMIN_EMAILS variable. Unset means nobody.
 */
export function platformAdminEmails(env: Env = process.env): string[] {
  return (env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== "");
}

export function isPlatformAdmin(email: string | null | undefined, env: Env = process.env): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return platformAdminEmails(env).includes(normalized);
}

/** The session user carries no email, so the viewer's email is read from the database. */
export async function isPlatformAdminUser(
  db: {
    user: {
      findUnique(args: { where: { id: string }; select: { email: true } }): Promise<{ email: string | null } | null>;
    };
  },
  userId: string,
  env: Env = process.env,
): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  return isPlatformAdmin(user?.email, env);
}
