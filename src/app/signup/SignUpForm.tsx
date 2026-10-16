"use client";

import { AuthForm } from "@/components/auth/AuthForm";
import { PasswordInput, RememberMe } from "@/components/ui/PasswordInput";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { FieldDescription } from "@/components/shadcn/field";
import { signUpAction } from "./actions";

/** Name, email, password. After an error the name and email come back; the password never does. */
export function SignUpForm({ join, next, minLength }: { join?: string; next?: string; minLength: number }) {
  return (
    <AuthForm action={signUpAction} submitLabel="Create account" pendingLabel="Creating account…">
      {(v) => (
        <>
          {join && <input type="hidden" name="join" value={join} />}
          {next && <input type="hidden" name="next" value={next} />}
          <div>
            <Label htmlFor="signup-name">Name</Label>
            <Input id="signup-name" name="name" type="text" autoComplete="name" maxLength={100} required defaultValue={v.name ?? ""} className="h-11" />
          </div>
          <div>
            <Label htmlFor="signup-email">Email</Label>
            <Input id="signup-email" name="email" type="email" autoComplete="email" maxLength={254} required defaultValue={v.email ?? ""} className="h-11" />
          </div>
          <div>
            <Label htmlFor="signup-password">Password</Label>
            <PasswordInput id="signup-password" name="password" autoComplete="new-password" minLength={minLength} maxLength={200} required aria-describedby="signup-password-hint" className="h-11" />
            <FieldDescription id="signup-password-hint">At least {minLength} characters.</FieldDescription>
          </div>
          <RememberMe id="signup-remember" />
        </>
      )}
    </AuthForm>
  );
}
