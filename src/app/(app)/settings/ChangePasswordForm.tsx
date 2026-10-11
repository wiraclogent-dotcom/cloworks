"use client";

import { AdminForm, Labeled, control } from "@/components/admin/AdminForm";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { changePassword } from "./actions";

/** Current + new + confirm. On success the action signs the person out to sign in again with the new password. */
export function ChangePasswordForm() {
  return (
    <AdminForm action={changePassword} prefix="change-password" submitLabel="Change password">
      {({ idFor, aria }) => (
        <div className="grid gap-3 sm:max-w-sm">
          <Labeled id={idFor("currentPassword")} label="Current password">
            <PasswordInput id={idFor("currentPassword")} name="currentPassword" autoComplete="current-password" required className={control} {...aria()} />
          </Labeled>
          <Labeled id={idFor("newPassword")} label="New password (at least 10 characters)">
            <PasswordInput id={idFor("newPassword")} name="newPassword" autoComplete="new-password" minLength={10} maxLength={200} required className={control} {...aria()} />
          </Labeled>
          <Labeled id={idFor("confirmPassword")} label="Confirm new password">
            <PasswordInput id={idFor("confirmPassword")} name="confirmPassword" autoComplete="new-password" minLength={10} maxLength={200} required className={control} {...aria()} />
          </Labeled>
        </div>
      )}
    </AdminForm>
  );
}
