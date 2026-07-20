# Frontend Reference

The frontend (`frontend/`) is a Next.js 14 App Router application written in TypeScript, styled
with Tailwind CSS. Server state (everything that comes from the API) is managed with TanStack
Query; local/UI state is plain React `useState`. Routing and layout nesting follow Next.js route
groups: three top-level segments under `frontend/app` each own a `layout.tsx` that decides who is
allowed to see the pages inside it, and each gates on the same `useAuth()` state.

This document describes the App Router structure, the auth gating logic, the onboarding wizard,
the shared hooks, and the navigation shell. It does not reproduce component JSX line-by-line -
for exact prop shapes, read the referenced files directly.

## Routing structure

`frontend/app` contains four routing segments plus a root page:

- **`app/(auth)/`** - a Next.js *route group* (the parenthesized name doesn't appear in the URL)
  for unauthenticated pages: `/login` and `/register`. Its `layout.tsx` renders a minimal
  centered card layout (logo + `{children}`) and performs **no auth check of its own** - it does
  not redirect an already-logged-in user away from `/login` or `/register`. The
  "redirect to `/dashboard` if already logged in" behavior actually lives one level up, in
  `app/page.tsx` (see below): that's the only place that inspects auth state before landing a
  user on an auth page.
- **`app/(app)/`** - a route group for the main authenticated app: dashboard, skills, quests,
  habits, goals, achievements, analytics, settings. Its `layout.tsx` gates on `useAuth()` and, once
  authenticated, wraps every page in `AppShell` (sidebar + topbar + mobile nav).
- **`app/onboarding/`** - a real (non-grouped) route segment, so it appears in the URL as
  `/onboarding`. It has its own `layout.tsx` that applies the identical auth gate as `(app)` but
  renders only a bare `min-h-screen bg-background` wrapper - **no** `AppShell`, no sidebar/topbar.
  It is protected like the main app but visually stands alone, appropriate for a first-run wizard.
- **`app/admin/`** - a real (non-grouped) route segment (`/admin`), gated like `onboarding` but
  with an *additional* check: `layout.tsx` redirects to `/dashboard` (not `/login`) if the
  authenticated user's `isAdmin` is falsy. Renders its own minimal header (title + "Back to app" +
  theme toggle) rather than `AppShell` - it's a separate tool, not a page within the main nav.
  Reachable only via a conditional "Admin Dashboard" link in the `Topbar` account menu, shown only
  when `user.isAdmin` (see `Topbar` below) - there's no entry in `NAV_ITEMS`.
- **`app/page.tsx`** - the root `/` route, not inside any group. It renders nothing but a
  `PageSpinner` and, once `useAuth()` finishes loading, replaces the URL with `/dashboard` (if
  `isAuthenticated`) or `/login` (otherwise). This is the single place in the app that redirects a
  logged-in user away from the login/register flow.

### Route table

