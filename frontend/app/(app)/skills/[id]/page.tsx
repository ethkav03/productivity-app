'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Brain,
  CheckSquare,
  Compass,
  Dumbbell,
  LucideIcon,
  Palette,
  Pencil,
  Repeat,
  Shield,
  Sparkles,
  Target,
  Trash2,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { deleteSkill, getSkill, updateSkill } from '@/lib/api/skills';
import { getQuests } from '@/lib/api/quests';
import { getHabits } from '@/lib/api/habits';
import { getGoals } from '@/lib/api/goals';
import { getApiErrorMessage } from '@/lib/api-client';
import { XPSourceType } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';

const SKILL_ICON_MAP: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  brain: Brain,
  shield: Shield,
  zap: Zap,
  users: Users,
  wallet: Wallet,
  palette: Palette,
  compass: Compass,
};

function resolveSkillIcon(icon: string | null | undefined): LucideIcon {
  if (icon && SKILL_ICON_MAP[icon]) return SKILL_ICON_MAP[icon];
  return Sparkles;
}

const SOURCE_TYPE_LABELS: Record<XPSourceType, string> = {
  QUEST_COMPLETION: 'Quest completed',
  HABIT_COMPLETION: 'Habit completed',
  GOAL_COMPLETION: 'Goal completed',
  ACHIEVEMENT_BONUS: 'Achievement bonus',
  CORRECTION: 'Correction',
};

