'use client';

import { useState } from 'react';
import { getApiErrorMessage } from '@/lib/api-client';
import { DefaultSkillDefinition } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/input';
import { PillSelect } from '@/components/ui/pill-select';
import { Spinner } from '@/components/ui/spinner';

interface SkillsStepProps {
  selected: string[];
  onChange: (value: string[]) => void;
  suggestions: DefaultSkillDefinition[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onNext: () => void;
  onBack: () => void;
}

export function SkillsStep({
  selected,
  onChange,
  suggestions,
  isLoading,
  isError,
  error,
  onNext,
  onBack,
}: SkillsStepProps) {
  const [attempted, setAttempted] = useState(false);

  function handleNext() {
    if (selected.length === 0) {
      setAttempted(true);
      return;
    }
    onNext();
  }

  function handleChange(value: string[]) {
    onChange(value);
    if (value.length > 0) setAttempted(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Choose your starting skills</h2>
        <p className="mt-1 text-sm text-muted">
          Pick the areas of life you want to level up. You can add more later.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {isError && (
        <p className="text-sm text-danger">{getApiErrorMessage(error, 'Could not load skill suggestions')}</p>
      )}

      {!isLoading && !isError && (
        <PillSelect
          options={suggestions.map((s) => ({ value: s.name, label: s.name }))}
          value={selected}
          onChange={handleChange}
        />
      )}

      {attempted && selected.length === 0 && <FieldError>Select at least one skill to continue.</FieldError>}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button type="button" className="flex-1" onClick={handleNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
