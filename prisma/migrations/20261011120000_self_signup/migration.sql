-- CreateEnum
CREATE TYPE "JoinSource" AS ENUM ('LINK', 'DOMAIN');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "emailDomain" TEXT,
ADD COLUMN     "joinCode" TEXT,
ADD COLUMN     "joinLinkEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Applicant" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "codeSentAt" TIMESTAMP(3),
    "codesSentInWindow" INTEGER NOT NULL DEFAULT 0,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "requestedWorkspaceId" TEXT,
    "requestedAt" TIMESTAMP(3),
    "requestSource" "JoinSource",
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "appRole" "AppRole" NOT NULL,
    "jobRole" "JobRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Applicant_email_key" ON "Applicant"("email");

-- CreateIndex
CREATE INDEX "Applicant_requestedWorkspaceId_idx" ON "Applicant"("requestedWorkspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_workspaceId_idx" ON "Invite"("workspaceId");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_emailDomain_key" ON "Workspace"("emailDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_joinCode_key" ON "Workspace"("joinCode");

-- AddForeignKey
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_requestedWorkspaceId_fkey" FOREIGN KEY ("requestedWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Clogent: its email domain and a random 22-char URL-safe join code (md5 hex -> base64url, padding stripped)
UPDATE "Workspace"
SET "emailDomain" = 'clogent.co.id',
    "joinCode" = translate(rtrim(encode(decode(md5(random()::text || clock_timestamp()::text), 'hex'), 'base64'), '='), '+/', '-_')
WHERE "id" = 'clogent';
