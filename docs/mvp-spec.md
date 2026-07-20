# Life RPG — MVP Product Specification

> This is the original product specification the implementation is derived from (provided as a
> document at project kickoff). It is reproduced here verbatim (formatting adapted to Markdown)
> as the canonical product-level reference — `backend/prisma/schema.prisma` and other source
> files point back to this document. For a second specification that extended the skill system
> into a full attribute hierarchy after this MVP was built, see
> [`attribute-hierarchy-spec.md`](./attribute-hierarchy-spec.md). For how the current
> implementation maps onto this spec, see [`architecture.md`](./architecture.md) and
> [`gameplay-systems.md`](./gameplay-systems.md).

A gamified personal development platform where real-world actions become character progression.

This document defines the product vision, MVP scope, gameplay systems, user workflows, data
model, backend architecture, API structure, technical stack, and development roadmap for Life RPG.

## 1. Product Overview

Life RPG turns personal development into a game-like progression system. Users create goals and
activities in real life. By completing them, they earn XP, improve skills, complete quests,
maintain habits, unlock achievements, and progress toward larger objectives.

> Your real life is the game.

Unlike a traditional habit tracker, Life RPG should make the user feel that their real-world
actions are actively building a character.

## 2. Core Gameplay Loop

1. Create a goal.
2. Break the goal into quests and habits.
3. Complete quests and habits.
4. Earn XP.
5. Level up skills and the overall character.
6. Unlock achievements.
7. Review progress and analytics.
8. Create more ambitious goals.

```
Goal: Lose 15 kg
 ↓
Skills: Fitness, Nutrition, Discipline
 ↓
Quests: Complete 3 gym sessions, track calories, run 5 km, reach 100 kg
 ↓
Rewards: Fitness XP, Nutrition XP, Discipline XP
 ↓
Progression: Fitness Level 12 → Level 13
```

## 3. MVP Scope

Core systems:

- User account and profile
- Skills and XP
- Goals and quests
- Habits
- Achievements
- Analytics and progress

Supporting systems:

- Dashboard
- Notifications
- Activity history
- Settings

## 4. Character and Progression

Each user has a personal character profile. The character is the central entity in the
application.

```
User
├── Username
├── Avatar
├── Level
├── Total XP
├── Current XP
├── XP required for next level
├── Current streak
├── Longest streak
├── Skills
├── Achievements
├── Active quests
└── Statistics
```

Example:

```
Ethan — Level 24
Total XP: 12,840
XP to next level: 460
Current streak: 8 days

Fitness      Level 17
Nutrition    Level 12
Technology   Level 21
Learning     Level 9
Discipline   Level 15
```

## 5. XP and Level System

XP is the core progression currency. Users earn XP by completing meaningful activities.

| Source | Example Reward |
| --- | --- |
| Small quest | +25 XP |
| Medium quest | +50 XP |
| Large quest | +100 XP |
| Major milestone | +250 XP |
| Habit completion | +10 to +50 XP |
| Major goal completion | +500 to +1,000 XP |

Recommended MVP formula:

```
XP Required = 100 × Current Level
```

Example:

```
Level 1 → Level 2: 100 XP
Level 2 → Level 3: 200 XP
Level 3 → Level 4: 300 XP

LEVEL UP!
You reached Level 25.

Rewards:
+1 Skill Point
New achievement unlocked
```

## 6. Skills System

Skills represent the areas of life the user wants to improve. The MVP can provide default skills
while allowing custom skills.

- Fitness
- Nutrition
- Sleep
- Mental Wellbeing
- Discipline
- Productivity
- Confidence
- Programming
- Languages
- Reading
- Finance
- Creativity

Activities can award XP to multiple skills.

```
Complete gym workout
→ Fitness +50 XP
→ Discipline +10 XP

Study TypeScript for 2 hours
→ Programming +100 XP
→ Discipline +20 XP
```

Skill detail pages should show current level, XP progress, weekly XP, recent activities, and
progression over time.

> **Implementation note:** this default skill list was superseded by a much larger, attribute-grouped
> skill list after the attribute hierarchy was added — see
> [`attribute-hierarchy-spec.md`](./attribute-hierarchy-spec.md) and
> `backend/src/skills/default-skills.ts`.

## 7. Goals

Goals represent larger objectives that usually require multiple actions.

