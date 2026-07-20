# Gameplay Systems

This is a deep-dive reference for Life RPG's core game-mechanic logic: the XP ledger, the
leveling formula, the completion workflow, duplicate-completion safety, the achievement engine,
and the friends/leaderboard social layer. It documents the current backend implementation as of
this writing, not an aspirational design. If you change any of the mechanics described here,
update this file in the same change (see the closing note at the bottom).

Source files referenced throughout:

- `backend/src/xp/xp.service.ts`, `backend/src/xp/xp.types.ts`
- `backend/src/progression/progression.service.ts`, `backend/src/progression/progression.types.ts`
- `backend/src/achievements/achievements.service.ts`
- `backend/src/common/leveling.ts`, `backend/src/common/period.ts`
- `backend/src/quests/quests.service.ts`, `backend/src/habits/habits.service.ts`,
  `backend/src/goals/goals.service.ts`
- `backend/src/auth/auth.service.ts`, `backend/src/attributes/attributes.service.ts`,
  `backend/src/attributes/default-attributes.ts`, `backend/src/skills/default-skills.ts`
- `backend/src/friends/friends.service.ts`, `backend/src/leaderboard/leaderboard.service.ts`,
  `backend/src/leaderboard/period-bounds.ts`
- `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`

## 1. The core loop

```
Goals → Quests / Habits → Complete them → XP → Skills level up → Attributes level up → Character levels up
                                              ↓
                                       Achievements unlock
                                              ↓
                                          Analytics
```

| Step | Implemented in |
| --- | --- |
| Goals broken into quests, or tracked directly (binary/numeric) | `backend/src/goals/goals.service.ts` |
| Completing a quest/habit, or progressing a goal to completion | `QuestsService.complete`, `HabitsService.complete`, `GoalsService.progress` |
| XP awarded to character/skills/attributes as an immutable ledger | `backend/src/xp/xp.service.ts` (`XpService.awardXp`) |
| Level recalculated for character, each skill, each attribute | `backend/src/common/leveling.ts` (`calculateLevelState`), invoked from `awardXp` |
| Orchestration of the full "complete an activity" workflow | `backend/src/progression/progression.service.ts` (`ProgressionService.completeActivity`) |
| Achievements unlocked | `backend/src/achievements/achievements.service.ts` (`AchievementsService.checkAndUnlock`) |
| Analytics (read-only aggregation over the XP ledger) | `backend/src/analytics/*` (not detailed here; reads `XPTransaction`) |

Quests, habits, and goals never call `XpService` or `AchievementsService` directly - they all
funnel through `ProgressionService.completeActivity` (goal creation is the one exception, see
section 7).

## 2. The attribute hierarchy

There are exactly 8 fixed attributes, defined in `backend/src/attributes/default-attributes.ts`
as `DEFAULT_ATTRIBUTES`:

| `AttributeKey` | Name | Icon |
| --- | --- | --- |
| `PHYSICAL` | Physical | `dumbbell` |
| `INTELLIGENCE` | Intelligence | `brain` |
| `DISCIPLINE` | Discipline | `shield` |
| `ENERGY` | Energy | `zap` |
| `SOCIAL` | Social | `users` |
| `WEALTH` | Wealth | `wallet` |
| `CREATIVITY` | Creativity | `palette` |
| `WISDOM` | Wisdom | `compass` |

`AttributeKey` is a Prisma enum (`backend/prisma/schema.prisma`), so these 8 values are the
complete set - there is no mechanism to add a 9th attribute without a schema migration.

**Attributes are not opt-in.** Every user gets all 8 attribute rows auto-created at registration
via `AttributesService.ensureDefaultAttributes`, called from `AuthService.register` inside the
same transaction that creates the `User` row (`backend/src/auth/auth.service.ts`):

```ts
const user = await this.prisma.$transaction(async (tx) => {
  const created = await tx.user.create({ data: { email, username, passwordHash } });
  await this.attributesService.ensureDefaultAttributes(created.id, tx);
  return created;
});
```

