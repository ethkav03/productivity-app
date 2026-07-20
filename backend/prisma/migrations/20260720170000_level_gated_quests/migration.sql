-- CreateEnum
CREATE TYPE "QuestRequirementType" AS ENUM ('LEVEL_THRESHOLD', 'ACTIVITY_COUNT', 'ACHIEVEMENT', 'QUEST_COMPLETED', 'GOAL_COMPLETED');

-- CreateTable
CREATE TABLE "quest_requirements" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "type" "QuestRequirementType" NOT NULL,
    "skillId" TEXT,
    "attributeId" TEXT,
    "level" INTEGER,
    "count" INTEGER,
    "achievementId" TEXT,
    "requiredQuestId" TEXT,
    "requiredGoalId" TEXT,

    CONSTRAINT "quest_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_completions" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "quest_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quest_requirements_questId_idx" ON "quest_requirements"("questId");

-- CreateIndex
CREATE INDEX "quest_requirements_skillId_idx" ON "quest_requirements"("skillId");

-- CreateIndex
CREATE INDEX "quest_requirements_attributeId_idx" ON "quest_requirements"("attributeId");

-- CreateIndex
CREATE INDEX "quest_requirements_achievementId_idx" ON "quest_requirements"("achievementId");

-- CreateIndex
CREATE INDEX "quest_requirements_requiredQuestId_idx" ON "quest_requirements"("requiredQuestId");

-- CreateIndex
CREATE INDEX "quest_requirements_requiredGoalId_idx" ON "quest_requirements"("requiredGoalId");

-- CreateIndex
CREATE INDEX "quest_completions_userId_idx" ON "quest_completions"("userId");

-- CreateIndex
CREATE INDEX "quest_completions_questId_idx" ON "quest_completions"("questId");

-- CreateIndex
CREATE UNIQUE INDEX "quest_completions_questId_periodKey_key" ON "quest_completions"("questId", "periodKey");

-- AddForeignKey
ALTER TABLE "quest_requirements" ADD CONSTRAINT "quest_requirements_questId_fkey" FOREIGN KEY ("questId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_requirements" ADD CONSTRAINT "quest_requirements_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_requirements" ADD CONSTRAINT "quest_requirements_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_requirements" ADD CONSTRAINT "quest_requirements_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_requirements" ADD CONSTRAINT "quest_requirements_requiredQuestId_fkey" FOREIGN KEY ("requiredQuestId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_requirements" ADD CONSTRAINT "quest_requirements_requiredGoalId_fkey" FOREIGN KEY ("requiredGoalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_questId_fkey" FOREIGN KEY ("questId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

