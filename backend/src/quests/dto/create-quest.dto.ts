import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  deadline?: string;
}
