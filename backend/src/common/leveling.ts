/**
 * Shared leveling formula used for both the character and individual skills.
 * XP required to go from `level` to `level + 1` is `100 * level` (per MVP spec section 5).
 */
export function xpRequiredForLevel(level: number): number {
  return 100 * level;
}

export interface LevelState {
  level: number;
  currentLevelXp: number;
  xpForNextLevel: number;
}

/**
 * Derives level state from a cumulative XP total. Levels are recomputed from
 * scratch on every award rather than incremented, so the result is always
 * consistent even if XP is corrected via a later transaction.
 */
export function calculateLevelState(totalXp: number): LevelState {
  let level = 1;
  let remaining = Math.max(0, totalXp);

  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level);
    level += 1;
  }

  return {
    level,
    currentLevelXp: remaining,
    xpForNextLevel: xpRequiredForLevel(level),
  };
}

export const DIFFICULTY_XP: Record<string, number> = {
  EASY: 25,
  MEDIUM: 50,
  HARD: 100,
  EPIC: 250,
  LEGENDARY: 500,
};
