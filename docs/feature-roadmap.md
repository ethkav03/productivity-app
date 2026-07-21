# Life RPG — Feature Roadmap & Implementation Breakdown

> This is the third product specification provided to this project, after the MVP
> ([`mvp-spec.md`](./mvp-spec.md)) and the attribute hierarchy
> ([`attribute-hierarchy-spec.md`](./attribute-hierarchy-spec.md)) were already built. Unlike
> those two, it isn't a flat feature list - it's an explicit *sequencing* argument: build a
> progression of increasingly sophisticated systems, where each phase strengthens the one before
> it, rather than implementing features in whatever order they were suggested. Reproduced here
> (condensed from its original mockup-heavy form into prose, content preserved) as the canonical
> reference for this multi-sprint initiative. See the "Implementation status" section at the
> bottom for what's actually been built against it, updated as work proceeds.

## Core product vision

The application should gradually become a system where a user's real-life actions create a
developing character. The central loop should evolve from:

```
Activity → XP → Level
```

into:

```
Activity → XP → Skill Growth → Unlocks → New Challenges → Character Identity → Visible Transformation
```

The fundamental loop, expanded:

```
User performs real-world activity
  → Activity is completed
  → XP is awarded through the central progression system
  → Skills and attributes improve
  → Character levels up
  → New content becomes available
  → User takes on harder challenges
  → New identity develops
```

**Key principle: progression should unlock new possibilities, not merely make numbers go up.**

---

## PHASE 0 — Strengthen the Existing Foundation

Before adding large gameplay systems, make the existing architecture robust enough to support
them.

### Feature 0.1 — Domain Events / Internal Event System

The existing completion workflow (`ProgressionService.completeActivity` calling `XpService` →
streak → `AchievementsService` → notifications, directly and sequentially) should move toward an
event-driven shape:

```
Activity Completed → ActivityCompleted Event →
  ┌────────┬─────────┬─────────────┬───────────┐
  XP       Streak    Achievement   Analytics
  │        │         │             │
  Rewards  Goals     Notifications Timeline
```

No message broker needed - a simple in-process event emitter is enough
(e.g. `@nestjs/event-emitter`). An `ActivityCompletedEvent` would carry `{ activityId, userId,
activityType, completedAt, xpAwarded }`, with independent listeners
(`ProgressionListener`, `AchievementListener`, `StreakListener`, `ChallengeListener`,
`NotificationListener`, `AnalyticsListener`, ...) reacting to it. The payoff: future features
(challenges, seasons, AI analysis, timeline events, perks, rewards) can subscribe to activity
events without modifying the core completion logic.

### Feature 0.2 — XP Source Metadata

Every XP transaction should explain exactly where it came from - a display name and structured
source/target identifiers, not just a bare amount:

```
+100 Strength XP
Source: Quest
Quest: Complete Upper Body Workout
Reason: Quest completed
```

Source types: `QUEST`, `HABIT`, `GOAL`, `ACHIEVEMENT`, `CHALLENGE`, `ADMIN_CORRECTION`,
`SYSTEM_REWARD`. This enables XP history, undo functionality, auditing, analytics, XP
corrections, future rewards, and detailed progress screens - "one of the highest-value technical
improvements" per the roadmap's own framing.

### Feature 0.3 — XP Bundles

Instead of every action giving the same XP amount to every target it touches, allow custom
per-target reward distributions in one activity:

```
Complete Gym Session
  Character  +100 XP
  Strength   +100 XP
  Physical   +100 XP
  Discipline  +50 XP
  Energy      +10 XP
```

Represented as a structured reward list rather than one flat `amount`:

```ts
XPBundle {
  rewards: [
    { type: "CHARACTER", amount: 100 },
    { type: "SKILL", id: "strength", amount: 100 },
    { type: "ATTRIBUTE", id: "physical", amount: 100 },
    { type: "ATTRIBUTE", id: "discipline", amount: 50 },
    { type: "ATTRIBUTE", id: "energy", amount: 10 },
  ]
}
```

This gives much finer balancing control than "one amount, uniformly applied to the character and
every tagged skill/attribute."

---

## PHASE 1 — Make the Existing Game Loop Stronger

### Feature 1 — Level-Gated Quests

Currently progression mostly tells the user "You have reached Level 10." Level-gated quests
change this to "You are now strong enough to attempt something new."

A quest should support requirements such as level thresholds (`Strength >= 10`,
`Physical >= 8`, `Character >= 15`), activity-count requirements (`Complete 20 running
activities`), achievement requirements (`Achievement: First 5K`), quest requirements
(`Complete Quest A`), and goal requirements (`Complete a goal`) - initially these five types.

Quest state machine: `LOCKED → (requirements satisfied) → AVAILABLE → (user accepts) → ACTIVE →
(completed) → COMPLETED → REWARD CLAIMED`, with `FAILED`/`EXPIRED` as additional terminal states.
**A locked quest should not be hidden** - shown with its requirements and current progress
(e.g. "❌ Endurance Level 10 · ✓ Physical Level 5 · Progress: Endurance 7/10"), to create
anticipation rather than a static wall.

### Feature 2 — Quest Board

