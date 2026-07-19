/**
 * Streak/period helpers shared by habit and character-level streak tracking.
 *
 * Every habit completion is keyed by calendar day (UTC) regardless of the
 * habit's frequency - this is what the HabitCompletion.periodKey unique
 * constraint uses to stop a habit awarding XP twice on the same day. Streaks
 * are "consecutive calendar days on which the habit was completed", which
 * keeps the MVP simple and avoids punishing users differently depending on
 * frequency type (see MVP spec section 9: streaks should not be punitive).
 */
export function getDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export function daysBetweenKeys(previousKey: string, currentKey: string): number {
  const previous = new Date(`${previousKey}T00:00:00.000Z`).getTime();
  const current = new Date(`${currentKey}T00:00:00.000Z`).getTime();
  return Math.round((current - previous) / (1000 * 60 * 60 * 24));
}

/**
 * Given the day key of the last recorded activity and the day key of a new
 * activity, returns the streak that should result.
 */
export function nextStreakValue(
  previousDayKey: string | null,
  newDayKey: string,
  previousStreak: number,
): number {
  if (!previousDayKey) return 1;
  const diff = daysBetweenKeys(previousDayKey, newDayKey);
  if (diff === 0) return previousStreak || 1; // same day, no-op
  if (diff === 1) return previousStreak + 1; // consecutive day
  return 1; // streak broken, restart
}
