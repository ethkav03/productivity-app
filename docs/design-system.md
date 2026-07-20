# Design System

This document is the reference for Life RPG's visual design tokens and shared UI primitives:
how theming works, every semantic color variable and its light/dark values, the attribute
color palette, and the API surface of every component in `frontend/src/components/ui/`.

Source files this document describes (read these first if something here looks stale):

- `frontend/app/globals.css` - CSS custom properties (light + dark)
- `frontend/tailwind.config.ts` - Tailwind theme extension, wiring the CSS variables into
  Tailwind utility classes
- `frontend/src/lib/attribute-colors.ts` - the `attributeColor()` helper
- `frontend/src/hooks/use-theme.ts` - theme state + persistence
- `frontend/app/layout.tsx` - anti-FOUC inline script
- `frontend/src/components/ui/*.tsx` - shared component primitives

## 1. Approach

Life RPG is styled with Tailwind CSS, but no color is hardcoded as a Tailwind default (`gray-500`,
`#fff`, etc.) or as a literal hex value in component code. Every semantic color - background,
surface, border, text, primary, accent, status colors, and the 8 attribute colors - is defined
once as a CSS custom property in `frontend/app/globals.css`, as a **space-separated RGB triple**
(e.g. `--primary: 99 91 255;`, not `rgb(99, 91, 255)` and not a hex string).

`frontend/tailwind.config.ts` maps each of those variables onto a Tailwind color name using the
`rgb(var(--x) / <alpha-value>)` pattern, e.g.:

```ts
primary: {
  DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
  foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
},
```

The `<alpha-value>` placeholder is filled in automatically by Tailwind whenever an opacity
modifier is used on the class (`bg-primary/15`, `text-danger/50`, ...), because the underlying
value is a bare RGB triple rather than a pre-formed `rgb()`/`hsl()` string. This is what lets
`bg-primary`, `text-muted`, `border-border`, `bg-primary/15`, etc. all resolve correctly in
**both** light and dark mode with zero conditional logic in component code - the class never
changes, only the CSS variable value referenced by `:root` vs `.dark` changes.

Component code that needs a raw CSS color string outside of a Tailwind class (inline `style`,
e.g. `AttributeDots`) follows the same convention by hand: `rgb(var(--attr-physical))` or,
via the helper, `attributeColor('PHYSICAL')`.

## 2. Core color tokens

All defined in `frontend/app/globals.css`. Light values live on `:root`; dark values are
overrides scoped under a `.dark` class applied to `<html>`. Values are RGB triples (0-255 per
channel), consumed as `rgb(var(--token))` or `rgb(var(--token) / <alpha>)`.

| Token | Tailwind class(es) | Light (`:root`) | Dark (`.dark`) | Purpose |
| --- | --- | --- | --- | --- |
| `--background` | `bg-background` | `250 250 252` | `10 10 16` | Page background |
| `--surface` | `bg-surface` | `255 255 255` | `19 19 28` | Card / panel / modal background |
| `--surface-hover` | `bg-surface-hover` | `244 244 247` | `27 27 39` | Hover state for surfaces, track background for progress bars, secondary button fill |
| `--border` | `border-border`, `ring-border` | `228 228 234` | `41 41 58` | All borders (also set globally via the `*` selector) |
| `--foreground` | `text-foreground` | `24 24 32` | `237 237 245` | Primary text |
| `--muted` | `text-muted` | `113 113 130` | `148 148 172` | Secondary / de-emphasized text |
| `--primary` | `bg-primary`, `text-primary`, `border-primary` | `99 91 255` | `139 130 255` | Brand/interactive accent (buttons, links, focus rings, progress fill) |
| `--primary-foreground` | `text-primary-foreground` | `255 255 255` | `12 10 30` | Text/icon color on top of `--primary` |
| `--accent` | `bg-accent`, `text-accent` | `217 119 6` | `250 176 5` | Secondary accent (XP/achievement highlights) |
| `--accent-foreground` | `text-accent-foreground` | `255 255 255` | `40 26 0` | Text/icon color on top of `--accent` |
| `--success` | `text-success`, `bg-success` | `5 150 105` | `52 211 153` | Positive/success state |
| `--warning` | `text-warning`, `bg-warning` | `217 119 6` | `250 176 5` | Warning state (same values as `--accent` in both modes) |
| `--danger` | `text-danger`, `bg-danger` | `220 38 38` | `248 113 113` | Destructive/error state |