- Lose 15 kg
- Run a marathon
- Learn React
- Save €5,000
- Read 20 books
- Get promoted

**Goal properties**

- Title
- Description
- Category
- Target type
- Start date
- Target date
- Current progress
- Target value
- Unit
- Status
- Associated skills
- Associated quests

**Goal types**

- Numeric goals — e.g. lose 15 kg or save €5,000.
- Completion goals — e.g. complete 20 learning milestones.
- Binary goals — e.g. complete a half marathon.

## 8. Quests

Quests are actionable tasks that contribute to goals.

```
Goal: Learn TypeScript

Quests:
☐ Complete TypeScript course
☐ Build a project
☐ Learn generics
☐ Learn advanced types
☐ Build a full-stack application
```

**Quest types**

- One-time quest
- Recurring quest
- Deadline quest
- Milestone quest

**Quest creation workflow**

```
CREATE QUEST

Quest name: Complete gym session
Description: Train lower body
Quest type: Recurring
Difficulty: Medium
Associated skills: Fitness, Discipline
XP reward: 50 XP
Deadline: Optional

[Create Quest]
```

| Difficulty | XP |
| --- | --- |
| Easy | 25 |
| Medium | 50 |
| Hard | 100 |
| Epic | 250 |
| Legendary | 500 |

## 9. Habits and Streaks

Habits are recurring behaviours such as drinking water, reading, training, meditating, tracking
nutrition, and sleeping on time.

**Habit properties**

- Name
- Description
- Frequency
- Days
- Time
- XP reward
- Associated skills
- Current streak
- Longest streak
- Completion history

**Supported frequencies**

- Daily
- Specific days of the week
- A number of times per week
- Monthly

```
TODAY'S HABITS

☐ Drink 2L Water        +10 XP
☑ Complete Workout      +50 XP
☐ Read 30 Minutes       +20 XP
☐ Track Calories        +15 XP

Daily Progress
██████░░░░ 50%

Current streak: 12 days
Longest streak: 31 days
```

The MVP should track streaks but avoid making the system overly punitive. A future version could
introduce streak freezes.

## 10. Achievements

Achievements reward meaningful milestones and provide long-term objectives.

- First Steps — complete your first quest.
- Level 10 — reach Level 10.
- Veteran — reach Level 25.
- Consistent — maintain a 7-day streak.
- Dedicated — maintain a 30-day streak.
- First Workout — complete your first fitness activity.
- Goal Setter — create your first goal.
- Finisher — complete your first goal.
- Overachiever — complete 10 goals.

Achievements should be driven by data-based conditions rather than hard-coded individual features.

```
Achievement: "Dedicated"
Condition: longest_streak >= 30

Achievement: "Quest Hunter"
Condition: completed_quests >= 100
```

## 11. Dashboard and User Experience

The dashboard is the most important screen. It should answer: What should I do today?

```
GOOD MORNING, ETHAN

Level 24
████████░░░░
460 XP until Level 25

8 Day Streak

TODAY'S PROGRESS
████████░░ 80%
4 / 5 activities completed

TODAY'S QUESTS
☑ Morning Gym Session
☑ Track Calories
☐ Study TypeScript
☐ Read 30 Minutes

ACTIVE GOALS
Lose 15 kg        ██████░░░░░░ 32%
Learn TypeScript  ████████░░░░ 68%

RECENT ACHIEVEMENTS
7 Day Streak
Goal Setter
```

**Activity feed**

```
09:00 — Completed Gym Session — +50 Fitness XP
12:30 — Logged Nutrition Goal — +15 Nutrition XP
18:00 — Studied TypeScript — +100 Programming XP
```

## 12. Analytics

Analytics are one of the strongest portfolio aspects of Life RPG because the application
naturally produces meaningful historical data.

| Metric | Example |
| --- | --- |
| Total XP | 12,840 |
| XP this week | +640 |
| Activities completed | 38 |
| Current streak | 8 days |
| Most improved skill | Fitness |

**Analytics views**

- XP gained over time
- Skill progression
- Goal progress
- Activity frequency
- Habit consistency
- Calendar activity heatmap
- Weekly and monthly summaries

The calendar can show activity intensity by day, similar to a contribution graph.

## 13. Notifications

