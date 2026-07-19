'use client';

import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarClock, CheckSquare, Plus, Target } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCelebration } from '@/hooks/use-celebration';
import { getApiErrorMessage } from '@/lib/api-client';
import { completeQuest, createQuest, getQuests } from '@/lib/api/quests';
import { getGoals } from '@/lib/api/goals';
import { getSkills } from '@/lib/api/skills';
import { Quest, QuestDifficulty, QuestType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PillSelect } from '@/components/ui/pill-select';
import { PageSpinner, Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toaster';

type QuestStatusTab = 'ACTIVE' | 'COMPLETED';

const DIFFICULTY_XP: Record<QuestDifficulty, number> = {
  EASY: 25,
  MEDIUM: 50,
  HARD: 100,
  EPIC: 250,
  LEGENDARY: 500,
};

const DIFFICULTY_BADGE_VARIANT: Record<QuestDifficulty, 'outline' | 'primary' | 'warning' | 'accent' | 'danger'> = {
  EASY: 'outline',
  MEDIUM: 'primary',
  HARD: 'warning',
  EPIC: 'accent',
  LEGENDARY: 'danger',
};

const QUEST_TYPES: QuestType[] = ['ONE_TIME', 'RECURRING', 'DEADLINE', 'MILESTONE'];
const QUEST_DIFFICULTIES: QuestDifficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EPIC', 'LEGENDARY'];

const TYPE_LABELS: Record<QuestType, string> = {
  ONE_TIME: 'One-time',
  RECURRING: 'Recurring',
  DEADLINE: 'Deadline',
  MILESTONE: 'Milestone',
};

const DIFFICULTY_LABELS: Record<QuestDifficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  EPIC: 'Epic',
  LEGENDARY: 'Legendary',
};

const createQuestSchema = z
  .object({
    title: z.string().min(2, 'At least 2 characters').max(120, 'At most 120 characters'),
    description: z.string().max(2000, 'Keep it under 2000 characters').optional(),
    type: z.enum(['ONE_TIME', 'RECURRING', 'DEADLINE', 'MILESTONE']),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EPIC', 'LEGENDARY']),
    goalId: z.string().optional(),
    skillIds: z.array(z.string()),
    deadline: z.string().optional(),
  })
  .refine((values) => values.type !== 'DEADLINE' || !!values.deadline, {
    message: 'Deadline quests need a target date',
    path: ['deadline'],
  });

type CreateQuestFormValues = z.infer<typeof createQuestSchema>;

