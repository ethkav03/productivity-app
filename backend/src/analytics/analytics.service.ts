import { Injectable } from '@nestjs/common';
import { XPSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculateLevelState } from '../common/leveling';
import { getDayKey } from '../common/period';
import { ATTRIBUTE_KEY_ORDER } from '../attributes/default-attributes';

const COMPLETION_SOURCE_TYPES = ['QUEST_COMPLETION', 'HABIT_COMPLETION', 'GOAL_COMPLETION'] as const;

/** Builds an ascending array of YYYY-MM-DD day keys from `rangeStart` through today (inclusive). */
function buildDayRange(rangeStart: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(rangeStart);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= today.getTime()) {
    keys.push(getDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

function rangeStartForDays(days: number): Date {
  const rangeStart = new Date();
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (days - 1));
  rangeStart.setUTCHours(0, 0, 0, 0);
  return rangeStart;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const { currentLevelXp, xpForNextLevel } = calculateLevelState(user.totalXP);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const xpThisWeekAgg = await this.prisma.xPTransaction.aggregate({
      where: { userId, skillId: null, attributeId: null, createdAt: { gte: weekAgo } },
      _sum: { amount: true },
    });

    const activitiesCompleted = await this.prisma.xPTransaction.count({
      where: { userId, skillId: null, attributeId: null, sourceType: { in: [...COMPLETION_SOURCE_TYPES] } },
    });

    const topSkillGroup = await this.prisma.xPTransaction.groupBy({
      by: ['skillId'],
      where: { userId, skillId: { not: null }, createdAt: { gte: weekAgo } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 1,
    });

    let mostImprovedSkill: string | null = null;
    if (topSkillGroup.length && topSkillGroup[0].skillId) {
      const skill = await this.prisma.skill.findUnique({ where: { id: topSkillGroup[0].skillId } });
      mostImprovedSkill = skill?.name ?? null;
    }

    return {
      level: user.level,
      currentXP: currentLevelXp,
      xpForNextLevel,
      totalXP: user.totalXP,
      xpThisWeek: xpThisWeekAgg._sum.amount ?? 0,
      activitiesCompleted,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      mostImprovedSkill,
    };
  }

  async xpOverTime(userId: string, days: number) {
    const rangeStart = rangeStartForDays(days);

    const rows = await this.prisma.xPTransaction.findMany({
      where: { userId, skillId: null, attributeId: null, createdAt: { gte: rangeStart } },
      select: { amount: true, createdAt: true },
    });

    const totalsByDay = new Map<string, number>();
    for (const row of rows) {
      const key = getDayKey(row.createdAt);
      totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + row.amount);
    }

    return buildDayRange(rangeStart).map((date) => ({ date, amount: totalsByDay.get(date) ?? 0 }));
  }

  async skillProgress(userId: string) {
    const skills = await this.prisma.skill.findMany({
      where: { userId },
      include: { attribute: { select: { key: true } } },
      orderBy: { name: 'asc' },
    });

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyAgg = await this.prisma.xPTransaction.groupBy({
      by: ['skillId'],
      where: { userId, skillId: { in: skills.map((s) => s.id) }, createdAt: { gte: weekAgo } },
      _sum: { amount: true },
    });
    const weeklyMap = new Map(weeklyAgg.map((row) => [row.skillId, row._sum.amount ?? 0]));

    return skills.map((s) => ({
      skillId: s.id,
      name: s.name,
      attributeKey: s.attribute.key,
      level: s.level,
      totalXP: s.totalXP,
      weeklyXP: weeklyMap.get(s.id) ?? 0,
    }));
  }

  async attributeProgress(userId: string) {
    const attributes = await this.prisma.attribute.findMany({ where: { userId } });
    // Row order from Postgres is not guaranteed absent an ORDER BY - sort to the same
    // fixed attribute order used everywhere else (Skills page, onboarding, this order
    // is also what the dashboard radar chart's axes rely on for a stable shape).
    attributes.sort((a, b) => ATTRIBUTE_KEY_ORDER.indexOf(a.key) - ATTRIBUTE_KEY_ORDER.indexOf(b.key));

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyAgg = await this.prisma.xPTransaction.groupBy({
      by: ['attributeId'],
      where: { userId, attributeId: { in: attributes.map((a) => a.id) }, createdAt: { gte: weekAgo } },
      _sum: { amount: true },
    });
    const weeklyMap = new Map(weeklyAgg.map((row) => [row.attributeId, row._sum.amount ?? 0]));

    return attributes.map((a) => ({
      attributeId: a.id,
      key: a.key,
      name: a.name,
      icon: a.icon,
      level: a.level,
      totalXP: a.totalXP,
      weeklyXP: weeklyMap.get(a.id) ?? 0,
    }));
  }

  async activityHeatmap(userId: string, days: number) {
    const rangeStart = rangeStartForDays(days);

    const rows = await this.prisma.xPTransaction.findMany({
      where: {
        userId,
        skillId: null,
        attributeId: null,
        sourceType: { in: [...COMPLETION_SOURCE_TYPES] },
        createdAt: { gte: rangeStart },
      },
      select: { createdAt: true },
    });

    const countsByDay = new Map<string, number>();
    for (const row of rows) {
      const key = getDayKey(row.createdAt);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    return buildDayRange(rangeStart).map((date) => ({ date, count: countsByDay.get(date) ?? 0 }));
  }

  async feed(userId: string, limit: number) {
    const rows = await this.prisma.xPTransaction.findMany({
      where: { userId, skillId: null, attributeId: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // sourceName is captured at write time (XpService.awardXp), so this no
    // longer needs a live join against quest/habit/goal tables - a row's
    // label survives its source being renamed or deleted later. Exposed as
    // `sourceTitle` for API/frontend backward compatibility.
    return rows.map((row) => ({ ...row, sourceTitle: row.sourceName ?? null }));
  }

  /**
   * A dedicated, groupable XP history: every `XPTransaction` row written by
   * one `XpService.awardXp`/`applyCorrection` call carries the same
   * `eventId` (generated once per call), so they can be reconstructed as
   * "one event" - the character row plus every skill/attribute mirror row it
   * cascaded into. `createdAt` is NOT a safe grouping key on its own -
   * Prisma evaluates `@default(now())` per statement, so sibling rows from
   * one call can differ by a few milliseconds.
   *
   * Rows written before `eventId` existed are nullable and treated as their
   * own singleton group (keyed by their own row id) rather than guessed at
   * via a time-proximity heuristic.
   *
   * Grouping happens in application code rather than via a DB-level
   * `distinct`, because `distinct` collapses ALL null-`eventId` rows into a
   * single row (SQL treats NULL = NULL as equal for grouping), which would
   * make pre-migration history disappear. This means the raw fetch takes a
   * multiple of `limit` as a buffer to account for grouping reducing the row
   * count - generous for the common case (a handful of tagged skills per
   * activity), but an event with an unusually large number of tagged skills
   * could in theory still push a page below the requested `limit`.
   */
  async xpHistory(userId: string, sourceType: XPSourceType | undefined, limit: number, before?: Date) {
    const rawTake = Math.min(300, Math.max(limit * 10, 50));

    const rows = await this.prisma.xPTransaction.findMany({
      where: {
        userId,
        ...(sourceType ? { sourceType } : {}),
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      include: {
        skill: { select: { name: true } },
        attribute: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: rawTake,
    });

    const groups = new Map<string, typeof rows>();
    const groupOrder: string[] = [];
    for (const row of rows) {
      const key = row.eventId ?? row.id;
      const existing = groups.get(key);
      if (existing) {
        existing.push(row);
      } else {
        groups.set(key, [row]);
        groupOrder.push(key);
      }
    }

    return groupOrder.slice(0, limit).map((key) => {
      const group = groups.get(key) as typeof rows;
      const anchor = group.find((row) => !row.skillId && !row.attributeId) ?? group[0];
      const latestCreatedAt = group.reduce((max, row) => (row.createdAt > max ? row.createdAt : max), group[0].createdAt);

      return {
        createdAt: latestCreatedAt,
        sourceType: anchor.sourceType,
        sourceId: anchor.sourceId,
        sourceName: anchor.sourceName,
        note: anchor.note,
        lines: group.map((row) => ({
          scope: row.skillId ? ('SKILL' as const) : row.attributeId ? ('ATTRIBUTE' as const) : ('CHARACTER' as const),
          label: row.skill?.name ?? row.attribute?.name ?? 'Character',
          amount: row.amount,
        })),
      };
    });
  }

  /**
   * "Life Timeline" (Sprint 6, Feature 19): a chronological feed of notable
   * moments, merged from six sources that otherwise live in unrelated
   * tables - deliberately *not* every quest/habit completion (that's what
   * `xpHistory`/`feed` already show; this is about milestones, not the
   * routine ledger). Each source is fetched independently (capped at
   * `limit` rows each) then merged and re-sorted, so an unusually dense
   * source can't starve the others out at the query level - the tradeoff is
   * that a single very active source could still push an older item from a
   * quieter source below the final `limit` after merging.
   */
  async getTimeline(userId: string, limit: number) {
    const [achievements, levelRewards, goals, seasons, notableQuests, memories, levelUps] = await Promise.all([
      this.prisma.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
        take: limit,
      }),
      this.prisma.userLevelReward.findMany({
        where: { userId },
        include: { levelReward: true },
        orderBy: { unlockedAt: 'desc' },
        take: limit,
      }),
      this.prisma.goal.findMany({
        where: { userId, status: 'COMPLETED', completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: limit,
      }),
      this.prisma.season.findMany({
        where: { userId, status: 'COMPLETED', closedAt: { not: null } },
        orderBy: { closedAt: 'desc' },
        take: limit,
      }),
      this.prisma.questCompletion.findMany({
        where: { userId, claimedAt: { not: null }, quest: { difficulty: { in: ['EPIC', 'LEGENDARY'] } } },
        include: { quest: { select: { title: true, difficulty: true } } },
        orderBy: { completedAt: 'desc' },
        take: limit,
      }),
      this.prisma.journalEntry.findMany({
        where: { userId, note: { not: null } },
        orderBy: { date: 'desc' },
        take: limit,
      }),
      this.reconstructLevelUps(userId, limit),
    ]);

    const events = [
      ...achievements.map((row) => ({
        type: 'ACHIEVEMENT' as const,
        date: row.unlockedAt,
        title: row.achievement.name,
        description: row.achievement.description as string | null,
      })),
      ...levelRewards.map((row) => ({
        type: 'LEVEL_REWARD' as const,
        date: row.unlockedAt,
        title: row.levelReward.name,
        description: row.levelReward.description as string | null,
      })),
      ...goals.map((row) => ({
        type: 'GOAL_COMPLETED' as const,
        date: row.completedAt as Date,
        title: row.title,
        description: null as string | null,
      })),
      ...seasons.map((row) => ({
        type: 'SEASON_CLOSED' as const,
        date: row.closedAt as Date,
        title: row.title,
        description: row.endLevel != null ? `Reached Character Level ${row.endLevel}` : null,
      })),
      ...notableQuests.map((row) => ({
        type: 'NOTABLE_QUEST' as const,
        date: row.completedAt,
        title: row.quest.title,
        description: row.quest.difficulty,
      })),
      ...memories.map((row) => ({
        type: 'MEMORY' as const,
        date: new Date(`${row.date}T12:00:00.000Z`),
        title: row.note as string,
        description: null as string | null,
      })),
      ...levelUps.map((row) => ({
        type: 'LEVEL_UP' as const,
        date: row.date,
        title: `Reached Character Level ${row.level}`,
        description: null as string | null,
      })),
    ];

    events.sort((a, b) => b.date.getTime() - a.date.getTime());
    return events.slice(0, limit);
  }

  /**
   * Character level-ups have no dedicated stored event - levels are always
   * recomputed from cumulative XP, never persisted as a history (see
   * `calculateLevelState`). Reconstructs approximate level-up timestamps by
   * replaying character-level XPTransaction rows (skillId/attributeId both
   * null) in chronological order and recording the moment the running total
   * crosses each level threshold. Scoped to the character only, not the 8
   * attributes too - see the deliberate-deviation note in
   * `docs/feature-roadmap.md` § "Feature 19".
   */
  private async reconstructLevelUps(userId: string, limit: number) {
    const rows = await this.prisma.xPTransaction.findMany({
      where: { userId, skillId: null, attributeId: null, amount: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
      select: { amount: true, createdAt: true },
    });

    const events: Array<{ date: Date; level: number }> = [];
    let cumulative = 0;
    let lastLevel = 1;
    for (const row of rows) {
      cumulative += row.amount;
      const { level } = calculateLevelState(cumulative);
      if (level > lastLevel) {
        events.push({ date: row.createdAt, level });
        lastLevel = level;
      }
    }

    return events.slice(-limit).reverse();
  }
}
