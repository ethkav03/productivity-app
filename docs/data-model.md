# Data Model

Life RPG's persistence layer is a relational schema managed with Prisma ORM against
PostgreSQL. The schema is defined in a single file, `backend/prisma/schema.prisma`, and
evolves through Prisma migrations (`backend/prisma/migrations/`) rather than manual DDL or
`db push` in any environment that matters. This document is a field-by-field reference for
every model, enum, and constraint currently in that schema.

## Migration history

Four migrations exist as of this writing:

| Migration folder | What it added |
| --- | --- |
| `20260719141428_init` | Initial schema: `User`, `Skill`, `Goal`, `GoalSkill`, `Quest`, `QuestSkill`, `Habit`, `HabitSkill`, `HabitCompletion`, `XPTransaction`, `Achievement`, `UserAchievement`, `Notification`, and all enums except the `ATTRIBUTE_LEVEL_REACHED` achievement requirement and `AttributeKey`. At this point `Skill` uniqueness was scoped to `[userId, name]` and `XPTransaction` had no `attributeId` column. |
| `20260719201027_attribute_hierarchy` | Introduces the `Attribute` model and the `AttributeKey` enum; adds `Skill.attributeId` (required, FK to `Attribute`) and re-scopes skill name uniqueness to `[userId, attributeId, name]`; adds `XPTransaction.attributeId` (optional, FK to `Attribute`) so XP grants can mirror into the owning attribute; adds `Achievement.attributeKey` and the `ATTRIBUTE_LEVEL_REACHED` value to `AchievementRequirementType` so achievements can target attribute-level milestones. |
| `20260720104302_friendships` | Introduces the `Friendship` model and the `FriendshipStatus` enum (`PENDING`, `ACCEPTED`), plus `User.sentFriendRequests`/`receivedFriendRequests` relations. Backs the friends/leaderboard feature - see the `Friendship` model reference below. |
| `20260720120000_admin_users` | Adds `User.isAdmin` (`Boolean @default(false)`). Backs the admin dashboard - see `docs/backend.md` § `AdminModule`. |

`migration_lock.toml` pins the schema to the `postgresql` provider (Prisma refuses to mix
providers across migrations once this file exists).

The schema file itself points to `docs/mvp-spec.md` ("Section 15: Data Model") as the
product-level description this implementation is derived from.

## Entity overview

```
User ──┬── Attribute (8 fixed, auto-created at registration)
       │      └── Skill (belongs to exactly one Attribute)
       │             ├── GoalSkill  ──── Goal
       │             ├── QuestSkill ──── Quest ──── (optional) Goal
       │             └── HabitSkill ──── Habit ──── HabitCompletion
       ├── Goal, Quest, Habit, HabitCompletion  (also owned directly by User)
       ├── XPTransaction (references User, and optionally Skill and/or Attribute)
       ├── UserAchievement ──── Achievement (global, not per-user)
       ├── Notification
       └── Friendship (as requester or addressee) ──── the other User
```

In words: every `User` owns 8 `Attribute` rows (one per `AttributeKey`), created automatically
at registration. Every `Skill` belongs to exactly one `Attribute` and to one `User`. `Goal`,
`Quest`, and `Habit` are the three activity types a user creates directly; each can be tagged
with zero or more `Skill`s through a dedicated join table (`GoalSkill`, `QuestSkill`,
`HabitSkill`). A `Quest` can optionally belong to a `Goal`. A `Habit`'s individual check-ins are
recorded as `HabitCompletion` rows. Every XP grant anywhere in the app is recorded as an
`XPTransaction`, which can reference a `User` alone (character-level XP), or also a `Skill`
and/or that skill's `Attribute` (the XP cascade). `Achievement` definitions are global (not
per-user) and unlocked per user via `UserAchievement`. `Notification` is a simple per-user
inbox row. `Friendship` is a single row per pair of users (not duplicated per direction) linking
two `User`s via `requester`/`addressee`; the leaderboard's comparison group for a user is
themselves plus everyone they have an `ACCEPTED` `Friendship` row with, in either direction.

---

## Model reference

### User

