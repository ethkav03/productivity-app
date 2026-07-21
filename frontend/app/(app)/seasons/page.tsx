'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hourglass, Plus, X } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { closeSeason, createSeason, getSeasons } from '@/lib/api/seasons';
import { getAttributes } from '@/lib/api/attributes';
import { getApiErrorMessage } from '@/lib/api-client';
import { attributeColor } from '@/lib/attribute-colors';
import { AttributeKey, Season } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FieldError, Input, Label, Textarea } from '@/components/ui/input';
import { PillSelect } from '@/components/ui/pill-select';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';

const createSeasonSchema = z.object({
  title: z.string().min(1, 'Title is required').max(120, 'Keep it under 120 characters'),
  description: z.string().max(500, 'Keep it under 500 characters').optional(),
  focus: z.array(z.string()).min(1, 'Pick at least one focus attribute'),
  endDate: z.string().optional(),
});

type CreateSeasonFormValues = z.infer<typeof createSeasonSchema>;

const DEFAULT_FORM_VALUES: CreateSeasonFormValues = {
  title: '',
  description: '',
  focus: [],
  endDate: '',
};

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <Badge variant="outline">+0</Badge>;
  return <Badge variant={delta > 0 ? 'success' : 'danger'}>{delta > 0 ? `+${delta}` : delta}</Badge>;
}

function SeasonCard({ season, nameByKey, isCurrent }: { season: Season; nameByKey: Map<string, string>; isCurrent: boolean }) {
  return (
    <Card className={isCurrent ? 'border-primary/40' : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{season.title}</h3>
          {season.description && <p className="mt-1 text-sm text-muted">{season.description}</p>}
        </div>
        <Badge variant={isCurrent ? 'primary' : 'outline'}>{isCurrent ? 'Current' : 'Completed'}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {season.focus.map((key) => (
          <Badge key={key} variant="outline" style={{ color: attributeColor(key as AttributeKey) }}>
            {nameByKey.get(key) ?? key}
          </Badge>
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Character level</span>
          <span className="flex items-center gap-2 font-medium text-foreground">
            {season.startLevel} → {season.currentLevel}
            <DeltaBadge delta={season.levelDelta} />
          </span>
        </div>
        {season.attributeDeltas.map((d) => (
          <div key={d.key} className="flex items-center justify-between text-sm">
            <span className="text-muted">{nameByKey.get(d.key) ?? d.key}</span>
            <span className="flex items-center gap-2 font-medium text-foreground">
              {d.startLevel} → {d.currentLevel}
              <DeltaBadge delta={d.delta} />
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        {format(new Date(season.startDate), 'MMM d, yyyy')}
        {' – '}
        {season.closedAt
          ? format(new Date(season.closedAt), 'MMM d, yyyy')
          : season.endDate
            ? `planned ${format(new Date(season.endDate), 'MMM d, yyyy')}`
            : 'ongoing'}
      </p>
    </Card>
  );
}

export default function SeasonsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: allSeasons, isLoading, isError } = useQuery({ queryKey: ['seasons', 'all'], queryFn: () => getSeasons() });
  const { data: attributes } = useQuery({ queryKey: ['attributes'], queryFn: getAttributes });

  const nameByKey = new Map((attributes ?? []).map((a) => [a.key, a.name]));

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSeasonFormValues>({
    resolver: zodResolver(createSeasonSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const focus = watch('focus');

  function closeModal() {
    setModalOpen(false);
    setFormError(null);
    reset(DEFAULT_FORM_VALUES);
  }

  const closeMutation = useMutation({
    mutationFn: (id: string) => closeSeason(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
    },
  });

  async function onSubmit(values: CreateSeasonFormValues) {
    setFormError(null);
    try {
      await createSeason({
        title: values.title,
        description: values.description?.trim() ? values.description.trim() : undefined,
        focus: values.focus as AttributeKey[],
        endDate: values.endDate?.trim() ? values.endDate : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
      closeModal();
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Could not start season'));
    }
  }

  function handleStartNew() {
    const current = (allSeasons ?? []).find((s) => s.status === 'ACTIVE');
    if (current && !window.confirm(`Starting a new season will close "${current.title}". Continue?`)) return;
    setModalOpen(true);
  }

  const current = (allSeasons ?? []).find((s) => s.status === 'ACTIVE');
  const past = (allSeasons ?? []).filter((s) => s.status === 'COMPLETED');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Seasons</h1>
          <p className="mt-1 text-sm text-muted">Divide your progression into chapters with a focus.</p>
        </div>
        <Button onClick={handleStartNew}>
          <Plus className="h-4 w-4" />
          Start New Season
        </Button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <p className="text-sm text-danger">Could not load seasons.</p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Current Season</h2>
            {current ? (
              <div className="space-y-3">
                <SeasonCard season={current} nameByKey={nameByKey} isCurrent />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => closeMutation.mutate(current.id)}
                  loading={closeMutation.isPending}
                >
                  <X className="h-3.5 w-3.5" />
                  Close Season
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={Hourglass}
                title="No active season"
                description="Start one to give this chapter of your life a clear focus."
                action={
                  <Button onClick={handleStartNew}>
                    <Plus className="h-4 w-4" />
                    Start New Season
                  </Button>
                }
              />
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Past Seasons</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {past.map((season) => (
                  <SeasonCard key={season.id} season={season} nameByKey={nameByKey} isCurrent={false} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Start New Season"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" form="create-season-form" loading={isSubmitting}>
              Start Season
            </Button>
          </>
        }
      >
        <form id="create-season-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="season-title">Title</Label>
            <Input id="season-title" placeholder="e.g. The Rebuild" {...register('title')} />
            <FieldError>{errors.title?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="season-description">Description</Label>
            <Textarea id="season-description" {...register('description')} />
            <FieldError>{errors.description?.message}</FieldError>
          </div>

          <div>
            <Label>Focus</Label>
            <PillSelect
              options={(attributes ?? []).map((a) => ({ value: a.key, label: a.name }))}
              value={focus}
              onChange={(value) => setValue('focus', value)}
            />
            <FieldError>{errors.focus?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="season-end-date">Planned end date (optional)</Label>
            <Input id="season-end-date" type="date" {...register('endDate')} />
          </div>

          {formError && <p className="text-sm text-danger">{formError}</p>}
        </form>
      </Modal>
    </div>
  );
}
