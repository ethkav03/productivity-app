import { XPSourceType } from '@prisma/client';

export const ACTIVITY_COMPLETED_EVENT = 'activity.completed';

/**
 * Fired once per `ProgressionService.completeActivity` call, after XP, streak,
 * and achievements have already been resolved (those feed directly into
 * `CompletionResult` and stay inline - this event is for side effects that
 * don't need to block or shape the HTTP response). Carries everything a
 * listener would otherwise have to re-derive, so future subscribers
 * (challenges, seasons, AI analysis, a timeline view, ...) can react to
 * completions without `ProgressionService` knowing they exist.
 */
export class ActivityCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly sourceType: XPSourceType,
    public readonly xpGained: number,
    public readonly levelUp: boolean,
    public readonly newLevel: number,
    public readonly achievementsUnlocked: string[],
    public readonly completedAt: Date,
    public readonly sourceId?: string,
    public readonly sourceName?: string,
  ) {}
}
