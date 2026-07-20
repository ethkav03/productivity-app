'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Brain,
  CheckCircle2,
  Compass,
  Dumbbell,
  Flame,
  History,
  Inbox,
  LineChart,
  LucideIcon,
  Palette,
  Shield,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getAnalyticsActivity,
  getAnalyticsAttributes,
  getAnalyticsFeed,
  getAnalyticsOverview,
  getAnalyticsSkills,
  getAnalyticsXp,
} from '@/lib/api/analytics';
import { attributeColor } from '@/lib/attribute-colors';
import { AnalyticsSkillProgress, XPSourceType, XPTransaction } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';

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

const TOOLTIP_STYLE = {
  backgroundColor: 'rgb(var(--surface))',
  border: '1px solid rgb(var(--border))',
  borderRadius: 10,
  fontSize: 12,
  padding: '8px 10px',
};

function humanizeSourceType(sourceType: XPSourceType): string {
  switch (sourceType) {
    case 'QUEST_COMPLETION':
      return 'Quest completed';
    case 'HABIT_COMPLETION':
      return 'Habit completed';
    case 'GOAL_COMPLETION':
      return 'Goal completed';
    case 'ACHIEVEMENT_BONUS':
      return 'Achievement bonus';
    case 'CORRECTION':
      return 'Correction';
    default:
      return sourceType;
  }
}

function formatAttributeKey(key: string): string {
  return key.charAt(0) + key.slice(1).toLowerCase();
}

function ChartLoading({ height = 240 }: { height?: number }) {
  return (
    <div className="flex w-full items-center justify-center" style={{ height }}>
      <Spinner />
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted">See how your effort turns into progress over time.</p>
      </header>

      <OverviewSection />

      <AttributeProgressionSection />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <XpOverTimeSection />
        <SkillProgressionSection />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityHeatmapSection />
        <RecentActivitySection />
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate text-2xl font-bold text-foreground">{value}</p>
    </Card>
  );
}

function OverviewSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: getAnalyticsOverview,
  });

  if (isLoading) {
    return (
      <Card>
        <ChartLoading height={80} />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <p className="py-4 text-center text-sm text-muted">Couldn&apos;t load your overview.</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile icon={Zap} label="Total XP" value={data.totalXP.toLocaleString()} />
      <StatTile icon={LineChart} label="XP This Week" value={data.xpThisWeek.toLocaleString()} />
      <StatTile icon={CheckCircle2} label="Activities Completed" value={data.activitiesCompleted.toLocaleString()} />
      <StatTile icon={Flame} label="Current Streak" value={data.currentStreak} />
      <StatTile icon={Trophy} label="Longest Streak" value={data.longestStreak} />
      <StatTile icon={Sparkles} label="Most Improved Skill" value={data.mostImprovedSkill ?? '-'} />
    </div>
  );
}

function XpOverTimeSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'xp'],
    queryFn: () => getAnalyticsXp(30),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>XP Over Time</CardTitle>
        <span className="text-xs text-muted">Last 30 days</span>
      </CardHeader>

      {isLoading && <ChartLoading />}

      {!isLoading && (isError || !data) && (
        <p className="py-8 text-center text-sm text-muted">Couldn&apos;t load XP history.</p>
      )}

      {!isLoading && data && data.length === 0 && (
        <EmptyState icon={LineChart} title="No XP yet" description="Complete quests and habits to start earning XP." />
      )}

      {!isLoading && data && data.length > 0 && (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="xpAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="rgb(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="rgb(var(--muted))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={32}
              tickFormatter={(value: string) => format(new Date(value), 'MMM d')}
            />
            <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: 'rgb(var(--foreground))', marginBottom: 2, fontWeight: 600 }}
              itemStyle={{ color: 'rgb(var(--primary))' }}
              labelFormatter={(value: string) => format(new Date(value), 'MMM d, yyyy')}
              formatter={(value: number) => [`${value} XP`, 'Gained']}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="rgb(var(--primary))"
              strokeWidth={2}
              fill="url(#xpAreaGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function AttributeProgressionSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'attributes'],
    queryFn: getAnalyticsAttributes,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attribute Progression</CardTitle>
        <span className="text-xs text-muted">Your character sheet</span>
      </CardHeader>

      {isLoading && <ChartLoading height={140} />}

      {!isLoading && (isError || !data) && (
        <p className="py-8 text-center text-sm text-muted">Couldn&apos;t load attribute progression.</p>
      )}

      {!isLoading && data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.map((attribute) => {
            const Icon = ATTRIBUTE_ICON_MAP[attribute.icon ?? ''] ?? Sparkles;
            return (
              <div key={attribute.attributeId} className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: attributeColor(attribute.key, 0.15), color: attributeColor(attribute.key) }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <p className="truncate text-xs font-semibold text-foreground">{attribute.name}</p>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <Badge variant="primary">Lvl {attribute.level}</Badge>
                  <span className="text-xs text-muted">+{attribute.weeklyXP} this wk</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SkillProgressionSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'skills'],
    queryFn: getAnalyticsSkills,
  });

  const skills: AnalyticsSkillProgress[] = data ? [...data].sort((a, b) => b.level - a.level) : [];
  const chartHeight = Math.max(220, skills.length * 40 + 40);

  const distinctAttributes = Array.from(new Set(skills.map((s) => s.attributeKey)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skill Progression</CardTitle>
        <span className="text-xs text-muted">By level, colored by attribute</span>
      </CardHeader>

      {isLoading && <ChartLoading />}

      {!isLoading && (isError || !data) && (
        <p className="py-8 text-center text-sm text-muted">Couldn&apos;t load skill progression.</p>
      )}

      {!isLoading && data && skills.length === 0 && (
        <EmptyState icon={Sparkles} title="No skills yet" description="Create a skill to start tracking its progress." />
      )}

      {!isLoading && data && skills.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={skills} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
              <XAxis type="number" stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="rgb(var(--muted))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={96}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: 'rgb(var(--foreground))', fontWeight: 600 }}
                formatter={(value: number, _name, item) => [
                  `Level ${value} · ${formatAttributeKey(item.payload.attributeKey)}`,
                  '',
                ]}
              />
              <Bar dataKey="level" radius={[0, 4, 4, 0]} barSize={16}>
                {skills.map((skill) => (
                  <Cell key={skill.skillId} fill={attributeColor(skill.attributeKey)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border pt-3">
            {distinctAttributes.map((key) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: attributeColor(key) }}
                  aria-hidden
                />
                {formatAttributeKey(key)}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function getHeatClass(count: number, max: number): string {
  if (count <= 0) return 'bg-surface-hover';
  const ratio = count / max;
  if (ratio <= 0.25) return 'bg-primary/25';
  if (ratio <= 0.5) return 'bg-primary/50';
  if (ratio <= 0.75) return 'bg-primary/75';
  return 'bg-primary';
}

function ActivityHeatmapSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'activity'],
    queryFn: () => getAnalyticsActivity(84),
  });

  const days = data ? [...data].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const maxCount = Math.max(1, ...days.map((d) => d.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <span className="text-xs text-muted">Last 12 weeks</span>
      </CardHeader>

      {isLoading && <ChartLoading height={160} />}

      {!isLoading && (isError || !data) && (
        <p className="py-8 text-center text-sm text-muted">Couldn&apos;t load activity history.</p>
      )}

      {!isLoading && data && days.length === 0 && (
        <EmptyState icon={Inbox} title="No activity yet" description="Completed activities will show up here." />
      )}

      {!isLoading && data && days.length > 0 && (
        <div className="grid grid-cols-12 gap-1">
          {days.map((day) => (
            <div
              key={day.date}
              title={`${format(new Date(day.date), 'MMM d, yyyy')}: ${day.count} ${day.count === 1 ? 'activity' : 'activities'}`}
              className={clsx('aspect-square rounded-sm', getHeatClass(day.count, maxCount))}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function RecentActivitySection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'feed'],
    queryFn: () => getAnalyticsFeed(15),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <Link href="/analytics/history" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <History className="h-3.5 w-3.5" />
          Full history
        </Link>
      </CardHeader>

      {isLoading && <ChartLoading height={160} />}

      {!isLoading && (isError || !data) && (
        <p className="py-8 text-center text-sm text-muted">Couldn&apos;t load recent activity.</p>
      )}

      {!isLoading && data && data.length === 0 && (
        <EmptyState icon={Inbox} title="No activity yet" description="Your recent XP gains will appear here." />
      )}

      {!isLoading && data && data.length > 0 && (
        <ul className="divide-y divide-border">
          {data.map((item: XPTransaction) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.sourceTitle ?? humanizeSourceType(item.sourceType)}
                </p>
                <p className="text-xs text-muted">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</p>
              </div>
              <Badge variant="primary" className="shrink-0">
                +{item.amount} XP
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
