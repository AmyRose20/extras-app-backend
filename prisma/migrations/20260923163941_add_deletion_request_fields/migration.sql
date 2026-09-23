-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "DeletionRequestedBy" AS ENUM ('EXTRA', 'ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "deletionRequestStatus" "DeletionRequestStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedBy" "DeletionRequestedBy",
ADD COLUMN     "deletionReviewedAt" TIMESTAMP(3),
ADD COLUMN     "deletionReviewedByAdminId" INTEGER;