| Path | File | Purpose |
| --- | --- | --- |
| `/` | `frontend/app/page.tsx` | No UI of its own; redirects to `/dashboard` or `/login` once auth state resolves. |
| `/login` | `frontend/app/(auth)/login/page.tsx` | Email + password login form; on success calls `router.push('/dashboard')`. |
| `/register` | `frontend/app/(auth)/register/page.tsx` | Email + username + password registration form; on success calls `router.push('/onboarding')`. |
| `/onboarding` | `frontend/app/onboarding/page.tsx` | 4-step first-run wizard: pick starting skills, create a goal, add starter quests/habits. |
| `/dashboard` | `frontend/app/(app)/dashboard/page.tsx` | Home screen: streak + level/XP header, an 8-axis "Character Shape" radar chart of attribute levels, today's habits, active quests (incl. Locked/Complete/Claim Reward states; "Active Quests" card title links to `/quests`), active goals, recent achievements, activity feed. |
| `/skills` | `frontend/app/(app)/skills/page.tsx` | Skills grouped by the 8 fixed attributes, with progress bars; add-skill modal (suggested or custom) and delete. |
| `/skills/[id]` | `frontend/app/(app)/skills/[id]/page.tsx` | Single skill detail: rename/edit description, cumulative XP growth chart, recent XP transaction list, delete. |
| `/quests` | `frontend/app/(app)/quests/page.tsx` | "Quest Board": Active/Completed status tabs plus a Daily/Weekly/Long-Term/System category pill-filter row (`?category=` on `GET /quests`; a category badge shows on non-Long-Term cards), create-quest modal (incl. a category picker, `RewardBundleEditor`, and a `RequirementsEditor` "Prerequisites" disclosure for level-gated quests). Locked quest cards render dimmed with a requirement checklist instead of a Complete button; completing swaps the button to "Claim Reward" (the actual XP-awarding step - see `docs/gameplay-systems.md` §§ "Level-gated quests and reward claiming" / "Quest Board and System quests"). |
| `/habits` | `frontend/app/(app)/habits/page.tsx` | Today's habits with streak counters, create-habit modal (incl. `RewardBundleEditor`), complete/pause/reactivate/delete. |
| `/goals` | `frontend/app/(app)/goals/page.tsx` | Active/Completed goal tabs, create-goal modal (incl. `RewardBundleEditor`). |
| `/goals/[id]` | `frontend/app/(app)/goals/[id]/page.tsx` | Single goal detail: linked quests, log-progress form (binary mark-complete or numeric value entry), delete. |
| `/achievements` | `frontend/app/(app)/achievements/page.tsx` | All achievement definitions split into Unlocked / Locked sections, with a per-type requirement description. |
| `/leaderboard` | `frontend/app/(app)/leaderboard/page.tsx` | Ranks the caller against their accepted friends: metric tabs (Overall Level / Attribute / XP Earned). Attribute mode filters via a `role="radiogroup"` of icon-only circles per attribute (categorical color, matching `AttributeDots`/Skills page), the selected one expanding into an icon+name pill; XP mode filters via a period pill row. Below that: a top-3 podium (graceful with fewer than 3 entries), a 4th-onward ranked list, and a "Manage Friends" modal (send/accept/decline/remove, plus a "Suggested Friends" section) with an unread-incoming-request badge. |
| `/analytics` | `frontend/app/(app)/analytics/page.tsx` | Overview stat tiles, attribute progression grid, XP-over-time area chart, skill-level bar chart, activity heatmap, recent activity feed (with a "Full history" link to the page below). |
| `/analytics/history` | `frontend/app/(app)/analytics/history/page.tsx` | Every XP event, grouped (character/skill/attribute lines per event via `GET /analytics/xp-history`), filterable by source category, grouped by calendar day, with cursor-based "Load more" (`useInfiniteQuery`). |
| `/settings` | `frontend/app/(app)/settings/page.tsx` | Edit profile (username, avatar URL), theme toggle, account info (email, member since), log out. |
| `/admin` | `frontend/app/admin/page.tsx` | Admin-only (see routing structure above). Users tab: searchable table, click a row for a detail modal (edit profile/toggle admin/delete, per-attribute + character XP adjuster, achievement grant/revoke). Friendships tab: table of every `Friendship` in the system with accept/delete, plus a create-by-username form. |

## Auth flow

Auth state is provided by `AuthProvider` (`frontend/src/hooks/use-auth.tsx`), mounted once in
`frontend/app/providers.tsx` around the whole tree (inside `QueryClientProvider` and
`ToastProvider`). The context value:

```ts
interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  isAuthenticated: boolean; // === !!user
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (email: string, username: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
  setUser: (user: PublicUser) => void;
  refreshUser: () => Promise<void>;
}
```

- **Bootstrap** - on mount, `AuthProvider` reads an access token from `tokenStore` (see below). If
  there is none, it immediately sets `isLoading = false` (no user). If there is one, it calls
  `getMe()` (`GET /users/me`) to hydrate `user`; a failure clears the token store and leaves `user`
  null. Either way `isLoading` ends up `false` once bootstrap settles.