Represents an account/character: identity, auth state, and the top-level character stats
(level, XP, streak) that every skill and attribute ultimately roll up into.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `email` | `String` | unique | |
| `username` | `String` | unique | |
| `passwordHash` | `String` | required | |
| `avatar` | `String?` | nullable | |
| `hashedRefreshToken` | `String?` | nullable | Stores the hashed current refresh token for rotation/invalidation. |
| `isAdmin` | `Boolean` | `@default(false)` | Gates every `/admin` API route (`AdminGuard`) and the `/admin` frontend route. No self-service signup path - set directly in the database or by another admin via the admin dashboard. |
| `level` | `Int` | `@default(1)` | Character level. |
| `totalXP` | `Int` | `@default(0)` | Character-level cumulative XP. |
| `currentStreak` | `Int` | `@default(0)` | Current daily-activity streak. |
| `longestStreak` | `Int` | `@default(0)` | Longest streak ever recorded. |
| `lastActivityAt` | `DateTime?` | nullable | Last time any activity was completed; drives streak logic. |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Relations:** `skills[]`, `attributes[]`, `goals[]`, `quests[]`, `habits[]`,
`habitCompletions[]`, `xpTransactions[]`, `userAchievements[]`, `notifications[]` — all
one-to-many, all with `onDelete: Cascade` from the child side (deleting a `User` deletes every
dependent row).

**Constraints:** none beyond the field-level `@unique` on `email` and `username`. Maps to table
`users`.

---

### Attribute

The 8 top-level character attributes (Physical, Intelligence, Discipline, Energy, Social,
Wealth, Creativity, Wisdom). Every user gets all 8 auto-created at registration — unlike
skills, attributes are not opt-in. Attribute XP/level is derived by mirroring the XP a user
earns in any skill that belongs to it (see `XpService.awardXp`).

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `userId` | `String` | required | FK to `User`. |
| `key` | `AttributeKey` | required | One of the 8 fixed enum values; identifies which fixed attribute this row is. |
| `name` | `String` | required | Display name. |
| `description` | `String?` | nullable | |
| `icon` | `String?` | nullable | |
| `level` | `Int` | `@default(1)` | |
| `totalXP` | `Int` | `@default(0)` | Cumulative XP mirrored from all skills under this attribute. |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Relations:** `user` (FK `userId → User.id`, `onDelete: Cascade`), `skills[]` (one attribute
has many skills), `xpTransactions[]` (XP transactions that mirrored into this attribute).

**Constraints:**
- `@@unique([userId, key])` — a user can have at most one `Attribute` row per fixed key (i.e.
  exactly one "Physical" row, one "Intelligence" row, etc.).
- `@@index([userId])`

Maps to table `attributes`.

---

### Skill

A user-defined stat (e.g. "Strength", "Focus") that activities are tagged with; belongs to
exactly one `Attribute` and accrues its own XP/level independently of the character.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `userId` | `String` | required | FK to `User`. |
| `attributeId` | `String` | required | FK to `Attribute`; every skill belongs to exactly one attribute. |
| `name` | `String` | required | |
| `description` | `String?` | nullable | |
| `icon` | `String?` | nullable | |
| `isDefault` | `Boolean` | `@default(false)` | Marks a skill as one of the built-in suggested skills vs. user-created. |
| `level` | `Int` | `@default(1)` | |
| `totalXP` | `Int` | `@default(0)` | |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Relations:** `user` (`onDelete: Cascade`), `attribute` (`onDelete: Cascade`),
`questSkills[]`, `habitSkills[]`, `goalSkills[]` (join-table rows tagging this skill onto
quests/habits/goals), `xpTransactions[]`.

**Constraints:**
- `@@unique([userId, attributeId, name])` — the same skill name can exist under different
  attributes (e.g. "Focus" under both Intelligence and Discipline) as distinct stats, so
  uniqueness is scoped per-attribute rather than globally per-user.
- `@@index([userId])`
- `@@index([attributeId])`

Maps to table `skills`.

---

### GoalSkill

Join table tagging a `Goal` with one or more `Skill`s.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `goalId` | `String` | required | FK to `Goal`. |
| `skillId` | `String` | required | FK to `Skill`. |

**Relations:** `goal` (`onDelete: Cascade`), `skill` (`onDelete: Cascade`).

**Constraints:** `@@unique([goalId, skillId])` — a given skill can only be tagged onto a given
goal once. Maps to table `goal_skills`.

---

### Goal

