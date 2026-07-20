# Life RPG Character Stats — Attribute Hierarchy Specification

> This is the second product specification provided to this project, after the MVP
> ([`mvp-spec.md`](./mvp-spec.md)) was already built. It proposes replacing the MVP's flat skill
> list with a two-tier hierarchy — 8 top-level **Attributes**, each containing several
> **Skills** — and is reproduced here verbatim (formatting adapted to Markdown) as the canonical
> product-level reference for that system. For how it was actually implemented, see
> [`gameplay-systems.md`](./gameplay-systems.md) (mechanics), [`data-model.md`](./data-model.md)
> (schema), and [`design-system.md`](./design-system.md) (the attribute color palette).

I'd structure each **main attribute as a category**, with individual **skills/stats
underneath** that can be levelled independently.

## 🎮 Life RPG Character Stats

### 💪 Physical

Your physical capability, health and body.

| Skill | Represents |
| --- | --- |
| Strength | Ability to produce force |
| Endurance | Ability to sustain physical activity |
| Speed | How quickly you can move |
| Agility | Coordination and ability to change direction |
| Mobility | Range of motion and movement quality |
| Balance | Stability and body control |
| Coordination | Ability to control complex movements |
| Health | Overall physical condition |
| Recovery | Ability to recover from exercise and fatigue |
| Appearance | Physical presentation and body composition |

Example:

```
Physical Level 24
Strength 30 · Endurance 18 · Mobility 14 · Speed 21 · Recovery 17
```

### 🧠 Intelligence

Your ability to acquire, understand and use information.

| Skill | Represents |
| --- | --- |
| Knowledge | Information you have learned |
| Learning | How effectively you acquire new skills |
| Logic | Reasoning and structured thinking |
| Problem Solving | Ability to overcome complex challenges |
| Memory | Ability to retain and recall information |
| Focus | Ability to concentrate on a task |
| Critical Thinking | Evaluating information and identifying flaws |
| Technical Skill | Ability to understand complex systems |
| Adaptability | Ability to learn and adjust to new situations |

For a developer, this could contain:

> Programming · Algorithms · Architecture · Debugging · Mathematics · Communication

### 🛡 Discipline

Your ability to consistently act according to your goals.

| Skill | Represents |
| --- | --- |
| Consistency | Repeatedly doing something over time |
| Self-Control | Resisting short-term temptations |
| Focus | Staying on one task |
| Routine | Maintaining structured habits |
| Persistence | Continuing despite difficulty |
| Time Management | Using time effectively |
| Delayed Gratification | Sacrificing short-term pleasure for long-term reward |
| Execution | Turning plans into completed actions |
| Reliability | Doing what you said you would do |

This could be one of the most important attributes because almost every other stat benefits
from it.

### ⚡ Energy

Your available physical and mental resources.

Unlike most stats, this could function more like a **daily resource bar**.

| Skill | Represents |
| --- | --- |
| Sleep | Quality and consistency of sleep |
| Vitality | General physical energy |
| Mental Energy | Capacity for thinking and concentrating |
| Recovery | Ability to restore energy |
| Stress Management | Ability to prevent energy drain |
| Nutrition | Fuel quality and consistency |
| Health Maintenance | Managing factors that affect energy |
| Work Capacity | How much you can accomplish before exhaustion |

Example:

```
Energy
███████░░░ 72/100

Sleep:     78
Recovery:  64
Nutrition: 82
Stress:    51
Mental:    70
```

I would potentially make Energy a temporary stat affected by your permanent stats. For example:

> You don't gain **Strength** from intending to train.
> You gain Strength from actually completing the workout.

> Good Sleep + Good Nutrition + Good Recovery = High Energy

### 🗣 Social

Your ability to interact with, understand and build relationships with people.

| Skill | Represents |
| --- | --- |
| Communication | Clearly expressing yourself |
| Conversation | Ability to hold engaging conversations |
| Confidence | Comfort in social situations |
| Charisma | Ability to attract and engage others |
| Empathy | Understanding other people's emotions |
| Listening | Ability to properly understand others |
| Humour | Ability to create enjoyment and connection |
| Networking | Building useful relationships |
| Leadership | Influencing and guiding others |
| Conflict Resolution | Handling disagreements effectively |
| Relationships | Maintaining meaningful connections |

This could be especially interesting because some stats could be levelled through **quests**.

```
Quest: Start a conversation with someone new
Reward: +25 Social XP
```

### 💰 Wealth

Your financial resources, knowledge and independence.

| Skill | Represents |
| --- | --- |
| Income | Your ability to generate money |
| Career | Progression in your profession |
| Financial Knowledge | Understanding money and finance |
| Budgeting | Managing your income and expenses |
| Saving | Building financial reserves |
| Investing | Growing wealth over time |
| Entrepreneurship | Creating businesses or income streams |
| Negotiation | Improving financial outcomes |
| Career Skills | Skills that increase your earning potential |
| Financial Security | How resilient you are to unexpected costs |

I would be careful with this one, though. A person shouldn't gain Wealth XP simply because they
earn more money than somebody else. The app should focus more on **progress and financial
behaviours**. For example:

```
Save €100 → +100 Saving XP
Learn about investing → +50 Financial Knowledge XP
Negotiate a pay rise → +200 Negotiation XP
```

### 🎨 Creativity

Your ability to generate, develop and express ideas.

| Skill | Represents |
| --- | --- |
| Ideation | Generating new ideas |
| Imagination | Creating possibilities mentally |
| Innovation | Finding new solutions |
| Expression | Communicating ideas creatively |
| Design | Creating visually or functionally |
| Writing | Expressing ideas through words |
| Art | Visual or physical creative expression |
| Music | Musical creativity and performance |
| Building | Turning ideas into real things |
| Experimentation | Trying new approaches |