`ensureDefaultAttributes` does a single `createMany` over `DEFAULT_ATTRIBUTES` with
`skipDuplicates: true`, seeding `key`, `name`, `description`, and `icon` for each. There is no
user-facing "attribute picker" - attributes exist unconditionally the moment an account exists.

**Skills are opt-in.** Unlike attributes, no skills are auto-created at registration. A user (or
onboarding flow) explicitly creates `Skill` rows, each pointing at exactly one attribute via
`Skill.attributeId` (`backend/prisma/schema.prisma`, `model Skill`).

**Skill-name uniqueness is scoped per-attribute, not per-user.** The schema constraint is:

```prisma
@@unique([userId, attributeId, name])
```

on `model Skill`. This means the same skill name can legitimately exist twice for one user, as
long as it's under two different attributes - e.g. a skill named "Focus" as a distinct stat under
both Intelligence and Discipline. Any code that looks up a skill by `(userId, name)` alone (e.g.
achievement conditions - see section 7) must also disambiguate by attribute when the name isn't
unique for that user.

**Default skill suggestions.** `backend/src/skills/default-skills.ts` exports `DEFAULT_SKILLS`, a
flat array of ~77 `{ name, description, attributeKey }` entries grouped by attribute in source
order (Physical, Intelligence, Discipline, Energy, Social, Wealth, Creativity, Wisdom). These are
suggestions surfaced during onboarding and in the "Add Skill" picker; users may accept any subset
or create fully custom skills. "Focus" (Intelligence) and "Focus" (Discipline) both appear in this
list as the canonical example of the per-attribute uniqueness rule above. "Recovery" (Physical)
and "Recovery" (Energy) and "Adaptability" (Intelligence) and "Adaptability" (Wisdom) are further
examples already present in the seed data.

## 3. The centralised XP ledger

`XpService.awardXp` (`backend/src/xp/xp.service.ts`) is the **only** place in the codebase
permitted to change `totalXP`/`level` on a `User`, `Skill`, or `Attribute`. The class-level
comment states the rule explicitly: every XP source (quests, habits, goals, achievement bonuses,
manual corrections) must flow through `awardXp` rather than mutating a counter directly, so XP is
always backed by an immutable `XPTransaction` record.

### Shape

```ts
interface AwardXpParams {
  userId: string;
  amount: number;
  sourceType: XPSourceType;      // QUEST_COMPLETION | HABIT_COMPLETION | GOAL_COMPLETION | ACHIEVEMENT_BONUS | CORRECTION
  sourceId?: string;
  skillIds?: string[];           // skills tagged on the completed activity
  note?: string;
}

interface XpAwardResult {
  xpGained: number;
  character: LevelChangeResult;               // { previousLevel, newLevel, leveledUp }
  skills: SkillXpResult[];                     // one per skillId, each extends LevelChangeResult with skillId
  attributes: AttributeXpResult[];             // one per skillId (not deduplicated), each extends LevelChangeResult with attributeId
}
```

### What one call to `awardXp` writes

Everything happens inside a single `prisma.$transaction`. For a call with `amount = X` and
`skillIds = [s1, s2]` where `s1` and `s2` both belong to attribute `A`:

1. **One character-level `XPTransaction`** with `skillId: null` and `attributeId: null`, `amount: X`.
   `User.totalXP` is incremented by `X` and `User.level` recalculated via `calculateLevelState`.
2. **One `XPTransaction` per skill in `skillIds`**, each with `amount: X` (the *full* amount, not
   `X` split across skills). Each skill's `totalXP`/`level` is updated the same way.
3. **One `XPTransaction` per skill's attribute**, again each with the *full* `amount: X`. Because
   this loops per-skill rather than per-unique-attribute, if two tagged skills share an attribute
   (as in the example above), that attribute receives `X` **twice** in the same call - two
   separate `XPTransaction` rows, each `amount: X`.

So for the example above, one `awardXp({ amount: X, skillIds: [s1, s2] })` call writes 4 rows
total: 1 character row + 2 skill rows + 2 attribute rows (both crediting attribute `A`), and `A`'s
`totalXP` increases by `2 * X`, not `X`.

