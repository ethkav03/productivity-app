'use client';

import { useCallback } from 'react';
import { useToast } from '@/components/ui/toaster';
import { CompletionResult } from '@/lib/types';

/**
 * Turns a CompletionResult (returned by quest/habit/goal `complete` and
 * goal `progress` endpoints) into a sequence of toasts: XP gained, level up,
 * and any newly unlocked achievements. Callers are still responsible for
 * invalidating the relevant TanStack Query caches (user, skills,
 * achievements) after a completion.
 */
export function useCelebration() {
  const { push } = useToast();

  return useCallback(
    (result: CompletionResult) => {
      push({ variant: 'xp', title: `+${result.xpGained} XP`, description: 'Nice work.' });

      if (result.levelUp) {
        push({ variant: 'levelup', title: 'Level up!', description: `You reached Level ${result.newLevel}.` });
      }

      result.skillResults
        .filter((skill) => skill.leveledUp)
        .forEach((skill) => {
          push({ variant: 'levelup', title: 'Skill level up!', description: `Reached Level ${skill.newLevel}.` });
        });

      result.achievementsUnlocked.forEach((name) => {
        push({ variant: 'achievement', title: 'Achievement unlocked', description: name });
      });
    },
    [push],
  );
}
