import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressionService } from '../../progression/progression.service';
import { ACTIVITY_COMPLETED_EVENT, ActivityCompletedEvent } from '../../progression/events/activity-completed.event';

/**
 * Reacts to ActivityCompletedEvent to advance Daily/Weekly Challenge
 * progress - the concrete payoff of Sprint 1's domain-event system: this
 * listener exists without ProgressionService or any of Quests/Habits/Goals
 * needing to know Challenges exist at all.
 *
 * Progress is attribute-scoped, not skill-scoped: a challenge's `skillId`
 * is descriptive (which skill inspired the suggestion), not a strict
 * eligibility filter - any XP landing in the challenge's target attribute
 * counts, the same "attribute-level rows are the source of truth" reasoning
 * used throughout the ledger (see docs/gameplay-systems.md § 3).
 *
 * The completion bonus goes through `ProgressionService.completeActivity`
 * rather than `XpService.awardXp` directly, to keep `XpService`'s documented
 * "only ProgressionModule and AdminModule call this" invariant intact - a
 * challenge completion is a normal activity completion (counts toward the
 * character streak, runs achievement checks) as far as the rest of the app
 * is concerned, just triggered by a listener instead of a controller.
 */
@Injectable()
export class ChallengeProgressListener {
  private readonly logger = new Logger(ChallengeProgressListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progressionService: ProgressionService,
  ) {}

  @OnEvent(ACTIVITY_COMPLETED_EVENT)
  async handleActivityCompleted(event: ActivityCompletedEvent): Promise<void> {
    try {
      const attributeRows = await this.prisma.xPTransaction.findMany({
        where: { eventId: event.eventId, attributeId: { not: null } },
        select: { attributeId: true, amount: true },
      });
      if (attributeRows.length === 0) return;

      const earnedByAttribute = new Map<string, number>();
      for (const row of attributeRows) {
        const attributeId = row.attributeId as string;
        earnedByAttribute.set(attributeId, (earnedByAttribute.get(attributeId) ?? 0) + row.amount);
      }

      const activeChallenges = await this.prisma.challenge.findMany({
        where: {
          userId: event.userId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          attributeId: { in: [...earnedByAttribute.keys()] },
        },
      });

      for (const challenge of activeChallenges) {
        const earned = earnedByAttribute.get(challenge.attributeId) ?? 0;
        if (earned <= 0) continue;

        const progressXp = challenge.progressXp + earned;
        const completed = progressXp >= challenge.targetXp;

        // eslint-disable-next-line no-await-in-loop
        await this.prisma.challenge.update({
          where: { id: challenge.id },
          data: { progressXp, ...(completed && { status: 'COMPLETED', completedAt: new Date() }) },
        });

        if (completed) {
          // eslint-disable-next-line no-await-in-loop
          await this.progressionService.completeActivity({
            userId: event.userId,
            amount: challenge.xpReward,
            sourceType: 'CHALLENGE_COMPLETION',
            sourceId: challenge.id,
            sourceName: challenge.title,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to update challenge progress for user ${event.userId}`, error);
    }
  }
}
