'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { HabitFrequency, QuestDifficulty } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Select } from '@/components/ui/input';

export interface QuickQuest {
  id: string;
  title: string;
  difficulty: QuestDifficulty;
  description?: string;
  suggested?: boolean;
}

export interface QuickHabit {
  id: string;
  title: string;
  frequency: HabitFrequency;
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const FREQUENCY_LABELS: Record<HabitFrequency, string> = {
  DAILY: 'Daily',
  DAYS_OF_WEEK: 'Days of week',
  TIMES_PER_WEEK: 'Times per week',
  MONTHLY: 'Monthly',
};

interface ActivitiesStepProps {
  quests: QuickQuest[];
  habits: QuickHabit[];
  onAddQuest: (quest: QuickQuest) => void;
  onRemoveQuest: (id: string) => void;
  onAddHabit: (habit: QuickHabit) => void;
  onRemoveHabit: (id: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
}

export function ActivitiesStep({
  quests,
  habits,
  onAddQuest,
  onRemoveQuest,
  onAddHabit,
  onRemoveHabit,
  onBack,
  onSubmit,
  submitting,
  submitError,
}: ActivitiesStepProps) {
  const [questTitle, setQuestTitle] = useState('');
  const [questDifficulty, setQuestDifficulty] = useState<QuestDifficulty>('EASY');
  const [habitTitle, setHabitTitle] = useState('');
  const [habitFrequency, setHabitFrequency] = useState<HabitFrequency>('DAILY');
  const [attempted, setAttempted] = useState(false);

  const canSubmit = quests.length > 0 || habits.length > 0;
  const hasSuggestedQuests = quests.some((quest) => quest.suggested);

  function addQuest() {
    if (!questTitle.trim()) return;
    onAddQuest({ id: makeId(), title: questTitle.trim(), difficulty: questDifficulty });
    setQuestTitle('');
    setQuestDifficulty('EASY');
  }

  function addHabit() {
    if (!habitTitle.trim()) return;
    onAddHabit({ id: makeId(), title: habitTitle.trim(), frequency: habitFrequency });
    setHabitTitle('');
    setHabitFrequency('DAILY');
  }

  function handleSubmit() {
    if (!canSubmit) {
      setAttempted(true);
      return;
    }
    onSubmit();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Add starter quests &amp; habits</h2>
        <p className="mt-1 text-sm text-muted">
          {hasSuggestedQuests
            ? "We've added a few starter quests based on the skills you picked - edit, remove, or add your own below."
            : 'These will be linked to your goal and tagged with the skills you picked.'}
        </p>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-medium text-foreground">Quick Quest</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="e.g. Read 10 pages"
            value={questTitle}
            onChange={(e) => setQuestTitle(e.target.value)}
            className="flex-1"
          />
          <Select
            value={questDifficulty}
            onChange={(e) => setQuestDifficulty(e.target.value as QuestDifficulty)}
            className="sm:w-32"
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </Select>
          <Button type="button" variant="secondary" onClick={addQuest} className="shrink-0">
            <Plus className="h-4 w-4" />
            Add Quest
          </Button>
        </div>

        {quests.length > 0 && (
          <ul className="mt-3 space-y-2">
            {quests.map((quest) => (
              <li
                key={quest.id}
                className="flex items-start justify-between gap-3 rounded-lg bg-surface-hover px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="text-foreground">
                    {quest.title} <span className="text-muted">· {quest.difficulty}</span>
                    {quest.suggested && (
                      <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        Suggested
                      </span>
                    )}
                  </span>
                  {quest.description && <p className="mt-0.5 text-xs text-muted">{quest.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveQuest(quest.id)}
                  className="shrink-0 text-muted hover:text-danger"
                  aria-label={`Remove ${quest.title}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-medium text-foreground">Quick Habit</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="e.g. Morning meditation"
            value={habitTitle}
            onChange={(e) => setHabitTitle(e.target.value)}
            className="flex-1"
          />
          <Select
            value={habitFrequency}
            onChange={(e) => setHabitFrequency(e.target.value as HabitFrequency)}
            className="sm:w-40"
          >
            <option value="DAILY">Daily</option>
            <option value="DAYS_OF_WEEK">Days of week</option>
            <option value="TIMES_PER_WEEK">Times per week</option>
            <option value="MONTHLY">Monthly</option>
          </Select>
          <Button type="button" variant="secondary" onClick={addHabit} className="shrink-0">
            <Plus className="h-4 w-4" />
            Add Habit
          </Button>
        </div>

        {habits.length > 0 && (
          <ul className="mt-3 space-y-2">
            {habits.map((habit) => (
              <li
                key={habit.id}
                className="flex items-center justify-between rounded-lg bg-surface-hover px-3 py-2 text-sm"
              >
                <span className="text-foreground">
                  {habit.title} <span className="text-muted">· {FREQUENCY_LABELS[habit.frequency]}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveHabit(habit.id)}
                  className="text-muted hover:text-danger"
                  aria-label={`Remove ${habit.title}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {attempted && !canSubmit && (
        <FieldError>Add at least one quest or habit to begin your journey.</FieldError>
      )}
      {submitError && <p className="text-sm text-danger">{submitError}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="button" className="flex-1" onClick={handleSubmit} loading={submitting}>
          Begin Journey
        </Button>
      </div>
    </div>
  );
}
