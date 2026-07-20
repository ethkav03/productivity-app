import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

/** "XP Bundles": overrides a quest/habit/goal's flat xpReward for one specific tagged skill. Shared across quests/habits/goals - identical validation for all three. */
export class SkillRewardOverrideDto {
  @ApiProperty()
  @IsUUID()
  skillId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  amount!: number;
}

/** "XP Bundles": bonus XP awarded directly to an attribute, independent of any tagged skill. */
export class AttributeBonusDto {
  @ApiProperty()
  @IsUUID()
  attributeId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  amount!: number;
}
