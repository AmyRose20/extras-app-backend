/*
  Warnings:

  - The `availability` column on the `extra_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "extra_profiles" DROP COLUMN "availability",
ADD COLUMN     "availability" TEXT[];
