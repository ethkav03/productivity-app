'use client';

import { GoalType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';

export interface GoalFormState {
  title: string;
  type: GoalType;
  targetValue: string;
  unit: string;
  category: string;
}

export const INITIAL_GOAL_FORM: GoalFormState = {
  title: '',
  type: 'BINARY',
  targetValue: '',
  unit: '',
  category: '',
};

interface GoalStepProps {
  value: GoalFormState;
  onChange: (value: GoalFormState) => void;
  onNext: () => void;
  onBack: () => void;
}

export function GoalStep({ value, onChange, onNext, onBack }: GoalStepProps) {
  const requiresTarget = value.type !== 'BINARY';
  const canContinue = value.title.trim().length > 0 && (!requiresTarget || value.targetValue.trim().length > 0);

  function set<K extends keyof GoalFormState>(key: K, fieldValue: GoalFormState[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Create your first goal</h2>
        <p className="mt-1 text-sm text-muted">This is the mission your quests and habits will support.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="goal-title">Goal title</Label>
          <Input
            id="goal-title"
            placeholder="e.g. Get in the best shape of my life"
            value={value.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="goal-type">Type</Label>
          <Select id="goal-type" value={value.type} onChange={(e) => set('type', e.target.value as GoalType)}>
            <option value="BINARY">Binary (done / not done)</option>
            <option value="NUMERIC">Numeric (track a number)</option>
            <option value="COMPLETION">Completion (track progress toward a target)</option>
          </Select>
        </div>

        {requiresTarget && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="goal-target">Target value</Label>
              <Input
                id="goal-target"
                type="number"
                min={0}
                value={value.targetValue}
                onChange={(e) => set('targetValue', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="goal-unit">Unit</Label>
              <Input
                id="goal-unit"
                placeholder="e.g. books, km, sessions"
                value={value.unit}
                onChange={(e) => set('unit', e.target.value)}
              />
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="goal-category">Category (optional)</Label>
          <Input
            id="goal-category"
            placeholder="e.g. Health, Career, Relationships"
            value={value.category}
            onChange={(e) => set('category', e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button type="button" className="flex-1" disabled={!canContinue} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
