"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser } from "@/lib/session";
import { withUser } from "@/lib/actionUser";
import { AdminError, createBrand, createDivision, renameBrand, renameDivision, upsertRequestType } from "@/lib/admin";
import { adminResult, adminUnauth, type AdminFormState } from "@/lib/adminForm";

const s = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const done = (r: NonNullable<AdminFormState>) => {
  if (r.ok) revalidatePath("/admin/lists");
  return r;
};

export async function saveBrand(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        const id = s(fd, "id");
        if (id) await renameBrand(db, actor, id, s(fd, "name"));
        else await createBrand(db, actor, s(fd, "name"));
        return id ? "Brand renamed." : "Brand added.";
      }),
    );
  }, () => adminUnauth(fd));
}

export async function saveDivision(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        const id = s(fd, "id");
        if (id) await renameDivision(db, actor, id, s(fd, "name"));
        else await createDivision(db, actor, s(fd, "name"));
        return id ? "Division renamed." : "Division added.";
      }),
    );
  }, () => adminUnauth(fd));
}

export async function saveRequestType(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        let schema: unknown;
        try {
          schema = JSON.parse(s(fd, "fieldSchema").trim() || "[]");
        } catch (e) {
          throw new AdminError("VALIDATION", `Field schema is not valid JSON: ${e instanceof Error ? e.message : "parse error"}`);
        }
        const id = s(fd, "id");
        await upsertRequestType(db, actor, { id: id || undefined, name: s(fd, "name"), fieldSchema: schema, active: fd.get("active") !== null });
        return id ? "Request type saved." : "Request type added.";
      }),
    );
  }, () => adminUnauth(fd));
}
