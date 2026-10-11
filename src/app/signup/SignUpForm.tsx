"use client";

import { AuthForm } from "@/components/auth/AuthForm";
import { fieldClass, hintClass, labelClass } from "@/components/ui/Field";
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
            <label htmlFor="signup-name" className={labelClass}>Name</label>
            <input id="signup-name" name="name" type="text" autoComplete="name" maxLength={100} required defaultValue={v.name ?? ""} className={fieldClass({ className: "h-11" })} />
          </div>
          <div>
            <label htmlFor="signup-email" className={labelClass}>Email</label>
            <input id="signup-email" name="email" type="email" autoComplete="email" maxLength={254} required defaultValue={v.email ?? ""} className={fieldClass({ className: "h-11" })} />
          </div>
          <div>
            <label htmlFor="signup-password" className={labelClass}>Password</label>
            <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={minLength} maxLength={200} required aria-describedby="signup-password-hint" className={fieldClass({ className: "h-11" })} />
            <p id="signup-password-hint" className={hintClass}>At least {minLength} characters.</p>
          </div>
        </>
      )}
    </AuthForm>
  );
}