**This is deliberate, not a bug.** The code comment in `xp.service.ts` says so directly:

> Every skill's XP also flows up to the attribute it belongs to. Deliberately not deduplicated
> across skills sharing an attribute - same rationale as skills each getting the full XP amount.

The reasoning: if an activity is tagged with two skills, it's meant to represent meaningfully
practicing *both* of them, not splitting one unit of effort between them. Awarding each the full
amount avoids punishing users for tagging multiple relevant skills on one activity, and lets each
skill's own progression stay an honest reflection of "how much have I done that specifically
counts as this skill" independent of how it's grouped elsewhere.

### The `skillId: null AND attributeId: null` invariant

Because a single completion event can write up to `1 + N + N` rows (character + N skills + N
attribute credits), **any query that wants to count or sum "one row per completion event"** -
i.e. the character-level ledger - must filter on **both** `skillId: null` and `attributeId: null`
together. Filtering on only one of the two is not sufficient (a skill row has `attributeId: null`
too, since only the attribute-credit rows populate `attributeId`).

This invariant is load-bearing in `AchievementsService.countCompletions`
(`backend/src/achievements/achievements.service.ts`):

```ts
private countCompletions(userId: string, sourceType: XPSourceType) {
  // skillId + attributeId both null isolates the one character-level
  // ledger row per completion event, so multi-skill/multi-attribute
  // quests and habits aren't over-counted.
  return this.prisma.xPTransaction.count({
    where: { userId, sourceType, skillId: null, attributeId: null },
  });
}
```

Without this double-null filter, `QUESTS_COMPLETED`/`HABITS_COMPLETED`/`GOALS_COMPLETED`
achievement counts (and any future analytics that count "number of completions") would be
inflated by a multiple equal to however many skills (and shared attributes) were tagged on each
completed activity. **Any new code querying `XPTransaction` to count or sum "events" rather than
"XP flowed to a specific skill/attribute" must respect this same filter.**

### `sourceName` and `eventId`

Two more fields ride along on every row `awardXp` writes:

- **`sourceName`** - the activity's display name (a quest/habit/goal's `title`), passed in by the
  caller and stamped onto every row from the call. Captured at write time rather than resolved
  later by joining on `sourceId`, so a ledger row's label survives its source being renamed or
  deleted - `AnalyticsService.feed`/`xpHistory` read this directly instead of doing a live join.
- **`eventId`** - a UUID (`crypto.randomUUID()`) generated once per `awardXp` call and stamped on
  every row it writes, so a UI can reconstruct "one event" (the character row plus every
  skill/attribute row it cascaded into). This is **not** `createdAt`: even though every row from
  one call is written inside the same `$transaction`, Prisma evaluates a `@default(now())` value
  per statement (client-side), not once per transaction - sibling rows routinely land a few
  milliseconds apart. Grouping by `eventId` is exact regardless of timing; grouping by `createdAt`
  was tried first and was not (see `AnalyticsService.xpHistory`'s own history for the bug this
  caused). Both fields are nullable, since rows written before they existed have nothing to
  backfill `eventId` with (`sourceName` was backfilled best-effort from current entity titles).

### Corrections: the one path outside the cascade

`XpService.applyCorrection` is a second, deliberately narrower entry point into the same ledger,
used by the admin dashboard's XP/level editor (`docs/backend.md` § `AdminModule`). Unlike
`awardXp`:

- Its `amount` **may be negative** - the only place in the codebase this is allowed, matching the
  `XPTransaction.amount` field's own doc comment ("can be negative for CORRECTION").
- It never cascades: a correction targets *exactly* the character or *exactly* one named
  attribute (via an optional `attributeId`), never both and never any skills, since it isn't tied
  to completing anything - there is no "associated skill" to cascade through.
- The resulting total is clamped to a minimum of `0` (`Math.max(0, ...)`) rather than allowed to
  go negative, since a stored negative `totalXP` has no meaningful level.
- It still writes `sourceType: 'CORRECTION'`, its own fresh `eventId`, and a `note` (defaulted to
  `"Admin correction"` if the caller omits one) - so corrections show up in `xpHistory` like any
  other event, just as a single-line one.

