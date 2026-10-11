---
title: Managing users
section: Admin
order: 1
requiresPermission: admin.manage
---

The **People and access** page lists everyone who uses Cloworks. Admins use it to invite people, approve join requests, change roles, and remove access.

To open it, select your profile picture at the top right, choose **Account settings**, then choose **Users** under **Administration**. The page has three tabs:

- **Members**: everyone in the workspace, with their roles, login email and password status.
- **Invited**: open email invites, and the **Invite someone** form.
- **Requests**: people waiting to be let in. The tab shows how many are waiting, for example **Requests 2**.

## How people get in

Anyone can create their own account on the sign-up page with their name, email and a password (or **Continue with Google**). They confirm their email with a 6-digit code. An account on its own sees nothing: it has to be invited, or ask to join and be approved.

- **Email invite**: you invite an email address with its roles. They open the link in the email, choose a password (or use Google), and are in at once. No approval needed.
- **Invite link**: you share the workspace link. Anyone who opens it creates an account (or signs in) and their request appears under **Requests**.
- **Company email**: someone who signs up with the company email domain (for example @clogent.co.id) asks to join automatically, and also appears under **Requests**. If they already have an open invite, no request is made: they use the invite.

Admins get a notification (bell and email) for every new join request.

## Invite someone

1. Open the **Invited** tab.
2. Under **Invite someone**, type their **Email** and choose the **App role** and **Job role**. See [Signing in and roles](/help/signing-in-and-roles).
3. Choose **Send invite**. They get an email with a link that works for 7 days.

If the email can't be delivered, Cloworks says so and nothing is saved: check the address and try again.

Each open invite shows its roles, who invited them and when it expires. Use **Resend** to send a fresh link (the old one stops working), or **Revoke** to cancel it. Inviting the same email again replaces the open invite and its roles.

## The invite link

The **Invite link** card at the top of the page shows the workspace link with a **Copy** button.

- **Link is on** switches the link on or off. While it is off, the link shows nothing.
- **Reset link** makes a new link. The old one stops working at once.

Everyone who joins through the link still needs your approval.

## Approve or reject a join request

1. Open the **Requests** tab.
2. For each person, choose their **App role** and **Job role**, then choose **Approve**. They get an email saying they're in, and if they are waiting on the lobby page it lets them in by itself.
3. Or choose **Reject**. They are told nothing; their lobby says the request wasn't approved. Rejected requests are listed under **Rejected**, where **Undo** puts them back.

Approving someone also closes any open invite for the same email.

## Add a person without an account

You can still add someone directly, for example a team member who will never sign in, or to give a temporary password.

1. On the **Members** tab, find **Add person**.
2. Fill in the fields:
   - **Name (as used in the team)**
   - **Full name** and **Title**
   - **Department**
   - **App role**: Requester, Creative, Lead, or Admin. See [Signing in and roles](/help/signing-in-and-roles).
   - **Job role**
   - **Login email** (optional)
   - **Temporary password** (optional, needs a login email)
3. Select **Add person**.

If you leave **Login email** and **Temporary password** empty, the person is added but cannot sign in yet. You can set both later from their row.

## Set or reset a password

People sign in with their login email and a password.

1. Open **Edit** on their row. Their login email must be set first.
2. Type a password of at least 10 characters in the password field (**Password**, or **New password** if they already have one) and choose **Set password** (or **Reset password**). Use the eye button in the field to check what you typed.
3. Give them the password privately. Cloworks does not send it to them.

A password you set, whether in **Add person** or on their row, is temporary. The first time they sign in with it, Cloworks asks them to choose their own password before they can use anything else. Until they do, every page sends them to that screen. Afterwards they are signed out and sign in again with the new password.

The **Login email** column shows **Password set** or **No password yet**. Resetting a password signs that person out everywhere and lifts a lockout after too many wrong tries.

## Remove access

To stop someone signing in, use **Deactivate** on their row (their history is kept), or clear the **Login email** field on their record. Either takes effect on their next request.
