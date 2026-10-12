"use client";

import { AuthForm } from "@/components/auth/AuthForm";
import { fieldClass, labelClass } from "@/components/ui/Field";
import { forgotAction } from "./actions";

export function ForgotForm() {
  return (
    <AuthForm action={forgotAction} submitLabel="Send reset link" pendingLabel="Sending…">
      {(v) => (
        <div>
          <label htmlFor="forgot-email" className={labelClass}>Email</label>
          <input id="forgot-email" name="email" type="email" autoComplete="username" maxLength={254} required defaultValue={v.email ?? ""} className={fieldClass({ className: "h-11" })} />
        </div>
      )}
    </AuthForm>
  );
}