## 4. Leveling formula

Defined once in `backend/src/common/leveling.ts` and shared by the character, every skill, and
every attribute - there is exactly one leveling curve used everywhere in the app.

```ts
// XP required to go from `level` to `level + 1`:
function xpRequiredForLevel(level: number): number {
  return 100 * level;
}
```

So the cost to advance out of level 1 is 100 XP, out of level 2 is 200 XP, out of level 3 is 300
XP, and so on - the cost per level increases linearly, making the *cumulative* XP curve
quadratic.

`calculateLevelState(totalXp)` derives level state from scratch every time, by walking up from
level 1 and subtracting `xpRequiredForLevel(level)` for as long as `remaining` XP covers it:

```ts
function calculateLevelState(totalXp: number): LevelState {
  let level = 1;
  let remaining = Math.max(0, totalXp);

  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level);
    level += 1;
  }

  return { level, currentLevelXp: remaining, xpForNextLevel: xpRequiredForLevel(level) };
}
```

It is **recomputed from `totalXP` on every award**, never incremented step-by-step - `awardXp`
calls it once on the pre-award total (`previousLevelState`) and once on the post-award total
(`newLevelState`), then compares the two `.level` values to determine `leveledUp`. This means the
level is always a pure function of cumulative XP: if `totalXP` is ever corrected (a `CORRECTION`
source-type transaction), the level self-corrects too, with no drift possible from
incrementing/decrementing separately.

### Worked example

Cumulative XP thresholds to *reach* each level (sum of `xpRequiredForLevel(1..n-1)`):

| Level | Cumulative XP needed to reach it | XP required to leave it (`100 * level`) |
| --- | --- | --- |
| 1 | 0 | 100 |
| 2 | 100 | 200 |
| 3 | 300 | 300 |
| 4 | 600 | 400 |
| 5 | 1000 | 500 |

So a user with `totalXP = 300` is exactly at the level-3 threshold: level 1 costs 100 (remaining
200), level 2 costs 200 (remaining 0) → level becomes 3 with `currentLevelXp = 0`,
`xpForNextLevel = 300`. A user with `totalXP = 450` is level 3 with `currentLevelXp = 150` (450 -
100 - 200 = 150) and `xpForNextLevel = 300` (150/300 of the way to level 4).

`DIFFICULTY_XP` (same file) maps `QuestDifficulty` to a flat XP reward used as the default when a
quest's `xpReward` isn't explicitly set:

| Difficulty | XP |
| --- | --- |
| `EASY` | 25 |
| `MEDIUM` | 50 |
| `HARD` | 100 |
| `EPIC` | 250 |
| `LEGENDARY` | 500 |

(Habits default to `xpReward: 10` if unspecified; goals default to `xpReward: 500`. See
`HabitsService.create` and `GoalsService.create`.)

## 5. The completion workflow

`ProgressionService.completeActivity` (`backend/src/progression/progression.service.ts`) is the
single orchestration point for "what happens when a user completes an activity," per its
docstring reference to "the MVP spec (section 16)." `QuestsService.complete`,
`HabitsService.complete`, and `GoalsService.progress` all call this rather than touching
`XpService`/`AchievementsService` themselves. It executes in this exact order:

1. **Award XP.** `this.xpService.awardXp({ userId, amount, sourceType, sourceId, skillIds, note })`
   - runs first, unconditionally. This is the only step that writes to the XP ledger and
   recalculates levels (see sections 3-4).
2. **Update the character's daily streak**, unless the caller passed
   `updateCharacterStreak: false` (nothing in the current codebase passes `false` - all three
   resource modules take the default `true`, so every quest/habit/goal completion currently
   updates the character streak).
3. **Notify on level-up.** If `xpResult.character.leveledUp` is true, creates a `LEVEL_UP`
   notification via `NotificationsService.create`.
4. **Check achievements.** `this.achievementsService.checkAndUnlock(userId)` runs after the XP
   award and streak update, so achievement conditions see the fully up-to-date state (new level,
   new streak, new ledger rows) for this event.
