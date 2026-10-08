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
  typeId: string;
  /** Date-only `YYYY-MM-DD` (Jakarta calendar date) or null. */
  deadline: string | null;
  fields: Record<string, unknown>;
};

export type CreateRequestResult = { ok: true; id: string } | { ok: false; code: "FORBIDDEN" | "VALIDATION"; message: string; fieldErrors?: Record<string, string> };

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

function isRealDate(s: string): boolean {
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
  typeId: z.string().min(1, "Request type is required"),
  deadline: z.string().nullable().refine((v) => v === null || isRealDate(v), "Deadline must be a real date (YYYY-MM-DD)"),
  fields: z.record(z.string(), z.unknown()),
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

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const errs: Record<string, string> = {};
    for (const i of parsed.error.issues) errs[i.path.join(".") || "form"] ??= i.message;
    return fail(errs);
  }
  const v = parsed.data;
  const errs: Record<string, string> = {};

  if (v.deadline !== null && v.deadline < jakartaDate(now)) errs.deadline = "Deadline cannot be in the past";

  const [brand, division, type] = await Promise.all([
    db.brand.findUnique({ where: { id: v.brandId }, select: { id: true } }),
    db.division.findUnique({ where: { id: v.divisionId }, select: { id: true } }),
    db.requestType.findUnique({ where: { id: v.typeId } }),
  ]);
  if (!brand) errs.brandId = "Unknown brand";
  if (!division) errs.divisionId = "Unknown division";
  if (!type || !type.active) errs.typeId = "Unknown or inactive request type";

  let fields: Record<string, unknown> = {};
  if (type && type.active) {
    const fr = validateFields(parseFieldSchema(type.fieldSchema), v.fields);
    if (fr.ok) fields = fr.value;
    else for (const [k, m] of Object.entries(fr.errors)) errs[`fields.${k}`] = m;
  }
  if (Object.keys(errs).length) return fail(errs);

  return db.$transaction(async (tx) => {
    const req = await tx.request.create({
      data: {
        title: v.title,
        briefUrl: v.briefUrl,
        notes: v.notes,
        brandId: v.brandId,
        divisionId: v.divisionId,
        typeId: v.typeId,
        requesterId: user.id,
        assigneeId: null,
        requestedAt: now,
        deadline: v.deadline ? new Date(`${v.deadline}T00:00:00+07:00`) : null,
        status: "REQUESTED",
        outputCount: 1,
        includeKpi: true,
        fields: fields as object,
      },
      select: { id: true },
    });
    await tx.statusEvent.create({ data: { requestId: req.id, from: null, to: "REQUESTED", actorId: user.id, at: now } });
    return { id: req.id };
  });
}
