import { AttributeKey } from '@prisma/client';
import { IsEnum, ValidateIf } from 'class-validator';

export enum LeaderboardMetric {
  LEVEL = 'LEVEL',
  ATTRIBUTE = 'ATTRIBUTE',
  XP = 'XP',
}

export enum LeaderboardPeriod {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  YEAR = 'YEAR',
  ALL_TIME = 'ALL_TIME',
}

export class LeaderboardQueryDto {
  @IsEnum(LeaderboardMetric)
  metric: LeaderboardMetric = LeaderboardMetric.LEVEL;

  @ValidateIf((query: LeaderboardQueryDto) => query.metric === LeaderboardMetric.ATTRIBUTE)
  @IsEnum(AttributeKey)
  attributeKey?: AttributeKey;

  @ValidateIf((query: LeaderboardQueryDto) => query.metric === LeaderboardMetric.XP)
  @IsEnum(LeaderboardPeriod)
  period?: LeaderboardPeriod;
}
