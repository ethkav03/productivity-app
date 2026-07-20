# Backend Architecture Reference

Reference documentation for the NestJS/Prisma backend at `backend/src`. This file maps the
module graph — what exists, what each module imports, what each module exports, and who
depends on it. For the mechanics of XP, leveling, streaks, and achievement conditions, see
`docs/gameplay-systems.md`.

## 1. Overview

The backend is a standard NestJS application: feature code is organized into modules
(`@Module`), each of which declares its own `controllers`, `providers` (usually one
`*.service.ts`), what it `imports` from other modules, and what it `exports` for other modules
to inject. NestJS's dependency injection container wires everything together at boot from the
single root module, `AppModule` (`backend/src/app.module.ts`).

A module can only inject a provider from another module if that module either is `@Global()`
or is listed in its `imports` array *and* the providing module `exports` that provider.

### Bootstrap (`backend/src/main.ts`)

`bootstrap()` does the following, in order:

1. Creates the Nest application from `AppModule`.
2. `app.setGlobalPrefix('api')` — every route is served under `/api/...`.
3. `app.enableCors({ origin: configService.get('corsOrigin'), credentials: true })` — CORS
   origin comes from `AppConfig.corsOrigin` (env var `CORS_ORIGIN`).
4. `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true,
   forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }))` —
   every incoming request body is validated and transformed against its DTO's
   `class-validator` decorators; unknown properties are stripped (`whitelist`) and requests
   that contain properties not on the DTO are rejected outright (`forbidNonWhitelisted`).
