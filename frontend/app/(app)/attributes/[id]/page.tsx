'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Award,
  ArrowLeft,
  BookOpen,
  Brain,
  Compass,
  Dumbbell,
  Flame,
  LucideIcon,
  Palette,
  Shield,
  Sparkles,
  Swords,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAttribute } from '@/lib/api/attributes';
import { getUnlockedLevelRewards, getLevelRewards } from '@/lib/api/level-rewards';
import { getApiErrorMessage } from '@/lib/api-client';
import { attributeColor } from '@/lib/attribute-colors';
import { XPSourceType } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';

const ATTRIBUTE_ICON_MAP: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  brain: Brain,
  shield: Shield,
  zap: Zap,
  users: Users,
  wallet: Wallet,
  palette: Palette,
  compass: Compass,
};

const REWARD_ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  flame: Flame,
  dumbbell: Dumbbell,
  shield: Shield,
  'book-open': BookOpen,
  swords: Swords,
};

function resolveIcon(icon: string | null | undefined, map: Record<string, LucideIcon>, fallback: LucideIcon): LucideIcon {
  if (icon && map[icon]) return map[icon];
  return fallback;
}

const SOURCE_TYPE_LABELS: Record<XPSourceType, string> = {
  QUEST_COMPLETION: 'Quest completed',
  HABIT_COMPLETION: 'Habit completed',
  GOAL_COMPLETION: 'Goal completed',
  ACHIEVEMENT_BONUS: 'Achievement bonus',
  CORRECTION: 'Correction',
};

function progressPercent(entity: { currentXP: number; xpForNextLevel: number }): number {
  if (!entity.xpForNextLevel) return 0;
  return Math.min(100, Math.max(0, (entity.currentXP / entity.xpForNextLevel) * 100));
}

export default function AttributeDetailPage({ params }: { params: { id: string } }) {
  const attributeQuery = useQuery({ queryKey: ['attributes', params.id], queryFn: () => getAttribute(params.id) });
  const rewardsQuery = useQuery({ queryKey: ['level-rewards', 'all'], queryFn: getLevelRewards });
  const unlockedRewardsQuery = useQuery({ queryKey: ['level-rewards', 'unlocked'], queryFn: getUnlockedLevelRewards });

  const chartData = useMemo(() => {
    const activity = attributeQuery.data?.recentActivity ?? [];
    if (activity.length < 2) return [];
    const sorted = [...activity].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let cumulative = 0;
    return sorted.map((tx) => {
      cumulative += tx.amount;
      return { date: tx.createdAt, cumulative };
    });
  }, [attributeQuery.data?.recentActivity]);

  if (attributeQuery.isLoading) {
    return <PageSpinner />;
  }

  if (attributeQuery.isError || !attributeQuery.data) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Attribute not found"
        description={getApiErrorMessage(
          attributeQuery.error,
          "This attribute may not exist, or you don't have access to it.",
        )}
        action={
          <Link href="/skills" className="text-sm text-primary hover:underline">
            Back to Skills
          </Link>
        }
      />
    );
  }

  const attribute = attributeQuery.data;
  const Icon = resolveIcon(attribute.icon, ATTRIBUTE_ICON_MAP, Sparkles);
  const progress = progressPercent(attribute);
  const color = attributeColor(attribute.key);

  const rewardsForAttribute = (rewardsQuery.data ?? []).filter((reward) => reward.attributeKey === attribute.key);
  const unlockedIds = new Set((unlockedRewardsQuery.data ?? []).map((ur) => ur.levelRewardId));

  return (
    <div className="space-y-6">
      <Link href="/skills" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Skills
      </Link>

      <Card>
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: attributeColor(attribute.key, 0.15), color }}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{attribute.name}</h1>
              <Badge variant="primary">Lvl {attribute.level}</Badge>
            </div>
            {attribute.description && <p className="mt-1 text-sm text-muted">{attribute.description}</p>}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>
              {attribute.currentXP} / {attribute.xpForNextLevel} XP
            </span>
            <span>This week: +{attribute.weeklyXP} XP</span>
          </div>
          <ProgressBar value={progress} size="lg" />
        </div>
      </Card>

      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>XP Growth</CardTitle>
          </CardHeader>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="attributeXpGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => format(new Date(value), 'MMM d')}
                  stroke="rgb(var(--muted))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis stroke="rgb(var(--muted))" fontSize={12} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgb(var(--surface))',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(value: string) => format(new Date(value), 'MMM d, yyyy p')}
                  formatter={(value: number) => [`${value} XP`, 'Cumulative']}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke={color}
                  strokeWidth={2}
                  fill="url(#attributeXpGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
        </CardHeader>
        {attribute.skills.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No skills under {attribute.name} yet. Add one from the Skills page.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {attribute.skills.map((skill) => (
              <Link key={skill.id} href={`/skills/${skill.id}`} className="block">
                <Card className="h-full cursor-pointer transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{skill.name}</p>
                    <Badge variant="default">Lvl {skill.level}</Badge>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>{skill.currentXP} XP</span>
                      <span>{skill.xpForNextLevel} XP</span>
                    </div>
                    <ProgressBar value={progressPercent(skill)} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unlocked Rewards</CardTitle>
        </CardHeader>
        {rewardsForAttribute.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No level rewards are tied to {attribute.name} yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rewardsForAttribute.map((reward) => {
              const isUnlocked = unlockedIds.has(reward.id);
              const RewardIcon = resolveIcon(reward.icon, REWARD_ICON_MAP, Award);
              return (
                <Card key={reward.id} className={isUnlocked ? 'border-accent/40' : 'opacity-70 grayscale'}>
                  <div className="flex items-start gap-3">
                    <div
                      className={
                        isUnlocked
                          ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm'
                          : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-hover text-muted'
                      }
                    >
                      <RewardIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{reward.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{reward.description}</p>
                      <p className={isUnlocked ? 'mt-2 text-xs font-medium text-accent' : 'mt-2 text-xs text-muted'}>
                        {isUnlocked ? 'Unlocked' : `Reach ${attribute.name} Level ${reward.level}`}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        {attribute.recentActivity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No activity yet. Complete a quest, habit, or goal tied to this attribute to see it here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {attribute.recentActivity.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {SOURCE_TYPE_LABELS[tx.sourceType] ?? tx.sourceType}
                    {tx.sourceTitle ? ` · ${tx.sourceTitle}` : ''}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <Badge variant={tx.amount >= 0 ? 'success' : 'danger'} className="shrink-0">
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount} XP
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
