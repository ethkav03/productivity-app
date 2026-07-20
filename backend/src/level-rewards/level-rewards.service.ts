import { Injectable } from '@nestjs/common';
import { LevelReward } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DIFFICULTY_XP } from '../common/leveling';

@Injectable()
export class LevelRewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  findAll() {
    return this.prisma.levelReward.findMany({ orderBy: { level: 'asc' } });
  }

  findUnlocked(userId: string) {
    return this.prisma.userLevelReward.findMany({
      where: { userId },
      include: { levelReward: true },
      orderBy: { unlockedAt: 'desc' },
    });
  }

  /**
   * Evaluates every reward the user hasn't unlocked yet against their
   * current character/attribute levels and unlocks any whose threshold is
   * now met - the same data-driven pattern AchievementsService uses, scoped
   * to CHARACTER (attributeKey: null) or one of the 8 fixed attributes,
   * never a skill (skills are user-created, not fixed, so a globally-seeded
   * reward can't sensibly target one).
   */
  async checkAndUnlock(userId: string): Promise<LevelReward[]> {
    const [user, attributes, unlockedRows, allRewards] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.attribute.findMany({ where: { userId } }),
      this.prisma.userLevelReward.findMany({ where: { userId }, select: { levelRewardId: true } }),
      this.prisma.levelReward.findMany(),
    ]);

    const unlockedIds = new Set(unlockedRows.map((row) => row.levelRewardId));
    const attributeLevelByKey = new Map(attributes.map((attribute) => [attribute.key, attribute.level]));

    const newlyUnlocked = allRewards.filter((reward) => {
      if (unlockedIds.has(reward.id)) return false;
      const currentLevel = reward.attributeKey ? (attributeLevelByKey.get(reward.attributeKey) ?? 0) : user.level;
      return currentLevel >= reward.level;
    });
    if (newlyUnlocked.length === 0) return [];

    await this.prisma.$transaction(
      newlyUnlocked.map((reward) => this.prisma.userLevelReward.create({ data: { userId, levelRewardId: reward.id } })),
    );

    // Per-type effects - "Perks" (STREAK_PROTECTION) and "unlockable quests" (QUEST) actually
    // do something on unlock; TITLE/BADGE/FEATURE_UNLOCK are purely record-keeping (see
    // docs/gameplay-systems.md for why FEATURE_UNLOCK has no functional effect yet).
    for (const reward of newlyUnlocked) {
      if (reward.type === 'STREAK_PROTECTION') {
        // eslint-disable-next-line no-await-in-loop
        await this.prisma.user.update({
          where: { id: userId },
          data: { habitStreakProtectionCharges: { increment: 1 } },
        });
      } else if (reward.type === 'QUEST') {
        // eslint-disable-next-line no-await-in-loop
        await this.createRewardQuest(userId, reward);
      }
    }

    await Promise.all(
      newlyUnlocked.map((reward) =>
        this.notificationsService.create(userId, 'LEVEL_REWARD_UNLOCK', `Reward unlocked: ${reward.name}`, reward.description),
      ),
    );

    return newlyUnlocked;
  }

  /**
   * "Unlockable quests" (Sprint 3): a QUEST-type reward creates one curated
   * quest using the reward's own name/description, reusing the same
   * category (SYSTEM) Sprint 2's neglected-attribute quests use, tagged
   * with one of the user's skills under the reward's attribute if one
   * exists. Always creates the quest even without a skill to tag - unlike
   * ensureSystemQuest's heuristic-driven generation, this is a promised,
   * curated reward for reaching a specific level, not conditional on skill
   * availability.
   */
  private async createRewardQuest(userId: string, reward: LevelReward): Promise<void> {
    let skillId: string | undefined;
    if (reward.attributeKey) {
      const attribute = await this.prisma.attribute.findFirst({ where: { userId, key: reward.attributeKey } });
      if (attribute) {
        const skill = await this.prisma.skill.findFirst({
          where: { userId, attributeId: attribute.id },
          orderBy: { createdAt: 'asc' },
        });
        skillId = skill?.id;
      }
    }

    await this.prisma.quest.create({
      data: {
        userId,
        title: reward.name,
        description: reward.description,
        type: 'ONE_TIME',
        difficulty: 'EPIC',
        category: 'SYSTEM',
        xpReward: DIFFICULTY_XP.EPIC,
        questSkills: skillId ? { create: [{ skillId }] } : undefined,
      },
    });
  }
}
