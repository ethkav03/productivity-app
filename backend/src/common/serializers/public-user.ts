import { User } from '@prisma/client';
import { calculateLevelState } from '../leveling';

interface UserWithEquippedTitle extends User {
  /** Only populated when the caller included the `equippedTitle` relation - omitted callers (e.g. auth login/register) get `null`, refreshed on the next `getMe`. */
  equippedTitle?: { id: string; name: string } | null;
}

export function toPublicUser(user: UserWithEquippedTitle) {
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
    isAdmin: user.isAdmin,
    equippedTitle: user.equippedTitle ?? null,
    habitStreakProtectionCharges: user.habitStreakProtectionCharges,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;

/**
 * Like `toPublicUser`, but for rendering a DIFFERENT user's profile back to
 * the current user (friend requests, friends list, leaderboard) - omits
 * `email` and streak fields, which are private to the account owner.
 */
export function toFriendProfile(user: User) {
  const { currentLevelXp, xpForNextLevel } = calculateLevelState(user.totalXP);
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    level: user.level,
    totalXP: user.totalXP,
    currentXP: currentLevelXp,
    xpForNextLevel,
  };
}

export type FriendProfile = ReturnType<typeof toFriendProfile>;
