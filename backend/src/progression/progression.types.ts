import { LevelRewardType, XPSourceType } from '@prisma/client';
import { AttributeBonus, SkillAward } from '../xp/xp.types';

export interface CompleteActivityParams {
  userId: string;
  amount: number;
  sourceType: XPSourceType;
  sourceId?: string;
  /** The activity's display name (e.g. a quest's title), captured now so it survives the activity being renamed/deleted later. */
  sourceName?: string;
  /** Tagged skills, each optionally overriding `amount` (an "XP Bundle") - see XpService.awardXp. */
  skillAwards?: SkillAward[];
  /** Bonus XP awarded directly to an attribute, independent of any tagged skill. */
  attributeBonuses?: AttributeBonus[];
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
  /** "Level-Up Rewards" (Sprint 3) newly unlocked by this completion - see LevelRewardsService.checkAndUnlock. */
  rewardsUnlocked: Array<{ name: string; type: LevelRewardType }>;
  streak?: { currentStreak: number; longestStreak: number };
  /** Correlates the XPTransaction rows this completion wrote - see XpAwardResult.eventId. */
  eventId: string;
}
