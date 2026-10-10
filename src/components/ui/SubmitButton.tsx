"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./Button";

/**
 * Submit button for a plain `<form action={serverAction}>` (no useActionState): while the form is submitting it shows a
 * spinner and `pendingLabel` and is disabled, so a slow server round trip doesn't look like a dead click.
 */
export function SubmitButton({ pendingLabel, children, ...rest }: Omit<ButtonProps, "type" | "loading"> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...rest} type="submit" loading={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
