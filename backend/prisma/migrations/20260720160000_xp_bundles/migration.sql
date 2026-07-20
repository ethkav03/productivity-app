-- AlterTable
ALTER TABLE "goal_skills" ADD COLUMN     "amount" INTEGER;

-- AlterTable
ALTER TABLE "habit_skills" ADD COLUMN     "amount" INTEGER;

-- AlterTable
ALTER TABLE "quest_skills" ADD COLUMN     "amount" INTEGER;

-- CreateTable
CREATE TABLE "activity_attribute_bonuses" (
    "id" TEXT NOT NULL,
    "questId" TEXT,
    "habitId" TEXT,
    "goalId" TEXT,
    "attributeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "activity_attribute_bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_attribute_bonuses_questId_idx" ON "activity_attribute_bonuses"("questId");

-- CreateIndex
CREATE INDEX "activity_attribute_bonuses_habitId_idx" ON "activity_attribute_bonuses"("habitId");

-- CreateIndex
CREATE INDEX "activity_attribute_bonuses_goalId_idx" ON "activity_attribute_bonuses"("goalId");

-- CreateIndex
CREATE INDEX "activity_attribute_bonuses_attributeId_idx" ON "activity_attribute_bonuses"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_attribute_bonuses_questId_attributeId_key" ON "activity_attribute_bonuses"("questId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_attribute_bonuses_habitId_attributeId_key" ON "activity_attribute_bonuses"("habitId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_attribute_bonuses_goalId_attributeId_key" ON "activity_attribute_bonuses"("goalId", "attributeId");

-- AddForeignKey
ALTER TABLE "activity_attribute_bonuses" ADD CONSTRAINT "activity_attribute_bonuses_questId_fkey" FOREIGN KEY ("questId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attribute_bonuses" ADD CONSTRAINT "activity_attribute_bonuses_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attribute_bonuses" ADD CONSTRAINT "activity_attribute_bonuses_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attribute_bonuses" ADD CONSTRAINT "activity_attribute_bonuses_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
