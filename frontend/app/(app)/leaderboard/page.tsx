'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  Compass,
  Crown,
  Dumbbell,
  LucideIcon,
  Medal,
  Palette,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import { getAttributes } from '@/lib/api/attributes';
import {
  acceptFriendRequest,
  declineFriendRequest,
  getFriendRequests,
  getFriends,
  getFriendSuggestions,
  removeFriend,
  sendFriendRequest,
} from '@/lib/api/friends';
import { getLeaderboard } from '@/lib/api/leaderboard';
import { attributeColor } from '@/lib/attribute-colors';
import { AttributeKey, LeaderboardEntry, LeaderboardPeriod } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageSpinner, Spinner } from '@/components/ui/spinner';
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

function resolveAttributeIcon(icon: string | null | undefined): LucideIcon {
  if (icon && ATTRIBUTE_ICON_MAP[icon]) return ATTRIBUTE_ICON_MAP[icon];
  return Sparkles;
}

type MetricTab = 'LEVEL' | 'ATTRIBUTE' | 'XP';

const METRIC_TABS: Array<[MetricTab, string]> = [
  ['LEVEL', 'Overall Level'],
  ['ATTRIBUTE', 'Attribute'],
  ['XP', 'XP Earned'],
];

const PERIODS: LeaderboardPeriod[] = ['DAY', 'WEEK', 'MONTH', 'YEAR', 'ALL_TIME'];

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  DAY: 'Today',
  WEEK: 'This Week',
  MONTH: 'This Month',
  YEAR: 'This Year',
  ALL_TIME: 'All-Time',
};

const PODIUM_ORDER: Record<number, string> = { 1: 'order-2', 2: 'order-1', 3: 'order-3' };
const PODIUM_HEIGHT: Record<number, string> = { 1: 'h-32 sm:h-40', 2: 'h-24 sm:h-32', 3: 'h-20 sm:h-28' };
const PODIUM_RING: Record<number, string> = { 1: 'ring-amber-400', 2: 'ring-slate-300', 3: 'ring-orange-700' };
const PODIUM_MEDAL: Record<number, string> = { 1: 'text-amber-400', 2: 'text-slate-300', 3: 'text-orange-700' };

function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