5. **Return a `CompletionResult`.**

```ts
interface CompletionResult {
  xpGained: number;
  levelUp: boolean;
  newLevel: number;
  skillResults: Array<{ skillId: string; leveledUp: boolean; newLevel: number }>;
  attributeResults: Array<{ attributeId: string; leveledUp: boolean; newLevel: number }>;
  achievementsUnlocked: string[];   // achievement names
  streak?: { currentStreak: number; longestStreak: number };
}
```

### Character streak logic (`updateCharacterStreak`)

Private method on `ProgressionService`. It loads the user, computes today's day key
(`getDayKey()`, UTC `YYYY-MM-DD`), and the day key of the user's `lastActivityAt` (or `null` if
they've never had activity), then calls `nextStreakValue` from `backend/src/common/period.ts`:

```ts
function nextStreakValue(
  previousDayKey: string | null,
  newDayKey: string,
  previousStreak: number,
): number {
  if (!previousDayKey) return 1;              // first-ever activity
  const diff = daysBetweenKeys(previousDayKey, newDayKey);
  if (diff === 0) return previousStreak || 1; // same day: no-op (stays put, not incremented)
  if (diff === 1) return previousStreak + 1;  // exactly one day later: streak continues
  return 1;                                    // any larger gap: streak resets to 1
}
```

Day keys are pure UTC calendar dates (`date.toISOString().slice(0, 10)`), and `daysBetweenKeys`
diffs them as whole days at UTC midnight - so this is a calendar-day comparison, not a rolling
24-hour window. `longestStreak` is updated via `Math.max(user.longestStreak, currentStreak)`, and
`lastActivityAt` is set to `new Date()` (i.e. now) regardless of which branch fired. Completing
multiple activities on the same day keeps `currentStreak` unchanged (each completion still bumps
`lastActivityAt`, but same-day comparisons keep returning the existing streak value).

Habits track an *independent* streak on the `Habit` row itself (`currentStreak`/`longestStreak`
columns), computed the same way via the same `nextStreakValue` helper but keyed off
`HabitCompletion.periodKey` rather than `User.lastActivityAt` - see `HabitsService.complete` in
section 6. A single habit completion therefore can advance two separate streak counters: the
habit's own streak, and (via `ProgressionService.completeActivity`) the character's overall daily
streak.

## 6. Duplicate-completion safety

Three different mechanisms guard against double-awarding XP for the same completion, one per
activity type. In every case, **the state-changing write that blocks the duplicate happens before
`ProgressionService.completeActivity` (and therefore before any XP is awarded)** - so a retried or
duplicate request either fails outright on the second attempt, or is rejected before it ever
reaches `XpService.awardXp`. This ordering is what makes double-XP structurally impossible rather
than just unlikely.

### One-time quests: status check

`QuestsService.complete` (`backend/src/quests/quests.service.ts`), non-`RECURRING` branch:

```ts
if (quest.status === 'COMPLETED') {
  throw new ConflictException('Quest already completed');
}
await this.prisma.quest.update({
  where: { id },
  data: { status: 'COMPLETED', completedAt: new Date() },
});
```

The status transition `ACTIVE → COMPLETED` is written first. Only after that write succeeds does
the method call `this.progressionService.completeActivity(...)`. A second call against the same
quest re-reads `quest.status === 'COMPLETED'` (from the fresh `findUnique` at the top of
`complete`) and throws `ConflictException` before reaching the update or the XP award. (Archived
quests are also rejected up front, via a separate `status === 'ARCHIVED'` check.)

### Recurring quests: `lastCompletedAt` day-key comparison

Same method, `RECURRING` branch:

```ts
if (quest.lastCompletedAt && getDayKey(quest.lastCompletedAt) === today) {
  throw new ConflictException('Quest already completed today');
}
await this.prisma.quest.update({
  where: { id },
  data: { lastCompletedAt: new Date() },
});
```

