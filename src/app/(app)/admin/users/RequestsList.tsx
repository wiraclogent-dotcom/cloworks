"use client";

import { AdminForm, ConfirmAction, Labeled, selectControl } from "@/components/admin/AdminForm";
import { Chip } from "@/components/ui/Chip";
import { enumLabel } from "@/lib/adminChips";
import { approveRequest, rejectRequest, undoRejectRequest } from "./actions";

const APP_ROLES = ["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const;
const JOB_ROLES = ["DESIGNER", "SOCIAL_MEDIA", "OTHER"] as const;

export type RequestRow = { applicantId: string; name: string; email: string; source: "LINK" | "DOMAIN"; requestedAt: string };

const SOURCE = { LINK: "Join link", DOMAIN: "Company email" } as const;

function Who({ r }: { r: RequestRow }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-foreground">{r.name}</p>
      <p className="text-sm break-all text-foreground-secondary">{r.email}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
        <Chip>{SOURCE[r.source]}</Chip>
        <span>{r.requestedAt}</span>
      </p>
    </div>
  );
}

export function RequestsList({ pending, rejected }: { pending: RequestRow[]; rejected: RequestRow[] }) {
  return (
    <div className="space-y-5">
      {pending.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-foreground-secondary">No join requests waiting.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((r) => (
            <li key={r.applicantId} aria-label={r.name} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <Who r={r} />
                <div className="flex flex-wrap items-end gap-3">
                  <AdminForm action={approveRequest} prefix={`approve-${r.applicantId}`} submitLabel="Approve" submitAriaLabel={`Approve ${r.name}`}
                    hidden={{ applicantId: r.applicantId }} className="space-y-2">
                    {({ v, idFor }) => (
                      <div className="flex flex-wrap items-end gap-3">
                        <Labeled id={idFor("appRole")} label="App role">
                          <select id={idFor("appRole")} name="appRole" className={selectControl} defaultValue={v("appRole", "REQUESTER")}>
                            {APP_ROLES.map((x) => <option key={x} value={x}>{enumLabel(x)}</option>)}
                          </select>
                        </Labeled>
                        <Labeled id={idFor("jobRole")} label="Job role">
                          <select id={idFor("jobRole")} name="jobRole" className={selectControl} defaultValue={v("jobRole", "OTHER")}>
                            {JOB_ROLES.map((x) => <option key={x} value={x}>{enumLabel(x)}</option>)}
                          </select>
                        </Labeled>
                      </div>
                    )}
                  </AdminForm>
                  <ConfirmAction action={rejectRequest} prefix={`reject-${r.applicantId}`} hidden={{ applicantId: r.applicantId }}
                    triggerLabel="Reject" triggerAriaLabel={`Reject ${r.name}`}
                    question={`Reject ${r.name}? They are told nothing; you can undo this later.`} confirmLabel={`Yes, reject ${r.name}`} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <details className="group rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Rejected ({rejected.length})</summary>
          <ul className="mt-3 space-y-3">
            {rejected.map((r) => (
              <li key={r.applicantId} aria-label={r.name} className="flex flex-wrap items-center justify-between gap-3">
                <Who r={r} />
                <AdminForm action={undoRejectRequest} prefix={`undo-${r.applicantId}`} submitLabel="Undo" submitAriaLabel={`Undo reject for ${r.name}`}
                  submitVariant="secondary" hidden={{ applicantId: r.applicantId }}>
                  {() => null}
                </AdminForm>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
