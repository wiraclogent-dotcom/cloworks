import type { AppRole, JobRole, PrismaClient } from "@prisma/client";
import type { FieldSchema } from "../src/lib/fieldSchema";

type RosterEntry = {
  name: string;
  fullName: string;
  title?: string;
  jobRole: JobRole;
  appRole: AppRole;
  aliases?: string[];
  active?: boolean;
  email?: string;
};

const ROSTER: RosterEntry[] = [
  { name: "Wira", fullName: "Wira Budi Prasetyo", title: "Creative Director", jobRole: "DESIGNER", appRole: "ADMIN", email: "wira.budi@clogent.co.id" },
  { name: "Irsyad", fullName: "Irsyad Ahnaf Fauzian", title: "Senior Graphic Design Staff", jobRole: "DESIGNER", appRole: "CREATIVE", aliases: ["Irshyad"] },
  { name: "Fadli", fullName: "Muhamad Fadli", title: "Junior Graphic Design Staff", jobRole: "DESIGNER", appRole: "CREATIVE" },
  { name: "Emilia", fullName: "Emilia Putri Salsa", title: "Packaging Designer Staff", jobRole: "DESIGNER", appRole: "CREATIVE" },
  { name: "Dimas Pandu", fullName: "Dimas Pandu Wicaksono", title: "Video Editor Staff", jobRole: "DESIGNER", appRole: "CREATIVE" },
  { name: "Idzni", fullName: "Idzni Adzhani", title: "Social Media Manager", jobRole: "SOCIAL_MEDIA", appRole: "LEAD" },
  { name: "Fafa", fullName: "Fahfil Fauzah", title: "Social Media Specialist", jobRole: "SOCIAL_MEDIA", appRole: "REQUESTER", aliases: ["Fafa & Yoel"] },
  { name: "Syahda", fullName: "Syahda Niswah", title: "Social Media Specialist", jobRole: "SOCIAL_MEDIA", appRole: "REQUESTER" },
  { name: "Rifqy", fullName: "Rifqy", jobRole: "SOCIAL_MEDIA", appRole: "REQUESTER", aliases: ["Rifky"] },
  { name: "Robertino", fullName: "Robertino", title: "Affiliate team", jobRole: "OTHER", appRole: "REQUESTER", aliases: ["Rio"] },
  { name: "Daus", fullName: "Daus", jobRole: "DESIGNER", appRole: "CREATIVE", active: false },
  { name: "Yosi", fullName: "Yosiananda Kurnia Perdana", title: "Paid Ads Specialist", jobRole: "OTHER", appRole: "REQUESTER" },
  { name: "Rahmat", fullName: "Syavia Rahmat", title: "Ecommerce Manager", jobRole: "OTHER", appRole: "REQUESTER" },
];

export const SOCIAL_FIELDS: FieldSchema = [
  { key: "platform", label: "Platform", type: "select", options: ["TikTok", "Instagram"], required: true },
  { key: "contentType", label: "Content type", type: "select", options: ["Campaign", "Daily", "Story", "Urgent"], required: true },
  { key: "shooting", label: "Shooting", type: "checkbox" },
  { key: "editing", label: "Editing", type: "checkbox" },
  { key: "upload", label: "Upload", type: "checkbox" },
  { key: "publishedUrl", label: "Published link", type: "url" },
];

/**
 * Idempotent. Pass a client scoped to the target workspace. Rows are only written when missing (find-or-create),
 * so later admin edits (email, appRole, active, ...) are never overwritten by a re-run.
 */
export async function seed(db: PrismaClient): Promise<void> {
  // Names are unique per workspace, so find-or-create by name (the client decides the workspace).
  for (const name of ["Clogent", "Bubble Wash"])
    if (!(await db.brand.findFirst({ where: { name } }))) await db.brand.create({ data: { name } });
  for (const name of ["Creative", "Digital Ads", "Social Media", "Ecommerce", "Brand"])
    if (!(await db.division.findFirst({ where: { name } }))) await db.division.create({ data: { name } });
  const types: { name: string; fieldSchema: object[] }[] = [
    { name: "General Design", fieldSchema: [] },
    // Video/motion edit work logged by the video editor (imported from the "Dimas Tracker" tab).
    { name: "Motion Support", fieldSchema: [] },
    { name: "Social Media", fieldSchema: SOCIAL_FIELDS as object[] },
  ];
  for (const t of types)
    if (!(await db.requestType.findFirst({ where: { name: t.name } }))) await db.requestType.create({ data: t });

  for (const u of ROSTER) {
    // email is null for everyone but Wira, so identify roster rows by short name.
    const existing = await db.user.findFirst({ where: { name: u.name }, select: { id: true } });
    if (existing) continue;
    await db.user.create({
      data: {
        name: u.name,
        fullName: u.fullName,
        title: u.title,
        jobRole: u.jobRole,
        appRole: u.appRole,
        aliases: u.aliases ?? [],
        active: u.active ?? true,
        email: u.email ?? null,
      },
    });
  }
}
