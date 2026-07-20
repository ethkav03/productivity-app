import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { QuestRequirementType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * A single prerequisite a quest must satisfy before it can be completed
 * ("level-gated quests"). Only the fields relevant to `type` should be set -
 * QuestsService.validateRequirements enforces which combination is required
 * per type (business rule, not a decorator-level shape check, since which
 * fields are "required" depends on another field's value).
 */
export class QuestRequirementDto {
  @ApiProperty({ enum: QuestRequirementType })
  @IsEnum(QuestRequirementType)
  type!: QuestRequirementType;

  /** LEVEL_THRESHOLD: the skill whose level to check (omit for character-level). ACTIVITY_COUNT: the skill to count activities for (required). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  skillId?: string;

  /** LEVEL_THRESHOLD: the attribute whose level to check (omit for character-level; mutually exclusive with skillId). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  attributeId?: string;

  /** LEVEL_THRESHOLD target level. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  /** ACTIVITY_COUNT target count. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;

  /** ACHIEVEMENT: the achievement that must be unlocked. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  achievementId?: string;

  /** QUEST_COMPLETED: a specific other quest that must be completed - not "any quest". */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requiredQuestId?: string;

  /** GOAL_COMPLETED: a specific goal that must be completed - not "any goal". */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requiredGoalId?: string;
}
