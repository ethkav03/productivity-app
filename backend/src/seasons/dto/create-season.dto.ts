import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttributeKey } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSeasonDto {
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

  @ApiProperty({ enum: AttributeKey, isArray: true, description: 'Which attributes this season is about - at least one.' })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(AttributeKey, { each: true })
  focus!: AttributeKey[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
