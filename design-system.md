# Native — Design System

Extracted from the 13 reference screenshots in `./screenshots/` (1366×728, dark theme).
Every value below was pixel-sampled (5×5 average) or measured from the references.
**All UI must be built from these tokens — no ad-hoc styling.** The tokens are encoded in
`tailwind.config.ts` (colors/radii/shadows/fonts) and `src/renderer/src/styles/tokens.css`
(CSS custom properties for the theme system).

---

## 1. Color palette

### Surfaces (sampled)

| Token | Hex | Sampled from | Usage |
|---|---|---|---|
| `surface-base` | `#16181c` | content bg (ref-113405), settings body (ref-113645) | App/page background, modal bodies in settings |
| `surface-raised` | `#27292e` | sidebar, topbar, cards, modal headers (all refs) | Cards, sidebar rail, titlebar, modal header/footer, tab containers, dropdown triggers |
| `surface-inset` | `#1d1f23` | modal body (ref-113447), table rows, log console (ref-113614) | Inset panels inside cards: modal bodies, table row areas, console background |
| `surface-input` | `#34363c` | search inputs (ref-113424/113634) | Text inputs, search fields, select triggers |
| `surface-hover` | `#31343a` | derived (+8% L on raised) | Hover state for rows/cards/buttons on raised |
| `surface-active` | `#3c3f46` | derived | Pressed state, active gray chips |
| `surface-window` | `#111317` | titlebar edges | Frameless window frame fill behind everything |

### Brand & status

| Token | Hex | Sampled from | Usage |
|---|---|---|---|
| `accent` (brand green) | `#1bd96a` | toggle switch ON (ref-113533, pure sample) | Primary buttons, active pills, toggles, links, logo, progress bars, active nav |
| `accent-hover` | `#12b859` | derived (−10% L) | Primary button hover |
| `accent-contrast` | `#03150a` | button labels (dark text on green) | Text/icons placed on solid green |
| `accent-tint` | `rgba(27,217,106,0.10)` | outline-button fills (ref-113424 Install) | Background tint of outline-green buttons, selected cards |
| `red` (danger) | `#ff496e` | Stop button (ref-113533) | Stop button, destructive actions, error chips |
| `red-tint` | `rgba(255,73,110,0.12)` | derived | Danger hover tint, error banners |
| `orange` (warn) | `#ffa347` | log Warn chip semantics | Warnings |
| `blue` (info/link) | `#5b9dff` | markdown links (ref-113432) | In-content hyperlinks, info states |
| `purple` (special) | `#c084fc` | “Upgrade to Modrinth+” (ref-113405) | Rare highlight accents (e.g. premium/labs) |

### Text

| Token | Hex | Usage |
|---|---|---|
| `text-primary` | `#ffffff` | Headings, titles, button labels on gray |
| `text-secondary` | `#9BA1AC` | Body copy, descriptions, section labels |
| `text-muted` | `#6E7580` | Timestamps, tertiary metadata (“Played 1 hour ago”) |
| `text-on-accent` | `#03150a` | Labels on solid green/red pills |
| `text-accent` | `#1bd96a` | Green links (“Sign in to…”), active tab labels in outline style |

### Lines & misc

