'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { updateMe } from '@/lib/api/users';
import { getUnlockedLevelRewards } from '@/lib/api/level-rewards';
import { getApiErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const profileSchema = z.object({
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(24, 'At most 24 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only'),
  avatar: z.string().url('Enter a valid URL').optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: user?.username ?? '',
      avatar: user?.avatar ?? '',
    },
  });

  useEffect(() => {
    if (user) {
      reset({ username: user.username, avatar: user.avatar ?? '' });
    }
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      updateMe({ username: values.username, avatar: values.avatar || undefined }),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  async function onSubmit(values: ProfileFormValues) {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Could not update your profile'));
    }
  }

  const { data: unlockedRewards } = useQuery({
    queryKey: ['level-rewards', 'unlocked'],
    queryFn: getUnlockedLevelRewards,
    enabled: !!user,
  });
  const unlockedTitles = (unlockedRewards ?? []).filter((ur) => ur.levelReward.type === 'TITLE');

  const titleMutation = useMutation({
    mutationFn: (equippedTitleId: string | null) => updateMe({ equippedTitleId }),
    onSuccess: (updatedUser) => setUser(updatedUser),
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your profile, appearance and account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" {...register('username')} />
            <FieldError>{errors.username?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="avatar">Avatar URL</Label>
            <Input id="avatar" placeholder="https://..." {...register('avatar')} />
            <FieldError>{errors.avatar?.message}</FieldError>
          </div>

          {formError && <p className="text-sm text-danger">{formError}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" loading={isSubmitting}>
              Save changes
            </Button>
            {saved && <span className="text-sm text-success">Saved</span>}
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        {unlockedTitles.length === 0 ? (
          <p className="text-sm text-muted">
            No titles unlocked yet. Level up your character or attributes to earn one.
          </p>
        ) : (
          <div>
            <Label htmlFor="equipped-title">Displayed title</Label>
            <Select
              id="equipped-title"
              value={user.equippedTitle?.id ?? ''}
              onChange={(event) => titleMutation.mutate(event.target.value || null)}
              disabled={titleMutation.isPending}
            >
              <option value="">None</option>
              {unlockedTitles.map((ur) => (
                <option key={ur.levelReward.id} value={ur.levelReward.id}>
                  {ur.levelReward.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Theme</p>
            <p className="text-sm text-muted">Switch between light and dark mode.</p>
          </div>
          <ThemeToggle />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Email</span>
            <span className="font-medium text-foreground">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Member since</span>
            <span className="font-medium text-foreground">{format(new Date(user.createdAt), 'MMMM d, yyyy')}</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log Out</CardTitle>
        </CardHeader>
        <p className="mb-4 text-sm text-muted">You&apos;ll need to log back in to continue your journey.</p>
        <Button variant="outline" onClick={() => logout()}>
          Log out
        </Button>
      </Card>
    </div>
  );
}
