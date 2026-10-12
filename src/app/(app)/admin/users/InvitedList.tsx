"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminFormState } from "@/lib/adminForm";
import { AdminForm, ConfirmAction, Labeled, control, selectControl, type FormCtx } from "@/components/admin/AdminForm";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { tableClass } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import type { LinkablePerson } from "@/lib/linkPerson";
import { enumLabel } from "@/lib/adminChips";
import { inviteMember, resendMemberInvite, revokeMemberInvite } from "./actions";

const APP_ROLES = ["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const;
const JOB_ROLES = ["DESIGNER", "SOCIAL_MEDIA", "OTHER"] as const;

export type InviteRow = { id: string; email: string; appRole: string; jobRole: string; invitedBy: string; linkedName: string | null; expiresOn: string; expired: boolean };

function ResendButton({ email }: { email: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="secondary" size="sm" loading={pending} aria-label={`Resend invite to ${email}`}>Resend</Button>;
}

/** Open invites (not accepted, not revoked); an expired one stays so it can be resent. */
export function InvitedList({ invites, linkable }: { invites: InviteRow[]; linkable: LinkablePerson[] }) {
  const t = tableClass({ minWidth: "min-w-[44rem]" });
  return (
    <div className="space-y-5">
      <div className={cn(t.wrapper, "max-h-[calc(100dvh-24rem)]")}>
        <table className={t.table}>
          <caption className="sr-only">Open invites</caption>
          <thead>
            <tr>{["Email", "Roles", "Invited by", "Expires", "Manage"].map((h) => <th key={h} scope="col" className={t.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {invites.length === 0 && (
              <tr><td colSpan={5} className={cn(t.td, "text-foreground-secondary")}>No open invites.</td></tr>
            )}
            {invites.map((i) => (
              <tr key={i.id} className={cn(t.tr, "align-top")}>
                <th scope="row" className={cn(t.rowHeader, "align-top break-all")}>{i.email}
                  {i.linkedName && <p className="mt-0.5 text-xs font-normal text-foreground-secondary">for {i.linkedName}</p>}
                </th>
                <td className={cn(t.td, "align-top")}>{enumLabel(i.appRole)} · {enumLabel(i.jobRole)}</td>
                <td className={cn(t.td, "align-top")}>{i.invitedBy}</td>
                <td className={cn(t.td, "align-top")}>
                  {i.expired ? <Chip tone="cancelled">Expired</Chip> : <span>{i.expiresOn}</span>}
                  {i.expired && <p className="mt-0.5 text-xs text-foreground-secondary">{i.expiresOn}</p>}
                </td>
                <td className={cn(t.td, "align-top")}>
                  <div className="flex flex-wrap items-start gap-2">
                    <ResendForm id={i.id} email={i.email} />
                    <ConfirmAction action={revokeMemberInvite} prefix={`revoke-${i.id}`} hidden={{ inviteId: i.id }}
                      triggerLabel="Revoke" triggerAriaLabel={`Revoke invite for ${i.email}`}
                      question={`Revoke the invite for ${i.email}? Their link stops working.`} confirmLabel={`Yes, revoke ${i.email}`} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card>
        <section aria-labelledby="invite-h">
          <CardHeader><CardTitle id="invite-h">Invite someone</CardTitle></CardHeader>
          <AdminForm action={inviteMember} prefix="invite" submitLabel="Send invite">
            {({ v, idFor, aria }) => (
              <InviteFields linkable={linkable} v={v} idFor={idFor} aria={aria} />
            )}
          </AdminForm>
        </section>
      </Card>
    </div>
  );
}

function ResendForm({ id, email }: { id: string; email: string }) {
  const [state, run] = useActionState<AdminFormState, FormData>(resendMemberInvite, null);
  return (
    <form action={run} className="space-y-1">
      <input type="hidden" name="inviteId" value={id} />
      <ResendButton email={email} />
      {state && <p role={state.ok ? "status" : "alert"} className="text-[13px] font-medium text-foreground-secondary">{state.ok ? state.message : `Error: ${state.message}`}</p>}
    </form>
  );
}

/** Email, optional existing person, and roles; choosing a person fills the role selects with theirs (still editable). */
function InviteFields({ linkable, v, idFor, aria }: { linkable: LinkablePerson[]; v: FormCtx["v"]; idFor: FormCtx["idFor"]; aria: FormCtx["aria"] }) {
  const [userId, setUserId] = useState(v("userId"));
  const [appRole, setAppRole] = useState(v("appRole", "REQUESTER"));
  const [jobRole, setJobRole] = useState(v("jobRole", "OTHER"));
  const pick = (id: string) => {
    setUserId(id);
    const p = linkable.find((x) => x.id === id);
    if (p) {
      setAppRole(p.appRole);
      setJobRole(p.jobRole);
    }
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Labeled id={idFor("email")} label="Email">
        <input id={idFor("email")} name="email" type="email" autoComplete="off" required className={control} defaultValue={v("email")} {...aria()} />
      </Labeled>
      <Labeled id={idFor("userId")} label="Existing person (optional)">
        <select id={idFor("userId")} name="userId" className={selectControl} value={userId} onChange={(e) => pick(e.target.value)}>
          <option value="">New person</option>
          {linkable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Labeled>
      <Labeled id={idFor("appRole")} label="App role">
        <select id={idFor("appRole")} name="appRole" className={selectControl} value={appRole} onChange={(e) => setAppRole(e.target.value)}>
          {APP_ROLES.map((r) => <option key={r} value={r}>{enumLabel(r)}</option>)}
        </select>
      </Labeled>
      <Labeled id={idFor("jobRole")} label="Job role">
        <select id={idFor("jobRole")} name="jobRole" className={selectControl} value={jobRole} onChange={(e) => setJobRole(e.target.value)}>
          {JOB_ROLES.map((r) => <option key={r} value={r}>{enumLabel(r)}</option>)}
        </select>
      </Labeled>
    </div>
  );
}
