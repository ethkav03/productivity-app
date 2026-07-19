import { XPSourceType } from '@prisma/client';

export interface AwardXpParams {
  userId: string;
  amount: number;
  sourceType: XPSourceType;
  sourceId?: string;
  /** Skills that should receive the same XP amount as the character (e.g. a quest's associated skills). */
  skillIds?: string[];
  note?: string;
}

export interface LevelChangeResult {
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

export interface SkillXpResult extends LevelChangeResult {
  skillId: string;
}

export interface XpAwardResult {
  xpGained: number;
  character: LevelChangeResult;
  skills: SkillXpResult[];
}
