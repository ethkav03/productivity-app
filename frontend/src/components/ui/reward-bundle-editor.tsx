'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { AttributeKey } from '@/lib/types';
import { Button } from './button';
import { Input, Label, Select } from './input';

interface TaggedSkill {
  id: string;
  name: string;
}

interface AttributeOption {
  id: string;
  key: AttributeKey;
  name: string;
}

export interface RewardBundleValue {
  skillRewardOverrides: Array<{ skillId: string; amount: number }>;
  attributeBonuses: Array<{ attributeId: string; amount: number }>;
}

interface RewardBundleEditorProps {
  /** Currently-tagged skills on the form - an override only makes sense for a skill that's actually tagged. */
  taggedSkills: TaggedSkill[];
  /** The user's full attribute list, to pick a bonus target from. */
  attributes: AttributeOption[];
  /** The activity's flat XP reward, shown as each override input's placeholder so "inherit" is obvious. */
  flatXpReward: number;
  value: RewardBundleValue;
  onChange: (value: RewardBundleValue) => void;
}

/**
 * "XP Bundles": lets a quest/habit/goal award a different amount to a
 * specific tagged skill than its flat reward, and/or bonus XP to an
 * attribute with no tagged skill at all. Collapsed by default since most
 * activities don't need it - this is an advanced, opt-in refinement, not
 * something every creation form should surface by default.
 */
export function RewardBundleEditor({ taggedSkills, attributes, flatXpReward, value, onChange }: RewardBundleEditorProps) {
  const [expanded, setExpanded] = useState(
    value.skillRewardOverrides.length > 0 || value.attributeBonuses.length > 0,
  );
  const [newBonusAttributeId, setNewBonusAttributeId] = useState('');
  const [newBonusAmount, setNewBonusAmount] = useState('');

  const overrideBySkillId = new Map(value.skillRewardOverrides.map((o) => [o.skillId, o.amount]));

  function setOverride(skillId: string, amount: number | undefined) {
    const next = value.skillRewardOverrides.filter((o) => o.skillId !== skillId);
    if (amount !== undefined && !Number.isNaN(amount)) {
      next.push({ skillId, amount });
    }
    onChange({ ...value, skillRewardOverrides: next });
  }

  const availableBonusAttributes = attributes.filter(
    (attribute) => !value.attributeBonuses.some((bonus) => bonus.attributeId === attribute.id),
  );

  function addBonus() {
    const amount = parseInt(newBonusAmount, 10);
    if (!newBonusAttributeId || !amount || amount <= 0) return;
    onChange({ ...value, attributeBonuses: [...value.attributeBonuses, { attributeId: newBonusAttributeId, amount }] });
    setNewBonusAttributeId('');
    setNewBonusAmount('');
  }

  function removeBonus(attributeId: string) {
    onChange({ ...value, attributeBonuses: value.attributeBonuses.filter((b) => b.attributeId !== attributeId) });
  }

  const hasContent = value.skillRewardOverrides.length > 0 || value.attributeBonuses.length > 0;

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-foreground"
      >
        <span>
          Advanced rewards (XP Bundle)
          {hasContent && !expanded && <span className="ml-1.5 text-xs font-normal text-muted">customized</span>}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          <div>
            <Label>Per-skill XP override</Label>
            {taggedSkills.length === 0 ? (
              <p className="text-xs text-muted">Tag a skill above to give it its own reward amount.</p>
            ) : (
              <div className="space-y-2">
                {taggedSkills.map((skill) => (
                  <div key={skill.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm text-foreground">{skill.name}</span>
                    <Input
                      type="number"
                      min={1}
                      placeholder={String(flatXpReward)}
                      value={overrideBySkillId.get(skill.id) ?? ''}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setOverride(skill.id, raw === '' ? undefined : parseInt(raw, 10));
                      }}
                      className="w-24"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Bonus attribute XP</Label>
            <p className="mb-2 text-xs text-muted">Award XP directly to an attribute, independent of any tagged skill.</p>

            {value.attributeBonuses.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {value.attributeBonuses.map((bonus) => {
                  const attribute = attributes.find((a) => a.id === bonus.attributeId);
                  return (
                    <li key={bonus.attributeId} className="flex items-center justify-between gap-2 rounded-lg bg-surface-hover px-2.5 py-1.5">
                      <span className="text-sm text-foreground">{attribute?.name ?? bonus.attributeId}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted">+{bonus.amount} XP</span>
                        <button
                          type="button"
                          aria-label={`Remove ${attribute?.name ?? ''} bonus`}
                          onClick={() => removeBonus(bonus.attributeId)}
                          className="text-muted hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {availableBonusAttributes.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value={newBonusAttributeId} onChange={(event) => setNewBonusAttributeId(event.target.value)} className="flex-1">
                  <option value="">Select an attribute...</option>
                  {availableBonusAttributes.map((attribute) => (
                    <option key={attribute.id} value={attribute.id}>
                      {attribute.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={1}
                  placeholder="XP"
                  value={newBonusAmount}
                  onChange={(event) => setNewBonusAmount(event.target.value)}
                  className="w-20"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Add attribute bonus"
                  onClick={addBonus}
                  disabled={!newBonusAttributeId || !newBonusAmount}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
