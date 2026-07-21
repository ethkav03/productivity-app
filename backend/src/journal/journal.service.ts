import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getDayKey, endOfDayUtc } from '../common/period';
import { UpsertJournalEntryDto } from './dto/upsert-journal-entry.dto';

const HISTORY_DEFAULT_DAYS = 30;
const CAPACITY_LOOKBACK_DAYS = 3;
const CORRELATION_MIN_SAMPLE = 3;

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Daily Journal" (Sprint 6, Feature 17): the entry itself plus "what was
   * completed and XP earned that day," computed live from the character-level
   * XP ledger rather than duplicated onto the entry - the same
   * derive-don't-duplicate approach used for Goal.progressPercent and
   * Habit.completedToday.
   */
  async getDay(userId: string, date: string) {
    const [entry, stats] = await Promise.all([
      this.prisma.journalEntry.findUnique({ where: { userId_date: { userId, date } } }),
      this.getDayStats(userId, date),
    ]);
    return { entry: entry ?? null, ...stats };
  }

  private async getDayStats(userId: string, date: string) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = endOfDayUtc(start);
    const result = await this.prisma.xPTransaction.aggregate({
      where: { userId, skillId: null, attributeId: null, createdAt: { gte: start, lt: end } },
      _sum: { amount: true },
      _count: true,
    });
    return { activitiesCompleted: result._count, xpEarned: result._sum.amount ?? 0 };
  }

  async upsert(userId: string, date: string, dto: UpsertJournalEntryDto) {
    return this.prisma.journalEntry.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...dto },
      update: { ...dto },
    });
  }

  async history(userId: string, days: number = HISTORY_DEFAULT_DAYS) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    return this.prisma.journalEntry.findMany({
      where: { userId, date: { gte: getDayKey(since) } },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * "Daily Energy / Capacity" (Sprint 6, Feature 15) - a lightweight version:
   * a 0-100 score averaged from the last few days' logged mood/energy, no new
   * model or scheduler. Deliberately not influenced by "workload, training,
   * stress, recovery, momentum" the way the roadmap's full version is - those
   * inputs don't exist as trackable data yet, and guessing a weighting
   * formula without real usage data to validate it would be pure invention.
   * Returns `score: null` until the user has logged at least one of the last
   * few days, rather than defaulting to a made-up number.
   */
  async getCapacity(userId: string) {
    const recent = await this.history(userId, CAPACITY_LOOKBACK_DAYS);
    const values = recent.flatMap((entry) => [entry.mood, entry.energyLevel].filter((v): v is number => v != null));
    if (values.length === 0) {
      return { score: null, daysConsidered: 0 };
    }
    const average = values.reduce((sum, v) => sum + v, 0) / values.length; // 1-5 scale
    const score = Math.round(((average - 1) / 4) * 100); // 1-5 -> 0-100
    return { score, daysConsidered: recent.length };
  }

  /**
   * "Mood and Energy Tracking" (Sprint 6, Feature 18) - a handful of fixed,
   * honest comparisons rather than a general correlation engine: average
   * character XP earned on higher-mood vs lower-mood days, and on
   * more-sleep vs less-sleep days. Presented as observations from the
   * user's own data, not a medical or scientific claim - matching the
   * roadmap's own explicit caution. Any comparison with fewer than
   * CORRELATION_MIN_SAMPLE days on either side is omitted rather than shown
   * with a misleadingly tiny sample.
   */
  async getCorrelations(userId: string) {
    const entries = await this.prisma.journalEntry.findMany({ where: { userId } });
    const xpByDate = await this.xpEarnedByDate(userId, entries.map((e) => e.date));

    const moodComparison = this.compareByThreshold(
      entries.filter((e) => e.mood != null),
      (e) => e.mood! >= 4,
      xpByDate,
    );
    const sleepComparison = this.compareByThreshold(
      entries.filter((e) => e.sleepHours != null),
      (e) => e.sleepHours! >= 7,
      xpByDate,
    );

    return {
      moodVsXp: moodComparison,
      sleepVsXp: sleepComparison,
    };
  }

  private async xpEarnedByDate(userId: string, dates: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    await Promise.all(
      dates.map(async (date) => {
        const stats = await this.getDayStats(userId, date);
        map.set(date, stats.xpEarned);
      }),
    );
    return map;
  }

  private compareByThreshold<T extends { date: string }>(
    entries: T[],
    isHigh: (entry: T) => boolean,
    xpByDate: Map<string, number>,
  ) {
    const high = entries.filter(isHigh);
    const low = entries.filter((e) => !isHigh(e));
    if (high.length < CORRELATION_MIN_SAMPLE || low.length < CORRELATION_MIN_SAMPLE) {
      return null;
    }
    const avg = (rows: T[]) => rows.reduce((sum, r) => sum + (xpByDate.get(r.date) ?? 0), 0) / rows.length;
    return {
      higherGroupAverageXp: Math.round(avg(high)),
      lowerGroupAverageXp: Math.round(avg(low)),
      higherGroupDays: high.length,
      lowerGroupDays: low.length,
    };
  }
}
