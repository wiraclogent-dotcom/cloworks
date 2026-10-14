"use client";

import { AdminForm, ConfirmAction } from "@/components/admin/AdminForm";
import { Card } from "@/components/shadcn/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/shadcn/collapsible";
import { Badge } from "@/components/shadcn/badge";
import { ChevronRight } from "lucide-react";
import { cn, focusRing } from "@/components/ui/cn";
import type { LinkablePerson } from "@/lib/linkPerson";
import { PersonRoleFields } from "./PersonRoleFields";
import { approveRequest, rejectRequest, undoRejectRequest } from "./actions";
import { EmptyState } from "@/components/ui/EmptyState";

export type RequestRow = { applicantId: string; name: string; email: string; source: "LINK" | "DOMAIN"; requestedAt: string };

const SOURCE = { LINK: "Join link", DOMAIN: "Company email" } as const;

function Who({ r }: { r: RequestRow }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-foreground">{r.name}</p>
      <p className="text-sm break-all text-muted-foreground">{r.email}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge>{SOURCE[r.source]}</Badge>
        <span>{r.requestedAt}</span>
      </p>
    </div>
  );
}

export function RequestsList({ pending, rejected, linkable }: { pending: RequestRow[]; rejected: RequestRow[]; linkable: LinkablePerson[] }) {
  return (
    <div className="space-y-5">
      {pending.length === 0 ? (
        <Card><EmptyState size="inline" title="No join requests waiting." className="py-0" /></Card>
      ) : (
        <ul className="space-y-3">
          {pending.map((r) => (
            <Card asChild key={r.applicantId}><li aria-label={r.name}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <Who r={r} />
                <div className="flex flex-wrap items-end gap-3">
                  <AdminForm action={approveRequest} prefix={`approve-${r.applicantId}`} submitLabel="Approve" submitAriaLabel={`Approve ${r.name}`}
                    hidden={{ applicantId: r.applicantId }} className="space-y-2">
                    {({ v, idFor }) => (
                      <div className="flex flex-wrap items-end gap-3">
                        <PersonRoleFields linkable={linkable} v={v} idFor={idFor} name="linkUserId" label="This is…" noneLabel="A new person" />
                      </div>
                    )}
                  </AdminForm>
                  <ConfirmAction action={rejectRequest} prefix={`reject-${r.applicantId}`} hidden={{ applicantId: r.applicantId }}
                    triggerLabel="Reject" triggerAriaLabel={`Reject ${r.name}`}
                    question={`Reject ${r.name}? They are told nothing; you can undo this later.`} confirmLabel={`Yes, reject ${r.name}`} />
                </div>
              </div>
            </li></Card>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <Card asChild><Collapsible className="group">
          <CollapsibleTrigger className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md text-left text-sm font-medium text-foreground", focusRing)}>
            <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-90" />
            Rejected ({rejected.length})
          </CollapsibleTrigger>
          <CollapsibleContent keepMounted className="mt-3"><ul className="space-y-3">
            {rejected.map((r) => (
              <li key={r.applicantId} aria-label={r.name} className="flex flex-wrap items-center justify-between gap-3">
                <Who r={r} />
                <AdminForm action={undoRejectRequest} prefix={`undo-${r.applicantId}`} submitLabel="Undo" submitAriaLabel={`Undo reject for ${r.name}`}
                  submitVariant="outline" hidden={{ applicantId: r.applicantId }}>
                  {() => null}
                </AdminForm>
              </li>
            ))}
          </ul></CollapsibleContent>
        </Collapsible></Card>
      )}
    </div>
  );
}
