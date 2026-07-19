'use client';

import { FormEvent, MouseEvent, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Apple,
  BookOpen,
  Brain,
  CheckSquare,
  Code,
  Dumbbell,
  Languages,
  LucideIcon,
  Moon,
  Palette,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react';
import { createSkill, deleteSkill, getSkills, getSkillSuggestions } from '@/lib/api/skills';
import { getApiErrorMessage } from '@/lib/api-client';
import { DefaultSkillDefinition, Skill } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';

const SKILL_ICON_MAP: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  apple: Apple,
  moon: Moon,
  brain: Brain,
  shield: Shield,
  'check-square': CheckSquare,
  sparkles: Sparkles,
  code: Code,
  languages: Languages,
  'book-open': BookOpen,
  wallet: Wallet,
  palette: Palette,
};

function resolveSkillIcon(icon: string | null | undefined): LucideIcon {
  if (icon && SKILL_ICON_MAP[icon]) return SKILL_ICON_MAP[icon];
  return Sparkles;
}

function skillProgress(skill: Pick<Skill, 'currentXP' | 'xpForNextLevel'>): number {
  if (!skill.xpForNextLevel) return 0;
  return Math.min(100, Math.max(0, (skill.currentXP / skill.xpForNextLevel) * 100));
}

export default function SkillsPage() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');

  const skillsQuery = useQuery({ queryKey: ['skills'], queryFn: getSkills });
  const suggestionsQuery = useQuery({
    queryKey: ['skill-suggestions'],
    queryFn: getSkillSuggestions,
    enabled: modalOpen,
  });

  const createMutation = useMutation({
    mutationFn: createSkill,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (error) => {
      push({ title: "Couldn't add skill", description: getApiErrorMessage(error) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSkill,
    onSuccess: () => {
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

  function handleAddSuggestion(suggestion: DefaultSkillDefinition) {
    createMutation.mutate({
      name: suggestion.name,
      description: suggestion.description,
      icon: suggestion.icon,
    });
  }

  function handleCustomSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = customName.trim();
    if (!trimmedName) return;
    createMutation.mutate(
      { name: trimmedName, description: customDescription.trim() || undefined },
      {
        onSuccess: () => {
          setCustomName('');
          setCustomDescription('');
        },
      },
    );
  }

  const existingNames = new Set((skillsQuery.data ?? []).map((s) => s.name.trim().toLowerCase()));
  const availableSuggestions = (suggestionsQuery.data ?? []).filter(
    (suggestion) => !existingNames.has(suggestion.name.trim().toLowerCase()),
  );

  const skills = skillsQuery.data ?? [];
  const isEmpty = skillsQuery.isSuccess && skills.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Skills</h1>
          <p className="text-sm text-muted">Track XP and level progress across every skill.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Skill
        </Button>
      </div>

      {skillsQuery.isLoading && <PageSpinner />}

      {skillsQuery.isError && (
        <p className="text-sm text-danger">{getApiErrorMessage(skillsQuery.error, 'Could not load skills')}</p>
      )}

      {isEmpty && (
        <EmptyState
          icon={Sparkles}
          title="No skills yet"
          description="Add your first skill to start earning XP toward it."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Skill
            </Button>
          }
        />
      )}

      {skills.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => {
            const Icon = resolveSkillIcon(skill.icon);
            const isDeleting = deleteMutation.isPending && deleteMutation.variables === skill.id;
            return (
              <div key={skill.id} className="relative">
                <Link href={`/skills/${skill.id}`} className="block">
                  <Card className="h-full cursor-pointer pr-9 transition-colors hover:border-primary/40">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{skill.name}</p>
                        <Badge variant="primary">Lvl {skill.level}</Badge>
                      </div>
                    </div>

                    {skill.description && (
                      <p className="mt-3 line-clamp-2 text-xs text-muted">{skill.description}</p>
                    )}

                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-muted">
                        <span>{skill.currentXP} XP</span>
                        <span>{skill.xpForNextLevel} XP</span>
                      </div>
                      <ProgressBar value={skillProgress(skill)} />
                    </div>
                  </Card>
                </Link>
                <button
                  type="button"
                  aria-label={`Delete ${skill.name}`}
                  title="Delete skill"
                  disabled={isDeleting}
                  onClick={(event) => handleDelete(event, skill)}
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Skill">
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Suggested skills</p>
            {suggestionsQuery.isLoading && <p className="py-3 text-sm text-muted">Loading suggestions...</p>}
            {suggestionsQuery.isSuccess && availableSuggestions.length === 0 && (
              <p className="py-3 text-sm text-muted">
                {skills.length === 0
                  ? 'No suggestions available.'
                  : "You've already added all suggested skills."}
              </p>
            )}
            <ul className="space-y-2">
              {availableSuggestions.map((suggestion) => {
                const Icon = resolveSkillIcon(suggestion.icon);
                const isPending =
                  createMutation.isPending && createMutation.variables?.name === suggestion.name;
                return (
                  <li
                    key={suggestion.name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{suggestion.name}</p>
                        <p className="truncate text-xs text-muted">{suggestion.description}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={isPending}
                      onClick={() => handleAddSuggestion(suggestion)}
                    >
                      Add
                    </Button>
                  </li>
                );
              })}
            </ul>
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
