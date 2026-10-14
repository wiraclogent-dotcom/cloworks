"use client";

import { AuthForm } from "@/components/auth/AuthForm";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { forgotAction } from "./actions";

export function ForgotForm() {
  return (
    <AuthForm action={forgotAction} submitLabel="Send reset link" pendingLabel="Sending…">
      {(v) => (
        <div>
          <Label htmlFor="forgot-email">Email</Label>
          <Input id="forgot-email" name="email" type="email" autoComplete="username" maxLength={254} required defaultValue={v.email ?? ""} className="h-11" />
        </div>
      )}
    </AuthForm>
  );
}
