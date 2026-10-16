"use client";

import { AuthForm } from "@/components/auth/AuthForm";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/shadcn/label";
import { FieldDescription } from "@/components/shadcn/field";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { resetAction } from "./actions";

export function ResetForm({ token }: { token: string }) {
  return (
    <AuthForm action={resetAction} submitLabel="Set new password" pendingLabel="Saving…">
      <input type="hidden" name="token" value={token} />
      <div>
        <Label htmlFor="reset-password">New password</Label>
        <PasswordInput id="reset-password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={200} required aria-describedby="reset-password-hint" className="h-11" />
        <FieldDescription id="reset-password-hint">At least {MIN_PASSWORD_LENGTH} characters.</FieldDescription>
      </div>
      <div>
        <Label htmlFor="reset-confirm">Confirm new password</Label>
        <PasswordInput id="reset-confirm" name="confirmPassword" autoComplete="new-password" maxLength={200} required className="h-11" />
      </div>
    </AuthForm>
  );
}