Additional non-color root variables:

- `--font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;` - mapped to
  Tailwind's `font-sans` via `fontFamily.sans` in `tailwind.config.ts`.
- `color-scheme: light;` / `color-scheme: dark;` - set alongside the palette so native form
  controls and scrollbars also follow the theme.

Other theme-related Tailwind extensions in `tailwind.config.ts` (not CSS variables, but part of
the same visual system):

| Extension | Value | Used for |
| --- | --- | --- |
| `borderRadius.xl` | `0.875rem` | Buttons, cards (`rounded-xl`) |
| `borderRadius['2xl']` | `1.25rem` | Cards, modal (`rounded-2xl`) |
| `boxShadow.glow` | `0 0 0 1px rgb(var(--primary) / 0.35), 0 8px 24px -8px rgb(var(--primary) / 0.45)` | Modal, level-up/achievement toasts (`shadow-glow`) |
| `keyframes`/`animation` `fill-bar` | `width: 0% → current` over `0.8s cubic-bezier(0.16, 1, 0.3, 1)` | `ProgressBar` fill animation |
| `keyframes`/`animation` `pop-in` | opacity/scale/translateY entrance over `0.25s ease-out` | Modal, toasts (`animate-pop-in`) |

`* { border-color: rgb(var(--border)); }` in `globals.css` sets the default border color
globally, so any element that sets a `border` width without an explicit color already picks up
the themed border.

## 3. Attribute color palette

Every one of the app's 8 fixed attributes (Physical, Intelligence, Discipline, Energy, Social,
Wealth, Creativity, Wisdom) has its own categorical color, defined as `--attr-*` variables in
`globals.css`:

| Attribute | Variable | Light | Dark |
| --- | --- | --- | --- |
| Physical | `--attr-physical` | `42 120 214` | `57 135 229` |
| Intelligence | `--attr-intelligence` | `0 131 0` | `0 131 0` |
| Discipline | `--attr-discipline` | `232 123 164` | `213 81 129` |
| Energy | `--attr-energy` | `237 161 0` | `201 133 0` |
| Social | `--attr-social` | `27 175 122` | `25 158 112` |
| Wealth | `--attr-wealth` | `235 104 52` | `217 89 38` |
| Creativity | `--attr-creativity` | `74 58 167` | `144 133 233` |
| Wisdom | `--attr-wisdom` | `227 73 72` | `230 103 103` |

These are the **same 8 hues** in both modes, only stepped in lightness/saturation for the dark
surface - dark mode is not a separately-chosen palette.

**This is a validated categorical palette, not 8 colors picked by eye.** It was chosen and
validated using the methodology in this project's `dataviz` skill: a categorical palette
validated for color-vision-deficiency (CVD) safety and for contrast against this app's actual
`--surface`/`--background` colors in both light and dark mode, rather than selected ad hoc.

Two rules follow from that validation and must be preserved:

1. **Fixed assignment order, never cycled.** Each attribute is permanently bound to one
   `--attr-*` variable (`ATTRIBUTE_COLOR_VAR` in `attribute-colors.ts` maps `AttributeKey` →
   variable name 1:1). Colors are never reassigned or cycled through a list at render time - if
   attribute colors were assigned dynamically (e.g. by array index in whatever order an API
   response happens to return), the specific worst-case-adjacent-pair separation the palette was
   validated for would no longer hold.
