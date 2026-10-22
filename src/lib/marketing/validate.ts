import { isValidMonth } from "../kpi/months";
import { isRealDate } from "../createRequest";
import { DAY_MS, utc } from "../calendar";
import { MarketingError } from "./errors";
import { MARKETING_STATUSES, type ActivityInput, type AnnouncementInput, type MarketingStatus } from "./types";

export const MAX_TITLE = 120;
export const MAX_BODY = 500;
export const MAX_FOCUS = 500;
export const MAX_RANGE_DAYS = 366;

const invalid = (fieldErrors: Record<string, string>) => new MarketingError("INVALID", "Check the highlighted fields.", fieldErrors);

/** Field errors for a start/end pair of Jakarta days (both required). */
function rangeErrors(startDay: string, endDay: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isRealDate(startDay)) errors.startDay = "Pick a valid date.";
  if (!isRealDate(endDay)) errors.endDay = "Pick a valid date.";
  if (Object.keys(errors).length) return errors;
  if (endDay < startDay) errors.endDay = "End date can't be before the start date.";
  else if (Math.round((utc(endDay) - utc(startDay)) / DAY_MS) + 1 > MAX_RANGE_DAYS) errors.endDay = "Pick a range of 366 days or fewer.";
  return errors;
}

export function validateActivity(input: ActivityInput): Omit<ActivityInput, "status"> & { status: MarketingStatus } {
  const title = input.title.trim();
  const errors: Record<string, string> = {};
  if (!title) errors.title = "Enter a title.";
  else if (title.length > MAX_TITLE) errors.title = "Title must be 120 characters or fewer.";
  Object.assign(errors, rangeErrors(input.startDay, input.endDay));
  if (!(MARKETING_STATUSES as readonly string[]).includes(input.status)) errors.status = "Pick a status.";
  if (Object.keys(errors).length) throw invalid(errors);
  return { title, divisionId: input.divisionId, startDay: input.startDay, endDay: input.endDay, status: input.status as MarketingStatus };
}

export function validateAnnouncement(input: AnnouncementInput): AnnouncementInput {
  const body = input.body.trim();
  const errors: Record<string, string> = {};
  if (!body) errors.body = "Write the announcement.";
  else if (body.length > MAX_BODY) errors.body = "Announcement must be 500 characters or fewer.";
  if (!isValidMonth(input.month)) errors.month = "Pick a valid month.";
  if (Object.keys(errors).length) throw invalid(errors);
  return { month: input.month, body };
}

/** Trimmed; an empty string clears the month's focus. */
export function validateProductFocus(text: string): string {
  const v = text.trim();
  if (v.length > MAX_FOCUS) throw invalid({ productFocus: "Product focus must be 500 characters or fewer." });
  return v;
}
