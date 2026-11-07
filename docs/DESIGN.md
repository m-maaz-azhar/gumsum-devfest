# Design Document: [App name]

**Product:** AI lost-and-found desk
**Surfaces:** One mobile-first PWA with a bottom nav. After sign-in, the user's role shows either the claimant screens or the staff screens.
**Direction:** Black and white minimalism, calm and precise, with Apple-like motion
**Related:** [User stories workbook](LostFound_MVP_User_Stories.xlsx) · [Architecture](ARCHITECTURE.md)

---

## 1. Principles

1. **One thing per screen.** Every form asks one question at a time, like Typeform. Every screen has one primary action.
2. **Content is the colour.** The UI is black, white and greys. The only colour comes from item photos, so the lost item is always the hero.
3. **Motion explains, never decorates.** Every animation answers "where did that come from?" or "did it work?". Nothing moves just to move.
4. **Calm under stress.** People open this app right after losing something. Copy is short, kind and specific. Never blame the user.
5. **Secrets stay secret.** The interface never hints at the private description. Not in placeholders, questions, errors or empty states.

---

## 2. Design tokens

### 2.1 Colour

Pure greyscale. Semantic colour is used only for errors, and always next to text.

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0A0A0A` | Primary text, primary buttons, active icons |
| `--ink-2` | `#3D3D3D` | Secondary text |
| `--ink-3` | `#737373` | Placeholder, captions, inactive icons (4.6:1 on white) |
| `--line` | `#E5E5E5` | Dividers, input borders |
| `--fill` | `#F5F5F5` | Input backgrounds, skeletons, cards on white |
| `--paper` | `#FFFFFF` | Page background |
| `--danger` | `#C62828` | Error text and borders only |

Dark mode (should, not must): invert the scale with `--paper #0A0A0A` and `--ink #FAFAFA`, swapped under `prefers-color-scheme: dark`.

### 2.2 Typography

System fonts look native on every phone and cost zero bytes.

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif;
```

Load **Inter** (400, 500, 600) from Google Fonts as the fallback on Android and desktop.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 34 / 40 | 600 | Question titles in step forms, success screens |
| `title` | 22 / 28 | 600 | Screen titles, item title |
| `body` | 17 / 24 | 400 | Body, inputs, chat |
| `callout` | 15 / 20 | 500 | Buttons, chips, list meta |
| `caption` | 13 / 18 | 400 | Helper text, timestamps, tab labels |

All sizes are set in `rem` so browser text zoom works. Letter spacing is -0.4px on `display` and `title` only.

### 2.3 Spacing, radius, elevation

- **Spacing:** 4pt grid: 4, 8, 12, 16, 24, 32, 48. The screen gutter is 20px.
- **Radius:** 10 (inputs, chips), 14 (buttons), 20 (cards, sheets), 999 (pills, avatar).
- **Elevation:** no drop shadows on cards. Use a 1px `--line` border or a `--fill` background. Only floating layers (sheets, toasts, tooltips) get a soft shadow: `0 8px 32px rgba(0,0,0,0.08)`.
- **Touch targets:** at least 44 x 44px.

### 2.4 Iconography

[Lucide](https://lucide.dev) icons at a 1.75px stroke and 24px size. The active tab uses the filled variant, or a 2.25px stroke when no filled version exists.

---

## 3. Motion system

Motion is built with **Framer Motion** across the whole app (both roles). Only `transform` and `opacity` are animated, so everything runs on the GPU at 60fps.

### 3.1 Curves and timing

| Token | Value | Use |
|---|---|---|
| `spring-snappy` | `{ type: "spring", stiffness: 500, damping: 35 }` | Button press, chips, toggles |
| `spring-smooth` | `{ type: "spring", stiffness: 260, damping: 30 }` | Page push and pop, sheets, cards |
| `ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)`, 240ms | Fades, step transitions |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)`, 180ms | Exits (always faster than entries) |

### 3.2 Micro-interactions

