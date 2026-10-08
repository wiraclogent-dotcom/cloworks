"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AdminError, createBrand, createDivision, renameBrand, renameDivision, upsertRequestType } from "@/lib/admin";
import { adminResult, type AdminFormState } from "@/lib/adminForm";

const s = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const done = (r: NonNullable<AdminFormState>) => {
  if (r.ok) revalidatePath("/admin/lists");
  return r;
};

export async function saveBrand(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actor = await requireUser();
  return done(
    await adminResult(fd, async () => {
      const id = s(fd, "id");
      if (id) await renameBrand(prisma, actor, id, s(fd, "name"));
      else await createBrand(prisma, actor, s(fd, "name"));
      return id ? "Brand renamed." : "Brand added.";
    }),
  );
}

export async function saveDivision(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actor = await requireUser();
  return done(
    await adminResult(fd, async () => {
      const id = s(fd, "id");
      if (id) await renameDivision(prisma, actor, id, s(fd, "name"));
      else await createDivision(prisma, actor, s(fd, "name"));
      return id ? "Division renamed." : "Division added.";
    }),
  );
}

export async function saveRequestType(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actor = await requireUser();
  return done(
    await adminResult(fd, async () => {
      let schema: unknown;
      try {
        schema = JSON.parse(s(fd, "fieldSchema").trim() || "[]");
      } catch (e) {
        throw new AdminError("VALIDATION", `Field schema is not valid JSON: ${e instanceof Error ? e.message : "parse error"}`);
      }
      const id = s(fd, "id");
      await upsertRequestType(prisma, actor, { id: id || undefined, name: s(fd, "name"), fieldSchema: schema, active: fd.get("active") !== null });
      return id ? "Request type saved." : "Request type added.";
    }),
  );
}
