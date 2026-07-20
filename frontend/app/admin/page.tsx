'use client';

import { useState } from 'react';
import { Link2, Users } from 'lucide-react';
import { UsersPanel } from './_components/users-panel';
import { FriendshipsPanel } from './_components/friendships-panel';

type AdminTab = 'USERS' | 'FRIENDSHIPS';

const TABS: Array<[AdminTab, string, typeof Users]> = [
  ['USERS', 'Users', Users],
  ['FRIENDSHIPS', 'Friendships', Link2],
];

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('USERS');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Manually edit users, XP/levels, friendships, and achievements.</p>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface p-1">
        {TABS.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === value ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'USERS' ? <UsersPanel /> : <FriendshipsPanel />}
    </div>
  );
}
