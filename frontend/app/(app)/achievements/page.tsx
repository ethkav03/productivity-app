'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getAchievements, getUnlockedAchievements } from '@/lib/api/achievements';
import { Achievement } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';

function describeRequirement(achievement: Achievement): string {
  const value = achievement.requirementValue;
  const skillName = achievement.skillName;

  switch (achievement.requirementType) {
    case 'LEVEL_REACHED':
      return `Reach Level ${value}`;
    case 'STREAK_LENGTH':
      return `Maintain a ${value}-day streak`;
    case 'QUESTS_COMPLETED':
      return `Complete ${value} quests`;
    case 'GOALS_COMPLETED':
      return `Complete ${value} goals`;
    case 'GOALS_CREATED':
      return `Create ${value} goal${value === 1 ? '' : 's'}`;
    case 'HABITS_COMPLETED':
      return `Complete ${value} habit check-ins`;
    case 'SKILL_LEVEL_REACHED':
      return `Reach ${skillName} Level ${value}`;
    case 'SKILL_ACTIVITY_COUNT':
      return `Log ${value} ${skillName} activities`;
    default:
      return achievement.description;
  }
}

interface AchievementCardProps {
  achievement: Achievement;
  unlockedAt: string | null;
}

function AchievementCard({ achievement, unlockedAt }: AchievementCardProps) {
  const isUnlocked = unlockedAt !== null;

  return (
    <Card className={isUnlocked ? 'border-accent/40' : 'opacity-70 grayscale'}>
      <div className="flex items-start gap-3">
        <div
          className={
            isUnlocked
              ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm'
              : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-hover text-muted'
          }
        >
          <Award className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{achievement.name}</p>
          <p className="mt-0.5 text-xs text-muted">{achievement.description}</p>
          <p className={isUnlocked ? 'mt-2 text-xs font-medium text-accent' : 'mt-2 text-xs text-muted'}>
            {isUnlocked
              ? `Unlocked ${formatDistanceToNow(new Date(unlockedAt), { addSuffix: true })}`
              : describeRequirement(achievement)}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function AchievementsPage() {
  const { data: achievements, isLoading: achievementsLoading } = useQuery({
    queryKey: ['achievements', 'all'],
    queryFn: getAchievements,
  });

  const { data: unlocked, isLoading: unlockedLoading } = useQuery({
    queryKey: ['achievements', 'unlocked'],
    queryFn: getUnlockedAchievements,
  });

  const unlockedMap = useMemo(() => {
    const map = new Map<string, string>();
    unlocked?.forEach((ua) => map.set(ua.achievementId, ua.unlockedAt));
    return map;
  }, [unlocked]);

  if (achievementsLoading || unlockedLoading) {
    return <PageSpinner />;
  }

  if (!achievements || achievements.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="No achievements yet"
        description="Achievements will show up here once they've been set up."
      />
    );
  }

  const unlockedList = achievements.filter((a) => unlockedMap.has(a.id));
  const lockedList = achievements.filter((a) => !unlockedMap.has(a.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Achievements</h1>
        <p className="mt-1 text-sm text-muted">
          {unlockedList.length} / {achievements.length} unlocked
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Unlocked</h2>
        {unlockedList.length === 0 ? (
          <p className="text-sm text-muted">No achievements unlocked yet — keep at it!</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unlockedList.map((achievement) => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                unlockedAt={unlockedMap.get(achievement.id) ?? null}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Locked</h2>
        {lockedList.length === 0 ? (
          <p className="text-sm text-muted">You&apos;ve unlocked every achievement. Amazing work!</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lockedList.map((achievement) => (
              <AchievementCard key={achievement.id} achievement={achievement} unlockedAt={null} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
