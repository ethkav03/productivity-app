import { LeaderboardPeriod } from './dto/leaderboard-query.dto';

/**
 * Calendar-aligned period start for the "most XP earned" leaderboard filter,
 * deliberately different from the rolling-7-day window `AnalyticsService`
 * uses for personal stats: a competitive/resettable leaderboard reads more
 * naturally as "this calendar week/month/year" than "the last N days".
 * Returns null for ALL_TIME (unbounded - callers should use User.totalXP
 * directly rather than summing transactions).
 */
export function periodStart(period: LeaderboardPeriod, now: Date = new Date()): Date | null {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);

  switch (period) {
    case LeaderboardPeriod.DAY:
      return start;
    case LeaderboardPeriod.WEEK: {
      const day = start.getUTCDay(); // 0=Sun..6=Sat
      const diffToMonday = (day + 6) % 7;
      start.setUTCDate(start.getUTCDate() - diffToMonday);
      return start;
    }
    case LeaderboardPeriod.MONTH:
      start.setUTCDate(1);
      return start;
    case LeaderboardPeriod.YEAR:
      start.setUTCMonth(0, 1);
      return start;
    case LeaderboardPeriod.ALL_TIME:
    default:
      return null;
  }
}
