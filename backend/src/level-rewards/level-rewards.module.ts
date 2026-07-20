import { Module } from '@nestjs/common';
import { LevelRewardsService } from './level-rewards.service';
import { LevelRewardsController } from './level-rewards.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [LevelRewardsController],
  providers: [LevelRewardsService],
  exports: [LevelRewardsService],
})
export class LevelRewardsModule {}
