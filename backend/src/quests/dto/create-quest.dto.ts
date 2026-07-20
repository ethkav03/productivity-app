import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QuestDifficulty, QuestType } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AttributeBonusDto, SkillRewardOverrideDto } from '../../common/dto/activity-reward.dto';
import { QuestRequirementDto } from '../../common/dto/quest-requirement.dto';

export class CreateQuestDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: QuestType, default: QuestType.ONE_TIME })
  @IsOptional()
  @IsEnum(QuestType)
  type?: QuestType;

  @ApiPropertyOptional({ enum: QuestDifficulty, default: QuestDifficulty.MEDIUM })
  @IsOptional()
  @IsEnum(QuestDifficulty)
  difficulty?: QuestDifficulty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  xpReward?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  goalId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  skillIds?: string[];

  @ApiPropertyOptional({
    type: [SkillRewardOverrideDto],
    description: '"XP Bundle": per-skill XP override. Every skillId here must also appear in skillIds - a tagged skill not listed here just gets the flat xpReward, as before.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillRewardOverrideDto)
  skillRewardOverrides?: SkillRewardOverrideDto[];

  @ApiPropertyOptional({
    type: [AttributeBonusDto],
    description: '"XP Bundle": bonus XP awarded directly to an attribute, independent of any tagged skill.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeBonusDto)
  attributeBonuses?: AttributeBonusDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  deadline?: string;

  @ApiPropertyOptional({
    type: [QuestRequirementDto],
    description: 'Prerequisites this quest is locked behind until satisfied ("level-gated quests"). Omit for an always-available quest.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestRequirementDto)
  requirements?: QuestRequirementDto[];
}
