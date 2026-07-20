'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen, Dumbbell, Flame, LucideIcon, Shield, Sparkles, Swords } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getAchievements, getUnlockedAchievements } from '@/lib/api/achievements';
import { getLevelRewards, getUnlockedLevelRewards } from '@/lib/api/level-rewards';
import { getAttributes } from '@/lib/api/attributes';
import { Achievement, LevelReward } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';

const REWARD_ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  flame: Flame,
  dumbbell: Dumbbell,
  shield: Shield,
  'book-open': BookOpen,
  swords: Swords,
};

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

interface UnlockableCardProps {
  icon: LucideIcon;
  name: string;
  description: string;
  isUnlocked: boolean;
  statusText: string;
}

function UnlockableCard({ icon: Icon, name, description, isUnlocked, statusText }: UnlockableCardProps) {
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
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
          <p className={isUnlocked ? 'mt-2 text-xs font-medium text-accent' : 'mt-2 text-xs text-muted'}>
            {statusText}
          </p>
        </div>
      </div>
    </Card>
  );
}

function AchievementsTab() {
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
      <p className="text-sm text-muted">
        {unlockedList.length} / {achievements.length} unlocked
      </p>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Unlocked</h2>
        {unlockedList.length === 0 ? (
          <p className="text-sm text-muted">No achievements unlocked yet — keep at it!</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unlockedList.map((achievement) => (
              <UnlockableCard
                key={achievement.id}
                icon={Award}
                name={achievement.name}
                description={achievement.description}
                isUnlocked
                statusText={`Unlocked ${formatDistanceToNow(new Date(unlockedMap.get(achievement.id)!), { addSuffix: true })}`}
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
              <UnlockableCard
                key={achievement.id}
                icon={Award}
                name={achievement.name}
                description={achievement.description}
                isUnlocked={false}
                statusText={describeRequirement(achievement)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LevelRewardsTab() {
  const { data: rewards, isLoading: rewardsLoading } = useQuery({
    queryKey: ['level-rewards', 'all'],
    queryFn: getLevelRewards,
  });

  const { data: unlocked, isLoading: unlockedLoading } = useQuery({
    queryKey: ['level-rewards', 'unlocked'],
    queryFn: getUnlockedLevelRewards,
  });

  const { data: attributes } = useQuery({ queryKey: ['attributes'], queryFn: getAttributes });

  const unlockedMap = useMemo(() => {
    const map = new Map<string, string>();
    unlocked?.forEach((ur) => map.set(ur.levelRewardId, ur.unlockedAt));
    return map;
  }, [unlocked]);

  const attributeNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    attributes?.forEach((a) => map.set(a.key, a.name));
    return map;
  }, [attributes]);

  function describeRewardRequirement(reward: LevelReward): string {
    if (!reward.attributeKey) return `Reach Character Level ${reward.level}`;
    const name = attributeNameByKey.get(reward.attributeKey) ?? reward.attributeKey;
    return `Reach ${name} Level ${reward.level}`;
  }

  if (rewardsLoading || unlockedLoading) {
    return <PageSpinner />;
  }

  if (!rewards || rewards.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No level rewards yet"
        description="Level rewards will show up here once they've been set up."
      />
    );
  }

  const unlockedList = rewards.filter((r) => unlockedMap.has(r.id));
  const lockedList = rewards.filter((r) => !unlockedMap.has(r.id));

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        {unlockedList.length} / {rewards.length} unlocked
      </p>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Unlocked</h2>
        {unlockedList.length === 0 ? (
          <p className="text-sm text-muted">No level rewards unlocked yet — keep leveling up!</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unlockedList.map((reward) => (
              <UnlockableCard
                key={reward.id}
                icon={reward.icon && REWARD_ICON_MAP[reward.icon] ? REWARD_ICON_MAP[reward.icon] : Award}
                name={reward.name}
                description={reward.description}
                isUnlocked
                statusText={`Unlocked ${formatDistanceToNow(new Date(unlockedMap.get(reward.id)!), { addSuffix: true })}`}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Locked</h2>
        {lockedList.length === 0 ? (
          <p className="text-sm text-muted">You&apos;ve unlocked every level reward. Amazing work!</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lockedList.map((reward) => (
              <UnlockableCard
                key={reward.id}
                icon={reward.icon && REWARD_ICON_MAP[reward.icon] ? REWARD_ICON_MAP[reward.icon] : Award}
                name={reward.name}
                description={reward.description}
                isUnlocked={false}
                statusText={describeRewardRequirement(reward)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function AchievementsPage() {
  const [tab, setTab] = useState<'ACHIEVEMENTS' | 'LEVEL_REWARDS'>('ACHIEVEMENTS');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Achievements</h1>
        <p className="mt-1 text-sm text-muted">Track everything you&apos;ve unlocked so far.</p>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface p-1">
        {(['ACHIEVEMENTS', 'LEVEL_REWARDS'] as const).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === tabKey ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
            }`}
          >
            {tabKey === 'ACHIEVEMENTS' ? 'Achievements' : 'Level Rewards'}
          </button>
        ))}
      </div>

      {tab === 'ACHIEVEMENTS' ? <AchievementsTab /> : <LevelRewardsTab />}
    </div>
  );
}
