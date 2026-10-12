-- Throttle the "you already have an account" email (sign-up with a member's email) to one per hour per address.
ALTER TABLE "User" ADD COLUMN "accountNoticeSentAt" TIMESTAMP(3);
