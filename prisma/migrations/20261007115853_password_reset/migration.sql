-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "resetCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resetCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "resetCodeHash" TEXT;
