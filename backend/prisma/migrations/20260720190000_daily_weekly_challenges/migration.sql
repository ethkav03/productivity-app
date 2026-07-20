-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "XPSourceType" ADD VALUE 'CHALLENGE_COMPLETION';

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ChallengeType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "skillId" TEXT,
    "targetXp" INTEGER NOT NULL,
    "progressXp" INTEGER NOT NULL DEFAULT 0,
    "xpReward" INTEGER NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "periodKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challenges_userId_idx" ON "challenges"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_userId_type_periodKey_key" ON "challenges"("userId", "type", "periodKey");

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

