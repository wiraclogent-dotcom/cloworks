-- CreateEnum
CREATE TYPE "KpiKind" AS ENUM ('REQUESTS', 'PROJECTS');

-- CreateTable
CREATE TABLE "KpiRosterEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "KpiKind" NOT NULL,
    "included" BOOLEAN NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "KpiRosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KpiRosterEntry_workspaceId_kind_idx" ON "KpiRosterEntry"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRosterEntry_userId_kind_key" ON "KpiRosterEntry"("userId", "kind");

-- AddForeignKey
ALTER TABLE "KpiRosterEntry" ADD CONSTRAINT "KpiRosterEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiRosterEntry" ADD CONSTRAINT "KpiRosterEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiRosterEntry" ADD CONSTRAINT "KpiRosterEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