A user-defined objective that quests can roll up into; tracks progress either numerically,
by completion, or as a binary done/not-done.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `userId` | `String` | required | FK to `User`. |
| `title` | `String` | required | |
| `description` | `String?` | nullable | |
| `category` | `String?` | nullable | |
| `type` | `GoalType` | `@default(BINARY)` | See enum reference. |
| `status` | `GoalStatus` | `@default(ACTIVE)` | See enum reference. |
| `targetValue` | `Float?` | nullable | Used when `type = NUMERIC`. |
| `currentValue` | `Float` | `@default(0)` | Progress value, compared against `targetValue`. |
| `unit` | `String?` | nullable | Unit label for `targetValue`/`currentValue` (e.g. "km", "books"). |
| `xpReward` | `Int` | `@default(500)` | XP granted on completion. |
| `startDate` | `DateTime` | `@default(now())` | |
| `targetDate` | `DateTime?` | nullable | Optional deadline. |
| `completedAt` | `DateTime?` | nullable | Set when the goal is marked completed. |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Relations:** `user` (`onDelete: Cascade`), `quests[]` (quests that reference this goal),
`goalSkills[]` (tagged skills via `GoalSkill`).

**Constraints:** `@@index([userId])`. Maps to table `goals`.

---

### QuestSkill

Join table tagging a `Quest` with one or more `Skill`s.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `questId` | `String` | required | FK to `Quest`. |
| `skillId` | `String` | required | FK to `Skill`. |

**Relations:** `quest` (`onDelete: Cascade`), `skill` (`onDelete: Cascade`).

**Constraints:** `@@unique([questId, skillId])` — a given skill can only be tagged onto a given
quest once. Maps to table `quest_skills`.

---

### Quest

A single unit of work a user completes; can optionally roll up into a `Goal`.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `userId` | `String` | required | FK to `User`. |
| `goalId` | `String?` | nullable | Optional FK to `Goal`. |
| `title` | `String` | required | |
| `description` | `String?` | nullable | |
| `type` | `QuestType` | `@default(ONE_TIME)` | See enum reference. |
| `difficulty` | `QuestDifficulty` | `@default(MEDIUM)` | See enum reference. |
| `status` | `QuestStatus` | `@default(ACTIVE)` | See enum reference. |
| `xpReward` | `Int` | required, no default | XP granted per completion. |
| `deadline` | `DateTime?` | nullable | Used by `DEADLINE`-type quests / deadline notifications. |
| `completedAt` | `DateTime?` | nullable | Set when a one-time quest is completed. |
| `lastCompletedAt` | `DateTime?` | nullable | Tracks the most recent completion of a recurring quest. |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Relations:** `user` (`onDelete: Cascade`), `goal` (`onDelete: SetNull` — deleting a goal
un-links its quests rather than deleting them), `questSkills[]`.

**Constraints:** `@@index([userId])`, `@@index([goalId])`. Maps to table `quests`.

---

### HabitSkill

Join table tagging a `Habit` with one or more `Skill`s.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `habitId` | `String` | required | FK to `Habit`. |
| `skillId` | `String` | required | FK to `Skill`. |

**Relations:** `habit` (`onDelete: Cascade`), `skill` (`onDelete: Cascade`).

**Constraints:** `@@unique([habitId, skillId])` — a given skill can only be tagged onto a given
habit once. Maps to table `habit_skills`.

---

### Habit

A recurring activity a user checks off on a schedule; tracks its own streak independent of the
character-level streak.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `userId` | `String` | required | FK to `User`. |
| `title` | `String` | required | |
| `description` | `String?` | nullable | |
| `frequency` | `HabitFrequency` | `@default(DAILY)` | See enum reference. |
| `daysOfWeek` | `Int[]` | `@default([])` | Used when `frequency = DAYS_OF_WEEK`; day-of-week indices. |
| `timesPerWeek` | `Int?` | nullable | Used when `frequency = TIMES_PER_WEEK`. |
| `timeOfDay` | `String?` | nullable | Optional reminder time. |
| `xpReward` | `Int` | `@default(10)` | XP granted per completion. |
| `isActive` | `Boolean` | `@default(true)` | Soft on/off flag. |
| `currentStreak` | `Int` | `@default(0)` | Habit-level current streak. |
| `longestStreak` | `Int` | `@default(0)` | Habit-level longest streak. |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Relations:** `user` (`onDelete: Cascade`), `habitSkills[]`, `completions[]`
(`HabitCompletion[]`).

**Constraints:** `@@index([userId])`. Maps to table `habits`.

---

### HabitCompletion

Records a single check-in of a `Habit` for a given period (day/week/month depending on
frequency).

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `habitId` | `String` | required | FK to `Habit`. |
| `userId` | `String` | required | FK to `User`. |
| `periodKey` | `String` | required | A string key identifying the completion period (e.g. a date string), used to prevent duplicate completions within the same period. |
| `completedAt` | `DateTime` | `@default(now())` | |

