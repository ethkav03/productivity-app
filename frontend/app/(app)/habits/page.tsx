'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import clsx from 'clsx';
import { Check, Flame, Loader2, Pause, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PillSelect } from '@/components/ui/pill-select';
import { ProgressBar } from '@/components/ui/progress-bar';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toaster';
import { useAuth } from '@/hooks/use-auth';
import { useCelebration } from '@/hooks/use-celebration';
import { getApiErrorMessage } from '@/lib/api-client';
import { CreateHabitInput, completeHabit, createHabit, deleteHabit, getHabits, updateHabit } from '@/lib/api/habits';
import { getSkills } from '@/lib/api/skills';
import { Habit, HabitFrequency } from '@/lib/types';

const DAY_OPTIONS = [
  { value: '0', label: 'Sun' },
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
];

const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'DAYS_OF_WEEK', label: 'Specific days of the week' },
  { value: 'TIMES_PER_WEEK', label: 'A number of times per week' },
  { value: 'MONTHLY', label: 'Monthly' },
];

const habitFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200, 'Keep it under 200 characters'),
    description: z.string().max(1000).optional(),
    frequency: z.enum(['DAILY', 'DAYS_OF_WEEK', 'TIMES_PER_WEEK', 'MONTHLY']),
    daysOfWeek: z.array(z.string()),
    timesPerWeek: z
      .number({ invalid_type_error: 'Enter a number' })
      .int('Whole numbers only')
      .min(1, 'Must be at least 1')
      .max(14, 'Must be 14 or less'),
    timeOfDay: z.string().optional(),
    xpReward: z
      .number({ invalid_type_error: 'Enter a number' })
      .int('Whole numbers only')
      .min(1, 'Must be at least 1'),
    skillIds: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    if (values.frequency === 'DAYS_OF_WEEK' && values.daysOfWeek.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select at least one day', path: ['daysOfWeek'] });
    }
  });

type HabitFormValues = z.infer<typeof habitFormSchema>;

const DEFAULT_FORM_VALUES: HabitFormValues = {
  title: '',
  description: '',
  frequency: 'DAILY',
  daysOfWeek: [],
  timesPerWeek: 3,
  timeOfDay: '',
  xpReward: 10,
  skillIds: [],
};