- **Session expiry** - `AuthProvider` listens for a `window` custom event named
  `liferpg:auth-expired`. When it fires, it clears `user` and pushes to `/login`. This event is
  dispatched from the API client when a refresh-token attempt itself fails; the full mechanics of
  bearer-header injection and silent 401-refresh-and-retry live in `frontend/src/lib/api-client.ts`
  (documented separately) - `useAuth` only reacts to the final "give up" signal.
- **`login(email, password)`** - calls `loginRequest` (`POST /auth/login`), stores the returned
  `accessToken`/`refreshToken` via `tokenStore.setTokens`, sets `user` to the returned `PublicUser`,
  and returns it. The login page then does its own `router.push('/dashboard')`.
- **`register(email, username, password)`** - same shape via `POST /auth/register`; the register
  page navigates to `/onboarding` afterward.
- **`logout()`** - best-effort calls `logoutRequest()` (`POST /auth/logout`, errors swallowed),
  then unconditionally clears `tokenStore` and `user`, and pushes to `/login`.
- **`setUser`** - exposed so pages that PATCH the profile (e.g. Settings) can update the cached
  user object directly without a refetch.
- **`refreshUser`** - re-runs the same bootstrap logic (`GET /users/me`). Every completion mutation
  in the app (quest/habit complete, goal progress) calls this afterward so the header's level/XP
  numbers reflect newly-earned XP immediately.

**Token storage** (full detail belongs with the API client docs): `frontend/src/lib/token-store.ts`
persists `accessToken`/`refreshToken` in `localStorage` under the keys `liferpg.accessToken` and
`liferpg.refreshToken`, as a standalone module (not React state) so the axios interceptor can read
it outside of component context. Access tokens are short-lived; the API client transparently
refreshes on a 401 and retries the original request, only dispatching `liferpg:auth-expired` (and
thus forcing logout) if the refresh call itself fails.

**Gating pattern** - `frontend/app/(app)/layout.tsx` and `frontend/app/onboarding/layout.tsx` use
the identical pattern:

```ts
useEffect(() => {
  if (!isLoading && !isAuthenticated) router.replace('/login');
}, [isLoading, isAuthenticated, router]);

if (isLoading || !isAuthenticated) return <PageSpinner />;
return <AppShell>{children}</AppShell>; // or a bare div for onboarding
```

Because the gate blocks rendering `children` until `isLoading` is false and `isAuthenticated` is
true, no protected page ever mounts with a stale or unresolved auth state. The `(auth)` layout has
no such check (see Routing structure above) - only the root `/` route redirects based on session
state.

## Onboarding wizard

`frontend/app/onboarding/page.tsx` drives a 4-step wizard (`TOTAL_STEPS = 4`), rendering one step
component from `frontend/app/onboarding/_components/` based on local `step` state, with
`StepDots` (`step-dots.tsx`) showing progress against `STEP_LABELS = ['Welcome', 'Skills', 'Goal',
'Activities']`.

1. **Welcome** (`welcome-step.tsx`) - static intro copy and a "Begin Your Journey" button that
   advances to step 2. No data.
2. **Skills** (`skills-step.tsx`) - fetches `GET /skills/suggestions`
   (`getSkillSuggestions`, query key `['skill-suggestions']`), which returns
   `DefaultAttributeGroup[]` - the default skill catalog grouped by each of the 8 fixed attributes.
   Each group renders as a `PillSelect` of its skills. Selections are stored as an array of
   **composite keys** built by `skillSelectionKey(attributeKey, skillName) = \`${attributeKey}:${skillName}\``
   (exported from `skills-step.tsx`) rather than plain skill names, because the same skill name can
   legitimately appear under more than one attribute (e.g. "Focus" under both Intelligence and
   Discipline) and a bare name wouldn't be a unique selection key. At least one selection is
   required to continue.
