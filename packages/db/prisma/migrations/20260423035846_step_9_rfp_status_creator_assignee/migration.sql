-- CreateEnum
CREATE TYPE "RFPStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'UNDER_REVIEW', 'APPROVED', 'SUBMITTED', 'WON', 'LOST', 'CANCELLED');

-- AlterTable
ALTER TABLE "rfp_projects" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "status" "RFPStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "rfp_projects_tenantId_status_idx" ON "rfp_projects"("tenantId", "status");

-- CreateIndex
CREATE INDEX "rfp_projects_createdById_idx" ON "rfp_projects"("createdById");

-- CreateIndex
CREATE INDEX "rfp_projects_assigneeId_idx" ON "rfp_projects"("assigneeId");

-- AddForeignKey
ALTER TABLE "rfp_projects" ADD CONSTRAINT "rfp_projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfp_projects" ADD CONSTRAINT "rfp_projects_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