A single home for the user's current objectives, organized into categories: **Daily Quests**
(short-term tasks, e.g. "Complete a workout +50 XP"), **Weekly Quests** (larger objectives, e.g.
"Complete 3 workouts"), **Long-Term Quests** (major life challenges, e.g. "Lose 10 kg" with
fractional progress and a large reward + achievement + title), and **System Quests** (generated
by the application itself, e.g. "Balance Your Build: your Intelligence attribute has received
significantly less XP than Physical - complete one Intelligence activity this week").

### Feature 3 — Daily and Weekly Challenges

Distinct from normal quests: a **Daily Challenge** ("Train a skill you have not trained
recently") and a **Weekly Challenge** ("Earn 500 XP in an attribute you have neglected"), each
with `Name, Description, Duration, Requirements, Target, Progress, XP Reward, Achievement
Reward, Difficulty`. Generation logic analyses recent XP distribution, recent activity, unused
skills, current goals, current level, and previous challenges to produce a challenge (e.g. a
skewed XP distribution like `Physical 62% / Discipline 24% / Intelligence 8% / Social 6%`
generates "The Scholar's Trial: complete 3 Intelligence activities this week").

### Feature 4 — XP Balancing and Diminishing Returns

Important for preventing exploitation. A rough XP-by-effort scale: tiny action 5-10, small task
15-30, normal task 50-100, significant achievement 250-500, major milestone 1,000+.

For repeated activities, the roadmap considers (and explicitly cautions against over-applying) a
flat repetition-decay curve (100% / 80% / 60% / 40% for successive sessions) - warning that this
risks punishing legitimate real-world repetition (a second gym session in a week is not less
real than the first). The better framing it lands on: full XP for a first completion, full XP for
a meaningful *new* activity, but reduced XP specifically for a repeated *identical micro-action*
(its example: spamming "Drink Water" 100 times for +10 XP each). Recommended guardrails: a daily
activity XP cap, a weekly activity XP cap, and a repeated-action cooldown - while keeping
genuine achievements fully rewarded regardless.

### Feature 5 — XP History

A dedicated XP History screen: entries like "July 20: +100 Character XP, +100 Strength XP, +100
Physical XP, +50 Discipline XP · Source: Upper Body Workout," filterable by All / Character /
Attributes / Skills / Quests / Habits / Achievements / Challenges. Should eventually support an
XP graph, daily/weekly/monthly breakdowns, and "XP by source" / "XP by skill" views.

### Feature 6 — Level-Up Rewards

Every meaningful level should unlock something concrete - e.g. `Physical Level 5 → Training
Plans`, `Physical Level 10 → Epic Physical Quests`, `Physical Level 20 → Title: Athlete`. Reward
types: `TITLE, BADGE, QUEST, CHALLENGE, FEATURE, THEME, COSMETIC, STREAK PROTECTION`. This gives
levels real meaning beyond a bigger number - e.g. reaching Discipline Level 10 unlocking "Streak
Protection" (protect one habit streak per month).

### Feature 7 — Skill and Attribute Detail Pages

Each skill should have its own progression page: level, a progress bar, total XP, current
level's XP, XP to next level, recent activities, recent XP, achievements, unlocked perks, and
related quests - plus a "what contributes to this skill?" breakdown (e.g. Strength: gym sessions,
strength training, weightlifting quests), so users understand *why* a stat moved.

### Feature 8 — Intelligent Goal Decomposition

A user creates a goal ("Build a Full-Stack Application"); the system breaks it into components
(Learn Architecture, Design Database, Build Backend, Create Frontend, Add Authentication, Write
Tests, Deploy Application), each of which can become a Quest, Milestone, Habit, or Sub-goal. A
goal's full structure: `Description, Target, Deadline, Skills, Milestones, Recommended Quests,
Recommended Habits, Rewards` - turning a goal into a complete progression campaign rather than a
single checkbox (e.g. "Lose 10 kg" suggesting weekly weigh-ins, 3 workouts/week, tracking
nutrition, and a daily step target).

---

## PHASE 2 — Make the App Feel Like a Real RPG

### Feature 9 — Character Build System

The user's attribute distribution should eventually suggest a character identity - e.g.
`Physical + Discipline → Athlete`, `Intelligence + Creativity → Inventor`. Potential
specialisations: Warrior, Scholar, Athlete, Entrepreneur, Creator, Socialite, Balanced, Custom.
These should never permanently lock the user - they're a read of current tendency ("this is the
direction your actions are currently taking you"), not a class selection.

### Feature 10 — Skill Trees

Skills should evolve from a flat list into a visual progression tree - a linear tier chain
(Beginner → Novice → Intermediate → Advanced) or a branching one (Strength → Power →
Explosiveness / Muscle → Hypertrophy / Endurance), with concrete unlocks per tier (Strength
Level 5 → Beginner Strength Quests, Level 10 → Advanced Training Quests, Level 20 → Power
Specialisation). This is where the system starts feeling genuinely like an RPG rather than a
checklist app.

### Feature 11 — Titles and Perks

Titles represent identity (The Beginner, The Consistent, The Athlete, The Builder, The Scholar,
The Rebuilder, The Persistent). Perks provide functional rewards (e.g. Discipline Level 10 →
Streak Protection).

### Feature 12 — Unlockable Content

The application should progressively reveal more of itself as the user levels: Level 1 → Basic
Quests, Level 5 → Daily Challenges, Level 10 → Skill Trees, Level 15 → Epic Quests, Level 20 →
Specialisations, Level 25 → Advanced Challenges. The player should feel "I levelled up, and now I
can do something new," not just "the number went up."

### Feature 13 — Seasons and Chapters

Instead of one endless progression, divide life into chapters with a focus and goals (e.g.
"Season 1 — The Rebuild, July→September 2026, Focus: Physical/Discipline/Energy, Goals: reach
90kg, improve 5K time, build Life RPG"), closing with a summary (level deltas per attribute, a
title unlock) before the next season begins. Gives the user a clear, always-current answer to
"what am I working on right now?"

### Feature 14 — Identity System

A long-term feature: the app should eventually be able to synthesize a "current identity" (e.g.
"🏃 Athlete, 💻 Builder, 📚 Learner, 🛡 Persistent" → "Disciplined Athlete") from XP distribution,
completed quests, goals, achievements, recent behaviour, and season focus - contrasting a
previous chapter ("Unfocused") against the current one ("Builder"). Arguably the emotional core
of the product: the app becomes less about "I need to complete this habit to earn XP" and more
about "I am becoming the type of person who does this."

---

## PHASE 3 — Make the App Useful for Self-Improvement

### Feature 15 — Daily Energy / Capacity

A separate daily resource (`DAILY CAPACITY: 78/100`) influenced by sleep, recent workload,
training, stress, recovery, rest, and momentum. Important: low energy should never *prevent* the
user from doing things - instead, high capacity recommends difficult activities, low capacity
recommends smaller activities and recovery quests.

### Feature 16 — Recovery System

Recovery becomes part of progression, not the absence of it - "rest can be productive." Possible
recovery activities: sleep, walking, stretching, rest, sauna, meditation. A recovery quest can
itself carry real rewards (e.g. a 30-minute walk + 10 minutes of stretching + sleeping before 11
PM → +20 Energy XP, +25 Discipline XP), recommended specifically when capacity is low (e.g. at
42%: a walk, hydration, an earlier bedtime).

### Feature 17 — Daily Journal

A daily log connecting real life to progression: mood, energy, a free-text note, what was
completed, and XP earned that day. Over time this becomes correlation material (e.g. "your best
training performances usually occur after 7+ hours sleep, high recovery, and consistent
nutrition") - this is where the app starts becoming more than a game.

### Feature 18 — Mood and Energy Tracking

Track mood, energy, sleep, stress, and motivation; correlate them against XP earned, workout
performance, habit completion, and training consistency (e.g. "you complete 24% more activities
on days following 7+ hours of sleep"). Important: present these as observations, not definitive
medical conclusions.

### Feature 19 — Life Timeline

Potentially one of the best features in the app: a chronological timeline of level-ups,
achievements, goals, quest completions, season completions, major milestones, and user-created
memories (e.g. "Jan 2026: started learning programming, Physical Level 3 → Mar 2026: completed
30 workouts, started running → Jun 2026: lost 10 kg, built first full-stack app, Character Level
15"). At the end of a year, the user can look back and see, concretely, "this is what I actually
did."

---

## PHASE 4 — Intelligence Layer

*Should come later - after the foundation, loop, identity, and self-improvement layers above.*

### Feature 20 — Personalised Recommendations

The system analyses current goals, recent activities, skill progression, XP distribution,
energy, momentum, and unfinished quests, then recommends specific next actions (e.g. "you've
made excellent Physical progress this week; your Intelligence attribute has received little XP -
recommended: complete one programming quest").

### Feature 21 — Adaptive Difficulty

If the user constantly completes quests easily, recommend increasing difficulty; if they
repeatedly fail, recommend reducing the target - aiming to keep challenges in the user's optimal
difficulty zone.

### Feature 22 — AI Game Master

Eventually, AI could sit on top of the existing structured systems - analysing progress,
generating quests, adjusting difficulty, creating weekly reviews, identifying neglected
attributes, suggesting goals, detecting patterns, and creating seasonal narratives (e.g. "you've
spent the last three months building Physical and Discipline; your next chapter could focus on
Intelligence and Creativity"). Explicitly: the AI should sit *on top of* the existing structured
systems, not replace XP logic, progression logic, quest completion, or achievement logic.

---

## Recommended development order

The roadmap's own sequencing, as 7 sprints:

1. **Progression Foundation** — XP source metadata, XP history, XP bundle support, ledger
   invariant tests, internal domain events.
2. **Quest Progression** — quest requirements, level-gated quests, quest states, Quest Board,
   daily challenges, weekly challenges.
3. **Meaningful Progression** — level-up rewards, titles, perks, unlockable quests, skill/attribute
   detail pages.
4. **Better Goals** — goal milestones, goal decomposition, goal↔quest relationships, goal↔habit
   relationships, goal completion rewards.
5. **RPG Identity** — character builds, specialisations, skill trees, character identity,
   seasonal progression, chapters.
6. **Self-Improvement Layer** — daily energy, recovery, daily journal, mood tracking, correlation
   analytics, life timeline, weekly reviews.
7. **Intelligence** — personalised recommendations, adaptive difficulty, AI-generated quests, AI
   weekly reviews, AI Game Master.

### The roadmap's own "immediate MVP expansion" alternative

A separate, feature-first path the roadmap offers as a faster route to visible payoff, skipping
straight past the Sprint 1 foundation work: Level-gated quests → Quest Board → Daily & Weekly
Challenges → Level-up Rewards → Perks & Unlocks → XP History → Seasons/Chapters → Character
Identity. Together these transform the loop from `Complete activity → Earn XP → Number
increases` into `Complete activity → Earn XP → Level up → Unlock new content → Take on harder
quests → Develop a character build → Enter a new chapter of life`.

---

## Implementation status

Tracked here as work proceeds; see `docs/changelog.md` for the dated narrative of each change.

**Chosen entry point:** Sprint 1 (Progression Foundation) - the user chose this over the
feature-first "Immediate MVP Expansion" path when asked, so foundation work landed before any
Phase 1+ feature. Sprint 1 and Sprint 2 (Quest Progression) were built one roadmap Feature per
git branch (`feature/level-gated-quests`, `feature/quest-board`,
`feature/daily-weekly-challenges`), each merged into `main` when done and verified. Starting with
Sprint 3, the workflow moved to committing directly to `master` (the branch-per-feature pattern
was explicitly reverted). Sprint 3 ("Meaningful Progression"), Sprint 4 ("Better Goals"), and
Sprint 5 ("RPG Identity": character builds, specialisations, skill trees, character identity,
seasonal progression, chapters), Sprint 6 ("Self-Improvement Layer": daily energy, recovery, daily
journal, mood tracking, correlation analytics, life timeline), and Sprint 7 ("Intelligence":
personalised recommendations, adaptive difficulty, AI-generated quests, AI weekly reviews, an AI
Game Master) are all complete, each landed as two commits (backend slice, then frontend slice)
straight to `master`. Feature 14 ("Identity System") within Sprint 5's own scope, and Feature 16
("Recovery System") within Sprint 6's own scope, were each deliberately not built. Sprint 7 was
explicitly scoped to rules-based heuristics with no LLM/AI integration, per the user's own choice
when asked - see the notes below, and `docs/gameplay-systems.md` § "Recommendations and Weekly
Review (Sprint 7)".

| Item | Status |
| --- | --- |
| 0.2 — XP Source Metadata | **Done.** `XPTransaction.sourceName`, captured at write time. See `gameplay-systems.md` § "The centralised XP ledger". |
| Ledger invariant tests (pulled forward from its Sprint 1 position) | **Done.** `common/leveling.spec.ts`, `xp/xp.service.spec.ts` - the project's first tests. |
| 5 — XP History | **Done.** `GET /analytics/xp-history` + `/analytics/history` page. Graph/daily-weekly-monthly breakdowns from the roadmap's "should eventually support" list are not built - the existing `/analytics` XP-over-time chart already covers that need. |
| 0.3 — XP Bundles | **Done.** Per-skill XP overrides (`QuestSkill`/`HabitSkill`/`GoalSkill.amount`) and attribute-only bonus XP (`ActivityAttributeBonus`), wired into all three creation modals via a shared `RewardBundleEditor`. See `gameplay-systems.md` § "XP Bundles: per-skill overrides and attribute-only bonuses". |
| 0.1 — Internal domain events | **Done.** `ActivityCompletedEvent` + `EventEmitter2` (`@nestjs/event-emitter`), emitted once per `ProgressionService.completeActivity` call; one listener (`LevelUpNotificationListener`) so far. See `gameplay-systems.md` § "Internal domain events (Feature 0.1)". This was Sprint 1's last item - see `docs/changelog.md` for the closing entry. |
| 1 — Level-Gated Quests | **Done** (`feature/level-gated-quests`). `QuestRequirement` (5 types) + computed `isLocked`/`requirements` on every serialized quest - locked quests are never hidden. Reward claiming (`QuestCompletion`, `POST /quests/:id/claim`) also landed as part of this branch. See `gameplay-systems.md` § "Level-gated quests and reward claiming (Feature 1)". |
| 2 — Quest Board | **Done** (`feature/quest-board`). `Quest.category` (Daily/Weekly/Long-Term/System) + a category filter added to the existing `/quests` page (not a separate page/route); auto-generated System quests via a shared neglected-attribute heuristic (`findNeglectedAttribute`, also used by Feature 3). See `gameplay-systems.md` § "Quest Board and System quests (Feature 2)". |
| 3 — Daily and Weekly Challenges | **Done** (`feature/daily-weekly-challenges`, Sprint 2's last item). `Challenge` model, lazily generated (same heuristic as Feature 2's System quests); progress driven by a new `ChallengeProgressListener` on `ACTIVITY_COMPLETED_EVENT` - the domain-event system's first listener for a genuinely new concern, not a migrated one. See `gameplay-systems.md` § "Daily and Weekly Challenges (Feature 3)". |
| 4 — XP Balancing and Diminishing Returns | Not yet built - not part of Sprint 2's scope (roadmap's own sprint grouping puts it under "Quest Progression" but it wasn't selected for this pass). |
| 6 — Level-Up Rewards | **Done** (Sprint 3, committed straight to `master` - see "Chosen entry point" above). `LevelReward` + `UserLevelReward`, data-driven `LevelRewardsService.checkAndUnlock` mirroring the achievement engine, 5 of the roadmap's 8 reward types built (`TITLE`, `BADGE`, `STREAK_PROTECTION`, `FEATURE_UNLOCK`, `QUEST`), equippable titles via a `PATCH /users/me` field + a Settings picker + a Topbar display, and a "Level Rewards" tab on `/achievements`. See `gameplay-systems.md` § "Level-up rewards (Feature 6)" and the deliberate-deviation note below. |
| 7 — Skill and Attribute Detail Pages | **Done** (Sprint 3). New `/attributes/[id]` route (didn't exist at all before this sprint): level/XP header, nested skills, an "Unlocked Rewards" section, XP growth chart, recent activity. `/skills/[id]` gained a "What contributes to this skill?" section (quests/habits/goals currently tagged with it, filtered client-side over existing list endpoints - no new backend endpoint needed) and its "Part of {attribute}" link now actually links to the attribute page instead of `/skills`. See `docs/frontend.md`'s route table. |
| 8 — Intelligent Goal Decomposition | **Done** (Sprint 4 "Better Goals", committed straight to `master`, closing out the sprint). `GoalMilestone` (ordered checklist items, optional small XP reward) and `Habit.goalId` (mirroring the pre-existing `Quest.goalId`) landed; a `COMPLETION`-type goal's progress now syncs automatically from linked quest completions instead of requiring a manual re-count. Frontend: the goal detail page gained a Milestones card and a Linked Habits card, and swapped its manual numeric input for a read-only note on `COMPLETION`-type goals; the habit modal gained a Goal picker mirroring the quest modal's. The roadmap's "intelligent"/AI-driven decomposition itself is out of scope - see the deliberate-deviation note below. |
| 9 — Character Build System | **Done** (Sprint 5 "RPG Identity"). `computeArchetype` - a pure frontend computation over `GET /attributes`'s existing data, no backend change. A curated pairing of the top 2 attribute levels resolves to a named archetype (e.g. Physical+Discipline → "Warrior"), shown as a badge on `/dashboard`. See `docs/frontend.md` § "Derived game-mechanic helpers" and the deliberate-deviation note below. |
| 10 — Skill Trees | **Done** (Sprint 5). `getSkillTier` - a pure frontend computation over each skill's existing `level` field, no backend change. Shows a tier label (Beginner/Novice/Intermediate/Advanced/Master) next to every skill's level badge. Roadmap's "concrete unlocks per tier" deliberately not built - see the note below. |
| 11 — Titles and Perks | **Already done** - this is exactly what Sprint 3's "Level-Up Rewards" shipped, just under a different name. No new work in Sprint 5. See `gameplay-systems.md` § "Seasons and Chapters (Feature 13)" for a short note on why, and § "Level-up rewards (Feature 6)" for the full design. |
| 12 — Unlockable Content | Not yet built - not part of Sprint 5's scope (the roadmap's own 7-sprint list doesn't slot this feature into any specific sprint). |
| 13 — Seasons and Chapters | **Done** (Sprint 5 "RPG Identity", committed straight to `master`, closing out the sprint). New `Season` model - a named chapter with a focus of 1+ attributes, snapshotting level/attribute levels at start and close so progress deltas stay meaningful once closed; at most one `ACTIVE` season per user, enforced in `SeasonsService`. `Goal.seasonId` mirrors the pre-existing `Quest.goalId`/`Habit.goalId` pattern. Frontend: a new `/seasons` page (current season + history + a start-season modal), a current-season banner on `/dashboard`, and a season picker in the goal creation modal. See `gameplay-systems.md` § "Seasons and Chapters (Feature 13)". |
| 14 — Identity System | Deliberately deferred - see the note below. |
| 15 — Daily Energy / Capacity | **Done, light version** (Sprint 6 "Self-Improvement Layer", committed straight to `master`). `GET /journal/capacity` averages the last 3 days' logged mood/energy into a 0-100 score - no new model, no scheduler, and deliberately not weighted by the roadmap's full "sleep, workload, training, stress, recovery, momentum" formula (no real usage data to calibrate weights against). Never gates anything - informational only, per the roadmap's own framing. Frontend: a "Daily Capacity" widget on `/dashboard` (score + High/Moderate/Low badge, or a "log your mood" prompt if there's no data yet). See the deliberate-deviation note below. |
| 16 — Recovery System | Deliberately not built - see the note below. |
| 17 — Daily Journal | **Done** (Sprint 6). New `JournalEntry` model - one optional-fields row per user per day (mood, energy, sleep, stress, free-text note). "Activities completed and XP earned that day" is computed live from the XP ledger, never duplicated onto the entry. `PUT /journal/:date` upserts; `GET /journal/history` lists recent days. Frontend: a new `/journal` page - a prev/next-day editor with 1-5 rating pickers, sleep hours, and a note, plus the live day summary. |
| 18 — Mood and Energy Tracking | **Done** (Sprint 6). `GET /journal/correlations` - two fixed comparisons (average XP on higher- vs lower-mood days, and more- vs less-sleep days), each withheld unless there are at least 3 days of data on both sides. Framed as observations, not medical claims, per the roadmap's own explicit caution. Frontend: rendered as two comparison cards on `/journal`, below the day editor. |
| 19 — Life Timeline | **Done** (Sprint 6). New `GET /analytics/timeline` merges achievement unlocks, level-reward unlocks, goal completions, season closures, notable (`EPIC`/`LEGENDARY`) quest completions, journal notes ("memories"), and reconstructed character level-ups into one chronological feed - genuinely new, not a duplicate of the existing `/analytics/feed`/`xp-history` raw-ledger views. Attribute-level level-ups are deliberately excluded - see the note below. Frontend: a new `/timeline` page, events grouped by day with a per-type icon and badge. |
| 20 — Personalised Recommendations | **Done, rules-based** (Sprint 7 "Intelligence", committed straight to `master`). New `GET /recommendations` runs five independent fixed heuristics (neglected attribute, weekly momentum, deadline approaching, stale goal, "ready for a challenge") and returns whichever produced a real signal - no LLM, no scoring model across heuristics. Frontend: a new `/recommendations` page rendering the cards (or an empty state), each linking to the relevant attribute/skill/goal/quests page. See the deliberate-deviation note below. |
| 21 — Adaptive Difficulty | **Done, one-sided** (Sprint 7). The "recommend harder quests after repeated easy success" half is built (`DIFFICULTY_READY` - the caller's last 5 claimed completions were all Easy/Medium). The "recommend easier ones after repeated failure" half is not - there's no failure/abandon signal anywhere in the data model to build it from honestly. See the deliberate-deviation note below. |
| 22 — AI Game Master | **Narrowed to Weekly Review** (Sprint 7). New `GET /recommendations/weekly-review` assembles a structured digest (XP this/last week, quests/habits completed, top skill, neglected attribute, streak) from data that already exists elsewhere - not AI-written prose. Frontend: a "Weekly Review" card on `/recommendations` below the recommendation cards. Quest generation, automatic difficulty adjustment, pattern detection, and seasonal narratives are not built. See the deliberate-deviation note below. |

**Deliberate deviation:** `eventId` was added as a real schema column (not in the original
Feature 0.2 sketch, which implied `targetType`/`targetId`/`sourceType`/`sourceId` would be
enough) after discovering `createdAt` isn't a safe correlation key for grouping one award call's
rows - see `gameplay-systems.md` § "`sourceName` and `eventId`" for why. `targetType`/`targetId`
themselves were deliberately *not* adopted as a generic polymorphic pair - the existing
`skillId`/`attributeId` typed nullable foreign keys already do that job with real FK constraints
and cascading deletes, which a generic `targetId: string` column would give up.

**Deliberate deviation:** Feature 0.3 was implemented as a targeted extension of the existing
skill-tagging model rather than the roadmap's fully generic `XPBundle { rewards: [{type, id,
amount}] }` list. Concretely: a per-skill override (`skillAwards[].amount`) only applies to a
skill already tagged via `skillIds` (no free-standing `{type: "SKILL", ...}` reward disconnected
from the tag), and an attribute-only bonus (`attributeBonuses`) is its own field rather than a
`{type: "ATTRIBUTE", ...}` reward variant. This keeps the existing `skillIds: string[]` API
surface and `QuestSkill`/`HabitSkill`/`GoalSkill` join tables as the single source of truth for
"what does this activity affect," with the bundle fields only ever refining amounts on top of
that - rather than introducing a second, parallel way to declare what a skill/attribute is
tagged, which the generic list shape would have allowed (e.g. a reward targeting a skill the
activity isn't otherwise tagged with).

**Deliberate deviation:** Feature 0.1's diagram shows XP, Streak, Achievement, and Notifications
as four independent branches off `ActivityCompleted`. The actual implementation only moves
Notifications (specifically, the level-up notification) to a listener; XP, streak, and
achievement-unlocking stay inline in `ProgressionService.completeActivity` because all three feed
values the caller synchronously depends on (`CompletionResult`) - see `gameplay-systems.md` §
"Internal domain events (Feature 0.1)" for why turning them into fire-and-forget listeners would
either lose that data or require re-introducing the same coupling this system exists to remove.
The event system's actual payoff is for *new*, response-independent concerns (challenges,
seasons, AI analysis, a timeline view) to subscribe later without touching
`ProgressionService`/Quests/Habits/Goals at all - not retrofitting today's four branches onto it
unconditionally.

**Deliberate deviation:** Feature 1's proposed state machine is `LOCKED → AVAILABLE → ACTIVE →
COMPLETED → REWARD CLAIMED`, plus `FAILED`/`EXPIRED`. The actual implementation doesn't add any of
this to `QuestStatus` (still just `ACTIVE`/`COMPLETED`/`ARCHIVED`, unchanged since before this
feature). `LOCKED`/`AVAILABLE` are computed at read time (`isLocked: boolean`) rather than stored,
since a quest's requirements can become newly met or newly unmet as the user's stats change -
storing it would mean re-deriving and writing it on every relevant stat change instead of just
reading it fresh, for no benefit. `REWARD CLAIMED` is represented by `QuestCompletion.claimedAt`
rather than a new status value, since a `RECURRING` quest needs *per-completion* claim state, not
one flag on the quest itself. `FAILED`/`EXPIRED` aren't implemented at all - out of scope for this
slice; nothing today automatically fails or expires a quest.

**Deliberate deviation:** Feature 2 describes "A single home for the user's current objectives" -
read as a *new* screen. The actual implementation adds category filtering to the existing
`/quests` page instead of a separate page/route, since the roadmap's own categories (Daily/
Weekly/Long-Term/System) are naturally just another facet of the same quest list the page already
shows, and a second page would either duplicate that list's rendering or need to embed it -
neither adds enough over "filter the list you're already looking at" to justify a new route.
System quest generation is also a simpler heuristic than the roadmap's implied full analysis
engine ("recent XP distribution, recent activity, unused skills, current goals, current level,
previous challenges") - just "which attribute earned the least XP in the last 7 days, among ones
with a skill to tag." Real, not a stub, but a narrower first slice; the fuller analysis is closer
to Phase 4's "Intelligence Layer" in spirit and can build on this heuristic later rather than
replacing it.

**Deliberate deviation:** Feature 3's proposed `Challenge` shape includes `Difficulty` and
`Achievement Reward` fields alongside `XP Reward`. Neither is implemented: `Difficulty` has no
clear meaning for a challenge whose target is chosen by a fixed heuristic rather than a user
(unlike a quest's difficulty, which the creator picks); `Achievement Reward` would mean building a
second, achievement-granting side channel outside `AchievementsService.checkAndUnlock`'s existing
data-driven design, for a feature with no achievements currently defined to grant. Both are cheap,
additive follow-ups (new nullable columns) if a real need shows up later. Generation also reuses
Feature 2's exact `findNeglectedAttribute` heuristic rather than the roadmap's own separate
description of Challenge generation ("recent XP distribution, recent activity, unused skills,
current goals, current level, previous challenges") - the same "narrower real heuristic, not a
fuller analysis engine" scoping call as Feature 2's, made once and shared rather than duplicated
into two independently-drifting narrower heuristics.

**Deliberate deviation:** Feature 6 lists 8 reward types (`TITLE, BADGE, QUEST, CHALLENGE,
FEATURE, THEME, COSMETIC, STREAK PROTECTION`); only 5 are built (`TITLE`, `BADGE`,
`STREAK_PROTECTION`, `FEATURE_UNLOCK`, `QUEST`). `CHALLENGE`, `THEME`, and `COSMETIC` are deferred
because each needs an entirely new subsystem with no existing content to unlock: there's no
manual challenge-creation concept to hook a reward into (`Challenge` rows are exclusively
system-generated, per Feature 3), no second visual theme designed, and no avatar/cosmetic-equip
system at all - unlike the other five, which compose cleanly with what's already built. Reward
*scope* is also narrower than the roadmap's own examples suggest only in one respect: rewards
target the character level or one of the 8 fixed attributes (mirroring `Achievement.attributeKey`)
but never a user-created skill, since a globally-seeded definition (written once, before any user
exists) can't sensibly target something that isn't fixed. `STREAK_PROTECTION` is a one-time charge
grant on unlock, not the roadmap's "protect one habit streak per month" ongoing refresh - there's
no scheduler in the app to grant a recurring allotment. `FEATURE_UNLOCK` is purely informational
for now, since nothing in the app is currently gated behind a feature flag to unlock. See
`gameplay-systems.md` § "Level-up rewards (Feature 6)" for the full design.

**Deliberate deviation:** Feature 8's actual proposal is a user creates a goal and *the system*
breaks it into components ("Learn Architecture, Design Database, Build Backend, ..."), each
becoming a Quest/Milestone/Habit/Sub-goal automatically. Nothing in this codebase does that kind
of generation - there is no LLM/AI integration anywhere in the app (that's explicitly Phase 4,
"Intelligence": AI-generated quests, an AI Game Master), and a rules-based heuristic like Quest
Board's `findNeglectedAttribute` doesn't generalize to "read a goal's title and propose a project
plan." What's built instead is the *structure* the roadmap's example goal shape implies -
`Description, Target, Deadline, Skills, Milestones` (all pre-existing or new this sprint) and
`Recommended Quests, Recommended Habits` (already possible today via `Quest.goalId`/`Habit.goalId`
- a user links them manually) - without the "recommended"/auto-suggested part. This mirrors how
Feature 2 and Feature 3 both scoped "a fuller analysis engine" out in favor of a narrower real
heuristic (or, here, no heuristic at all - just the manual building blocks). `Rewards` from the
same list is the pre-existing XP Bundle machinery (`xpReward`, `GoalSkill.amount`,
`ActivityAttributeBonus`), unchanged this sprint. See `gameplay-systems.md` § "Better Goals:
milestones and quest-linked auto-progress (Feature 8)" for the full design, including a real bug
fix that shipped alongside this feature: `COMPLETION`-type goals previously never updated their
progress automatically when a linked quest completed - they do now.

**Deliberate deviation:** Feature 9's proposal names 8 specific archetypes (Warrior, Scholar,
Athlete, Entrepreneur, Creator, Socialite, Balanced, Custom) inferred from the user's attribute
distribution. Rather than building a stored classification, this is computed entirely client-side
from data `GET /attributes` already returns (each attribute's `level`) - no new backend endpoint,
model, or migration. A small curated table maps specific attribute pairs to a named archetype
(e.g. Physical+Discipline → Warrior); a fallback ("Balanced") applies when the top two attribute
levels are close enough that no single pairing dominates, and another ("Explorer," not the
roadmap's "Custom" - a friendlier name for the same "doesn't match a curated pair" case) covers
everything else. This is intentionally read-only and re-derived on every view, matching the
roadmap's own requirement that a build "never permanently locks the user."

**Deliberate deviation:** Feature 10's proposal is a visual progression tree per skill with
concrete tier unlocks (e.g. "Strength Level 5 → Beginner Strength Quests"). What's built is the
tier *labeling* half only - a skill's level maps to a named tier (Beginner/Novice/Intermediate/
Advanced/Master, thresholds tunable in one place), computed client-side from `skill.level`
exactly like Feature 9's archetype, no backend change. The "concrete unlocks per tier" half is
deliberately not built: `LevelRewardsService` (Sprint 3) was explicitly designed to never target a
skill, since skills are user-created rather than fixed like the 8 attributes - see
`gameplay-systems.md` § "Level-up rewards (Feature 6)" for that reasoning. Building per-skill tier
unlocks would mean either reopening that decision or inventing a second, parallel unlock mechanism
for one visual flourish; neither is justified by "skills should look like a tier chain."

**Deliberate deviation:** Feature 14 ("Identity System") is not built this sprint, and is left
entirely for later. The roadmap's own text calls it "a long-term feature" and "the emotional core
of the product" in the same breath - a synthesis of XP distribution, completed quests, goals,
achievements, "recent behaviour," and season focus into a narrative identity statement. That last
part in particular - reading "recent behaviour" into a characterization - edges toward the kind of
open-ended synthesis the roadmap itself reserves for Phase 4 ("Intelligence Layer"), not something
a fixed rules table can do honestly the way Feature 9's archetype lookup can. It also has a real
dependency this sprint just created: Feature 14's "contrasting a previous chapter against the
current one" reads naturally as built on top of `Season` history, which won't have any real
history to synthesize from until seasons have actually been used for a while. Revisit once there's
season data to work with and once Phase 4 groundwork exists.

**Deliberate deviation:** Feature 15's `DAILY CAPACITY: 78/100` is described as "influenced by
sleep, recent workload, training, stress, recovery, rest, and momentum" - seven inputs combined
into one weighted score. What's built averages just two of them (`mood`, `energyLevel`) over a
3-day window. The other five either aren't trackable data anywhere in this app yet (workload,
training load, "momentum") or would need an invented weighting formula with zero real usage data
to calibrate it against - a made-up "sleep counts for 30%, stress for 20%" split would be
indistinguishable from a random number generator dressed up as a formula. The light version is
honest about what it actually measures; the full version is worth building once there's a real
dataset (i.e. once users have been logging journal entries for a while) to validate weights
against, not before. Also per the roadmap's own explicit requirement, capacity never gates
anything in this codebase - purely informational.

**Deliberate deviation:** Feature 16 ("Recovery System") is not built this sprint. Its two stated
halves don't leave a clean net-new backend feature: "a recovery quest can itself carry real
rewards" is already fully possible today via the existing `Quest`/`Habit` system (a user can
already create a "30-minute walk" quest tagged to Energy/Discipline with an XP reward - no new
schema needed), and "recommended specifically when capacity is low" is recommendation logic that
belongs with Phase 4's Feature 20 ("Personalised Recommendations"), not this sprint. Building a
recommendation engine now, before Phase 4's groundwork exists, would mean either a throwaway
one-off or prematurely committing to Phase 4's design before it's been thought through.

**Deliberate deviation:** Feature 19's example timeline mixes character milestones ("Character
Level 15") with attribute milestones ("Physical Level 3"). The built `getTimeline` only
reconstructs character level-ups, not all 8 attributes' - replaying every attribute's XP history
the same way `reconstructLevelUps` does for the character would be roughly 9x the query and
computation cost for what's already a six-source merge, and attribute-level milestones are
already partially surfaced today via `Achievement`'s `ATTRIBUTE_LEVEL_REACHED` requirement type for
whichever ones a seeded achievement happens to target (e.g. "Getting Physical" at Physical Level
2). A full per-attribute timeline reconstruction is a reasonable future addition once there's
demand for it, not a gap worth the cost for this first pass.

**Deliberate deviation (Sprint 7, all of Phase 4):** Every Phase 4 feature explicitly names AI/LLM
behavior - "the system analyses ... and recommends" (20), "AI could sit on top of the existing
structured systems - analysing progress, generating quests" (22). This codebase has no LLM
integration anywhere, and wiring one up is a real infrastructure/cost decision (an API key,
ongoing per-call cost) rather than a code judgment call - the user was asked directly how to
approach Sprint 7 and chose a rules-based-heuristics-only path, no real LLM calls. Everything below
follows from that choice, not from a unilateral scope cut.

**Deliberate deviation:** Feature 20's proposal analyses "current goals, recent activities, skill
progression, XP distribution, energy, momentum, and unfinished quests" through one implied
synthesis step. What's built instead is five *independent* fixed heuristics
(`RecommendationsService.getRecommendations`), each returning nothing when its own signal isn't
real rather than all five being forced through a shared scoring/ranking model - inventing relative
weights across heuristics with no usage data to calibrate them against is the same trap Feature
15's Daily Capacity explicitly avoided (see that note above). See `docs/gameplay-systems.md`
§ "Recommendations and Weekly Review (Sprint 7)" for what each of the five heuristics is and why.

**Deliberate deviation:** Feature 21 is built one-sided. "If the user constantly completes quests
easily, recommend increasing difficulty" is built (`DIFFICULTY_READY` - the last 5 claimed
completions were all Easy/Medium). "If they repeatedly fail, recommend reducing the target" is
not: this app has no failure/abandon signal anywhere in the data model. Deleting a quest
(`QuestsService.remove`) is indistinguishable from never having created one, and
`QuestStatus.ARCHIVED` is defined in the schema but no code path ever sets it. Treating old
still-`ACTIVE` quests as implicit failures would conflate "gave up" with "still working on it
slowly" - exactly the kind of dishonest inference this codebase has avoided everywhere else (e.g.
`score: null` rather than a guessed number when Daily Capacity has no data). Building the failure
half honestly would require adding real failure/abandonment tracking first (e.g. an explicit
"archive" action, or an expiry rule for `DEADLINE` quests) - a larger change than "adaptive
difficulty" itself, and out of scope for this pass.

**Deliberate deviation:** Feature 22 ("AI Game Master") is narrowed to `GET /recommendations/
weekly-review` - a structured digest of numbers that already exist elsewhere individually (XP this
week vs. last week, quests/habits completed, top skill, neglected attribute, streak), not
natural-language generation. None of "analysing progress, generating quests, adjusting difficulty,
creating weekly reviews [as prose], identifying neglected attributes [as narrative], suggesting
goals, detecting patterns, and creating seasonal narratives" beyond that one structured digest is
built - all of it either requires actual LLM synthesis (explicitly out of scope per the note
above) or, for "identifying neglected attributes," is already covered by the `NEGLECTED_ATTRIBUTE`
recommendation card and Quest Board/Challenges' existing use of the same heuristic.
