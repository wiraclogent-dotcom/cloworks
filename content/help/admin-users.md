---
title: Managing users
section: Admin
order: 1
requiresPermission: admin.manage
---

The **People and access** page lists everyone who uses Cloworks. Admins use it to add people, change roles, and remove access.

## Add a person

1. Open **Settings** with the gear at the top right, then choose **Users** under **Administration**.
2. Select **Add person**.
3. Fill in the fields:
   - **Name (as used in the team)**
   - **Full name** and **Title**
   - **Department**
   - **App role**: Requester, Creative, Lead, or Admin. See [Signing in and roles](/help/signing-in-and-roles).
   - **Job role**
   - **Login email** (optional)
   - **Temporary password** (optional, needs a login email)
4. Select **Add person**.

If you leave **Login email** and **Temporary password** empty, the person is added but cannot sign in yet. You can set both later from their row.

## Set or reset a password

People sign in with their login email and a password.

1. Open **Edit** on their row. Their login email must be set first.
2. Type a password of at least 10 characters in the password field (**Password**, or **New password** if they already have one) and choose **Set password** (or **Reset password**).
3. Give them the password privately. Cloworks does not send it to them.

A password you set, whether in **Add person** or on their row, is temporary. The first time they sign in with it, Cloworks asks them to choose their own password before they can use anything else. Until they do, every page sends them to that screen. Afterwards they are signed out and sign in again with the new password.

The **Login email** column shows **Password set** or **No password yet**. Resetting a password signs that person out everywhere and lifts a lockout after too many wrong tries.

## Remove access

To stop someone signing in, clear the **Login email** field on their record. The form says that leaving it empty removes access.

## Outside addresses

**Allowed emails** lists addresses outside the company domain that may sign in. Any address not on this list and not on the company domain is refused.
