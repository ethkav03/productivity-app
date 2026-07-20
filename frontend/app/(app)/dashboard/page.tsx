'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { CheckCircle2, Circle, Flame, Sparkles, Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCelebration } from '@/hooks/use-celebration';
import { completeHabit, getHabits } from '@/lib/api/habits';
import { claimQuestReward, completeQuest, getQuests } from '@/lib/api/quests';
import { getGoals } from '@/lib/api/goals';
import { getUnlockedAchievements } from '@/lib/api/achievements';
import { getAnalyticsAttributes, getAnalyticsFeed } from '@/lib/api/analytics';
import { attributeColor } from '@/lib/attribute-colors';
import { AttributeDots } from '@/components/ui/attribute-dots';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner, Spinner } from '@/components/ui/spinner';
import { AttributeKey, CompletionResult, Habit, Quest } from '@/lib/types';

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const celebrate = useCelebration();
  const queryClient = useQueryClient();

  const habitsQuery = useQuery({ queryKey: ['habits'], queryFn: getHabits });
  const activeQuestsQuery = useQuery({
    queryKey: ['quests', 'ACTIVE'],
    queryFn: () => getQuests({ status: 'ACTIVE' }),
  });
  const activeGoalsQuery = useQuery({
    queryKey: ['goals', 'ACTIVE'],
    queryFn: () => getGoals({ status: 'ACTIVE' }),
  });
  const unlockedAchievementsQuery = useQuery({
    queryKey: ['achievements', 'unlocked'],
    queryFn: getUnlockedAchievements,
  });
  const feedQuery = useQuery({ queryKey: ['analytics', 'feed'], queryFn: () => getAnalyticsFeed(8) });

  async function handleCompletionSuccess(result: CompletionResult) {
    queryClient.invalidateQueries({ queryKey: ['habits'] });
    queryClient.invalidateQueries({ queryKey: ['quests'] });
    queryClient.invalidateQueries({ queryKey: ['achievements'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
    await refreshUser();
    celebrate(result);
  }

  const completeHabitMutation = useMutation({
    mutationFn: completeHabit,
    onSuccess: handleCompletionSuccess,
  });

  const completeQuestMutation = useMutation({
    mutationFn: completeQuest,
    onSuccess: () => {
      // Completing alone doesn't award XP - "Claim Reward" does (see below) -
      // so just refetch to flip the row's button, nothing to celebrate yet.
      queryClient.invalidateQueries({ queryKey: ['quests'] });
    },
  });

  const claimQuestMutation = useMutation({
    mutationFn: claimQuestReward,
    onSuccess: async (results) => {
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      await refreshUser();
      results.forEach((result) => celebrate(result));
    },
  });

  // Only block the whole page on the two primary "what's on deck" queries; slower
  // secondary queries (feed, achievements, goals) render their own small loading state.
  if (habitsQuery.isLoading || activeQuestsQuery.isLoading) {
    return <PageSpinner />;
  }

  if (!user) {
    return null;
  }

  const habits = habitsQuery.data ?? [];
  const activeQuests = activeQuestsQuery.data ?? [];
  const activeGoals = activeGoalsQuery.data ?? [];
  const unlockedAchievements = unlockedAchievementsQuery.data ?? [];
  const feed = feedQuery.data ?? [];

  const xpProgress = user.xpForNextLevel > 0 ? (user.currentXP / user.xpForNextLevel) * 100 : 0;

  // Today's activities = all habits (inherently daily) + active quests. Note: a non-recurring
  // ACTIVE quest's completedToday stays false/undefined until it transitions to COMPLETED and
  // drops out of this ACTIVE list, so it never contributes to completedCount - accepted simplification.
  const completedCount =
    habits.filter((h) => h.completedToday).length + activeQuests.filter((q) => q.completedToday).length;
  const totalCount = habits.length + activeQuests.length;
  const todayProgress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const hasNoActivities =
    !activeGoalsQuery.isLoading && habits.length === 0 && activeQuests.length === 0 && activeGoals.length === 0;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {greetingForHour(new Date().getHours())}, {user.username}
            </h1>
            <p className="mt-1 text-sm text-muted">Here&apos;s what&apos;s on deck for today.</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full bg-warning/15 px-3 py-1.5 text-warning sm:self-auto">
            <Flame className="h-4 w-4" />
            <span className="text-sm font-semibold">{user.currentStreak} Day Streak</span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
            {user.level}
          </div>
          <div className="flex-1">
            <ProgressBar value={xpProgress} />
            <p className="mt-1 text-xs text-muted">
              {Math.max(user.xpForNextLevel - user.currentXP, 0)} XP until Level {user.level + 1}
            </p>
          </div>
        </div>
      </Card>

      {hasNoActivities && (
        <EmptyState
          icon={Sparkles}
          title="Let's set up your adventure"
          description="You don't have any habits, quests, or goals yet. Finish onboarding to get a personalized starting point."
          action={
            <Link href="/onboarding">
              <Button>Go to onboarding</Button>
            </Link>
          }
        />
      )}

      <AttributeRadarSection />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Progress</CardTitle>
            </CardHeader>
            <ProgressBar value={todayProgress} size="lg" />
            <p className="mt-2 text-sm text-muted">
              {totalCount > 0
                ? `${completedCount}/${totalCount} activities completed`
                : 'Nothing scheduled for today yet.'}
            </p>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Habits</CardTitle>
            </CardHeader>
            {habits.length === 0 ? (
              <p className="text-sm text-muted">No habits yet. Add one to start building a streak.</p>
            ) : (
              <ul className="space-y-2">
                {habits.map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    pending={completeHabitMutation.isPending && completeHabitMutation.variables === habit.id}
                    onComplete={() => completeHabitMutation.mutate(habit.id)}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <Link href="/quests" className="transition-colors hover:text-primary">
                <CardTitle>Active Quests</CardTitle>
              </Link>
            </CardHeader>
            {activeQuests.length === 0 ? (
              <p className="text-sm text-muted">No active quests. Start one to earn bonus XP.</p>
            ) : (
              <ul className="space-y-2">
                {activeQuests.map((quest) => (
                  <QuestRow
                    key={quest.id}
                    quest={quest}
                    pending={completeQuestMutation.isPending && completeQuestMutation.variables === quest.id}
                    onComplete={() => completeQuestMutation.mutate(quest.id)}
                    claiming={claimQuestMutation.isPending && claimQuestMutation.variables === quest.id}
                    onClaim={() => claimQuestMutation.mutate(quest.id)}
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Goals</CardTitle>
            </CardHeader>
            {activeGoalsQuery.isLoading ? (
              <Spinner />
            ) : activeGoals.length === 0 ? (
              <p className="text-sm text-muted">No active goals yet.</p>
            ) : (
              <ul className="space-y-3">
                {activeGoals.map((goal) => (
                  <li key={goal.id}>
                    <Link
                      href={`/goals/${goal.id}`}
                      className="-m-2 block rounded-xl p-2 transition-colors hover:bg-surface-hover"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-foreground">{goal.title}</span>
                        <span className="shrink-0 text-xs text-muted">{Math.round(goal.progressPercent)}%</span>
                      </div>
                      <ProgressBar value={goal.progressPercent} size="sm" className="mt-1.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Achievements</CardTitle>
            </CardHeader>
            {unlockedAchievementsQuery.isLoading ? (
              <Spinner />
            ) : unlockedAchievements.length === 0 ? (
              <p className="text-sm text-muted">No achievements unlocked yet.</p>
            ) : (
              <ul className="space-y-2">
                {unlockedAchievements.slice(0, 3).map((ua) => (
                  <li key={ua.id} className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 shrink-0 text-warning" />
                    <span className="truncate text-foreground">{ua.achievement.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity Feed</CardTitle>
            </CardHeader>
            {feedQuery.isLoading ? (
              <Spinner />
            ) : feed.length === 0 ? (
              <p className="text-sm text-muted">No activity yet. Complete something to get started.</p>
            ) : (
              <ul className="space-y-3">
                {feed.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="text-xs text-muted">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                      <p className="truncate text-foreground">{item.sourceTitle ?? item.sourceType}</p>
                    </div>
                    <Badge variant="primary" className="shrink-0">
                      +{item.amount} XP
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const RADAR_TOOLTIP_STYLE = {
  backgroundColor: 'rgb(var(--surface))',
  border: '1px solid rgb(var(--border))',
  borderRadius: 10,
  fontSize: 12,
  padding: '8px 10px',
};

interface AttributeAxisTickProps {
  x?: number;
  y?: number;
  textAnchor?: 'start' | 'middle' | 'end' | 'inherit';
  payload?: { value: string };
  colorByName: Map<string, AttributeKey>;
}

/** Colors each radar axis label by its attribute, reinforcing identity the same way AttributeDots does elsewhere - never the polygon itself, which is one series (the character), not 8. */
function AttributeAxisTick({ x, y, textAnchor, payload, colorByName }: AttributeAxisTickProps) {
  if (x === undefined || y === undefined || !payload) return null;
  const key = colorByName.get(payload.value);
  return (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={11} fontWeight={600} fill={key ? attributeColor(key) : 'rgb(var(--muted))'}>
      {payload.value}
    </text>
  );
}

function AttributeRadarSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'attributes'],
    queryFn: getAnalyticsAttributes,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Character Shape</CardTitle>
        <span className="text-xs text-muted">Attribute levels compared to each other</span>
      </CardHeader>

      {isLoading && (
        <div className="flex h-72 items-center justify-center">
          <Spinner />
        </div>
      )}

      {!isLoading && (isError || !data) && (
        <p className="py-8 text-center text-sm text-muted">Couldn&apos;t load your attribute levels.</p>
      )}

      {!isLoading && data && (
        <div className="mx-auto max-w-lg">
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={data} outerRadius="68%">
              <PolarGrid stroke="rgb(var(--border))" />
              <PolarAngleAxis
                dataKey="name"
                tick={(props) => (
                  <AttributeAxisTick {...props} colorByName={new Map(data.map((a) => [a.name, a.key]))} />
                )}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, Math.max(5, Math.ceil(Math.max(...data.map((a) => a.level), 1) * 1.2))]}
                tickCount={4}
                axisLine={false}
                tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={RADAR_TOOLTIP_STYLE}
                labelStyle={{ color: 'rgb(var(--foreground))', fontWeight: 600 }}
                formatter={(value: number) => [`Level ${value}`, '']}
              />
              <Radar
                name="Level"
                dataKey="level"
                stroke="rgb(var(--primary))"
                fill="rgb(var(--primary))"
                fillOpacity={0.25}
                strokeWidth={2}
                dot={{ r: 3, fill: 'rgb(var(--primary))', stroke: 'rgb(var(--surface))', strokeWidth: 1 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function HabitRow({
  habit,
  pending,
  onComplete,
}: {
  habit: Habit;
  pending: boolean;
  onComplete: () => void;
}) {
  const completed = habit.completedToday;

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('text-sm font-medium', completed ? 'text-muted line-through' : 'text-foreground')}>
            {habit.title}
          </span>
          <Badge variant="accent">+{habit.xpReward} XP</Badge>
          <AttributeDots skills={habit.skills} />
        </div>
      </div>
      <button
        type="button"
        onClick={onComplete}
        disabled={completed || pending}
        aria-label={completed ? 'Completed' : `Mark ${habit.title} complete`}
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed',
          completed
            ? 'border-success bg-success/15 text-success'
            : 'border-border text-muted hover:border-primary hover:text-primary disabled:opacity-50',
        )}
      >
        {pending ? (
          <Spinner className="h-4 w-4" />
        ) : completed ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>
    </li>
  );
}

function QuestRow({
  quest,
  pending,
  onComplete,
  claiming,
  onClaim,
}: {
  quest: Quest;
  pending: boolean;
  onComplete: () => void;
  claiming: boolean;
  onClaim: () => void;
}) {
  // Only RECURRING quests can be ACTIVE and already completedToday; other quest types
  // transition straight to COMPLETED status and drop out of the ACTIVE list entirely.
  const completedToday = quest.type === 'RECURRING' && !!quest.completedToday;
  const hasPendingReward = quest.unclaimedCompletions > 0;

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('text-sm font-medium', completedToday ? 'text-muted' : 'text-foreground')}>
            {quest.title}
          </span>
          <Badge variant="success">+{quest.xpReward} XP</Badge>
          <Badge variant="outline">{quest.difficulty}</Badge>
          <AttributeDots skills={quest.skills} />
        </div>
      </div>
      {hasPendingReward ? (
        <Button size="sm" variant="outline" loading={claiming} onClick={onClaim} className="shrink-0">
          Claim Reward
        </Button>
      ) : quest.isLocked ? (
        <Button variant="secondary" size="sm" disabled className="shrink-0">
          Locked
        </Button>
      ) : completedToday ? (
        <Button variant="secondary" size="sm" disabled className="shrink-0">
          Completed today
        </Button>
      ) : (
        <Button size="sm" variant="outline" loading={pending} onClick={onComplete} className="shrink-0">
          Complete
        </Button>
      )}
    </li>
  );
}
