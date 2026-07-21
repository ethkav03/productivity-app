'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Check, CheckCircle2, Flag, Loader2, Plus, Repeat, Target, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { addMilestone, deleteGoal, deleteMilestone, getGoal, progressGoal, updateMilestone } from '@/lib/api/goals';
import { GoalMilestone, GoalStatus, GoalType, QuestDifficulty, QuestStatus } from '@/lib/types';
import { getApiErrorMessage } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useCelebration } from '@/hooks/use-celebration';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { Input, Label } from '@/components/ui/input';

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  NUMERIC: 'Numeric',
  COMPLETION: 'Completion',
  BINARY: 'Binary',
};

const GOAL_STATUS_VARIANTS: Record<GoalStatus, 'primary' | 'success' | 'outline'> = {
  ACTIVE: 'primary',
  COMPLETED: 'success',
  ABANDONED: 'outline',
};

const QUEST_STATUS_VARIANTS: Record<QuestStatus, 'primary' | 'success' | 'outline'> = {
  ACTIVE: 'primary',
  COMPLETED: 'success',
  ARCHIVED: 'outline',
};

const QUEST_DIFFICULTY_VARIANTS: Record<QuestDifficulty, 'default' | 'success' | 'warning' | 'danger' | 'accent'> = {
  EASY: 'success',
  MEDIUM: 'default',
  HARD: 'warning',
  EPIC: 'danger',
  LEGENDARY: 'accent',
};

