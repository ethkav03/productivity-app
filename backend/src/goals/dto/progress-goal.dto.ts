import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class ProgressGoalDto {
  @ApiProperty()
  @IsNumber()
  value!: number;
}
