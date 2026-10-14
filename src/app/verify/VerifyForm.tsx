"use client";

import { useActionState, useEffect, useState } from "react";
import type { AuthFormState } from "@/lib/authForm";
import { AuthForm } from "@/components/auth/AuthForm";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { resendAction, verifyAction } from "./actions";

const RESEND_AFTER_S = 60;

/** The code input plus "Resend code", which counts down from 60 s after the page opens and after each resend. */
export function VerifyForm({ next }: { next?: string }) {
  return (
    <div className="space-y-4">
      <AuthForm action={verifyAction} submitLabel="Verify" pendingLabel="Checking…">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <Label htmlFor="verify-code">6-digit code</Label>
          <Input id="verify-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
            className="h-12 text-center font-mono text-2xl tracking-[0.5em]" />
        </div>
      </AuthForm>
      <ResendForm />
    </div>
  );
}

function ResendForm() {
  const [state, run, pending] = useActionState<AuthFormState, FormData>(resendAction, null);
  const [openedAt] = useState(() => Date.now());
  const [now, setNow] = useState(openedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const since = state?.sentAt ?? openedAt;
  const left = Math.min(RESEND_AFTER_S, Math.max(0, RESEND_AFTER_S - Math.floor((now - since) / 1000)));
  return (
    <form action={run} className="space-y-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.info && <Alert tone="success">{state.info}</Alert>}
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Didn&apos;t get it? Check spam, or
        <Button type="submit" variant="ghost" size="sm" loading={pending} disabled={left > 0}>
          {pending ? "Sending…" : left > 0 ? `Resend code in ${left}s` : "Resend code"}
        </Button>
      </p>
    </form>
  );
}