export default function HabitsPage() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const celebrate = useCelebration();
  const { push } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const habitsQuery = useQuery({ queryKey: ['habits'], queryFn: getHabits });
  const skillsQuery = useQuery({ queryKey: ['skills'], queryFn: getSkills });

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<HabitFormValues>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const frequency = watch('frequency');

  function closeModal() {
    setIsModalOpen(false);
    reset(DEFAULT_FORM_VALUES);
  }

  function openCreateModal() {
    reset(DEFAULT_FORM_VALUES);
    setIsModalOpen(true);
  }

  const completeMutation = useMutation({
    mutationFn: completeHabit,
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      await refreshUser();
      celebrate(result);
    },
    onError: (error) => {
      push({ title: "Couldn't complete habit", description: getApiErrorMessage(error) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { isActive: boolean } }) => updateHabit(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
    },
    onError: (error) => {
      push({ title: "Couldn't update habit", description: getApiErrorMessage(error) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHabit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
    },
    onError: (error) => {
      push({ title: "Couldn't delete habit", description: getApiErrorMessage(error) });
    },
  });

  const createMutation = useMutation({
    mutationFn: createHabit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      closeModal();
    },
    onError: (error) => {
      push({ title: "Couldn't create habit", description: getApiErrorMessage(error) });
    },
  });

  function onSubmit(values: HabitFormValues) {
    const input: CreateHabitInput = {
      title: values.title.trim(),
      frequency: values.frequency,
      xpReward: values.xpReward,
      skillIds: values.skillIds,
    };
    const description = values.description?.trim();
    if (description) input.description = description;
    if (values.frequency === 'DAYS_OF_WEEK') {
      input.daysOfWeek = values.daysOfWeek.map(Number);
    }
    if (values.frequency === 'TIMES_PER_WEEK') {
      input.timesPerWeek = values.timesPerWeek;
    }
    if (values.timeOfDay) input.timeOfDay = values.timeOfDay;
    createMutation.mutate(input);
  }

  function handleDelete(habit: Habit) {
    if (!window.confirm(`Delete "${habit.title}"? This can't be undone.`)) return;
    deleteMutation.mutate(habit.id);
  }

  if (habitsQuery.isLoading) {
    return <PageSpinner />;
  }

  const habits = habitsQuery.data ?? [];
  const activeHabits = habits.filter((h) => h.isActive);
  const inactiveHabits = habits.filter((h) => !h.isActive);
  const completedTodayCount = activeHabits.filter((h) => h.completedToday).length;
  const progressPercent = activeHabits.length > 0 ? (completedTodayCount / activeHabits.length) * 100 : 0;
  const skillOptions = (skillsQuery.data ?? []).map((skill) => ({ value: skill.id, label: skill.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Habits</h1>
          <p className="text-sm text-muted">Small daily actions that build your streaks.</p>
        </div>
        {habits.length > 0 && (
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Create Habit
          </Button>
        )}
      </div>

      {habits.length === 0 ? (
        <EmptyState
          icon={Flame}
          title="No habits yet"
          description="Create your first habit to start building streaks and earning XP every day."
          action={
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Create Habit
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Habits</CardTitle>
              <span className="text-xs font-medium text-muted">
                {completedTodayCount}/{activeHabits.length} completed today
              </span>
            </CardHeader>
            <ProgressBar value={progressPercent} className="mb-4" />
            {activeHabits.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                All your habits are paused. Reactivate one below to get started today.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {activeHabits.map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    onComplete={() => completeMutation.mutate(habit.id)}
                    isCompleting={completeMutation.isPending && completeMutation.variables === habit.id}
                    onPause={() => updateMutation.mutate({ id: habit.id, input: { isActive: false } })}
                    isPausing={
                      updateMutation.isPending &&
                      updateMutation.variables?.id === habit.id &&
                      updateMutation.variables?.input.isActive === false
                    }
                    onDelete={() => handleDelete(habit)}
                    isDeleting={deleteMutation.isPending && deleteMutation.variables === habit.id}
                  />
                ))}
              </ul>
            )}
          </Card>

          {inactiveHabits.length > 0 && (
            <Card className="opacity-60 transition-opacity hover:opacity-100">
              <CardHeader>
                <CardTitle className="text-muted">Paused Habits</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border">
                {inactiveHabits.map((habit) => {
                  const isReactivating =
                    updateMutation.isPending &&
                    updateMutation.variables?.id === habit.id &&
                    updateMutation.variables?.input.isActive === true;
                  return (
                    <li key={habit.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{habit.title}</p>
                        {habit.description && <p className="truncate text-xs text-muted">{habit.description}</p>}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        loading={isReactivating}
                        onClick={() => updateMutation.mutate({ id: habit.id, input: { isActive: true } })}
                      >
                        Reactivate
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title="Create Habit"
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" form="create-habit-form" loading={createMutation.isPending}>
              Create Habit
            </Button>
          </>
        }
      >
        <form id="create-habit-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="habit-title">Title</Label>
            <Input id="habit-title" placeholder="e.g. Morning meditation" {...register('title')} />
            <FieldError>{errors.title?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="habit-description">Description</Label>
            <Textarea id="habit-description" placeholder="Optional details" {...register('description')} />
          </div>

          <div>
            <Label htmlFor="habit-frequency">Frequency</Label>
            <Select id="habit-frequency" {...register('frequency')}>
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          {frequency === 'DAYS_OF_WEEK' && (
            <div>
              <Label>Days</Label>
              <Controller
                control={control}
                name="daysOfWeek"
                render={({ field }) => <PillSelect options={DAY_OPTIONS} value={field.value} onChange={field.onChange} />}
              />
              <FieldError>{errors.daysOfWeek?.message}</FieldError>
            </div>
          )}

          {frequency === 'TIMES_PER_WEEK' && (
            <div>
              <Label htmlFor="habit-times-per-week">Times per week</Label>
              <Input
                id="habit-times-per-week"
                type="number"
                min={1}
                max={14}
                {...register('timesPerWeek', { valueAsNumber: true })}
              />
              <FieldError>{errors.timesPerWeek?.message}</FieldError>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="habit-time-of-day">Time of day</Label>
              <Input id="habit-time-of-day" type="time" {...register('timeOfDay')} />
            </div>
            <div>
              <Label htmlFor="habit-xp-reward">XP reward</Label>
              <Input id="habit-xp-reward" type="number" min={1} {...register('xpReward', { valueAsNumber: true })} />
              <FieldError>{errors.xpReward?.message}</FieldError>
            </div>
          </div>

          <div>
            <Label>Skills</Label>
            {skillOptions.length > 0 ? (
              <Controller
                control={control}
                name="skillIds"
                render={({ field }) => <PillSelect options={skillOptions} value={field.value} onChange={field.onChange} />}
              />
            ) : (
              <p className="text-xs text-muted">No skills yet — you can link this habit to a skill later.</p>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}

interface HabitRowProps {
  habit: Habit;
  onComplete: () => void;
  isCompleting: boolean;
  onPause: () => void;
  isPausing: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}

function HabitRow({ habit, onComplete, isCompleting, onPause, isPausing, onDelete, isDeleting }: HabitRowProps) {
  const done = habit.completedToday;

  return (
    <li className="flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={onComplete}
        disabled={done || isCompleting}
        aria-label={done ? `${habit.title} completed today` : `Mark ${habit.title} complete`}
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed',
          done
            ? 'border-success bg-success/15 text-success'
            : 'border-border text-transparent hover:border-primary hover:text-primary/40',
        )}
      >
        {isCompleting ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : <Check className="h-4 w-4" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={clsx('text-sm font-medium', done ? 'text-muted line-through' : 'text-foreground')}>{habit.title}</p>
          <Badge variant="accent">+{habit.xpReward} XP</Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <Flame className={clsx('h-3.5 w-3.5', habit.currentStreak > 0 ? 'text-warning' : 'text-muted')} />
          <span>{habit.currentStreak} day streak</span>
          <span className="text-muted/70">Best: {habit.longestStreak}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onPause}
          disabled={isPausing}
          aria-label={`Pause ${habit.title}`}
          title="Pause habit"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPausing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label={`Delete ${habit.title}`}
          title="Delete habit"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </li>
  );
}
