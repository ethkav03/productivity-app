import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AdminGrantAchievementDto {
  @ApiProperty()
  @IsUUID()
  achievementId!: string;
}
