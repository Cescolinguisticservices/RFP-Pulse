-- AlterTable: add full extracted text to Document so the RFP detail view can render it.
ALTER TABLE "documents" ADD COLUMN "extractedText" TEXT;

-- AlterTable: add per-question selection flag (drives which questions become tasks for the assignee).
ALTER TABLE "rfp_questions" ADD COLUMN "isSelected" BOOLEAN NOT NULL DEFAULT false;
