import { Module } from '@nestjs/common';
import { ProgressionService } from './progression.service';
import { XpModule } from '../xp/xp.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LevelUpNotificationListener } from './listeners/level-up-notification.listener';

@Module({
  imports: [XpModule, AchievementsModule, NotificationsModule],
  providers: [ProgressionService, LevelUpNotificationListener],
  exports: [ProgressionService],
})
export class ProgressionModule {}
