-- Phase 3 Part 7: replace the hidden extra<->production link table
-- with extra_productions (adds a PENDING/APPROVED/DENIED status).
-- Order matters: create the new table, COPY the existing links, THEN drop the old table.

-- 1. New status type
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- 2. New table
CREATE TABLE "extra_productions" (
    "id" TEXT NOT NULL,
    "extraProfileId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,

    CONSTRAINT "extra_productions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "extra_productions_extraProfileId_productionId_key" ON "extra_productions"("extraProfileId", "productionId");

ALTER TABLE "extra_productions" ADD CONSTRAINT "extra_productions_extraProfileId_fkey" FOREIGN KEY ("extraProfileId") REFERENCES "extra_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extra_productions" ADD CONSTRAINT "extra_productions_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Copy every existing link across as APPROVED
--    (in Prisma's hidden table, "A" = ExtraProfile id and "B" = Production id)
INSERT INTO "extra_productions" ("id", "extraProfileId", "productionId", "status")
SELECT gen_random_uuid()::text, "A", "B", 'APPROVED'
FROM "_ExtraProfileToProduction";

-- 4. Only now remove the old hidden table
ALTER TABLE "_ExtraProfileToProduction" DROP CONSTRAINT "_ExtraProfileToProduction_A_fkey";
ALTER TABLE "_ExtraProfileToProduction" DROP CONSTRAINT "_ExtraProfileToProduction_B_fkey";
DROP TABLE "_ExtraProfileToProduction";