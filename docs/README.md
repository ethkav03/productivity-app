# Life RPG — Documentation

Detailed technical and product documentation for Life RPG, a gamified personal-development app
(Next.js + NestJS + Prisma + PostgreSQL). The root [`README.md`](../README.md) covers setup and
running the project; everything here goes deeper.

## Maintenance policy

**This documentation must be kept in sync with the code.** Whenever a change touches something a
document below describes, update that document in the same change - don't let `docs/` drift into
describing a past version of the app. See the "closing note" / "keeping this document accurate"
section at the bottom of each file for guidance on what specifically should trigger an update to
it.

## Map

| Document | Covers |
| --- | --- |
| [`architecture.md`](./architecture.md) | System overview, tech stack, repo layout, request-flow example, deployment. **Start here.** |
| [`data-model.md`](./data-model.md) | Every Prisma model, field, enum, and constraint - the database schema reference. |
| [`api-reference.md`](./api-reference.md) | Every REST endpoint: method, path, auth, request/response shapes, business-rule side effects. |
| [`backend.md`](./backend.md) | NestJS module map - what each module owns, imports, exports, and who depends on it. |
| [`gameplay-systems.md`](./gameplay-systems.md) | The core game mechanics in depth: the XP ledger, the attribute cascade, the leveling formula, the completion workflow, duplicate-prevention, the achievement engine, and the friends/leaderboard social layer. |
| [`frontend.md`](./frontend.md) | App Router routing structure, auth gating, the onboarding wizard, shared hooks, navigation shell. |
| [`design-system.md`](./design-system.md) | Color tokens (light/dark), the attribute color palette, theming mechanism, shared UI component reference. |
| [`mvp-spec.md`](./mvp-spec.md) | The original MVP product specification this project was built from. |
| [`attribute-hierarchy-spec.md`](./attribute-hierarchy-spec.md) | The follow-up specification that introduced the 8-attribute hierarchy, plus notes on where the implementation deliberately diverges from it. |
| [`changelog.md`](./changelog.md) | Dated log of notable changes. |

## Reading order

New to the codebase? Read in this order: `architecture.md` → `mvp-spec.md` (product context) →
`data-model.md` → `gameplay-systems.md` → `api-reference.md` → `backend.md` → `frontend.md` →
`design-system.md`. Everything cross-links, so it's fine to jump around once you have the
architecture overview.