| Token | Value | Usage |
|---|---|---|
| `border-subtle` | `rgba(255,255,255,0.06)` | Hairlines between table rows, card outlines |
| `border-strong` | `rgba(255,255,255,0.14)` | Input borders on focus-adjacent, gray-outline buttons |
| `backdrop` | `rgba(8,9,11,0.42)` + `backdrop-blur(8px)` | Modal overlay — measured: reference backdrops keep the page clearly visible (≈#172022 over dark screens) |
| `scrollbar` | thumb `#3c3f46`, hover `#4a4e56`, track transparent, width 8px, radius 999 | All scroll areas |
| log console text | `#47d178` on `surface-inset`, mono font | Log viewer body (ref-113614 green terminal text) |

---

## 2. Typography

Reference uses **Inter** (geometric, tight tracking, heavy weights for headings). Bundled via
`@fontsource-variable/inter`. Monospace: **JetBrains Mono** (log console, file sizes, versions).

| Style | Size/line | Weight | Usage |
|---|---|---|---|
| `display` | 32/38 | 800 (extrabold) | Page titles: “Welcome back!”, “Skin selector” |
| `h1` | 24/30 | 800 | Modal titles (“Install project”, “Create instance”), instance header name |
| `h2` | 20/26 | 700 | Card titles (“Fabric API” in detail), section titles |
| `h3` | 16/22 | 700 | Project card titles, “Additional content” |
| `body` | 14/20 | 400–500 | Default body, descriptions |
| `body-strong` | 14/20 | 600 | Buttons, tabs, labels, list titles |
| `small` | 13/18 | 500 | Chips, metadata rows |
| `tiny` | 12/16 | 500 | Timestamps, “Played 49 seconds ago”, table headers |
| `mono` | 13/19 | 400 | Logs, file names, versions (`appleskin-fabric-mc26.2-3.0.10.jar`) |

Table headers are `tiny`+600, `text-secondary`. Sub-labels under titles (e.g. “Fabric 26.2”)
are `small` `text-secondary` with a small leading icon.

---

## 3. Shape: radius & elevation

| Token | Value | Usage |
|---|---|---|
| `radius-full` | 999px | **Signature motif** — every button, chip, tab, input, search field, pagination dot, toggle |
| `radius-card` | 16px | Cards, panels, modals, project icons ≥64px, console, tables’ outer wrap |
| `radius-md` | 12px | Small tiles (skin cards), theme preview cards, option rows in create-modal |
| `radius-sm` | 8px | Sidebar instance avatars (32px), small thumbnails, inline icons |
| `radius-circle` | 50% | Sidebar nav buttons (40px), icon-only circle buttons (gear, close X, back) |

Elevation is **surface-color based, not shadow based** (flat dark UI):
base `#16181c` → raised `#27292e` → interactive `#34363c`.
Shadows only on floating layers:

| Token | Value | Usage |
|---|---|---|
| `shadow-modal` | `0 24px 64px rgba(0,0,0,0.5)` | Modals, popovers |
| `shadow-popover` | `0 8px 24px rgba(0,0,0,0.4)` | Dropdown menus, context menus |

---

## 4. Layout pattern (all screens)

```
┌──────────────────────────────────────────────────────────────┐
│ Titlebar 48px: [logo wordmark] [◀][▶] [breadcrumb]   [run-chip] [– □ ×] │
├────┬─────────────────────────────────────────────┬───────────┤
│ 64 │  Content (scroll)                            │  300px    │
│ px │  padding 24px                                │  context  │
│rail│  max-width none                              │  sidebar  │
│    │                                              │ (Playing  │
│    │                                              │  as, News,│
│    │                                              │  filters) │
└────┴─────────────────────────────────────────────┴───────────┘
```

- **Titlebar** (`surface-raised`, custom frameless): green logo mark + white wordmark; circular
  back/forward buttons (32px, `surface-input` bg); breadcrumb `body-strong` with `›` separators,
  current segment white, ancestors `text-secondary`. Right: running-instance pill (green status
  dot + name + stop icon, `surface-base` bg, `radius-full`, subtle border), then window controls
  (46px hit areas; close hover = `red`).
- **Left rail** 64px, `surface-raised`: 40px circular nav buttons; **active = solid green circle
  with dark icon**, inactive = `text-secondary` icon, hover = `surface-hover` circle. Below a
  hairline divider: 32px rounded-`radius-sm` instance avatars (running instance gets green ring),
  a `+` button, then pinned bottom: settings gear, account/sign-in.
- **Content column**: 24px padding; page starts with `display` title or a header card.
- **Right sidebar** 300px, `surface-base` with hairline left border; stacked sections with `h3`
  headers (“Playing as”, “News”, “Category”, filters). Collapses below 1100px width.

---

## 5. Iconography

Lucide (stroke) icons, 1.5–2px stroke, matching reference line-icon style:
- 20px inside buttons/inputs, 22px in the rail, 16px in chips/metadata.
- Metadata rows pair icon+text in `text-secondary` (download ⬇ count, ♥ hearts, 🕐 “4 days ago”).
- Distinctive motif: **status dots** (8px green circle) for running things; **green ✓** prefixed
  in selected chips (“✓ Fabric”, “✓ Existing instance”, “✓ Installed”).

## 6. Core components (as seen in references)

- **Button / primary**: `radius-full`, bg `accent`, text `accent-contrast` 600, h-40 (36 compact),
  px-20; icon-left 20px. Hover `accent-hover` + `scale(1.02)`; press `scale(0.98)`.
- **Button / danger**: same, bg `red`, dark label (Stop button, ref-113533).
- **Button / secondary**: bg `surface-input`, text `text-primary` 600; hover `surface-active`.
- **Button / outline-accent**: 1.5px `accent` border, `accent-tint` bg, `accent` label
  (“+ Install”, “✓ Installed”, “✓ Existing instance”).
- **Icon circle button**: 36–40px `radius-circle`, bg `surface-input` (gear, ✕, back arrow).
- **Tab pills**: container `surface-raised` `radius-full` p-1; items `radius-full` px-16 h-36;
  active = solid `accent` + dark label (+ leading icon), inactive = `text-primary` 600 on
  transparent, hover `surface-hover`.
- **Chips/tags**: h-26 `radius-full` bg `#383b42` text `#b5bac2` `small`; “+2” overflow chip.
  Locked filter chips show 🔒 prefix.
- **Inputs/search**: h-40 `radius-full` bg `surface-input`, left 🔍 icon `text-muted`,
  placeholder `text-muted`; focus ring 2px `accent` at 40% + border `accent`.
- **Dropdown triggers**: like secondary button with `Label: Value ⌄` (“Sort by: Relevance”).
- **Toggle switch**: 40×22 track `radius-full`; ON bg `accent` knob white; OFF bg `#4a4e56`.
- **List rows / project cards**: `surface-raised` `radius-card` p-16, 96px icon `radius-card`;
  title `h3` + “by author” `text-secondary`; description 2-line clamp; footer chips; right rail
  of card: install button + ⬇/♥/🕐 metadata column, right-aligned.
- **Tables** (content/files): header row `tiny` 600 `text-secondary` on `surface-raised`;
  body rows on `surface-inset` separated by `border-subtle`; row height 56px; hover
  `surface-hover`; right Actions cluster (icon buttons + toggle + ⋮).
- **Modals**: `radius-card`, header `surface-raised` (title `h1` + ✕ circle), body
  `surface-inset` p-24, footer `surface-raised` (meta left, actions right); enters with
  opacity 0→1 + scale 0.96→1 (180ms), backdrop fade+blur.
- **Progress bars**: h-8 `radius-full`, track `surface-input`, fill `accent`
  (news card shows fundraiser bar motif; used for downloads with % + speed + ETA `tiny`).
- **Empty states**: centered `text-muted` icon 48px + `body` message + optional primary action.
  Log console empty state = ASCII-art creeper in `accent` mono (ref-113614 motif — keep it!).

## 7. Motion

All animation on `transform`/`opacity` only (GPU-composited); **never** width/height/top/left.

| Token | Value | Usage |
|---|---|---|
| `duration-fast` | 120ms | Hover states, toggles, chips |
| `duration-base` | 180ms | Modals, dropdowns, tab pill slide |
| `duration-page` | 220ms | Page transitions |
| `ease-out-quart` | cubic-bezier(0.25, 1, 0.5, 1) | Enters, page slides |
| `ease-in-out` | cubic-bezier(0.4, 0, 0.2, 1) | Toggles, pill slide |
| spring (Framer) | `{ type:'spring', stiffness:500, damping:38, mass:0.8 }` | Layout animations, active-pill glide, list reorder |

- Page transition: fade + 8px translateY rise (220ms), exit fade 120ms.
- Active tab pill glides between tabs via Framer Motion `layoutId`.
- List add/remove/reorder: `AnimatePresence` + `layout` (spring above).
- Buttons: `whileHover={{scale:1.02}}` `whileTap={{scale:0.97}}`.
- Long lists (versions, mods, logs) are virtualized (`@tanstack/react-virtual`); log console
  autoscroll pinned to bottom unless user scrolls up.
- Progress UI updates throttled to 10 Hz over IPC; bars animate via `transform: scaleX`.

## 8. Theme system

Tokens are CSS custom properties on `:root[data-theme]`; **accent is themed** (`--accent`,
`--accent-hover`, `--accent-contrast`, `--accent-tint`, `--focus-ring`, `--log-text`,
`--backdrop`).

**Default identity: `mono` — pure black & white.** Surfaces are neutral blacks
(window `#000000`, base `#050505`, raised `#121212`, inset `#0a0a0a`, input `#1c1c1c`),
text is white/gray, and the accent is **white** (`#ffffff` on black): active pills, toggles,
primary buttons, progress bars, focus rings all render white. `mono-light` is the exact
inverse (black accent on white). Under both mono themes all content imagery (instance
tiles, news art, screenshots, favicons, player heads) is desaturated via a GPU
`grayscale(1)` filter (`.mono-media`) and regains color on hover — color exists only as a
deliberate reveal.

Classic palettes remain selectable: `dark` (the sampled reference), `oled`, `light` —
these keep the green `#1bd96a` accent. `system` follows the OS within the mono identity.
Settings shows six preview cards; visual QA against the reference screenshots pins the
`dark` theme.