2. **Order matches real adjacency.** The assignment order (Physical, Intelligence, Discipline,
   Energy, Social, Wealth, Creativity, Wisdom - the `AttributeKey` union order in
   `frontend/src/lib/types.ts`) matches the order these attributes are actually displayed
   adjacently in across the app (Skills page sections, onboarding attribute groups, Analytics
   attribute grid), so the validated worst-adjacent-pair CVD separation applies to the
   attribute-to-attribute comparisons users actually make on screen.

### `attributeColor()` helper

`frontend/src/lib/attribute-colors.ts` exposes a single helper for consuming this palette from
component code (anywhere a Tailwind class can't reach, e.g. inline `style` or chart color props):

```ts
function attributeColor(key: AttributeKey, alpha?: number): string
```

- `attributeColor('PHYSICAL')` → `"rgb(var(--attr-physical))"`
- `attributeColor('PHYSICAL', 0.15)` → `"rgb(var(--attr-physical) / 0.15)"`

It returns a CSS color string built from the `var(--attr-*)` custom property, so the same call
site automatically renders the correct light or dark shade with no theme branching in the
component - identical in spirit to how Tailwind's `rgb(var(--x) / <alpha-value>)` classes work.

**If a new categorical color is ever needed** (a 9th attribute, a new chart series, etc.), it
must be chosen the same way - run it through the `dataviz` skill's validation methodology
(`references/palette.md` and its validator) rather than picked by eye - and the fixed-order,
never-cycled assignment rule above should be followed for the new token as well.

## 4. Theming mechanism

- **Toggle:** dark mode is a single `.dark` class on `<html>` (`darkMode: 'class'` in
  `tailwind.config.ts`). When present, the `.dark` variable overrides in `globals.css` apply;
  otherwise the `:root` (light) values apply.
- **State + persistence:** `frontend/src/hooks/use-theme.ts` (`useTheme()`) owns the current
  `Theme` (`'light' | 'dark'`) in React state.
  - On mount, `getPreferredTheme()` reads `localStorage.getItem('liferpg.theme')`; if a
    stored value of `'light'` or `'dark'` exists it wins, otherwise it falls back to the OS
    preference via `window.matchMedia('(prefers-color-scheme: dark)')`.
  - A `useEffect` keyed on `theme` toggles the `dark` class on `document.documentElement` and
    writes the current theme back to `localStorage` under the key **`liferpg.theme`** on every
    change.
  - Returns `{ theme, setTheme, toggleTheme }`.
- **Anti-FOUC script:** because React state (and therefore `useTheme`'s effect) only runs after
  hydration, applying the theme class purely from React would cause a visible flash of the wrong
  theme on first paint. `frontend/app/layout.tsx` avoids this with a synchronous inline
  `<script>` in `<body>`, rendered before `<Providers>`, that duplicates the same
  read-`localStorage`-else-`matchMedia` logic and adds the `dark` class directly to
  `document.documentElement` before the page is painted. `<html>` also carries
  `suppressHydrationWarning` so React doesn't complain about the class attribute it didn't
  render itself.
- **Consumer:** `frontend/src/components/ui/theme-toggle.tsx` (`ThemeToggle`) is a small
  icon-only `Button` (`variant="ghost" size="icon"`) that calls `useTheme()` and renders a
  `Moon` icon (click to go dark) or `Sun` icon (click to go light) depending on the current
  theme, calling `toggleTheme` on click.

## 5. UI component reference

All components live in `frontend/src/components/ui/`. All are function components except
`Button`, `Input`, `Textarea`, and `Select`, which use `forwardRef`.

### Button (`button.tsx`)

```ts
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'; // default 'primary'
  size?: 'sm' | 'md' | 'lg' | 'icon'; // default 'md'
  loading?: boolean;
}
```

Renders a `<button>` with `rounded-xl font-medium transition-colors`, disabled styling
(`disabled:cursor-not-allowed disabled:opacity-50`), forwards all native button props, and
forwards `ref`.

- `variant` classes: `primary` = `bg-primary text-primary-foreground hover:opacity-90 shadow-sm`;
  `secondary` = `bg-surface-hover text-foreground hover:bg-border`; `ghost` =
  `bg-transparent text-foreground hover:bg-surface-hover`; `danger` =
  `bg-danger text-white hover:opacity-90`; `outline` =
  `border border-border bg-transparent text-foreground hover:bg-surface-hover`.
- `size` classes: `sm` = `h-8 px-3 text-sm gap-1.5`; `md` = `h-10 px-4 text-sm gap-2`; `lg` =
  `h-12 px-6 text-base gap-2`; `icon` = `h-10 w-10 p-0`.
- `loading`: when true, the button is forced `disabled` (`disabled || loading`) and a spinning
  `Loader2` icon (`h-4 w-4 animate-spin`) is rendered before `children`.

### Card (`card.tsx`)

Three composable pieces, each a thin wrapper passing through `className` and remaining native
props:

- `Card` - `<div>` with `rounded-2xl border border-border bg-surface p-5 shadow-sm`.
- `CardHeader` - `<div>` with `mb-4 flex items-center justify-between gap-2`.
- `CardTitle` - `<h3>` with `text-sm font-semibold text-foreground`.

No compound-component wiring (no context) - these are just three separately-exported layout
primitives typically used together: `<Card><CardHeader><CardTitle>…</CardTitle></CardHeader>…</Card>`.

### Badge (`badge.tsx`)

```ts
interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'outline'; // default 'default'
}
```

Renders an `<span>` with `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs
font-medium`. Variant classes are all translucent tints keyed to the semantic tokens: `default` =
`bg-surface-hover text-foreground`; `primary` = `bg-primary/15 text-primary`; `accent` =
`bg-accent/15 text-accent`; `success` = `bg-success/15 text-success`; `warning` =
`bg-warning/15 text-warning`; `danger` = `bg-danger/15 text-danger`; `outline` =
`border border-border text-muted`.

### ProgressBar (`progress-bar.tsx`)

```ts
interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  barClassName?: string;
  size?: 'sm' | 'md' | 'lg'; // default 'md'
}
```

Renders a track `<div>` (`w-full overflow-hidden rounded-full bg-surface-hover`, height per
`size`: `sm` = `h-1.5`, `md` = `h-2.5`, `lg` = `h-4`) containing a filled inner `<div>` whose
`width` is set inline from `value`, clamped to `[0, 100]` (`Math.min(100, Math.max(0, value))`).
The fill is `bg-primary`, has `rounded-full`, and uses two animations together: the
`fill-bar` keyframe animation (grows from `0%` on mount) plus a `transition-[width]
duration-700 ease-out` so subsequent `value` changes also animate. `barClassName` overrides/extends
the fill's classes (e.g. to recolor it per context); `className` extends the track.

### Modal (`modal.tsx`)

```ts
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}
```

- Renders `null` when `open` is false or when `document` is undefined (SSR guard).
- When open, renders via `createPortal(..., document.body)` - it is a true portal, not an
  in-place overlay, so it escapes any parent `overflow`/`z-index`/`transform` stacking context.
- Structure: a fixed, full-viewport flex-centered container (`fixed inset-0 z-[90]`) containing
  (1) a click-to-dismiss backdrop (`absolute inset-0 bg-black/50 backdrop-blur-sm`, `onClick={onClose}`)
  and (2) the dialog panel (`rounded-2xl border border-border bg-surface p-6 shadow-glow`,
  `animate-pop-in`, `max-w-lg`) containing a header (`title` + a `Button variant="ghost"
  size="icon"` close button with an `X` icon and `aria-label="Close"`), a scrollable body
  (`max-h-[70vh] overflow-y-auto scrollbar-thin`) for `children`, and an optional right-aligned
  `footer` row.
- **Escape-to-close:** a `keydown` listener on `document` closes the modal on `Escape` while open.
- **Body scroll lock:** while open, `document.body.style.overflow` is set to `'hidden'`; both the
  keydown listener and the scroll lock are cleaned up (listener removed, `overflow` reset to
  `''`) in the effect's cleanup function, which runs on close or unmount.

### PillSelect (`pill-select.tsx`)

```ts
interface PillOption { value: string; label: string; }
interface PillSelectProps {
  options: PillOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}
```

A generic, controlled multi-select rendered as a wrapping row of toggle-pill `<button type="button">`
elements (`flex flex-wrap gap-2`). Clicking a pill whose `value` is in the `value` array removes
it; clicking one not in `value` appends it (`toggle()` computes the next array and calls
`onChange`). Selected pills: `border-primary bg-primary/15 text-primary`; unselected:
`border-border bg-transparent text-muted hover:border-primary/40 hover:text-foreground`.

`PillSelect` is generic over what the string `value` actually encodes - it has no knowledge of
skills or attributes itself. Two distinct call-site conventions exist in the app:

1. **Plain skill-id selection** - `frontend/app/(app)/quests/page.tsx`,
   `frontend/app/(app)/habits/page.tsx`, and `frontend/app/(app)/goals/page.tsx` use it with
   `option.value` set directly to a `Skill.id`, for the "associated skills" picker on
   quest/habit/goal forms (bound to a `skillIds: string[]` form field).
2. **Composite `attributeKey:skillName` selection** - the onboarding skills step
   (`frontend/app/onboarding/_components/skills-step.tsx`) instead uses composite keys built by
   `skillSelectionKey(attributeKey, skillName) => \`${attributeKey}:${skillName}\``, because at
   that point in onboarding the user is picking from suggested skill *names* grouped by
   attribute, not real `Skill` records with ids yet - and a skill name alone isn't unique (the
   same suggested name, e.g. "Focus", can appear under more than one attribute group), so the
   attribute key is folded into the value to disambiguate.

### Input / Textarea / Select / Label / FieldError (`input.tsx`)

Shared form-field primitives, all forwarding `ref` (except `Label`/`FieldError`) and `className`,
all sharing one base class string (`FIELD_CLASSES`):

```
w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground
placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2
focus:ring-primary/20 disabled:opacity-50
```

- `Input` - `forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>`, plain
  `<input>` with the base classes.
- `Textarea` - `forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>`,
  base classes plus `min-h-[80px] resize-y`.
- `Select` - `forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>`, base
  classes plus `appearance-none`; renders `children` (the `<option>`s) as-is.
- `Label` - `(props: LabelHTMLAttributes<HTMLLabelElement>)`, a `<label>` with
  `mb-1.5 block text-xs font-medium text-muted`.
- `FieldError` - `({ children }: { children?: string })`, renders `null` if `children` is falsy,
  otherwise a `<p className="mt-1 text-xs text-danger">`.

### Toaster / useToast (`toaster.tsx`)

```ts
export type ToastVariant = 'default' | 'xp' | 'levelup' | 'achievement';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant; // default 'default' where consumed
}
```

- `ToastProvider` - a React context provider (`ToastContext`) that owns the `toasts: Toast[]`
  array (each `Toast` = `ToastInput & { id: string }`, `id` generated from `Date.now()` plus a
  random suffix) and a `push(toast: ToastInput)` function. `push` appends the toast and
  auto-dismisses it after **4500ms** via `setTimeout`. Must wrap the app once (near the root) so
  `useToast()` has a provider to find.
- `useToast()` - `useContext(ToastContext)`; throws `Error('useToast must be used within a
  ToastProvider')` if called outside `ToastProvider`. Returns `{ toasts, push }`.
- Rendering: `ToastProvider` renders its own fixed toast stack alongside `children`
  (`pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 …`,
  right-aligned on `sm:` breakpoints and up), so no separate `<Toaster />` element needs to be
  mounted - importing/rendering `ToastProvider` is sufficient.
- Each toast card animates in with `animate-pop-in`, is `pointer-events-auto` individually (so
  the invisible stack container doesn't block clicks elsewhere), and is styled per `variant`:
  - `default`: `border-border bg-surface`, no icon.
  - `xp`: `border-accent/40 bg-surface`, `Zap` icon in `text-accent`.
  - `levelup`: `border-primary/50 bg-primary/10 shadow-glow`, `Sparkles` icon in `text-primary`.
  - `achievement`: `border-accent/50 bg-accent/10 shadow-glow`, `Trophy` icon in `text-accent`.
  
  This is what the "celebration" flows (XP gain, level up, achievement unlock - see
  `useCelebration` in `frontend/src/hooks/`) render through: they call `push()` with the
  matching `variant` rather than each defining their own popup styling.

### AttributeDots (`attribute-dots.tsx`)

```ts
interface AttributeDotsProps {
  skills: Array<{ attribute: { key: AttributeKey; name: string } }>;
  className?: string;
  dotClassName?: string;
}
```

A compact stand-in for listing every associated skill by name on space-constrained rows (quest/
habit/goal list cards): renders one small colored dot (`h-2.5 w-2.5 rounded-full ring-1
ring-border`) per **distinct attribute** represented among `skills`, not one dot per skill.
Dedup logic: iterates `skills` and keeps the first `name` seen for each `attribute.key` in a
`Map<AttributeKey, string>`, so multiple skills under the same attribute collapse to a single dot.
Returns `null` if `skills` is empty. Each dot's `backgroundColor` is set inline via
`attributeColor(key)`.

Accessibility: color is never the only cue. Each dot carries the attribute's `name` both as a
`title` tooltip and as `aria-label` (`role="img"`), and the wrapping `<span>` has
`aria-label="Associated attributes"` - satisfying WCAG SC 1.4.1 (Use of Color) by pairing every
color-coded dot with a text alternative rather than requiring the color to be distinguished (or
even visible, for screen-reader users) to know which attribute it represents.

### EmptyState (`empty-state.tsx`)

```ts
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}
```

Centered placeholder block (`rounded-2xl border border-dashed border-border px-6 py-12
text-center`) for empty lists/collections: optional icon (`h-8 w-8 text-muted`) above a required
bold `title`, an optional `description`, and an optional `action` slot (typically a `Button`)
rendered below with `mt-4`.

### Spinner / PageSpinner (`spinner.tsx`)

- `Spinner({ className? })` - a `Loader2` icon, `h-5 w-5 animate-spin text-muted` by default,
  `className` merged in via `clsx`.
- `PageSpinner()` - no props; centers a larger `Spinner` (`h-8 w-8`) inside a
  `flex h-64 w-full items-center justify-center` container, for full-section loading states.

### ThemeToggle (`theme-toggle.tsx`)

No props. A `Button` (`variant="ghost" size="icon"`) bound to `useTheme()`: shows a `Sun` icon
when the current theme is `'dark'` (click switches to light) or a `Moon` icon when it's `'light'`
(click switches to dark), calling `toggleTheme()` on click. `aria-label` is set dynamically to
describe the action the click will perform (`"Switch to light theme"` / `"Switch to dark
theme"`), not the icon shown.

## 6. Keeping this document in sync

This file documents `frontend/app/globals.css`, `frontend/tailwind.config.ts`, and every
component under `frontend/src/components/ui/` as they exist in the codebase. Whenever any of the
following changes, update this file in the same change:

- A CSS custom property in `globals.css` is added, removed, renamed, or its light/dark value
  changes (Sections 2-3 above).
- `tailwind.config.ts`'s `theme.extend` gains/loses a color, radius, shadow, or animation token.
- A new shared UI primitive is added to `frontend/src/components/ui/`, or an existing one's
  props/variants/behavior change.

If a new categorical color assignment is ever needed (a new attribute, a new fixed-cardinality
status set, a new chart series family, etc.), it must be validated the same way the existing
8-color attribute palette was - via this project's `dataviz` skill (CVD-safety and
surface-contrast validation) - rather than picked ad hoc, and assigned in a fixed, non-cycled
order as described in Section 3.
