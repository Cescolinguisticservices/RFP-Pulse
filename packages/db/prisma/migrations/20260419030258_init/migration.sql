-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RFP_MANAGER', 'SME', 'REVIEWER', 'APPROVER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('DRAFTING', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LLMProvider" AS ENUM ('OPENAI', 'GEMINI', 'CLAUDE', 'LLAMA');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('RFP', 'FOIA', 'KNOWLEDGE');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "defaultProvider" "LLMProvider" NOT NULL DEFAULT 'OPENAI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'READ_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfp_projects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientName" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfp_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfp_questions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "sectionPath" TEXT,
    "assignedSmeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfp_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfp_answers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "state" "WorkflowState" NOT NULL DEFAULT 'DRAFTING',
    "generatedBy" "LLMProvider",
    "authorId" TEXT,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfp_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_base_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_intel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "pricingModel" TEXT,
    "winThemes" TEXT,
    "technicalStrategies" TEXT,
    "sourceDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_intel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "filename" TEXT NOT NULL,
    "s3Key" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "rfp_projects_tenantId_idx" ON "rfp_projects"("tenantId");

-- CreateIndex
CREATE INDEX "rfp_questions_tenantId_idx" ON "rfp_questions"("tenantId");

-- CreateIndex
CREATE INDEX "rfp_questions_projectId_idx" ON "rfp_questions"("projectId");

-- CreateIndex
CREATE INDEX "rfp_answers_tenantId_idx" ON "rfp_answers"("tenantId");

-- CreateIndex
CREATE INDEX "rfp_answers_questionId_idx" ON "rfp_answers"("questionId");

-- CreateIndex
CREATE INDEX "rfp_answers_state_idx" ON "rfp_answers"("state");

-- CreateIndex
CREATE INDEX "knowledge_base_entries_tenantId_idx" ON "knowledge_base_entries"("tenantId");

-- CreateIndex
CREATE INDEX "competitor_intel_tenantId_idx" ON "competitor_intel"("tenantId");

-- CreateIndex
CREATE INDEX "documents_tenantId_idx" ON "documents"("tenantId");

-- CreateIndex
CREATE INDEX "documents_projectId_idx" ON "documents"("projectId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfp_projects" ADD CONSTRAINT "rfp_projects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfp_questions" ADD CONSTRAINT "rfp_questions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "rfp_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfp_questions" ADD CONSTRAINT "rfp_questions_assignedSmeId_fkey" FOREIGN KEY ("assignedSmeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfp_answers" ADD CONSTRAINT "rfp_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "rfp_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfp_answers" ADD CONSTRAINT "rfp_answers_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfp_answers" ADD CONSTRAINT "rfp_answers_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_base_entries" ADD CONSTRAINT "knowledge_base_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_intel" ADD CONSTRAINT "competitor_intel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "rfp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
