-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "seasonId" TEXT;

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "focus" "AttributeKey"[],
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "status" "SeasonStatus" NOT NULL DEFAULT 'ACTIVE',
    "startLevel" INTEGER NOT NULL,
    "startAttributeLevels" JSONB NOT NULL,
    "closedAt" TIMESTAMP(3),
    "endLevel" INTEGER,
    "endAttributeLevels" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seasons_userId_idx" ON "seasons"("userId");

-- CreateIndex
CREATE INDEX "seasons_userId_status_idx" ON "seasons"("userId", "status");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
