'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ShieldCheck } from 'lucide-react';
import { getAdminUsers } from '@/lib/api/admin';
import { getApiErrorMessage } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/spinner';
import { UserDetailModal } from './user-detail-modal';

export function UsersPanel() {
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => getAdminUsers(search.trim() || undefined),
  });

  const users = usersQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by username or email..."
        className="max-w-sm"
      />

      {usersQuery.isLoading ? (
        <PageSpinner />
      ) : usersQuery.isError ? (
        <p className="text-sm text-danger">{getApiErrorMessage(usersQuery.error, 'Could not load users')}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted">No users found.</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Username</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Level</th>
                <th className="px-4 py-2.5 font-medium">Total XP</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className="cursor-pointer transition-colors hover:bg-surface-hover"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    <div className="flex items-center gap-1.5">
                      {user.username}
                      {user.isAdmin && (
                        <span title="Admin">
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{user.email}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="primary">Lvl {user.level}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{user.totalXP.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-muted">
                    {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-medium text-primary">Manage</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {selectedUserId && (
        <UserDetailModal key={selectedUserId} userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
    </div>
  );
}