export default function SkillDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { push } = useToast();

  const skillQuery = useQuery({ queryKey: ['skills', params.id], queryFn: () => getSkill(params.id) });
  const questsQuery = useQuery({ queryKey: ['quests', undefined, undefined], queryFn: () => getQuests() });
  const habitsQuery = useQuery({ queryKey: ['habits'], queryFn: getHabits });
  const goalsQuery = useQuery({ queryKey: ['goals', undefined], queryFn: () => getGoals() });

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const updateMutation = useMutation({
    mutationFn: (input: { name: string; description?: string }) => updateSkill(params.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills', params.id] });
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      setIsEditing(false);
    },
    onError: (error) => {
      push({ title: "Couldn't update skill", description: getApiErrorMessage(error) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSkill(params.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      router.push('/skills');
    },
    onError: (error) => {
      push({ title: "Couldn't delete skill", description: getApiErrorMessage(error) });
    },
  });

  const chartData = useMemo(() => {
    const activity = skillQuery.data?.recentActivity ?? [];
    if (activity.length < 2) return [];
    const sorted = [...activity].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let cumulative = 0;
    return sorted.map((tx) => {
      cumulative += tx.amount;
      return { date: tx.createdAt, cumulative };
    });
  }, [skillQuery.data?.recentActivity]);

  const contributingQuests = useMemo(
    () => (questsQuery.data ?? []).filter((quest) => quest.skills.some((s) => s.id === params.id)),
    [questsQuery.data, params.id],
  );
  const contributingHabits = useMemo(
    () => (habitsQuery.data ?? []).filter((habit) => habit.skills.some((s) => s.id === params.id)),
    [habitsQuery.data, params.id],
  );
  const contributingGoals = useMemo(
    () => (goalsQuery.data ?? []).filter((goal) => goal.skills.some((s) => s.id === params.id)),
    [goalsQuery.data, params.id],
  );
  const hasContributors = contributingQuests.length > 0 || contributingHabits.length > 0 || contributingGoals.length > 0;

  function startEditing() {
    if (!skillQuery.data) return;
    setEditName(skillQuery.data.name);
    setEditDescription(skillQuery.data.description ?? '');
    setIsEditing(true);
  }

  function handleEditSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    updateMutation.mutate({ name: trimmedName, description: editDescription.trim() });
  }

  function handleDelete() {
    if (!window.confirm('Delete this skill? This cannot be undone.')) return;
    deleteMutation.mutate();
  }

  if (skillQuery.isLoading) {
    return <PageSpinner />;
  }

  if (skillQuery.isError || !skillQuery.data) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Skill not found"
        description={getApiErrorMessage(
          skillQuery.error,
          "This skill may have been deleted, or you don't have access to it.",
        )}
        action={
          <Link href="/skills">
            <Button variant="secondary">Back to Skills</Button>
          </Link>
        }
      />
    );
  }

  const skill = skillQuery.data;
  const Icon = resolveSkillIcon(skill.icon ?? skill.attribute.icon);
  const progress = skill.xpForNextLevel ? Math.min(100, Math.max(0, (skill.currentXP / skill.xpForNextLevel) * 100)) : 0;

  return (
    <div className="space-y-6">
      <Link href="/skills" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Skills
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Icon className="h-6 w-6" />
            </div>

            {isEditing ? (
              <form id="edit-skill-form" onSubmit={handleEditSubmit} className="space-y-3">
                <div>
                  <Label htmlFor="edit-skill-name">Name</Label>
                  <Input
                    id="edit-skill-name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    minLength={2}
                    maxLength={40}
                    required
                  />
                  <FieldError>{editName.trim() ? undefined : 'Name is required'}</FieldError>
                </div>
                <div>
                  <Label htmlFor="edit-skill-description">Description</Label>
                  <Textarea
                    id="edit-skill-description"
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    maxLength={280}
                  />
                </div>
              </form>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">{skill.name}</h1>
                  <Badge variant="primary">Lvl {skill.level}</Badge>
                </div>
                <Link
                  href={`/attributes/${skill.attribute.id}`}
                  className="mt-1 inline-block text-xs text-muted hover:text-primary hover:underline"
                >
                  Part of {skill.attribute.name}
                </Link>
                {skill.description && <p className="mt-1 text-sm text-muted">{skill.description}</p>}
              </div>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            {isEditing ? (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" form="edit-skill-form" size="sm" loading={updateMutation.isPending}>
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete} loading={deleteMutation.isPending}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>
              {skill.currentXP} / {skill.xpForNextLevel} XP
            </span>
            <span>This week: +{skill.weeklyXP} XP</span>
          </div>
          <ProgressBar value={progress} size="lg" />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What contributes to this skill?</CardTitle>
        </CardHeader>
        {!hasContributors ? (
          <p className="py-6 text-center text-sm text-muted">
            No quests, habits, or goals are tagged with {skill.name} yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {contributingQuests.map((quest) => (
              <li key={`quest-${quest.id}`}>
                <Link
                  href="/quests"
                  className="flex items-center gap-3 py-2.5 text-sm text-foreground hover:text-primary"
                >
                  <CheckSquare className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{quest.title}</span>
                  <Badge variant="default" className="shrink-0">Quest</Badge>
                </Link>
              </li>
            ))}
            {contributingHabits.map((habit) => (
              <li key={`habit-${habit.id}`}>
                <Link
                  href="/habits"
                  className="flex items-center gap-3 py-2.5 text-sm text-foreground hover:text-primary"
                >
                  <Repeat className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{habit.title}</span>
                  <Badge variant="default" className="shrink-0">Habit</Badge>
                </Link>
              </li>
            ))}
            {contributingGoals.map((goal) => (
              <li key={`goal-${goal.id}`}>
                <Link
                  href={`/goals/${goal.id}`}
                  className="flex items-center gap-3 py-2.5 text-sm text-foreground hover:text-primary"
                >
                  <Target className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{goal.title}</span>
                  <Badge variant="default" className="shrink-0">Goal</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
                  <linearGradient id="skillXpGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgb(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="rgb(var(--primary))" stopOpacity={0} />
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
                  stroke="rgb(var(--primary))"
                  strokeWidth={2}
                  fill="url(#skillXpGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        {skill.recentActivity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No activity yet. Complete a quest, habit, or goal linked to this skill to see it here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {skill.recentActivity.map((tx) => (
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