3. **Goal** (`goal-step.tsx`) - a single goal form (`GoalFormState`: `title`, `type`
   (`BINARY`/`NUMERIC`/`COMPLETION`), `targetValue`, `unit`, `category`). `targetValue`/`unit` are
   only required (and only shown) when `type !== 'BINARY'`. `INITIAL_GOAL_FORM` is the parent's
   default state.
4. **Activities** (`activities-step.tsx`) - two inline "quick add" mini-forms, one for quests (title
   + difficulty) and one for habits (title + frequency), producing local objects:

   ```ts
   interface QuickQuest { id: string; title: string; difficulty: QuestDifficulty; description?: string; suggested?: boolean; }
   interface QuickHabit { id: string; title: string; frequency: HabitFrequency; }
   ```

   `id` comes from `makeId()` (`crypto.randomUUID()`, falling back to a timestamp+random string).
   At least one quest or habit is required before "Begin Journey" is enabled.

**Starter-quest auto-population.** The first time the wizard reaches step 4 with an empty quest
list (guarded by `quests.length === 0 && selectedSkills.length > 0`, so it never overwrites edits
made after navigating back and forth), a `useEffect` in `onboarding/page.tsx` derives the distinct
attribute keys behind the user's selected skills and calls `buildStarterQuests(attributeKeys)`
(`frontend/app/onboarding/_components/starter-quests.ts`). That helper de-duplicates the attribute
keys, caps the list at `MAX_AUTO_POPULATED_QUESTS = 4`, and takes the *first* curated
`StarterQuestTemplate` for each attribute from a hard-coded `STARTER_QUESTS_BY_ATTRIBUTE` map (two
templates per attribute exist in the source, but only the first is auto-added). Each generated
quest is marked `suggested: true` so `ActivitiesStep` can badge it and swap its helper copy.

### "Begin Journey" fan-out

`handleBeginJourney` in `frontend/app/onboarding/page.tsx` performs the actual account setup, in
this order:

1. Builds two lookup maps from data the earlier steps already fetched: `attributeIdByKey` (from
   `GET /attributes`, keyed by `Attribute.key`) and `suggestionByKey` (from `GET
   /skills/suggestions`, keyed by the same `${attributeKey}:${skillName}` composite used for
   selection) so a chosen suggested skill's description can be reused when creating it.
2. **Creates skills** - `Promise.all` over every selected skill, calling `createSkill({ name,
   attributeId, description })` (`POST /skills`) once per skill. `attributeId` is resolved from the
   attributes map (throws if a key is somehow missing); `name` comes from splitting the selection
   key back apart with `parseSkillSelection`. The resulting `Skill[]` is flattened into a
   `skillIds` array.
3. **Creates the goal** - a single `createGoal(...)` call (`POST /goals`) using the Goal step's
   form values. `targetValue`/`unit` are only included when `type !== 'BINARY'`; `category` is
   trimmed-or-omitted; `skillIds` is the full array from step 2, so the goal is tagged with every
   skill just created.
4. **Creates quests and habits together** - a single `Promise.all` that fires both batches in
   parallel: one `createQuest({ title, description, type: 'ONE_TIME', difficulty, goalId:
   createdGoal.id, skillIds })` (`POST /quests`) per local `QuickQuest`, and one
   `createHabit({ title, frequency, skillIds })` (`POST /habits`) per local `QuickHabit`. Every
   quest/habit created here is linked to the same `skillIds` from step 2; quests are additionally
   linked to the goal from step 3 via `goalId`.
5. `router.push('/dashboard')`.

On any failure, `setSubmitError` is set (via `getApiErrorMessage`) and `submitting` is reset to
`false`; the success path never resets `submitting` since it navigates away instead.

## Shared hooks

### `useAuth` - `frontend/src/hooks/use-auth.tsx`

See "Auth flow" above.

### `useCelebration` - `frontend/src/hooks/use-celebration.ts`

