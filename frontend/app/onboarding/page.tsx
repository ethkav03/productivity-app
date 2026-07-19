'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Swords } from 'lucide-react';
import { createSkill, getSkillSuggestions } from '@/lib/api/skills';
import { createGoal } from '@/lib/api/goals';
import { createQuest } from '@/lib/api/quests';
import { createHabit } from '@/lib/api/habits';
import { getApiErrorMessage } from '@/lib/api-client';
import { Skill } from '@/lib/types';
import { StepDots } from './_components/step-dots';
import { WelcomeStep } from './_components/welcome-step';
import { SkillsStep } from './_components/skills-step';
import { GoalStep, GoalFormState, INITIAL_GOAL_FORM } from './_components/goal-step';
import { ActivitiesStep, makeId, QuickHabit, QuickQuest } from './_components/activities-step';
import { buildStarterQuests } from './_components/starter-quests';

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [goal, setGoal] = useState<GoalFormState>(INITIAL_GOAL_FORM);
  const [quests, setQuests] = useState<QuickQuest[]>([]);
  const [habits, setHabits] = useState<QuickHabit[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    isError: suggestionsIsError,
    error: suggestionsError,
  } = useQuery({ queryKey: ['skill-suggestions'], queryFn: getSkillSuggestions });

  // Auto-populate a few starter quests the first time the user reaches this
  // step, one per selected skill, so they don't start from a blank list.
  // Guarded on an empty list so it never clobbers edits made after going
  // back and forth between steps.
  useEffect(() => {
    if (step !== 4 || quests.length > 0 || selectedSkills.length === 0) return;
    const starterQuests = buildStarterQuests(selectedSkills).map((template) => ({
      id: makeId(),
      title: template.title,
      description: template.description,
      difficulty: template.difficulty,
      suggested: true,
    }));
    setQuests(starterQuests);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function goNext() {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function goBack() {
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleBeginJourney() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const skillDefs = (suggestions ?? []).filter((def) => selectedSkills.includes(def.name));
      const createdSkills: Skill[] = await Promise.all(
        skillDefs.map((def) => createSkill({ name: def.name, description: def.description, icon: def.icon })),
      );
      const skillIds = createdSkills.map((s) => s.id);

      const requiresTarget = goal.type !== 'BINARY';
      const createdGoal = await createGoal({
        title: goal.title.trim(),
        type: goal.type,
        targetValue: requiresTarget && goal.targetValue.trim() ? Number(goal.targetValue) : undefined,
        unit: requiresTarget && goal.unit.trim() ? goal.unit.trim() : undefined,
        category: goal.category.trim() || undefined,
        skillIds,
      });

      await Promise.all([
        ...quests.map((quest) =>
          createQuest({
            title: quest.title,
            description: quest.description,
            type: 'ONE_TIME',
            difficulty: quest.difficulty,
            goalId: createdGoal.id,
            skillIds,
          }),
        ),
        ...habits.map((habit) =>
          createHabit({
            title: habit.title,
            frequency: habit.frequency,
            skillIds,
          }),
        ),
      ]);

      router.push('/dashboard');
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, 'Could not finish setting up your journey. Please try again.'));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Swords className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold tracking-tight text-foreground">Life RPG</span>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <StepDots current={step} />

        {step === 1 && <WelcomeStep onNext={goNext} />}

        {step === 2 && (
          <SkillsStep
            selected={selectedSkills}
            onChange={setSelectedSkills}
            suggestions={suggestions ?? []}
            isLoading={suggestionsLoading}
            isError={suggestionsIsError}
            error={suggestionsError}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 3 && <GoalStep value={goal} onChange={setGoal} onNext={goNext} onBack={goBack} />}

        {step === 4 && (
          <ActivitiesStep
            quests={quests}
            habits={habits}
            onAddQuest={(quest) => setQuests((prev) => [...prev, quest])}
            onRemoveQuest={(id) => setQuests((prev) => prev.filter((q) => q.id !== id))}
            onAddHabit={(habit) => setHabits((prev) => [...prev, habit])}
            onRemoveHabit={(id) => setHabits((prev) => prev.filter((h) => h.id !== id))}
            onBack={goBack}
            onSubmit={handleBeginJourney}
            submitting={submitting}
            submitError={submitError}
          />
        )}
      </div>
    </div>
  );
}
