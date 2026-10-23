"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser } from "@/lib/session";
import { withUser } from "@/lib/actionUser";
import { AdminError, createBrand, createDivision, renameBrand, renameDivision, updateDivisionCalendar, upsertRequestType } from "@/lib/admin";
import { adminResult, adminUnauth, type AdminFormState } from "@/lib/adminForm";

const s = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const done = (r: NonNullable<AdminFormState>) => {
  // Settings › Marketing calendar lists the same divisions.
  if (r.ok) { revalidatePath("/admin/lists"); revalidatePath("/admin/calendar"); }
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

/** Marketing Calendar settings of a division (colour, calendar switch, order, leads). */
export async function saveDivisionCalendar(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        const raw = s(fd, "sortOrder").trim();
        await updateDivisionCalendar(db, actor, s(fd, "id"), {
          color: s(fd, "color"),
          onMarketingCalendar: fd.get("onMarketingCalendar") === "on",
          sortOrder: raw === "" ? Number.NaN : Number(raw),
          leadIds: fd.getAll("leadIds").filter((v): v is string => typeof v === "string" && v !== ""),
        });
        revalidatePath("/marketing");
        return "Division calendar settings saved.";
      }),
    );
  }, () => adminUnauth(fd));
}

export async function saveRequestType(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (actor) => {
    const db = dbFor(actor);
    return done(
      await adminResult(fd, async () => {
        // Never default to an empty list: a missing or half-edited field list would wipe the type's fields.
        if (fd.get("fieldSchemaInvalid") !== null) throw new AdminError("VALIDATION", "Fix the fields marked below first.");
        const raw = s(fd, "fieldSchema").trim();
        if (!raw) throw new AdminError("VALIDATION", "The field list is missing. Reload the page and try again.");
        let schema: unknown;
        try {
          schema = JSON.parse(raw);
        } catch (e) {
          throw new AdminError("VALIDATION", `Field schema is not valid JSON: ${e instanceof Error ? e.message : "parse error"}`);
        }
        const id = s(fd, "id");
        // No `active`: Archive and Restore manage it, so saving keeps the type's state.
        await upsertRequestType(db, actor, { id: id || undefined, name: s(fd, "name"), fieldSchema: schema });
        return id ? "Request type saved." : "Request type added.";
      }),
    );
  }, () => adminUnauth(fd));
}
