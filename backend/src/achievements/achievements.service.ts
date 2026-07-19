import { Injectable } from '@nestjs/common';
import { Achievement, User, XPSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AchievementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  findAll() {
    return this.prisma.achievement.findMany({ orderBy: { requirementValue: 'asc' } });
  }

  findUnlocked(userId: string) {
    return this.prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: { unlockedAt: 'desc' },
    });
  }

  /**
   * Evaluates every achievement the user hasn't unlocked yet against their
   * current stats and unlocks any whose condition is now met. Conditions are
   * data-driven (queried from live state / the XP ledger) rather than
   * hard-coded per achievement, so new achievements can be added purely as
   * data.
   */
  async checkAndUnlock(userId: string): Promise<Achievement[]> {
    const [user, unlockedRows, allAchievements] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
      this.prisma.achievement.findMany(),
    ]);

    const unlockedIds = new Set(unlockedRows.map((row) => row.achievementId));
    const candidates = allAchievements.filter((achievement) => !unlockedIds.has(achievement.id));
    if (candidates.length === 0) return [];

    const newlyUnlocked: Achievement[] = [];
    for (const achievement of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.isConditionMet(userId, user, achievement)) {
        newlyUnlocked.push(achievement);
      }
    }

    if (newlyUnlocked.length === 0) return [];

    await this.prisma.$transaction(
      newlyUnlocked.map((achievement) =>
        this.prisma.userAchievement.create({ data: { userId, achievementId: achievement.id } }),
      ),
    );

    await Promise.all(
      newlyUnlocked.map((achievement) =>
        this.notificationsService.create(
          userId,
          'ACHIEVEMENT_UNLOCK',
          `Achievement unlocked: ${achievement.name}`,
          achievement.description,
        ),
      ),
    );

    return newlyUnlocked;
  }

  private async isConditionMet(userId: string, user: User, achievement: Achievement): Promise<boolean> {
    switch (achievement.requirementType) {
      case 'LEVEL_REACHED':
        return user.level >= achievement.requirementValue;
      case 'STREAK_LENGTH':
        return user.longestStreak >= achievement.requirementValue;
      case 'QUESTS_COMPLETED':
        return (await this.countCompletions(userId, 'QUEST_COMPLETION')) >= achievement.requirementValue;
      case 'HABITS_COMPLETED':
        return (await this.countCompletions(userId, 'HABIT_COMPLETION')) >= achievement.requirementValue;
      case 'GOALS_COMPLETED':
        return (await this.countCompletions(userId, 'GOAL_COMPLETION')) >= achievement.requirementValue;
      case 'GOALS_CREATED':
        return (await this.prisma.goal.count({ where: { userId } })) >= achievement.requirementValue;
      case 'SKILL_LEVEL_REACHED': {
        if (!achievement.skillName) return false;
        const skill = await this.prisma.skill.findFirst({
          where: { userId, name: achievement.skillName },
        });
        return (skill?.level ?? 0) >= achievement.requirementValue;
      }
      case 'SKILL_ACTIVITY_COUNT': {
        if (!achievement.skillName) return false;
        const skill = await this.prisma.skill.findFirst({
          where: { userId, name: achievement.skillName },
        });
        if (!skill) return false;
        const count = await this.prisma.xPTransaction.count({ where: { userId, skillId: skill.id } });
        return count >= achievement.requirementValue;
      }
      default:
        return false;
    }
  }

  private countCompletions(userId: string, sourceType: XPSourceType) {
    // skillId: null isolates the one character-level ledger row per
    // completion event, so multi-skill quests/habits aren't over-counted.
    return this.prisma.xPTransaction.count({ where: { userId, sourceType, skillId: null } });
  }
}
