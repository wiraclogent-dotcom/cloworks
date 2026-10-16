"use client";

import { useActionState, type ReactNode } from "react";
import type { AuthFormState } from "@/lib/authForm";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/components/ui/cn";
import { brandSubmit } from "./styles";

/**
 * A form over a `(prev, fd) => AuthFormState` server action: shows the outcome as an Alert above the fields and
 * remounts them after each result so echoed `values` (never passwords) fill the defaults again.
 */
export function AuthForm({ action, children, submitLabel, pendingLabel, className = "space-y-4", submitClassName = brandSubmit, variant = "default" }: {
  action: (prev: AuthFormState, fd: FormData) => Promise<AuthFormState>;
  children?: ReactNode | ((values: Record<string, string>) => ReactNode);
  submitLabel: string;
  pendingLabel: string;
  className?: string;
  submitClassName?: string;
  variant?: "default" | "outline";
}) {
  const [state, run, pending] = useActionState<AuthFormState, FormData>(action, null);
  return (
    <form key={state?.nonce ?? "initial"} action={run} className={className}>
      {state?.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
      {state?.info && <Alert variant="success"><AlertDescription>{state.info}</AlertDescription></Alert>}
      {typeof children === "function" ? children(state?.values ?? {}) : children}
      <Button type="submit" variant={variant} loading={pending} className={cn("w-full", submitClassName)}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
