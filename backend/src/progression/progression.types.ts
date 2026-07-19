import { XPSourceType } from '@prisma/client';

export interface CompleteActivityParams {
  userId: string;
  amount: number;
  sourceType: XPSourceType;
  sourceId?: string;
  skillIds?: string[];
  note?: string;
  /** Whether this activity counts toward the character's daily activity streak. Defaults to true. */
  updateCharacterStreak?: boolean;
}

export interface CompletionResult {
  xpGained: number;
  levelUp: boolean;
  newLevel: number;
  skillResults: Array<{ skillId: string; leveledUp: boolean; newLevel: number }>;
  attributeResults: Array<{ attributeId: string; leveledUp: boolean; newLevel: number }>;
  achievementsUnlocked: string[];
  streak?: { currentStreak: number; longestStreak: number };
}
