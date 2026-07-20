# Gameplay Systems

This is a deep-dive reference for Life RPG's core game-mechanic logic: the XP ledger, the
leveling formula, the completion workflow, duplicate-completion safety, the achievement engine,
the friends/leaderboard social layer, and level-up rewards. It documents the current backend
implementation as of this writing, not an aspirational design. If you change any of the mechanics
described here, update this file in the same change (see the closing note at the bottom).

Source files referenced throughout:

- `backend/src/xp/xp.service.ts`, `backend/src/xp/xp.types.ts`
- `backend/src/progression/progression.service.ts`, `backend/src/progression/progression.types.ts`
- `backend/src/achievements/achievements.service.ts`
- `backend/src/level-rewards/level-rewards.service.ts`
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
section 10).

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
achievement conditions - see section 10) must also disambiguate by attribute when the name isn't
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
  sourceName?: string;
  skillAwards?: SkillAward[];              // { skillId, amount? } - skills tagged on the completed activity
  attributeBonuses?: AttributeBonus[];     // { attributeId, amount } - "XP Bundles", see below
  note?: string;
}

interface XpAwardResult {
  xpGained: number;
  character: LevelChangeResult;               // { previousLevel, newLevel, leveledUp }
  skills: SkillXpResult[];                     // one per skillAward, each extends LevelChangeResult with skillId
  attributes: AttributeXpResult[];             // one per skillAward (not deduplicated) plus one per attributeBonus, each extends LevelChangeResult with attributeId
}
```

(`skillIds?: string[]` was the original shape before "XP Bundles" — `skillAwards` is a strictly
additive replacement: an entry with no `amount` behaves exactly like the old `skillIds` did.)

### What one call to `awardXp` writes

Everything happens inside a single `prisma.$transaction`. For a call with `amount = X` and
`skillAwards = [{ skillId: s1 }, { skillId: s2 }]` where `s1` and `s2` both belong to attribute
`A` (no per-skill override, no attribute bonuses — the pre-"XP Bundles" case):

1. **One character-level `XPTransaction`** with `skillId: null` and `attributeId: null`, `amount: X`.
   `User.totalXP` is incremented by `X` and `User.level` recalculated via `calculateLevelState`.
2. **One `XPTransaction` per entry in `skillAwards`**, each with `amount: X` (the *full* amount,
   not `X` split across skills) — since neither entry set its own `amount`, each inherits the
   call's top-level `amount`. Each skill's `totalXP`/`level` is updated the same way.
3. **One `XPTransaction` per skill's attribute**, again each with the *full* `amount: X`. Because
   this loops per-skill rather than per-unique-attribute, if two tagged skills share an attribute
   (as in the example above), that attribute receives `X` **twice** in the same call - two
   separate `XPTransaction` rows, each `amount: X`.

So for the example above, one `awardXp({ amount: X, skillAwards: [{skillId: s1}, {skillId: s2}] })`
call writes 4 rows total: 1 character row + 2 skill rows + 2 attribute rows (both crediting
attribute `A`), and `A`'s `totalXP` increases by `2 * X`, not `X`.

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

### XP Bundles: per-skill overrides and attribute-only bonuses

By default, every skill tagged on an activity earns that activity's full flat `amount` (see
above), and no attribute can be credited without going through a tagged skill first. "XP
Bundles" is an opt-in refinement on top of that default, expressed entirely through
`AwardXpParams.skillAwards[].amount` and `AwardXpParams.attributeBonuses`:

- **Per-skill override** (`skillAwards[].amount`) — gives one specific tagged skill its own
  reward instead of inheriting the activity's flat `amount`. E.g. a "Deadlift PR" quest tagged
  with a Strength skill might flatly reward 100 XP to most tagged skills, but override Strength
  specifically to 250. The override also becomes that skill's attribute-cascade amount (the
  skill and its attribute always move together, still following the existing double-null
  invariant above) — the character-level row is unaffected either way, since it always uses the
  top-level `amount` regardless of any per-skill overrides.
- **Attribute-only bonus** (`attributeBonuses`) — credits an attribute directly with no tagged
  skill at all. E.g. that same "Deadlift PR" quest could also bump Discipline by 20 XP without
  tagging any Discipline skill. This writes exactly one `XPTransaction` per bonus (`skillId:
  null`, `attributeId` set), touching only that attribute — no character row, no skill row.

Both fields are deduped by key (`skillId` / `attributeId` respectively — first occurrence wins)
and validated the same way `amount` itself is: `awardXp` throws `BadRequestException` if any
override or bonus `amount` is present and not a positive integer. Ownership/consistency checks
(a `skillRewardOverrides[].skillId` must be one of the activity's own tagged `skillIds`; an
`attributeBonuses[].attributeId` must be an attribute the user owns) happen one layer up, in
`QuestsService`/`HabitsService`/`GoalsService.validateRewardBundle` — `XpService` itself only
enforces the amount-positivity rule, since by the time a call reaches it, ownership has already
been settled.

On the frontend, both fields are edited together via the `RewardBundleEditor` component
(`frontend/src/components/ui/reward-bundle-editor.tsx`), a collapsed-by-default "Advanced
rewards" disclosure in each of the Quest/Habit/Goal creation modals — see `docs/frontend.md`.

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
docstring reference to "the MVP spec (section 16)." `HabitsService.complete` and
`GoalsService.progress` call this directly when their activity completes; `QuestsService` calls it
from `claimReward`, not `complete` - completing a quest only creates a `QuestCompletion` row, and
the actual XP award waits for a separate claim step (section 7). None of the three touch
`XpService`/`AchievementsService`/`LevelRewardsService` themselves. It executes in this exact order:

1. **Award XP.** `this.xpService.awardXp({ userId, amount, sourceType, sourceId, skillAwards,
   attributeBonuses, note })` runs first, unconditionally. This is the only step that writes to
   the XP ledger and recalculates levels (see sections 3-4).
2. **Update the character's daily streak**, unless the caller passed
   `updateCharacterStreak: false` (nothing in the current codebase passes `false` - all three
   resource modules take the default `true`, so every quest/habit/goal completion currently
   updates the character streak).
3. **Check achievements.** `this.achievementsService.checkAndUnlock(userId)` runs after the XP
   award and streak update, so achievement conditions see the fully up-to-date state (new level,
   new streak, new ledger rows) for this event.
4. **Check level rewards.** `this.levelRewardsService.checkAndUnlock(userId)` runs immediately
   after the achievement check, for the same reason - see section 13.
5. **Build and return a `CompletionResult`.**
6. **Emit `ActivityCompletedEvent`** (fire-and-forget, via `EventEmitter2.emit` - not awaited)
   carrying the same facts the `CompletionResult` was just built from. This step happens last and
   is not on the response's critical path - see "Internal domain events" below. Note:
   `rewardsUnlocked` is **not** carried on this event (unlike `achievementsUnlocked`) - as of this
   schema version, nothing needs to react to a level-reward unlock outside the synchronous
   response, so it wasn't added to the event payload.

```ts
interface CompletionResult {
  xpGained: number;
  levelUp: boolean;
  newLevel: number;
  skillResults: Array<{ skillId: string; leveledUp: boolean; newLevel: number }>;
  attributeResults: Array<{ attributeId: string; leveledUp: boolean; newLevel: number }>;
  achievementsUnlocked: string[];   // achievement names
  rewardsUnlocked: Array<{ name: string; type: LevelRewardType }>; // section 13
  streak?: { currentStreak: number; longestStreak: number };
  eventId: string;
}
```

### Internal domain events (Feature 0.1)

The completion workflow above only inlines the steps that *feed the returned `CompletionResult`*
- XP, streak, achievements. Everything else reacts to a single `ActivityCompletedEvent`
(`backend/src/progression/events/activity-completed.event.ts`), emitted once per
`completeActivity` call via `@nestjs/event-emitter`'s `EventEmitter2` (registered globally by
`EventEmitterModule.forRoot()` in `AppModule` - a plain in-process event bus, no message broker,
matching the roadmap's own framing that none is needed at this scale).

The event carries `{ userId, sourceType, sourceId?, sourceName?, xpGained, levelUp, newLevel,
achievementsUnlocked, completedAt }` - everything a listener would otherwise have to re-derive by
re-querying. Emission uses `emit()`, not `emitAsync()`: `completeActivity` never awaits a
listener, so a slow or failing listener can never delay or break the HTTP response.

The one listener that exists today, `LevelUpNotificationListener`
(`backend/src/progression/listeners/level-up-notification.listener.ts`), replaces what used to be
an inline `if (leveledUp) await notificationsService.create(...)` step inside `completeActivity`.
Moving it was safe specifically *because* the `LEVEL_UP` notification was never part of
`CompletionResult` - the frontend's celebration toast (`useCelebration`) reads `levelUp`/`newLevel`
straight from the response, independent of the notification row. The listener wraps its body in
`try`/`catch` (logging failures via Nest's `Logger`) since nothing awaits it - an uncaught
rejection in a fire-and-forget listener would otherwise surface as an unhandled promise rejection
rather than a request-visible error.

XP, streak, achievement-unlocking, and level-reward-unlocking are **not** listeners, and that's a
deliberate boundary, not a gap to fill in later: all four feed values the caller synchronously
depends on (`CompletionResult`), so turning them into fire-and-forget listeners would either drop
that data from the response or force `completeActivity` to await every listener and reassemble
their return values in a fixed order - reintroducing the same tight coupling this system exists to
remove. The
actual payoff is for *new* concerns with no such dependency: challenges, seasons, AI analysis, a
timeline view, and similar future features (per `docs/feature-roadmap.md` § "Feature 0.1") can
subscribe to `ACTIVITY_COMPLETED_EVENT` without `ProgressionService` - or any of
Quests/Habits/Goals - ever being modified or even aware they exist.

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

Two mechanisms guard against double-awarding XP for the same completion - both are now database
unique constraints, not application-level read-then-write checks. In both cases, **the
constrained insert happens before `ProgressionService.completeActivity` (and therefore before any
XP is awarded)**, so a duplicate request fails outright on the second attempt rather than racing
against a stale in-memory read.

### Quests: `QuestCompletion` unique constraint

`QuestsService.complete` (`backend/src/quests/quests.service.ts`) inserts a `QuestCompletion` row
*first*, inside a `$transaction` alongside the quest's own state update, inside a try/catch:

```ts
const periodKey = quest.type === 'RECURRING' ? getDayKey() : 'once';

