# Life RPG

A gamified personal-development platform where real-world actions become character progression.

> **Your real life is the game.** Create goals, break them into quests and habits, complete
> them to earn XP, level up your character and individual skills, unlock achievements, and
> track it all with real analytics.

This is a full-stack implementation of the Life RPG MVP: a Next.js frontend, a NestJS/Prisma
backend, and PostgreSQL, wired together end-to-end (auth, gameplay loop, achievements engine,
analytics, notifications).

## Core gameplay loop

```
Goals → Quests / Habits → Complete them → XP → Skills level up → Character levels up
                                              ↓
                                       Achievements unlock
                                              ↓
                                          Analytics
```

## Tech stack

| Layer          | Technology                                              |
| -------------- | -------------------------------------------------------- |
| Frontend       | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| Data fetching  | TanStack Query                                            |
| Charts         | Recharts                                                   |
| Backend        | NestJS, TypeScript                                         |
| ORM            | Prisma                                                      |
| Database       | PostgreSQL                                                  |
| Auth           | JWT (access + refresh tokens)                               |
| Infrastructure | Docker / docker compose                                     |

## Project structure

```
backend/
  prisma/schema.prisma      Full data model (User, Skill, Goal, Quest, Habit,
                             XPTransaction, Achievement, Notification, ...)
  prisma/seed.ts             Seeds the 11 default achievement definitions
  src/
    auth/                    Register / login / refresh (JWT)
    users/                   Profile (GET/PATCH /users/me)
    skills/                  Skill CRUD + suggestions + XP/level detail
    xp/                      Centralised XP ledger (XpService.awardXp) - every
                              XP grant in the app goes through here as an
                              immutable transaction, never a direct increment
    progression/             Orchestrates "complete an activity": XP award →
                              level check → character streak → achievement
                              check → notifications. Quests/Habits/Goals call
                              this instead of duplicating the workflow.
    achievements/             Data-driven achievement engine (conditions are
                              evaluated against live stats / the XP ledger,
                              not hard-coded per achievement)
    notifications/            In-app notifications (level up, achievement
                              unlocks, etc.)
    quests/ habits/ goals/    Resource modules for the three activity types
    analytics/                Read-only aggregation across the XP ledger
frontend/
  app/                        Next.js App Router pages (onboarding, dashboard,
                               skills, quests, habits, goals, achievements,
                               analytics, settings, auth)
  src/lib/api/                Typed API client functions, one file per resource
  src/lib/types.ts            Shared TypeScript types mirroring the backend
  src/hooks/                  useAuth, useCelebration (XP/level-up/achievement
                               toasts), useTheme
  src/components/             Design system (Button, Card, Modal, ProgressBar,
                               PillSelect, ...) and the app shell/navigation
docker-compose.yml            Postgres + backend + frontend
```

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres, or the full docker compose stack)

## Quick start (Docker, everything included)

```bash
docker compose up --build
```

This starts Postgres, runs migrations + seeds achievements, and starts both the API
(`http://localhost:3001/api`) and the web app (`http://localhost:3000`).

## Local development (recommended while iterating)

1. **Install dependencies** (installs both workspaces from the repo root):

   ```bash
   npm install
   ```

2. **Start Postgres** (only the database in Docker):

   ```bash
   docker compose up -d db
   ```

   > This maps Postgres to **host port 5433** (not 5432), to avoid clashing with any
   > Postgres you may already have installed locally. Inside Docker, services talk to
   > each other on the standard 5432.

3. **Configure environment variables**:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   ```

4. **Run migrations and seed achievement definitions**:

   ```bash
   cd backend
   npx prisma migrate dev
   npx prisma db seed
   cd ..
   ```

5. **Start both apps** (from the repo root, in separate terminals):

   ```bash
   npm run dev:backend    # http://localhost:3001/api  (Swagger docs at /api/docs)
   npm run dev:frontend   # http://localhost:3000
   ```

6. Open `http://localhost:3000`, register an account, and walk through onboarding.

## Environment variables

**backend/.env**

| Variable               | Description                                   |
| ----------------------- | ---------------------------------------------- |
| `PORT`                  | API port (default `3001`)                      |
| `DATABASE_URL`          | Postgres connection string                     |
| `JWT_ACCESS_SECRET`     | Signing secret for access tokens               |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime (default `15m`)          |
| `JWT_REFRESH_SECRET`    | Signing secret for refresh tokens              |
| `JWT_REFRESH_EXPIRES_IN`| Refresh token lifetime (default `30d`)         |
| `CORS_ORIGIN`           | Allowed frontend origin                        |

**frontend/.env.local**

| Variable               | Description               |
| ----------------------- | -------------------------- |
| `NEXT_PUBLIC_API_URL`   | Backend API base URL       |

## Key design decisions

- **Centralised XP ledger.** Every XP grant (quest/habit/goal completion) creates an
  immutable `XPTransaction` row rather than incrementing a counter directly. One
  character-level row plus one row per associated skill, so history is fully auditable and
  can't be double-counted.
- **A single completion workflow.** `ProgressionService.completeActivity` is the one place
  that awards XP, recalculates levels, updates the character's daily streak, checks
  achievements, and raises notifications - every resource module calls into it instead of
  reimplementing the flow.
- **Data-driven achievements.** Achievement conditions (`LEVEL_REACHED`, `STREAK_LENGTH`,
  `QUESTS_COMPLETED`, `SKILL_ACTIVITY_COUNT`, ...) are evaluated against live stats and the
  XP ledger, so adding a new achievement is a seed-data change, not a code change.
- **Duplicate-completion safety.** One-time quests can't be completed twice; recurring
  quests and habits are gated to once per calendar day via a database unique constraint
  (`HabitCompletion` on `[habitId, periodKey]`), checked *before* any XP is awarded.

## API overview

Full interactive docs (Swagger) are served at `http://localhost:3001/api/docs` once the
backend is running. Everything is prefixed with `/api` and (aside from `/auth/*`) requires a
`Bearer` access token.

```
/auth        register, login, refresh, logout
/users       me (get/patch)
/skills      CRUD + suggestions
/quests      CRUD + complete
/habits      CRUD + complete
/goals       CRUD + progress
/achievements  list + unlocked
/notifications  list + mark read
/analytics   overview, xp, skills, activity, feed
```

## Scripts (repo root)

| Command                | Description                          |
| ------------------------ | ------------------------------------- |
| `npm run dev:backend`    | Start the NestJS API in watch mode    |
| `npm run dev:frontend`   | Start the Next.js dev server          |
| `npm run build`          | Build both apps                       |
| `npm run prisma:generate`| Regenerate the Prisma client          |
| `npm run prisma:migrate` | Run a Prisma migration                |
| `npm run prisma:seed`    | Seed achievement definitions          |
| `npm run docker:up`      | `docker compose up --build`           |
| `npm run docker:down`    | `docker compose down`                 |
