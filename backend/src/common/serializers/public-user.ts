import { User } from '@prisma/client';
import { calculateLevelState } from '../leveling';

export function toPublicUser(user: User) {
  const { currentLevelXp, xpForNextLevel } = calculateLevelState(user.totalXP);
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatar: user.avatar,
    level: user.level,
    totalXP: user.totalXP,
    currentXP: currentLevelXp,
    xpForNextLevel,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    createdAt: user.createdAt,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
