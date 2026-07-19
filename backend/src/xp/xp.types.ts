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

export interface AttributeXpResult extends LevelChangeResult {
  attributeId: string;
}

export interface XpAwardResult {
  xpGained: number;
  character: LevelChangeResult;
  skills: SkillXpResult[];
  /**
   * One entry per skill in `skills` (not deduplicated by attribute) - if two
   * associated skills share an attribute, that attribute is awarded XP
   * twice, mirroring how each skill itself gets the full XP amount.
   */
  attributes: AttributeXpResult[];
}
