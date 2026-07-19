'use client';

import { useState } from 'react';
import { getApiErrorMessage } from '@/lib/api-client';
import { DefaultAttributeGroup } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/input';
import { PillSelect } from '@/components/ui/pill-select';
import { Spinner } from '@/components/ui/spinner';

/** Selection values are composite `${attributeKey}:${skillName}` keys - skill
 * names can repeat across attributes (e.g. "Focus" under both Intelligence
 * and Discipline), so a plain name isn't a unique key on its own. */
export function skillSelectionKey(attributeKey: string, skillName: string): string {
  return `${attributeKey}:${skillName}`;
}

interface SkillsStepProps {
  selected: string[];
  onChange: (value: string[]) => void;
  suggestions: DefaultAttributeGroup[];
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
          Every skill belongs to one of your 8 attributes. Pick a few to start - you can add more later.
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
        <div className="max-h-80 space-y-4 overflow-y-auto pr-1 scrollbar-thin">
          {suggestions.map((group) => (
            <div key={group.key}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{group.name}</p>
              <PillSelect
                options={group.skills.map((skill) => ({
                  value: skillSelectionKey(group.key, skill.name),
                  label: skill.name,
                }))}
                value={selected}
                onChange={handleChange}
              />
            </div>
          ))}
        </div>
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
