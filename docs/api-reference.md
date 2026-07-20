# Life RPG API Reference

Complete reference for the Life RPG REST API, generated from the actual NestJS controllers and
DTOs in `backend/src`. For architecture/setup, see the root `README.md`; this document goes
deeper into exact request/response shapes.

## Base URL and conventions

- Local base URL: `http://localhost:3001/api`
- Every route is served under the global prefix `/api`, set once via `app.setGlobalPrefix('api')`
  in `backend/src/main.ts`. Controllers below are documented with their path **relative to
  `/api`** (e.g. `POST /auth/login` means `POST http://localhost:3001/api/auth/login`).
- Interactive, auto-generated OpenAPI/Swagger docs are served at `/api/docs`
  (`http://localhost:3001/api/docs`), built from the same controllers/DTOs via
  `SwaggerModule.setup('api/docs', app, document)`.
- CORS is enabled with `credentials: true`, restricted to the origin configured by the
  `CORS_ORIGIN` env var (`corsOrigin` config key).
- All request bodies are validated with a global `ValidationPipe` configured with
  `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, and
  `enableImplicitConversion: true`. Practical consequences:
  - Unknown fields in a request body are rejected (400), not silently dropped.
  - Fields fail validation according to the `class-validator` decorators on the DTO (documented
    per-endpoint below): missing required fields, wrong types, out-of-range values, and
    unrecognized enum values all produce `400 Bad Request`.
- Unhandled/HTTP exceptions are normalized by a global `HttpExceptionFilter` into:
  ```ts
  { statusCode: number, timestamp: string, path: string, message: string | string[], ... }
  ```
  (any other fields from the underlying exception's response body are also spread in; validation
  errors typically produce `message` as an array of per-field error strings).

## Authentication

Auth uses JWT access + refresh tokens (`@nestjs/jwt` + `passport-jwt`), issued by
`AuthService`/`JwtStrategy` (`backend/src/auth`):

- Obtain a token pair from `POST /auth/register` or `POST /auth/login`.
- Every route **except the four under `/auth`** requires a valid access token, sent as:
  ```
  Authorization: Bearer <accessToken>
  ```
- The access token payload is `{ sub: userId, email, username }`, signed with `JWT_ACCESS_SECRET`
  and expiring after `JWT_ACCESS_EXPIRES_IN` (default `15m`).
- The refresh token payload is `{ sub: userId }`, signed with `JWT_REFRESH_SECRET`, expiring after
  `JWT_REFRESH_EXPIRES_IN` (default `30d`). The server also stores a bcrypt hash of the current
  refresh token on the user row (`hashedRefreshToken`); `POST /auth/refresh` verifies the token
  against both the JWT signature and that hash, and `POST /auth/logout` clears the stored hash so
  the old refresh token can no longer be used.
- Enforcement: protected controllers are decorated with `@UseGuards(JwtAuthGuard)`
  (`backend/src/auth/guards/jwt-auth.guard.ts`, a thin subclass of Passport's `AuthGuard('jwt')`).
  The guard runs `JwtStrategy.validate()`, which trusts the token's `sub`/`email`/`username`
  claims and attaches `{ userId, email, username }` to `request.user`. Route handlers pull this
  off the request via the `@CurrentUser()` param decorator
  (`backend/src/common/decorators/current-user.decorator.ts`), typed as `AuthenticatedUser`:
  ```ts
  interface AuthenticatedUser {
    userId: string;
    email: string;
    username: string;
  }
  ```
  A missing/invalid/expired access token results in `401 Unauthorized` before the handler runs.
- Ownership is enforced per-resource inside each service (not the guard): fetching/mutating a
  quest/habit/goal/skill/attribute/notification that exists but belongs to another user returns
  `403 Forbidden`; a nonexistent id returns `404 Not Found`.

---

## Auth (`/auth`)

No endpoint under `/auth` requires a Bearer token except `logout`.

### `POST /auth/register`

Create a new user account. Also auto-creates all 8 fixed `Attribute` rows for the user (see
Attributes section) inside the same DB transaction, then issues a session.

Auth required: no.

Request body (`RegisterDto`):

```ts
{
  email: string;      // must be a valid email (@IsEmail)
  username: string;   // 3-24 chars, matches /^[a-zA-Z0-9_]+$/ (letters, numbers, underscore only)
  password: string;   // 8-72 chars
}
```

Response: `201 Created` with a session payload (same shape as `login`, see below).

Errors: `409 Conflict` if the email or username is already taken (message distinguishes which).

### `POST /auth/login`

Authenticate with email + password and issue a new session.

Auth required: no.

Request body (`LoginDto`):

```ts
{
  email: string;    // @IsEmail
  password: string; // @IsString
}
```

Response: `200 OK`

```ts
{
  user: PublicUser;      // see "PublicUser shape" below
  accessToken: string;
  refreshToken: string;
}
```

Errors: `401 Unauthorized` ("Invalid email or password") if the email doesn't exist or the
password doesn't match.

### `POST /auth/refresh`

Exchange a still-valid refresh token for a brand-new access + refresh token pair (refresh tokens
are rotated on every use — the old one's hash is overwritten).

Auth required: no (the refresh token itself is the credential, passed in the body, not as a
Bearer header).

Request body (`RefreshDto`):

```ts
{
  refreshToken: string; // @IsString
}
```

Response: `200 OK`, same shape as `login`: `{ user, accessToken, refreshToken }`.

Errors: `401 Unauthorized` if the token fails JWT verification, the user no longer exists, the
user has no stored refresh token hash, or the token doesn't match the stored hash.

### `POST /auth/logout`

Invalidates the user's current refresh token by clearing `hashedRefreshToken` on the user row.
Does not blacklist the still-live access token (access tokens simply expire on their own).

Auth required: yes (Bearer access token).

Request body: none.

Response: `204 No Content`.

---

## Users (`/users`)

All routes require a Bearer token.

### `GET /users/me`

Return the current user's profile.

Response: `200 OK` with a `PublicUser` (see shape below).

Errors: `404 Not Found` if the user row no longer exists.

### `PATCH /users/me`

Partially update the current user's profile.

Request body (`UpdateUserDto`, all fields optional):

```ts
{
  username?: string; // 3-24 chars, /^[a-zA-Z0-9_]+$/
  avatar?: string;   // @IsUrl({ require_tld: false }) - must be URL-shaped
}
```

Response: `200 OK` with the updated `PublicUser`.

Errors: `409 Conflict` if `username` is already taken by another user.

### PublicUser shape

Returned by `register`, `login`, `refresh`, `GET /users/me`, `PATCH /users/me`, and every
`/admin/users` route (`backend/src/common/serializers/public-user.ts`):

```ts
{
  id: string;
  email: string;
  username: string;
  avatar: string | null;
  level: number;
  totalXP: number;
  currentXP: number;       // XP earned within the current level (derived, not stored)
  xpForNextLevel: number;  // XP needed to complete the current level (derived: 100 * level)
  currentStreak: number;
  longestStreak: number;
  createdAt: string; // ISO date
  isAdmin: boolean;   // gates the /admin API and frontend route - see the Admin section below
}
```

---

## Attributes (`/attributes`)

The 8 fixed top-level stats (Physical, Intelligence, Discipline, Energy, Social, Wealth,
Creativity, Wisdom). Every user gets all 8 automatically at registration — attributes are
read-only via the API (no create/update/delete endpoints); every skill belongs to exactly one.
All routes require a Bearer token.

### `GET /attributes`

List the caller's 8 attributes, each with its nested skills, in fixed display order
(Physical, Intelligence, Discipline, Energy, Social, Wealth, Creativity, Wisdom).

Response: `200 OK`, an array of:

```ts
{
  id: string;
  userId: string;
  key: 'PHYSICAL' | 'INTELLIGENCE' | 'DISCIPLINE' | 'ENERGY' | 'SOCIAL' | 'WEALTH' | 'CREATIVITY' | 'WISDOM';
  name: string;
  description: string | null;
  icon: string | null;
  level: number;
  totalXP: number;
  currentXP: number;       // derived
  xpForNextLevel: number;  // derived
  createdAt: string;
  updatedAt: string;
  skills: Array<Skill & { attribute: { id: string; key: string; name: string; icon: string | null } }>;
}
```

### `GET /attributes/:id`

Detail view for one attribute: adds the last 7 days' XP total and the 20 most recent
`XPTransaction` rows for it.

Response: `200 OK`, the same shape as a list item plus:

```ts
{
  weeklyXP: number;          // sum of XP transactions on this attribute in the last 7 days
  recentActivity: XPTransaction[]; // up to 20, newest first
}
```

Errors: `404 Not Found` if the id doesn't exist, `403 Forbidden` if it belongs to another user.

---

## Skills (`/skills`)

All routes require a Bearer token.

### `GET /skills/suggestions`

Static list of suggested default skills grouped by attribute, used for onboarding / the "Add
Skill" picker. Not user-scoped (same result for everyone, no DB query on the user).

Response: `200 OK`:

```ts
Array<{
  key: string;      // AttributeKey
  name: string;
  description: string;
  icon: string;
  skills: Array<{ name: string; attributeKey: string; description?: string; icon?: string }>;
}>
```

### `GET /skills`

List all of the caller's skills, alphabetically, each with its nested `attribute` summary and
derived level fields.

Response: `200 OK`, array of `Skill`:

```ts
{
  id: string;
  userId: string;
  attributeId: string;
  name: string;
  description: string | null;
  icon: string | null;
  isDefault: boolean;
  level: number;
  totalXP: number;
  currentXP: number;       // derived
  xpForNextLevel: number;  // derived
  createdAt: string;
  updatedAt: string;
  attribute: { id: string; key: string; name: string; icon: string | null };
}
```

### `POST /skills`

Create a new skill under one of the user's attributes.

Request body (`CreateSkillDto`):

```ts
{
  name: string;         // 2-40 chars
  attributeId: string;  // @IsUUID, must be one of the caller's own attributes
  description?: string; // max 280 chars
  icon?: string;
}
```

Response: `201 Created` with the new `Skill` (same shape as the list item above).

Errors: `404 Not Found` if `attributeId` doesn't exist or isn't owned by the caller;
`409 Conflict` if a skill with the same `name` already exists under that attribute for this user
(uniqueness is scoped per `[userId, attributeId, name]`, so the same name can exist under two
different attributes).

### `GET /skills/:id`

Detail view for one skill: adds the last 7 days' XP total and the 20 most recent `XPTransaction`
rows for it.

Response: `200 OK`, the skill shape plus `{ weeklyXP: number; recentActivity: XPTransaction[] }`.

Errors: `404 Not Found` / `403 Forbidden` (not found vs. not owned).

### `PATCH /skills/:id`

Partially update a skill. Body is `UpdateSkillDto = PartialType(CreateSkillDto)` — every
`CreateSkillDto` field, all optional, same validation constraints as create.

```ts
{
  name?: string;         // 2-40 chars
  attributeId?: string;  // @IsUUID; if present, must be one of the caller's own attributes
  description?: string;  // max 280 chars
  icon?: string;
}
```

Response: `200 OK` with the updated skill.

Errors: `404` / `403` for the skill itself; `404 Not Found` if a supplied `attributeId` isn't
owned by the caller.

### `DELETE /skills/:id`

Delete a skill. Cascades to its `QuestSkill`/`HabitSkill`/`GoalSkill` join rows and
`XPTransaction` rows at the database level (`onDelete: Cascade` in the Prisma schema).

Response: `200 OK` with `{ id: string; deleted: true }`.

Errors: `404` / `403`.

---

## Quests (`/quests`)

All routes require a Bearer token.

### `GET /quests`

List the caller's quests, newest first.

Query params:

| Param      | Type            | Notes                                   |
| ---------- | --------------- | ---------------------------------------- |
| `status`   | `QuestStatus`   | `ACTIVE` \| `COMPLETED` \| `ARCHIVED`. Filters exactly. |
| `goalId`   | `string`        | Filter to quests linked to this goal.    |
| `category` | `QuestCategory` | `DAILY` \| `WEEKLY` \| `LONG_TERM` \| `SYSTEM`. Filters exactly - "Quest Board" grouping, see below. |

Before listing, ensures the caller has an up-to-date auto-generated `SYSTEM`-category quest (see
"Quest Board System quests" below) - so every `GET /quests` call, regardless of filters, can
create one as a side effect if none exists from the last 7 days.

Response: `200 OK`, array of `Quest`:

```ts
{
  id: string;
  userId: string;
  goalId: string | null;
  title: string;
  description: string | null;
  type: 'ONE_TIME' | 'RECURRING' | 'DEADLINE' | 'MILESTONE';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EPIC' | 'LEGENDARY';
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  category: 'DAILY' | 'WEEKLY' | 'LONG_TERM' | 'SYSTEM';  // "Quest Board" grouping - see below
  xpReward: number;
  deadline: string | null;
  completedAt: string | null;
  lastCompletedAt: string | null;   // last completion date, RECURRING quests only
  createdAt: string;
  updatedAt: string;
  skills: Skill[];                  // flattened from the questSkills join table
  skillRewardOverrides: Array<{ skillId: string; amount: number }>;  // "XP Bundles" - see below
  attributeBonuses: Array<{ attributeId: string; attributeName: string; amount: number }>;
  goal: { id: string; title: string } | null;
  completedToday: boolean;          // derived: for RECURRING quests, lastCompletedAt is today;
                                     // for others, status === 'COMPLETED'
  // "Level-gated quests" - see below:
  isLocked: boolean;                 // true if any requirement is unmet; a locked quest is never hidden
  requirements: Array<{
    type: 'LEVEL_THRESHOLD' | 'ACTIVITY_COUNT' | 'ACHIEVEMENT' | 'QUEST_COMPLETED' | 'GOAL_COMPLETED';
    description: string;             // human-readable, e.g. "Character Level 5", "Complete 20 Running activities"
    met: boolean;
    progress?: { current: number; target: number };  // present for LEVEL_THRESHOLD/ACTIVITY_COUNT only
  }>;
  // "Reward claiming" - see below:
  unclaimedCompletions: number;      // count of completions that happened but haven't had their reward claimed
}
```

### `POST /quests`

Create a quest, optionally linked to a goal and/or tagged with skills.

Request body (`CreateQuestDto`):

```ts
{
  title: string;          // 2-120 chars
  description?: string;   // max 500 chars
  type?: QuestType;              // default 'ONE_TIME'
  difficulty?: QuestDifficulty;  // default 'MEDIUM'
  category?: QuestCategory;      // default 'LONG_TERM' - "Quest Board" grouping, see below
  xpReward?: number;      // int, >= 1. Defaults from difficulty if omitted (see DIFFICULTY_XP below)
  goalId?: string;        // @IsUUID, must be a goal owned by the caller
  skillIds?: string[];    // each @IsUUID, must all be skills owned by the caller
  skillRewardOverrides?: Array<{ skillId: string; amount: number }>;  // "XP Bundles" - see below
  attributeBonuses?: Array<{ attributeId: string; amount: number }>;
  deadline?: string;      // @IsISO8601
  requirements?: QuestRequirementDto[];  // "level-gated quests" - see below
}
```

**"Level-gated quests" — `requirements`:** an optional list of prerequisites the quest is locked
behind until every one is met (never partial - `isLocked` is `true` if *any* requirement is
unmet). Omitting it (or passing `[]`) makes the quest immediately available, matching behavior
before this feature existed. Each `QuestRequirementDto`:

```ts
{
  type: 'LEVEL_THRESHOLD' | 'ACTIVITY_COUNT' | 'ACHIEVEMENT' | 'QUEST_COMPLETED' | 'GOAL_COMPLETED';
  skillId?: string;          // LEVEL_THRESHOLD (skill-level check) or ACTIVITY_COUNT (required)
  attributeId?: string;      // LEVEL_THRESHOLD (attribute-level check) - mutually exclusive with skillId
  level?: number;            // LEVEL_THRESHOLD target level
  count?: number;            // ACTIVITY_COUNT target count
  achievementId?: string;    // ACHIEVEMENT
  requiredQuestId?: string;  // QUEST_COMPLETED - a specific other quest, not "any quest"
  requiredGoalId?: string;   // GOAL_COMPLETED - a specific goal, not "any goal"
}
```

Omitting both `skillId` and `attributeId` on a `LEVEL_THRESHOLD` requirement checks the
*character's* level. Only the fields relevant to `type` need be set; which combination is
required per type is a service-level check (`QuestsService.validateRequirements`), not a
decorator-level DTO rule - see `docs/gameplay-systems.md` for the full mechanics.

**"Quest Board" — `category` and System quests:** every quest has a `category`
(`DAILY`/`WEEKLY`/`LONG_TERM`/`SYSTEM`), defaulting to `LONG_TERM` if omitted. `SYSTEM` quests are
normally auto-generated, not created via this endpoint - every `GET /quests` call ensures the
caller has one from the last 7 days, targeting their most-neglected attribute (lowest XP earned in
that attribute over the trailing 7 days), tagged with one of the caller's own skills under it. If
the caller has no skills anywhere yet, no `SYSTEM` quest is generated (nothing sensible to tag).
Nothing stops a caller from creating their own `SYSTEM`-category quest via this endpoint too -
`category` isn't restricted by type. See `docs/gameplay-systems.md` for the full heuristic (shared
with Daily/Weekly Challenges).

If `xpReward` is omitted, it is derived from `difficulty` via a fixed table
(`DIFFICULTY_XP` in `backend/src/common/leveling.ts`):

| Difficulty  | Default XP |
| ----------- | ---------- |
| EASY        | 25         |
| MEDIUM      | 50         |
| HARD        | 100        |
| EPIC        | 250        |
| LEGENDARY   | 500        |

**"XP Bundles" — `skillRewardOverrides` and `attributeBonuses`:** both fields are optional and
additive; omitting them fully reproduces pre-Bundle behavior (every tagged skill earns the flat
`xpReward`, no attribute-only bonus). `skillRewardOverrides` gives one of the *currently-tagged*
skills (`skillIds`) its own reward amount instead of inheriting `xpReward` — each `skillId` must
appear in `skillIds`, or the request is rejected. `attributeBonuses` awards bonus XP straight to
an attribute the caller owns, independent of any tagged skill (e.g. a "Gym Session" quest tagged
with a Strength skill that also nudges Discipline). Identical fields exist on `CreateHabitDto`
and `CreateGoalDto` below. See `docs/gameplay-systems.md` for the full mechanics.

Response: `201 Created` with the new `Quest`.

Errors: `404 Not Found` if `goalId`, any `skillIds` entry, any `attributeBonuses[].attributeId`, or
any `requirements[].skillId`/`attributeId`/`achievementId`/`requiredQuestId`/`requiredGoalId` isn't
owned by the caller (or doesn't exist, for `achievementId`); `400 Bad Request` if a
`skillRewardOverrides[].skillId` isn't in `skillIds`, if any override/bonus `amount` is not a
positive integer, or if a requirement is missing the fields its `type` needs (e.g.
`LEVEL_THRESHOLD` without a `level`, or with both `skillId` and `attributeId` set).

### `GET /quests/:id`

Response: `200 OK` with a single `Quest`.

Errors: `404` / `403`.

### `PATCH /quests/:id`

Partially update a quest. Body is `UpdateQuestDto = PartialType(CreateQuestDto) & { status? }`:

```ts
{
  title?: string;
  description?: string;
  type?: QuestType;
  difficulty?: QuestDifficulty;
  category?: QuestCategory;  // "Quest Board" grouping
  xpReward?: number;
  goalId?: string;         // if present (non-null), must be owned by caller
  skillIds?: string[];     // if present, fully replaces the quest's skill tags
  skillRewardOverrides?: Array<{ skillId: string; amount: number }>;  // if present, fully replaces the overrides
  attributeBonuses?: Array<{ attributeId: string; amount: number }>;  // if present, fully replaces the bonuses
  deadline?: string;
  requirements?: QuestRequirementDto[];  // if present, fully replaces the requirements - see POST /quests
  status?: QuestStatus;    // 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' - direct status write, bypasses XP flow
}
```

Response: `200 OK` with the updated `Quest`.

Errors: `404` / `403` for the quest; `404 Not Found` for an unowned `goalId`, `skillIds`,
`attributeBonuses[].attributeId`, or `requirements[]` reference; `400 Bad Request` if a
`skillRewardOverrides[].skillId` isn't in the quest's (possibly just-updated) `skillIds`, if any
override/bonus `amount` is not a positive integer, if a requirement is missing fields its `type`
needs, or if a `QUEST_COMPLETED` requirement's `requiredQuestId` is this same quest's own `id`
("a quest cannot require itself").

Note: setting `status: 'COMPLETED'` via `PATCH` does **not** award XP or run the completion
workflow — only `POST /quests/:id/complete` does that.

### `POST /quests/:id/complete`

Marks a completion - creates a `QuestCompletion` row - but does **not** award XP. A separate
claim step (`POST /quests/:id/claim`, below) does that. This is the roadmap's `COMPLETED →
REWARD CLAIMED` state, scoped to quests only (habits/goals keep the instant-reward flow).

- `ONE_TIME` / `DEADLINE` / `MILESTONE` quests: can only be completed once; sets
  `status: 'COMPLETED'`, `completedAt: now()` (`QuestCompletion.periodKey: "once"`).
- `RECURRING` quests: can be completed once per calendar day (UTC day key); sets
  `lastCompletedAt: now()` each time, `status` is untouched (`QuestCompletion.periodKey` is that
  day's key) - a recurring quest can accumulate more than one unclaimed completion if the caller
  doesn't claim every day.

Response: `200 OK`:

```ts
{
  quest: Quest;              // updated quest - see GET /quests for the shape, including unclaimedCompletions
  completion: {
    id: string;
    questId: string;
    userId: string;
    periodKey: string;
    completedAt: string;
    claimedAt: string | null;  // always null in this response - nothing has been claimed yet
  };
}
```

Errors:
- `404 Not Found` / `403 Forbidden` — quest doesn't exist / isn't owned by the caller.
- `400 Bad Request` — quest `status === 'ARCHIVED'`, or the quest is locked (`isLocked: true` -
  `"Quest is locked - requirements not yet met"`).
- `409 Conflict` — already completed for this period (`"Quest already completed"` for one-time
  types, or `"Quest already completed today"` for `RECURRING` quests completed earlier the same
  day).

### `POST /quests/:id/claim`

Claims every not-yet-claimed completion for this quest (there can be more than one for a
recurring quest not claimed in a few days), running the shared completion workflow (XP award,
level checks, character streak, achievement checks — see "CompletionResult shape" below) once per
completion, so the XP ledger keeps one event per actual completion rather than summing them.
Re-reads the quest's *current* `xpReward`/tagged skills/XP Bundle config at claim time rather than
a snapshot from when it was completed - see `docs/gameplay-systems.md`.

Response: `200 OK` with `CompletionResult[]` - one entry per completion claimed, in the order they
were completed.

Errors:
- `404 Not Found` / `403 Forbidden` — quest doesn't exist / isn't owned by the caller.
- `409 Conflict` — `"No pending reward to claim for this quest"` if `unclaimedCompletions === 0`.

### `DELETE /quests/:id`

Response: `200 OK` with `{ id: string; deleted: true }`.

Errors: `404` / `403`.

---

## Habits (`/habits`)

All routes require a Bearer token.

### `GET /habits`

List all of the caller's habits, oldest first, each annotated with whether it's already been
completed today (via a `HabitCompletion` row keyed on today's UTC day).

Response: `200 OK`, array of `Habit`:

```ts
{
  id: string;
  userId: string;
  title: string;
  description: string | null;
  frequency: 'DAILY' | 'DAYS_OF_WEEK' | 'TIMES_PER_WEEK' | 'MONTHLY';
  daysOfWeek: number[];      // 0-6, only meaningful when frequency === 'DAYS_OF_WEEK'
  timesPerWeek: number | null;
  timeOfDay: string | null;  // "HH:mm"
  xpReward: number;
  isActive: boolean;
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
  updatedAt: string;
  skills: Skill[];           // flattened from the habitSkills join table
  skillRewardOverrides: Array<{ skillId: string; amount: number }>;  // "XP Bundles" - see POST /quests
  attributeBonuses: Array<{ attributeId: string; attributeName: string; amount: number }>;
  completedToday: boolean;   // derived from HabitCompletion for today's periodKey
}
```

### `POST /habits`

Request body (`CreateHabitDto`):

```ts
{
  title: string;           // 2-120 chars
  description?: string;    // max 500 chars
  frequency?: HabitFrequency;  // default 'DAILY'
  daysOfWeek?: number[];   // each int in [0, 6]
  timesPerWeek?: number;   // int, 1-14
  timeOfDay?: string;      // "HH:mm", 24-hour, matches /^([01]\d|2[0-3]):[0-5]\d$/
  xpReward?: number;       // int, >= 1. Default 10 if omitted
  skillIds?: string[];     // each @IsUUID, must be owned by the caller
  skillRewardOverrides?: Array<{ skillId: string; amount: number }>;  // "XP Bundles" - see POST /quests
  attributeBonuses?: Array<{ attributeId: string; amount: number }>;
}
```

Response: `201 Created` with the new `Habit` (`completedToday: false`).

Errors: `404 Not Found` if any `skillIds` entry or `attributeBonuses[].attributeId` isn't owned by
the caller; `400 Bad Request` if a `skillRewardOverrides[].skillId` isn't in `skillIds`, or if any
override/bonus `amount` is not a positive integer.

### `PATCH /habits/:id`

Body is `UpdateHabitDto = PartialType(CreateHabitDto) & { isActive?: boolean }`:

```ts
{
  title?: string;
  description?: string;
  frequency?: HabitFrequency;
  daysOfWeek?: number[];
  timesPerWeek?: number;
  timeOfDay?: string;
  xpReward?: number;
  skillIds?: string[];   // if present, fully replaces the habit's skill tags
  skillRewardOverrides?: Array<{ skillId: string; amount: number }>;  // if present, fully replaces the overrides
  attributeBonuses?: Array<{ attributeId: string; amount: number }>;  // if present, fully replaces the bonuses
  isActive?: boolean;    // pause/resume the habit
}
```

Response: `200 OK` with the updated `Habit`.

Errors: `404` / `403` for the habit; `404 Not Found` for an unowned `skillIds` or
`attributeBonuses[].attributeId` entry; `400 Bad Request` if a `skillRewardOverrides[].skillId`
isn't in the habit's (possibly just-updated) `skillIds`, or if any override/bonus `amount` is not
a positive integer.

### `DELETE /habits/:id`

Response: `200 OK` with `{ id: string; deleted: true }`.

Errors: `404` / `403`.

### `POST /habits/:id/complete`

Record a completion for the current period (day) and run the shared completion workflow.
Duplicate completion in the same UTC day is prevented at the database level via a unique
constraint on `HabitCompletion[habitId, periodKey]`, checked before any XP is awarded. Also
updates the habit's own `currentStreak`/`longestStreak` (independent of the character-level
streak tracked by `ProgressionService`).

Response: `200 OK` with a `CompletionResult`.

Errors:
- `404 Not Found` / `403 Forbidden` — habit doesn't exist / isn't owned by the caller.
- `400 Bad Request` — `"Habit is not active"` if `isActive` is `false`.
- `409 Conflict` — `"Habit already completed for this period"` if already completed today.

---

## Goals (`/goals`)

All routes require a Bearer token.

### `GET /goals`

List the caller's goals, newest first.

Query params:

| Param    | Type         | Notes                                              |
| -------- | ------------ | --------------------------------------------------- |
| `status` | `GoalStatus` | `ACTIVE` \| `COMPLETED` \| `ABANDONED`. Filters exactly. |

Response: `200 OK`, array of `Goal`:

```ts
{
  id: string;
  userId: string;
  title: string;
  description: string | null;
  category: string | null;
  type: 'NUMERIC' | 'COMPLETION' | 'BINARY';
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  targetValue: number | null;
  currentValue: number;
  unit: string | null;
  xpReward: number;
  startDate: string;
  targetDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  skills: Skill[];             // flattened from the goalSkills join table
  skillRewardOverrides: Array<{ skillId: string; amount: number }>;  // "XP Bundles" - see POST /quests
  attributeBonuses: Array<{ attributeId: string; attributeName: string; amount: number }>;
  progressPercent: number;     // derived, 0-100, see rules below
}
```

`progressPercent` derivation:
- `BINARY` goals: `100` if `status === 'COMPLETED'`, else `0`.
- `COMPLETION` goals: `(count of linked quests with status COMPLETED) / targetValue * 100`,
  clamped to `[0, 100]`.
- `NUMERIC` goals: `currentValue / targetValue * 100`, clamped to `[0, 100]`.
- If `targetValue` is null or `<= 0` (and type isn't `BINARY`), `progressPercent` is `0`.

### `POST /goals`

Request body (`CreateGoalDto`):

```ts
{
  title: string;             // 2-120 chars
  description?: string;      // max 500 chars
  category?: string;         // max 60 chars
  type?: GoalType;            // default 'BINARY'
  targetValue?: number;       // >= 0. Required if type is 'NUMERIC' or 'COMPLETION' (400 if missing)
  unit?: string;               // max 20 chars
  targetDate?: string;         // @IsISO8601
  xpReward?: number;           // int, >= 1. Default 500 if omitted
  skillIds?: string[];         // each @IsUUID, must be owned by the caller
  skillRewardOverrides?: Array<{ skillId: string; amount: number }>;  // "XP Bundles" - see POST /quests
  attributeBonuses?: Array<{ attributeId: string; amount: number }>;
}
```

After creation, `AchievementsService.checkAndUnlock` is run directly (goal-creation-driven
achievements such as "Goal Setter" have no XP event to hang off, so they're checked here rather
than via the completion workflow) — any newly unlocked achievements raise notifications as a side
effect, but are not returned from this endpoint.

Response: `201 Created` with the new `Goal`.

Errors: `404 Not Found` for an unowned `skillIds` or `attributeBonuses[].attributeId` entry; `400
Bad Request` if `type` is `NUMERIC` or `COMPLETION` and `targetValue` is omitted, if a
`skillRewardOverrides[].skillId` isn't in `skillIds`, or if any override/bonus `amount` is not a
positive integer.

### `GET /goals/:id`

Response: `200 OK` with the goal shape plus `quests: Quest[]` — every quest linked to this goal
(`goalId === id`), newest first, raw Prisma rows (not the full serialized quest shape used by
`/quests`).

Errors: `404` / `403`.

### `PATCH /goals/:id`

Body is `UpdateGoalDto = PartialType(CreateGoalDto) & { status?: GoalStatus }`:

```ts
{
  title?: string;
  description?: string;
  category?: string;
  targetValue?: number;
  unit?: string;
  targetDate?: string;
  xpReward?: number;
  skillIds?: string[];   // if present, fully replaces the goal's skill tags
  skillRewardOverrides?: Array<{ skillId: string; amount: number }>;  // if present, fully replaces the overrides
  attributeBonuses?: Array<{ attributeId: string; amount: number }>;  // if present, fully replaces the bonuses
  status?: GoalStatus;   // 'ACTIVE' | 'COMPLETED' | 'ABANDONED' - direct status write, bypasses XP flow
}
// Note: `type` is inherited from PartialType(CreateGoalDto) in the DTO's type signature but the
// service's update() does not persist it - changing a goal's type after creation has no effect.
```

Response: `200 OK` with the updated `Goal`.

Errors: `404` / `403` for the goal; `404 Not Found` for an unowned `skillIds` or
`attributeBonuses[].attributeId` entry; `400 Bad Request` if a `skillRewardOverrides[].skillId`
isn't in the goal's (possibly just-updated) `skillIds`, or if any override/bonus `amount` is not a
positive integer.

### `POST /goals/:id/progress`

Report progress toward a goal. Only works on goals with `status === 'ACTIVE'`.

Request body (`ProgressGoalDto`):

```ts
{
  value: number; // @IsNumber
}
```

Behavior by goal type:
- `BINARY`: `value >= 1` marks the goal complete (`currentValue` becomes `1`); otherwise no
  change to `currentValue`.
- `NUMERIC` / `COMPLETION`: `currentValue` is set directly to `value`; the goal completes when
  `currentValue >= targetValue`.

When the goal newly completes, `status` becomes `COMPLETED`, `completedAt` is set, and the shared
completion workflow runs (`sourceType: 'GOAL_COMPLETION'`, `amount: goal.xpReward`).

Response: `200 OK`:

```ts
{
  goal: Goal;               // updated goal, same shape as GET /goals
  completion?: CompletionResult; // present only if this call just completed the goal
}
```

Errors: `404` / `403`; `400 Bad Request` — `"Goal is not active"` if `status !== 'ACTIVE'`.

### `DELETE /goals/:id`

Response: `200 OK` with `{ id: string; deleted: true }`.

Errors: `404` / `403`.

---

## Achievements (`/achievements`)

All routes require a Bearer token. There is no create/update/delete endpoint — achievement
*definitions* are seed data (`backend/prisma/seed.ts`); unlocking happens as a side effect of the
completion workflow / goal creation, not via a dedicated endpoint.

### `GET /achievements`

List every achievement definition in the system (not user-scoped), ordered by
`requirementValue` ascending.

Response: `200 OK`, array of `Achievement`:

```ts
{
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string | null;
  requirementType: 'LEVEL_REACHED' | 'STREAK_LENGTH' | 'QUESTS_COMPLETED' | 'GOALS_COMPLETED'
    | 'HABITS_COMPLETED' | 'SKILL_LEVEL_REACHED' | 'SKILL_ACTIVITY_COUNT' | 'GOALS_CREATED'
    | 'ATTRIBUTE_LEVEL_REACHED';
  requirementValue: number;
  skillName: string | null;      // only set for SKILL_LEVEL_REACHED / SKILL_ACTIVITY_COUNT
  attributeKey: string | null;   // only set for ATTRIBUTE_LEVEL_REACHED (and optionally the skill-scoped types)
  createdAt: string;
}
```

### `GET /achievements/unlocked`

List achievements the caller has unlocked, most recent first.

Response: `200 OK`, array of:

```ts
{
  id: string;
  userId: string;
  achievementId: string;
  unlockedAt: string;
  achievement: Achievement; // full nested achievement definition
}
```

---

## Notifications (`/notifications`)

In-app notifications (level up, achievement unlocks, etc.), created as a side effect of the
completion workflow / achievement engine — no create endpoint. All routes require a Bearer token.

### `GET /notifications`

List up to the 50 most recent notifications for the caller, newest first.

Query params:

| Param    | Type      | Notes                                                          |
| -------- | --------- | ---------------------------------------------------------------- |
| `unread` | `string`  | Pass the literal string `"true"` to return only unread notifications; any other value (or omission) returns all. |

Response: `200 OK`, array of:

```ts
{
  id: string;
  userId: string;
  type: 'HABIT_REMINDER' | 'QUEST_DEADLINE' | 'STREAK_WARNING' | 'LEVEL_UP' | 'ACHIEVEMENT_UNLOCK' | 'GOAL_MILESTONE';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}
