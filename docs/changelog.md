# Changelog

Dated log of notable changes to Life RPG. This is a narrative history for orientation ("what
changed and why"), not a replacement for `git log` - see git history for exact diffs and commit
messages.

## 2026-07-20 — Admin dashboard

Added a `/admin` dashboard for manually editing anything in the app: users (profile fields,
toggle admin access, delete), XP/levels (character and per-attribute, independently), friendships
(create/accept/delete for any pair of users, not just the caller's own), and achievements
(force-grant/revoke, bypassing the condition engine). Gated by a new `User.isAdmin` field
(migration `20260720120000_admin_users`) checked fresh from the database on every request
(`AdminGuard`), not from a JWT claim, so revoking access takes effect immediately. New backend
module `admin/`; new frontend route `app/admin/` (own minimal layout, not `AppShell`), reachable
via a conditional link in the Topbar account menu.

XP/level edits reuse the existing `XPTransaction` ledger rather than writing `totalXP`/`level`
directly: added `XpService.applyCorrection`, the first real use of the `CORRECTION` source type
and the only path where the ledger's `amount` can be negative (per the field's own doc comment,
previously unimplemented). A correction never cascades - it touches exactly the character or
exactly one named attribute, never both and never any skills - and still runs
`AchievementsService.checkAndUnlock` afterward, so admin-granted levels can unlock real
achievements the same as organic play.

Used the new admin API to seed 5 persistent test accounts with deliberately varied attribute
profiles and a mixed friend graph (accepted / pending / unconnected) for manual UI testing -
`physical_pete`, `brainy_bea`, `disciplined_drew`, `social_sam`, `wealthy_wren`
(password `TestPass123!` for all). Not part of the codebase or a migration - just data in the dev
database, mentioned here for context, not tracked as a "feature."

## 2026-07-20 — Suggested Friends

Added a "Suggested Friends" section to the leaderboard's Manage Friends modal: `GET
/friends/suggestions` (`FriendsService.getSuggestions`) returns other users with no existing
`Friendship` row against the caller (any status, either direction), ranked by `totalXP` desc as a
simple "notable characters" proxy. Each suggestion gets an inline "Add" button that sends a
request directly (reuses the same mutation as the manual add-by-username form) and disappears
from suggestions once requested, via the same `['friends']` query-key invalidation already used
elsewhere in the modal.

## 2026-07-20 — Friends & Leaderboard

Added a social layer: friend requests and a leaderboard ranking the caller against their accepted
friends. New backend modules `friends/` (`Friendship` model + `FriendshipStatus` enum, migration
`20260720104302_friendships`; send/accept/decline/list/remove, exact-username lookup, no
`DECLINED` status - a decline/cancel/unfriend is just deleting the row) and `leaderboard/`
(`GET /leaderboard?metric=LEVEL|ATTRIBUTE|XP&attributeKey=&period=`, reading `FriendsService`'s
group lookup rather than importing nothing - the one exception to the "read other domains'
tables directly" pattern `AnalyticsModule` otherwise established, because resolving a friend
group needs real requester/addressee branching logic worth centralizing). XP-period ranking uses
calendar-aligned boundaries (this UTC day/ISO week/month/year), deliberately different from the
rolling-7-day window `AnalyticsService` uses for personal stats - see
`docs/gameplay-systems.md` § "Friends & Leaderboard" for the full rationale.

New `toFriendProfile` serializer (`backend/src/common/serializers/public-user.ts`) renders another
user's profile back to the caller without their email/streaks, used by both the friends list and
leaderboard entries.

Frontend: new `/leaderboard` page - a three-way metric selector (Overall Level / Attribute /
XP Earned, the latter two with a sub-select), a top-3 podium (gold/silver/bronze, graceful with
fewer than 3 friends) with 4th-place-onward as a plain ranked list below it, and a "Manage
Friends" modal (add by username, accept/decline incoming, cancel outgoing, remove existing) with
an unread-incoming-request count badge on the button that opens it - reachable via a new
"Leaderboard" nav item (`Crown` icon). Verified end-to-end with three real friended test accounts
across all three metrics and all five XP periods, in both light and dark themes, via a headless
Playwright run with zero console/page errors.

## 2026-07-19 — Dashboard radar chart

Added a "Character Shape" radar chart to the dashboard, right below the header: one axis per
attribute (fixed order), a single primary-colored polygon for the character's own levels, and
each axis label tinted by its attribute's color (the polygon itself is one series - the
character - so it stays a single hue; only the axis identities get the categorical treatment,
consistent with how `AttributeDots` never colors a mark by more than the entity it represents).
Uses Recharts' `RadarChart` (already a dependency) and the existing `GET /analytics/attributes`
endpoint/`getAnalyticsAttributes()` client function - no new endpoint needed.

Fixed a real gap surfaced while building this: `AnalyticsService.attributeProgress` had no
`ORDER BY`, so its result order wasn't guaranteed to match the fixed attribute display order used
everywhere else - harmless for the existing grid layout (which doesn't depend on adjacency) but
would have made the new radar chart's axis order (and therefore its "shape") nondeterministic
between requests. Extracted the fixed order into a shared `ATTRIBUTE_KEY_ORDER` constant
(`backend/src/attributes/default-attributes.ts`) and sorted by it in both
`AttributesService.findAll` (already correct, now shares the constant instead of a local copy)
and `AnalyticsService.attributeProgress` (the actual fix).

## 2026-07-19 — `docs/` created

Added this documentation folder: `architecture.md`, `data-model.md`, `api-reference.md`,
`backend.md`, `gameplay-systems.md`, `frontend.md`, `design-system.md`, `mvp-spec.md`,
`attribute-hierarchy-spec.md`, and this changelog. Established the maintenance policy: update the
relevant doc in the same change whenever the code it describes changes.

## 2026-07-19 — Attribute color palette

Replaced skill-name badge lists on quest/habit/goal card previews with a compact `AttributeDots`
indicator (one deduplicated colored dot per attribute represented, named via tooltip - never
color as the only cue). Chose and validated an 8-color categorical palette for the attributes
using the project's dataviz-skill methodology (fixed hue order, CVD-safety and contrast validated
against this app's actual light/dark card surfaces via `scripts/validate_palette.js`, not picked
by eye). Applied the same palette to the Skills page attribute icons, the Analytics "Attribute
Progression" cards, and the Skill Progression bar chart (now colored per-bar by attribute, with a
legend). New files: `frontend/src/lib/attribute-colors.ts`,
`frontend/src/components/ui/attribute-dots.tsx`; new CSS custom properties `--attr-*` in
`frontend/app/globals.css` (light + dark). Backend: `AnalyticsService.skillProgress` now also
returns each skill's `attributeKey`.

## 2026-07-19 — Attribute hierarchy

Implemented the two-tier character-stat system from `attribute-hierarchy-spec.md`: added the
`Attribute` Prisma model and `AttributeKey` enum (8 fixed values), made `Skill.attributeId` a
required FK (skill-name uniqueness re-scoped from `[userId, name]` to
`[userId, attributeId, name]` so names like "Focus" can exist under multiple attributes),
extended `XPTransaction` with an optional `attributeId` so `XpService.awardXp` cascades XP from
skill → attribute in addition to skill → character. `AuthService.register` now auto-creates all
8 fixed attributes for every new user in the same DB transaction as the user row (attributes are
not opt-in, unlike skills). Rebuilt the default skill suggestion list
(`backend/src/skills/default-skills.ts`) from the spec's per-attribute tables (~77 skills across
8 attributes, replacing the MVP's original flat 12-skill list). Added the `ATTRIBUTE_LEVEL_REACHED`
achievement requirement type and two seeded achievements. New backend module: `attributes/`.
Frontend: Skills page now groups skills under their attribute (each with its own level/XP
header); onboarding's skill picker groups suggestions the same way with composite
`attributeKey:skillName` selection keys (since skill names aren't globally unique anymore); new
"Attribute Progression" section on the Analytics page; the earlier onboarding "starter quest"
content (added in a prior change, see below) had to be reworked because it was keyed to skill
names that no longer existed post-restructure - it's now keyed by attribute instead.

Every place that previously isolated "character-level" `XPTransaction` rows by filtering
`skillId: null` had to be updated to also filter `attributeId: null`, since attribute-level rows
also have `skillId: null` - this affected `AchievementsService.countCompletions` and most of
`AnalyticsService`. This is the single most important invariant introduced by this change; see
`gameplay-systems.md` § "The centralised XP ledger".

## 2026-07-19 — Onboarding starter quests

Added a curated skill → starter-quest-suggestion mapping so onboarding's "add activities" step
auto-populates a few starter quests (one per selected skill, capped at 4) instead of presenting a
blank form - still fully editable/removable, and users can still add their own. (Superseded later
the same day by the attribute hierarchy change above, which re-keyed this content by attribute
instead of skill name.)

## 2026-07-19 — Docker fixes

Fixed three issues surfaced by running `docker compose up --build` for the first time against the
Alpine-based backend image:

1. **Prisma engine crash on Alpine.** `node:20-alpine` ships no OpenSSL, so Prisma's engine
   binaries couldn't detect libssl and crashed at runtime ("Could not parse schema engine
   response"), not just the warning text suggested. Fixed by installing `openssl` in the image
   and pinning `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` in `schema.prisma`.
2. **Seed script crash.** `prisma db seed`'s `ts-node` invocation hit an unreliable ESM/CJS
   auto-detection in the container. Switched to running the already-compiled
   `dist/prisma/seed.js` with plain `node` instead.
3. **Wrong entrypoint path.** `nest build` compiles `src/` and `prisma/` together without a
   shared root, so output lands at `dist/src/main.js`, not `dist/main.js` as the Dockerfile
   assumed. Fixed in the Dockerfile `CMD`, the compose `command`, and `package.json`'s
   `start:prod`.

## 2026-07-19 — Initial full-stack build

Built the full MVP from `mvp-spec.md`: NestJS + Prisma + PostgreSQL backend and a Next.js +
Tailwind frontend, in a single npm-workspaces monorepo. Foundation (auth, users, skills, the
centralised XP ledger, the achievement engine, notifications, the `ProgressionService`
completion-workflow orchestrator) was built first and verified end-to-end against a real
Postgres database before fanning out the remaining resource modules (quests, habits, goals,
analytics) and frontend pages (onboarding, dashboard, skills, quests, habits, goals,
achievements, analytics, settings) in parallel. Verified with a real headless-browser run
covering registration → onboarding → dashboard → every page, with zero console/page errors.
Docker Compose (Postgres + backend + frontend) and the root `README.md` were added at the end of
this pass.

---

*Earlier history (if any existed before this changelog was created) is not reconstructed beyond
what's captured above - this changelog starts from the first `docs/` commit.*
