# Architecture Overview

High-level map of how Life RPG is put together. This is the entry point for understanding the
system as a whole; each linked document goes deep on one slice of it.

## Tech stack

| Layer | Technology | Where |
| --- | --- | --- |
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS | `frontend/` |
| Server state | TanStack Query | `frontend/src/lib/api/*`, page components |
| Charts | Recharts | `frontend/app/(app)/analytics/page.tsx` |
| Backend | NestJS, TypeScript | `backend/src/` |
| ORM | Prisma | `backend/prisma/schema.prisma` |
| Database | PostgreSQL | Docker container / any Postgres instance |
| Auth | JWT (access + refresh), `@nestjs/jwt` + `passport-jwt` | `backend/src/auth/` |
| Infrastructure | Docker / docker compose | `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` |

## Repository layout

```
productivuty-app/
├── backend/                 NestJS API (see docs/backend.md, docs/api-reference.md)
│   ├── prisma/               schema.prisma, migrations/, seed.ts
│   └── src/                  one directory per feature module
├── frontend/                 Next.js app (see docs/frontend.md, docs/design-system.md)
│   ├── app/                  App Router routes (route groups: (auth), (app), onboarding)
│   └── src/                  lib/ (api client, types), hooks/, components/
├── docs/                     you are here
├── docker-compose.yml        db + backend + frontend
├── package.json              npm workspaces root (backend, frontend)
└── README.md                 setup/run instructions (lighter-weight than docs/)
```

Root `package.json` declares an npm workspace over `backend` and `frontend`, so a single
`npm install` at the repo root installs both.

## System diagram

```
┌─────────────────────┐        HTTPS/JSON, Bearer JWT        ┌──────────────────────────┐
│   Next.js frontend    │  ───────────────────────────────▶  │      NestJS backend       │
│   (port 3000)          │  ◀───────────────────────────────  │      (port 3001, /api)     │
│                         │                                    │                            │
│  App Router pages       │                                    │  Controllers → Services    │
│  TanStack Query cache   │                                    │  → PrismaService           │
│  src/lib/api-client.ts  │                                    │                            │
│   (axios + auto-refresh)│                                    └─────────────┬──────────────┘
└─────────────────────┘                                                     │
                                                                              │ SQL
                                                                              ▼
                                                                   ┌───────────────────┐
                                                                   │ PostgreSQL          │
                                                                   │ (Docker, port 5433  │
                                                                   │  on host)            │
                                                                   └───────────────────┘
```

The frontend never talks to Postgres directly - all data access goes through the NestJS REST
API. The API is stateless (JWT-based auth, no server-side sessions), so any number of backend
instances could sit behind a load balancer without shared session state (not currently deployed
that way, but the design doesn't preclude it).

## Request flow example: completing a quest

This is the app's most representative end-to-end flow - see
[`gameplay-systems.md`](./gameplay-systems.md) for the full mechanics.

1. **Frontend**: user clicks "Complete" on a quest card (`frontend/app/(app)/quests/page.tsx`).
   A TanStack Query mutation calls `completeQuest(id)` (`frontend/src/lib/api/quests.ts`), which
   POSTs to `/quests/:id/complete` via the shared `apiClient` (attaches the access token, retries
   once through a silent refresh on 401 - `frontend/src/lib/api-client.ts`).
2. **Backend routing**: `QuestsController.complete` (guarded by `JwtAuthGuard`) receives the
   request and calls `QuestsService.complete(userId, questId)`.
3. **Backend business logic**: `QuestsService` validates ownership and completion state (the
   state-changing write happens *before* any XP is awarded, to make duplicate requests safe),
   then delegates to `ProgressionService.completeActivity`, which calls `XpService.awardXp`
   (writes immutable `XPTransaction` rows and recalculates levels for the character, the quest's
   skills, and those skills' attributes), updates the character's daily streak, checks
   `AchievementsService.checkAndUnlock`, and returns a `CompletionResult`.
4. **Response**: the `CompletionResult` (`{ xpGained, levelUp, newLevel, skillResults[],
   attributeResults[], achievementsUnlocked[], streak? }`) flows back to the frontend.
5. **Frontend reaction**: the mutation's `onSuccess` invalidates the relevant TanStack Query
   caches (quests, achievements, analytics), calls `refreshUser()` to update the header's
   level/XP, and passes the `CompletionResult` to `useCelebration()`, which fires a sequence of
   toasts (XP gained, level up, skill/attribute level-ups, achievement unlocks).

## Deployment

`docker-compose.yml` defines three services:

- **`db`** — `postgres:16-alpine`, host port **5433** (chosen to avoid clashing with a
  locally-installed Postgres on the default 5432), a named volume for data.
- **`backend`** — builds `backend/Dockerfile` (multi-stage: install → `prisma generate` →
  `nest build` → slim runtime image), runs `prisma migrate deploy` then seeds achievements then
  starts the server, on port 3001.
- **`frontend`** — builds `frontend/Dockerfile`, runs the Next.js production server on port 3000.

`docker compose up --build` brings up all three. For local iteration, `docker compose up -d db`
plus running `npm run dev:backend` / `npm run dev:frontend` from the host is faster (hot reload).
See the root `README.md` for the full setup walkthrough and environment variable reference.

## Where to go next

| Question | Document |
| --- | --- |
| What does the product actually do, feature by feature? | [`mvp-spec.md`](./mvp-spec.md) |
| Why does the attribute/skill hierarchy exist? | [`attribute-hierarchy-spec.md`](./attribute-hierarchy-spec.md) |
| What's the exact database schema? | [`data-model.md`](./data-model.md) |
| What's every API endpoint's request/response shape? | [`api-reference.md`](./api-reference.md) |
| How is the backend's module graph organized? | [`backend.md`](./backend.md) |
| How does XP/leveling/achievements/streaks actually work? | [`gameplay-systems.md`](./gameplay-systems.md) |
| How is the frontend routed and structured? | [`frontend.md`](./frontend.md) |
| What are the design tokens and shared UI components? | [`design-system.md`](./design-system.md) |
| What's changed over time? | [`changelog.md`](./changelog.md) |

## Keeping this document accurate

This file should change rarely (it's the stable high-level picture) but must be revisited
whenever: a new top-level service/deployment target is added, the request-flow example's
sequence changes, or the repository layout is reorganized. Day-to-day feature work almost always
belongs in one of the more specific documents listed above instead.
