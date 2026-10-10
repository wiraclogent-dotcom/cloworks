"use client";

import { AdminForm, Labeled, control } from "@/components/admin/AdminForm";
import { changePasswordFirstTime } from "./actions";

/** Temporary + new + confirm. On success the action signs the person out to sign in again with the new password. */
export function ChangePasswordPageForm() {
  return (
    <AdminForm action={changePasswordFirstTime} prefix="first-password" submitLabel="Change password">
      {({ idFor, aria }) => (
        <div className="grid gap-3">
          <Labeled id={idFor("currentPassword")} label="Temporary password">
            <input id={idFor("currentPassword")} name="currentPassword" type="password" autoComplete="current-password" required className={control} {...aria()} />
          </Labeled>
          <Labeled id={idFor("newPassword")} label="New password (at least 10 characters)">
            <input id={idFor("newPassword")} name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={200} required className={control} {...aria()} />
          </Labeled>
          <Labeled id={idFor("confirmPassword")} label="Confirm new password">
            <input id={idFor("confirmPassword")} name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={200} required className={control} {...aria()} />
          </Labeled>
        </div>
      )}
    </AdminForm>
  );
}
