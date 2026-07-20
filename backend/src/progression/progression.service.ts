import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XpService } from '../xp/xp.service';
import { AchievementsService } from '../achievements/achievements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getDayKey, nextStreakValue } from '../common/period';
import { CompleteActivityParams, CompletionResult } from './progression.types';

/**
 * Orchestrates the full "what happens when a user completes an activity"
 * workflow described in the MVP spec (section 16): award XP, recalculate
 * levels, update the character's daily streak, check achievements, and
 * raise notifications. Quests/Habits/Goals services should call this
 * instead of touching XpService/AchievementsService directly, so the
 * workflow stays centralised in one place.
 */
@Injectable()
export class ProgressionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
    private readonly achievementsService: AchievementsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async completeActivity(params: CompleteActivityParams): Promise<CompletionResult> {
    const xpResult = await this.xpService.awardXp({
      userId: params.userId,
      amount: params.amount,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      skillIds: params.skillIds,
      note: params.note,
    });

    const streak =
      params.updateCharacterStreak === false
        ? undefined
        : await this.updateCharacterStreak(params.userId);

    if (xpResult.character.leveledUp) {
      await this.notificationsService.create(
        params.userId,
        'LEVEL_UP',
        'Level up!',
        `You reached Level ${xpResult.character.newLevel}.`,
      );
    }

    const unlockedAchievements = await this.achievementsService.checkAndUnlock(params.userId);

    return {
      xpGained: xpResult.xpGained,
      levelUp: xpResult.character.leveledUp,
      newLevel: xpResult.character.newLevel,
      skillResults: xpResult.skills.map((skill) => ({
        skillId: skill.skillId,
        leveledUp: skill.leveledUp,
        newLevel: skill.newLevel,
      })),
      attributeResults: xpResult.attributes.map((attribute) => ({
        attributeId: attribute.attributeId,
        leveledUp: attribute.leveledUp,
        newLevel: attribute.newLevel,
      })),
      achievementsUnlocked: unlockedAchievements.map((achievement) => achievement.name),
      streak,
    };
  }

  private async updateCharacterStreak(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const today = getDayKey();
    const previousDayKey = user.lastActivityAt ? getDayKey(user.lastActivityAt) : null;

    const currentStreak = nextStreakValue(previousDayKey, today, user.currentStreak);
    const longestStreak = Math.max(user.longestStreak, currentStreak);

    await this.prisma.user.update({
      where: { id: userId },
      data: { currentStreak, longestStreak, lastActivityAt: new Date() },
    });

    return { currentStreak, longestStreak };
  }
}
