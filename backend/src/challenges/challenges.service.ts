import { Injectable } from '@nestjs/common';
import { Challenge, ChallengeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findNeglectedAttribute } from '../common/neglected-attribute';
import { endOfDayUtc, endOfWeekUtc, getDayKey, getWeekKey } from '../common/period';

const DAILY_REWARD = 25;
const WEEKLY_REWARD = 150;
const WEEKLY_TARGET_XP = 500;
/** DAILY challenges aren't XP-threshold based - any qualifying completion finishes one immediately, so 1 is a nominal target rather than a real threshold. */
const DAILY_TARGET_XP = 1;

const challengeInclude = {
  attribute: { select: { id: true, key: true, name: true } },
  skill: { select: { id: true, name: true } },
} satisfies Prisma.ChallengeInclude;

type ChallengeWithRelations = Prisma.ChallengeGetPayload<{ include: typeof challengeInclude }>;

function serializeChallenge(challenge: ChallengeWithRelations) {
  const { attribute, skill, ...rest } = challenge;
  const progressPercent =
    rest.status === 'COMPLETED' ? 100 : Math.min(100, Math.round((rest.progressXp / rest.targetXp) * 100));

  return {
    ...rest,
    attributeName: attribute.name,
    attributeKey: attribute.key,
    skillName: skill?.name ?? null,
    progressPercent,
  };
}

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensures the caller has an up-to-date DAILY and WEEKLY challenge, then
   * returns whichever of them haven't yet expired. Entirely system-driven -
   * there's no create/edit endpoint, matching the roadmap's framing.
   */
  async getActive(userId: string) {
    await Promise.all([this.ensureChallenge(userId, 'DAILY'), this.ensureChallenge(userId, 'WEEKLY')]);

    const challenges = await this.prisma.challenge.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      include: challengeInclude,
      orderBy: { type: 'asc' },
    });

    return challenges.map(serializeChallenge);
  }

  /**
   * Lazy generation, not a scheduled job - the same "check-and-generate-if-
   * stale on read" pattern Quest Board's System quests use, and for the
   * same reason (no cron infrastructure exists). A no-op if the user has no
   * skill under any attribute yet (nothing sensible to build a challenge
   * around), matching System quest generation's own guard.
   */
  private async ensureChallenge(userId: string, type: ChallengeType): Promise<void> {
    const periodKey = type === 'DAILY' ? getDayKey() : getWeekKey();

    const existing = await this.prisma.challenge.findUnique({
      where: { userId_type_periodKey: { userId, type, periodKey } },
    });
    if (existing) return;

    const neglected = await findNeglectedAttribute(this.prisma, userId, { requireSkill: true });
    if (!neglected || !neglected.skill) return;

    const expiresAt = type === 'DAILY' ? endOfDayUtc() : endOfWeekUtc();

    const data: Omit<Challenge, 'id' | 'createdAt' | 'completedAt' | 'status'> =
      type === 'DAILY'
        ? {
            userId,
            type,
            title: `Daily Challenge: ${neglected.attributeName}`,
            description: `${neglected.attributeName} has received little attention lately - complete an activity tagged with ${neglected.skill.name} today.`,
            attributeId: neglected.attributeId,
            skillId: neglected.skill.id,
            targetXp: DAILY_TARGET_XP,
            progressXp: 0,
            xpReward: DAILY_REWARD,
            periodKey,
            expiresAt,
          }
        : {
            userId,
            type,
            title: `Weekly Challenge: ${neglected.attributeName}`,
            description: `${neglected.attributeName} has been your most-neglected attribute this week - earn ${WEEKLY_TARGET_XP} XP in it before the week is out.`,
            attributeId: neglected.attributeId,
            skillId: neglected.skill.id,
            targetXp: WEEKLY_TARGET_XP,
            progressXp: 0,
            xpReward: WEEKLY_REWARD,
            periodKey,
            expiresAt,
          };

    await this.prisma.challenge.create({ data });
  }
}