| Moment | Interaction |
|---|---|
| Any tap on a button or card | Scale to 0.97 on press, spring back on release (`spring-snappy`) |
| Tab switch | Icon fills and scales 0.92 then 1. Content cross-fades in 180ms. No sliding between tabs. |
| Go deeper (list to detail) | New page slides in from the right 30% plus a fade. The previous page shifts left 10% and dims. |
| Item card to item detail | **Shared element:** the card photo grows into the detail carousel (`layoutId`). |
| Step form, next question | Current question slides up 24px and fades out. The next slides up from 24px below and fades in. The progress bar fills with `spring-smooth`. |
| Invalid submit | Field shakes horizontally (6px, 3 cycles, 300ms), the border turns `--danger` and the error text fades in. On Android, `navigator.vibrate(10)` adds a tick. |
| Search chips appear | Chips fade and rise 8px with a 40ms stagger. Removing a chip shrinks it to 0.8 and fades it out. |
| Chat message | The bubble scales from 0.96 and rises 8px. The bot shows a 3-dot typing indicator (dots pulse with 120ms offsets). |
| Claim submitted | Circle draws, then a checkmark stroke draws (400ms, SVG `stroke-dashoffset`), then the title fades in. |
| Bottom sheet | Slides up with `spring-smooth`; drag down to dismiss with rubber-band resistance; the backdrop fades to 40% black. |
| Status change in Requests | The chip text cross-fades and a dot badge pops (scale 0 to 1.15 to 1) on the tab icon. |
| Loading content | Skeletons in `--fill` with a slow shimmer (1.4s). No spinners for content; spinners appear only inside buttons. |
| Pull to refresh | A thin black arc fills as you pull, then rotates while loading. |

### 3.3 Reduced motion

Under `prefers-reduced-motion: reduce`, all slides, scales and shared elements become 150ms cross-fades. Shimmer stops. The checkmark appears without drawing.

---

## 4. Components

| Component | Spec |
|---|---|
| **Primary button** | Full width on mobile, height 52px, radius 14, `--ink` background, white `callout` text. Disabled: `--line` background, `--ink-3` text. Loading: label replaced by a 16px white spinner, width unchanged. |
| **Secondary button** | Same size, white background, 1px `--ink` border. |
| **Text button** | `callout` in `--ink`, underlined on hover or focus. |
| **Input** | Height 52px, `--fill` background, no border at rest; on focus, a 1.5px `--ink` border and white background. Label sits above as `caption`. Helper text sits below in `--ink-3`; an error replaces it in `--danger`. |
| **Big question input** (step forms) | No box: 28px text with only a 2px bottom line, which turns `--ink` on focus. |
| **OTP input** | 6 boxes of 48 x 56px with auto-advance; paste fills all of them. The focused box gets a 1.5px `--ink` border and a blinking caret. |
| **Search bar** | Height 48px, pill radius, `--fill` background, search icon on the left, clear (x) on the right when filled. Rotating placeholder cross-fades every 3s. |
| **Chip** | Height 32px, pill, 1px `--line` border, `callout`. Removable chips have an x. A dotted border means "not recognised" (with a tooltip). |
| **Item card** | 1:1 photo with 20 radius, title (`callout` 600) and meta line (`caption` `--ink-3`: place and "2d ago"). Badge in the top-left corner: a white pill with black text ("Requested"). |
| **Status chip** | Monochrome, distinguished by fill and icon, not colour: Submitted (outline, clock), Under review (outline, eye), Approved (solid black, check), Not selected or Rejected (`--fill`, minus), Collected (solid black, package). |
| **Bottom nav** | Height 56px plus the safe-area inset, white with 80% opacity and `backdrop-filter: blur(20px)`, 1px top `--line`. Claimant: Home, Requests, Profile. Staff: Home, Items, Add (raised center button), Pickup, Profile. |
| **Bottom sheet** | 20 radius top corners, 36 x 5px grab handle, max height 92dvh. |
| **Toast** | Black pill, white text, bottom center above the nav, auto-hides after 3s, swipe to dismiss. |
| **Tooltip** | (i) icon 16px next to the label. Tap or hover opens a black popover (max 260px wide, `caption` white text, 10 radius) with a 6px arrow. Closes on tap outside or Esc. Mobile tooltips never rely on hover. |

---

## 5. Validation and tooltip pattern

1. **Validate on blur, re-validate on change.** Errors never appear while someone is still typing the first time.
2. **The primary button stays disabled until the step is valid**, with a short hint under it explaining what's missing ("Add at least 2 photos").
3. **Errors are specific and kind.** Say what to do, not what went wrong: "Enter a valid email, like name@example.com," not "Invalid input."
4. **Tooltips explain why, helper text explains how.** Helper text is always visible under the field. A tooltip (i) is reserved for the "why" or privacy notes.
5. All error messages come from the **Validation Rules** sheet in the workbook, so web and PWA say the same thing.

