import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChallengesService } from './challenges.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('challenges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get()
  getActive(@CurrentUser() user: AuthenticatedUser) {
    return this.challengesService.getActive(user.userId);
  }
}
