-- CreateEnum
CREATE TYPE "MarketingActivityStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "color" TEXT NOT NULL DEFAULT 'div-1',
ADD COLUMN     "onMarketingCalendar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DivisionLead" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "DivisionLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingActivity" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDay" DATE NOT NULL,
    "endDay" DATE NOT NULL,
    "status" "MarketingActivityStatus" NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "MarketingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingMonth" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "productFocus" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "MarketingMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAnnouncement" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startDay" DATE,
    "endDay" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "MarketingAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DivisionLead_workspaceId_idx" ON "DivisionLead"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DivisionLead_workspaceId_divisionId_userId_key" ON "DivisionLead"("workspaceId", "divisionId", "userId");

-- CreateIndex
CREATE INDEX "MarketingActivity_workspaceId_idx" ON "MarketingActivity"("workspaceId");

-- CreateIndex
CREATE INDEX "MarketingActivity_workspaceId_startDay_idx" ON "MarketingActivity"("workspaceId", "startDay");

-- CreateIndex
CREATE INDEX "MarketingMonth_workspaceId_idx" ON "MarketingMonth"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingMonth_workspaceId_month_key" ON "MarketingMonth"("workspaceId", "month");

-- CreateIndex
CREATE INDEX "MarketingAnnouncement_workspaceId_idx" ON "MarketingAnnouncement"("workspaceId");

-- CreateIndex
CREATE INDEX "MarketingAnnouncement_workspaceId_month_idx" ON "MarketingAnnouncement"("workspaceId", "month");

-- AddForeignKey
ALTER TABLE "DivisionLead" ADD CONSTRAINT "DivisionLead_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DivisionLead" ADD CONSTRAINT "DivisionLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DivisionLead" ADD CONSTRAINT "DivisionLead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingActivity" ADD CONSTRAINT "MarketingActivity_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingActivity" ADD CONSTRAINT "MarketingActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingActivity" ADD CONSTRAINT "MarketingActivity_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingActivity" ADD CONSTRAINT "MarketingActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMonth" ADD CONSTRAINT "MarketingMonth_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMonth" ADD CONSTRAINT "MarketingMonth_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAnnouncement" ADD CONSTRAINT "MarketingAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAnnouncement" ADD CONSTRAINT "MarketingAnnouncement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