---

## 6. Claimant PWA screens

The layout is mobile-first, capped at 480px wide and centered on larger screens. Bottom nav: **Home · Requests · Profile**.

### 6.1 Onboarding (full screen, no nav)

```
┌──────────────────────────┐   ┌──────────────────────────┐
│                          │   │ ←                ━━━──── │  progress
│                          │   │                          │
│   Lost something?        │   │  What's your email?      │  display
│   Let's get it back.     │   │                          │
│                          │   │  name@example.com        │  big input
│                          │   │  ────────────────────    │
│                          │   │  We'll send you a 6-digit│  helper
│                          │   │  code. No password.      │
│  ┌────────────────────┐  │   │  ┌────────────────────┐  │
│  │    Get started     │  │   │  │      Continue      │  │
│  └────────────────────┘  │   │  └────────────────────┘  │
└──────────────────────────┘   └──────────────────────────┘
```

**Flow:** Welcome, then Email, then Code, then Name (new users only), then Phone (new users only), then the Location primer, then Home. Each step uses the step-form transition. The keyboard opens automatically, and the Continue button sits just above it.

### 6.2 Home

```
┌──────────────────────────┐
│ Hi Sarah                 │  title
│ ╭──────────────────────╮ │
│ │ ⌕ Black bag in Atriu…│ │  search pill
│ ╰──────────────────────╯ │
│ Nearby places            │  callout 600
│ ┌──────┐ ┌──────┐ ┌───   │  horizontal scroll
│ │Atrium│ │City  │ │      │
│ │0.4 km│ │1.2 km│ │      │
│ │12 items│8 items│       │
│ └──────┘ └──────┘ └───   │
│ Recently found           │
│ ┌────────┐ ┌────────┐    │  2-column grid
│ │ photo  │ │ photo  │    │
│ │Black…  │ │AirPods │    │
│ │Atrium·2d│ │City·5h │    │
│ └────────┘ └────────┘    │
├──────────────────────────┤
│  ⌂ Home   ☰ Requests  ◯ Me│  bottom nav
└──────────────────────────┘
```

Tapping the search bar expands it to full screen: the bar moves to the top, the keyboard opens, and recent searches appear.

### 6.3 Search results

- The parsed chips sit under the bar: `[Black bag ×] [📍 Atrium Mall ×]`.
- A 2-column grid of item cards follows, with infinite scroll.
- Empty state: a centered line icon, "No match yet," and "Items are added all the time, so check back soon."

### 6.4 Item details

```
┌──────────────────────────┐
│ ←                        │  floating back button on photo
│ ┌──────────────────────┐ │
│ │                      │ │  carousel, swipe, tap = full screen zoom
│ │        photo         │ │
│ │       ● ○ ○          │ │
│ └──────────────────────┘ │
│ Black backpack           │  title
│ 📍 Atrium Mall · Food court│
│ 🕑 Found 2 days ago       │
│ Desk: Mon–Sun 10:00–22:00│
│                          │
│ ┌────────────────────┐ ⓘ │
│ │    This is mine    │   │  sticky bottom button
│ └────────────────────┘   │
└──────────────────────────┘
```

### 6.5 Claim chat (bottom sheet, 92% height)

```
┌──────────────────────────┐
│          ━━━             │  grab handle
│ [thumb] Black backpack   │  pinned item
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │Tell us why this is   │ │  bot bubble: --fill, left
│ │yours. Describe…      │ │
│ └──────────────────────┘ │
│        ┌───────────────┐ │
│        │It has my blue │ │  user bubble: --ink, white text, right
│        │bottle inside… │ │
│        └───────────────┘ │
│ ┌──────────────────────┐ │
│ │Was there anything    │ │
│ │attached to it?       │ │
│ └──────────────────────┘ │
│  [I don't know]          │  quick reply chip
│  1 more question         │  caption
├──────────────────────────┤
│ 📎 Type your answer…   ↑ │  input bar above keyboard
└──────────────────────────┘
```

The submitted state replaces the input bar with the success animation and a **See my requests** button.

### 6.6 Requests

- A list of rows: a 56px thumbnail, title, place, date, and a status chip aligned right.
- An approved row opens the **pickup card**: a large QR code on white, the 6-digit code (in tabular figures, grouped `482 913`), the place, desk hours, **Get directions** and "Valid until 14 Nov." Tapping the QR opens it full screen and turns on Wake Lock.

