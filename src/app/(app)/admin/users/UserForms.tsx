"use client";

import { useActionState, useState, useTransition } from "react";
import { AdminForm, ConfirmAction, Labeled, control, selectControl } from "@/components/admin/AdminForm";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { enumLabel } from "@/lib/adminChips";
import { personLabel } from "@/lib/personLabel";
import type { MergeFormState } from "@/lib/adminForm";
import type { MergeCounts, MergePreview } from "@/lib/mergeUsers";
import { addPerson, mergePerson, previewMerge, saveLoginEmail, savePassword, saveUser, setUserActive } from "./actions";

const APP_ROLES = ["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const;
const JOB_ROLES = ["DESIGNER", "SOCIAL_MEDIA", "OTHER"] as const;
const label = enumLabel;

export type UserRowData = {
  id: string; name: string; fullName: string; title: string | null; appRole: string; jobRole: string;
  aliases: string[]; email: string | null; active: boolean; hasPassword: boolean;
};

export function EditUserForm({ u }: { u: UserRowData }) {
  return (
    <AdminForm action={saveUser} prefix={`edit-${u.id}`} submitLabel="Save changes" submitAriaLabel={`Save changes for ${u.name}`} hidden={{ userId: u.id }}>
      {({ v, idFor }) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled id={idFor("fullName")} label="Full name">
            <input id={idFor("fullName")} name="fullName" className={control} defaultValue={v("fullName", u.fullName)} />
          </Labeled>
          <Labeled id={idFor("title")} label="Title">
            <input id={idFor("title")} name="title" className={control} defaultValue={v("title", u.title ?? "")} />
          </Labeled>
          <Labeled id={idFor("appRole")} label="App role">
            <select id={idFor("appRole")} name="appRole" className={selectControl} defaultValue={v("appRole", u.appRole)}>
              {APP_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </Labeled>
          <Labeled id={idFor("jobRole")} label="Job role">
            <select id={idFor("jobRole")} name="jobRole" className={selectControl} defaultValue={v("jobRole", u.jobRole)}>
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
    <AdminForm action={saveLoginEmail} prefix={`email-${u.id}`} submitLabel="Save login email" submitAriaLabel={`Save login email for ${u.name}`} submitVariant="secondary" hidden={{ userId: u.id }}>
      {({ v, idFor, aria }) => (
        <Labeled id={idFor("email")} label="Login email (leave empty to remove access)">
          <input id={idFor("email")} name="email" type="text" inputMode="email" autoComplete="off" className={control} defaultValue={v("email", u.email ?? "")} {...aria()} />
        </Labeled>
      )}
    </AdminForm>
  );
}

/** Admin sets or resets the sign-in password; it is never echoed back after an error. */
export function PasswordForm({ u }: { u: UserRowData }) {
  if (!u.email) return <p className="text-xs text-foreground-secondary">Set a login email first, then a password.</p>;
  return (
    <AdminForm action={savePassword} prefix={`password-${u.id}`} submitLabel={u.hasPassword ? "Reset password" : "Set password"} submitAriaLabel={`Set password for ${u.name}`} submitVariant="secondary" hidden={{ userId: u.id }}>
      {({ idFor, aria }) => (
        <Labeled id={idFor("password")} label={u.hasPassword ? "New password (signs them out everywhere)" : "Password (at least 10 characters)"}>
          <PasswordInput id={idFor("password")} name="password" autoComplete="new-password" minLength={10} maxLength={200} required className={control} {...aria()} />
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
        triggerAriaLabel={`Deactivate ${u.name}`}
        question={`Deactivate ${u.name}? They lose access on their next request; their history is kept.`}
        confirmLabel={`Yes, deactivate ${u.name}`}
      />
    );
  return (
    <AdminForm action={setUserActive} prefix={`active-${u.id}`} submitLabel="Reactivate" submitAriaLabel={`Reactivate ${u.name}`} submitVariant="secondary" hidden={{ userId: u.id, active: "true" }}>
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
            <select id={idFor("appRole")} name="appRole" className={selectControl} defaultValue={v("appRole", "REQUESTER")}>
              {APP_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </Labeled>
          <Labeled id={idFor("jobRole")} label="Job role">
            <select id={idFor("jobRole")} name="jobRole" className={selectControl} defaultValue={v("jobRole", "OTHER")}>
              {JOB_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </Labeled>
          <div className="sm:col-span-2">
            <Labeled id={idFor("aliases")} label="Aliases (comma separated)">
              <input id={idFor("aliases")} name="aliases" className={control} defaultValue={v("aliases")} />
            </Labeled>
          </div>
          <Labeled id={idFor("email")} label="Login email (for a password)">
            <input id={idFor("email")} name="email" type="email" autoComplete="off" className={control} defaultValue={v("email")} {...aria()} />
          </Labeled>
          <Labeled id={idFor("password")} label="Temporary password">
            <PasswordInput id={idFor("password")} name="password" autoComplete="new-password" maxLength={200} className={control} {...aria()} />
          </Labeled>
        </div>
      )}
    </AdminForm>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Non-zero counts as "3 requests, 2 comments". Chat read markers and notifications are left out as noise. */
function countList(c: MergeCounts): string[] {
  const rows: [number, string, string][] = [
    [c.requested + c.assigned, "request", "requests"],
    [c.statusEvents, "status change", "status changes"],
    [c.deadlineEvents, "deadline change", "deadline changes"],
    [c.comments, "comment", "comments"],
    [c.attachments, "attachment", "attachments"],
    [c.kpiTargets, "KPI target", "KPI targets"],
    [c.ownedProjects, "project", "projects"],
    [c.projectTasks, "project task", "project tasks"],
    [c.libraryItems, "library item", "library items"],
    [c.invites, "invite", "invites"],
  ];
  return rows.filter(([n]) => n > 0).map(([n, one, many]) => plural(n, one, many));
}

export function mergeSummary(p: MergePreview): string {
  const items = [...(p.movesLogin ? ["their login"] : []), ...countList(p.counts)];
  const parts = [`${p.from.name} will be removed.`];
  if (items.length) {
    const list = items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0];
    const one = items.length === 1 && (items[0] === "their login" || items[0].startsWith("1 "));
    parts.push(`${list[0].toUpperCase()}${list.slice(1)} ${one ? "moves" : "move"} to ${p.into.name}.`);
  }
  if (p.movesLogin && !p.into.active) parts.push(`${p.into.name} becomes active.`);
  if (p.movesLogin && (p.from.appRole !== p.into.appRole || p.from.jobRole !== p.into.jobRole)) {
    const roles = (r: { appRole: string; jobRole: string }) => `${label(r.appRole)} · ${label(r.jobRole)}`;
    parts.push(`${p.into.name} keeps ${roles(p.into)} (${p.from.name} was ${roles(p.from)}).`);
  }
  return parts.join(" ");
}

/** Two steps: pick the person to keep and review what moves, then confirm. The person being edited is the one removed. */
export function MergeForm({ u, others }: { u: UserRowData; others: { id: string; name: string; fullName: string }[] }) {
  const [state, run, pending] = useActionState<MergeFormState, FormData>(previewMerge, null);
  const [, startTransition] = useTransition();
  const [intoId, setIntoId] = useState(""); // controlled: React resets uncontrolled fields after a form action
  const id = `merge-${u.id}`;
  return (
    <div className="space-y-3">
      {/* onSubmit, not action: React resets a form after a function action, which would blank the chosen person. */}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => run(fd)); }}>
        <input type="hidden" name="fromId" value={u.id} />
        <Labeled id={`${id}-into`} label="Merge into…">
          <select id={`${id}-into`} name="intoId" required className={selectControl} value={intoId} onChange={(e) => setIntoId(e.target.value)}>
            <option value="" disabled>Choose a person</option>
            {others.map((o) => <option key={o.id} value={o.id}>{personLabel(o)}</option>)}
          </select>
        </Labeled>
        <Button type="submit" variant="secondary" loading={pending} aria-label={`Review merge for ${u.name}`}>{pending ? "Checking…" : "Review merge"}</Button>
      </form>
      {state && !state.ok && <Alert tone="danger">Error: {state.error}</Alert>}
      {state?.ok && state.preview.into.id === intoId && (
        <ConfirmAction action={mergePerson} prefix={`${id}-confirm`} hidden={{ fromId: u.id, intoId: state.preview.into.id }}
          triggerLabel="Merge" triggerAriaLabel={`Merge ${u.name} into ${state.preview.into.name}`}
          question={mergeSummary(state.preview)} confirmLabel="Merge" />
      )}
    </div>
  );
}
