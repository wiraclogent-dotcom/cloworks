"use client";

import { useActionState, type ReactNode } from "react";
import type { AuthFormState } from "@/lib/authForm";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { brandSubmit } from "./styles";

/**
 * A form over a `(prev, fd) => AuthFormState` server action: shows the outcome as an Alert above the fields and
 * remounts them after each result so echoed `values` (never passwords) fill the defaults again.
 */
export function AuthForm({ action, children, submitLabel, pendingLabel, className = "space-y-4", submitClassName = brandSubmit, variant = "primary" }: {
  action: (prev: AuthFormState, fd: FormData) => Promise<AuthFormState>;
  children?: ReactNode | ((values: Record<string, string>) => ReactNode);
  submitLabel: string;
  pendingLabel: string;
  className?: string;
  submitClassName?: string;
  variant?: "primary" | "secondary";
}) {
  const [state, run, pending] = useActionState<AuthFormState, FormData>(action, null);
  return (
    <form key={state?.nonce ?? "initial"} action={run} className={className}>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.info && <Alert tone="success">{state.info}</Alert>}
      {typeof children === "function" ? children(state?.values ?? {}) : children}
      <Button type="submit" variant={variant} block loading={pending} className={submitClassName}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
