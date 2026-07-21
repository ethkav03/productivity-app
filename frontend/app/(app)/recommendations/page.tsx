'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Lightbulb, LucideIcon, Swords, Target, TrendingUp } from 'lucide-react';
import { getRecommendations, getWeeklyReview } from '@/lib/api/recommendations';
import { RecommendationCard, RecommendationType } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner, Spinner } from '@/components/ui/spinner';

const CARD_ICON: Record<RecommendationType, LucideIcon> = {
  NEGLECTED_ATTRIBUTE: AlertTriangle,
  MOMENTUM: TrendingUp,
  DEADLINE_SOON: Clock,
  STALE_GOAL: Target,
  DIFFICULTY_READY: Swords,
};

function cardHref(card: RecommendationCard): string | null {
  switch (card.type) {
    case 'NEGLECTED_ATTRIBUTE':
      return card.attributeId ? `/attributes/${card.attributeId}` : null;
    case 'MOMENTUM':
      return card.skillId ? `/skills/${card.skillId}` : null;
    case 'DEADLINE_SOON':
      return '/quests';
    case 'STALE_GOAL':
      return card.goalId ? `/goals/${card.goalId}` : null;
    case 'DIFFICULTY_READY':
      return '/quests';
    default:
      return null;
  }
}

function RecommendationCardView({ card }: { card: RecommendationCard }) {
  const Icon = CARD_ICON[card.type];
  const href = cardHref(card);

  const content = (
    <Card className={href ? 'flex items-start gap-3 transition-colors hover:border-primary/40' : 'flex items-start gap-3'}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{card.title}</p>
        <p className="mt-0.5 text-sm text-muted">{card.description}</p>
      </div>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function xpDeltaBadge(delta: number) {
  if (delta === 0) return <Badge variant="outline">+0 XP</Badge>;
  return <Badge variant={delta > 0 ? 'success' : 'danger'}>{delta > 0 ? `+${delta}` : delta} XP</Badge>;
}

export default function RecommendationsPage() {
  const recommendationsQuery = useQuery({ queryKey: ['recommendations'], queryFn: getRecommendations });
  const weeklyReviewQuery = useQuery({ queryKey: ['recommendations', 'weekly-review'], queryFn: getWeeklyReview });

  const cards = recommendationsQuery.data ?? [];
  const review = weeklyReviewQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Recommendations</h1>
        <p className="mt-1 text-sm text-muted">
          A handful of rules-based nudges from your own data - no AI, just honest heuristics.
        </p>
      </div>

      {recommendationsQuery.isLoading ? (
        <PageSpinner />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Nothing to flag right now"
          description="Once you've logged some activity, this page will surface things like a neglected attribute, an approaching deadline, or a stale goal."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card, index) => (
            <RecommendationCardView key={`${card.type}-${index}`} card={card} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Weekly Review</CardTitle>
        </CardHeader>
        {weeklyReviewQuery.isLoading ? (
          <Spinner />
        ) : !review ? (
          <p className="py-6 text-center text-sm text-muted">Could not load this week's review.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">XP this week vs. last week</span>
              <span className="flex items-center gap-2">
                <span className="text-sm text-foreground">
                  {review.xpThisWeek} vs {review.xpLastWeek}
                </span>
                {xpDeltaBadge(review.xpDelta)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-border p-3 text-center">
                <p className="text-lg font-semibold text-foreground">{review.questsCompleted}</p>
                <p className="text-xs text-muted">Quests completed</p>
              </div>
              <div className="rounded-xl border border-border p-3 text-center">
                <p className="text-lg font-semibold text-foreground">{review.habitsCompleted}</p>
                <p className="text-xs text-muted">Habits completed</p>
              </div>
              <div className="rounded-xl border border-border p-3 text-center">
                <p className="text-lg font-semibold text-foreground">{review.currentStreak}</p>
                <p className="text-xs text-muted">Day streak</p>
              </div>
              <div className="rounded-xl border border-border p-3 text-center">
                <p className="text-lg font-semibold text-foreground">{review.xpThisWeek}</p>
                <p className="text-xs text-muted">XP this week</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {review.mostImprovedSkill && (
                <Link
                  href={`/skills/${review.mostImprovedSkill.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm transition-colors hover:border-primary/40"
                >
                  <span className="text-muted">Most improved skill</span>
                  <span className="font-medium text-foreground">
                    {review.mostImprovedSkill.name} (+{review.mostImprovedSkill.xp} XP)
                  </span>
                </Link>
              )}
              {review.neglectedAttribute && (
                <Link
                  href={`/attributes/${review.neglectedAttribute.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm transition-colors hover:border-primary/40"
                >
                  <span className="text-muted">Quietest attribute</span>
                  <span className="font-medium text-foreground">{review.neglectedAttribute.name}</span>
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
