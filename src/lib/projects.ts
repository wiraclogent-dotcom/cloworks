import { z } from "zod";
import type { AppRole, PrismaClient, ProjectStatus } from "@prisma/client";
import { can } from "./permissions";
import { isHttpUrl } from "./fieldSchema";
import { jakartaDate } from "./createRequest";

export const PROJECT_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "DONE", "ON_HOLD"] as const satisfies readonly ProjectStatus[];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  ON_HOLD: "On hold",
};

export type ProjectInput = {
  title: string;
  subTitle?: string | null;
  brandId?: string | null;
  ownerId: string;
  status: ProjectStatus;
  /** Date-only `YYYY-MM-DD` (Jakarta calendar date). */
  startDate?: string | null;
  dueDate?: string | null;
  fileUrl?: string | null;
};

export type ProjectErrorCode = "FORBIDDEN" | "VALIDATION" | "NOT_FOUND";
export class ProjectError extends Error {
  constructor(public code: ProjectErrorCode, message: string, public fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ProjectError";
  }
}

type Actor = { id: string; appRole: AppRole };

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export const toJakartaMidnight = (d: string) => new Date(`${d}T00:00:00+07:00`);

// Optional text: undefined = not provided; null/"" = provided and empty (clears).
const optText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`).nullable().optional();

const shape = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be at most 200 characters"),
  subTitle: optText(200, "Sub title"),
  brandId: z.string().nullable().optional(),
  ownerId: z.string().min(1, "Owner is required"),
  status: z.enum(PROJECT_STATUSES, { message: "Pick a valid status" }),
  startDate: z.string().trim().nullable().optional(),
  dueDate: z.string().trim().nullable().optional(),
  fileUrl: z.string().trim().max(2048, "File link must be at most 2048 characters").nullable().optional(),
});

type Cleaned = {
  title?: string; subTitle?: string | null; brandId?: string | null; ownerId?: string; status?: ProjectStatus;
  startDate?: string | null; dueDate?: string | null; fileUrl?: string | null;
};

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v === "" ? null : v);

function throwFields(fieldErrors: Record<string, string>): never {
  throw new ProjectError("VALIDATION", Object.values(fieldErrors)[0] ?? "Invalid project", fieldErrors);
}

/** Syntax checks only (no DB). Keys absent from `raw` stay absent from the result. */
function parse(raw: Partial<ProjectInput>, partial: boolean): Cleaned {
  const schema = partial ? shape.partial() : shape;
  const r = schema.safeParse(raw);
  const errors: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
  if (!r.success) throwFields(errors);
  const data = r.data;
  const out: Cleaned = {};
  if (data.title !== undefined) out.title = data.title;
  if (data.ownerId !== undefined) out.ownerId = data.ownerId;
  if (data.status !== undefined) out.status = data.status;
  for (const k of ["subTitle", "brandId", "startDate", "dueDate", "fileUrl"] as const) {
    const v = blankToNull(data[k]);
    if (v !== undefined) out[k] = v;
  }
  for (const k of ["startDate", "dueDate"] as const)
    if (out[k] && !isRealDate(out[k]!)) errors[k] = `${k === "startDate" ? "Start" : "Due"} date must be a real date (YYYY-MM-DD)`;
  if (out.fileUrl && !isHttpUrl(out.fileUrl)) errors.fileUrl = "File link must be an http(s) link";
  if (Object.keys(errors).length) throwFields(errors);
  return out;
}

function assertManager(user: Actor) {
  if (!can(user.appRole, "project.manage")) throw new ProjectError("FORBIDDEN", "You are not allowed to manage projects.");
}

async function checkRefs(db: PrismaClient, c: Cleaned) {
  const errors: Record<string, string> = {};
  if (c.brandId) {
    if (!(await db.brand.findUnique({ where: { id: c.brandId }, select: { id: true } }))) errors.brandId = "That brand does not exist";
  }
  if (c.ownerId !== undefined) {
    const o = await db.user.findUnique({ where: { id: c.ownerId }, select: { active: true } });
    if (!o) errors.ownerId = "That owner does not exist";
    else if (!o.active) errors.ownerId = "That owner is no longer active";
  }
  if (Object.keys(errors).length) throwFields(errors);
}

function checkOrder(start: string | null | undefined, due: string | null | undefined) {
  if (start && due && due < start) throwFields({ dueDate: "Due date cannot be before the start date" });
}

export async function createProjectWith(db: PrismaClient, user: Actor, input: ProjectInput): Promise<{ id: string }> {
  assertManager(user);
  const c = parse(input, false);
  await checkRefs(db, c);
  checkOrder(c.startDate, c.dueDate);
  const p = await db.project.create({
    data: {
      title: c.title!,
      subTitle: c.subTitle ?? null,
      brandId: c.brandId ?? null,
      ownerId: c.ownerId!,
      status: c.status!,
      startDate: c.startDate ? toJakartaMidnight(c.startDate) : null,
      dueDate: c.dueDate ? toJakartaMidnight(c.dueDate) : null,
      fileUrl: c.fileUrl ?? null,
    },
    select: { id: true },
  });
  return { id: p.id };
}

export async function updateProjectWith(db: PrismaClient, user: Actor, id: string, patch: Partial<ProjectInput>): Promise<void> {
  assertManager(user);
  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) throw new ProjectError("NOT_FOUND", "Project not found.");
  const c = parse(patch, true);
  await checkRefs(db, c);
  const start = c.startDate !== undefined ? c.startDate : existing.startDate ? jakartaDate(existing.startDate) : null;
  const due = c.dueDate !== undefined ? c.dueDate : existing.dueDate ? jakartaDate(existing.dueDate) : null;
  checkOrder(start, due);
  const data: Record<string, unknown> = {};
  for (const k of ["title", "subTitle", "brandId", "ownerId", "status", "fileUrl"] as const) if (c[k] !== undefined) data[k] = c[k];
  if (c.startDate !== undefined) data.startDate = c.startDate ? toJakartaMidnight(c.startDate) : null;
  if (c.dueDate !== undefined) data.dueDate = c.dueDate ? toJakartaMidnight(c.dueDate) : null;
  if (Object.keys(data).length) await db.project.update({ where: { id }, data });
}

// ---- View helpers -------------------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "8 Oct 2026" in the Jakarta calendar. */
export function formatJakartaDate(d: Date): string {
  const [y, m, day] = jakartaDate(d).split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

export type GroupableProject = { id: string; title: string; brandName: string | null; dueDate: Date | null };
/** Groups by brand name (A-Z, "No brand" = null last); inside a group by due date asc, no due date last, then title. */
export function groupProjects<T extends GroupableProject>(rows: T[]): { brand: string | null; projects: T[] }[] {
  const map = new Map<string | null, T[]>();
  for (const r of rows) (map.get(r.brandName) ?? map.set(r.brandName, []).get(r.brandName)!).push(r);
  const cmp = (a: T, b: T) =>
    (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) || a.title.localeCompare(b.title);
  return [...map.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([brand, projects]) => ({ brand, projects: projects.sort(cmp) }));
}

// ---- Form submission (echoes typed values so the form can re-populate) ---------------------------------------

export type ProjectFormValues = {
  title: string; subTitle: string; brandId: string; ownerId: string; status: string; startDate: string; dueDate: string; fileUrl: string;
};
export type ProjectFormState = {
  ok: false; code: ProjectErrorCode; message: string; fieldErrors?: Record<string, string>; values: ProjectFormValues; nonce: string;
} | null;

export function projectValuesFromForm(fd: FormData): ProjectFormValues {
  const s = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
  return { title: s("title"), subTitle: s("subTitle"), brandId: s("brandId"), ownerId: s("ownerId"), status: s("status"), startDate: s("startDate"), dueDate: s("dueDate"), fileUrl: s("fileUrl") };
}

/** Create (no id) or full-form update (id). Expected failures come back as state; unexpected ones throw. */
export async function submitProjectWith(
  db: PrismaClient, user: Actor, fd: FormData, id?: string,
): Promise<{ ok: true; id: string } | NonNullable<ProjectFormState>> {
  const values = projectValuesFromForm(fd);
  const input = { ...values, status: values.status as ProjectStatus };
  try {
    if (id) {
      await updateProjectWith(db, user, id, input);
      return { ok: true, id };
    }
    return { ok: true, ...(await createProjectWith(db, user, input)) };
  } catch (e) {
    if (e instanceof ProjectError) return { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors, values, nonce: crypto.randomUUID() };
    throw e;
  }
}
