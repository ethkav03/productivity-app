'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import {
  ArrowLeft,
  CheckSquare,
  Compass,
  Flag,
  History,
  Inbox,
  LucideIcon,
  Repeat,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  User,
} from 'lucide-react';
import { getXpHistory } from '@/lib/api/analytics';
import { getApiErrorMessage } from '@/lib/api-client';
import { XPSourceType, XpHistoryEvent, XpHistoryLineScope } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner, Spinner } from '@/components/ui/spinner';

const PAGE_SIZE = 20;

type SourceFilter = XPSourceType | 'ALL';

const SOURCE_FILTERS: Array<[SourceFilter, string]> = [
  ['ALL', 'All'],
  ['QUEST_COMPLETION', 'Quests'],
  ['HABIT_COMPLETION', 'Habits'],
  ['GOAL_COMPLETION', 'Goals'],
  ['MILESTONE_COMPLETION', 'Milestones'],
  ['ACHIEVEMENT_BONUS', 'Achievements'],
  ['CORRECTION', 'Corrections'],
];

const SOURCE_ICON: Record<XPSourceType, LucideIcon> = {
  QUEST_COMPLETION: CheckSquare,
  HABIT_COMPLETION: Repeat,
  GOAL_COMPLETION: Target,
  MILESTONE_COMPLETION: Flag,
  ACHIEVEMENT_BONUS: Trophy,
  CORRECTION: ShieldCheck,
};

const SCOPE_ICON: Record<XpHistoryLineScope, LucideIcon> = {
  CHARACTER: User,
  SKILL: Sparkles,
  ATTRIBUTE: Compass,
};

function humanizeSourceType(sourceType: XPSourceType): string {
  switch (sourceType) {
    case 'QUEST_COMPLETION':
      return 'Quest completed';
    case 'HABIT_COMPLETION':
      return 'Habit completed';
    case 'GOAL_COMPLETION':
      return 'Goal completed';
    case 'MILESTONE_COMPLETION':
      return 'Milestone completed';
    case 'ACHIEVEMENT_BONUS':
      return 'Achievement bonus';
    case 'CORRECTION':
      return 'Correction';
    default:
      return sourceType;
  }
}

function formatEventDay(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

export default function XpHistoryPage() {
  const [filter, setFilter] = useState<SourceFilter>('ALL');

  const historyQuery = useInfiniteQuery({
    queryKey: ['analytics', 'xp-history', filter],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      getXpHistory({ sourceType: filter === 'ALL' ? undefined : filter, limit: PAGE_SIZE, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1].createdAt : undefined,
  });

  const events = historyQuery.data?.pages.flat() ?? [];

  // group consecutive events by calendar day for the "Today / Yesterday / MMMM d" headers
  const dayGroups: Array<{ day: string; events: XpHistoryEvent[] }> = [];
  for (const event of events) {
    const day = formatEventDay(new Date(event.createdAt));
    const lastGroup = dayGroups[dayGroups.length - 1];
    if (lastGroup && lastGroup.day === day) {
      lastGroup.events.push(event);
    } else {
      dayGroups.push({ day, events: [event] });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/analytics" className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Analytics
        </Link>
        <h1 className="text-xl font-semibold text-foreground">XP History</h1>
        <p className="mt-1 text-sm text-muted">
          Every XP-earning event, with the full character / skill / attribute breakdown.
        </p>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
        {SOURCE_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === value ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {historyQuery.isLoading ? (
        <PageSpinner />
      ) : historyQuery.isError ? (
        <p className="text-sm text-danger">{getApiErrorMessage(historyQuery.error, 'Could not load XP history')}</p>
      ) : events.length === 0 ? (
        <EmptyState icon={Inbox} title="No XP history yet" description="Complete a quest, habit, or goal to see it here." />
      ) : (
        <div className="space-y-6">
          {dayGroups.map((group) => (
            <div key={group.day}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{group.day}</p>
              <Card className="divide-y divide-border p-0">
                {group.events.map((event, index) => (
                  <XpHistoryEventRow key={`${event.createdAt}-${index}`} event={event} />
                ))}
              </Card>
            </div>
          ))}

          {historyQuery.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                loading={historyQuery.isFetchingNextPage}
                onClick={() => historyQuery.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function XpHistoryEventRow({ event }: { event: XpHistoryEvent }) {
  const SourceIcon = SOURCE_ICON[event.sourceType] ?? History;
  const title = event.sourceName ?? humanizeSourceType(event.sourceType);

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-muted">
        <SourceIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <span className="shrink-0 text-xs text-muted">
            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
          </span>
        </div>
        {event.note && event.sourceType === 'CORRECTION' && <p className="mt-0.5 text-xs text-muted">{event.note}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {event.lines.map((line, index) => {
            const ScopeIcon = SCOPE_ICON[line.scope];
            return (
              <Badge key={index} variant={line.amount >= 0 ? 'success' : 'danger'}>
                <ScopeIcon className="h-3 w-3" />
                {line.label} {line.amount >= 0 ? '+' : ''}
                {line.amount} XP
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
