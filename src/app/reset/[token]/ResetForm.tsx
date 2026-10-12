"use client";

import { AuthForm } from "@/components/auth/AuthForm";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { fieldClass, hintClass, labelClass } from "@/components/ui/Field";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { resetAction } from "./actions";

export function ResetForm({ token }: { token: string }) {
  return (
    <AuthForm action={resetAction} submitLabel="Set new password" pendingLabel="Saving…">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="reset-password" className={labelClass}>New password</label>
        <PasswordInput id="reset-password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={200} required aria-describedby="reset-password-hint" className={fieldClass({ className: "h-11" })} />
        <p id="reset-password-hint" className={hintClass}>At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>
      <div>
        <label htmlFor="reset-confirm" className={labelClass}>Confirm new password</label>
        <PasswordInput id="reset-confirm" name="confirmPassword" autoComplete="new-password" maxLength={200} required className={fieldClass({ className: "h-11" })} />
      </div>
    </AuthForm>
  );
}
