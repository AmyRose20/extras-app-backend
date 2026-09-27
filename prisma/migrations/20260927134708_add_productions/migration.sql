/*
  Warnings:

  - You are about to drop the column `productionName` on the `shoot_days` table. All the data in the column will be lost.
  - Added the required column `productionId` to the `shoot_days` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "shoot_days" DROP COLUMN "productionName",
ADD COLUMN     "productionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "productionId" TEXT;

-- CreateTable
CREATE TABLE "productions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ExtraProfileToProduction" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "productions_name_key" ON "productions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_ExtraProfileToProduction_AB_unique" ON "_ExtraProfileToProduction"("A", "B");

-- CreateIndex
CREATE INDEX "_ExtraProfileToProduction_B_index" ON "_ExtraProfileToProduction"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shoot_days" ADD CONSTRAINT "shoot_days_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExtraProfileToProduction" ADD CONSTRAINT "_ExtraProfileToProduction_A_fkey" FOREIGN KEY ("A") REFERENCES "extra_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExtraProfileToProduction" ADD CONSTRAINT "_ExtraProfileToProduction_B_fkey" FOREIGN KEY ("B") REFERENCES "productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
