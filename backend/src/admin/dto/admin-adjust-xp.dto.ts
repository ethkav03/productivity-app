import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttributeKey } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminAdjustXpDto {
  @ApiProperty({ description: 'Can be positive or negative; validated non-zero server-side.' })
  @IsInt()
  amount!: number;

  @ApiPropertyOptional({ enum: AttributeKey, description: 'If set, adjusts this attribute directly instead of the character.' })
  @IsOptional()
  @IsEnum(AttributeKey)
  attributeKey?: AttributeKey;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
