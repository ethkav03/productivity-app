'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  adjustAdminUserXp,
  deleteAdminUser,
  getAdminAchievements,
  getAdminUser,
  grantAdminAchievement,
  revokeAdminAchievement,
  updateAdminUser,
} from '@/lib/api/admin';
import { AttributeKey } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toaster';

interface UserDetailModalProps {
  userId: string;
  onClose: () => void;
}

export function UserDetailModal({ userId, onClose }: UserDetailModalProps) {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const userQuery = useQuery({ queryKey: ['admin', 'users', userId], queryFn: () => getAdminUser(userId) });
  const achievementsQuery = useQuery({ queryKey: ['admin', 'achievements'], queryFn: getAdminAchievements });

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (userQuery.data && !initialized) {
      setUsername(userQuery.data.username);
      setEmail(userQuery.data.email);
      setAvatar(userQuery.data.avatar ?? '');
      setIsAdmin(userQuery.data.isAdmin);
      setInitialized(true);
    }
  }, [userQuery.data, initialized]);

  function invalidateUser() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'], exact: false });
  }

  const updateMutation = useMutation({
    mutationFn: updateAdminUser,
    onSuccess: () => {
      push({ title: 'User updated' });
      invalidateUser();
    },
    onError: (error) => push({ title: 'Could not update user', description: getApiErrorMessage(error) }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => {
      push({ title: 'User deleted' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'], exact: false });
      onClose();
    },
    onError: (error) => push({ title: 'Could not delete user', description: getApiErrorMessage(error) }),
  });

  const grantMutation = useMutation({
    mutationFn: (achievementId: string) => grantAdminAchievement(userId, achievementId),
    onSuccess: invalidateUser,
    onError: (error) => push({ title: 'Could not grant achievement', description: getApiErrorMessage(error) }),
  });

  const revokeMutation = useMutation({
    mutationFn: (achievementId: string) => revokeAdminAchievement(userId, achievementId),
    onSuccess: invalidateUser,
    onError: (error) => push({ title: 'Could not revoke achievement', description: getApiErrorMessage(error) }),
  });

  function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    updateMutation.mutate({ id: userId, username, email, avatar: avatar.trim() || undefined, isAdmin });
  }

  function handleDelete() {
    if (window.confirm(`Permanently delete ${userQuery.data?.username}? This cannot be undone.`)) {
      deleteMutation.mutate(userId);
    }
  }

  const unlockedIds = new Set((userQuery.data?.unlockedAchievements ?? []).map((row) => row.achievementId));

  return (
    <Modal open onClose={onClose} title={userQuery.data ? `Manage ${userQuery.data.username}` : 'Manage user'}>
      {!userQuery.data ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Profile</p>
            <div>
              <Label htmlFor="edit-username">Username</Label>
              <Input id="edit-username" value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-avatar">Avatar URL</Label>
              <Input id="edit-avatar" value={avatar} onChange={(event) => setAvatar(event.target.value)} placeholder="https://..." />
              <FieldError>{updateMutation.isError ? getApiErrorMessage(updateMutation.error) : undefined}</FieldError>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(event) => setIsAdmin(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Admin access
            </label>
            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger/10"
                loading={deleteMutation.isPending}
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete user
              </Button>
              <Button type="submit" size="sm" loading={updateMutation.isPending}>
                Save profile
              </Button>
            </div>
          </form>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">XP &amp; Levels</p>
            <div className="space-y-2">
              <XpAdjustRow userId={userId} label="Character" level={userQuery.data.level} totalXP={userQuery.data.totalXP} />
              {userQuery.data.attributes.map((attribute) => (
                <XpAdjustRow
                  key={attribute.id}
                  userId={userId}
                  attributeKey={attribute.key}
                  label={attribute.name}
                  level={attribute.level}
                  totalXP={attribute.totalXP}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Achievements ({unlockedIds.size} / {achievementsQuery.data?.length ?? 0})
            </p>
            {achievementsQuery.isLoading ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <ul className="space-y-2">
                {(achievementsQuery.data ?? []).map((achievement) => {
                  const unlocked = unlockedIds.has(achievement.id);
                  return (
                    <li
                      key={achievement.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{achievement.name}</p>
                        <p className="truncate text-xs text-muted">{achievement.description}</p>
                      </div>
                      {unlocked ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0"
                          loading={revokeMutation.isPending && revokeMutation.variables === achievement.id}
                          onClick={() => revokeMutation.mutate(achievement.id)}
                        >
                          Revoke
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          loading={grantMutation.isPending && grantMutation.variables === achievement.id}
                          onClick={() => grantMutation.mutate(achievement.id)}
                        >
                          Grant
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

interface XpAdjustRowProps {
  userId: string;
  attributeKey?: AttributeKey;
  label: string;
  level: number;
  totalXP: number;
}

function XpAdjustRow({ userId, attributeKey, label, level, totalXP }: XpAdjustRowProps) {
  const [amount, setAmount] = useState('');
  const queryClient = useQueryClient();
  const { push } = useToast();

  const mutation = useMutation({
    mutationFn: adjustAdminUserXp,
    onSuccess: (result) => {
      setAmount('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'], exact: false });
      push({
        title: result.leveledUp ? `${label} leveled up to ${result.newLevel}!` : `${label} XP adjusted`,
        variant: result.leveledUp ? 'levelup' : 'xp',
      });
    },
    onError: (error) => push({ title: `Could not adjust ${label} XP`, description: getApiErrorMessage(error) }),
  });

  function handleAdjust() {
    const parsed = parseInt(amount, 10);
    if (!parsed) return;
    mutation.mutate({ userId, amount: parsed, attributeKey });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted">
          Lvl {level} &middot; {totalXP.toLocaleString()} XP
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Input
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="+/- XP"
          className="w-24"
        />
        <Button size="sm" variant="outline" loading={mutation.isPending} disabled={!amount} onClick={handleAdjust}>
          Adjust
        </Button>
      </div>
    </div>
  );
}
