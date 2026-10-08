import { z } from "zod";
import type { AppRole, PrismaClient } from "@prisma/client";
import { can } from "./permissions";
import { isHttpUrl, parseFieldSchema, validateFields } from "./fieldSchema";

export type CreateRequestInput = {
  title: string;
  briefUrl?: string;
  notes?: string;
  brandId: string;
  divisionId: string;
  /** Optional: omitted means the default type "General Design" (the new-request form no longer asks). */
  typeId?: string;
  /** Date-only `YYYY-MM-DD` (Jakarta calendar date) or null. */
  deadline: string | null;
  fields?: Record<string, unknown>;
  /** The task also needs motion/video work. Default false. */
  needsMotion?: boolean;
};

export const DEFAULT_TYPE_NAME = "General Design";

export class CreateRequestError extends Error {
  constructor(
    public code: "FORBIDDEN" | "VALIDATION",
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "CreateRequestError";
  }
}

const JAKARTA_OFFSET_MS = 7 * 3600 * 1000;

/** Jakarta calendar date (YYYY-MM-DD) of an instant. */
export function jakartaDate(d: Date): string {
  return new Date(d.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isHttpUrl(v), "Must be an http(s) link");

const inputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be at most 200 characters"),
  briefUrl: optionalUrl,
  notes: z
    .string()
    .trim()
    .max(5000, "Notes must be at most 5000 characters")
    .optional()
    .transform((v) => (v ? v : undefined)),
  brandId: z.string().min(1, "Brand is required"),
  divisionId: z.string().min(1, "Division is required"),
  typeId: z.string().min(1, "Request type is required").optional(),
  deadline: z.string().nullable().refine((v) => v === null || isRealDate(v), "Deadline must be a real date (YYYY-MM-DD)"),
  fields: z.record(z.string(), z.unknown()).default({}),
  needsMotion: z.boolean({ error: "Needs motion must be yes or no" }).default(false),
});

function fail(fieldErrors: Record<string, string>): never {
  throw new CreateRequestError("VALIDATION", Object.values(fieldErrors)[0] ?? "Invalid request", fieldErrors);
}

export async function createRequestWith(
  db: PrismaClient,
  user: { id: string; appRole: AppRole },
  input: CreateRequestInput,
  now = new Date(),
): Promise<{ id: string }> {
  if (!can(user.appRole, "request.create")) throw new CreateRequestError("FORBIDDEN", "You are not allowed to create requests");

  // Collect every independent error in one pass (field-keyed) so the form can show them together.
  const errs: Record<string, string> = {};
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) for (const i of parsed.error.issues) errs[i.path.join(".") || "form"] ??= i.message;
  const raw = parsed.success ? parsed.data : null;

  const deadline = raw ? raw.deadline : typeof input.deadline === "string" && isRealDate(input.deadline) ? input.deadline : null;
  if (deadline !== null && !errs.deadline && deadline < jakartaDate(now)) errs.deadline = "Deadline cannot be in the past";

  const idOf = (k: "brandId" | "divisionId" | "typeId") => (typeof input[k] === "string" && input[k] ? input[k] : null);
  const [brandId, divisionId, typeId] = [idOf("brandId"), idOf("divisionId"), idOf("typeId")];
  const useDefault = input.typeId === undefined;
  const [brand, division, type] = await Promise.all([
    brandId ? db.brand.findUnique({ where: { id: brandId }, select: { id: true } }) : null,
    divisionId ? db.division.findUnique({ where: { id: divisionId }, select: { id: true } }) : null,
    useDefault ? db.requestType.findUnique({ where: { name: DEFAULT_TYPE_NAME } }) : typeId ? db.requestType.findUnique({ where: { id: typeId } }) : null,
  ]);
  if (brandId && !brand) errs.brandId ??= "Unknown brand";
  if (divisionId && !division) errs.divisionId ??= "Unknown division";
  if (useDefault && (!type || !type.active)) errs.form ??= `The default request type '${DEFAULT_TYPE_NAME}' is missing`;
  else if (!useDefault && typeId && (!type || !type.active)) errs.typeId ??= "Unknown or inactive request type";

  let fields: Record<string, unknown> = {};
  const rawFields = input.fields ?? {};
  if (type && type.active && typeof rawFields === "object" && rawFields !== null) {
    const fr = validateFields(parseFieldSchema(type.fieldSchema), rawFields) // raw input: zod drops "__proto__" keys silently;
    if (fr.ok) fields = fr.value;
    else for (const [k, m] of Object.entries(fr.errors)) errs[`fields.${k}`] ??= m;
  }
  if (Object.keys(errs).length || !raw || !type) return fail(errs);
  const v = raw;

  return db.$transaction(async (tx) => {
    const req = await tx.request.create({
      data: {
        title: v.title,
        briefUrl: v.briefUrl,
        notes: v.notes,
        brandId: v.brandId,
        divisionId: v.divisionId,
        typeId: type.id,
        requesterId: user.id,
        assigneeId: null,
        requestedAt: now,
        deadline: v.deadline ? new Date(`${v.deadline}T00:00:00+07:00`) : null,
        status: "REQUESTED",
        outputCount: 1,
        includeKpi: true,
        needsMotion: v.needsMotion,
        fields: fields as object,
      },
      select: { id: true },
    });
    await tx.statusEvent.create({ data: { requestId: req.id, from: null, to: "REQUESTED", actorId: user.id, at: now } });
    return { id: req.id };
  });
}
