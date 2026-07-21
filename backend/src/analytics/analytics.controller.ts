import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { XPSourceType } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

const VALID_XP_SOURCE_TYPES: XPSourceType[] = [
  'QUEST_COMPLETION',
  'HABIT_COMPLETION',
  'GOAL_COMPLETION',
  'ACHIEVEMENT_BONUS',
  'CORRECTION',
];

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.overview(user.userId);
  }

  @Get('xp')
  xp(@CurrentUser() user: AuthenticatedUser, @Query('days') daysParam?: string) {
    const days = Math.min(365, Math.max(1, parseInt(daysParam ?? '30', 10) || 30));
    return this.analyticsService.xpOverTime(user.userId, days);
  }

  @Get('skills')
  skills(@CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.skillProgress(user.userId);
  }

  @Get('attributes')
  attributes(@CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.attributeProgress(user.userId);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthenticatedUser, @Query('days') daysParam?: string) {
    const days = Math.min(365, Math.max(1, parseInt(daysParam ?? '84', 10) || 84));
    return this.analyticsService.activityHeatmap(user.userId, days);
  }

  @Get('feed')
  feed(@CurrentUser() user: AuthenticatedUser, @Query('limit') limitParam?: string) {
    const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '15', 10) || 15));
    return this.analyticsService.feed(user.userId, limit);
  }

  @Get('xp-history')
  xpHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('sourceType') sourceTypeParam?: string,
    @Query('limit') limitParam?: string,
    @Query('before') beforeParam?: string,
  ) {
    const sourceType = VALID_XP_SOURCE_TYPES.includes(sourceTypeParam as XPSourceType)
      ? (sourceTypeParam as XPSourceType)
      : undefined;
    const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '20', 10) || 20));
    const beforeDate = beforeParam && !Number.isNaN(new Date(beforeParam).getTime()) ? new Date(beforeParam) : undefined;
    return this.analyticsService.xpHistory(user.userId, sourceType, limit, beforeDate);
  }

  @Get('timeline')
  timeline(@CurrentUser() user: AuthenticatedUser, @Query('limit') limitParam?: string) {
    const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '50', 10) || 50));
    return this.analyticsService.getTimeline(user.userId, limit);
  }
}
