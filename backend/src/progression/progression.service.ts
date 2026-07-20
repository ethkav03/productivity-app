import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { XpService } from '../xp/xp.service';
import { AchievementsService } from '../achievements/achievements.service';
import { LevelRewardsService } from '../level-rewards/level-rewards.service';
import { getDayKey, nextStreakValue } from '../common/period';
import { CompleteActivityParams, CompletionResult } from './progression.types';
import { ACTIVITY_COMPLETED_EVENT, ActivityCompletedEvent } from './events/activity-completed.event';

/**
 * Orchestrates the full "what happens when a user completes an activity"
 * workflow described in the MVP spec (section 16): award XP, recalculate
 * levels, update the character's daily streak, check achievements, and
 * raise notifications. Quests/Habits/Goals services should call this
 * instead of touching XpService/AchievementsService directly, so the
 * workflow stays centralised in one place.
 *
 * XP, streak, and achievements stay inline here because they feed directly
 * into the `CompletionResult` returned to the caller. Side effects that
 * *don't* need to shape that response (the level-up notification, and any
 * future listener - challenges, seasons, AI analysis, a timeline view) hang
 * off the `ActivityCompletedEvent` emitted at the end instead, via
 * `@nestjs/event-emitter`, so this service doesn't need to know they exist.
 */
@Injectable()
export class ProgressionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
    private readonly achievementsService: AchievementsService,
    private readonly levelRewardsService: LevelRewardsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async completeActivity(params: CompleteActivityParams): Promise<CompletionResult> {
    const xpResult = await this.xpService.awardXp({
      userId: params.userId,
      amount: params.amount,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      skillAwards: params.skillAwards,
      attributeBonuses: params.attributeBonuses,
      note: params.note,
    });

    const streak =
      params.updateCharacterStreak === false
        ? undefined
        : await this.updateCharacterStreak(params.userId);

    const unlockedAchievements = await this.achievementsService.checkAndUnlock(params.userId);
    const unlockedRewards = await this.levelRewardsService.checkAndUnlock(params.userId);

    const result: CompletionResult = {
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
      rewardsUnlocked: unlockedRewards.map((reward) => ({ name: reward.name, type: reward.type })),
      streak,
      eventId: xpResult.eventId,
    };

    this.eventEmitter.emit(
      ACTIVITY_COMPLETED_EVENT,
      new ActivityCompletedEvent(
        params.userId,
        params.sourceType,
        result.xpGained,
        result.levelUp,
        result.newLevel,
        result.achievementsUnlocked,
        new Date(),
        result.eventId,
        params.sourceId,
        params.sourceName,
      ),
    );

    return result;
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