export default function LeaderboardPage() {
  const [metricTab, setMetricTab] = useState<MetricTab>('LEVEL');
  const [attributeKey, setAttributeKey] = useState<AttributeKey | null>(null);
  const [period, setPeriod] = useState<LeaderboardPeriod>('WEEK');
  const [manageOpen, setManageOpen] = useState(false);

  const attributesQuery = useQuery({ queryKey: ['attributes'], queryFn: getAttributes });
  const requestsQuery = useQuery({ queryKey: ['friends', 'requests'], queryFn: getFriendRequests });
  const incomingCount = (requestsQuery.data ?? []).filter((request) => request.direction === 'INCOMING').length;

  const effectiveAttributeKey = attributeKey ?? attributesQuery.data?.[0]?.key ?? null;
  const attributeName = attributesQuery.data?.find((attribute) => attribute.key === effectiveAttributeKey)?.name;

  const leaderboardQuery = useQuery({
    queryKey: [
      'leaderboard',
      metricTab,
      metricTab === 'ATTRIBUTE' ? effectiveAttributeKey : null,
      metricTab === 'XP' ? period : null,
    ],
    queryFn: () => {
      if (metricTab === 'ATTRIBUTE') {
        return getLeaderboard({ metric: 'ATTRIBUTE', attributeKey: effectiveAttributeKey as AttributeKey });
      }
      if (metricTab === 'XP') {
        return getLeaderboard({ metric: 'XP', period });
      }
      return getLeaderboard({ metric: 'LEVEL' });
    },
    enabled: metricTab !== 'ATTRIBUTE' || !!effectiveAttributeKey,
  });

  const entries = leaderboardQuery.data ?? [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  const unitLabel = metricTab === 'XP' ? 'XP' : metricTab === 'ATTRIBUTE' ? (attributeName ?? 'Attribute') : 'Level';
  const showCharacterLevelSubtitle = metricTab !== 'LEVEL';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted">See how you stack up against your friends.</p>
        </div>
        <Button variant="outline" onClick={() => setManageOpen(true)} className="relative">
          <Users className="h-4 w-4" />
          Manage Friends
          {incomingCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {incomingCount}
            </span>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {METRIC_TABS.map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMetricTab(tab)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                metricTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {metricTab === 'ATTRIBUTE' && (
          <div role="radiogroup" aria-label="Filter by attribute" className="flex flex-wrap items-center gap-2">
            {(attributesQuery.data ?? []).map((attribute) => {
              const Icon = resolveAttributeIcon(attribute.icon);
              const isSelected = attribute.key === effectiveAttributeKey;
              return (
                <button
                  key={attribute.key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={attribute.name}
                  title={attribute.name}
                  onClick={() => setAttributeKey(attribute.key)}
                  style={{
                    backgroundColor: attributeColor(attribute.key, 0.15),
                    color: attributeColor(attribute.key),
                    boxShadow: isSelected ? `0 0 0 2px ${attributeColor(attribute.key)}` : undefined,
                  }}
                  className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full transition-all ${
                    isSelected ? 'px-3' : 'w-9 justify-center'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {isSelected && <span className="text-xs font-semibold">{attribute.name}</span>}
                </button>
              );
            })}
          </div>
        )}

        {metricTab === 'XP' && (
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      {leaderboardQuery.isLoading ? (
        <PageSpinner />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Crown}
          title="No one to compare yet"
          description="Add some friends to see how you stack up."
          action={
            <Button onClick={() => setManageOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Add Friends
            </Button>
          }
        />
      ) : (
        <>
          <Podium entries={podium} unitLabel={unitLabel} showCharacterLevelSubtitle={showCharacterLevelSubtitle} />
          {rest.length > 0 && (
            <Card className="divide-y divide-border p-0">
              {rest.map((entry) => (
                <LeaderboardRow
                  key={entry.userId}
                  entry={entry}
                  unitLabel={unitLabel}
                  showCharacterLevelSubtitle={showCharacterLevelSubtitle}
                />
              ))}
            </Card>
          )}
        </>
      )}

      <ManageFriendsModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}

interface PodiumProps {
  entries: LeaderboardEntry[];
  unitLabel: string;
  showCharacterLevelSubtitle: boolean;
}

function Podium({ entries, unitLabel, showCharacterLevelSubtitle }: PodiumProps) {
  if (entries.length === 0) return null;

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {entries.map((entry) => (
        <div key={entry.userId} className={`flex w-28 flex-col items-center sm:w-36 ${PODIUM_ORDER[entry.rank]}`}>
          <Medal className={`mb-1 h-6 w-6 ${PODIUM_MEDAL[entry.rank]}`} />
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary ring-4 sm:h-16 sm:w-16 ${PODIUM_RING[entry.rank]}`}
          >
            {initials(entry.username)}
          </div>
          <p className="mt-2 max-w-full truncate text-sm font-semibold text-foreground">{entry.username}</p>
          {entry.isCurrentUser && (
            <Badge variant="primary" className="mt-0.5">
              You
            </Badge>
          )}
          {showCharacterLevelSubtitle && <p className="mt-0.5 text-xs text-muted">Character Lvl {entry.characterLevel}</p>}
          <div
            className={`mt-2 flex w-full flex-col items-center justify-end rounded-t-xl border border-b-0 border-border bg-surface pt-2 ${PODIUM_HEIGHT[entry.rank]}`}
          >
            <p className="text-2xl font-bold text-foreground">{entry.value}</p>
            <p className="text-xs text-muted">{unitLabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  unitLabel: string;
  showCharacterLevelSubtitle: boolean;
}

function LeaderboardRow({ entry, unitLabel, showCharacterLevelSubtitle }: LeaderboardRowProps) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${entry.isCurrentUser ? 'bg-primary/5' : ''}`}>
      <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted">{entry.rank}</span>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-hover text-xs font-bold text-foreground">
        {initials(entry.username)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {entry.username}
          {entry.isCurrentUser && <span className="ml-1.5 text-xs font-normal text-primary">(you)</span>}
        </p>
        {showCharacterLevelSubtitle && <p className="text-xs text-muted">Character Lvl {entry.characterLevel}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-foreground">{entry.value}</p>
        <p className="text-xs text-muted">{unitLabel}</p>
      </div>
    </div>
  );
}

function ManageFriendsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [username, setUsername] = useState('');

  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends, enabled: open });
  const requestsQuery = useQuery({ queryKey: ['friends', 'requests'], queryFn: getFriendRequests, enabled: open });
  const suggestionsQuery = useQuery({
    queryKey: ['friends', 'suggestions'],
    queryFn: () => getFriendSuggestions(),
    enabled: open,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['friends'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  }

  const sendMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => {
      setUsername('');
      invalidateAll();
    },
    onError: (error) => {
      push({ title: 'Could not send friend request', description: getApiErrorMessage(error) });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: invalidateAll,
    onError: (error) => {
      push({ title: 'Could not accept request', description: getApiErrorMessage(error) });
    },
  });

  const declineMutation = useMutation({
    mutationFn: declineFriendRequest,
    onSuccess: invalidateAll,
    onError: (error) => {
      push({ title: 'Could not remove request', description: getApiErrorMessage(error) });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeFriend,
    onSuccess: invalidateAll,
    onError: (error) => {
      push({ title: 'Could not remove friend', description: getApiErrorMessage(error) });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  }

  function handleClose() {
    setUsername('');
    onClose();
  }

  const incoming = (requestsQuery.data ?? []).filter((request) => request.direction === 'INCOMING');
  const outgoing = (requestsQuery.data ?? []).filter((request) => request.direction === 'OUTGOING');
  const friends = friendsQuery.data ?? [];

  return (
    <Modal open={open} onClose={handleClose} title="Manage Friends">
      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-2">
          <Label htmlFor="friend-username">Add a friend by username</Label>
          <div className="flex gap-2">
            <Input
              id="friend-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="exact username"
            />
            <Button type="submit" loading={sendMutation.isPending}>
              <UserPlus className="h-4 w-4" />
              Send
            </Button>
          </div>
        </form>

        {!suggestionsQuery.isLoading && (suggestionsQuery.data ?? []).length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Suggested friends</p>
            <ul className="space-y-2">
              {(suggestionsQuery.data ?? []).map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{suggestion.username}</p>
                    <p className="text-xs text-muted">Level {suggestion.level}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    loading={sendMutation.isPending && sendMutation.variables === suggestion.username}
                    onClick={() => sendMutation.mutate(suggestion.username)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {incoming.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Incoming requests</p>
            <ul className="space-y-2">
              {incoming.map((request) => (
                <li
                  key={request.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <span className="truncate text-sm font-medium text-foreground">{request.user.username}</span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={acceptMutation.isPending && acceptMutation.variables === request.id}
                      onClick={() => acceptMutation.mutate(request.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={declineMutation.isPending && declineMutation.variables === request.id}
                      onClick={() => declineMutation.mutate(request.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {outgoing.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Pending (sent by you)</p>
            <ul className="space-y-2">
              {outgoing.map((request) => (
                <li
                  key={request.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <span className="truncate text-sm font-medium text-foreground">{request.user.username}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={declineMutation.isPending && declineMutation.variables === request.id}
                    onClick={() => declineMutation.mutate(request.id)}
                  >
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Friends ({friends.length})</p>
          {friendsQuery.isLoading ? (
            <Spinner className="h-4 w-4" />
          ) : friends.length === 0 ? (
            <p className="text-sm text-muted">No friends yet - add someone above to start comparing progress.</p>
          ) : (
            <ul className="space-y-2">
              {friends.map((friend) => (
                <li
                  key={friend.friendshipId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{friend.username}</p>
                    <p className="text-xs text-muted">Level {friend.level}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${friend.username}`}
                    title="Remove friend"
                    disabled={removeMutation.isPending && removeMutation.variables === friend.friendshipId}
                    onClick={() => {
                      if (window.confirm(`Remove ${friend.username} as a friend?`)) {
                        removeMutation.mutate(friend.friendshipId);
                      }
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
