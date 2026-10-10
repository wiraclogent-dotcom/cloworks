import type { ProjectStage, ProjectStatus } from "@prisma/client";

/** Display labels for the design-project stages (the sheet's own wording). */
export const PROJECT_STAGE_LABEL: Record<ProjectStage, string> = {
  NOT_STARTED: "Not Started",
  FIRST_PREVIEW: "First Preview",
  MANUSCRIPT: "Manuscript",
  TECHNICAL_ARTWORK: "Technical Artwork",
  APPROVAL: "Approval",
  FINAL_ARTWORK: "Final Artwork",
  CANCELLED: "Canceled",
};

const MAX_FILE_URL_LENGTH = 2048;

/** A blank value clears the link (returns null). Anything else must be a full http(s) link; returns it trimmed, or undefined when invalid. */
export function cleanFileUrl(input: string): string | null | undefined {
  const value = input.trim();
  if (!value) return null;
  if (value.length > MAX_FILE_URL_LENGTH || !/^https?:\/\/\S+$/i.test(value)) return undefined;
  return value;
}

/** A blank value clears the date (null). `YYYY-MM-DD` must be a real calendar date; anything else returns undefined. */
export function cleanTaskDate(input: string): string | null | undefined {
  const value = input.trim();
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return undefined;
  return value;
}

/** Jakarta-midnight instant for a `YYYY-MM-DD` day, the same convention the sheet importer uses. */
export const jakartaDay = (iso: string) => new Date(`${iso}T00:00:00+07:00`);

/** The Jakarta calendar day of an instant as `YYYY-MM-DD` (for date inputs). */
export const jakartaIso = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" });
/** A `YYYY-MM-DD` day or a stored instant, shown as "10 Jun 2026" (Jakarta calendar). */
export function formatJakartaDay(day: string | Date): string {
  return dayFmt.format(typeof day === "string" ? jakartaDay(day) : day);
}

/** Labels and order for a task's status (tracker projects). Same vocabulary as the project statuses. */
export const TASK_STATUS_ORDER: ProjectStatus[] = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "DONE"];
export const TASK_STATUS_LABEL: Record<ProjectStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  ON_HOLD: "On Hold",
  DONE: "Done",
};

/** Returns a message when the due date is before the start date (both `YYYY-MM-DD`, or blank). */
export function dateOrderError(startIso: string | null, dueIso: string | null): string | undefined {
  if (startIso && dueIso && dueIso < startIso) return "The due date can't be before the start date.";
  return undefined;
}
