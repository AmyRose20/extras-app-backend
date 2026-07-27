-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EXTRA');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "age" INTEGER,
    "gender" "Gender",
    "heightCm" INTEGER,
    "skills" TEXT[],
    "availability" TEXT,
    "photoUrl" TEXT,

    CONSTRAINT "extra_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shoot_days" (
    "id" TEXT NOT NULL,
    "productionName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shoot_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_requests" (
    "id" TEXT NOT NULL,
    "shootDayId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantityNeeded" INTEGER NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_invites" (
    "id" TEXT NOT NULL,
    "callRequestId" TEXT NOT NULL,
    "extraProfileId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "call_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "extra_profiles_userId_key" ON "extra_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "call_invites_callRequestId_extraProfileId_key" ON "call_invites"("callRequestId", "extraProfileId");

-- AddForeignKey
ALTER TABLE "extra_profiles" ADD CONSTRAINT "extra_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shoot_days" ADD CONSTRAINT "shoot_days_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_requests" ADD CONSTRAINT "call_requests_shootDayId_fkey" FOREIGN KEY ("shootDayId") REFERENCES "shoot_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_invites" ADD CONSTRAINT "call_invites_callRequestId_fkey" FOREIGN KEY ("callRequestId") REFERENCES "call_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_invites" ADD CONSTRAINT "call_invites_extraProfileId_fkey" FOREIGN KEY ("extraProfileId") REFERENCES "extra_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