Returns a memoized `celebrate(result: CompletionResult)` callback that turns a completion response
into a sequence of toasts via `useToast()` (`frontend/src/components/ui/toaster.tsx`). It is
purely a presentation helper - the doc comment on the hook is explicit that **callers remain
responsible for invalidating the relevant TanStack Query caches** (user, skills, achievements,
etc.) themselves; `useCelebration` does not touch the query cache.

`CompletionResult` (`frontend/src/lib/types.ts`), returned by the habit `complete` endpoint, the
goal `progress` endpoint, and the quest `claim` endpoint (as `CompletionResult[]`, one per pending
completion claimed - the quest `complete` endpoint returns `{ quest, completion }` instead and
never triggers a celebration, since no XP has moved yet; see `docs/gameplay-systems.md` §
"Reward claiming"):

```ts
interface CompletionResult {
  xpGained: number;
  levelUp: boolean;
  newLevel: number;
  skillResults: Array<{ skillId: string; leveledUp: boolean; newLevel: number }>;
  attributeResults: Array<{ attributeId: string; leveledUp: boolean; newLevel: number }>;
  achievementsUnlocked: string[];
  streak?: { currentStreak: number; longestStreak: number };
}
```

`celebrate` pushes, in order:

1. Always one XP toast - variant `xp`, title `` +${xpGained} XP ``, description "Nice work."
2. If `levelUp` - variant `levelup`, title "Level up!", description `` You reached Level ${newLevel}. ``
3. One toast per `skillResults` entry with `leveledUp === true` - variant `levelup`, title "Skill
   level up!", description `` Reached Level ${newLevel}. `` (the specific skill's name is not
   included in the toast text in the current implementation).
4. One toast per `attributeResults` entry with `leveledUp === true` - variant `levelup`, title
   "Attribute level up!", description `` Reached Level ${newLevel}. `` (same caveat - no attribute
   name in the toast).
5. One toast per entry in `achievementsUnlocked` - variant `achievement`, title "Achievement
   unlocked", description is the achievement name string itself.

Used from the dashboard, quests, habits, and goal-detail pages: each completion mutation's
`onSuccess` invalidates the relevant query keys, calls `refreshUser()` from `useAuth()` to refresh
the header's level/XP, and then calls `celebrate(result)`.

### `useTheme` - `frontend/src/hooks/use-theme.ts`

```ts
type Theme = 'light' | 'dark';
function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggleTheme: () => void };
```

- Persists to `localStorage` under the key `liferpg.theme`.
- `getPreferredTheme()` is SSR-safe (returns `'light'` when `window` is undefined); on the client
  it prefers the stored value, falling back to `window.matchMedia('(prefers-color-scheme: dark)')`.
- The hook's `useState` initializes to `'light'` unconditionally (to match server-rendered markup)
  and only calls `getPreferredTheme()` inside a mount `useEffect`, deliberately deferring the
  localStorage/matchMedia read so the very first client render matches SSR output. **This mount
  effect only ever updates React state - it never touches `document.documentElement`.** Only
  `setTheme`/`toggleTheme` (i.e. an explicit user action) write the `dark` class + `localStorage`,
  via a shared `applyTheme(theme)` helper.
- Consumed by `ThemeToggle` (`frontend/src/components/ui/theme-toggle.tsx`), rendered on
  `/settings` and in the `/admin` layout - **not** the persistent Topbar, so every navigation to
  either page mounts a fresh, independent instance of this hook.
