-- CreateEnum
CREATE TYPE "AttributeKey" AS ENUM ('PHYSICAL', 'INTELLIGENCE', 'DISCIPLINE', 'ENERGY', 'SOCIAL', 'WEALTH', 'CREATIVITY', 'WISDOM');

-- AlterEnum
ALTER TYPE "AchievementRequirementType" ADD VALUE 'ATTRIBUTE_LEVEL_REACHED';

-- DropIndex
DROP INDEX "skills_userId_name_key";

-- AlterTable
ALTER TABLE "achievements" ADD COLUMN     "attributeKey" "AttributeKey";

-- AlterTable
ALTER TABLE "skills" ADD COLUMN     "attributeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "xp_transactions" ADD COLUMN     "attributeId" TEXT;

-- CreateTable
CREATE TABLE "attributes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" "AttributeKey" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "totalXP" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attributes_userId_idx" ON "attributes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "attributes_userId_key_key" ON "attributes"("userId", "key");

-- CreateIndex
CREATE INDEX "skills_attributeId_idx" ON "skills"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "skills_userId_attributeId_name_key" ON "skills"("userId", "attributeId", "name");

-- CreateIndex
CREATE INDEX "xp_transactions_attributeId_idx" ON "xp_transactions"("attributeId");

-- AddForeignKey
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

