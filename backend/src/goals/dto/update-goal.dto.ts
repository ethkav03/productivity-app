import { PartialType } from '@nestjs/swagger';
import { GoalStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateGoalDto } from './create-goal.dto';

export class UpdateGoalDto extends PartialType(CreateGoalDto) {
  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;
}
