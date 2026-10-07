-- AlterEnum
ALTER TYPE "InviteStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "call_invites" ADD COLUMN     "finishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "extra_profiles" ADD COLUMN     "accountHolderName" TEXT;
