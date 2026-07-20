import { XPSourceType } from '@prisma/client';

export interface SkillAward {
  skillId: string;
  /** Overrides the character-level `amount` for this skill (and its attribute cascade). Omitted means "use `amount`" - the pre-XP-Bundles default. */
  amount?: number;
}

export interface AttributeBonus {
  attributeId: string;
  amount: number;
}

export interface AwardXpParams {
  userId: string;
  amount: number;
  sourceType: XPSourceType;
  sourceId?: string;
  /** The source entity's display name (e.g. a quest's title), captured now so it survives the source being renamed/deleted later. */
  sourceName?: string;
  /** Skills that should receive XP (e.g. a quest's associated skills), each optionally overriding `amount` for an "XP Bundle" - see AttributeBonus for the attribute-only equivalent. */
  skillAwards?: SkillAward[];
  /** Bonus XP awarded directly to an attribute, independent of any tagged skill - e.g. a workout quest also crediting Discipline for showing up. */
  attributeBonuses?: AttributeBonus[];
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

export interface ApplyCorrectionParams {
  userId: string;
  /** Can be positive or negative, but not zero. */
  amount: number;
  note?: string;
  sourceName?: string;
  /** If set, the correction targets this attribute directly instead of the character. */
  attributeId?: string;
}

export interface CorrectionResult extends LevelChangeResult {
  scope: 'CHARACTER' | 'ATTRIBUTE';
  attributeId?: string;
  totalXP: number;
}
