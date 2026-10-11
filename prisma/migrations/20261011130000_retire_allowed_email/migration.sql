-- Retire the AllowedEmail allow-list: an active User now grants access on its own.
--
-- Every AllowedEmail whose address has no User (same lower(email), same workspace) becomes an open Invite:
-- Requester / Other, expiring in 7 days, no email sent. Its tokenHash is 'migrated:' || id, which never equals a
-- SHA-256 hex digest, so the link cannot be used until an admin presses Resend (which issues a real token).
-- expiresAt is written in UTC (the column has no time zone and Prisma reads it as UTC), whatever the server zone.
--
-- invitedById must reference a real ADMIN of the workspace: the oldest active ADMIN; if the workspace has no active
-- admin, the oldest ADMIN regardless of active; if it has no admin at all, its rows are skipped (not migrated).
-- "Oldest" is the lowest id: User has no createdAt, and cuids sort by creation time.
INSERT INTO "Invite" ("id", "email", "appRole", "jobRole", "tokenHash", "invitedById", "expiresAt", "workspaceId")
SELECT DISTINCT ON (a."workspaceId", lower(trim(a."email")))
  'mig' || substr(md5(a."id"), 1, 22),
  lower(trim(a."email")),
  'REQUESTER',
  'OTHER',
  'migrated:' || a."id",
  inviter."id",
  timezone('UTC', now()) + interval '7 days',
  a."workspaceId"
FROM "AllowedEmail" a
JOIN LATERAL (
  SELECT u."id"
  FROM "User" u
  WHERE u."workspaceId" = a."workspaceId" AND u."appRole" = 'ADMIN'
  ORDER BY u."active" DESC, u."id" ASC
  LIMIT 1
) inviter ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "User" x
  WHERE x."workspaceId" = a."workspaceId" AND lower(x."email") = lower(trim(a."email"))
)
-- Case variants of one address (unique only as typed) collapse into a single open invite.
ORDER BY a."workspaceId", lower(trim(a."email")), a."id";

-- DropForeignKey
ALTER TABLE "AllowedEmail" DROP CONSTRAINT "AllowedEmail_workspaceId_fkey";

-- DropTable
DROP TABLE "AllowedEmail";