export default function QuestsPage() {
  const [status, setStatus] = useState<QuestStatusTab>('ACTIVE');
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const celebrate = useCelebration();
  const { push } = useToast();

  const questsQuery = useQuery({
    queryKey: ['quests', status],
    queryFn: () => getQuests({ status }),
  });

  const completeMutation = useMutation({
    mutationFn: completeQuest,
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      await refreshUser();
      celebrate(result);
    },
    onError: (error) => {
      push({ variant: 'default', title: 'Could not complete quest', description: getApiErrorMessage(error) });
    },
  });

  const quests = questsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Quests</h1>
          <p className="mt-1 text-sm text-muted">Complete quests to earn XP and level up your skills.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Quest
        </Button>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface p-1">
        {(['ACTIVE', 'COMPLETED'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatus(tab)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              status === tab ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
            }`}
          >
            {tab === 'ACTIVE' ? 'Active' : 'Completed'}
          </button>
        ))}
      </div>

      {questsQuery.isLoading ? (
        <PageSpinner />
      ) : quests.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={status === 'ACTIVE' ? 'No active quests' : 'No completed quests yet'}
          description={
            status === 'ACTIVE'
              ? 'Create a quest to start earning XP.'
              : 'Complete some active quests to see them here.'
          }
          action={
            status === 'ACTIVE' ? (
              <Button
                onClick={() => {
                  setStatus('ACTIVE');
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Create Quest
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {quests.map((quest) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              status={status}
              onComplete={() => completeMutation.mutate(quest.id)}
              isCompleting={completeMutation.isPending && completeMutation.variables === quest.id}
            />
          ))}
        </div>
      )}

      <CreateQuestModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

interface QuestCardProps {
  quest: Quest;
  status: QuestStatusTab;
  onComplete: () => void;
  isCompleting: boolean;
}

function QuestCard({ quest, status, onComplete, isCompleting }: QuestCardProps) {
  const recurringCompletedToday = quest.type === 'RECURRING' && quest.completedToday === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{quest.title}</CardTitle>
        <Badge variant={DIFFICULTY_BADGE_VARIANT[quest.difficulty]}>{DIFFICULTY_LABELS[quest.difficulty]}</Badge>
      </CardHeader>

      {quest.description && <p className="mb-3 text-sm text-muted">{quest.description}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="success">+{quest.xpReward} XP</Badge>
        {quest.skills.map((skill) => (
          <Badge key={skill.id} variant="default">
            {skill.name}
          </Badge>
        ))}
        {quest.goal && (
          <Badge variant="outline">
            <Target className="h-3 w-3" />
            part of: {quest.goal.title}
          </Badge>
        )}
      </div>

      {quest.deadline && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
          <CalendarClock className="h-3.5 w-3.5" />
          Due {format(new Date(quest.deadline), 'MMM d, yyyy')}
        </p>
      )}

      {status === 'ACTIVE' &&
        (recurringCompletedToday ? (
          <Button variant="secondary" size="sm" disabled className="w-full">
            Completed today
          </Button>
        ) : (
          <Button size="sm" className="w-full" onClick={onComplete} loading={isCompleting}>
            Complete
          </Button>
        ))}
    </Card>
  );
}

function CreateQuestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const goalsQuery = useQuery({
    queryKey: ['goals', 'all'],
    queryFn: () => getGoals(),
    enabled: open,
  });

  const skillsQuery = useQuery({
    queryKey: ['skills'],
    queryFn: getSkills,
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateQuestFormValues>({
    resolver: zodResolver(createQuestSchema),
    defaultValues: {
      title: '',
      description: '',
      type: 'ONE_TIME',
      difficulty: 'EASY',
      goalId: '',
      skillIds: [],
      deadline: '',
    },
  });

  const watchedType = watch('type');

  const createMutation = useMutation({
    mutationFn: createQuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      reset();
      onClose();
    },
    onError: (error) => {
      push({ variant: 'default', title: 'Could not create quest', description: getApiErrorMessage(error) });
    },
  });

  const skillOptions = useMemo(
    () => (skillsQuery.data ?? []).map((skill) => ({ value: skill.id, label: skill.name })),
    [skillsQuery.data],
  );

  function handleClose() {
    reset();
    onClose();
  }

  function onSubmit(values: CreateQuestFormValues) {
    createMutation.mutate({
      title: values.title,
      description: values.description || undefined,
      type: values.type,
      difficulty: values.difficulty,
      goalId: values.goalId ? values.goalId : undefined,
      skillIds: values.skillIds,
      deadline: values.type === 'DEADLINE' && values.deadline ? new Date(values.deadline).toISOString() : undefined,
    });
  }

  return (
    <Modal open={open} onClose={handleClose} title="Create Quest">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="type">Type</Label>
            <Select id="type" {...register('type')}>
              {QUEST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
            <FieldError>{errors.type?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="difficulty">Difficulty</Label>
            <Select id="difficulty" {...register('difficulty')}>
              {QUEST_DIFFICULTIES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {DIFFICULTY_LABELS[difficulty]} ({DIFFICULTY_XP[difficulty]} XP)
                </option>
              ))}
            </Select>
            <FieldError>{errors.difficulty?.message}</FieldError>
          </div>
        </div>

        {watchedType === 'DEADLINE' && (
          <div>
            <Label htmlFor="deadline">Deadline</Label>
            <Input id="deadline" type="date" {...register('deadline')} />
            <FieldError>{errors.deadline?.message}</FieldError>
          </div>
        )}

        <div>
          <Label htmlFor="goalId">Goal</Label>
          <Select id="goalId" {...register('goalId')}>
            <option value="">No goal</option>
            {(goalsQuery.data ?? []).map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Skills</Label>
          {skillsQuery.isLoading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Controller
              control={control}
              name="skillIds"
              render={({ field }) => (
                <PillSelect options={skillOptions} value={field.value} onChange={field.onChange} />
              )}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting || createMutation.isPending}>
            Create Quest
          </Button>
        </div>
      </form>
    </Modal>
  );
}
