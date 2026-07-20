import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { GoalType } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AttributeBonusDto, SkillRewardOverrideDto } from '../../common/dto/activity-reward.dto';

export class CreateGoalDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ enum: GoalType })
  @IsOptional()
  @IsEnum(GoalType)
  type?: GoalType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  targetDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  xpReward?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  skillIds?: string[];

  @ApiPropertyOptional({
    type: [SkillRewardOverrideDto],
    description: '"XP Bundle": per-skill XP override. Every skillId here must also appear in skillIds.',
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
}
