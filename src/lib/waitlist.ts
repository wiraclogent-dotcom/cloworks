import type { PrismaClient, WaitlistStatus, WaitlistTeamSize } from "@prisma/client";
import { failed, field, told, type AuthFormState } from "@/lib/authForm";

/** The team-size choices, in the order the form and the admin table show them. */
export const WAITLIST_SIZES: readonly { value: WaitlistTeamSize; label: string }[] = [
  { value: "SIZE_1_5", label: "1–5" },
  { value: "SIZE_6_15", label: "6–15" },
  { value: "SIZE_16_50", label: "16–50" },
  { value: "SIZE_50_PLUS", label: "50+" },
];

/** More sign-ups than this in one hour are still stored, but stop emailing the admins (spam guard). */
export const NOTIFY_CAP_PER_HOUR = 20;

export type NewWaitlistEntry = { email: string; team: string; teamSize: WaitlistTeamSize };
type Db = Pick<PrismaClient, "waitlistEntry">;
export type WaitlistDeps = { db: Db; notify: (e: NewWaitlistEntry) => void; now?: () => Date };

/** The same copy for a new and an already-listed address, so nobody can learn who is on the list. */
export const waitlistSuccess = (email: string): string =>
  `You're on the list. We'll email you at ${email} when there's a spot for your team.`;

const isSize = (v: string): v is WaitlistTeamSize => WAITLIST_SIZES.some((s) => s.value === v);

/** A valid-looking address: something, an @, then a dot with text on both sides of it. */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const isUniqueViolation = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

export async function joinWaitlistWith({ db, notify, now = () => new Date() }: WaitlistDeps, fd: FormData): Promise<NonNullable<AuthFormState>> {
  const rawEmail = field(fd, "email", { max: 320 });
  const email = rawEmail.toLowerCase();

  // Honeypot: real people never see this field. Any value at all (read raw: `field` drops over-long ones) is a bot,
  // answered like a success with nothing kept.
  const website = fd.get("website");
  if (typeof website === "string" && website !== "") return told(waitlistSuccess(email));

  const team = field(fd, "team", { max: 120 });
  const size = field(fd, "teamSize");
  const values = { email: rawEmail, team, teamSize: isSize(size) ? size : "" };

  if (!EMAIL_RE.test(rawEmail)) return failed("Enter your work email.", values);
  if (team === "") return failed("Enter your team or company name.", values);
  if (!isSize(size)) return failed("Choose your team size.", values);

  const entry: NewWaitlistEntry = { email, team, teamSize: size };
  const at = now();
  try {
    await db.waitlistEntry.create({ data: { ...entry, createdAt: at } });
  } catch (e) {
    if (isUniqueViolation(e)) return told(waitlistSuccess(email));
    return failed("Something went wrong. Try again in a minute.", values);
  }

  // The count includes the row just created, so the 20th sign-up in an hour is the last one that emails.
  try {
    const recent = await db.waitlistEntry.count({ where: { createdAt: { gte: new Date(at.getTime() - 3_600_000) } } });
    if (recent <= NOTIFY_CAP_PER_HOUR) notify(entry);
  } catch {
    // The entry is saved; a failed count only skips the admin email.
  }
  return told(waitlistSuccess(email));
}

/** Everyone on the list, newest first. */
export const listWaitlist = (db: Db) => db.waitlistEntry.findMany({ orderBy: { createdAt: "desc" } });

export async function setWaitlistStatus(db: Db, id: string, status: WaitlistStatus): Promise<void> {
  await db.waitlistEntry.update({ where: { id }, data: { status, contactedAt: status === "CONTACTED" ? new Date() : null } });
}

export async function deleteWaitlistEntry(db: Db, id: string): Promise<void> {
  await db.waitlistEntry.delete({ where: { id } });
}