For someone building software, this could be:

> App Ideas · UI Design · Architecture · Writing · Photography · Music · Video

A major principle here would be:

> **Ideas give small XP. Finished creations give huge XP.**

### 🧘 Wisdom

Your ability to make good decisions and understand yourself and the world.

| Skill | Represents |
| --- | --- |
| Self-Awareness | Understanding yourself |
| Decision Making | Choosing effectively |
| Emotional Intelligence | Understanding and managing emotions |
| Perspective | Seeing the bigger picture |
| Experience | Learning from what happens to you |
| Judgement | Recognising good and bad choices |
| Patience | Avoiding impulsive decisions |
| Adaptability | Adjusting when circumstances change |
| Reflection | Learning from past experiences |
| Values | Understanding what matters to you |

This is probably the hardest stat to gamify. You shouldn't simply get:

> "Read a quote → +50 Wisdom XP"

Instead:

```
Reflect on a difficult experience → +10 Reflection XP
Make a difficult decision → +25 Decision Making XP
Successfully change behaviour based on a past mistake → +100 Wisdom XP
```

## 🧩 The Full Character Sheet

A character might look something like:

```
╔══════════════════════════════════╗
║ ETHAN — LEVEL 24                  ║
╠══════════════════════════════════╣
║ 💪 PHYSICAL          LEVEL 22     ║
║   Strength                28      ║
║   Endurance                19      ║
║   Mobility                 15      ║
║   Recovery                 17      ║
║                                    ║
║ 🧠 INTELLIGENCE      LEVEL 25     ║
║   Programming               31      ║
║   Problem Solving           26      ║
║   Learning                  24      ║
║                                    ║
║ 🛡 DISCIPLINE         LEVEL 19     ║
║   Consistency               23      ║
║   Focus                     17      ║
║   Execution                 20      ║
║                                    ║
║ ⚡ ENERGY             LEVEL 18     ║
║   Sleep                     16      ║
║   Recovery                  17      ║
║   Vitality                  21      ║
║                                    ║
║ 🗣 SOCIAL             LEVEL 16     ║
║ 💰 WEALTH             LEVEL 20     ║
║ 🎨 CREATIVITY         LEVEL 23     ║
║ 🧘 WISDOM             LEVEL 15     ║
╚══════════════════════════════════╝
```

## My recommendation for the app

I would **not** make every one of these a visible "main stat" on the dashboard. That could
become overwhelming. I would use a hierarchy:

**Tier 1 — 8 Attributes** — the big categories:

> Physical · Intelligence · Discipline · Energy · Social · Wealth · Creativity · Wisdom

**Tier 2 — 5–10 Skills per Attribute** — the individual things that can be levelled:

> Physical → Strength, Endurance, Mobility, Speed, Recovery

**Tier 3 — Activities** — the things the user actually does:

```
Gym session       → Strength XP
Run               → Endurance XP
Stretching        → Mobility XP
Sleep 8 hours     → Recovery XP
```

**Tier 4 — Quests** — specific objectives:

```
Quest: Run 5 km in under 25 minutes
Requirement: Endurance Level 10
Reward: +500 Endurance XP
Unlock: "Distance Runner" achievement
```

That gives you a very clean progression:

> **Real-life action → Skill XP → Skill Level → Attribute Level → Character Level → Unlocks**

The particularly powerful part of this system is that the user can see that small daily actions
are building a larger character over time.

---

## Implementation notes

What was actually built differs from this spec in a few deliberate, documented ways — see
[`gameplay-systems.md`](./gameplay-systems.md) § "The attribute hierarchy" for the full
rationale:

- **Tier 3/4 (Activities/Quests) were not split into two separate concepts.** The existing MVP's
  Quest and Habit entities already cover this role; this spec's "Activities" tier maps onto
  Habits (recurring, XP per completion) and its "Quests" tier maps onto the MVP's existing
  Quest entity — no new entity was introduced.
- **No "Requirement: Endurance Level 10" gating was implemented for quests.** Quests do not
  currently have prerequisite skill/attribute levels; this remains a documented gap, not an
  intentional omission. The achievement system supports a comparable concept
  (`ATTRIBUTE_LEVEL_REACHED`) on the *reward* side — unlocking an achievement once an attribute
  reaches a level — but nothing gates quest availability on a skill/attribute level.
- **Energy was not implemented as a decaying/temporary resource bar.** It is one of the 8
  permanent, XP-accumulating attributes like every other, not a special daily resource that
  drains. The "Good Sleep + Good Nutrition + Good Recovery = High Energy" derived-stat concept
  was not built.
- **The "Ideas give small XP, finished creations give huge XP" and "Wisdom shouldn't be
  gamified with trivial actions" principles are design guidance for whoever creates quests/habits
  (choosing XP values and quest difficulty), not enforced by code** — the system has no concept
  of an idea/creation distinction.
- **Duplicate skill names across attributes are supported at the schema level** (`Skill`
  uniqueness is scoped to `[userId, attributeId, name]`, not `[userId, name]`) specifically
  because this spec's own tables repeat names across attributes (e.g. "Focus" under both
  Intelligence and Discipline; "Recovery" under both Physical and Energy; "Adaptability" under
  both Intelligence and Wisdom).
- **The default skill list per attribute** (`backend/src/skills/default-skills.ts`) was seeded
  directly from this spec's per-attribute skill tables, with the "Represents" column reused
  verbatim as each skill's description.
