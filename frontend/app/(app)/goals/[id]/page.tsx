'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle2, Target, Trash2 } from 'lucide-react';
import { deleteGoal, getGoal, progressGoal } from '@/lib/api/goals';
import { GoalStatus, GoalType, QuestDifficulty, QuestStatus } from '@/lib/types';
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
        queryClient.invalidateQueries({ queryKey: ['challenges'] });
        await refreshUser();
        celebrate(data.completion);
      }
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not save progress'));
    },
  });

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
        </div>

        {goal.targetDate && (
          <p className="mt-4 text-xs text-muted">Target date: {format(new Date(goal.targetDate), 'MMM d, yyyy')}</p>
        )}
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
