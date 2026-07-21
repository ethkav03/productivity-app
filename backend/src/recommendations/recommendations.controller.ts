import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get()
  getRecommendations(@CurrentUser() user: AuthenticatedUser) {
    return this.recommendationsService.getRecommendations(user.userId);
  }

  @Get('weekly-review')
  getWeeklyReview(@CurrentUser() user: AuthenticatedUser) {
    return this.recommendationsService.getWeeklyReview(user.userId);
  }
}
