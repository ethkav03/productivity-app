'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { getJournalCorrelations, getJournalDay, upsertJournalEntry } from '@/lib/api/journal';
import { getApiErrorMessage } from '@/lib/api-client';
import { JournalCorrelationGroup } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Textarea } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toaster';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDayKey(dayKey: string, delta: number) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

const RATING_FIELDS = [
  { key: 'mood', label: 'Mood', low: 'Low', high: 'Great' },
  { key: 'energyLevel', label: 'Energy', low: 'Drained', high: 'Energized' },
  { key: 'stressLevel', label: 'Stress', low: 'Calm', high: 'Overwhelmed' },
] as const;

type RatingKey = (typeof RATING_FIELDS)[number]['key'];

function RatingRow({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-muted">{low}</span>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`${label} ${n}`}
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium transition-colors',
                value === n
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted hover:border-primary/40 hover:text-foreground',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="w-16 shrink-0 text-right text-xs text-muted">{high}</span>
      </div>
    </div>
  );
}

function CorrelationCard({
  title,
  high,
  low,
  group,
}: {
  title: string;
  high: string;
  low: string;
  group: JournalCorrelationGroup;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm font-semibold text-foreground">{title} vs. XP earned</p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">
            {high} ({group.higherGroupDays} days)
          </span>
          <Badge variant="success">avg +{group.higherGroupAverageXp} XP</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">
            {low} ({group.lowerGroupDays} days)
          </span>
          <Badge variant="outline">avg +{group.lowerGroupAverageXp} XP</Badge>
        </div>
      </div>
    </div>
  );
}

export default function JournalPage() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [dayKey, setDayKey] = useState(todayKey);

  const dayQuery = useQuery({ queryKey: ['journal', 'day', dayKey], queryFn: () => getJournalDay(dayKey) });
  const correlationsQuery = useQuery({ queryKey: ['journal', 'correlations'], queryFn: getJournalCorrelations });

  const [ratings, setRatings] = useState<Record<RatingKey, number | undefined>>({
    mood: undefined,
    energyLevel: undefined,
    stressLevel: undefined,
  });
  const [sleepHours, setSleepHours] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const entry = dayQuery.data?.entry;
    setRatings({
      mood: entry?.mood ?? undefined,
      energyLevel: entry?.energyLevel ?? undefined,
      stressLevel: entry?.stressLevel ?? undefined,
    });
    setSleepHours(entry?.sleepHours != null ? String(entry.sleepHours) : '');
    setNote(entry?.note ?? '');
  }, [dayQuery.data]);

  const sleepHoursValid = sleepHours.trim() === '' || (Number(sleepHours) >= 0 && Number(sleepHours) <= 24);

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertJournalEntry(dayKey, {
        mood: ratings.mood,
        energyLevel: ratings.energyLevel,
        stressLevel: ratings.stressLevel,
        sleepHours: sleepHours.trim() ? Number(sleepHours) : undefined,
        note: note.trim() ? note.trim() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] });
      push({ title: 'Journal entry saved' });
    },
    onError: (error) => {
      push({ title: "Couldn't save journal entry", description: getApiErrorMessage(error) });
    },
  });

  const isToday = dayKey === todayKey();
  const summary = dayQuery.data;
  const correlations = correlationsQuery.data;
  const hasCorrelations = !!correlations && (correlations.moodVsXp || correlations.sleepVsXp);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Journal</h1>
        <p className="mt-1 text-sm text-muted">
          Check in on how you&apos;re feeling and see how it lines up with your progress.
        </p>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDayKey((current) => shiftDayKey(current, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">
              {isToday ? 'Today' : format(new Date(`${dayKey}T12:00:00.000Z`), 'EEEE, MMM d, yyyy')}
            </p>
            {!isToday && <p className="text-xs text-muted">{dayKey}</p>}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDayKey((current) => shiftDayKey(current, 1))}
            disabled={isToday}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {dayQuery.isLoading ? (
          <div className="py-8">
            <PageSpinner />
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground">{summary?.activitiesCompleted ?? 0}</p>
                <p className="text-xs text-muted">Activities completed</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground">+{summary?.xpEarned ?? 0}</p>
                <p className="text-xs text-muted">XP earned</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {RATING_FIELDS.map((field) => (
                <RatingRow
                  key={field.key}
                  label={field.label}
                  low={field.low}
                  high={field.high}
                  value={ratings[field.key]}
                  onChange={(value) => setRatings((current) => ({ ...current, [field.key]: value }))}
                />
              ))}

              <div>
                <Label htmlFor="journal-sleep">Sleep (hours)</Label>
                <Input
                  id="journal-sleep"
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={sleepHours}
                  onChange={(event) => setSleepHours(event.target.value)}
                  className="max-w-[120px]"
                />
                <FieldError>{sleepHoursValid ? undefined : 'Enter a value between 0 and 24'}</FieldError>
              </div>

              <div>
                <Label htmlFor="journal-note">Note</Label>
                <Textarea
                  id="journal-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={2000}
                  placeholder="Anything worth remembering about today?"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate()}
                  loading={saveMutation.isPending}
                  disabled={!sleepHoursValid}
                >
                  Save Entry
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How mood and sleep line up with your progress</CardTitle>
        </CardHeader>
        {correlationsQuery.isLoading ? (
          <PageSpinner />
        ) : !hasCorrelations ? (
          <p className="py-6 text-center text-sm text-muted">
            Log at least a few days on both sides of a comparison (some high-mood and some low-mood days, for
            example) to see this.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {correlations?.moodVsXp && (
              <CorrelationCard title="Mood" high="Mood 4-5" low="Mood 1-3" group={correlations.moodVsXp} />
            )}
            {correlations?.sleepVsXp && (
              <CorrelationCard title="Sleep" high="7+ hours" low="Under 7 hours" group={correlations.sleepVsXp} />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
