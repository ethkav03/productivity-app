'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { AttributeKey, QuestRequirementInput, QuestRequirementType } from '@/lib/types';
import { Button } from './button';
import { Input, Select } from './input';

interface SkillOption {
  id: string;
  name: string;
}

interface AttributeOption {
  id: string;
  key: AttributeKey;
  name: string;
}

interface AchievementOption {
  id: string;
  name: string;
}

interface QuestOption {
  id: string;
  title: string;
}

interface GoalOption {
  id: string;
  title: string;
}

interface RequirementsEditorProps {
  skills: SkillOption[];
  attributes: AttributeOption[];
  achievements: AchievementOption[];
  quests: QuestOption[];
  goals: GoalOption[];
  value: QuestRequirementInput[];
  onChange: (value: QuestRequirementInput[]) => void;
}

const TYPE_LABELS: Record<QuestRequirementType, string> = {
  LEVEL_THRESHOLD: 'Reach a level',
  ACTIVITY_COUNT: 'Complete N tagged activities',
  ACHIEVEMENT: 'Unlock an achievement',
  QUEST_COMPLETED: 'Complete another quest',
  GOAL_COMPLETED: 'Complete a goal',
};

const REQUIREMENT_TYPES = Object.keys(TYPE_LABELS) as QuestRequirementType[];

function describeDraft(draft: QuestRequirementInput, options: RequirementsEditorProps): string {
  switch (draft.type) {
    case 'LEVEL_THRESHOLD': {
      if (!draft.level) return '';
      if (draft.skillId) return `${options.skills.find((s) => s.id === draft.skillId)?.name ?? 'Skill'} Level ${draft.level}`;
      if (draft.attributeId) return `${options.attributes.find((a) => a.id === draft.attributeId)?.name ?? 'Attribute'} Level ${draft.level}`;
      return `Character Level ${draft.level}`;
    }
    case 'ACTIVITY_COUNT': {
      if (!draft.skillId || !draft.count) return '';
      return `Complete ${draft.count} ${options.skills.find((s) => s.id === draft.skillId)?.name ?? ''} activities`;
    }
    case 'ACHIEVEMENT': {
      if (!draft.achievementId) return '';
      return `Achievement: ${options.achievements.find((a) => a.id === draft.achievementId)?.name ?? ''}`;
    }
    case 'QUEST_COMPLETED': {
      if (!draft.requiredQuestId) return '';
      return `Complete Quest: ${options.quests.find((q) => q.id === draft.requiredQuestId)?.title ?? ''}`;
    }
    case 'GOAL_COMPLETED': {
      if (!draft.requiredGoalId) return '';
      return `Complete Goal: ${options.goals.find((g) => g.id === draft.requiredGoalId)?.title ?? ''}`;
    }
    default:
      return '';
  }
}

function isDraftComplete(draft: QuestRequirementInput): boolean {
  switch (draft.type) {
    case 'LEVEL_THRESHOLD':
      return !!draft.level;
    case 'ACTIVITY_COUNT':
      return !!draft.skillId && !!draft.count;
    case 'ACHIEVEMENT':
      return !!draft.achievementId;
    case 'QUEST_COMPLETED':
      return !!draft.requiredQuestId;
    case 'GOAL_COMPLETED':
      return !!draft.requiredGoalId;
    default:
      return false;
  }
}

/**
 * "Level-gated quests": lets a quest be locked behind prerequisites (a
 * level, an activity count, an achievement, another quest, or a goal).
 * Collapsed by default since most quests don't need it, matching
 * RewardBundleEditor's pattern.
 */
