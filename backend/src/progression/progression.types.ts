import { XPSourceType } from '@prisma/client';

export interface CompleteActivityParams {
  userId: string;
  amount: number;
  sourceType: XPSourceType;
  sourceId?: string;
  /** The activity's display name (e.g. a quest's title), captured now so it survives the activity being renamed/deleted later. */
  sourceName?: string;
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