**Relations:** `habit` (`onDelete: Cascade`), `user` (`onDelete: Cascade`).

**Constraints:**
- `@@unique([habitId, periodKey])` — this is the database-level guarantee that a habit can't be
  completed twice in the same period; combined with the README's noted design decision, this
  uniqueness check is enforced (via a caught constraint violation or pre-check) *before* any XP
  is awarded, so duplicate-completion attempts never double-grant XP.
- `@@index([userId])`

Maps to table `habit_completions`.

---

### XPTransaction

The centralized, immutable XP ledger. Every XP grant anywhere in the app — quest completion,
habit completion, goal completion, achievement bonus, or manual correction — is recorded here
rather than directly incrementing a counter on `User`/`Skill`/`Attribute`.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `userId` | `String` | required | FK to `User`. |
| `skillId` | `String?` | nullable | FK to `Skill`. Null means this row is character-level-only XP. |
| `attributeId` | `String?` | nullable | FK to `Attribute`. Populated when `skillId` is set, mirroring the skill's XP into its owning attribute. |
| `amount` | `Int` | required | XP amount (can be negative for `CORRECTION`). |
| `sourceType` | `XPSourceType` | required | See enum reference. |
| `sourceId` | `String?` | nullable | ID of the originating record (quest/habit/goal/achievement), untyped FK (no relation enforced at the DB level). |
| `note` | `String?` | nullable | Free-text annotation, notably for `CORRECTION` entries. |
| `createdAt` | `DateTime` | `@default(now())` | |

**Relations:** `user` (`onDelete: Cascade`), `skill` (optional, `onDelete: Cascade`),
`attribute` (optional, `onDelete: Cascade`).