`getDayKey` reduces `lastCompletedAt` to its UTC calendar day and compares it to today's day key.
As with one-time quests, the `lastCompletedAt` write happens before `completeActivity` is called,
so a duplicate request re-reads the now-updated `lastCompletedAt`, sees it matches today, and is
rejected. There is no database constraint backing this (`Quest.lastCompletedAt` is a plain
nullable `DateTime` column) - the guard is purely the application-level read-then-write, so it
relies on there being no concurrent-write race that reads stale state (Prisma's transactional
consistency and the request being scoped to a single user reduce this risk in practice, but it is
not enforced by a unique index the way habits are).

### Habits: database unique constraint

`HabitsService.complete` (`backend/src/habits/habits.service.ts`) inserts a `HabitCompletion` row
*first*, inside a try/catch, before doing anything else:

```ts
try {
  await this.prisma.habitCompletion.create({
    data: { habitId: id, userId, periodKey: today },
  });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('Habit already completed for this period');
  }
  throw error;
}
```

This is backed by an actual schema-level guarantee: `model HabitCompletion` has
`@@unique([habitId, periodKey])` in `backend/prisma/schema.prisma`. `periodKey` is today's UTC
day key (`getDayKey()`), so at most one `HabitCompletion` row can ever exist per habit per
calendar day, regardless of the habit's configured `frequency` (`DAILY`/`WEEKLY`/`MONTHLY` - all
are keyed by day for completion-locking purposes, per the comment in `period.ts`). A duplicate
insert raises Prisma error code `P2002` (unique constraint violation), which is caught and
translated to a `409 ConflictException`. Only after the insert succeeds does the method compute
the habit's own streak (via `nextStreakValue`, using the *previous* `HabitCompletion` row's
`periodKey`) and update the `Habit` row, and only after that does it call
`this.progressionService.completeActivity(...)`.

Unlike the quest checks (an application-level read that can theoretically race), the habit
mechanism is safe under concurrent duplicate requests because the database itself enforces
uniqueness - even two simultaneous requests can't both succeed the insert.

## 7. The achievement engine

`AchievementsService.checkAndUnlock(userId)` (`backend/src/achievements/achievements.service.ts`)
is **data-driven**: it does not have a `switch` per achievement *name*. Instead, it loads every
`Achievement` row the user hasn't already unlocked, evaluates a single generic `isConditionMet`
against each one's `requirementType`/`requirementValue`/`skillName`/`attributeKey` columns, and
unlocks (creates a `UserAchievement` row + fires a notification) whichever ones now pass. Adding a
new achievement is therefore a **seed-data change** (a new row in `backend/prisma/seed.ts`), not
a code change - as long as its condition fits one of the existing `AchievementRequirementType`
values.

```ts
async checkAndUnlock(userId: string): Promise<Achievement[]> {
  const [user, unlockedRows, allAchievements] = await Promise.all([...]);
  const candidates = allAchievements.filter(a => !unlockedIds.has(a.id));
  // evaluate isConditionMet(userId, user, achievement) for each candidate
  // create UserAchievement rows + notifications for the ones that pass
}
```

### `AchievementRequirementType` evaluation

