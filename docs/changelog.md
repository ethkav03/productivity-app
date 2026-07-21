# Changelog

Dated log of notable changes to Life RPG. This is a narrative history for orientation ("what
changed and why"), not a replacement for `git log` - see git history for exact diffs and commit
messages.

## 2026-07-21 — Seasons and Chapters (backend)

Backend slice of "Sprint 5: RPG Identity" (`docs/feature-roadmap.md`) - Phase 2 Features 9, 10,
13, 14. Third sprint committing straight to `master`.

While scoping this sprint, found that Feature 11 ("Titles and Perks") needs no new work at all -
it's exactly what Sprint 3's "Level-Up Rewards" already shipped under a different name (the
roadmap's own example titles are close matches for the seeded `title-beginner`/
`title-consistent` rewards). That freed the sprint to focus on the roadmap's actual "RPG
Identity" sprint grouping: character builds, skill trees, seasonal progression, and character
identity (Features 9, 10, 13, 14).

Added `Season` (migration `20260721090000_seasons`): a named chapter with a focus of one or more
attributes and a date range. Snapshots the user's character level and all 8 attribute levels at
creation (`startLevel`/`startAttributeLevels`) and again at close
(`endLevel`/`endAttributeLevels`), so a closed season's progress deltas stay meaningful forever
even as the user keeps leveling in later chapters - levels are never stored as a time series
elsewhere in this app, so a point-in-time snapshot is the only practical way to answer "what did
I accomplish this chapter" later. At most one `ACTIVE` season per user, enforced in
`SeasonsService` rather than the database; starting a new season auto-closes whichever one is
currently active first. For the active season, progress deltas are computed live against the
user's current state on every read instead of being cached - "what have I done so far" is always
fresh with no scheduled job needed. `Goal.seasonId` mirrors the pre-existing `Quest.goalId`/
`Habit.goalId` pattern, matching the roadmap's own season example (which lists specific goals as
part of a season's definition).

Character builds (Feature 9) and skill trees (Feature 10) are scoped as pure frontend
computations over data the API already returns (attribute levels, skill levels) - no backend
change for either, landing in the next slice. Feature 14 ("Identity System") is deliberately
deferred; the roadmap itself calls it long-term and synthesis-heavy, and it depends on season
history that doesn't exist yet. See `gameplay-systems.md` § "Seasons and Chapters (Feature 13)"
and `docs/feature-roadmap.md`'s Feature 9/10/14 deviation notes for the full reasoning.

Verified against a real running dev server: starting a season, earning XP and confirming its live
deltas update without any season-specific API call, linking a goal to it, starting a second
season and confirming the first auto-closes with frozen deltas, confirming exactly one season is
ever `ACTIVE`, manually closing without auto-starting a replacement, and rejecting a second close
- 21 assertions, all passing. (Also spent a chunk of this session restarting Docker Desktop,
the `db` container, and both dev servers after the machine went idle mid-sprint - unrelated to
the feature itself, noted here only because it explains the gap in commit timestamps.)

## 2026-07-21 — Better Goals: milestones and auto-progress (frontend)

Frontend slice of "Sprint 4: Better Goals" - Phase 1 Feature 8, closing out the sprint. Second
commit on top of the backend slice from the previous day.

Goal detail page gained a **Milestones** card: an ordered checklist with an inline add-form
(title + optional XP reward), a per-item toggle button (mirrors the Habits page's completion
circle), and a delete button. Toggling a milestone complete calls `useCelebration()` only when the
response includes a `completion` - a zero-`xpReward` milestone's response has none, so checking
off a plain checklist item stays silent, matching the backend's own "no XP call for a zero
reward" rule.

Also gained a **Linked Habits** card, mirroring the pre-existing Linked Quests card. For
`COMPLETION`-type goals, the "Log Progress" card's manual numeric input (a carryover from sharing
`NUMERIC`'s form, which never actually matched the read-only `progressPercent` shown above it) is
now a read-only note explaining that progress updates automatically - since it actually does, as
of yesterday's backend slice.

Habit creation modal gained a Goal picker, field-for-field identical to the quest modal's; a habit
linked to a goal shows a "part of: {goal}" badge on its row, matching how linked quests already
display theirs.

Verified against real running dev servers - after this session's machine went idle overnight,
restarted Docker Desktop, the `db` container, and both dev servers from scratch. A Playwright pass
(light and dark themes) drove the actual UI: creating a habit linked to a goal via the modal,
adding and completing a milestone with an XP reward, and completing a quest linked to a
`COMPLETION`-type goal to confirm the goal auto-completed without any manual progress call - 18
assertions, all passing.

## 2026-07-20 — Better Goals: milestones and auto-progress (backend)

Backend slice of "Sprint 4: Better Goals" (`docs/feature-roadmap.md`) - Phase 1 Feature 8.
Continues committing straight to `master`, on top of Sprint 3's two commits earlier the same day.

Added `GoalMilestone` (migration `20260720210000_better_goals`): an ordered checklist item within
a goal, optionally carrying its own small XP reward (`xpReward`, default `0`). Marking one
complete only runs the XP-award workflow (`sourceType: 'MILESTONE_COMPLETION'`, new on
`XPSourceType`) when `xpReward > 0` - a plain checklist item skips it entirely, avoiding a
zero-amount ledger row. Un-completing a milestone doesn't claw back any XP already awarded, same
as every other completion flow in the app. Full CRUD under `/goals/:id/milestones`.

Added `Habit.goalId` (nullable FK, same migration), mirroring `Quest.goalId` field-for-field -
"goal↔habit relationships." Deliberately organizational only: a linked habit is never counted
toward a `COMPLETION`-type goal's progress the way a linked quest is, since a habit has no
discrete "done" state to count.

Fixed a real gap in `COMPLETION`-type goals (not previously documented as a deviation - just
missing): `currentValue` was only ever written by a manual `POST /goals/:id/progress` call,
so a goal counting linked quests never actually updated itself as those quests completed.
`QuestsService.complete()` now calls a new `GoalsService.syncCompletionProgress` after a
non-recurring quest with a `goalId` finishes, keeping `currentValue` - and completion, once the
target is hit - in sync automatically. Required `QuestsModule` to import `GoalsModule` directly,
the one edge in the module graph that reaches across activity modules outside
`ProgressionModule`, since this is a data-consistency fix, not part of the XP/streak/achievement
workflow.

The roadmap's "intelligent"/AI-driven goal decomposition itself is out of scope - there's no
LLM integration anywhere in this app (that's Phase 4). What shipped is the structural
building blocks the roadmap's own goal shape implies (milestones, quest/habit links, rewards),
without the auto-suggestion part. See `docs/feature-roadmap.md`'s Feature 8 deviation note and
`gameplay-systems.md` § "Better Goals" for the full reasoning.

Verified end-to-end against a real running dev server: goal↔habit linking (including rejecting a
link to a nonexistent goal, and unlinking via `goalId: null`), milestone create/complete/delete
with and without an XP reward, and the `COMPLETION`-type auto-sync flow (creating two quests
linked to a goal, completing them one at a time, confirming `currentValue` and eventual
auto-completion track them without any manual progress call) - 30 assertions, all passing.
Frontend (goal detail page's Milestones/Linked Habits sections, the habit modal's goal picker) is
a separate, not-yet-landed slice.

## 2026-07-20 — Level-Up Rewards and Attribute Detail Pages (frontend)

Frontend slice of "Sprint 3: Meaningful Progression" - Phase 1 Features 6 and 7, closing out the
sprint. Second commit straight to `master`, on top of the backend slice earlier the same day.

New `/attributes/[id]` route - didn't exist at all before this sprint, even though the backend
endpoint (`GET /attributes/:id`) has supported it since the attribute-hierarchy migration. Mirrors
`/skills/[id]`'s structure: header card, XP growth chart, recent activity, plus two sections new
to this sprint - a nested skills grid and an "Unlocked Rewards" section showing `LevelReward`s
scoped to that attribute (locked ones dimmed, same treatment as the achievements page). Linked
from the Skills page's attribute section headers and from the skill detail page's "Part of
{attribute}" line, which previously pointed at `/skills` (a dead link, since nothing there
scrolled to or highlighted the right attribute) and now correctly links to the attribute's own
page.

Skill detail page gained a "What contributes to this skill?" section - quests, habits, and goals
currently tagged with the skill. Built without any new backend endpoint: `GET /quests`,
`GET /habits`, and `GET /goals` already return each item with its nested `skills[]`, so the page
just fetches all three and filters client-side by skill id. Simpler than the plan's fallback
option of adding a `skillId` query param, and sufficient since none of these lists are large
enough for client-side filtering to matter.

Achievements page restructured into two tabs via the same inline pill-toggle pattern the Quests
page uses for its status filter: "Achievements" (unchanged) and a new "Level Rewards" tab with
matching Unlocked/Locked sections for `LevelReward`s. Settings page gained a Title picker (a
`<select>` of the caller's unlocked `TITLE`-type rewards, or "None") wired to
`PATCH /users/me { equippedTitleId }`; the Topbar now shows the equipped title next to the level
badge. `useCelebration` gained a `rewardsUnlocked` handler (reuses the `achievement` toast variant
with different copy), and every completion mutation (quest claim, habit complete, goal progress)
now invalidates the `level-rewards` query - and `quests`, in the habit/goal cases, since a
`QUEST`-type reward can auto-create a new quest on unlock.

Verified against real running dev servers: an API-driven setup script pushed a test account past
several seeded reward thresholds, then a Playwright pass (light and dark themes) drove the actual
UI - login, the new attribute page, the skill page's new section, the achievements tab switch, and
the settings title picker round-tripping through a page reload - 30 assertions, all passing.

## 2026-07-20 — Level-Up Rewards (backend)

Backend slice of "Sprint 3: Meaningful Progression" (`docs/feature-roadmap.md`) - Phase 1 Feature
6. First change committed straight to `master` rather than a feature branch - the
branch-per-feature workflow adopted for Sprint 2 was explicitly reverted before this sprint
started.

Added a new `LevelReward` + `UserLevelReward` model pair (migration
`20260720200000_level_rewards`, plus a new `LEVEL_REWARD_UNLOCK` value on `NotificationType`):
globally-seeded, data-driven reward definitions scoped to the character level or one of the 8
fixed attributes (never a user-created skill), unlocked per user exactly like the achievement
engine. `LevelRewardsService.checkAndUnlock` mirrors `AchievementsService.checkAndUnlock` almost
line-for-line but is simpler - a synchronous filter over already-fetched levels, no async
per-candidate condition check needed - and is called inline from
`ProgressionService.completeActivity` right after the achievement check, feeding a new
`rewardsUnlocked` field on `CompletionResult`.

Five of the roadmap's eight reward types are built: `TITLE` (equippable via a new
`PATCH /users/me { equippedTitleId }` field, validated against the caller's own unlocked
`UserLevelReward` rows), `BADGE` (record-keeping only), `STREAK_PROTECTION` (grants a
`User.habitStreakProtectionCharges` charge, consumed by a new private `HabitsService.
nextHabitStreak` the next time a habit's streak would otherwise reset on a missed day - preserving
continuity instead of resetting), `FEATURE_UNLOCK` (informational only - nothing in the app is
feature-gated yet), and `QUEST` (auto-creates a curated `category: SYSTEM` quest, reusing the same
quest-creation shape Sprint 2's neglected-attribute System quests established). `CHALLENGE`,
`THEME`, and `COSMETIC` are deliberately deferred - each would need a new subsystem with no
existing content to unlock. See `gameplay-systems.md` § "Level-up rewards (Feature 6)" for the
full design and `docs/feature-roadmap.md`'s Feature 6 deviation note for what's scoped out.

Seeded 6 representative `LevelReward` rows (`backend/prisma/seed.ts`) covering all 5 built types
and both scopes. Verified end-to-end against a real running dev server, including backdating a
`HabitCompletion.periodKey` via direct Prisma access to simulate a missed day and confirm the
streak-protection charge is actually consumed. Frontend (title UI, an achievements-page tab, the
attribute detail page, skill page updates) is a separate, not-yet-landed slice.

## 2026-07-20 — Daily and Weekly Challenges

Closes out "Sprint 2: Quest Progression" (`docs/feature-roadmap.md`) - Phase 1 Feature 3, on its
own branch (`feature/daily-weekly-challenges`).

Added a new `Challenge` model (migration `20260720190000_daily_weekly_challenges`, plus a new
`CHALLENGE_COMPLETION` value on `XPSourceType`): entirely system-generated Daily/Weekly
objectives, no create/edit endpoints. `ChallengesService.getActive` lazily generates one of each
per period (day-key / Monday-anchored week-key) the same way Quest Board's System quests do,
reusing the exact same `findNeglectedAttribute` heuristic from last slice rather than building a
second one. `WEEKLY` challenges get a real 500 XP threshold and track cumulative progress;
`DAILY` challenges complete on any qualifying XP (a nominal `targetXp: 1`, since "did a matching
activity happen today" is binary, not cumulative - falls out of the same "add earned XP, check
`>= targetXp`" logic without a separate code path).

Progress tracking is the domain-event system's first listener for a genuinely *new* concern
rather than a migrated one - the concrete validation of Feature 0.1's promised payoff. New
`ChallengeProgressListener` subscribes to `ACTIVITY_COMPLETED_EVENT`; to make that possible,
threaded a new `eventId` field through `XpAwardResult` → `CompletionResult` →
`ActivityCompletedEvent`, so the listener can re-query exactly which `XPTransaction` rows a
completion wrote and sum XP per attribute. Progress is attribute-scoped, not skill-scoped (a
challenge's `skillId` only describes its wording, it isn't an eligibility filter) - the same
"attribute-level rows are the source of truth" reasoning used throughout the ledger. The
completion bonus is awarded via `ProgressionService.completeActivity`, not `XpService.awardXp`
directly, specifically to avoid becoming an undocumented third consumer of `XpService` (its
"only `ProgressionModule` and `AdminModule` call this" invariant, stated in `docs/backend.md`
since Sprint 1) - also arguably more correct, since a challenge completion should count toward
the character streak and achievement checks like any other completion.

Frontend: a new `ChallengesSection` on the Quest Board page (`/quests`), above the category
filter, showing up to two challenge cards (a progress bar for `WEEKLY`, a done/not-done state for
`DAILY`). Polls `GET /challenges` every 5 seconds while mounted and diffs each challenge's
`status` against the previous poll to fire a one-time celebration toast exactly when one
transitions to `COMPLETED` - deliberately not routed through `useCelebration`, since a challenge
completion is a side effect of some *other* mutation, not something returned directly to the
component that triggered it.

Verified via a real-API script (no challenges before the user has any skills; one DAILY + one
WEEKLY generated once a skill exists, both targeting the same neglected attribute as a
System quest would; a qualifying quest completion immediately finishes the DAILY challenge and
awards its bonus; repeated qualifying completions push the WEEKLY challenge's progress to 500 and
complete it) and a Playwright browser pass (light + dark) covering both challenge card states.

## 2026-07-20 — Quest Board

Second slice of "Sprint 2: Quest Progression" (`docs/feature-roadmap.md`) - Phase 1 Feature 2,
on its own branch (`feature/quest-board`) per the new one-branch-per-feature agreement.

Added `Quest.category` (migration `20260720180000_quest_board`): `DAILY`, `WEEKLY`, `LONG_TERM`
(the default - existing quests all backfilled here), or `SYSTEM`. The existing `/quests` page
gained a category pill-filter row alongside its Active/Completed status tabs (`GET
/quests?category=`), rather than becoming a new separate page - the roadmap's "Quest Board" turned
out to be a filtering facet on the list the page already showed, not a distinct screen. A
non-Long-Term category now also shows as a badge on each quest card.

`SYSTEM` quests are auto-generated: a new shared `findNeglectedAttribute` helper
(`backend/src/common/neglected-attribute.ts`) finds whichever attribute earned the least XP in the
trailing 7 days among ones the user has an actual skill under (skipping attributes with no skill
to tag), and `QuestsService.ensureSystemQuest` - called at the top of every `GET /quests` - creates
one "Balance Your Build" quest targeting it if the user has no `SYSTEM` quest from the last 7 days.
Lazy/on-read generation rather than a scheduled job, since no cron infrastructure exists in the
app yet. `findNeglectedAttribute` was deliberately built as a `common/` utility rather than owned
by `QuestsModule`, so the next slice (Daily/Weekly Challenges) can reuse the identical "what's
neglected" definition instead of drifting into a second heuristic.

Verified via a real-API script (category defaults/filtering; no System quest before the user has
any skill; exactly one System quest generated once a skill exists, tagged with it; a second fetch
within the window doesn't duplicate it) and a Playwright browser pass (light + dark) covering the
dashboard → quests link, the category filter pills, and the category picker in the create modal.

## 2026-07-20 — Level-gated quests and reward claiming

First slice of "Sprint 2: Quest Progression" (`docs/feature-roadmap.md`) - Phase 1 Feature 1.
Also the first feature built on its own git branch (`feature/level-gated-quests`, merged into a
newly-renamed `main`) rather than committed straight to the trunk branch, per a new standing
working agreement: one branch per roadmap Feature from now on.

Added `QuestRequirement` (migration `20260720170000_level_gated_quests`): a quest can be locked
behind zero or more prerequisites - a level threshold (character, skill, or attribute), an
activity count for a specific skill, a specific achievement, a specific other quest, or a specific
goal. Locked/unlocked is computed at read time (`isLocked`/`requirements` on every serialized
quest), not stored - a locked quest is never hidden, it's shown with a requirement checklist and
progress toward each one. New `backend/src/quests/quest-requirements.ts` batches one
`buildRequirementSnapshot` query per list/detail request (not per quest) to avoid N+1 queries,
following the same data-driven-condition pattern `AchievementsService.isConditionMet` already
established.

Also added reward claiming: completing a quest (`POST /quests/:id/complete`) no longer awards XP
immediately - a new `POST /quests/:id/claim` does, via a new `QuestCompletion` model (one row per
completion, since a `RECURRING` quest can accumulate more than one unclaimed completion).
Deliberately doesn't snapshot the reward at completion time - claiming re-reads the quest's
current `xpReward`/tagged skills/bundle config, same as `complete()` always did. Scoped to quests
only; habits and goals keep their existing instant-reward flow. This changed `QuestsService.complete`'s
duplicate-completion guard from an application-level `status`/`lastCompletedAt` read-then-write
check to a database unique constraint (`QuestCompletion @@unique([questId, periodKey])`), the same
mechanism `HabitCompletion` already used - closing a pre-existing (if narrow) race-condition gap
between quests' old guard and habits'.

Frontend: new `RequirementsEditor` component (`frontend/src/components/ui/requirements-editor.tsx`),
a collapsed-by-default "Prerequisites" disclosure in the create-quest modal, mirroring
`RewardBundleEditor`'s pattern. Quest cards render dimmed with a requirement checklist when locked
(mirroring `/achievements`' existing locked-achievement treatment), and swap their button to
"Claim Reward" once a completion is pending - `useCelebration()` now fires on a successful claim,
not on `complete()`, since no XP moves until then.

While building the requirements editor's layout, found and fixed a real (if narrow) CSS bug: the
shared `Select`/`Input` components bake `w-full` into their base classes, which competes with a
sibling-sizing override (`flex-1`/`w-24`) applied to the *same* element at equal CSS specificity -
the outcome depends on Tailwind's dev-mode class-discovery order, not JSX class order, so it's
silently non-deterministic across recompiles. Fixed by moving the sizing to wrapper `div`s instead
of the form elements themselves, so there's no longer a competing `width` utility on one element.

Verified via a real-API script (locked → complete rejected with 400 → level up → unlocked →
complete → claim → XP moves; `ACTIVITY_COUNT` progress tracking; `QUEST_COMPLETED` prerequisites
including a self-reference rejection; a `RECURRING` quest's independently-claimable completions)
and a Playwright browser pass (light + dark) covering the locked card, the complete → claim →
celebration flow, and the requirements editor.

## 2026-07-20 — Fix: navigating to Settings flashed the whole app to light mode

`useTheme` (`frontend/src/hooks/use-theme.ts`) is consumed by `ThemeToggle`, which only lives on
`/settings` and the `/admin` layout - not the persistent Topbar - so every navigation to either
page mounts a brand-new, independent instance of the hook. That instance's `useState` always
starts at `'light'` (deliberately, to match SSR-rendered markup and avoid a hydration mismatch on
the very first page load). A second effect, keyed on `[theme]`, ran on every mount *and* wrote
`document.documentElement`'s `dark` class - so on mount it wrote the stale `'light'` value to the
shared, page-wide class before the state-correction effect caught up a moment later, flashing the
*entire app* (not just the toggle icon) to light mode for a frame on every navigation to Settings.

Fixed by splitting the responsibilities: the mount effect now only ever calls `setThemeState(...)`
to correct React's own state (for the toggle's icon), and never touches the DOM - the anti-FOUC
inline script in `app/layout.tsx` already set `documentElement`'s class correctly before any React
code runs. DOM writes (`classList.toggle` + `localStorage.setItem`, now factored into a shared
`applyTheme` helper) happen only inside `setTheme`/`toggleTheme`, i.e. only in response to an
explicit user action - never as a side effect of merely mounting.

Verified with a Playwright script that attaches a `MutationObserver` to `<html>`'s `class`
attribute before navigating from `/dashboard` (dark mode) to `/settings` via a real link click:
zero mutations were observed during the navigation (previously, this would have caught the
class being removed and re-added). Also verified the toggle itself still works in both
directions, a hard reload directly on `/settings` in dark mode still renders correctly with no
hydration warnings, and the final theme still persists to `localStorage`.

## 2026-07-20 — Internal domain events

Closes out "Sprint 1: Progression Foundation" (`docs/feature-roadmap.md`) - Feature 0.1, the last
of the four Sprint 1 items (0.2 XP source metadata, ledger tests, 0.3 XP Bundles, 0.1 domain
events).

Added `@nestjs/event-emitter`, registered globally via `EventEmitterModule.forRoot()` in
`AppModule` - an in-process event bus, no message broker, per the roadmap's own framing. New
`ActivityCompletedEvent` (`backend/src/progression/events/`), emitted once per
`ProgressionService.completeActivity` call, carrying `userId`, `sourceType`, `sourceId`,
`sourceName`, `xpGained`, `levelUp`, `newLevel`, `achievementsUnlocked`, and `completedAt`.
Emission is fire-and-forget (`emit()`, not `emitAsync()`) - nothing in `completeActivity` awaits a
listener, so a listener can never delay or break the completion response.

Moved the one existing side effect that was safe to move - the `LEVEL_UP` notification - out of
`completeActivity`'s inline sequence and into a new `LevelUpNotificationListener`
(`backend/src/progression/listeners/`), reacting to the same event. Safe specifically because that
notification was never part of `CompletionResult`: the frontend's celebration toast reads
`levelUp`/`newLevel` straight from the completion response, not from the notification. XP, streak,
and achievement-unlocking deliberately stay inline in `completeActivity`, unchanged - all three
feed values the response depends on, so moving them to fire-and-forget listeners would either drop
that data or reintroduce the same ordering coupling this system exists to remove (see
`gameplay-systems.md` § "Internal domain events (Feature 0.1)" for the full reasoning).

Verified via the existing Jest suite (unaffected - `ProgressionService` isn't covered by it
directly) plus a new real-API script: registering a user, completing a `LEGENDARY` (500 XP) quest
from level 1 to confirm a level-up, polling `GET /notifications` for the resulting `LEVEL_UP` row
(now created asynchronously rather than inline, so polling rather than asserting immediately),
then completing a second, non-level-up quest and confirming no additional `LEVEL_UP` notification
appeared.

## 2026-07-20 — XP Bundles

Second slice of "Sprint 1: Progression Foundation" (`docs/feature-roadmap.md`) - Feature 0.3.
Lets a quest/habit/goal award a different XP amount to a specific tagged skill than its flat
`xpReward`, and/or bonus XP to an attribute with no tagged skill at all.

Schema (migration `20260720160000_xp_bundles`): `QuestSkill`/`HabitSkill`/`GoalSkill` each gained
a nullable `amount` (null = inherit the flat `xpReward`, i.e. unchanged pre-Bundle behavior); new
`ActivityAttributeBonus` model, polymorphic over exactly one of `questId`/`habitId`/`goalId`, for
attribute-only bonus XP.

`XpService.awardXp`'s `skillIds?: string[]` param was replaced with `skillAwards?: SkillAward[]`
(`{ skillId, amount? }`) plus a new `attributeBonuses?: AttributeBonus[]` (`{ attributeId,
amount }`) - additive, not breaking: an award with no per-skill `amount` behaves exactly like the
old `skillIds` did. Both lists are deduped by key and validated (`amount` must be a positive
integer) inside `awardXp` itself. `QuestsService`/`HabitsService`/`GoalsService` each gained a
`validateRewardBundle` check (an override's `skillId` must be one of the activity's own tagged
`skillIds`; a bonus's `attributeId` must be owned by the caller, via new
`AttributesService.assertOwnedAttributeIds`) and now pass `skillAwards`/`attributeBonuses` through
to `ProgressionService.completeActivity` → `XpService.awardXp` at completion time.

New shared frontend component `RewardBundleEditor`
(`frontend/src/components/ui/reward-bundle-editor.tsx`): a collapsed-by-default "Advanced
rewards" disclosure showing a number input per currently-tagged skill (placeholder = the flat
reward, so "inherit" is visually obvious) and an add/remove list for attribute bonuses. Wired
into all three creation modals (`/quests`, `/habits`, `/goals`) — each computes its own
`taggedSkills` from the form's live `skillIds` and passes its own flat reward (difficulty-derived
XP for quests, `xpReward` for habits, a fixed 500 for goals, matching each type's existing
default).

Backend verified end-to-end via a real API script (override + bonus persistence, xp-history
grouping, validation errors, habit/goal smoke tests) and a Playwright browser script covering the
full create-quest-with-a-bundle flow in both light and dark themes. The browser script's login
step initially failed with the submitted email/password showing up as URL query params - a
hydration race, not a real bug (the identical login flow had worked reliably many times earlier
in the same session) - fixed with an explicit `waitForLoadState('networkidle')`. A second failure
was a real, if minor, product gap: `RewardBundleEditor`'s icon-only "add bonus" button had no
accessible name, so Playwright's `getByRole('button', { name: '' })` (an empty string matches
*any* accessible name as a substring) resolved to an unrelated button and submitted the form
early; fixed by giving the button a proper `aria-label="Add attribute bonus"`, a small real
accessibility improvement alongside the test fix.

## 2026-07-20 — XP source metadata, ledger tests, and XP History

First slice of the feature roadmap's "Sprint 1: Progression Foundation"
(`docs/feature-roadmap.md`) - Features 0.2 and 5, plus the roadmap's own "ledger invariant
tests" ask pulled forward ahead of the two riskier, more invasive Sprint 1 items (XP Bundles,
an internal domain-event system) so they land protected by real tests. Those two remain pending.

Added `XPTransaction.sourceName` (migration `20260720140000_xp_source_name`) - the activity's
display name, captured at write time in `XpService.awardXp`/`applyCorrection` rather than
resolved later by joining on `sourceId`, so a ledger row's label survives its source being
renamed or deleted. Existing rows were backfilled best-effort from current quest/habit/goal
titles (77 of 77 resolved). `AnalyticsService.feed` no longer does a live 3-table join for this -
it just reads the stored value.

While building a groupable "XP History" view, discovered that grouping by `createdAt` (the
initial plan, reasoning that all of one `awardXp` call's rows share one `$transaction`) was
unsound: Prisma evaluates `@default(now())` per statement, not once per transaction, so sibling
rows can land a few milliseconds apart. Added `XPTransaction.eventId`
(migration `20260720145000_xp_event_id`) - a UUID generated once per `awardXp`/`applyCorrection`
call and stamped on every row it writes - as the real correlation key. Not backfilled (nothing
to derive it from for old rows); `AnalyticsService.xpHistory` treats a null-`eventId` row as its
own singleton group rather than guessing via time proximity.

Added the backend's first test suite: `common/leveling.spec.ts` and `xp/xp.service.spec.ts`
(`jest`/`ts-jest`/`@nestjs/testing` were installed from the first commit but unused until now),
unit-testing the leveling formula and, against a mocked `PrismaService`, the ledger's shape
invariants directly - a character row never carries `skillId`/`attributeId`, every associated
skill gets the full award amount, a call's rows all share one `eventId` while two calls never
collide, and `applyCorrection` clamps negative totals to `0`. Scoped deliberately to the ledger,
not a general coverage push.

New `GET /analytics/xp-history` endpoint and `/analytics/history` page: every XP event
(character + skill + attribute lines together), filterable by source category, grouped by
calendar day, with cursor-based "Load more" via `useInfiniteQuery`. Linked from the Analytics
page's existing "Recent Activity" card.

## 2026-07-20 — Leaderboard attribute filter: dropdown → icon radio group

Replaced the `<Select>` dropdown for the leaderboard's Attribute mode with a `role="radiogroup"`
of per-attribute icon circles (same icon set and categorical color as the Skills page's attribute
badges), reusing each page's established local `ATTRIBUTE_ICON_MAP`/`resolveIcon` pattern rather
than extracting a shared component. Unselected attributes render as icon-only circles; the
selected one expands into a pill showing the icon plus the attribute's name, with a colored ring
(via inline `boxShadow`, since the ring color is per-attribute and can't be a static Tailwind
class) as the selection indicator.

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
