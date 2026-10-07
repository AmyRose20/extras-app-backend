/*
  Warnings:

  - A unique constraint covering the columns `[detailsLinkHash]` on the table `extra_profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "extra_profiles" ADD COLUMN     "detailsLinkExpiresAt" TIMESTAMP(3),
ADD COLUMN     "detailsLinkHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "extra_profiles_detailsLinkHash_key" ON "extra_profiles"("detailsLinkHash");