| `requirementType` | How it's evaluated |
| --- | --- |
| `LEVEL_REACHED` | `user.level >= achievement.requirementValue` (character level, already on the loaded `User` row) |
| `STREAK_LENGTH` | `user.longestStreak >= achievement.requirementValue` (character's all-time longest streak, not the current one) |
| `QUESTS_COMPLETED` | `countCompletions(userId, 'QUEST_COMPLETION') >= requirementValue` - counts `XPTransaction` rows with that `sourceType` and **`skillId: null AND attributeId: null`** (the character-level ledger row per event; see section 3) |
| `HABITS_COMPLETED` | Same pattern, `sourceType: 'HABIT_COMPLETION'` |
| `GOALS_COMPLETED` | Same pattern, `sourceType: 'GOAL_COMPLETION'` |
| `GOALS_CREATED` | `prisma.goal.count({ where: { userId } }) >= requirementValue` - counts all `Goal` rows regardless of status, not the XP ledger |
| `ATTRIBUTE_LEVEL_REACHED` | Requires `achievement.attributeKey` to be set (returns `false` if not). Looks up the user's `Attribute` row by `(userId, key: attributeKey)` and checks `attribute.level >= requirementValue` |
| `SKILL_LEVEL_REACHED` | Requires `achievement.skillName`. Looks up `Skill` by `(userId, name: skillName)`, further filtered by `attribute: { key: attributeKey }` **if `attributeKey` is also set** (disambiguates when the same skill name exists under multiple attributes for that user - see section 2). Checks `skill.level >= requirementValue` |
| `SKILL_ACTIVITY_COUNT` | Same skill lookup (with the same optional `attributeKey` disambiguation) as `SKILL_LEVEL_REACHED`, then counts `XPTransaction` rows with `skillId: skill.id` and checks the count `>= requirementValue`. (This intentionally counts *all* ledger rows for that skill, i.e. every completion that tagged it, without a `sourceType` filter.) |

`SKILL_LEVEL_REACHED` and `SKILL_ACTIVITY_COUNT` are the two requirement types that carry the
optional `attributeKey` disambiguator specifically because `Skill.name` uniqueness is scoped per
`(userId, attributeId)`, not globally per user (section 2) - without it, `findFirst` on `name`
alone could match either of two same-named skills unpredictably.

### Where `checkAndUnlock` is called from

- **`ProgressionService.completeActivity`** (step 4 of section 5) - runs after every quest,
  habit, and goal-progress completion, since those all go through XP-awarding events.
- **`GoalsService.create`**, directly, immediately after creating the goal - because
  creation-driven achievements (e.g. "Goal Setter," which fires on `GOALS_CREATED` reaching 1)
  have no XP event to hang off. The comment in `goals.service.ts` makes this explicit:

  ```ts
  // Creation-driven achievements (e.g. "Goal Setter") have no XP event to
  // hang off, so they're checked directly here rather than via
  // ProgressionService.
  await this.achievementsService.checkAndUnlock(userId);
  ```

No other resource module calls `checkAndUnlock` directly - if a future achievement type needs to
react to something other than a completion or a goal creation, it will need its own explicit call
site analogous to this one.

## 8. Seeded achievements

From `backend/prisma/seed.ts` (`ACHIEVEMENTS`, upserted by `key` via `npx prisma db seed`):

| Key | Name | Condition |
| --- | --- | --- |
| `first-steps` | First Steps | `QUESTS_COMPLETED` >= 1 |
| `quest-hunter` | Quest Hunter | `QUESTS_COMPLETED` >= 100 |
| `level-10` | Level 10 | `LEVEL_REACHED` >= 10 |
| `veteran` | Veteran | `LEVEL_REACHED` >= 25 |
| `consistent` | Consistent | `STREAK_LENGTH` >= 7 |
| `dedicated` | Dedicated | `STREAK_LENGTH` >= 30 |
| `getting-physical` | Getting Physical | `ATTRIBUTE_LEVEL_REACHED` >= 2, attribute `PHYSICAL` |
| `sharp-mind` | Sharp Mind | `ATTRIBUTE_LEVEL_REACHED` >= 5, attribute `INTELLIGENCE` |
| `iron-will` | Iron Will | `ATTRIBUTE_LEVEL_REACHED` >= 5, attribute `DISCIPLINE` |
| `goal-setter` | Goal Setter | `GOALS_CREATED` >= 1 |
| `finisher` | Finisher | `GOALS_COMPLETED` >= 1 |
| `overachiever` | Overachiever | `GOALS_COMPLETED` >= 10 |
| `habit-forming` | Habit Forming | `HABITS_COMPLETED` >= 30 |

That's 13 achievements. None of the current seed rows use `SKILL_LEVEL_REACHED` or
`SKILL_ACTIVITY_COUNT`, even though `AchievementsService` fully supports both - those two
requirement types are implemented and ready but not yet exercised by any seeded achievement.

## 9. Friends & Leaderboard

`FriendsModule` (`backend/src/friends/`) and `LeaderboardModule` (`backend/src/leaderboard/`) add
a lightweight social layer on top of the character system: a friend-request graph, and a
leaderboard that ranks the caller against their accepted friends.

### Friendship lifecycle

A `Friendship` row (`backend/prisma/schema.prisma`) is created `PENDING` by
`FriendsService.sendRequest(requesterId, username)`, which does an exact-username lookup (no
search/typeahead) and rejects self-requests and duplicates - checking **both** directions
(`requesterId`/`addresseeId` swapped), since the DB's `@@unique([requesterId, addresseeId])`
constraint alone only catches a duplicate in the same direction. There is deliberately no
`DECLINED` status: declining an incoming request, cancelling an outgoing one, and unfriending an
accepted one are all the same operation - `FriendsService.removeFriendship` just deletes the row,
after checking the caller is a party to it. Accepting (`acceptRequest`) is restricted to the
addressee and flips `status` to `ACCEPTED`, stamping `respondedAt`.

This is a deliberate scope cut, documented here so it isn't mistaken for an oversight: there is no
`NotificationType` for friend requests (unlike `LEVEL_UP`/`ACHIEVEMENT_UNLOCK`), so an incoming
request only surfaces when the recipient opens the leaderboard page's "Manage Friends" modal, not
via the notification bell.

### The leaderboard comparison group

`FriendsService.getFriendUserIds(userId)` - the one method `LeaderboardModule` imports
`FriendsModule` for - returns every user id the caller has an `ACCEPTED` `Friendship` with, in
either direction. `LeaderboardService.getLeaderboard` always ranks `[userId, ...friendUserIds]`:
the caller always sees themselves in their own leaderboard, and the group is symmetric (if A
removes B, B also drops out of A's group and vice versa, since it's the same row).

### Ranking rules per metric (`GET /leaderboard?metric=...`)

| `metric` | Ranked by | Tiebreak |
| --- | --- | --- |
| `LEVEL` | `User.level` desc | `User.totalXP` desc, then `username` asc |
| `ATTRIBUTE` (`attributeKey` required) | that `Attribute.level` desc, for the given key | that attribute's `totalXP` desc, then `username` asc |
| `XP` (`period` required) | XP earned in the period, desc | `username` asc |

For `metric: 'XP'`, `ALL_TIME` reads `User.totalXP` directly rather than summing the ledger (it's
equivalent and cheaper); every other period sums `XPTransaction.amount` with
`skillId: null AND attributeId: null AND createdAt >= periodStart` - the same character-level
isolation filter described in section 3, applied per user in the group via a `groupBy`.

### Period boundaries are calendar-aligned, not rolling

`periodStart()` (`backend/src/leaderboard/period-bounds.ts`) computes `DAY`/`WEEK`/`MONTH`/`YEAR`
as the start of the *current UTC calendar* day/ISO week (Monday)/month/year through now - **not**
a rolling trailing window. This is a deliberate divergence from the rolling-7-day convention
`AnalyticsService` uses for personal stats (section 3's `weekAgo = now - 7 days`): a competitive,
resettable leaderboard reads more naturally as "who's ahead this calendar week" than "who's ahead
in the last 168 hours," and a calendar boundary is what lets "this week's leaderboard" mean the
same thing to every friend looking at it, regardless of when each of them checks.

## 10. Keep this file in sync

This file documents **why** the gameplay mechanics work the way they do, not just what the code
currently says - the reasoning here (full XP per tagged skill/attribute, the
`skillId: null AND attributeId: null` character-ledger invariant, write-before-XP-award ordering
for duplicate safety, data-driven achievement conditions) is load-bearing design intent that
isn't otherwise written down anywhere else in the repo.

If you touch `XpService.awardXp`, `calculateLevelState`/`xpRequiredForLevel`,
`ProgressionService.completeActivity`, the streak logic in `period.ts`, the duplicate-completion
guards in `quests.service.ts`/`habits.service.ts`, or `AchievementsService.isConditionMet` -
update this file in the same change. Be especially careful with the `skillId`/`attributeId`-null
invariant in section 3: any new query against `XPTransaction` that intends to count or sum
"completion events" rather than "XP credited to a specific skill/attribute" must filter on both
fields together, or it will silently over-count.
