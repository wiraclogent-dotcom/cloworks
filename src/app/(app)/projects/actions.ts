"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { withUser, UNAUTH_MESSAGE, unauthResult } from "@/lib/actionUser";
import {
  ProjectError, createProjectWith, projectValuesFromForm, submitProjectWith, updateProjectWith,
  type ProjectErrorCode, type ProjectFormState, type ProjectInput,
} from "@/lib/projects";

export type ProjectActionResult<T = object> = ({ ok: true } & T) | { ok: false; code: ProjectErrorCode | "UNAUTHENTICATED"; message: string; fieldErrors?: Record<string, string> };

function failure(e: unknown): { ok: false; code: ProjectErrorCode; message: string; fieldErrors?: Record<string, string> } {
  if (e instanceof ProjectError) return { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors };
  throw e;
}

/** Result-object wrappers (Next redacts thrown errors in production). Both require `project.manage`. */
export async function createProject(input: ProjectInput): Promise<ProjectActionResult<{ id: string }>> {
  return withUser<ProjectActionResult<{ id: string }>, ProjectActionResult<{ id: string }>>(requireUser, async (user) => {
    try {
      const r = await createProjectWith(prisma, user, input);
      revalidatePath("/projects");
      return { ok: true, ...r };
    } catch (e) {
      return failure(e);
    }
  }, unauthResult);
}

export async function updateProject(id: string, patch: Partial<ProjectInput>): Promise<ProjectActionResult> {
  return withUser<ProjectActionResult, ProjectActionResult>(requireUser, async (user) => {
    try {
      await updateProjectWith(prisma, user, id, patch);
      revalidatePath("/projects");
      return { ok: true };
    } catch (e) {
      return failure(e);
    }
  }, unauthResult);
}

export type { ProjectFormState } from "@/lib/projects";

/** Form-facing wrapper for useActionState; bind the project id first when editing. */
export async function submitProject(id: string | null, _prev: ProjectFormState, fd: FormData): Promise<ProjectFormState> {
  return withUser<ProjectFormState, ProjectFormState>(requireUser, async (user) => {
    const r = await submitProjectWith(prisma, user, fd, id ?? undefined);
    if (r.ok) {
      revalidatePath("/projects");
      redirect("/projects");
    }
    return r;
  }, () => ({ ok: false, code: "UNAUTHENTICATED", message: UNAUTH_MESSAGE, values: projectValuesFromForm(fd), nonce: crypto.randomUUID() }));
}