5. `app.useGlobalFilters(new HttpExceptionFilter())` — see [section 4](#4-the-common-layer)
   below.
6. Builds a Swagger document (`DocumentBuilder`, title "Life RPG API", bearer auth enabled) and
   serves it at `api/docs`.
7. Listens on `configService.get('port')` (env var `PORT`, default `3001`), logging
   `Life RPG API listening on http://localhost:${port}/api`.

`AppModule` itself also registers `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])` and
wires `ThrottlerGuard` as a global `APP_GUARD` provider — every route is rate-limited to 120
requests per 60-second window per client by default, on top of whatever `main.ts` sets up.

### Environment configuration (`backend/src/config/configuration.ts`)

`ConfigModule.forRoot({ isGlobal: true, load: [configuration] })` is imported once, in
`AppModule`, and is global — any module can inject `ConfigService<AppConfig, true>` without
importing `ConfigModule` itself. The `configuration()` factory reads `process.env` and shapes
it into the `AppConfig` interface:

```ts
interface AppConfig {
  port: number;
  databaseUrl: string;
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  corsOrigin: string;
}
```

| Env var | Config path | Default if unset |
| --- | --- | --- |
| `PORT` | `port` | `3001` |
| `DATABASE_URL` | `databaseUrl` | `''` |
| `JWT_ACCESS_SECRET` | `jwt.accessSecret` | `'dev-access-secret-change-me'` |
| `JWT_ACCESS_EXPIRES_IN` | `jwt.accessExpiresIn` | `'15m'` |
| `JWT_REFRESH_SECRET` | `jwt.refreshSecret` | `'dev-refresh-secret-change-me'` |
| `JWT_REFRESH_EXPIRES_IN` | `jwt.refreshExpiresIn` | `'30d'` |
| `CORS_ORIGIN` | `corsOrigin` | `'http://localhost:3000'` |

The insecure JWT secret defaults exist only so local dev works without a `.env` file; every
non-local environment must set `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` explicitly.

## 2. Module dependency map

Read directly from each module's `@Module({ imports: [...] })` array. `PrismaModule` is
decorated `@Global()`, so it is available for injection everywhere and — correctly — is not
listed in any other module's `imports` array.

| Module | Imports (from `imports: [...]`) |
| --- | --- |
| `AppModule` | `ConfigModule` (global), `ThrottlerModule`, `PrismaModule`, `AuthModule`, `UsersModule`, `AttributesModule`, `SkillsModule`, `XpModule`, `ProgressionModule`, `AchievementsModule`, `NotificationsModule`, `QuestsModule`, `HabitsModule`, `GoalsModule`, `AnalyticsModule`, `FriendsModule`, `LeaderboardModule`, `AdminModule` |
| `PrismaModule` | *(none — `@Global()`, exports `PrismaService` to every other module implicitly)* |
| `AuthModule` | `PassportModule`, `JwtModule.register({})`, `AttributesModule` |
| `UsersModule` | *(none)* |
| `AttributesModule` | *(none)* |
| `SkillsModule` | *(none)* |
| `XpModule` | *(none)* |
| `ProgressionModule` | `XpModule`, `AchievementsModule`, `NotificationsModule` |
| `AchievementsModule` | `NotificationsModule` |
| `NotificationsModule` | *(none)* |
| `QuestsModule` | `ProgressionModule`, `SkillsModule`, `AttributesModule` |
| `HabitsModule` | `ProgressionModule`, `SkillsModule`, `AttributesModule` |
| `GoalsModule` | `ProgressionModule`, `SkillsModule`, `AchievementsModule`, `AttributesModule` |
| `AnalyticsModule` | *(none)* |
| `FriendsModule` | *(none)* |
| `LeaderboardModule` | `FriendsModule` |
| `AdminModule` | `XpModule`, `AchievementsModule`, `NotificationsModule` |

As a nested tree (excluding `PrismaModule`/`ConfigModule`, which sit outside this tree since
they're global):

```
AppModule
├── AuthModule
│   └── AttributesModule
├── UsersModule
├── AttributesModule
├── SkillsModule
├── XpModule
├── ProgressionModule
│   ├── XpModule
│   ├── AchievementsModule
│   │   └── NotificationsModule
│   └── NotificationsModule
├── AchievementsModule (see above)
├── NotificationsModule
├── QuestsModule
│   ├── ProgressionModule (see above)
│   ├── SkillsModule
│   └── AttributesModule (see above)
├── HabitsModule
│   ├── ProgressionModule (see above)
│   ├── SkillsModule
│   └── AttributesModule (see above)
├── GoalsModule
│   ├── ProgressionModule (see above)
│   ├── SkillsModule
│   ├── AchievementsModule (see above)
│   └── AttributesModule (see above)
├── AnalyticsModule
├── FriendsModule
├── LeaderboardModule
│   └── FriendsModule (see above)
└── AdminModule
    ├── XpModule (see above)
    ├── AchievementsModule (see above)
    └── NotificationsModule
```

`ProgressionModule` is the hub of the gameplay-facing side of the graph: it is the only module
`QuestsModule`, `HabitsModule`, and `GoalsModule` import to reach `XpService`,
`AchievementsService`, and `NotificationsService` — none of the activity modules import
`XpModule`, `AchievementsModule`, or `NotificationsModule` directly (`GoalsModule` is the one
exception, importing `AchievementsModule` directly too — see the Goals section).

## 3. Module reference

Each subsection: purpose, exported service(s) and their public methods (one line each), and
which other modules depend on it — i.e., what else has to be checked/broken if you change this
module's public surface.

### Foundation

#### `PrismaModule` (`backend/src/prisma/`)

`@Global()` module wrapping a single `PrismaService` (extends `PrismaClient`, connects in
`onModuleInit`, disconnects in `onModuleDestroy`). Every other service in the app injects
`PrismaService` directly for all database access — there is no repository layer.

- **Exports:** `PrismaService` — no public methods beyond the generated Prisma Client API
  (`prisma.user`, `prisma.skill`, `prisma.$transaction`, etc.).
- **Depended on by:** every module in the app (implicitly, via `@Global()` — none of them list
  it in `imports`).

#### Config/common (`backend/src/config/`, `backend/src/common/`)

Not a Nest module — `ConfigModule` (from `@nestjs/config`) is registered globally in
`AppModule` with the `configuration()` factory from `backend/src/config/configuration.ts` (env
var shape documented in [section 1](#environment-configuration-backendsrcconfigconfigurationts)
above). `backend/src/common/` is a plain TypeScript utility folder (leveling math, day-key/streak
helpers, a param decorator, an exception filter, a serializer) imported directly by file path
wherever needed — it is not itself a Nest module. See [section 4](#4-the-common-layer) for what
each file does.

### `AuthModule` (`backend/src/auth/`)

Handles registration, login, token refresh, and logout using JWT access + refresh tokens
(bcrypt-hashed passwords and bcrypt-hashed refresh tokens stored on `User.hashedRefreshToken`).
On registration it also seeds the 8 fixed attributes for the new user via `AttributesService`.

- **Imports:** `PassportModule`, `JwtModule.register({})` (empty — secrets/expiry are supplied
  per-call from `ConfigService`, not at module-registration time), `AttributesModule`.
- **Controller:** `AuthController` — `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/refresh`, `POST /api/auth/logout` (guarded, needs a bearer token).
- **Exports:** `AuthService`.
  - `register(dto)` — rejects duplicate email/username, hashes the password, creates the user
    and its 8 default attributes in one `$transaction`, then issues a session.
  - `login(dto)` — verifies email + bcrypt password match, then issues a session.
  - `refresh(refreshToken)` — verifies the refresh JWT, compares it against the stored bcrypt
    hash, then issues a new session (rotates both tokens).
  - `logout(userId)` — clears `hashedRefreshToken`, invalidating future refreshes.
  - *(private)* `issueSession(user)` / `generateTokenPair(user)` — sign the access + refresh
    JWTs and persist the new hashed refresh token.
- Also provides `JwtStrategy` (`backend/src/auth/strategies/jwt.strategy.ts`, Passport bearer
  strategy validating against `jwt.accessSecret`) and, via `backend/src/auth/guards/`,
  `JwtAuthGuard`, which every other controller in the app applies with `@UseGuards(JwtAuthGuard)`.
  Neither is exported from the module (not in `exports: [...]`) — other modules use them by
  importing the guard/strategy class directly, not through Nest DI.
- **Depended on by:** nothing imports `AuthModule` itself (only `AppModule`); `JwtAuthGuard` and
  `CurrentUser`/`AuthenticatedUser` (see [section 4](#4-the-common-layer)) are used file-import
  style by every other controller.

### `UsersModule` (`backend/src/users/`)

Owns the authenticated user's own profile (`/users/me`) — thin CRUD over the `User` row's
public-facing fields.

- **Imports:** none.
- **Controller:** `UsersController` — `GET /api/users/me`, `PATCH /api/users/me` (both guarded).
- **Exports:** `UsersService`.
  - `getMe(userId)` — fetches the user or throws `NotFoundException`, returns `toPublicUser(user)`.
  - `updateMe(userId, dto)` — validates username uniqueness if changed, updates, returns
    `toPublicUser(user)`.
- **Depended on by:** nothing (only `AppModule`).

### `AttributesModule` (`backend/src/attributes/`)

Owns the 8 fixed top-level stats (Physical, Intelligence, Discipline, Energy, Social, Wealth,
Creativity, Wisdom — defined in `backend/src/attributes/default-attributes.ts`). Every user gets
all 8 automatically; they are not user-created or deletable.

- **Imports:** none.
- **Controller:** `AttributesController` — `GET /api/attributes` (list, each with nested
  `skills`), `GET /api/attributes/:id` (detail, adds `weeklyXP` + last-20 `recentActivity` +
  `skills`) — both guarded.
- **Exports:** `AttributesService`.
  - `ensureDefaultAttributes(userId, tx?)` — bulk-creates the 8 fixed attributes for a new user
    (`skipDuplicates: true`); accepts an optional Prisma transaction client so `AuthService` can
    run it inside the same transaction as user creation.
  - `findAll(userId)` — all of a user's attributes, sorted into the fixed display order, each
    with level state and nested skills.
  - `findOne(userId, id)` — one attribute's detail: level state, `weeklyXP` (last 7 days),
    `recentActivity` (last 20 `XPTransaction` rows), nested skills.
  - `assertOwnedAttributeIds(userId, attributeIds)` — throws `NotFoundException` unless every id
    in the list is owned by the user; used by Quests/Habits/Goals to validate "XP Bundles"
    attribute-bonus targets before linking them (mirrors `SkillsService.assertOwnedSkillIds`).
  - *(private)* `getOwnedAttribute(userId, id)` — fetch-or-404, then 403 if not owned.
- **Depended on by:** `AuthModule` (calls `ensureDefaultAttributes` during registration),
  `QuestsModule`, `HabitsModule`, `GoalsModule` (all call `assertOwnedAttributeIds` when
  creating/updating attribute bonuses).

#### Attribute ordering

`backend/src/attributes/default-attributes.ts` exports `ATTRIBUTE_KEY_ORDER` (an `AttributeKey[]`
derived from `DEFAULT_ATTRIBUTES`), the single source of truth for "the" attribute display order
(Physical, Intelligence, Discipline, Energy, Social, Wealth, Creativity, Wisdom). Postgres does
not guarantee row order without an explicit `ORDER BY`, so **any query that returns multiple
attributes must sort by this constant** rather than relying on insertion/database order. Two
places do this today: `AttributesService.findAll` and `AnalyticsService.attributeProgress` (the
latter's sort was added specifically because the frontend's dashboard radar chart made a stable
axis order visually load-bearing for the first time - see `docs/design-system.md` § "Attribute
color palette" for why the order also has to match the validated color palette's assignment
order, not just look consistent).

### `SkillsModule` (`backend/src/skills/`)

Owns user-created skills, each belonging to exactly one attribute (`Skill.attributeId`). Also
exposes a curated suggestion list (`default-skills.ts`) grouped by attribute for onboarding /
the "Add Skill" picker.

- **Imports:** none.
- **Controller:** `SkillsController` — `GET /api/skills/suggestions`, `GET /api/skills`,
  `POST /api/skills`, `GET /api/skills/:id`, `PATCH /api/skills/:id`, `DELETE /api/skills/:id`
  (all guarded).
- **Exports:** `SkillsService`.
  - `getSuggestions()` — static suggestion list from `DEFAULT_SKILLS`, grouped by
    `DEFAULT_ATTRIBUTES`.
  - `findAll(userId)` — all of the user's skills with level state + nested attribute summary.
  - `findOne(userId, id)` — one skill's detail: level state, `weeklyXP`, last-20
    `recentActivity`.
  - `create(userId, dto)` — validates the target attribute is owned, rejects duplicate
    name-under-attribute, creates the skill.
  - `update(userId, id, dto)` — validates ownership (and new attribute, if reassigned), updates.
  - `remove(userId, id)` — validates ownership, deletes.
  - `assertOwnedSkillIds(userId, skillIds)` — throws `NotFoundException` unless every id in the
    list is owned by the user; used by Quests/Habits/Goals to validate skill associations before
    linking them.
  - *(private)* `getOwnedSkill(userId, id)` — fetch-or-404, then 403 if not owned.
- **Depended on by:** `QuestsModule`, `HabitsModule`, `GoalsModule` (all call
  `assertOwnedSkillIds` when creating/updating skill-linked resources).

### `XpModule` (`backend/src/xp/`)

The centralized XP ledger. No controller — it is a pure backend service consumed by
`ProgressionModule`.

- **Imports:** none.
- **Exports:** `XpService`.
  - `awardXp(params)` — the single place that ever writes to `totalXP`/`level` on `User`,
    `Skill`, or `Attribute`. Generates one `eventId` (`crypto.randomUUID()`) per call and stamps
    it on every row the call writes. Inside one `$transaction`: creates an immutable
    `XPTransaction` row for the character (skillId/attributeId both null); then, for each entry
    in `skillAwards` (`{ skillId, amount? }`, deduped by `skillId`), one row for that skill and
    one for its owning attribute, using `amount ?? params.amount` — i.e. a skill without its own
    `amount` inherits the character-level amount, exactly reproducing pre-"XP Bundles" behavior;
    then, for each entry in `attributeBonuses` (`{ attributeId, amount }`, deduped by
    `attributeId`), one row crediting that attribute directly (no skill, no effect on the
    character row). Recomputes level state (`calculateLevelState`) for every row it writes. Also
    accepts an optional `sourceName` (the caller's activity title, e.g. a quest's title),
    written onto every row from the call so its label survives the source being renamed or
    deleted later. Throws `BadRequestException` if `amount <= 0`, or if any `skillAwards[].amount`
    or `attributeBonuses[].amount` is present and not a positive integer.
  - `getRecentActivity(userId, limit = 20)` — most recent `XPTransaction` rows for a user,
    including a minimal `skill` relation.
  - `applyCorrection(params)` — a direct, out-of-band ledger correction: the only place `amount`
    may be negative. Unlike `awardXp`, it never cascades — it touches exactly the character or
    exactly one named attribute (never both, never any skills), since a correction isn't tied to
    completing anything. Used by `AdminModule` to back the admin dashboard's XP/level editor.
- **Depended on by:** `ProgressionModule` (via `awardXp`) and `AdminModule` (via
  `applyCorrection`) — the only two consumers, by design; nothing else touches `XpService`
  directly.

### `ProgressionModule` (`backend/src/progression/`)

Orchestrates the full "complete an activity" workflow described in the project's MVP spec:
award XP, recompute levels, update the character's daily streak, check achievements, and raise
a level-up notification if applicable. No controller — Quests/Habits/Goals call into it instead
of composing `XpService`/`AchievementsService`/`NotificationsService` themselves, so the
workflow only exists in one place.

- **Imports:** `XpModule`, `AchievementsModule`, `NotificationsModule`.
- **Exports:** `ProgressionService`.
  - `completeActivity(params)` — forwards `params.skillAwards`/`params.attributeBonuses`
    straight through to `XpService.awardXp` (it has no opinion on "XP Bundles" — that's decided
    upstream by the calling Quest/Habit/Goal service), then (unless
    `params.updateCharacterStreak === false`) updates the character's streak, creates a
    `LEVEL_UP` notification if the character leveled up, then calls
    `AchievementsService.checkAndUnlock`, and returns a combined `CompletionResult`
    (xpGained, levelUp/newLevel, per-skill and per-attribute level results, unlocked achievement
    names, streak).
  - *(private)* `updateCharacterStreak(userId)` — computes the new `currentStreak`/
    `longestStreak` via `getDayKey`/`nextStreakValue` and persists them plus `lastActivityAt`.
- **Depended on by:** `QuestsModule`, `HabitsModule`, `GoalsModule`.

### `AchievementsModule` (`backend/src/achievements/`)

Data-driven achievement engine — achievement definitions (seeded via `prisma/seed.ts`, not
hard-coded in TypeScript) describe a `requirementType` + `requirementValue` (and optionally
`attributeKey`/`skillName`) that's evaluated against live user stats and the XP ledger.

- **Imports:** `NotificationsModule`.
- **Controller:** `AchievementsController` — `GET /api/achievements` (all definitions),
  `GET /api/achievements/unlocked` (this user's unlocked achievements) — both guarded.
- **Exports:** `AchievementsService`.
  - `findAll()` — every achievement definition, ordered by `requirementValue`.
  - `findUnlocked(userId)` — this user's `UserAchievement` rows with the nested `achievement`.
  - `checkAndUnlock(userId)` — evaluates every not-yet-unlocked achievement's condition
    (`isConditionMet`) against current stats; for each newly met achievement, creates a
    `UserAchievement` row and a `ACHIEVEMENT_UNLOCK` notification; returns the newly unlocked
    `Achievement[]`.
  - *(private)* `isConditionMet(userId, user, achievement)` — switches on `requirementType`
    (`LEVEL_REACHED`, `STREAK_LENGTH`, `QUESTS_COMPLETED`, `HABITS_COMPLETED`,
    `GOALS_COMPLETED`, `GOALS_CREATED`, `ATTRIBUTE_LEVEL_REACHED`, `SKILL_LEVEL_REACHED`,
    `SKILL_ACTIVITY_COUNT`) — see `docs/gameplay-systems.md` for what each condition means.
  - *(private)* `countCompletions(userId, sourceType)` — counts character-level (skillId +
    attributeId both null) `XPTransaction` rows for a given `XPSourceType`.
- **Depended on by:** `ProgressionModule` (checks after every activity completion),
  `GoalsModule` (checks directly after goal *creation*, since creation-driven achievements like
  "Goal Setter" have no XP event to hang off of).

### `NotificationsModule` (`backend/src/notifications/`)

In-app notifications (level-ups, achievement unlocks, etc.). Purely reactive — nothing in this
module decides *when* to notify; callers (`ProgressionService`, `AchievementsService`) decide
that and call `create`.

- **Imports:** none.
- **Controller:** `NotificationsController` — `GET /api/notifications` (optional
  `?unread=true`), `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all` —
  all guarded.
- **Exports:** `NotificationsService`.
  - `create(userId, type, title, message)` — creates a `Notification` row
    (`NotificationType`: e.g. `LEVEL_UP`, `ACHIEVEMENT_UNLOCK`).
  - `findForUser(userId, unreadOnly = false)` — most recent 50 notifications, optionally
    unread-only.
  - `markRead(userId, notificationId)` — fetch-or-404, 403 if not owned, marks read.
  - `markAllRead(userId)` — bulk-marks all unread notifications read.
- **Depended on by:** `ProgressionModule` (level-up notifications), `AchievementsModule`
  (achievement-unlock notifications).

### `QuestsModule` (`backend/src/quests/`)

CRUD + completion for one-time and recurring quests, optionally linked to a `Goal` and to one
or more skills (`QuestSkill` join rows).

- **Imports:** `ProgressionModule`, `SkillsModule`, `AttributesModule`.
- **Controller:** `QuestsController` — `GET /api/quests` (filterable by `status`/`goalId`),
  `POST /api/quests`, `GET /api/quests/:id`, `PATCH /api/quests/:id`,
  `POST /api/quests/:id/complete`, `DELETE /api/quests/:id` — all guarded.
- **Exports:** `QuestsService`.
  - `findAll(userId, filters)` / `findOne(userId, id)` — list/detail, serialized with a
    `completedToday` flag (recurring quests: last completion was today; one-time: `status ===
    'COMPLETED'`), plus `skillRewardOverrides` (from `QuestSkill.amount`) and `attributeBonuses`
    ("XP Bundles" — see `docs/gameplay-systems.md`).
  - `create(userId, dto)` — validates owned goal (if linked) and owned skills, defaults
    `difficulty: MEDIUM`, `type: ONE_TIME`, and `xpReward` from `DIFFICULTY_XP[difficulty]` if
    not given, creates the quest and its `QuestSkill` rows (each carrying its
    `skillRewardOverrides` entry, if any, as `amount`) and `ActivityAttributeBonus` rows.
  - `update(userId, id, dto)` — validates ownership/linked goal/skills, replaces skill links if
    `skillIds` provided, updates scalar fields; replaces `skillRewardOverrides` and
    `attributeBonuses` wholesale when either is provided.
  - `remove(userId, id)` — validates ownership, deletes.
  - `complete(userId, id)` — blocks archived quests and (for recurring quests) same-day
    re-completion, or (for one-time quests) re-completion at all; updates the quest's
    completion state, then calls `ProgressionService.completeActivity` with
    `sourceType: 'QUEST_COMPLETION'`, `skillAwards` derived from the quest's `questSkills`
    (`{ skillId, amount: qs.amount ?? undefined }`), and `attributeBonuses` from the quest's
    `ActivityAttributeBonus` rows.
  - *(private)* `assertOwnedGoal`, `getOwnedQuest`, `validateRewardBundle` (checks every
    `skillRewardOverrides[].skillId` is in the request's `skillIds`, and delegates to
    `AttributesService.assertOwnedAttributeIds` for `attributeBonuses`).
- **Depended on by:** nothing (only `AppModule`).

### `HabitsModule` (`backend/src/habits/`)

CRUD + completion for recurring habits, gated to once per calendar day via the
`HabitCompletion` unique constraint on `[habitId, periodKey]`.

- **Imports:** `ProgressionModule`, `SkillsModule`, `AttributesModule`.
- **Controller:** `HabitsController` — `GET /api/habits`, `POST /api/habits`,
  `PATCH /api/habits/:id`, `DELETE /api/habits/:id`, `POST /api/habits/:id/complete` — all
  guarded. (No `GET /api/habits/:id` detail route — only list + mutate.)
- **Exports:** `HabitsService`.
  - `findAll(userId)` — all habits, each annotated with `completedToday` (looked up from
    today's `HabitCompletion` rows in one batch query), plus `skillRewardOverrides` and
    `attributeBonuses` ("XP Bundles" — see `docs/gameplay-systems.md`).
  - `create(userId, dto)` — validates owned skills, defaults `frequency: DAILY`,
    `xpReward: 10`, creates the habit and its `HabitSkill` rows (each carrying its
    `skillRewardOverrides` entry, if any, as `amount`) and `ActivityAttributeBonus` rows.
  - `update(userId, id, dto)` — validates ownership/skills, replaces skill links if provided,
    updates scalar fields, re-derives `completedToday`; replaces `skillRewardOverrides` and
    `attributeBonuses` wholesale when either is provided.
  - `remove(userId, id)` — validates ownership, deletes.
  - `complete(userId, id)` — requires `isActive`; attempts to create today's `HabitCompletion`
    row, converting a unique-constraint violation (Prisma error `P2002`) into a
    `ConflictException` ("already completed for this period"); on success, recomputes the
    habit's own streak (`nextStreakValue`) and calls `ProgressionService.completeActivity` with
    `sourceType: 'HABIT_COMPLETION'`, `skillAwards` derived from the habit's `habitSkills`, and
    `attributeBonuses` from the habit's `ActivityAttributeBonus` rows.
  - *(private)* `getOwnedHabit`, `validateRewardBundle` (same shape as `QuestsService`'s).
- **Depended on by:** nothing (only `AppModule`).

### `GoalsModule` (`backend/src/goals/`)

CRUD + progress tracking for goals. Goals come in three types — `BINARY` (done/not done),
`NUMERIC` (progress toward a `targetValue`), `COMPLETION` (progress = count of linked completed
quests) — and can optionally require linked skills.

- **Imports:** `ProgressionModule`, `SkillsModule`, `AchievementsModule` (the one activity
  module that imports `AchievementsModule` directly, in addition to reaching it indirectly
  through `ProgressionModule`), `AttributesModule`.
- **Controller:** `GoalsController` — `GET /api/goals` (filterable by `status`),
  `POST /api/goals`, `GET /api/goals/:id`, `PATCH /api/goals/:id`, `POST /api/goals/:id/progress`,
  `DELETE /api/goals/:id` — all guarded.
- **Exports:** `GoalsService`.
  - `findAll(userId, filters)` — list with computed `progressPercent` per goal, plus
    `skillRewardOverrides` and `attributeBonuses` ("XP Bundles" — see
    `docs/gameplay-systems.md`).
  - `findOne(userId, id)` — detail, adds linked `quests`.
  - `create(userId, dto)` — validates owned skills, requires `targetValue` for `NUMERIC`/
    `COMPLETION` types, defaults `type: BINARY`, `xpReward: 500`; creates the goal's `GoalSkill`
    rows (each carrying its `skillRewardOverrides` entry, if any, as `amount`) and
    `ActivityAttributeBonus` rows; after creating, calls `AchievementsService.checkAndUnlock`
    directly (goal-creation achievements have no XP event to piggyback on, so they can't go
    through `ProgressionService`).
  - `update(userId, id, dto)` — validates ownership/skills, replaces skill links if provided,
    updates scalar fields; replaces `skillRewardOverrides` and `attributeBonuses` wholesale when
    either is provided.
  - `remove(userId, id)` — validates ownership, deletes.
  - `progress(userId, id, dto)` — requires an `ACTIVE` goal; for `BINARY` goals any `value >= 1`
    completes it, for others `currentValue` is set directly and completion is
    `currentValue >= targetValue`; on completion, calls `ProgressionService.completeActivity`
    with `sourceType: 'GOAL_COMPLETION'`, `skillAwards` derived from the goal's `goalSkills`, and
    `attributeBonuses` from the goal's `ActivityAttributeBonus` rows, returning
    `{ goal, completion }` (otherwise just `{ goal }`).
  - *(private)* `validateRewardBundle` (same shape as `QuestsService`'s).
  - *(private)* `serialize`, `getOwnedGoal`.
- **Depended on by:** nothing (only `AppModule`).

### `AnalyticsModule` (`backend/src/analytics/`)

Read-only aggregation over the XP ledger and related resources — no writes, no `exports`
(nothing else in the backend consumes `AnalyticsService`).

- **Imports:** none.
- **Controller:** `AnalyticsController` — `GET /api/analytics/overview`,
  `GET /api/analytics/xp?days=`, `GET /api/analytics/skills`, `GET /api/analytics/attributes`,
  `GET /api/analytics/activity?days=`, `GET /api/analytics/feed?limit=`,
  `GET /api/analytics/xp-history?sourceType=&limit=&before=` — all guarded. The controller
  clamps `days` to `[1, 365]` (defaults 30 for `/xp`, 84 for `/activity`), `limit` to `[1, 100]`
  (default 15 for `/feed`, 20 for `/xp-history`), and validates `sourceType` against the
  `XPSourceType` enum (an invalid/missing value just means "no filter").
- **Providers:** `AnalyticsService` (not exported — no other module depends on it).
  - `overview(userId)` — character level state, `xpThisWeek`, `activitiesCompleted` (count of
    character-level completion transactions), current/longest streak, `mostImprovedSkill`
    (highest weekly XP skill).
  - `xpOverTime(userId, days)` — daily character-level XP totals for the trailing `days`
    (zero-filled for days with no activity), via `buildDayRange`.
  - `skillProgress(userId)` — every skill with level, `totalXP`, and `weeklyXP`.
  - `attributeProgress(userId)` — every attribute with level, `totalXP`, and `weeklyXP`.
  - `activityHeatmap(userId, days)` — daily count of character-level completion transactions
    for the trailing `days` (zero-filled), for a GitHub-style heatmap.
  - `feed(userId, limit)` — most recent character-level `XPTransaction` rows, each annotated
    with `sourceTitle` (now just the stored `sourceName`, no live join - see below).
  - `xpHistory(userId, sourceType?, limit, before?)` — groups ledger rows by `eventId` (falling
    back to a row's own `id` as a singleton group for pre-`eventId` rows) into one entry per
    completion/correction event, each with a `lines[]` breakdown across whichever of
    character/skill/attribute it touched. Groups in application code rather than a DB-level
    `distinct` - see the method's own doc comment for why (a `distinct` on a nullable column
    would collapse every legacy null-`eventId` row into a single result). Fetches
    `min(300, max(limit * 10, 50))` raw rows as a buffer before grouping, since grouping reduces
    the row count - generous for the common case, but a page could fall short of `limit` for a
    user with unusually large multi-skill events.
- **Depended on by:** nothing (only `AppModule`).

### `FriendsModule` (`backend/src/friends/`)

Friend-request graph: send/accept/decline/list/remove, plus the group-lookup `LeaderboardModule`
depends on. See `docs/gameplay-systems.md` § "Friends & Leaderboard" for the lifecycle rationale
(no `DECLINED` status, both-direction duplicate checking, etc.).

- **Imports:** none.
- **Controller:** `FriendsController` — `GET /api/friends`, `GET /api/friends/requests`,
  `POST /api/friends/requests`, `POST /api/friends/requests/:id/accept`,
  `DELETE /api/friends/requests/:id`, `DELETE /api/friends/:id` — all guarded.
- **Providers:** `FriendsService` (exported — `LeaderboardModule` imports this module for it).
  - `sendRequest(userId, username)` — exact-username lookup; rejects self-requests; checks for an
    existing `Friendship` row in *either* direction before creating a new `PENDING` one.
  - `listRequests(userId)` — all `PENDING` rows the user is party to, either direction, annotated
    with `direction: 'INCOMING' | 'OUTGOING'` relative to the caller.
  - `acceptRequest(userId, friendshipId)` — addressee-only; flips `status` to `ACCEPTED`, stamps
    `respondedAt`.
  - `removeFriendship(userId, friendshipId)` — deletes a row the caller is party to; this one
    method backs decline, cancel, *and* unfriend (see the lifecycle note above).
  - `listFriends(userId)` — all `ACCEPTED` rows, resolved to the *other* user's `FriendProfile`
    plus `friendshipId`/`friendSince`.
  - `getSuggestions(userId, limit)` — other users with *no* existing `Friendship` row against the
    caller (any status, either direction), ranked by `totalXP` desc then `username` asc, capped
    to `limit`. Backs the "Suggested Friends" section of the frontend's Manage Friends modal.
  - `getFriendUserIds(userId)` — the leaderboard's comparison group: every user id with an
    `ACCEPTED` `Friendship` to `userId`, either direction. The one method that exists purely for
    another module to call.
- **Depended on by:** `LeaderboardModule`.

### `LeaderboardModule` (`backend/src/leaderboard/`)

Ranks the caller against their friend group on one of three metrics. Read-only; no `exports`
(nothing depends on `LeaderboardService` itself, only on `FriendsService` via `FriendsModule`).

- **Imports:** `FriendsModule` (for `FriendsService.getFriendUserIds`) — this is the one exception
  to the "read other domains' tables directly, like `AnalyticsModule`" pattern used elsewhere in
  the backend, because resolving a friend group involves real branching logic
  (requester-vs-addressee direction) worth centralizing in `FriendsService` rather than
  duplicating here.
- **Controller:** `LeaderboardController` — `GET /api/leaderboard?metric=&attributeKey=&period=`,
  guarded. Query validated by `LeaderboardQueryDto` (`class-validator`, conditional
  `@ValidateIf` — `attributeKey` required iff `metric = 'ATTRIBUTE'`, `period` required iff
  `metric = 'XP'`).
- **Providers:** `LeaderboardService` (not exported).
  - `getLeaderboard(userId, query)` — resolves the group via `FriendsService.getFriendUserIds`,
    then dispatches to one of three private rankers by `query.metric`: `rankByLevel`,
    `rankByAttribute`, `rankByXp`. Each returns entries pre-sorted and ranked (see
    `docs/gameplay-systems.md` for the exact sort/tiebreak rules and `period-bounds.ts` for how
    `XP`'s calendar-aligned period boundaries are computed).
- **Depended on by:** nothing (only `AppModule`).

### `AdminModule` (`backend/src/admin/`)

Manual data-editing surface for the `/admin` frontend dashboard. Every route is guarded by both
`JwtAuthGuard` (must be logged in) and `AdminGuard` (must have `User.isAdmin === true`, checked
fresh from the database on every request rather than trusted from a JWT claim). No `exports` —
nothing else in the backend depends on `AdminService`.

- **Imports:** `XpModule` (for `XpService.applyCorrection`), `AchievementsModule` (for
  `checkAndUnlock`/`findAll`), `NotificationsModule` (for `LEVEL_UP`/`ACHIEVEMENT_UNLOCK`
  notifications on corrections/grants).
- **Guard:** `AdminGuard` (`guards/admin.guard.ts`) — a `CanActivate` that reads `request.user`
  (populated by `JwtAuthGuard`, which must run first in the `@UseGuards(...)` list) and looks up
  `isAdmin` by id; throws `ForbiddenException` if missing or `false`.
- **Controller:** `AdminController` — `GET/PATCH/DELETE /api/admin/users/:id`,
  `GET /api/admin/users?search=`, `POST /api/admin/users/:id/xp`,
  `POST/DELETE /api/admin/users/:id/achievements[/:achievementId]`,
  `GET /api/admin/achievements`, `GET/POST /api/admin/friendships`,
  `PATCH /api/admin/friendships/:id/accept`, `DELETE /api/admin/friendships/:id`.
- **Providers:** `AdminService` (not exported).
  - `listUsers(search?)` / `getUserDetail(id)` / `updateUser(id, callerId, dto)` /
    `deleteUser(id, callerId)` — user CRUD via `toPublicUser`; `updateUser`/`deleteUser` both take
    `callerId` to block an admin from revoking their own `isAdmin` flag or deleting their own
    account (the two self-lockout footguns this tool would otherwise allow).
  - `adjustXp(id, dto)` — resolves `dto.attributeKey` to that user's `Attribute` row (if set),
    calls `XpService.applyCorrection`, raises a `LEVEL_UP` notification on a character-scoped
    level-up, then always runs `AchievementsService.checkAndUnlock` (so a correction can unlock
    real achievements, same as organic play).
  - `listAchievements()` / `grantAchievement(userId, achievementId)` /
    `revokeAchievement(userId, achievementId)` — thin wrappers over `AchievementsService.findAll`
    and direct `UserAchievement` create/delete, bypassing the normal condition check entirely
    (that's the point of a manual grant/revoke tool).
  - `listFriendships()` / `createFriendship(dto)` / `acceptFriendship(id)` /
    `deleteFriendship(id)` — the same duplicate-checking/serialization logic as `FriendsService`,
    but for **any** pair of users by username rather than the caller's own relationships; not
    implemented by reusing `FriendsService` since every one of its methods is written relative to
    "the caller," which doesn't apply here.
- **Depended on by:** nothing (only `AppModule`).

## 4. The `common/` layer

`backend/src/common/` is plain shared TypeScript, not a Nest module — files are imported
directly wherever needed rather than injected.

### `leveling.ts`

- `xpRequiredForLevel(level)` — returns `100 * level`: the XP needed to go from `level` to
  `level + 1`. Used for the character, every skill, and every attribute (same formula for all
  three).
- `calculateLevelState(totalXp)` — walks up from level 1, repeatedly subtracting
  `xpRequiredForLevel(level)` from a running remainder while incrementing `level`, until the
  remainder is less than what the current level requires. Returns
  `{ level, currentLevelXp, xpForNextLevel }`. Levels are always recomputed from the cumulative
  `totalXP`, never incremented in place — so the result stays consistent even after XP
  corrections.
- `DIFFICULTY_XP` — the default XP reward per quest difficulty:
  `EASY: 25, MEDIUM: 50, HARD: 100, EPIC: 250, LEGENDARY: 500`.

### `period.ts`

- `getDayKey(date = new Date())` — returns a UTC `YYYY-MM-DD` string. This is the unit every
  streak and daily-completion check is keyed on.
- `daysBetweenKeys(previousKey, currentKey)` — integer day difference between two day keys.
- `nextStreakValue(previousDayKey, newDayKey, previousStreak)` — streak transition logic: no
  previous activity → `1`; same day → unchanged (`previousStreak || 1`); exactly one day later →
  `previousStreak + 1`; anything else (gap) → resets to `1`. Shared by the character's streak
  (`ProgressionService.updateCharacterStreak`) and each habit's own streak
  (`HabitsService.complete`).

### `decorators/current-user.decorator.ts`

- `AuthenticatedUser` interface — `{ userId: string; email: string; username: string }`, the
  shape `JwtStrategy.validate` attaches to `request.user`.
- `CurrentUser` — a param decorator (`createParamDecorator`) that pulls `request.user` out of
  the request. Every guarded controller method uses
  `@CurrentUser() user: AuthenticatedUser` instead of reading `req.user` manually.

### `serializers/public-user.ts`

- `toPublicUser(user)` — maps a full Prisma `User` row down to the public shape returned by
  auth/profile endpoints: `id, email, username, avatar, level, totalXP, currentXP,
  xpForNextLevel, currentStreak, longestStreak, createdAt, isAdmin` (notably omits
  `passwordHash` and `hashedRefreshToken`). `currentXP`/`xpForNextLevel` are derived via
  `calculateLevelState`, not stored columns. `PublicUser` is exported as
  `ReturnType<typeof toPublicUser>`. Also reused directly by `AdminModule` (the admin dashboard's
  user list/detail views are this same shape).
- `toFriendProfile(user)` — the same idea but for rendering a *different* user back to the
  caller (friend requests, friends list, leaderboard entries): drops `email` and the streak
  fields on top of what `toPublicUser` already omits, since those stay private to the account
  owner. Used by `FriendsService`. `FriendProfile` is exported as
  `ReturnType<typeof toFriendProfile>`.

### `filters/http-exception.filter.ts`

- `HttpExceptionFilter` — registered globally in `main.ts` via `app.useGlobalFilters(...)`,
  `@Catch()` (catches everything, not just `HttpException`). For a thrown `HttpException`, uses
  its status and response body; for anything else, responds `500` with
  `{ message: 'Internal server error' }`. Always shapes the JSON response as
  `{ statusCode, timestamp, path, ...body }`, and logs a stack trace via `Logger` for any `5xx`
  response. This is what makes every error response across the API consistent in shape,
  regardless of which service threw.

## 5. Testing

`jest`/`ts-jest`/`@nestjs/testing` were installed from the project's first commit but unused
until the ledger invariant tests below - `npm test` (backend) runs the suite, configured via a
`"jest"` block in `package.json` (`rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`).

- `common/leveling.spec.ts` — pure unit tests for `xpRequiredForLevel`/`calculateLevelState`:
  level-boundary edge cases, the negative-XP floor, and that level state is always recomputed
  from cumulative XP rather than trusted from a stored counter.
- `xp/xp.service.spec.ts` — unit tests for `XpService.awardXp`/`applyCorrection` against a
  mocked `PrismaService` (a fake `tx` object with jest-mocked model methods, since these tests
  assert on *which rows get created and with what shape*, not on real database behavior). Encodes
  the ledger's two most important invariants in code rather than only in comments:
  - a character-level row never has `skillId` or `attributeId` set;
  - a skill row and its attribute-mirror row are never the same row (one row per level of the
    cascade), and every associated skill gets the *full* award amount, not a divided share;
  - all rows from one `awardXp`/`applyCorrection` call share the same generated `eventId`, and
    two separate calls never collide;
  - `applyCorrection` clamps a resulting negative total to `0`, accepts negative amounts (the
    only path where that's allowed), and rejects a zero amount.

Nothing else in the backend has test coverage yet - this is deliberately scoped to the ledger,
the highest-risk, most-reused code path in the app (see `docs/gameplay-systems.md`'s invariant
callout), not a general push for coverage.

## 6. Maintenance note

This file documents backend **structure and responsibilities** — the module graph, what each
service exports, and who depends on what. It deliberately does not reproduce the XP/leveling
formulas, streak edge cases, or achievement-condition semantics in depth; that's
`docs/gameplay-systems.md`. Update this file whenever a module is added, removed, or rewired
(its `imports`/`exports` change), or a service gains or loses a major public method — i.e.,
whenever the dependency map or the per-module method lists above would go stale.