try {
  await this.prisma.$transaction([
    this.prisma.questCompletion.create({ data: { questId: id, userId, periodKey } }),
    quest.type === 'RECURRING'
      ? this.prisma.quest.update({ where: { id }, data: { lastCompletedAt: new Date() } })
      : this.prisma.quest.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } }),
  ]);
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException(/* ... */);
  }
  throw error;
}
```

Backed by an actual schema-level guarantee: `model QuestCompletion` has
`@@unique([questId, periodKey])`. `periodKey` is `"once"` for `ONE_TIME`/`DEADLINE`/`MILESTONE`
quests (so at most one `QuestCompletion` can ever exist for such a quest, full stop) or today's
UTC day key for `RECURRING` quests (so at most one exists per quest per calendar day) - the exact
same per-period dedup mechanism `HabitCompletion` already used, just generalized to cover
non-recurring quests too via the constant `"once"` key. A duplicate insert raises Prisma error
code `P2002`, caught and translated to `409 Conflict`. **Crucially, this only marks the
completion - it does not call `completeActivity` at all.** See "Reward claiming" below for why.

### Habits: `HabitCompletion` unique constraint

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

Backed by `@@unique([habitId, periodKey])` on `HabitCompletion`. `periodKey` is today's UTC day
key (`getDayKey()`), so at most one `HabitCompletion` row can ever exist per habit per calendar
day, regardless of the habit's configured `frequency` (`DAILY`/`WEEKLY`/`MONTHLY` - all are keyed
by day for completion-locking purposes, per the comment in `period.ts`). Only after the insert
succeeds does the method compute the habit's own streak (via the private `nextHabitStreak`, which
wraps `nextStreakValue` and may consume a habit-streak-protection charge instead of resetting on a
missed day - see section 13), update the `Habit` row, and call
`this.progressionService.completeActivity(...)` - habits keep the instant-reward flow; unlike
quests, there is no separate claim step.

Both mechanisms are safe under concurrent duplicate requests because the database itself enforces
uniqueness - even two simultaneous requests can't both succeed the insert. (Goals have no
analogous per-period constraint: `GoalsService.progress` guards re-completion via `status !==
'ACTIVE'` instead, since a goal can only ever complete once, not repeatedly.)

## 7. Level-gated quests and reward claiming (Feature 1)

Two related but independent additions to the quest model, both scoped to quests only (habits and
goals are unaffected):

### Requirements and locking

A quest can carry zero or more `QuestRequirement` rows (`backend/prisma/schema.prisma`), each one
of five types: `LEVEL_THRESHOLD` (character, a skill, or an attribute reaches a level),
`ACTIVITY_COUNT` (a skill has been used in N completed activities), `ACHIEVEMENT` (a specific
achievement is unlocked), `QUEST_COMPLETED` (a specific other quest is completed), or
`GOAL_COMPLETED` (a specific goal is completed).

Locked/unlocked is **computed at read time, not stored**. `QuestsService` and
`quest-requirements.ts` (`buildRequirementSnapshot` + `evaluateRequirements`) batch-fetch the
caller's current level/skills/attributes/achievements/quest completions/goal completions *once*
per list or detail request - not once per quest - then evaluate every quest's requirements
against that shared snapshot, mirroring `AchievementsService.isConditionMet`'s data-driven
condition pattern but computed in bulk to avoid N+1 queries across a whole quest list. Every
serialized quest gets `isLocked: boolean` and `requirements: Array<{ type, description, met,
progress? }>` - **a locked quest is never hidden**, it's shown with its requirements and how
close each one is to being met (e.g. `{ description: "Complete 20 Running activities", met:
false, progress: { current: 7, target: 20 } }`). `QuestsService.complete()` rejects with `400 Bad
Request` if any requirement is unmet.

`Quest.status` itself is untouched by locking - a locked quest is still `status: 'ACTIVE'` in the
database. This was a deliberate scope decision: the roadmap's full state machine
(`LOCKED → AVAILABLE → ACTIVE → COMPLETED → REWARD CLAIMED`, plus `FAILED`/`EXPIRED`) would mean
a second, parallel notion of "state" layered on top of the existing `QuestStatus` enum that every
other part of the app (status tabs, `GET /quests?status=`) already filters on. Computing
`isLocked` instead keeps `QuestStatus` meaning exactly what it always has, while still delivering
the actual product value (a quest visibly gated behind progress). `FAILED`/`EXPIRED` aren't
implemented at all yet - out of scope for this slice.

### Reward claiming

Completing a quest (`POST /quests/:id/complete`) creates a `QuestCompletion` row but **does not
award XP**. A separate step, `POST /quests/:id/claim` (`QuestsService.claimReward`), does that -
matching the roadmap's `COMPLETED → REWARD CLAIMED` state, without needing a new `QuestStatus`
value (claim state lives on `QuestCompletion.claimedAt` instead, which can differ per completion).

This needed its own model rather than a boolean flag on `Quest`, because a `RECURRING` quest
completes many times (once per period) and each completion is independently claimable - if the
caller doesn't open the app for a few days, several unclaimed completions can stack up. `claimReward`
finds every `QuestCompletion` with `claimedAt: null` for the quest and calls
`ProgressionService.completeActivity` once per completion (oldest first), so the XP ledger keeps
one event per actual completion rather than summing them into one inflated award, then stamps
`claimedAt` on each.

**Deliberate simplification: the reward isn't snapshotted at completion time.** `claimReward`
re-reads the quest's *current* `xpReward`, tagged `questSkills`, and `ActivityAttributeBonus` rows
- exactly what `complete()` always read before this model existed. If a quest's reward is edited
between completing and claiming it, the claimed amount reflects the *new* config, not what it was
when completed. No other flow in the app snapshots rewards either (an edited habit's `xpReward`
likewise only affects future completions going forward, not retroactively); adding snapshot
columns to `QuestCompletion` is a cheap follow-up if this ever becomes a real product problem.

On the frontend, `completeQuest`/`claimQuestReward` (`frontend/src/lib/api/quests.ts`) are
separate calls; `useCelebration()` only fires after a successful claim (a bare `complete()` moves
no XP, so there's nothing to celebrate yet) - see `docs/frontend.md`.

## 8. Quest Board and System quests (Feature 2)

### Categories

Every `Quest` has a `category` - `DAILY`, `WEEKLY`, `LONG_TERM`, or `SYSTEM` - defaulting to
`LONG_TERM` (existing quests from before this feature all backfilled there). Unlike
locked/unlocked state, `category` **is** stored, not computed - it's a user (or system) choice at
creation time, not a derived fact about current progress. The frontend's `/quests` page (still the
same route and nav entry - "Quest Board" is a capability added to the existing page, not a
separate one) gained a category pill-filter row alongside the existing Active/Completed status
tabs; `GET /quests?category=` filters server-side.

### System quests: the neglected-attribute heuristic

`QuestsService.ensureSystemQuest(userId)` runs at the top of every `findAll` call. If the caller
has no `SYSTEM`-category quest created in the last 7 days, it generates one via
`findNeglectedAttribute` (`backend/src/common/neglected-attribute.ts`):

1. Fetch the user's 8 attributes, their total XP earned in the trailing 7 days (`XPTransaction`
   rows grouped by `attributeId`, an attribute with zero rows counting as most neglected - the
   same "attribute-level rows include both skill-cascade and attribute-bonus XP" reasoning as
   section 3), and all of the user's skills.
2. Rank attributes by trailing-7-day XP, ascending.
3. Pick the lowest-ranked attribute that has at least one of the user's own skills under it
   (`requireSkill: true`) - a "complete an activity tagged with X" instruction is meaningless
   without an X to tag, so an attribute with zero skills is skipped even if it's technically the
   most neglected.
4. If no attribute anywhere has a skill (the user hasn't created any skills yet), generation is
   skipped entirely - a brand-new account doesn't get a System quest before it has anything to
   tag one with.

The generated quest: `title: "Balance Your Build"`, `category: 'SYSTEM'`, `type: 'ONE_TIME'`,
`difficulty: 'MEDIUM'`, tagged with the found skill via a normal `QuestSkill` row - it goes
through the exact same completion/locking/claiming machinery as any other quest, since it's not a
distinct kind of entity, just a distinct `category` value with an automated origin.

**Lazy generation, not a scheduled job.** No cron/job-scheduling infrastructure exists in the
app - "regenerate weekly" is implemented as "check-and-generate-if-stale on read," the same
pattern Daily/Weekly Challenges (Feature 3) use once built - see `docs/feature-roadmap.md` for
what's landed. This means a System quest's actual freshness depends on how often the caller
calls `GET /quests`, not a wall-clock schedule - acceptable since the quest itself doesn't expire
or need to be time-precise, unlike a Daily/Weekly Challenge.

**Shared with Daily/Weekly Challenges.** `findNeglectedAttribute` is deliberately a `common/`
utility, not owned by `QuestsModule`, specifically so Challenges' generation (a separate feature)
can reuse the identical "what's neglected" definition rather than two heuristics quietly drifting
apart over time.

## 9. Daily and Weekly Challenges (Feature 3)

### Generation

Like Quest Board's System quests, `ChallengesService.getActive(userId)` generates lazily on read
rather than via a scheduled job (no cron infrastructure exists) - it calls a private
`ensureChallenge(userId, type)` for both `DAILY` and `WEEKLY` before listing. `ensureChallenge`:

1. Computes the current period's key - `getDayKey()` for `DAILY`, `getWeekKey()` (a
   Monday-anchored week, see section 6) for `WEEKLY`.
2. If a `Challenge` already exists for `(userId, type, periodKey)` (enforced by a
   `@@unique([userId, type, periodKey])` constraint), no-ops - at most one challenge of each type
   exists per user per period.
3. Otherwise calls `findNeglectedAttribute(prisma, userId, { requireSkill: true })` - the exact
   same heuristic and even the exact same function Quest Board's System quests use (see section
   8) - and creates a `Challenge` targeting the result. A no-op if the user has no skills
   anywhere yet, same guard as System quest generation.

`WEEKLY` challenges get a real threshold (`targetXp: 500`) and track cumulative progress toward
it. `DAILY` challenges get a nominal `targetXp: 1` - not a real threshold, since completing it is
binary (did a qualifying activity happen today, yes/no) rather than cumulative; any positive XP
toward the target attribute satisfies it immediately, which falls out of the same "add earned XP,
check `>= targetXp`" logic used for `WEEKLY` without needing a separate code path (see below).

`expiresAt` is set via `endOfDayUtc()`/`endOfWeekUtc()` (section 6) - midnight UTC at the start of
the next day/week. `GET /challenges` filters to `expiresAt: { gt: now }`, so an unmet challenge
past its deadline simply stops appearing rather than being explicitly transitioned to `EXPIRED`
(that status value exists in the schema but nothing sets it yet - a real gap, not a design
choice, flagged here rather than silently left undocumented).

### Progress: the domain-event system's first new consumer

Every other listener built so far (`LevelUpNotificationListener`, section 5's "Internal domain
events (Feature 0.1)") *migrated* an existing side effect off the synchronous completion path. `ChallengeProgressListener`
(`backend/src/challenges/listeners/challenge-progress.listener.ts`) is the first one built for a
genuinely new concern - the concrete validation of the payoff Feature 0.1's docs promised:
Challenges exist, and neither `ProgressionService` nor any of Quests/Habits/Goals had to change at
all to make them work.

On `ACTIVITY_COMPLETED_EVENT`, the listener:

1. Re-queries `XPTransaction` rows by the event's `eventId` (added to `XpAwardResult` →
   `CompletionResult` → `ActivityCompletedEvent` specifically to support this - see section 3),
   filtered to `attributeId: { not: null }`, and sums `amount` per `attributeId`. This is exactly
   the same "attribute-level rows are the authoritative source of per-attribute XP" reasoning
   used throughout the ledger.
2. Finds every `ACTIVE`, unexpired `Challenge` belonging to that user whose `attributeId` is one
   of the credited attributes.
3. For each, adds the earned amount to `progressXp`. If the new total reaches `targetXp`, marks
   the challenge `COMPLETED` and awards `xpReward` (character-level bonus XP) via
   `ProgressionService.completeActivity` with `sourceType: 'CHALLENGE_COMPLETION'`.

**Progress is attribute-scoped, not skill-scoped.** A challenge's `skillId` only describes which
skill inspired its wording ("complete an activity tagged with X") - it is *not* an eligibility
filter. Any XP landing in the challenge's target attribute counts, regardless of which specific
skill under that attribute earned it. This is a deliberate simplification: filtering by the exact
skill would mean re-deriving which `QuestSkill`/`HabitSkill`/`GoalSkill` rows produced each
attribute-level `XPTransaction` row, which the event doesn't currently carry - attribute-level
scoping was judged close enough to the roadmap's intent to not be worth that additional plumbing.

**Why the completion bonus goes through `ProgressionService`, not `XpService` directly.**
`XpService` is documented (section 3, and `docs/backend.md`) as having exactly two consumers by
design - `ProgressionModule` and `AdminModule`. Calling `XpService.awardXp` directly from
`ChallengeProgressListener` would make it a third, undocumented exception. Routing through
`ProgressionService.completeActivity` instead keeps that invariant intact, and is arguably more
correct anyway: a challenge completion is a genuine activity completion as far as the rest of the
app is concerned - it should count toward the character's daily streak and be visible to
achievement checks like any other completion, just triggered by a listener instead of a
controller. This does mean completing a challenge emits its own `ActivityCompletedEvent` in turn,
which `ChallengeProgressListener` also receives - safe from feedback loops because a
character-only award (no `skillAwards`/`attributeBonuses`) produces zero attribute-level
`XPTransaction` rows, so the listener finds nothing to act on and returns immediately.

On the frontend, `ChallengesSection` (`frontend/app/(app)/quests/page.tsx`) polls `GET /challenges`
every 5 seconds while mounted, since progress lands asynchronously relative to whatever
quest/habit/goal completion triggered it - a client that only relied on query invalidation after
its own mutations could miss progress from actions taken elsewhere (or simply not yet reflected
by the time the listener finishes). It also diffs each challenge's `status` against what it saw
last render to fire a one-time celebration toast exactly when a challenge transitions to
`COMPLETED`.

## 10. The achievement engine

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

- **`ProgressionService.completeActivity`** (step 3 of section 5) - runs after every quest reward
  claim, habit completion, and goal-progress completion, since those all go through
  XP-awarding events (a quest *completion* alone, before it's claimed, does not run this).
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

## 11. Seeded achievements

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

## 12. Friends & Leaderboard

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

## 13. Level-up rewards (Feature 6)

`LevelRewardsService.checkAndUnlock(userId)` (`backend/src/level-rewards/level-rewards.service.ts`)
is the same **data-driven** pattern as `AchievementsService.checkAndUnlock` (section 10) - reward
definitions are seeded rows, not a `switch` per reward name - but simpler, since the condition is
always just "is a level threshold met": no async per-candidate lookup is needed, only a
synchronous filter over the caller's already-fetched character level and 8 attribute levels.

```ts
async checkAndUnlock(userId: string): Promise<LevelReward[]> {
  const [user, attributes, unlockedRows, allRewards] = await Promise.all([...]);
  const attributeLevelByKey = new Map(attributes.map(a => [a.key, a.level]));
  const newlyUnlocked = allRewards.filter(reward => {
    if (unlockedIds.has(reward.id)) return false;
    const currentLevel = reward.attributeKey ? (attributeLevelByKey.get(reward.attributeKey) ?? 0) : user.level;
    return currentLevel >= reward.level;
  });
  // batch-create UserLevelReward rows in one $transaction, apply per-type
  // effects, fire LEVEL_REWARD_UNLOCK notifications
}
```

Called from **`ProgressionService.completeActivity`** only (step 4 of section 5), immediately
after the achievement check - no other module calls it directly, unlike
`AchievementsService.checkAndUnlock` (which `GoalsService.create` also calls for
creation-driven achievements). There is no creation-driven level reward as of this schema
version, so a second call site hasn't been needed.

### Scope: character or a fixed attribute, never a skill

`LevelReward.attributeKey` is `null` (character-level, checked against `user.level`) or one of the
8 fixed `AttributeKey` values (checked against that `Attribute.level`) - deliberately never a
user-created `Skill`. Skills aren't fixed the way the 8 attributes are, so a globally-seeded
reward definition (created once, in `seed.ts`, before any user exists) can't sensibly target "a
specific skill" the way it can target "Physical" or "Discipline" - it would have to name a skill
that might not exist for every user, or exist multiple times under different attributes for the
same user (section 2). This mirrors `Achievement.attributeKey`'s exact same reasoning.

### `LevelRewardType` and what each does on unlock

| Type | Effect |
| --- | --- |
| `TITLE` | Purely cosmetic. Can be equipped afterward via `PATCH /users/me { equippedTitleId }` - see below. |
| `BADGE` | Purely record-keeping - the `UserLevelReward` row itself is the only effect. |
| `STREAK_PROTECTION` | Increments `User.habitStreakProtectionCharges` by 1 - see "Habit streak protection" below. |
| `FEATURE_UNLOCK` | Informational only as of this schema version. Nothing in the app is currently gated behind a feature flag, so unlocking one just adds it to the user's reward list with no functional effect - an honest placeholder for real feature-gating later (e.g. a Phase 2 skill tree). |
| `QUEST` | Auto-creates one `Quest` via the private `createRewardQuest(userId, reward)`: `category: SYSTEM`, `difficulty: EPIC`, `type: ONE_TIME`, `xpReward: DIFFICULTY_XP.EPIC`, title/description taken from the reward's own `name`/`description`, tagged with one of the user's skills under the reward's attribute if one exists (the caller's oldest matching skill, or untagged if they have none). Reuses the same `category: SYSTEM` convention as Sprint 2's neglected-attribute quests (`QuestsService.ensureSystemQuest`, section 8), but unlike that heuristic-driven generator, this always creates the quest regardless of skill availability - it's a promised, curated reward for reaching a specific level, not a conditional suggestion. |

**Deliberately not built:** the roadmap also lists `CHALLENGE`, `THEME`, and `COSMETIC` reward
types. None exist yet because each would need an entirely new subsystem with no existing content
to unlock: there's no manual challenge-creation concept to hook a reward into (`Challenge` rows
are exclusively system-generated - section 9), no second visual theme designed, and no
avatar/cosmetic-equip system at all. `TITLE`/`BADGE`/`STREAK_PROTECTION`/`FEATURE_UNLOCK`/`QUEST`
were chosen specifically because each composes with something already built.

### Equipping a title

`User.equippedTitleId` (nullable FK to `LevelReward`, `onDelete: SetNull`) holds at most one
currently-displayed title. Set via `PATCH /users/me { equippedTitleId }`
(`UsersService.updateMe`): a truthy value is validated by the private `assertOwnedUnlockedTitle`
(must be a `TITLE`-type `LevelReward` the caller has an actual `UserLevelReward` row for, else
`400 BadRequestException`), `null` explicitly unequips, and omitting the field entirely leaves it
unchanged - the same optional-vs-null convention already used elsewhere (e.g. `Quest.goalId`).
`toPublicUser` includes the resolved `equippedTitle: { id, name } | null` - `null` for any caller
path that doesn't eagerly fetch the relation (`register`/`login`/`refresh`/the admin routes),
refreshed on the next `GET`/`PATCH /users/me`.

### Habit streak protection

A **one-time charge grant**, not an ongoing refresh - unlocking a `STREAK_PROTECTION` reward adds
exactly 1 to `habitStreakProtectionCharges`; there's no scheduler in the app to grant a recurring
allotment (e.g. "one per month"), matching the roadmap's own "protect one habit streak" phrasing
literally rather than the more generous reading some analogous game systems use. Scoped to
**habits only**, never the character-level streak (section 5's "Character streak logic") - a
habit's own streak (`Habit.currentStreak`) and the character's overall daily streak are already
tracked independently (section 5), and protection only ever touches the former.

Consumed by the private `HabitsService.nextHabitStreak` (called from `complete`, replacing a
direct call to `nextStreakValue`): if this completion's gap since the previous one is more than
1 day (`daysBetweenKeys(previousPeriodKey, newPeriodKey) > 1` - i.e. the habit's streak would
otherwise reset to `1`) **and** the user has a charge available, the charge is decremented by 1
and the streak continues as `previousStreak + 1` instead of resetting. If no charge is available,
or the gap wouldn't have broken the streak anyway, behavior is unchanged from before this feature
existed (falls through to `nextStreakValue`).

### Seeded level rewards

From `backend/prisma/seed.ts` (`LEVEL_REWARDS`, upserted by `key`) - a modest, representative set
covering all 5 built types and both scopes, not exhaustive content authoring:

| Key | Name | Type | Scope | Threshold |
| --- | --- | --- | --- | --- |
| `title-beginner` | The Beginner | `TITLE` | Character | Level 3 |
| `title-consistent` | The Consistent | `TITLE` | Character | Level 6 |
| `physical-badge` | Getting Stronger | `BADGE` | `PHYSICAL` | Level 2 |
| `discipline-streak-protection` | Streak Protection | `STREAK_PROTECTION` | `DISCIPLINE` | Level 3 |
| `intelligence-study-plans` | Study Plans | `FEATURE_UNLOCK` | `INTELLIGENCE` | Level 3 |
| `physical-epic-quest` | Epic Physical Quest | `QUEST` | `PHYSICAL` | Level 3 |

That's 6 level rewards. Thresholds are deliberately low (matching the achievement seed's own low
bar, e.g. `getting-physical` at Physical Level 2) so this is easy to reach and verify end-to-end,
not a claim about intended pacing for a live game economy.

## 14. Keep this file in sync

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
