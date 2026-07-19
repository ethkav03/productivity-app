'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Target } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { createGoal, getGoals, CreateGoalInput } from '@/lib/api/goals';
import { getSkills } from '@/lib/api/skills';
import { Goal, GoalStatus, GoalType } from '@/lib/types';
import { getApiErrorMessage } from '@/lib/api-client';
import { AttributeDots } from '@/components/ui/attribute-dots';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/input';
import { PillSelect } from '@/components/ui/pill-select';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  NUMERIC: 'Numeric',
  COMPLETION: 'Completion',
  BINARY: 'Binary',
};

const TABS: { value: Extract<GoalStatus, 'ACTIVE' | 'COMPLETED'>; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
];

function getProgressCaption(goal: Goal): string {
  if (goal.type === 'NUMERIC') {
    const unit = goal.unit ? ` ${goal.unit}` : '';
    return `${goal.currentValue}/${goal.targetValue ?? '?'}${unit}`;
  }
  if (goal.type === 'COMPLETION') {
    return `${Math.round(goal.progressPercent)}% complete`;
  }
  return goal.progressPercent >= 100 ? 'Completed' : 'In progress';
}

const createGoalSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(200, 'Keep it under 200 characters'),
    description: z.string().max(2000, 'Keep it under 2000 characters').optional(),
    category: z.string().max(60, 'Keep it under 60 characters').optional(),
    type: z.enum(['NUMERIC', 'COMPLETION', 'BINARY']),
    targetValue: z.string().optional(),
    unit: z.string().max(30, 'Keep it under 30 characters').optional(),
    targetDate: z.string().optional(),
    skillIds: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'BINARY') return;
    const numeric = Number(data.targetValue);
    if (!data.targetValue || data.targetValue.trim() === '' || Number.isNaN(numeric) || numeric <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a positive target value', path: ['targetValue'] });
    }
    if (!data.unit || data.unit.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unit is required', path: ['unit'] });
    }
  });

type CreateGoalFormValues = z.infer<typeof createGoalSchema>;

const DEFAULT_FORM_VALUES: CreateGoalFormValues = {
  title: '',
  description: '',
  category: '',
  type: 'BINARY',
  targetValue: '',
  unit: '',
  targetDate: '',
  skillIds: [],
};

export default function GoalsPage() {
  const [status, setStatus] = useState<Extract<GoalStatus, 'ACTIVE' | 'COMPLETED'>>('ACTIVE');
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: goals,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['goals', status],
    queryFn: () => getGoals({ status }),
  });

  const { data: skills } = useQuery({ queryKey: ['skills'], queryFn: getSkills });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateGoalFormValues>({
    resolver: zodResolver(createGoalSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const type = watch('type');
  const skillIds = watch('skillIds') ?? [];

  function closeModal() {
    setModalOpen(false);
    setFormError(null);
    reset(DEFAULT_FORM_VALUES);
  }

  async function onSubmit(values: CreateGoalFormValues) {
    setFormError(null);
    try {
      const input: CreateGoalInput = {
        title: values.title,
        description: values.description?.trim() ? values.description.trim() : undefined,
        category: values.category?.trim() ? values.category.trim() : undefined,
        type: values.type,
        targetDate: values.targetDate?.trim() ? values.targetDate : undefined,
        skillIds: values.skillIds,
      };
      if (values.type !== 'BINARY') {
        input.targetValue = Number(values.targetValue);
        input.unit = values.unit?.trim();
      }
      await createGoal(input);
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      closeModal();
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Could not create goal'));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Goals</h1>
          <p className="mt-1 text-sm text-muted">Track meaningful outcomes over time.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Goal
        </Button>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatus(tab.value)}
            className={clsx(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              status === tab.value ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <p className="text-sm text-danger">Could not load goals.</p>
      ) : !goals || goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title={status === 'ACTIVE' ? 'No active goals yet' : 'No completed goals yet'}
          description={
            status === 'ACTIVE'
              ? 'Create a goal to start tracking progress toward something meaningful.'
              : 'Goals you finish will show up here.'
          }
          action={
            status === 'ACTIVE' ? (
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Goal
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <Link key={goal.id} href={`/goals/${goal.id}`} className="block">
              <Card className="h-full cursor-pointer transition-colors hover:border-primary/40">
                <h3 className="font-semibold text-foreground">{goal.title}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {goal.category && <Badge variant="outline">{goal.category}</Badge>}
                  <Badge variant="primary">{GOAL_TYPE_LABELS[goal.type]}</Badge>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">
                    <span>{getProgressCaption(goal)}</span>
                    <span className="font-medium text-foreground">{Math.round(goal.progressPercent)}%</span>
                  </div>
                  <ProgressBar value={goal.progressPercent} size="sm" />
                </div>

                {goal.skills.length > 0 && (
                  <div className="mt-3">
                    <AttributeDots skills={goal.skills} />
                  </div>
                )}

                {goal.targetDate && (
                  <p className="mt-3 text-xs text-muted">Due {format(new Date(goal.targetDate), 'MMM d, yyyy')}</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Create Goal"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" form="create-goal-form" loading={isSubmitting}>
              Create Goal
            </Button>
          </>
        }
      >
        <form id="create-goal-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...register('title')} />
            <FieldError>{errors.title?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register('description')} />
            <FieldError>{errors.description?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" placeholder="e.g. Fitness" {...register('category')} />
            <FieldError>{errors.category?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="type">Type</Label>
            <Select id="type" {...register('type')}>
              <option value="BINARY">Binary (done / not done)</option>
              <option value="NUMERIC">Numeric (track a number)</option>
              <option value="COMPLETION">Completion (track a percentage)</option>
            </Select>
          </div>

          {type !== 'BINARY' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="targetValue">Target value</Label>
                <Input id="targetValue" type="number" min={0} step="any" {...register('targetValue')} />
                <FieldError>{errors.targetValue?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" placeholder="e.g. pages" {...register('unit')} />
                <FieldError>{errors.unit?.message}</FieldError>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="targetDate">Target date</Label>
            <Input id="targetDate" type="date" {...register('targetDate')} />
          </div>

          {skills && skills.length > 0 && (
            <div>
              <Label>Associated skills</Label>
              <PillSelect
                options={skills.map((skill) => ({ value: skill.id, label: skill.name }))}
                value={skillIds}
                onChange={(value) => setValue('skillIds', value)}
              />
            </div>
          )}

          {formError && <p className="text-sm text-danger">{formError}</p>}
        </form>
      </Modal>
    </div>
  );
}
