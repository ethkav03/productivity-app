import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../../notifications/notifications.service';
import { ACTIVITY_COMPLETED_EVENT, ActivityCompletedEvent } from '../events/activity-completed.event';

/**
 * Reacts to `ActivityCompletedEvent` instead of `ProgressionService` calling
 * `NotificationsService` inline - a level-up notification is a pure side
 * effect that never feeds back into `CompletionResult`, so it's safe to move
 * off the synchronous completion path entirely.
 */
@Injectable()
export class LevelUpNotificationListener {
  private readonly logger = new Logger(LevelUpNotificationListener.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent(ACTIVITY_COMPLETED_EVENT)
  async handleActivityCompleted(event: ActivityCompletedEvent): Promise<void> {
    if (!event.levelUp) return;

    try {
      await this.notificationsService.create(
        event.userId,
        'LEVEL_UP',
        'Level up!',
        `You reached Level ${event.newLevel}.`,
      );
    } catch (error) {
      this.logger.error(`Failed to create level-up notification for user ${event.userId}`, error);
    }
  }
}