export default function GoalDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const celebrate = useCelebration();
  const [progressValue, setProgressValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneXpReward, setMilestoneXpReward] = useState('');

  const {
    data: goal,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['goals', params.id],
    queryFn: () => getGoal(params.id),
  });

  useEffect(() => {
    if (goal && goal.type !== 'BINARY') {
      setProgressValue(String(goal.currentValue));
    }
    // Only re-sync when the goal identity changes, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id]);

  const progressMutation = useMutation({
    mutationFn: (value: number) => progressGoal(params.id, { value }),
    onSuccess: async (data) => {
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goals', params.id] });
      setProgressValue(String(data.goal.currentValue));
      if (data.completion) {
        queryClient.invalidateQueries({ queryKey: ['level-rewards'] });
        queryClient.invalidateQueries({ queryKey: ['quests'] });
        queryClient.invalidateQueries({ queryKey: ['challenges'] });
        await refreshUser();
        celebrate(data.completion);
      }
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not save progress'));
    },
  });

  const addMilestoneMutation = useMutation({
    mutationFn: () =>
      addMilestone(params.id, {
        title: milestoneTitle.trim(),
        xpReward: milestoneXpReward.trim() ? Number(milestoneXpReward) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals', params.id] });
      setMilestoneTitle('');
      setMilestoneXpReward('');
    },
  });

  const toggleMilestoneMutation = useMutation({
    mutationFn: ({ milestoneId, completed }: { milestoneId: string; completed: boolean }) =>
      updateMilestone(params.id, milestoneId, { completed }),
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['goals', params.id] });
      if (data.completion) {
        await refreshUser();
        celebrate(data.completion);
      }
    },
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: (milestoneId: string) => deleteMilestone(params.id, milestoneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals', params.id] });
    },
  });

  function handleAddMilestone(event: FormEvent) {
    event.preventDefault();
    if (!milestoneTitle.trim()) return;
    addMilestoneMutation.mutate();
  }

  async function handleDelete() {
    if (!window.confirm('Delete this goal? This cannot be undone.')) return;
    setDeleteError(null);
    try {
      await deleteGoal(params.id);
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      router.push('/goals');
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, 'Could not delete goal'));
    }
  }

  function handleNumericSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(progressValue);
    if (progressValue.trim() === '' || Number.isNaN(parsed)) {
      setFormError('Enter a valid number');
      return;
    }
    progressMutation.mutate(parsed);
  }

  if (isLoading) return <PageSpinner />;

  if (isError || !goal) {
    return (
      <EmptyState
        icon={Target}
        title="Goal not found"
        description="This goal may have been deleted, or you don't have access to it."
        action={
          <Link href="/goals">
            <Button variant="secondary">Back to Goals</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/goals" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Goals
        </Link>
        <Button variant="danger" size="sm" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
          Delete Goal
        </Button>
      </div>

      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{goal.title}</h1>
            {goal.description && <p className="mt-1 text-sm text-muted">{goal.description}</p>}
          </div>
          <Badge variant={GOAL_STATUS_VARIANTS[goal.status]}>{goal.status}</Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {goal.category && <Badge variant="outline">{goal.category}</Badge>}
          <Badge variant="primary">{GOAL_TYPE_LABELS[goal.type]}</Badge>
          {goal.skills.map((skill) => (
            <Badge key={skill.id} variant="accent">
              {skill.name}
            </Badge>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-muted">Progress</span>
            <span className="font-medium text-foreground">{Math.round(goal.progressPercent)}%</span>
          </div>
          <ProgressBar value={goal.progressPercent} size="lg" />
          {goal.type === 'NUMERIC' && (
            <p className="mt-1.5 text-xs text-muted">
              {goal.currentValue}/{goal.targetValue} {goal.unit}
            </p>
          )}
          {goal.type === 'COMPLETION' && (
            <p className="mt-1.5 text-xs text-muted">
              {goal.currentValue}/{goal.targetValue} linked quests completed
            </p>
          )}
        </div>

        {goal.targetDate && (
          <p className="mt-4 text-xs text-muted">Target date: {format(new Date(goal.targetDate), 'MMM d, yyyy')}</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Milestones</CardTitle>
        </CardHeader>
        {goal.milestones.length === 0 ? (
          <p className="text-sm text-muted">No milestones yet - break this goal into smaller checkpoints below.</p>
        ) : (
          <ul className="space-y-2">
            {goal.milestones.map((milestone) => (
              <MilestoneRow
                key={milestone.id}
                milestone={milestone}
                onToggle={() =>
                  toggleMilestoneMutation.mutate({ milestoneId: milestone.id, completed: !milestone.completed })
                }
                isToggling={
                  toggleMilestoneMutation.isPending && toggleMilestoneMutation.variables?.milestoneId === milestone.id
                }
                onDelete={() => deleteMilestoneMutation.mutate(milestone.id)}
                isDeleting={deleteMilestoneMutation.isPending && deleteMilestoneMutation.variables === milestone.id}
              />
            ))}
          </ul>
        )}

        <form onSubmit={handleAddMilestone} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="min-w-[10rem] flex-1">
            <Label htmlFor="milestone-title">New milestone</Label>
            <Input
              id="milestone-title"
              placeholder="e.g. Reach 100kg on deadlift"
              value={milestoneTitle}
              onChange={(event) => setMilestoneTitle(event.target.value)}
            />
          </div>
          <div className="w-24">
            <Label htmlFor="milestone-xp">XP (optional)</Label>
            <Input
              id="milestone-xp"
              type="number"
              min={0}
              placeholder="0"
              value={milestoneXpReward}
              onChange={(event) => setMilestoneXpReward(event.target.value)}
            />
          </div>
          <Button type="submit" size="sm" loading={addMilestoneMutation.isPending} disabled={!milestoneTitle.trim()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked Quests</CardTitle>
        </CardHeader>
        {!goal.quests || goal.quests.length === 0 ? (
          <p className="text-sm text-muted">No quests linked yet - add some from the Quests page.</p>
        ) : (
          <div className="space-y-2">
            {goal.quests.map((quest) => (
              <div
                key={quest.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="truncate text-sm text-foreground">{quest.title}</span>
                <div className="flex shrink-0 gap-1.5">
                  <Badge variant={QUEST_STATUS_VARIANTS[quest.status]}>{quest.status}</Badge>
                  <Badge variant={QUEST_DIFFICULTY_VARIANTS[quest.difficulty]}>{quest.difficulty}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked Habits</CardTitle>
        </CardHeader>
        {!goal.habits || goal.habits.length === 0 ? (
          <p className="text-sm text-muted">No habits linked yet - add some from the Habits page.</p>
        ) : (
          <div className="space-y-2">
            {goal.habits.map((habit) => (
              <div
                key={habit.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="flex items-center gap-2 truncate text-sm text-foreground">
                  <Repeat className="h-3.5 w-3.5 shrink-0 text-muted" />
                  {habit.title}
                </span>
                <Badge variant={habit.isActive ? 'primary' : 'outline'} className="shrink-0">
                  {habit.isActive ? 'Active' : 'Paused'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {goal.status === 'ACTIVE' ? (
        <Card>
          <CardHeader>
            <CardTitle>Log Progress</CardTitle>
          </CardHeader>

          {goal.type === 'BINARY' ? (
            <Button onClick={() => progressMutation.mutate(1)} loading={progressMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" />
              Mark Complete
            </Button>
          ) : goal.type === 'COMPLETION' ? (
            <p className="text-sm text-muted">
              Progress updates automatically as linked quests are completed - link a quest to this
              goal from the Quests page to make it count.
            </p>
          ) : (
            <form onSubmit={handleNumericSubmit} className="space-y-3">
              <div>
                <Label htmlFor="progressValue">Current {goal.unit ?? 'value'}</Label>
                <Input
                  id="progressValue"
                  type="number"
                  step="any"
                  value={progressValue}
                  onChange={(event) => setProgressValue(event.target.value)}
                />
                <p className="mt-1 text-xs text-muted">Enter your current total, not the amount to add.</p>
              </div>
              <Button type="submit" loading={progressMutation.isPending}>
                Save Progress
              </Button>
            </form>
          )}

          {formError && <p className="mt-3 text-sm text-danger">{formError}</p>}
        </Card>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-hover px-4 py-3 text-sm text-muted">
          {goal.completedAt
            ? `Goal completed on ${format(new Date(goal.completedAt), 'MMM d, yyyy')}.`
            : `This goal is ${goal.status.toLowerCase()}.`}
        </div>
      )}
    </div>
  );
}

interface MilestoneRowProps {
  milestone: GoalMilestone;
  onToggle: () => void;
  isToggling: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}

function MilestoneRow({ milestone, onToggle, isToggling, onDelete, isDeleting }: MilestoneRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={isToggling}
        aria-label={milestone.completed ? `Undo ${milestone.title}` : `Mark ${milestone.title} complete`}
        className={clsx(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed',
          milestone.completed
            ? 'border-success bg-success/15 text-success'
            : 'border-border text-transparent hover:border-primary hover:text-primary/40',
        )}
      >
        {isToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" /> : <Check className="h-3.5 w-3.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={clsx('flex items-center gap-2 text-sm font-medium', milestone.completed ? 'text-muted line-through' : 'text-foreground')}>
          <Flag className="h-3.5 w-3.5 shrink-0 text-muted" />
          {milestone.title}
        </p>
        {milestone.description && <p className="mt-0.5 text-xs text-muted">{milestone.description}</p>}
      </div>

      {milestone.xpReward > 0 && (
        <Badge variant="accent" className="shrink-0">
          +{milestone.xpReward} XP
        </Badge>
      )}

      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        aria-label={`Delete ${milestone.title}`}
        title="Delete milestone"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}