export function RequirementsEditor(props: RequirementsEditorProps) {
  const { skills, attributes, achievements, quests, goals, value, onChange } = props;
  const [expanded, setExpanded] = useState(value.length > 0);
  const [draft, setDraft] = useState<QuestRequirementInput>({ type: 'LEVEL_THRESHOLD' });

  function addRequirement() {
    if (!isDraftComplete(draft)) return;
    onChange([...value, draft]);
    setDraft({ type: 'LEVEL_THRESHOLD' });
  }

  function removeRequirement(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function updateDraftType(type: QuestRequirementType) {
    setDraft({ type });
  }

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-foreground"
      >
        <span>
          Prerequisites
          {value.length > 0 && !expanded && <span className="ml-1.5 text-xs font-normal text-muted">{value.length} set</span>}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <p className="text-xs text-muted">
            Locks this quest until every prerequisite is met. A locked quest is still shown, with its requirements and progress.
          </p>

          {value.length > 0 && (
            <ul className="space-y-1.5">
              {value.map((requirement, index) => (
                <li key={index} className="flex items-center justify-between gap-2 rounded-lg bg-surface-hover px-2.5 py-1.5">
                  <span className="text-sm text-foreground">{describeDraft(requirement, props)}</span>
                  <button
                    type="button"
                    aria-label="Remove requirement"
                    onClick={() => removeRequirement(index)}
                    className="text-muted hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
            <Select value={draft.type} onChange={(event) => updateDraftType(event.target.value as QuestRequirementType)}>
              {REQUIREMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </Select>

            {draft.type === 'LEVEL_THRESHOLD' && (
              <div className="flex items-center gap-2">
                {/* Sizing lives on these wrapper divs, not on the Select/Input themselves -
                    both already carry a baked-in w-full, which would otherwise compete with
                    flex-1/w-24 for the same `width` property at equal CSS specificity. */}
                <div className="flex-1">
                  <Select
                    value={draft.skillId ? `skill:${draft.skillId}` : draft.attributeId ? `attribute:${draft.attributeId}` : 'character'}
                    onChange={(event) => {
                      const [kind, id] = event.target.value.split(':');
                      setDraft((current) => ({
                        ...current,
                        skillId: kind === 'skill' ? id : undefined,
                        attributeId: kind === 'attribute' ? id : undefined,
                      }));
                    }}
                  >
                    <option value="character">Character</option>
                    {skills.map((skill) => (
                      <option key={skill.id} value={`skill:${skill.id}`}>
                        Skill: {skill.name}
                      </option>
                    ))}
                    {attributes.map((attribute) => (
                      <option key={attribute.id} value={`attribute:${attribute.id}`}>
                        Attribute: {attribute.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Level"
                    value={draft.level ?? ''}
                    onChange={(event) => setDraft((current) => ({ ...current, level: event.target.value ? parseInt(event.target.value, 10) : undefined }))}
                  />
                </div>
              </div>
            )}

            {draft.type === 'ACTIVITY_COUNT' && (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    value={draft.skillId ?? ''}
                    onChange={(event) => setDraft((current) => ({ ...current, skillId: event.target.value || undefined }))}
                  >
                    <option value="">Select a skill...</option>
                    {skills.map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Count"
                    value={draft.count ?? ''}
                    onChange={(event) => setDraft((current) => ({ ...current, count: event.target.value ? parseInt(event.target.value, 10) : undefined }))}
                  />
                </div>
              </div>
            )}

            {draft.type === 'ACHIEVEMENT' && (
              <Select
                value={draft.achievementId ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, achievementId: event.target.value || undefined }))}
              >
                <option value="">Select an achievement...</option>
                {achievements.map((achievement) => (
                  <option key={achievement.id} value={achievement.id}>
                    {achievement.name}
                  </option>
                ))}
              </Select>
            )}

            {draft.type === 'QUEST_COMPLETED' && (
              <Select
                value={draft.requiredQuestId ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, requiredQuestId: event.target.value || undefined }))}
              >
                <option value="">Select a quest...</option>
                {quests.map((quest) => (
                  <option key={quest.id} value={quest.id}>
                    {quest.title}
                  </option>
                ))}
              </Select>
            )}

            {draft.type === 'GOAL_COMPLETED' && (
              <Select
                value={draft.requiredGoalId ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, requiredGoalId: event.target.value || undefined }))}
              >
                <option value="">Select a goal...</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </Select>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addRequirement} disabled={!isDraftComplete(draft)}>
              <Plus className="h-3.5 w-3.5" />
              Add requirement
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
