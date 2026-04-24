-- Add reference proposal ids on each RFP project so AI answer generation can
-- be grounded in selected proposal records.
ALTER TABLE "rfp_projects"
ADD COLUMN "referenceProjectIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
