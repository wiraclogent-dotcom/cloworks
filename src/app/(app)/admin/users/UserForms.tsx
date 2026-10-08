"use client";

import { AdminForm, ConfirmAction, Labeled, control } from "@/components/admin/AdminForm";
import { addAllowed, addPerson, removeAllowed, saveLoginEmail, saveUser, setUserActive } from "./actions";

const APP_ROLES = ["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const;
const JOB_ROLES = ["DESIGNER", "SOCIAL_MEDIA", "OTHER"] as const;
const label = (r: string) => r.charAt(0) + r.slice(1).toLowerCase().replace("_", " ");

export type UserRowData = {
  id: string; name: string; fullName: string; title: string | null; appRole: string; jobRole: string;
  aliases: string[]; email: string | null; active: boolean;
};

export function EditUserForm({ u }: { u: UserRowData }) {
  return (
    <AdminForm action={saveUser} prefix={`edit-${u.id}`} submitLabel="Save changes" hidden={{ userId: u.id }}>
      {({ v, idFor }) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled id={idFor("fullName")} label="Full name">
            <input id={idFor("fullName")} name="fullName" className={control} defaultValue={v("fullName", u.fullName)} />
          </Labeled>
          <Labeled id={idFor("title")} label="Title">
            <input id={idFor("title")} name="title" className={control} defaultValue={v("title", u.title ?? "")} />
          </Labeled>
          <Labeled id={idFor("appRole")} label="App role">
            <select id={idFor("appRole")} name="appRole" className={control} defaultValue={v("appRole", u.appRole)}>
              {APP_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </Labeled>
          <Labeled id={idFor("jobRole")} label="Job role">
            <select id={idFor("jobRole")} name="jobRole" className={control} defaultValue={v("jobRole", u.jobRole)}>
              {JOB_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </Labeled>
          <div className="sm:col-span-2">
            <Labeled id={idFor("aliases")} label="Aliases (comma separated)">
              <input id={idFor("aliases")} name="aliases" className={control} defaultValue={v("aliases", u.aliases.join(", "))} />
            </Labeled>
          </div>
        </div>
      )}
    </AdminForm>
  );
}

export function LoginEmailForm({ u }: { u: UserRowData }) {
  return (
    <AdminForm action={saveLoginEmail} prefix={`email-${u.id}`} submitLabel="Save login email" hidden={{ userId: u.id }}>
      {({ v, idFor, aria }) => (
        <Labeled id={idFor("email")} label="Login email (leave empty to remove access)">
          <input id={idFor("email")} name="email" type="text" inputMode="email" autoComplete="off" className={control} defaultValue={v("email", u.email ?? "")} {...aria()} />
        </Labeled>
      )}
    </AdminForm>
  );
}

export function ActiveToggle({ u }: { u: UserRowData }) {
  if (u.active)
    return (
      <ConfirmAction
        action={setUserActive}
        prefix={`active-${u.id}`}
        hidden={{ userId: u.id, active: "false" }}
        triggerLabel="Deactivate"
        question={`Deactivate ${u.name}? They lose access on their next request; their history is kept.`}
        confirmLabel={`Yes, deactivate ${u.name}`}
      />
    );
  return (
    <AdminForm action={setUserActive} prefix={`active-${u.id}`} submitLabel="Reactivate" hidden={{ userId: u.id, active: "true" }}>
      {() => null}
    </AdminForm>
  );
}

export function AddPersonForm() {
  return (
    <AdminForm action={addPerson} prefix="add-person" submitLabel="Add person">
      {({ v, idFor, aria }) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled id={idFor("name")} label="Name (as used in the team)">
            <input id={idFor("name")} name="name" required className={control} defaultValue={v("name")} {...aria()} />
          </Labeled>
          <Labeled id={idFor("fullName")} label="Full name">
            <input id={idFor("fullName")} name="fullName" className={control} defaultValue={v("fullName")} />
          </Labeled>
          <Labeled id={idFor("title")} label="Title">
            <input id={idFor("title")} name="title" className={control} defaultValue={v("title")} />
          </Labeled>
          <Labeled id={idFor("department")} label="Department">
            <input id={idFor("department")} name="department" className={control} defaultValue={v("department")} />
          </Labeled>
          <Labeled id={idFor("appRole")} label="App role">
            <select id={idFor("appRole")} name="appRole" className={control} defaultValue={v("appRole", "REQUESTER")}>
              {APP_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </Labeled>
          <Labeled id={idFor("jobRole")} label="Job role">
            <select id={idFor("jobRole")} name="jobRole" className={control} defaultValue={v("jobRole", "OTHER")}>
              {JOB_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </Labeled>
          <div className="sm:col-span-2">
            <Labeled id={idFor("aliases")} label="Aliases (comma separated)">
              <input id={idFor("aliases")} name="aliases" className={control} defaultValue={v("aliases")} />
            </Labeled>
          </div>
        </div>
      )}
    </AdminForm>
  );
}

export function AddAllowedForm() {
  return (
    <AdminForm action={addAllowed} prefix="add-allowed" submitLabel="Allow email" className="flex flex-wrap items-start gap-3">
      {({ v, idFor, aria }) => (
        <>
          <Labeled id={idFor("email")} label="Email address">
            <input id={idFor("email")} name="email" type="text" inputMode="email" autoComplete="off" className={control} defaultValue={v("email")} {...aria()} />
          </Labeled>
          <Labeled id={idFor("note")} label="Note (optional)">
            <input id={idFor("note")} name="note" className={control} defaultValue={v("note")} />
          </Labeled>
        </>
      )}
    </AdminForm>
  );
}

export function RemoveAllowed({ email }: { email: string }) {
  return (
    <ConfirmAction
      action={removeAllowed}
      prefix={`rm-${email}`}
      hidden={{ email }}
      triggerLabel="Remove"
      question={`Remove ${email}? Anyone signing in with it loses access on their next request.`}
      confirmLabel={`Yes, remove ${email}`}
    />
  );
}
