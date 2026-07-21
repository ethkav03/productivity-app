'use client';

import { FormEvent, MouseEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  Compass,
  Dumbbell,
  LucideIcon,
  Palette,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { createSkill, deleteSkill, getSkillSuggestions } from '@/lib/api/skills';
import { getAttributes } from '@/lib/api/attributes';
import { getApiErrorMessage } from '@/lib/api-client';
import { attributeColor } from '@/lib/attribute-colors';
import { getSkillTier } from '@/lib/skill-tier';
import { Attribute, AttributeKey, DefaultSkillDefinition, Skill } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';

const ATTRIBUTE_ICON_MAP: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  brain: Brain,
  shield: Shield,
  zap: Zap,
  users: Users,
  wallet: Wallet,
  palette: Palette,
  compass: Compass,
};

function resolveIcon(icon: string | null | undefined): LucideIcon {
  if (icon && ATTRIBUTE_ICON_MAP[icon]) return ATTRIBUTE_ICON_MAP[icon];
  return Sparkles;
}

function progressPercent(entity: { currentXP: number; xpForNextLevel: number }): number {
  if (!entity.xpForNextLevel) return 0;
  return Math.min(100, Math.max(0, (entity.currentXP / entity.xpForNextLevel) * 100));
}

function skillKey(attributeKey: AttributeKey, name: string): string {
  return `${attributeKey}:${name.trim().toLowerCase()}`;
}

// Stable reference so useMemo/useQuery deps don't churn every render while `attributesQuery.data` is still loading.
const EMPTY_ATTRIBUTES: Attribute[] = [];

