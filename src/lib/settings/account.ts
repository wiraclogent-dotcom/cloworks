import type { AppRole, JobRole } from "@prisma/client";

export const ROLE_LABEL: Record<AppRole, string> = { REQUESTER: "Requester", CREATIVE: "Creative", LEAD: "Lead", ADMIN: "Admin" };
export const JOB_ROLE_LABEL: Record<JobRole, string> = { DESIGNER: "Designer", SOCIAL_MEDIA: "Social media", OTHER: "Other" };

export type AccountInput = {
  fullName: string;
  email: string | null;
  title: string | null;
  department: string | null;
  appRole: AppRole;
  jobRole: JobRole;
};

/** Read-only account fields for the General settings page. Empty optional values show a dash. */
export function accountRows(a: AccountInput): { label: string; value: string }[] {
  const or = (v: string | null) => (v && v.trim() !== "" ? v : "—");
  return [
    { label: "Full name", value: a.fullName },
    { label: "Email", value: or(a.email) },
    { label: "Role", value: ROLE_LABEL[a.appRole] },
    { label: "Job role", value: JOB_ROLE_LABEL[a.jobRole] },
    { label: "Department", value: or(a.department) },
    { label: "Title", value: or(a.title) },
  ];
}