**Why both `skillId` and `attributeId` exist:** a single activity completion generates
*multiple* `XPTransaction` rows to keep the ledger fully auditable and non-double-countable —
one character-level row (`skillId: null`, `attributeId: null`), one row per associated skill
(`skillId` set, `attributeId` set to that skill's owning attribute), so that character XP,
skill XP, and attribute XP are each independently reconstructable from the ledger, and any
query that isolates "character-level XP" can filter on `skillId: null AND attributeId: null`
without ambiguity.

**Constraints:** `@@index([userId])`, `@@index([skillId])`, `@@index([attributeId])`,
`@@index([userId, createdAt])` (supports chronological/paginated ledger queries per user, e.g.
analytics and activity feeds). Maps to table `xp_transactions`.

---

### Achievement

A globally-defined achievement (not per-user). Conditions are data-driven — evaluated against
live stats and the XP ledger at check time — rather than hard-coded per achievement, so new
achievements are a seed-data change, not a code change.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `key` | `String` | unique | Stable slug used for seeding/upserts (see `backend/prisma/seed.ts`). |
| `name` | `String` | required | Display name. |
| `description` | `String` | required | |
| `icon` | `String?` | nullable | |
| `requirementType` | `AchievementRequirementType` | required | See enum reference; determines how `requirementValue` (and optionally `skillName`/`attributeKey`) is evaluated. |
| `requirementValue` | `Int` | required | Threshold the requirement type is checked against. |
| `skillName` | `String?` | nullable | Used by skill-scoped requirement types (e.g. `SKILL_LEVEL_REACHED`, `SKILL_ACTIVITY_COUNT`) to target a specific skill by name. |
| `attributeKey` | `AttributeKey?` | nullable | Used by `ATTRIBUTE_LEVEL_REACHED` to target one of the 8 fixed attributes. |
| `createdAt` | `DateTime` | `@default(now())` | |

**Relations:** `userAchievements[]` (per-user unlock records).

**Constraints:** none beyond `key` uniqueness (used as the upsert key in `seed.ts`). Maps to
table `achievements`.

---

### UserAchievement

Records that a given user has unlocked a given `Achievement`.

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `userId` | `String` | required | FK to `User`. |
| `achievementId` | `String` | required | FK to `Achievement`. |
| `unlockedAt` | `DateTime` | `@default(now())` | |

**Relations:** `user` (`onDelete: Cascade`), `achievement` (`onDelete: Cascade`).

**Constraints:**
- `@@unique([userId, achievementId])` — an achievement can only be unlocked once per user.
- `@@index([userId])`

Maps to table `user_achievements`.

---

### Notification

An in-app notification entry for a user (habit reminders, deadlines, level-ups, achievement
unlocks, etc.).

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `userId` | `String` | required | FK to `User`. |
| `type` | `NotificationType` | required | See enum reference. |
| `title` | `String` | required | |
| `message` | `String` | required | |
| `read` | `Boolean` | `@default(false)` | |
| `createdAt` | `DateTime` | `@default(now())` | |

**Relations:** `user` (`onDelete: Cascade`).

**Constraints:** `@@index([userId])`, `@@index([userId, read])` (supports the common "unread
notifications for this user" query). Maps to table `notifications`.

---

### Friendship

A friendship between two users, always stored as a single row regardless of direction. Starts
`PENDING` (created by the requester) and becomes `ACCEPTED` once the addressee accepts — there is
no `DECLINED` status; a decline, a cancel, and an unfriend are all the same operation: deleting
the row (see `FriendsService`).

| Field | Type | Default / Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String` (uuid) | `@default(uuid())`, PK | |
| `requesterId` | `String` | required | FK to `User` — who sent the request. |
| `addresseeId` | `String` | required | FK to `User` — who received it. |
| `status` | `FriendshipStatus` | `@default(PENDING)` | See enum reference. |
| `createdAt` | `DateTime` | `@default(now())` | When the request was sent. |
| `respondedAt` | `DateTime?` | nullable | Set when the addressee accepts. |

**Relations:** `requester` (FK `requesterId → User.id`, `onDelete: Cascade`), `addressee` (FK
`addresseeId → User.id`, `onDelete: Cascade`).

**Constraints:**
- `@@unique([requesterId, addresseeId])` — stops a duplicate row in the *same* direction only;
  `FriendsService.sendRequest` additionally checks the reverse direction before creating a new
  request (A→B and B→A are the same relationship), since the DB constraint alone can't catch that.
- `@@index([requesterId])`
- `@@index([addresseeId])`

Maps to table `friendships`. See `docs/gameplay-systems.md` for the request lifecycle and how the
leaderboard's comparison group is derived from `ACCEPTED` rows.

---

## Enum reference

### GoalType

| Value | Meaning |
| --- | --- |
| `NUMERIC` | Progress tracked as a number against `Goal.targetValue`/`currentValue` (with optional `unit`). |
| `COMPLETION` | Progress tracked by completing linked quests/steps rather than a raw number. |
| `BINARY` | Simple done/not-done goal (the schema default). |

### GoalStatus

| Value | Meaning |
| --- | --- |
| `ACTIVE` | Goal is in progress (the schema default). |
| `COMPLETED` | Goal has been finished; `Goal.completedAt` is set. |
| `ABANDONED` | Goal was given up on / cancelled. |

### QuestType

| Value | Meaning |
| --- | --- |
| `ONE_TIME` | Completed once; cannot be completed again (the schema default). |
| `RECURRING` | Can be completed repeatedly, gated to once per period the same way habits are. |
| `DEADLINE` | Has a hard `deadline` and is time-bound. |
| `MILESTONE` | Represents a milestone, typically within a larger goal. |

### QuestDifficulty

| Value | Meaning |
| --- | --- |
| `EASY` | Lowest difficulty tier. |
| `MEDIUM` | Default difficulty tier. |
| `HARD` | Above-average difficulty. |
| `EPIC` | High difficulty. |
| `LEGENDARY` | Highest difficulty tier. |

(Difficulty is descriptive/organizational; `Quest.xpReward` is an explicit required field set
independently rather than derived from `difficulty`.)

### QuestStatus

| Value | Meaning |
| --- | --- |
| `ACTIVE` | Quest is open and available to complete (the schema default). |
| `COMPLETED` | Quest has been completed (for `ONE_TIME` quests, terminal). |
| `ARCHIVED` | Quest has been archived/hidden without being marked completed. |

### HabitFrequency

| Value | Meaning |
| --- | --- |
| `DAILY` | Expected once per day (the schema default). |
| `DAYS_OF_WEEK` | Expected on specific days, per `Habit.daysOfWeek`. |
| `TIMES_PER_WEEK` | Expected a target number of times per week, per `Habit.timesPerWeek`. |
| `MONTHLY` | Expected once per month. |

### XPSourceType

| Value | Meaning |
| --- | --- |
| `QUEST_COMPLETION` | XP granted from completing a `Quest`. |
| `HABIT_COMPLETION` | XP granted from completing a `Habit` (a `HabitCompletion`). |
| `GOAL_COMPLETION` | XP granted from completing a `Goal`. |
| `ACHIEVEMENT_BONUS` | XP granted as a bonus for unlocking an `Achievement`. |
| `CORRECTION` | Manual adjustment to a user's XP ledger (can carry a negative `amount`); paired with `XPTransaction.note` to explain the adjustment. |

### AchievementRequirementType

| Value | Meaning |
| --- | --- |
| `LEVEL_REACHED` | Unlocked when the user's character `level` reaches `requirementValue`. |
| `STREAK_LENGTH` | Unlocked when the user's `currentStreak` (or equivalent streak stat) reaches `requirementValue` days. |
| `QUESTS_COMPLETED` | Unlocked when the user has completed `requirementValue` quests in total. |
| `GOALS_COMPLETED` | Unlocked when the user has completed `requirementValue` goals in total. |
| `HABITS_COMPLETED` | Unlocked when the user has logged `requirementValue` total habit completions. |
| `SKILL_LEVEL_REACHED` | Unlocked when the named skill (`Achievement.skillName`) reaches level `requirementValue`. |
| `SKILL_ACTIVITY_COUNT` | Unlocked when the named skill (`Achievement.skillName`) has been used in `requirementValue` completed activities. |
| `GOALS_CREATED` | Unlocked when the user has created `requirementValue` goals (regardless of completion status). |
| `ATTRIBUTE_LEVEL_REACHED` | Unlocked when the attribute identified by `Achievement.attributeKey` reaches level `requirementValue`. Added in the `attribute_hierarchy` migration alongside the `Attribute` model. |

### AttributeKey

The 8 fixed attributes every user is given at registration (see `Attribute` model above).

| Value | Represents |
| --- | --- |
| `PHYSICAL` | Physical fitness/health-related activity. |
| `INTELLIGENCE` | Learning, study, and cognitive-skill activity. |
| `DISCIPLINE` | Consistency, willpower, and habit-adherence activity. |
| `ENERGY` | Vitality/stamina-related activity. |
| `SOCIAL` | Relationship and social-skill activity. |
| `WEALTH` | Financial and career-related activity. |
| `CREATIVITY` | Creative and artistic activity. |
| `WISDOM` | Reflection, judgment, and life-skill activity. |

### FriendshipStatus

| Value | Meaning |
| --- | --- |
| `PENDING` | Request sent, not yet responded to (the schema default). |
| `ACCEPTED` | Addressee accepted; both users now appear in each other's leaderboard comparison group. |

### NotificationType

| Value | Meaning |
| --- | --- |
| `HABIT_REMINDER` | Reminds the user to complete a habit. |
| `QUEST_DEADLINE` | Warns the user about an approaching or passed `Quest.deadline`. |
| `STREAK_WARNING` | Warns the user their current streak is at risk of breaking. |
| `LEVEL_UP` | Informs the user their character (or a skill/attribute) leveled up. |
| `ACHIEVEMENT_UNLOCK` | Informs the user an `Achievement` was unlocked. |
| `GOAL_MILESTONE` | Informs the user of progress/milestone reached on a `Goal`. |

---

## Seed data

`backend/prisma/seed.ts` seeds (via upsert, keyed on `Achievement.key`) 13 `Achievement`
definitions covering every `AchievementRequirementType` except `SKILL_LEVEL_REACHED` and
`SKILL_ACTIVITY_COUNT` (those two are skill-scoped by `skillName` and have no seeded rows as of
this schema version): `first-steps`, `quest-hunter` (`QUESTS_COMPLETED`); `level-10`,
`veteran` (`LEVEL_REACHED`); `consistent`, `dedicated` (`STREAK_LENGTH`); `getting-physical`,
`sharp-mind`, `iron-will` (`ATTRIBUTE_LEVEL_REACHED`, scoped via `attributeKey` to `PHYSICAL`,
`INTELLIGENCE`, and `DISCIPLINE` respectively); `goal-setter` (`GOALS_CREATED`); `finisher`,
`overachiever` (`GOALS_COMPLETED`); and `habit-forming` (`HABITS_COMPLETED`). The seed script's
own comment notes this list corresponds to MVP spec section 10 and is deliberately data-driven
so new achievements can be added without code changes.

---

## Keeping this document in sync

This file mirrors `backend/prisma/schema.prisma` field-for-field. Whenever that schema changes
— a new model, field, enum value, relation, or constraint, or a new migration under
`backend/prisma/migrations/` — update this file (including the migration history table and the
entity overview diagram if the relationships change) in the same change.
