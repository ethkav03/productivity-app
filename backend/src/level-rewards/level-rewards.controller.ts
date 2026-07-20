import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LevelRewardsService } from './level-rewards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('level-rewards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('level-rewards')
export class LevelRewardsController {
  constructor(private readonly levelRewardsService: LevelRewardsService) {}

  @Get()
  findAll() {
    return this.levelRewardsService.findAll();
  }

  @Get('unlocked')
  findUnlocked(@CurrentUser() user: AuthenticatedUser) {
    return this.levelRewardsService.findUnlocked(user.userId);
  }
}
