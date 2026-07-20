'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarClock, CheckSquare, Flame, Gift, Lock, Plus, Target } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCelebration } from '@/hooks/use-celebration';
import { getApiErrorMessage } from '@/lib/api-client';
import { claimQuestReward, completeQuest, createQuest, getQuests } from '@/lib/api/quests';
import { getGoals } from '@/lib/api/goals';
import { getSkills } from '@/lib/api/skills';
import { getAttributes } from '@/lib/api/attributes';
import { getAchievements } from '@/lib/api/achievements';
import { getChallenges } from '@/lib/api/challenges';
import { Challenge, Quest, QuestCategory, QuestDifficulty, QuestRequirementInput, QuestType } from '@/lib/types';
import { AttributeDots } from '@/components/ui/attribute-dots';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PillSelect } from '@/components/ui/pill-select';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RewardBundleEditor, RewardBundleValue } from '@/components/ui/reward-bundle-editor';
import { RequirementsEditor } from '@/components/ui/requirements-editor';
import { PageSpinner, Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toaster';

const EMPTY_REWARD_BUNDLE: RewardBundleValue = { skillRewardOverrides: [], attributeBonuses: [] };
const EMPTY_REQUIREMENTS: QuestRequirementInput[] = [];

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
const QUEST_CATEGORIES: QuestCategory[] = ['DAILY', 'WEEKLY', 'LONG_TERM', 'SYSTEM'];

const TYPE_LABELS: Record<QuestType, string> = {
  ONE_TIME: 'One-time',
  RECURRING: 'Recurring',
  DEADLINE: 'Deadline',
  MILESTONE: 'Milestone',
};

const CATEGORY_LABELS: Record<QuestCategory, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  LONG_TERM: 'Long-Term',
  SYSTEM: 'System',
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
    category: z.enum(['DAILY', 'WEEKLY', 'LONG_TERM', 'SYSTEM']),
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
  const [category, setCategory] = useState<QuestCategory | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const celebrate = useCelebration();
  const { push } = useToast();

  const questsQuery = useQuery({
    queryKey: ['quests', status, category],
    queryFn: () => getQuests({ status, category: category === 'ALL' ? undefined : category }),
  });

  const completeMutation = useMutation({
    mutationFn: completeQuest,
    onSuccess: () => {
      // No XP moves yet on complete() alone - "Claim Reward" is the step
      // that actually awards it (see claimMutation), so there's nothing to
      // celebrate here, just a refetch to flip the button to "Claim Reward".
      queryClient.invalidateQueries({ queryKey: ['quests'] });
    },
    onError: (error) => {
      push({ variant: 'default', title: 'Could not complete quest', description: getApiErrorMessage(error) });
    },
  });

  const claimMutation = useMutation({
    mutationFn: claimQuestReward,
    onSuccess: async (results) => {
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      // Challenge progress is driven by an async domain-event listener, so this
      // may still show stale data for a moment - ChallengesSection also polls
      // every 5s as a fallback in case the listener hasn't finished yet.
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      await refreshUser();
      results.forEach((result) => celebrate(result));
    },
    onError: (error) => {
      push({ variant: 'default', title: 'Could not claim reward', description: getApiErrorMessage(error) });
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

      <ChallengesSection />

      <div className="flex flex-wrap items-center justify-between gap-3">
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

        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
          {(['ALL', ...QUEST_CATEGORIES] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setCategory(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                category === tab ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
              }`}
            >
              {tab === 'ALL' ? 'All' : CATEGORY_LABELS[tab]}
            </button>
          ))}
        </div>
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
              onClaim={() => claimMutation.mutate(quest.id)}
              isClaiming={claimMutation.isPending && claimMutation.variables === quest.id}
            />
          ))}
        </div>
      )}

      <CreateQuestModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

/**
 * System-generated Daily/Weekly Challenges - read-only, no create/edit UI.
 * Polls every 5s while mounted since a challenge's progress is driven by a
 * fire-and-forget domain-event listener on the backend (see
 * docs/gameplay-systems.md), so it can land slightly after the HTTP
 * response for whatever quest/habit/goal completion triggered it.
 */
function ChallengesSection() {
  const { push } = useToast();
  const previousStatuses = useRef<Map<string, Challenge['status']>>(new Map());

  const challengesQuery = useQuery({
    queryKey: ['challenges'],
    queryFn: getChallenges,
    refetchInterval: 5000,
  });

  const challenges = useMemo(
    () => [...(challengesQuery.data ?? [])].sort((a, b) => a.type.localeCompare(b.type)),
    [challengesQuery.data],
  );

  useEffect(() => {
    if (!challengesQuery.data) return;
    for (const challenge of challengesQuery.data) {
      const previousStatus = previousStatuses.current.get(challenge.id);
      if (challenge.status === 'COMPLETED' && previousStatus !== 'COMPLETED') {
        push({ variant: 'xp', title: 'Challenge complete!', description: `${challenge.title} - +${challenge.xpReward} XP` });
      }
      previousStatuses.current.set(challenge.id, challenge.status);
    }
  }, [challengesQuery.data, push]);

  if (challenges.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {challenges.map((challenge) => (
        <Card key={challenge.id} className={challenge.status === 'COMPLETED' ? 'border-success/40' : undefined}>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Flame className="h-3.5 w-3.5" />
            {challenge.type === 'DAILY' ? 'Daily Challenge' : 'Weekly Challenge'}
          </div>
          <p className="text-sm font-semibold text-foreground">{challenge.title}</p>
          <p className="mt-1 text-xs text-muted">{challenge.description}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            {challenge.type === 'WEEKLY' ? (
              <div className="flex-1">
                <ProgressBar value={challenge.progressPercent} size="sm" />
                <p className="mt-1 text-xs text-muted">
                  {challenge.progressXp}/{challenge.targetXp} XP
                </p>
              </div>
            ) : (
              <span className="text-xs text-muted">{challenge.status === 'COMPLETED' ? 'Complete' : 'Not yet done today'}</span>
            )}
            <Badge variant={challenge.status === 'COMPLETED' ? 'success' : 'accent'}>+{challenge.xpReward} XP</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

interface QuestCardProps {
  quest: Quest;
  status: QuestStatusTab;
  onComplete: () => void;
  isCompleting: boolean;
  onClaim: () => void;
  isClaiming: boolean;
}

function QuestCard({ quest, status, onComplete, isCompleting, onClaim, isClaiming }: QuestCardProps) {
  const recurringCompletedToday = quest.type === 'RECURRING' && quest.completedToday === true;
  const hasPendingReward = quest.unclaimedCompletions > 0;

  return (
    <Card className={quest.isLocked ? 'opacity-70 grayscale' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {quest.isLocked && <Lock className="h-3.5 w-3.5 text-muted" />}
          {quest.title}
        </CardTitle>
        <Badge variant={DIFFICULTY_BADGE_VARIANT[quest.difficulty]}>{DIFFICULTY_LABELS[quest.difficulty]}</Badge>
      </CardHeader>

      {quest.description && <p className="mb-3 text-sm text-muted">{quest.description}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="success">+{quest.xpReward} XP</Badge>
        {quest.category !== 'LONG_TERM' && <Badge variant="accent">{CATEGORY_LABELS[quest.category]}</Badge>}
        <AttributeDots skills={quest.skills} />
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

      {quest.requirements.length > 0 && (
        <ul className="mb-3 space-y-1 text-xs">
          {quest.requirements.map((requirement, index) => (
            <li key={index} className={requirement.met ? 'text-success' : 'text-muted'}>
              {requirement.met ? '✓' : '✗'} {requirement.description}
              {requirement.progress && !requirement.met && (
                <span className="ml-1 text-muted">
                  ({requirement.progress.current}/{requirement.progress.target})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasPendingReward ? (
        <Button size="sm" className="w-full" onClick={onClaim} loading={isClaiming}>
          <Gift className="h-4 w-4" />
          Claim Reward
        </Button>
      ) : (
        status === 'ACTIVE' &&
        (quest.isLocked ? (
          <Button variant="secondary" size="sm" disabled className="w-full">
            Locked
          </Button>
        ) : recurringCompletedToday ? (
          <Button variant="secondary" size="sm" disabled className="w-full">
            Completed today
          </Button>
        ) : (
          <Button size="sm" className="w-full" onClick={onComplete} loading={isCompleting}>
            Complete
          </Button>
        ))
      )}
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

  const attributesQuery = useQuery({
    queryKey: ['attributes'],
    queryFn: getAttributes,
    enabled: open,
  });

  const achievementsQuery = useQuery({
    queryKey: ['achievements'],
    queryFn: getAchievements,
    enabled: open,
  });

  const questsQuery = useQuery({
    queryKey: ['quests', 'all'],
    queryFn: () => getQuests(),
    enabled: open,
  });

  const [rewardBundle, setRewardBundle] = useState<RewardBundleValue>(EMPTY_REWARD_BUNDLE);
  const [requirements, setRequirements] = useState<QuestRequirementInput[]>(EMPTY_REQUIREMENTS);

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
      category: 'LONG_TERM',
      goalId: '',
      skillIds: [],
      deadline: '',
    },
  });

  const watchedType = watch('type');
  const watchedDifficulty = watch('difficulty');
  const watchedSkillIds = watch('skillIds');

  const createMutation = useMutation({
    mutationFn: createQuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      reset();
      setRewardBundle(EMPTY_REWARD_BUNDLE);
      setRequirements(EMPTY_REQUIREMENTS);
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

  const taggedSkills = useMemo(
    () => (skillsQuery.data ?? []).filter((skill) => watchedSkillIds.includes(skill.id)).map((skill) => ({ id: skill.id, name: skill.name })),
    [skillsQuery.data, watchedSkillIds],
  );

  function handleClose() {
    reset();
    setRewardBundle(EMPTY_REWARD_BUNDLE);
    setRequirements(EMPTY_REQUIREMENTS);
    onClose();
  }

  function onSubmit(values: CreateQuestFormValues) {
    // Safety net: drop any override for a skill that got un-tagged after the override was set.
    const skillRewardOverrides = rewardBundle.skillRewardOverrides.filter((o) => values.skillIds.includes(o.skillId));

    createMutation.mutate({
      title: values.title,
      description: values.description || undefined,
      type: values.type,
      difficulty: values.difficulty,
      category: values.category,
      goalId: values.goalId ? values.goalId : undefined,
      skillIds: values.skillIds,
      skillRewardOverrides: skillRewardOverrides.length ? skillRewardOverrides : undefined,
      attributeBonuses: rewardBundle.attributeBonuses.length ? rewardBundle.attributeBonuses : undefined,
      deadline: values.type === 'DEADLINE' && values.deadline ? new Date(values.deadline).toISOString() : undefined,
      requirements: requirements.length ? requirements : undefined,
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

          <div>
            <Label htmlFor="category">Board category</Label>
            <Select id="category" {...register('category')}>
              {QUEST_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </Select>
            <FieldError>{errors.category?.message}</FieldError>
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

        <RewardBundleEditor
          taggedSkills={taggedSkills}
          attributes={attributesQuery.data ?? []}
          flatXpReward={DIFFICULTY_XP[watchedDifficulty]}
          value={rewardBundle}
          onChange={setRewardBundle}
        />

        <RequirementsEditor
          skills={skillsQuery.data ?? []}
          attributes={attributesQuery.data ?? []}
          achievements={achievementsQuery.data ?? []}
          quests={questsQuery.data ?? []}
          goals={goalsQuery.data ?? []}
          value={requirements}
          onChange={setRequirements}
        />

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
