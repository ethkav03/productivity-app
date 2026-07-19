import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { QuestStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateQuestDto } from './create-quest.dto';

export class UpdateQuestDto extends PartialType(CreateQuestDto) {
  @ApiPropertyOptional({ enum: QuestStatus })
  @IsOptional()
  @IsEnum(QuestStatus)
  status?: QuestStatus;
}
