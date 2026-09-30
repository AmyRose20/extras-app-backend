-- AlterTable
ALTER TABLE "extra_profiles" ADD COLUMN     "bicEncrypted" TEXT,
ADD COLUMN     "hasSmartphone" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ibanEncrypted" TEXT;
