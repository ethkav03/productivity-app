import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';

export class CreateMilestoneDto {
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

  @ApiPropertyOptional({ description: 'Small XP bonus awarded when this milestone is marked complete. Defaults to 0 (a pure checklist item, no XP awarded).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  xpReward?: number;
}
