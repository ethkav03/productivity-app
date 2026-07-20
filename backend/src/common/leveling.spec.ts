import { calculateLevelState, xpRequiredForLevel } from './leveling';

describe('xpRequiredForLevel', () => {
  it('is 100 * level', () => {
    expect(xpRequiredForLevel(1)).toBe(100);
    expect(xpRequiredForLevel(4)).toBe(400);
    expect(xpRequiredForLevel(10)).toBe(1000);
  });
});

describe('calculateLevelState', () => {
  it('starts every character/skill/attribute at level 1 with 0 XP', () => {
    expect(calculateLevelState(0)).toEqual({ level: 1, currentLevelXp: 0, xpForNextLevel: 100 });
  });

  it('clamps negative totals to the level-1 floor rather than going negative', () => {
    expect(calculateLevelState(-500)).toEqual({ level: 1, currentLevelXp: 0, xpForNextLevel: 100 });
  });

  it('lands exactly on a level boundary with 0 XP into the new level', () => {
    // cumulative XP to reach level 5 is 100+200+300+400 = 1000
    expect(calculateLevelState(1000)).toEqual({ level: 5, currentLevelXp: 0, xpForNextLevel: 500 });
  });

  it('is one XP short of a level boundary', () => {
    expect(calculateLevelState(999)).toEqual({ level: 4, currentLevelXp: 399, xpForNextLevel: 400 });
  });

  it('is always recomputed from cumulative XP, not incremented in place', () => {
    // Two totals that both fall inside level 3's range should agree on level and differ only in currentLevelXp.
    expect(calculateLevelState(350).level).toBe(3);
    expect(calculateLevelState(599).level).toBe(3);
    expect(calculateLevelState(350).currentLevelXp).toBe(50);
    expect(calculateLevelState(599).currentLevelXp).toBe(299);
  });
});
