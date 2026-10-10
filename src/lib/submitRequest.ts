import type { AppRole, PrismaClient } from "@prisma/client";
import { CreateRequestError, DEFAULT_TYPE_NAME, createRequestWith, type CreateRequestInput } from "./createRequest";

/** Step 1 of the form, "What do you need?". Each kind files the request as a type plus the motion flag. */
export const WORK_KINDS = ["static", "motion", "video"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];
export const WORK_KIND_PLAN: Record<WorkKind, { typeName: string; needsMotion: boolean }> = {
  static: { typeName: DEFAULT_TYPE_NAME, needsMotion: false },
  motion: { typeName: DEFAULT_TYPE_NAME, needsMotion: true },
  video: { typeName: "Motion Support", needsMotion: true },
};
const PICK_KIND = "Pick what you need";

/** Plain, serialisable echo of what the user typed, so the form can re-populate after an error. */
export type SubmittedValues = {
  title: string;
  briefUrl: string;
  notes: string;
  brandId: string;
  divisionId: string;
  deadline: string;
  /** The "What do you need?" cards; "" when nothing (or something unknown) was picked. */
  workKind: WorkKind | "";
};

export type SubmitState = {
  ok: false;
  code?: string;
  message: string;
  fieldErrors?: Record<string, string>;
  values: SubmittedValues;
  nonce: string;
} | null;

export function extractValues(fd: FormData): SubmittedValues {
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    title: str("title"), briefUrl: str("briefUrl"), notes: str("notes"), brandId: str("brandId"),
    divisionId: str("divisionId"), deadline: str("deadline"),
    workKind: WORK_KINDS.find((k) => k === str("workKind")) ?? "",
  };
}

/** Testable core of the form action: returns the new id, or an error state that echoes the submitted values. */
export async function submitRequestWith(
  db: PrismaClient,
  user: { id: string; appRole: AppRole },
  fd: FormData,
): Promise<{ ok: true; id: string } | NonNullable<SubmitState>> {
  const values = extractValues(fd);
  const plan = values.workKind ? WORK_KIND_PLAN[values.workKind] : null;
  // Video work is filed under its own type; the others use the default type (typeId omitted).
  const type = plan && plan.typeName !== DEFAULT_TYPE_NAME ? await db.requestType.findFirst({ where: { name: plan.typeName, active: true }, select: { id: true } }) : null;
  const fail = (fieldErrors: Record<string, string>, message: string, code = "VALIDATION") =>
    ({ ok: false as const, code, message, fieldErrors, values, nonce: crypto.randomUUID() });
  if (plan && plan.typeName !== DEFAULT_TYPE_NAME && !type) return fail({ form: `The request type '${plan.typeName}' is missing` }, `The request type '${plan.typeName}' is missing`);
  const input: CreateRequestInput = {
    title: values.title,
    briefUrl: values.briefUrl,
    notes: values.notes,
    brandId: values.brandId,
    divisionId: values.divisionId,
    deadline: values.deadline || null,
    needsMotion: plan?.needsMotion ?? false,
    // No kind picked: an empty typeId can never resolve, so nothing is created but the other fields are still checked.
    ...(plan ? (type ? { typeId: type.id } : {}) : { typeId: "" }),
  };
  try {
    const { id } = await createRequestWith(db, user, input);
    return { ok: true, id };
  } catch (e) {
    if (!(e instanceof CreateRequestError)) throw e;
    if (plan) return fail(e.fieldErrors ?? {}, e.message, e.code);
    const rest = Object.fromEntries(Object.entries(e.fieldErrors ?? {}).filter(([k]) => k !== "typeId"));
    return fail({ workKind: PICK_KIND, ...rest }, PICK_KIND);
  }
}
