'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, LogOut, ShieldAlert, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/api/notifications';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export function Topbar() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(),
    refetchInterval: 60_000,
    enabled: !!user,
  });

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  async function handleMarkAll() {
    await markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function handleMarkOne(id: string) {
    await markNotificationRead(id);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  if (!user) return null;

  const progressPercent = user.xpForNextLevel > 0 ? (user.currentXP / user.xpForNextLevel) * 100 : 0;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
          {user.level}
        </div>
        <div className="hidden min-w-[10rem] sm:block">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Level {user.level}</span>
            <span>
              {user.currentXP}/{user.xpForNextLevel} XP
            </span>
          </div>
          <ProgressBar value={progressPercent} size="sm" className="mt-1" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Button variant="ghost" size="icon" onClick={() => setNotifOpen((v) => !v)} aria-label="Notifications">
            <Bell className="h-4.5 w-4.5" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-danger" />
            )}
          </Button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-border bg-surface p-2 shadow-glow">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-semibold text-foreground">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAll} className="text-xs text-primary hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="mt-1 max-h-80 overflow-y-auto scrollbar-thin">
                  {!notifications || notifications.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-muted">No notifications yet.</p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => !n.read && handleMarkOne(n.id)}
                        className={`w-full rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-surface-hover ${
                          n.read ? 'opacity-60' : ''
                        }`}
                      >
                        <p className="font-medium text-foreground">{n.title}</p>
                        <p className="mt-0.5 text-muted">{n.message}</p>
                        <p className="mt-1 text-[10px] text-muted">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <Button variant="ghost" size="icon" onClick={() => setMenuOpen((v) => !v)} aria-label="Account menu">
            <UserIcon className="h-4.5 w-4.5" />
          </Button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-glow">
                <p className="truncate px-2 py-1.5 text-xs font-medium text-muted">{user.username}</p>
                {user.isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-hover"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Admin Dashboard
                  </Link>
                )}
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-danger hover:bg-surface-hover"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