### 6.7 Profile

Grouped list (iOS settings style): name, email (read only) and phone, then the notifications and "Use my location" toggles, then Sign out and Delete account (text in `--danger`).

---

## 7. Staff screens (same app, mobile-first)

Staff use **the same PWA**. They sign in with the same Email and Code screens, and their role sends them to the staff screens. The look, components and motion are identical; only the screens and the bottom nav change. On a laptop, staff see the same 480px phone layout, centered.

**Staff bottom nav:** Home · Items · **＋ Add** (raised 56px black circle in the center) · Pickup · Profile

```
┌──────────────────────────┐
│ Atrium Mall              │  caption: org name (staff mode cue)
│ Lost & Found             │  title
│ ┌──────────┐┌──────────┐ │
│ │ 24       ││ 3        │ │  2 x 2 stat tiles
│ │Available ││To review │ │
│ └──────────┘└──────────┘ │
│ ┌──────────┐┌──────────┐ │
│ │ 2        ││ 61%      │ │
│ │For pickup││Return ⓘ  │ │
│ └──────────┘└──────────┘ │
│ Needs attention          │
│ [thumb] Black backpack 3 claims ›│
│ [thumb] AirPods        1 claim  ›│
├──────────────────────────┤
│ ⌂ Home  ▦ Items  (＋)  ⌗ Pickup  ◯ │
└──────────────────────────┘
```

| Screen | Layout |
|---|---|
| **Staff Home** | The org name as a caption above the title (so staff always know they're in staff mode). 2 x 2 stat tiles (big number in `display`, label in `caption`), with the return rate in the fourth tile. Below: a "Needs attention" list of items with claims waiting for review. |
| **Add (center tab)** | Opens the full-screen step form, sliding up like a sheet. Steps: Photos (a big "Take photo" tile that opens the rear camera directly, a "Choose from gallery" link, and a thumbnail strip), Title (AI suggestion label), Location, Private description (lock icon), Review. The success screen offers "Add another" (back to the camera) and "View item". |
| **Items** | Horizontally scrolling status pills, a search bar, then a 2-column card grid. Each card has a status chip and a claim-count badge. The location filter opens in a bottom sheet. |
| **Item page** | Photo carousel, details, then segmented tabs: **Claims · Details · Activity**. Claims are sorted by score; each row has a score bar (a black fill on a `--fill` track, with the number and a High, Medium or Low label). Tapping a claim opens a bottom sheet with the AI rationale checklist (✓ matched, ½ partial, ✕ missed, ⚠ contradiction, each written out in words), the chat transcript, and sticky **Approve** and **Reject** buttons. |
| **Pickup tab** | Opens straight into a full-screen camera QR scanner with a rounded square guide and a dimmed surround, plus an "Enter code instead" button that swaps in the 6-digit input. A valid scan triggers a short vibration (Android) and slides up a confirmation sheet with the item photo, claimant name, phone ending, and **Hand over**. |
| **Profile** | Name, organization, Sign out. |

---

## 8. Voice and microcopy

- Sentence case everywhere. No exclamation marks except "Good news!" in the approval notification.
- Use "your item" and "we", never "the user" or "the system".
- Keep it under 12 words where possible.
- **Never** confirm or deny a private detail. Not "Correct!" or "That's not right," only "Thanks, got it."

| Situation | Copy |
|---|---|
| Claim submitted | "Thanks, your request was submitted. We'll let you know." |
| Not selected | "This item went to another owner. We hope you find yours soon." |
| Rejected | "We couldn't verify this item as yours. If you think this is a mistake, visit the desk." |
| Approved push | "Good news! Your black backpack is ready for pickup at Atrium Mall." |
| Offline | "You're offline. Showing saved results." |

---

## 9. Accessibility

- Text contrast is at least 4.5:1. The greyscale palette above is checked against white.
- Status is never shown by fill alone. Every status chip has an icon and a word.
- Focus rings: a 2px `--ink` outline with a 2px offset on every interactive element (`:focus-visible`).
- The bottom nav is a `<nav>` with `aria-current="page"` on the active tab. Sheets trap focus and close on Esc.
- Chat uses `aria-live="polite"` so screen readers announce new bot messages.
- Respect `prefers-reduced-motion` (section 3.3) and browser zoom up to 200%.
