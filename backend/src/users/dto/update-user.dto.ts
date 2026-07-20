import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(24)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'username may only contain letters, numbers and underscores' })
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  avatar?: string;

  /** A TITLE-type LevelReward the caller has unlocked, or null to unequip. Omit to leave unchanged. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  equippedTitleId?: string | null;
}
