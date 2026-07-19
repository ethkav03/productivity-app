import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateLevelState } from '../common/leveling';
import { getDayKey } from '../common/period';

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
      where: { userId, skillId: null, createdAt: { gte: weekAgo } },
      _sum: { amount: true },
    });

    const activitiesCompleted = await this.prisma.xPTransaction.count({
      where: { userId, skillId: null, sourceType: { in: [...COMPLETION_SOURCE_TYPES] } },
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
      where: { userId, skillId: null, createdAt: { gte: rangeStart } },
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
    const skills = await this.prisma.skill.findMany({ where: { userId }, orderBy: { name: 'asc' } });

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
      level: s.level,
      totalXP: s.totalXP,
      weeklyXP: weeklyMap.get(s.id) ?? 0,
    }));
  }

  async activityHeatmap(userId: string, days: number) {
    const rangeStart = rangeStartForDays(days);

    const rows = await this.prisma.xPTransaction.findMany({
      where: {
        userId,
        skillId: null,
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
      where: { userId, skillId: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const questIds = [...new Set(rows.filter((r) => r.sourceType === 'QUEST_COMPLETION' && r.sourceId).map((r) => r.sourceId as string))];
    const habitIds = [...new Set(rows.filter((r) => r.sourceType === 'HABIT_COMPLETION' && r.sourceId).map((r) => r.sourceId as string))];
    const goalIds = [...new Set(rows.filter((r) => r.sourceType === 'GOAL_COMPLETION' && r.sourceId).map((r) => r.sourceId as string))];

    const [quests, habits, goals] = await Promise.all([
      questIds.length
        ? this.prisma.quest.findMany({ where: { id: { in: questIds } }, select: { id: true, title: true } })
        : Promise.resolve([]),
      habitIds.length
        ? this.prisma.habit.findMany({ where: { id: { in: habitIds } }, select: { id: true, title: true } })
        : Promise.resolve([]),
      goalIds.length
        ? this.prisma.goal.findMany({ where: { id: { in: goalIds } }, select: { id: true, title: true } })
        : Promise.resolve([]),
    ]);

    const questTitleById = new Map(quests.map((q) => [q.id, q.title]));
    const habitTitleById = new Map(habits.map((h) => [h.id, h.title]));
    const goalTitleById = new Map(goals.map((g) => [g.id, g.title]));

    return rows.map((row) => {
      let sourceTitle: string | null = null;
      if (row.sourceId) {
        if (row.sourceType === 'QUEST_COMPLETION') sourceTitle = questTitleById.get(row.sourceId) ?? null;
        else if (row.sourceType === 'HABIT_COMPLETION') sourceTitle = habitTitleById.get(row.sourceId) ?? null;
        else if (row.sourceType === 'GOAL_COMPLETION') sourceTitle = goalTitleById.get(row.sourceId) ?? null;
      }
      return { ...row, sourceTitle };
    });
  }
}
