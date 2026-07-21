import {
  Award,
  BarChart3,
  BookOpen,
  CheckSquare,
  Crown,
  History,
  Hourglass,
  LayoutDashboard,
  Repeat,
  Sparkles,
  Target,
} from 'lucide-react';

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/skills', label: 'Skills', icon: Sparkles },
  { href: '/quests', label: 'Quests', icon: CheckSquare },
  { href: '/habits', label: 'Habits', icon: Repeat },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/seasons', label: 'Seasons', icon: Hourglass },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/achievements', label: 'Achievements', icon: Award },
  { href: '/timeline', label: 'Timeline', icon: History },
  { href: '/leaderboard', label: 'Leaderboard', icon: Crown },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
] as const;
