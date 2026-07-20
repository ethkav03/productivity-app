-- AlterTable
ALTER TABLE "xp_transactions" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE INDEX "xp_transactions_eventId_idx" ON "xp_transactions"("eventId");
