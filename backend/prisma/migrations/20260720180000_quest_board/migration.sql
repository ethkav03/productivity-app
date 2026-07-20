-- CreateEnum
CREATE TYPE "QuestCategory" AS ENUM ('DAILY', 'WEEKLY', 'LONG_TERM', 'SYSTEM');

-- AlterTable
ALTER TABLE "quests" ADD COLUMN     "category" "QuestCategory" NOT NULL DEFAULT 'LONG_TERM';

-- CreateIndex
CREATE INDEX "quests_userId_category_idx" ON "quests"("userId", "category");