export default function SkillsPage() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAttributeKey, setModalAttributeKey] = useState<AttributeKey | null>(null);
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customAttributeId, setCustomAttributeId] = useState('');

  const attributesQuery = useQuery({ queryKey: ['attributes'], queryFn: getAttributes });
  const suggestionsQuery = useQuery({
    queryKey: ['skill-suggestions'],
    queryFn: getSkillSuggestions,
    enabled: modalOpen,
  });

  const createMutation = useMutation({
    mutationFn: createSkill,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (error) => {
      push({ title: "Couldn't add skill", description: getApiErrorMessage(error) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSkill,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (error) => {
      push({ title: "Couldn't delete skill", description: getApiErrorMessage(error) });
    },
  });

  function handleDelete(event: MouseEvent, skill: Skill) {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm('Delete this skill? This cannot be undone.')) return;
    deleteMutation.mutate(skill.id);
  }

  function openAddModal(attributeKey?: AttributeKey) {
    setModalAttributeKey(attributeKey ?? null);
    const defaultAttribute = attributeKey
      ? attributes.find((a) => a.key === attributeKey)
      : attributes[0];
    setCustomAttributeId(defaultAttribute?.id ?? '');
    setModalOpen(true);
  }

  function handleAddSuggestion(suggestion: DefaultSkillDefinition) {
    const attribute = attributes.find((a) => a.key === suggestion.attributeKey);
    if (!attribute) return;
    createMutation.mutate({ name: suggestion.name, attributeId: attribute.id, description: suggestion.description });
  }

  function handleCustomSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = customName.trim();
    if (!trimmedName || !customAttributeId) return;
    createMutation.mutate(
      { name: trimmedName, attributeId: customAttributeId, description: customDescription.trim() || undefined },
      { onSuccess: () => { setCustomName(''); setCustomDescription(''); } },
    );
  }

  const attributes = attributesQuery.data ?? EMPTY_ATTRIBUTES;
  const isEmpty = attributesQuery.isSuccess && attributes.every((a) => a.skills.length === 0);

  const existingKeys = useMemo(
    () => new Set(attributes.flatMap((a) => a.skills.map((s) => skillKey(a.key, s.name)))),
    [attributes],
  );

  const suggestionGroups = (suggestionsQuery.data ?? [])
    .filter((group) => !modalAttributeKey || group.key === modalAttributeKey)
    .map((group) => ({
      ...group,
      skills: group.skills.filter((skill) => !existingKeys.has(skillKey(group.key, skill.name))),
    }))
    .filter((group) => group.skills.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Skills</h1>
          <p className="text-sm text-muted">
            Every skill belongs to one of your 8 attributes - level them up to level up the attribute.
          </p>
        </div>
        <Button onClick={() => openAddModal()}>
          <Plus className="h-4 w-4" />
          Add Skill
        </Button>
      </div>

      {attributesQuery.isLoading && <PageSpinner />}

      {attributesQuery.isError && (
        <p className="text-sm text-danger">{getApiErrorMessage(attributesQuery.error, 'Could not load attributes')}</p>
      )}

      {isEmpty && (
        <EmptyState
          icon={Sparkles}
          title="No skills yet"
          description="Add your first skill to start earning XP toward it - and its attribute."
          action={
            <Button onClick={() => openAddModal()}>
              <Plus className="h-4 w-4" />
              Add Skill
            </Button>
          }
        />
      )}

      <div className="space-y-8">
        {attributes.map((attribute) => (
          <AttributeSection
            key={attribute.id}
            attribute={attribute}
            onAddSkill={() => openAddModal(attribute.key)}
            onDeleteSkill={handleDelete}
            deletingSkillId={deleteMutation.isPending ? (deleteMutation.variables as string) : null}
          />
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalAttributeKey ? `Add ${attributes.find((a) => a.key === modalAttributeKey)?.name ?? ''} Skill` : 'Add Skill'}
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Suggested skills</p>
            {suggestionsQuery.isLoading && <p className="py-3 text-sm text-muted">Loading suggestions...</p>}
            {suggestionsQuery.isSuccess && suggestionGroups.length === 0 && (
              <p className="py-3 text-sm text-muted">You&apos;ve already added all suggested skills here.</p>
            )}
            <div className="space-y-4">
              {suggestionGroups.map((group) => (
                <div key={group.key}>
                  {!modalAttributeKey && (
                    <p className="mb-1.5 text-xs font-semibold text-foreground">{group.name}</p>
                  )}
                  <ul className="space-y-2">
                    {group.skills.map((suggestion) => {
                      const isPending =
                        createMutation.isPending && createMutation.variables?.name === suggestion.name;
                      return (
                        <li
                          key={suggestion.name}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{suggestion.name}</p>
                            <p className="truncate text-xs text-muted">{suggestion.description}</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            loading={isPending}
                            onClick={() => handleAddSuggestion(suggestion)}
                            className="shrink-0"
                          >
                            Add
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleCustomSubmit} className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Custom skill</p>
            <div>
              <Label htmlFor="custom-skill-name">Name</Label>
              <Input
                id="custom-skill-name"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="e.g. Woodworking"
                minLength={2}
                maxLength={40}
                required
              />
            </div>
            <div>
              <Label htmlFor="custom-skill-attribute">Attribute</Label>
              <Select
                id="custom-skill-attribute"
                value={customAttributeId}
                onChange={(event) => setCustomAttributeId(event.target.value)}
                required
              >
                {attributes.map((attribute) => (
                  <option key={attribute.id} value={attribute.id}>
                    {attribute.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="custom-skill-description">Description (optional)</Label>
              <Input
                id="custom-skill-description"
                value={customDescription}
                onChange={(event) => setCustomDescription(event.target.value)}
                placeholder="What does this skill cover?"
                maxLength={280}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              loading={createMutation.isPending && createMutation.variables?.name === customName.trim()}
            >
              <Plus className="h-4 w-4" />
              Add Custom Skill
            </Button>
          </form>
        </div>
      </Modal>
    </div>
  );
}

function AttributeSection({
  attribute,
  onAddSkill,
  onDeleteSkill,
  deletingSkillId,
}: {
  attribute: Attribute;
  onAddSkill: () => void;
  onDeleteSkill: (event: MouseEvent, skill: Skill) => void;
  deletingSkillId: string | null;
}) {
  const Icon = resolveIcon(attribute.icon);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/attributes/${attribute.id}`} className="flex items-center gap-3 rounded-lg hover:opacity-80">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: attributeColor(attribute.key, 0.15), color: attributeColor(attribute.key) }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground hover:underline">{attribute.name}</h2>
              <Badge variant="primary">Lvl {attribute.level}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <ProgressBar value={progressPercent(attribute)} size="sm" className="w-32" />
              <span className="text-xs text-muted">
                {attribute.currentXP}/{attribute.xpForNextLevel} XP
              </span>
            </div>
          </div>
        </Link>
        <Button variant="ghost" size="sm" onClick={onAddSkill}>
          <Plus className="h-3.5 w-3.5" />
          Add skill
        </Button>
      </div>

      {attribute.skills.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted">
          No {attribute.name.toLowerCase()} skills yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {attribute.skills.map((skill) => {
            const isDeleting = deletingSkillId === skill.id;
            return (
              <div key={skill.id} className="relative">
                <Link href={`/skills/${skill.id}`} className="block">
                  <Card className="h-full cursor-pointer pr-9 transition-colors hover:border-primary/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{skill.name}</p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="outline">{getSkillTier(skill.level)}</Badge>
                        <Badge variant="default">Lvl {skill.level}</Badge>
                      </div>
                    </div>

                    {skill.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted">{skill.description}</p>
                    )}

                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-muted">
                        <span>{skill.currentXP} XP</span>
                        <span>{skill.xpForNextLevel} XP</span>
                      </div>
                      <ProgressBar value={progressPercent(skill)} />
                    </div>
                  </Card>
                </Link>
                <button
                  type="button"
                  aria-label={`Delete ${skill.name}`}
                  title="Delete skill"
                  disabled={isDeleting}
                  onClick={(event) => onDeleteSkill(event, skill)}
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