Notifications help turn Life RPG from a passive dashboard into a behaviour-supporting
application.

- Habit reminders
- Quest deadline reminders
- Streak warnings
- Level-up notifications
- Achievement unlocks
- Goal milestone notifications

```
Reminder: You have 2 habits remaining today.
Deadline: "Complete React course" is due in 2 days.
Streak: Your 8-day streak is at risk. Complete one activity today.
```

## 14. Onboarding

The first-time experience should get the user to value quickly.

1. Welcome — explain the core idea.
2. Choose or create skills.
3. Create a first goal.
4. Create the first habits or quests that support the goal.
5. Enter the dashboard with a Level 1 character.

```
WELCOME TO LIFE RPG
Turn your goals into progress.

[Begin Your Journey]

→ Choose Skills
→ Create First Goal
→ Create Supporting Activities
→ Begin Journey
```

## 15. Data Model

A relational database is a strong fit for the MVP.

```
User
│
├── Skill
│   └── SkillXPTransaction
│
├── Goal
│   └── Quest
│
├── Habit
│   └── HabitCompletion
│
├── Achievement
│   └── UserAchievement
│
├── XPTransaction
│
└── Notification
```

| Entity | Important fields |
| --- | --- |
| User | id, username, email, passwordHash, level, totalXP |
| Skill | id, userId, name, description, level, totalXP |
| Goal | id, userId, title, type, targetValue, currentValue, deadline, status |
| Quest | id, userId, goalId, title, difficulty, xpReward, status, deadline |
| Habit | id, userId, title, frequency, xpReward, currentStreak, longestStreak |
| HabitCompletion | id, habitId, completedAt |
| XPTransaction | id, userId, skillId, amount, sourceType, sourceId, createdAt |
| Achievement | id, name, description, requirementType, requirementValue |
| UserAchievement | id, userId, achievementId, unlockedAt |
| Notification | id, userId, type, title, message, read, createdAt |

> **Implementation note:** the shipped schema (`backend/prisma/schema.prisma`) extends this with
> an `Attribute` model and per-skill `attributeId` (see
> [`attribute-hierarchy-spec.md`](./attribute-hierarchy-spec.md)), and `XPTransaction` gained an
> `attributeId` column so the XP cascade can mirror into the owning attribute. See
> [`data-model.md`](./data-model.md) for the current, authoritative schema reference.

## 16. Backend Architecture and Business Logic

The most interesting backend workflow is what happens when a user completes an activity.

```
User clicks Complete
        ↓
Validate the activity
        ↓
Check it has not already been completed
        ↓
Mark it complete
        ↓
Create XP transaction
        ↓
Add XP to user
        ↓
Add XP to relevant skills
        ↓
Calculate level changes
        ↓
Update streaks
        ↓
Check achievements
        ↓
Create notifications
        ↓
Return completion result

{
  "questCompleted": true,
  "xpGained": 60,
  "levelUp": true,
  "newLevel": 25,
  "achievementsUnlocked": ["Level 25"]
}
```

**Centralised XP service**

All XP awards should flow through a centralised service rather than directly modifying a user
record.

```ts
xpService.awardXP({
  userId,
  amount: 50,
  sourceType: 'QUEST_COMPLETION',
  sourceId: questId,
  skillId
});

Quest completion  → XP Service
Habit completion  → XP Service
Goal completion   → XP Service
Achievement reward → XP Service
```

**Business rules**

- XP cannot be duplicated for the same one-time activity.
- XP transactions should be immutable.
- Corrections should be represented by correcting transactions rather than editing history.
- A habit should not award XP twice for the same required period.
- XP should be earned through recorded actions rather than arbitrary manual editing.

> **Implementation note:** this workflow is implemented by `ProgressionService.completeActivity`
> and `XpService.awardXp` — see [`gameplay-systems.md`](./gameplay-systems.md) for the exact
> current implementation, including the attribute-cascade extension and the three distinct
> duplicate-prevention mechanisms (one-time quests, recurring quests, habits).

## 17. API Structure

