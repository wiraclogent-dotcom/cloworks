import type { AppRole, PrismaClient } from "@prisma/client";
import { CreateRequestError, createRequestWith, type CreateRequestInput } from "./createRequest";

/** Plain, serialisable echo of what the user typed, so the form can re-populate after an error. */
export type SubmittedValues = {
  title: string;
  briefUrl: string;
  notes: string;
  brandId: string;
  divisionId: string;
  deadline: string;
  /** The "Does this task need motion?" radio: true only for "yes". */
  needsMotion: boolean;
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
    divisionId: str("divisionId"), deadline: str("deadline"), needsMotion: str("needsMotion") === "yes",
  };
}

/** Testable core of the form action: returns the new id, or an error state that echoes the submitted values. */
export async function submitRequestWith(
  db: PrismaClient,
  user: { id: string; appRole: AppRole },
  fd: FormData,
): Promise<{ ok: true; id: string } | NonNullable<SubmitState>> {
  const values = extractValues(fd);
  const input: CreateRequestInput = {
    title: values.title,
    briefUrl: values.briefUrl,
    notes: values.notes,
    brandId: values.brandId,
    divisionId: values.divisionId,
    deadline: values.deadline || null,
    needsMotion: values.needsMotion,
  };
  try {
    const { id } = await createRequestWith(db, user, input);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof CreateRequestError)
      return { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors, values, nonce: crypto.randomUUID() };
    throw e;
  }
}
