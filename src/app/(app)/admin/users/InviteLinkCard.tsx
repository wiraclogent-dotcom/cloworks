"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ConfirmAction } from "@/components/admin/AdminForm";
import { Button } from "@/components/shadcn/button";
import { Card, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Switch } from "@/components/ui/Switch";
import type { AdminFormState } from "@/lib/adminForm";
import { resetInviteLink, toggleInviteLink } from "./actions";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * The shared join link. `base` is the trusted origin ("" when unknown): then the path is shown and Copy builds the
 * absolute URL from this page's origin.
 */
export function InviteLinkCard({ base, joinCode, enabled, emailDomain }: { base: string; joinCode: string | null; enabled: boolean; emailDomain: string | null }) {
  const path = joinCode ? `/join/${joinCode}` : null;
  const [copied, setCopied] = useState(false);
  const [state, run] = useActionState<AdminFormState, FormData>(toggleInviteLink, null);
  const formRef = useRef<HTMLFormElement>(null);

  async function copy() {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(`${base || window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="mb-5">
      <section aria-labelledby="invite-link-h">
        <CardHeader><CardTitle id="invite-link-h">Invite link</CardTitle></CardHeader>
        {path ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-md bg-muted px-2.5 py-1.5 text-compact break-all text-foreground">{`${base}${path}`}</code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : (
          <EmptyState size="inline" title="No link yet. Use Reset link to create one." />
        )}
        {emailDomain && <p className="mt-2 text-sm text-muted-foreground">People with @{emailDomain} can request to join</p>}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <form ref={formRef} action={run} className="min-w-56">
            <input type="hidden" name="enabled" value={String(!enabled)} />
            <Switch id="join-link-enabled" label="Link is on" description={enabled ? "Anyone with the link can request to join." : "The link shows nothing until you turn it on."}
              checked={enabled} onCheckedChange={() => formRef.current?.requestSubmit()} />
            {state && <p role={state.ok ? "status" : "alert"} className="mt-1 text-compact font-medium text-muted-foreground">{state.ok ? state.message : `Error: ${state.message}`}</p>}
          </form>
          <ConfirmAction action={resetInviteLink} prefix="reset-link" hidden={{}} triggerLabel="Reset link"
            question="Reset the link? The current one stops working at once."
            confirmLabel="Yes, reset link" />
        </div>
      </section>
    </Card>
  );
}