```
/auth
    POST /register
    POST /login
    POST /refresh

/users
    GET /me
    PATCH /me

/skills
    GET /
    POST /
    GET /:id
    PATCH /:id
    DELETE /:id

/quests
    GET /
    POST /
    GET /:id
    PATCH /:id
    POST /:id/complete

/habits
    GET /
    POST /
    PATCH /:id
    DELETE /:id
    POST /:id/complete

/goals
    GET /
    POST /
    PATCH /:id
    POST /:id/progress

/achievements
    GET /
    GET /unlocked

/analytics
    GET /overview
    GET /xp
    GET /skills
    GET /activity
```

> **Implementation note:** the shipped API is a superset of this (adds `/attributes`,
> `/notifications`, `DELETE` on quests/goals, `GET /goals/:id`, and `/analytics/attributes` +
> `/analytics/feed`). See [`api-reference.md`](./api-reference.md) for the complete, current
> reference.

## 18. Technical Architecture

| Layer | Recommended technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Data fetching | TanStack Query |
| Charts | Recharts or equivalent |
| Backend | NestJS and TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Authentication | JWT-based authentication |
| Infrastructure | Docker |
| Future jobs | Redis and background job processing |

**Suggested navigation**

```
Dashboard
├── Skills
│   ├── All Skills
│   └── Skill Details
├── Quests
│   ├── Active
│   ├── Completed
│   └── Create Quest
├── Habits
│   ├── Today
│   ├── All Habits
│   └── Streaks
├── Goals
│   ├── Active
│   ├── Completed
│   └── Create Goal
├── Achievements
├── Analytics
└── Settings
```

## 19. MVP Development Roadmap

**Phase 1 — Foundation**

- User registration
- Login
- Authentication
- Profile
- Database structure

**Phase 2 — Core Gameplay**

- XP
- Levels
- Skills
- Quest creation
- Quest completion

**Phase 3 — Habit System**

- Create habits
- Daily tracking
- Streaks
- Habit XP

**Phase 4 — Goals**

- Create goals
- Track progress
- Link quests to goals
- Goal completion

**Phase 5 — Achievements**

- Achievement definitions
- Achievement checking
- Unlock notifications

**Phase 6 — Analytics**

- XP charts
- Skill progression
- Goal progress
- Activity calendar

**Phase 7 — Notifications**

- In-app notifications
- Reminders
- Deadline notifications

## 20. Example User Journey

A user joins Life RPG and creates:

```
Goal: Run 10 km
Skills: Fitness, Discipline
Habits: Run 3 times per week, Stretch daily

Quest completed: First 5K Run

Rewards:
+100 Fitness XP
+25 Discipline XP

Achievement unlocked:
First Steps
```

After 30 days:

```
Level 8
Fitness: Level 6
Discipline: Level 4

Achievements:
First Run
7 Day Streak
Goal Setter
Quest Hunter
```

> "I went running."
>
> becomes
>
> "That run contributed to my Fitness skill, Discipline skill, 10K goal, weekly streak, and
> overall character level."

## 21. Portfolio Differentiators

- A proper XP event and transaction system rather than simply incrementing a number.
- A flexible achievement engine driven by configurable conditions.
- Historical analytics based on real activity data.
- A polished dashboard that answers what the user should do today.
- A coherent product experience rather than a collection of disconnected CRUD screens.
- Strong UX that combines the motivation of a game with the usefulness of a personal
  productivity tool.

> Duolingo + Strava + Notion + RPG progression

## 22. Final MVP Definition

The MVP is complete when a user can:

1. Create an account.
2. Select or create skills.
3. Create a goal.
4. Create quests linked to that goal.
5. Create recurring habits.
6. Complete quests and habits.
7. Earn XP.
8. Level up their character.
9. Progress individual skills.
10. Maintain streaks.
11. Unlock achievements.
12. View analytics.

```
GOALS
  ↓
QUESTS / HABITS
  ↓
ACTIVITIES
  ↓
XP
  ↓
SKILLS
  ↓
LEVELS
  ↓
ACHIEVEMENTS
  ↓
ANALYTICS
```

The strongest initial build is not the largest possible version. It is a small but complete
progression system where every feature connects to the same central loop.

Recommended first playable version:

```
Login
  ↓
Create a skill
  ↓
Create a quest
  ↓
Complete the quest
  ↓
Earn XP
  ↓
Level up
  ↓
View progress
```

From there, the product can expand naturally into habits, goals, achievements, analytics,
notifications, and eventually advanced features such as social progression, challenges,
leaderboards, integrations, and automated goal planning.
