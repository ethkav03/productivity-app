-- CreateEnum
CREATE TYPE "LevelRewardType" AS ENUM ('TITLE', 'BADGE', 'STREAK_PROTECTION', 'FEATURE_UNLOCK', 'QUEST');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LEVEL_REWARD_UNLOCK';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "equippedTitleId" TEXT,
ADD COLUMN     "habitStreakProtectionCharges" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "level_rewards" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "type" "LevelRewardType" NOT NULL,
    "attributeKey" "AttributeKey",
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_level_rewards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelRewardId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_level_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "level_rewards_key_key" ON "level_rewards"("key");

-- CreateIndex
CREATE INDEX "user_level_rewards_userId_idx" ON "user_level_rewards"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_level_rewards_userId_levelRewardId_key" ON "user_level_rewards"("userId", "levelRewardId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_equippedTitleId_fkey" FOREIGN KEY ("equippedTitleId") REFERENCES "level_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_level_rewards" ADD CONSTRAINT "user_level_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_level_rewards" ADD CONSTRAINT "user_level_rewards_levelRewardId_fkey" FOREIGN KEY ("levelRewardId") REFERENCES "level_rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

