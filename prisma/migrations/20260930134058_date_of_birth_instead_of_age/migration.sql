/*
  Warnings:

  - You are about to drop the column `age` on the `extra_profiles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "extra_profiles" DROP COLUMN "age",
ADD COLUMN     "dateOfBirth" DATE;
