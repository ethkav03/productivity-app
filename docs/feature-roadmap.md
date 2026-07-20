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
Phase 1+ feature.

| Item | Status |
| --- | --- |
| 0.2 — XP Source Metadata | **Done.** `XPTransaction.sourceName`, captured at write time. See `gameplay-systems.md` § "The centralised XP ledger". |
| Ledger invariant tests (pulled forward from its Sprint 1 position) | **Done.** `common/leveling.spec.ts`, `xp/xp.service.spec.ts` - the project's first tests. |
| 5 — XP History | **Done.** `GET /analytics/xp-history` + `/analytics/history` page. Graph/daily-weekly-monthly breakdowns from the roadmap's "should eventually support" list are not built - the existing `/analytics` XP-over-time chart already covers that need. |
| 0.3 — XP Bundles | **Done.** Per-skill XP overrides (`QuestSkill`/`HabitSkill`/`GoalSkill.amount`) and attribute-only bonus XP (`ActivityAttributeBonus`), wired into all three creation modals via a shared `RewardBundleEditor`. See `gameplay-systems.md` § "XP Bundles: per-skill overrides and attribute-only bonuses". |
| 0.1 — Internal domain events | Not yet built. |
| Everything in Phases 1-4 | Not yet built - out of scope for Sprint 1. |

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
