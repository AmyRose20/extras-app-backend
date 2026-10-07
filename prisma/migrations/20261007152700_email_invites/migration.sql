/*
  Warnings:

  - A unique constraint covering the columns `[responseTokenHash]` on the table `call_invites` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "call_invites" ADD COLUMN     "responseTokenHash" TEXT;

-- CreateTable
CREATE TABLE "signup_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" TEXT,
    "existingAccount" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signup_invites_tokenHash_key" ON "signup_invites"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "call_invites_responseTokenHash_key" ON "call_invites"("responseTokenHash");

-- AddForeignKey
ALTER TABLE "signup_invites" ADD CONSTRAINT "signup_invites_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