```

### `PATCH /notifications/:id/read`

Mark a single notification read.

Response: `200 OK` with the updated notification.

Errors: `404 Not Found` if it doesn't exist, `403 Forbidden` if it isn't the caller's.

### `PATCH /notifications/read-all`

Mark all of the caller's unread notifications read.

Response: `200 OK` with a Prisma `updateMany` result: `{ count: number }`.

---

## Analytics (`/analytics`)

Read-only aggregation over the XP ledger (`XPTransaction`). All routes require a Bearer token.
All character-level aggregates filter `skillId: null, attributeId: null` to isolate the one
ledger row per completion event (as opposed to the per-skill/per-attribute mirror rows), so
totals aren't inflated by multi-skill quests/habits.

### `GET /analytics/overview`

Response: `200 OK`:

```ts
{
  level: number;
  currentXP: number;         // derived from totalXP
  xpForNextLevel: number;    // derived
  totalXP: number;
  xpThisWeek: number;        // sum of character-level XP transactions in the last 7 days
  activitiesCompleted: number; // count of QUEST_COMPLETION/HABIT_COMPLETION/GOAL_COMPLETION rows, all time
  currentStreak: number;
  longestStreak: number;
  mostImprovedSkill: string | null; // name of the skill with the most XP in the last 7 days
}
```

### `GET /analytics/xp`

Daily XP totals over a trailing window.

Query params:

| Param  | Type   | Notes                                                          |
| ------ | ------ | ----------------------------------------------------------------- |
| `days` | number | Optional, default `30`. Clamped to `[1, 365]`. Non-numeric input falls back to `30`. |

Response: `200 OK`, one entry per day in the range (including zero-XP days), ascending:

```ts
Array<{ date: string; amount: number }> // date is "YYYY-MM-DD"
```

### `GET /analytics/skills`

Per-skill XP snapshot for the caller, alphabetical by name.

Response: `200 OK`:

```ts
Array<{
  skillId: string;
  name: string;
  attributeKey: string;
  level: number;
  totalXP: number;
  weeklyXP: number; // sum of XP transactions on this skill in the last 7 days
}>
```

### `GET /analytics/attributes`

Per-attribute XP snapshot for the caller.

Response: `200 OK`:

```ts
Array<{
  attributeId: string;
  key: string;
  name: string;
  icon: string | null;
  level: number;
  totalXP: number;
  weeklyXP: number;
}>
```

### `GET /analytics/activity`

Daily activity-completion counts over a trailing window (a "GitHub-style" heatmap source).

Query params:

| Param  | Type   | Notes                                                          |
| ------ | ------ | ----------------------------------------------------------------- |
| `days` | number | Optional, default `84`. Clamped to `[1, 365]`. Non-numeric input falls back to `84`. |

Response: `200 OK`, one entry per day in the range:

```ts
Array<{ date: string; count: number }> // count of QUEST_COMPLETION/HABIT_COMPLETION/GOAL_COMPLETION events that day
```

### `GET /analytics/feed`

Recent character-level XP events (an activity feed), newest first, each annotated with the
human-readable title of its source quest/habit/goal when applicable.

Query params:

| Param   | Type   | Notes                                                    |
| ------- | ------ | ---------------------------------------------------------- |
| `limit` | number | Optional, default `15`. Clamped to `[1, 100]`. Non-numeric input falls back to `15`. |

Response: `200 OK`:

```ts
Array<{
  id: string;
  userId: string;
  skillId: null;
  attributeId: null;
  amount: number;
  sourceType: 'QUEST_COMPLETION' | 'HABIT_COMPLETION' | 'GOAL_COMPLETION' | 'ACHIEVEMENT_BONUS' | 'CORRECTION';
  sourceId: string | null;
  note: string | null;
  createdAt: string;
  sourceTitle: string | null; // the stored sourceName (see data-model.md), or null
}>
```

### `GET /analytics/xp-history`

A dedicated, groupable XP history: every row written by a single completion/correction is
reconstructed as one event, with a line per level of the cascade it touched (character, each
tagged skill, each of those skills' attributes). See `data-model.md` § `XPTransaction.eventId`
for how the grouping actually works, and `gameplay-systems.md` § "The centralised XP ledger" for
why `createdAt` isn't used for it.

Query params:

| Param        | Type   | Notes                                                                 |
| ------------ | ------ | ---------------------------------------------------------------------- |
| `sourceType` | string | Optional. One of `QUEST_COMPLETION` \| `HABIT_COMPLETION` \| `GOAL_COMPLETION` \| `ACHIEVEMENT_BONUS` \| `CORRECTION`. Invalid/omitted values are ignored (no filter). |
| `limit`      | number | Optional, default `20`. Clamped to `[1, 100]`.                         |
| `before`     | string | Optional ISO timestamp cursor - returns events strictly older than this, for "load more" pagination. Pass the last returned event's `createdAt`. |

Response: `200 OK`, newest first:

```ts
Array<{
  createdAt: string;
  sourceType: 'QUEST_COMPLETION' | 'HABIT_COMPLETION' | 'GOAL_COMPLETION' | 'ACHIEVEMENT_BONUS' | 'CORRECTION';
  sourceId: string | null;
  sourceName: string | null;
  note: string | null;
  lines: Array<{
    scope: 'CHARACTER' | 'SKILL' | 'ATTRIBUTE';
    label: string; // 'Character', or the skill/attribute's name
    amount: number;
  }>;
}>
```

---

## Friends (`/friends`)

Friend-request graph backing the leaderboard's comparison group. All routes require a Bearer
token. Friend lookup is by **exact username match** only (no search/typeahead). See
`docs/gameplay-systems.md` § "Friends & Leaderboard" for the full lifecycle rationale.

### `FriendProfile` shape

Another user's profile as returned in friend requests, the friends list, and (in a related but
distinct shape) the leaderboard — omits `email` and streak fields, which stay private to the
account owner (`backend/src/common/serializers/public-user.ts`, `toFriendProfile`):

```ts
{
  id: string;
  username: string;
  avatar: string | null;
  level: number;
  totalXP: number;
  currentXP: number;      // derived
  xpForNextLevel: number; // derived
}
```

### `GET /friends`

List the caller's accepted friends.

Response: `200 OK`, array of `FriendProfile & { friendshipId: string; friendSince: string | null }`.

### `GET /friends/suggestions`

Candidates for a "Suggested Friends" list: other users with no existing `Friendship` row against
the caller (any status, either direction) — never overlaps with someone already friended,
requested, or pending. Ranked by `totalXP` desc (then `username` asc) as a simple "notable
characters" proxy, since there's no mutual-friends graph to rank by.

Query params:

| Param   | Type   | Notes                                                          |
| ------- | ------ | ----------------------------------------------------------------- |
| `limit` | number | Optional, default `6`. Clamped to `[1, 20]`. Non-numeric input falls back to `6`. |

Response: `200 OK`, array of `FriendProfile`.

### `GET /friends/requests`

List the caller's pending friend requests, both directions, newest first.

Response: `200 OK`, array of:

```ts
{
  id: string;               // Friendship.id
  status: 'PENDING';
  direction: 'INCOMING' | 'OUTGOING'; // relative to the caller
  createdAt: string;
  user: FriendProfile;      // the OTHER user in the request
}
```

### `POST /friends/requests`

Send a friend request by exact username.

Request body (`CreateFriendRequestDto`):

```ts
{
  username: string; // 3-24 chars
}
```

Response: `201 Created`, same shape as one entry from `GET /friends/requests`
(`direction: 'OUTGOING'`).

Errors:
- `400 Bad Request` — sending a request to yourself.
- `404 Not Found` — no user with that username.
- `409 Conflict` — a `Friendship` row already exists between the two users in either direction
  (already friends, you already sent a request, or they already sent you one — the message
  distinguishes which).

### `POST /friends/requests/:id/accept`

Accept an incoming request. `:id` is the `Friendship.id`.

Response: `200 OK`, same shape as `POST /friends/requests` but `status: 'ACCEPTED'`.

Errors: `404 Not Found` if the request doesn't exist; `403 Forbidden` if the caller is not the
addressee; `400 Bad Request` if it's not `PENDING` (e.g. already accepted).

### `DELETE /friends/requests/:id`

Decline an incoming request or cancel an outgoing one — both are the same operation (delete a
`PENDING` row the caller is party to).

Response: `200 OK` with `{ id: string }`.

Errors: `404 Not Found`; `403 Forbidden` if the caller isn't the requester or addressee.

### `DELETE /friends/:id`

Remove an accepted friendship. `:id` is the `Friendship.id` (same as `friendshipId` from
`GET /friends`). Symmetric — the friendship disappears from both users' lists and leaderboard
groups.

Response: `200 OK` with `{ id: string }`.

Errors: `404 Not Found`; `403 Forbidden` if the caller isn't the requester or addressee.

---

## Leaderboard (`/leaderboard`)

Ranks the caller against their accepted friends (see Friends above for how that group is formed).
Requires a Bearer token.

### `GET /leaderboard`

Query params (`LeaderboardQueryDto`):

| Param | Type | Notes |
| --- | --- | --- |
| `metric` | `'LEVEL' \| 'ATTRIBUTE' \| 'XP'` | Optional, default `'LEVEL'`. |
| `attributeKey` | `AttributeKey` | Required when `metric = 'ATTRIBUTE'`, otherwise ignored/rejected. |
| `period` | `'DAY' \| 'WEEK' \| 'MONTH' \| 'YEAR' \| 'ALL_TIME'` | Required when `metric = 'XP'`, otherwise ignored/rejected. |

Response: `200 OK`, sorted descending by `value`, rank starting at 1:

```ts
Array<{
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  isCurrentUser: boolean;
  value: number;          // character level, attribute level, or XP earned - depends on metric
  characterLevel: number; // always the character level, for context even in ATTRIBUTE/XP modes
}>
```

Errors: `400 Bad Request` — `metric: 'ATTRIBUTE'` without a valid `attributeKey`, or
`metric: 'XP'` without a valid `period`.

Ranking rules and calendar-aligned period boundaries are documented in
`docs/gameplay-systems.md` § "Friends & Leaderboard", not repeated here.

---

## Admin (`/admin`)

Manual data-editing surface for the `/admin` frontend dashboard: users, XP/levels, friendships,
and achievements. Every route requires a Bearer token **and** `User.isAdmin === true` on the
caller - enforced by `AdminGuard`, which looks the flag up fresh from the database on every
request (not from a JWT claim), so revoking admin access takes effect immediately rather than
waiting for the token to expire. A non-admin caller gets `403 Forbidden` from every route below,
regardless of whether the resource it names exists.

There is no self-service way to become an admin - the first admin is set directly in the
database; after that, an existing admin can grant it to another account via
`PATCH /admin/users/:id`.

### `GET /admin/users`

List every user in the system.

Query params:

| Param | Type | Notes |
| --- | --- | --- |
| `search` | string | Optional, case-insensitive substring match against `username` OR `email`. |

Response: `200 OK`, array of `PublicUser` (see the Users section above - the admin view includes
`email` and `isAdmin`, same shape returned to the account owner themselves).

### `GET /admin/users/:id`

Full detail view for one user.

Response: `200 OK`, `PublicUser` plus:

```ts
{
  skillCount: number;
  friendCount: number;       // ACCEPTED friendships only
  attributes: Array<{ id: string; key: AttributeKey; name: string; level: number; totalXP: number }>;
  unlockedAchievements: Array<{ id: string; achievementId: string; unlockedAt: string; achievement: Achievement }>;
}
```

Errors: `404 Not Found`.

### `PATCH /admin/users/:id`

Edit any user's profile fields, or toggle their admin access.

Request body (`AdminUpdateUserDto`, all fields optional):

```ts
{
  username?: string;  // 3-24 chars, /^[a-zA-Z0-9_]+$/
  email?: string;      // @IsEmail
  avatar?: string;     // @IsUrl({ require_tld: false })
  isAdmin?: boolean;
}
```

Response: `200 OK` with the updated `PublicUser`.

Errors: `404 Not Found`; `409 Conflict` if `username`/`email` is already taken by another user;
`400 Bad Request` if the caller sets `isAdmin: false` on **their own** account (self-demotion is
blocked so an admin can't accidentally lock themselves out).

### `DELETE /admin/users/:id`

Delete any user account. Cascades to every dependent row (skills, quests, habits, goals,
attributes, XP ledger, friendships, notifications - `onDelete: Cascade` throughout the schema).

Response: `200 OK` with `{ id: string; deleted: true }`.

Errors: `404 Not Found`; `400 Bad Request` if the caller targets **their own** account
(self-deletion is blocked for the same reason as self-demotion above).

### `POST /admin/users/:id/xp`

Directly adjust a user's character XP, or one attribute's XP, via `XpService.applyCorrection` -
the same ledger-backed correction path documented in `docs/gameplay-systems.md`. Unlike normal
gameplay XP, the amount here **may be negative** (per the `XPTransaction.amount` field comment in
the schema); this is the first real consumer of the `CORRECTION` source type. A correction never
cascades: it touches exactly the character or exactly one named attribute, never both and never
any skills, since it isn't tied to completing anything.

Request body (`AdminAdjustXpDto`):

```ts
{
  amount: number;              // @IsInt - positive or negative, validated non-zero server-side
  attributeKey?: AttributeKey; // if set, adjusts this attribute directly instead of the character
  note?: string;                // max 280 chars, defaults to "Admin correction" if omitted
}
```

Response: `200 OK`:

```ts
{
  scope: 'CHARACTER' | 'ATTRIBUTE';
  attributeId?: string;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  totalXP: number; // clamped to a minimum of 0
}
```

Side effects: if the correction is character-scoped and causes a level-up, a `LEVEL_UP`
notification is raised (matching the normal completion workflow). `AchievementsService.checkAndUnlock`
always runs afterward, so a correction can unlock real achievements (e.g. `ATTRIBUTE_LEVEL_REACHED`).

Errors: `404 Not Found` — the user, or the named attribute for that user (all users have all 8, so
this only happens for a bad `attributeKey`, never a valid enum value); `400 Bad Request` if
`amount` resolves to `0`.

### `GET /admin/achievements`

List every achievement definition (same as `GET /achievements`, exposed here too so the admin UI
doesn't need a second auth path).

### `POST /admin/users/:id/achievements`

Force-unlock an achievement for a user, bypassing its condition entirely.

Request body (`AdminGrantAchievementDto`): `{ achievementId: string }` (`@IsUUID`).

Response: `201 Created`, a `UserAchievement` row with the nested `achievement`. Also raises an
`ACHIEVEMENT_UNLOCK` notification, same as an organically-unlocked achievement.

Errors: `404 Not Found` — user or achievement; `409 Conflict` — already unlocked.

### `DELETE /admin/users/:id/achievements/:achievementId`

Revoke a previously unlocked (organic or granted) achievement.

Response: `200 OK` with `{ userId: string; achievementId: string; revoked: true }`.

Errors: `404 Not Found` if the user hasn't unlocked that achievement.

### `GET /admin/friendships`

List every `Friendship` row in the system, any status, both parties resolved to
`{ id, username, avatar, level }`.

### `POST /admin/friendships`

Create a friendship between any two users by username, skipping the request/accept dance -
useful for wiring up test data. Runs the same both-direction duplicate check as the normal
`POST /friends/requests`.

Request body (`AdminCreateFriendshipDto`):

```ts
{
  requesterUsername: string;
  addresseeUsername: string;
  status?: 'PENDING' | 'ACCEPTED'; // defaults to ACCEPTED
}
```

Response: `201 Created`, an `AdminFriendship` (requester/addressee both resolved).

Errors: `404 Not Found` — either username; `400 Bad Request` — same user for both fields;
`409 Conflict` — a `Friendship` row already exists between them in either direction.

### `PATCH /admin/friendships/:id/accept`

Force-accept a `PENDING` friendship without going through the addressee.

Response: `200 OK`, the updated `AdminFriendship`.

Errors: `404 Not Found`; `400 Bad Request` if it's already `ACCEPTED`.

### `DELETE /admin/friendships/:id`

Remove any friendship (pending or accepted) between any two users.

Response: `200 OK` with `{ id: string; deleted: true }`.

Errors: `404 Not Found`.

---

## CompletionResult shape

`POST /quests/:id/complete`, `POST /habits/:id/complete`, and `POST /goals/:id/progress` (when
progress causes the goal to complete) all delegate to the shared
`ProgressionService.completeActivity` workflow
(`backend/src/progression/progression.types.ts`), and return (or embed) its result:

```ts
interface CompletionResult {
  xpGained: number;
  levelUp: boolean;
  newLevel: number;
  skillResults: Array<{ skillId: string; leveledUp: boolean; newLevel: number }>;
  attributeResults: Array<{ attributeId: string; leveledUp: boolean; newLevel: number }>;
  achievementsUnlocked: string[]; // achievement ids newly unlocked by this completion
  streak?: { currentStreak: number; longestStreak: number }; // character-level streak, present
                                                               // when the activity counts toward
                                                               // the daily streak (the default)
}
```

This one workflow is responsible for: creating the `XPTransaction` ledger rows (one
character-level row plus one per associated skill and one per that skill's attribute),
recalculating levels for the character/skills/attributes from cumulative XP, updating the
character's daily streak, running the achievement engine
(`AchievementsService.checkAndUnlock`), and raising any resulting notifications
(`LEVEL_UP`, `ACHIEVEMENT_UNLOCK`) — so every resource module gets identical behavior instead of
reimplementing it.

Endpoints returning a bare `CompletionResult` (`quests/:id/complete`, `habits/:id/complete`)
respond `200 OK` with the object above directly. `goals/:id/progress` wraps it as
`{ goal, completion? }` (see the Goals section) since a progress update doesn't always complete
the goal.

---

## Keeping this document in sync

This file is a hand-written mirror of `backend/src/**/*.controller.ts` and their DTOs. Whenever
an endpoint is added, removed, or its request/response shape changes (new/renamed/retyped DTO
field, new query param, new status code, new business rule), update this file in the same
change. Do not rely on the Swagger UI at `/api/docs` alone as the source of truth for other
developers — it documents decorated fields but not derived response fields (e.g.
`currentXP`/`xpForNextLevel`/`completedToday`/`progressPercent`) or business-rule side effects
described above.