- **Why the mount effect can't touch the DOM:** it once did (`document.documentElement.classList
  .toggle('dark', theme === 'dark')` inside a second effect keyed on `[theme]`, which also ran on
  mount). Because a fresh `ThemeToggle` mount's `useState` always starts at `'light'`, that
  mount-time run wrote the *stale* `'light'` value to the shared, page-wide
  `document.documentElement` class before the state-correction effect caught up a moment later -
  flashing the entire app to light mode on every navigation to `/settings`, not just the toggle's
  own tiny icon. Fixed by having the mount effect only ever call `setThemeState(...)`, never
  `applyTheme(...)`.

**Anti-FOUC script.** Because the `dark` class is only applied after React mounts and effects run,
`frontend/app/layout.tsx` (the root layout) inlines a synchronous `<script>` *before*
`<Providers>` renders:

```js
try {
  var stored = localStorage.getItem('liferpg.theme');
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
```

This runs before hydration and applies the `dark` class to `<html>` immediately if needed, so the
page paints in the correct theme on the first frame instead of flashing light and then switching to
dark. `<html lang="en" suppressHydrationWarning>` sets `suppressHydrationWarning` because this
script mutates the DOM ahead of React's hydration pass.

## Layout/navigation components

All under `frontend/src/components/layout/`.

### `AppShell` (`app-shell.tsx`)

The composition root for every `(app)` page (mounted by `frontend/app/(app)/layout.tsx` once auth
resolves):

```
<div class="flex h-screen overflow-hidden">
  <Sidebar />                          (desktop only)
  <div class="flex flex-1 flex-col">
    <Topbar />
    <MobileNav />                      (mobile only)
    <main class="overflow-y-auto">
      <div class="max-w-6xl mx-auto">{children}</div>
    </main>
  </div>
</div>
```

### `Sidebar` (`sidebar.tsx`)

Desktop-only (`hidden ... lg:flex`), fixed 60-width left column. Renders the Life RPG logo linking
to `/dashboard`, then maps `NAV_ITEMS` to `Link`s. Active-item highlighting uses `usePathname()`
matching the exact `href` or `pathname.startsWith(\`${href}/\`)` (so, for example, visiting
`/skills/<id>` still highlights the "Skills" nav entry).

### `MobileNav` (`mobile-nav.tsx`)

The same `NAV_ITEMS` rendered as a horizontally-scrollable tab strip, shown only below the `lg`
breakpoint (`lg:hidden`), with identical active-state logic to `Sidebar`.

### `nav-items.ts`

A single shared `NAV_ITEMS` array consumed by both `Sidebar` and `MobileNav`:

| Label | Href | Icon |
| --- | --- | --- |
| Dashboard | `/dashboard` | `LayoutDashboard` |
| Skills | `/skills` | `Sparkles` |
| Quests | `/quests` | `CheckSquare` |
| Habits | `/habits` | `Repeat` |
| Goals | `/goals` | `Target` |
| Achievements | `/achievements` | `Award` |
| Leaderboard | `/leaderboard` | `Crown` |
| Analytics | `/analytics` | `BarChart3` |
| Settings | `/settings` | `Settings` |

### `Topbar` (`topbar.tsx`)

Renders `null` entirely if there is no authenticated `user`. Otherwise:

- **Left**: a circular badge showing `user.level`, plus (desktop only, `hidden sm:block`) a mini
  XP progress bar captioned `Level {level}` / `{currentXP}/{xpForNextLevel} XP`, with fill
  percentage `(currentXP / xpForNextLevel) * 100`.
- **Notification bell**: `GET /notifications` polled every 60s (`useQuery` with `refetchInterval:
  60_000`, `enabled: !!user`). A small red dot appears on the bell if any notification has
  `read === false`. Clicking the bell opens a dropdown panel (closes on outside click via a
  full-screen fixed overlay) listing all notifications with title/message/relative timestamp, a
  "Mark all read" action (`markAllNotificationsRead`), and per-notification click-to-mark-read
  (`markNotificationRead`) - both invalidate the `['notifications']` query on success.
- **Account menu**: a user-icon button opening a dropdown showing the username, a conditional
  "Admin Dashboard" link to `/admin` (rendered only when `user.isAdmin`), and a "Log out" action
  that calls `useAuth().logout()`.

## Keeping this file in sync

This document must be kept in sync with `frontend/app`: whenever a page or route is added,
removed, or renamed, or a page's core data flow (which endpoints it calls, what it fans out on
submit, how it gates) meaningfully changes, update the corresponding section of this file in the
same change.
