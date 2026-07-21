'use client';

import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { BookOpen, Gift, History, Hourglass, LucideIcon, Sparkles, Swords, Target, Trophy } from 'lucide-react';
import { getAnalyticsTimeline } from '@/lib/api/analytics';
import { TimelineEvent, TimelineEventType } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';

const EVENT_ICON: Record<TimelineEventType, LucideIcon> = {
  ACHIEVEMENT: Trophy,
  LEVEL_REWARD: Gift,
  GOAL_COMPLETED: Target,
  SEASON_CLOSED: Hourglass,
  NOTABLE_QUEST: Swords,
  MEMORY: BookOpen,
  LEVEL_UP: Sparkles,
};

const EVENT_LABEL: Record<TimelineEventType, string> = {
  ACHIEVEMENT: 'Achievement',
  LEVEL_REWARD: 'Level Reward',
  GOAL_COMPLETED: 'Goal Completed',
  SEASON_CLOSED: 'Season Closed',
  NOTABLE_QUEST: 'Epic Quest',
  MEMORY: 'Memory',
  LEVEL_UP: 'Level Up',
};

const EVENT_BADGE_VARIANT: Record<TimelineEventType, 'primary' | 'accent' | 'success' | 'warning' | 'outline'> = {
  ACHIEVEMENT: 'accent',
  LEVEL_REWARD: 'accent',
  GOAL_COMPLETED: 'success',
  SEASON_CLOSED: 'outline',
  NOTABLE_QUEST: 'warning',
  MEMORY: 'outline',
  LEVEL_UP: 'primary',
};

function groupEventsByDay(events: TimelineEvent[]) {
  const groups: Array<{ label: string; events: TimelineEvent[] }> = [];
  for (const event of events) {
    const label = format(new Date(event.date), 'MMMM d, yyyy');
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.events.push(event);
    } else {
      groups.push({ label, events: [event] });
    }
  }
  return groups;
}

export default function TimelinePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'timeline'],
    queryFn: () => getAnalyticsTimeline(75),
  });

  const events = data ?? [];
  const groups = groupEventsByDay(events);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Life Timeline</h1>
        <p className="mt-1 text-sm text-muted">Every milestone, in one chronological story.</p>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <p className="text-sm text-danger">Could not load your timeline.</p>
      ) : events.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing here yet"
          description="Unlock achievements, complete goals, close seasons, or jot down journal memories to start building your story."
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-3 text-sm font-semibold text-foreground">{group.label}</h2>
              <div className="space-y-2">
                {group.events.map((event, index) => {
                  const Icon = EVENT_ICON[event.type];
                  return (
                    <Card key={`${group.label}-${index}`} className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{event.title}</p>
                          <Badge variant={EVENT_BADGE_VARIANT[event.type]}>{EVENT_LABEL[event.type]}</Badge>
                        </div>
                        {event.description && <p className="mt-0.5 text-xs text-muted">{event.description}</p>}
                        <p className="mt-1 text-xs text-muted">
                          {formatDistanceToNow(new Date(event.date), { addSuffix: true })}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
