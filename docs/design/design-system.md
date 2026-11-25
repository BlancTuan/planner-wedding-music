# Design system — Nhịp lễ

One system for the whole product, in two surfaces that share type, spacing, radii and motion:

- **Editorial** (ivory): landing, discovery, track detail, library, playlists, plans, readiness,
  handoff, account, admin. Warm paper, editorial serif headings, hairlines instead of boxes,
  asymmetric two-column compositions.
- **Studio** (warm near-black): the audio editor's working surface and its export strip. High
  contrast, large waveform, precise ruler and transport, visible editing state.

Source of truth in code: `tailwind.config.js` (tokens), `src/app/globals.css` (CSS variables and
component classes), `src/components/icons.tsx` (glyphs). Do not add a second button, card, input or
radius style anywhere else.

Applied from `.agents/skills/design-taste-frontend`: one button pair plus a text link, one radius
family, body text ≥ 16px, labels ≥ 13px in sentence case (no tracked capitals), one accent, an
opaque header with a hairline and a 2px current-page bar, a full-screen mobile menu with
`aria-expanded`, the motion tokens and distances from `references/motion.md`, no scroll-triggered
reveals, no invented proof or artwork, no captions under visuals. Deviation, on purpose: Taste
reserves dark grounds for tech pages; the studio editor is software UI inside the product, so its
dark surface follows the brief's "professional music studio" direction. It is confined to the editor
band and never used on editorial pages.

## 1. Colour tokens

All text pairs below meet WCAG AA; body text pairs meet 7:1.

### Editorial

| Token | Hex | Use |
|---|---|---|
| `--ivory` | `#f7f2ea` | Page ground |
| `--paper` | `#fffcf7` | Raised surfaces: inputs, panels, rows that hold controls |
| `--champagne` | `#efe5d6` | Alternate band, selected chip, stage rail, meter track |
| `--champagne-deep` | `#e2d3bd` | Strong hairline, dividers between sections |
| `--line` | `#e4d8c8` | Default 1px hairline, input border |
| `--ink` | `#231b18` | Text, secondary-button border, icons. 15.6:1 on ivory |
| `--muted` | `#6a5c53` | Meta, labels, dates only. 6.0:1 on ivory |
| `--wine` | `#8f3d4b` | The one accent: primary button, links, focus ring, current-page bar, selection. 7.0:1 on ivory; white on wine 7.6:1 |
| `--wine-deep` | `#74303c` | Primary hover/press |
| `--wine-tint` | `#f3e3e2` | Accent wash for current/selected states only |

### Status (editorial)

| Token | Hex | Meaning | Always paired with |
|---|---|---|---|
| `--ok` | `#3d6a4c` | Ready, listened, completed | check icon + word |
| `--ok-tint` | `#e3eee4` | Ready chip ground | |
| `--warn` | `#8a5a0c` | Needs attention, processing, outdated | alert icon + word |
| `--warn-tint` | `#f6ead2` | Warning chip ground | |
| `--danger` | `#a3352b` | Destructive actions, failures | trash/alert icon + explicit verb |
| `--danger-tint` | `#f7e1dc` | Error message ground | |

Colour never carries meaning alone: every status chip has an icon and a word.

### Studio

| Token | Hex | Use |
|---|---|---|
| `--studio-bg` | `#14100e` | Studio band ground |
| `--studio-panel` | `#1e1916` | Waveform track, control panels |
| `--studio-raised` | `#2a231f` | Buttons, inputs, ruler |
| `--studio-line` | `#3a312b` | Hairlines on dark |
| `--studio-text` | `#f4ece2` | Text. 15.9:1 on panel |
| `--studio-muted` | `#b3a497` | Labels, ruler numbers. 7.2:1 on panel |
| `--studio-wave` | `#5d5149` | Waveform outside the selection |
| `--studio-wave-on` | `#efd9bd` | Waveform inside the selection (champagne) |
| `--studio-accent` | `#ec8f9d` | Trim handles, selection edge, focus ring on dark. 6.8:1 on panel |
| `--studio-region` | `rgba(236,143,157,.09)` | Selection fill |
| `--studio-fade` | `rgba(20,16,14,.55)` | Fade-in/out ramps drawn over the selection |

## 2. Typography

Faces: **Newsreader** (display, 400 and 500, optical size axis, Vietnamese subset) and **Hanken
Grotesk** (text and UI, 400 and 500, Vietnamese subset), loaded through `next/font/google` with
`display: swap`. Never 700+. Tabular figures (`font-variant-numeric: tabular-nums`) on every time,
duration, size and counter.

| Token / class | Desktop | Phone | Face | Use |
|---|---|---|---|---|
| `text-display` | 72/76, -2.5% | 40/44 | Newsreader 400 | Landing h1 only |
| `text-h1` | 48/54, -1.5% | 34/40 | Newsreader 400 | Page title |
| `text-h2` | 32/38, -1% | 26/32 | Newsreader 400 | Section heading |
| `text-h3` | 22/28 | 20/26 | Newsreader 500 | Stage name, panel heading, track title in lists |
| `text-lead` | 20/30 | 18/28 | Hanken 400 | Sub-line under a page title |
| `text-base` | 16/26 | 16/26 | Hanken 400 | Everything people read |
| `text-sm` | 14/20 | 14/20 | Hanken 400 | Meta lines only (dates, formats) |
| `.label` | 13/18, 500 | 13/18 | Hanken 500 | Field labels, chip text, ruler; sentence case |

Rules: lines ≤ 62 characters (`max-w-measure`); one size per element kind across the product; no
text below 13px; no uppercase tracking.

## 3. Spacing

Scale (px): 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 — Tailwind `1, 2, 3, 4, 6, 8, 12, 16, 24, 32`.
No other values for margin, gap or padding.

- Page top padding: 48 (phone 32). Page head to content: 48 (phone 32).
- Between sections of a page: 64 (phone 48). Between rows in a list: hairline, 16 vertical padding.
- Panel padding: 24 (phone 16). Field label to input: 8. Field to field: 16.
- Container: `.wrap` = min(1200px, 100% − 2×gutter); gutter 48 desktop, 24 tablet, 16 phone.

## 4. Radii

One family, "soft": `--r-sm` 8px (inputs, chips' focus, small panels), `--r-md` 12px (panels,
rows that are boxes), `--r-lg` 20px (frames: landing product frame, studio surface), buttons and
chips fully rounded (`--r-pill`). Nothing else.

## 5. Shadows

Flat by default; hairlines separate. Two shadows only:

- `--shadow-lift`: `0 12px 24px -12px rgba(35,27,24,.18)` — linked rows/cards on hover only.
- `--shadow-float`: `0 1px 2px rgba(35,27,24,.06), 0 24px 48px -24px rgba(35,27,24,.28)` —
  the landing product frame and the mobile sticky action bar. Never on buttons.

## 6. Components

All defined in `globals.css` under `@layer components`.

### Buttons (one pair, plus tool buttons)

| Class | Look | Use |
|---|---|---|
| `.btn .btn-primary` | Wine fill, white label | Exactly one per view: the main action |
| `.btn .btn-secondary` | Ink 1px outline, transparent | Every other action |
| `.btn .btn-danger` | Danger outline and label | Destructive actions; always behind `confirm()` |
| `.btn-sm` | 44px height, smaller text and padding | Row-level actions |
| `.icon-btn` | 44×44 round, ink glyph, hover champagne | Reorder, duplicate, remove in rows; always has `aria-label` naming the object |
| `.link` | Wine text, 1px underline offset .2em | Inline navigation |
| `.studio-btn`, `.transport-btn` | Raised dark, 44px / 56px round play | Studio only |

Height 44px, label 16px/500, padding 0 24px, gap 8 for an icon. States: hover (fine pointer) steps
1px up and the fill steps darker; press sinks 1px and scales .985; `:disabled` uses
`--line` border and `--muted` label with `cursor: not-allowed` (never opacity alone); busy shows a
label change ("Đang lưu…") and `aria-busy`.

### Form fields

`.field` wraps `.label` + control + optional `.hint` / `.field-error`. Control classes `.input`,
`.select`, `.textarea`: 48px high (textarea 96px min), paper ground, 1px `--line` border,
`--r-sm`, 16px text. Hover border `--champagne-deep`; focus border wine + 3px `--wine-tint` ring
(plus the global focus outline for keyboard). Every control has a visible label; placeholders are
examples only. `.check` is a 20px checkbox with accent-color wine and a 44px label hit area.

### Chips and status

`.chip` (13px/500, 28px high, pill): neutral (champagne), `.chip-ok`, `.chip-warn`,
`.chip-danger`, `.chip-accent`. A chip that filters is a link or button with `aria-current="true"`
or `aria-pressed` when selected (wine tint ground, wine text).

### Surfaces

- `.panel`: paper ground, 1px line, `--r-md`, padding 24. Used for forms and grouped controls.
- `.rows`: a list whose items are separated by hairlines, no box per item. Default for lists of
  tracks, files, packages, plans.
- `.row-link`: a whole row that navigates; hover gains champagne ground and lifts 2px.
- `.band`: full-width champagne section band (landing, page heads on hub pages).
- `.studio`: the dark editor band, full width under the header.

### Feedback

- `.notice` + `.notice-error | -ok | -warn`: inline message with icon, `role="alert"` for errors
  and `role="status"` for progress. Never colour-only.
- Loading: `.skeleton` blocks shaped like the content (rows, waveform) with a 1.6s opacity pulse
  (static under reduced motion) plus visually hidden "Đang tải…" text.
- Empty: `.empty` — a short serif sentence saying what is missing, one line on why it matters, and
  one action.

### Meters

`.meter` (storage, export progress, readiness): 8px champagne track, wine fill, the value written
as text beside it; `role="progressbar"` with `aria-valuenow/min/max` or a `<progress>`.

## 7. Navigation

- **Header:** sticky, 64px (56 under 768), opaque ivory, 1px hairline, `z-index: 30`. Left: mark +
  "Nhịp lễ" (Newsreader 22px). Centre-left: four nouns — Khám phá, Thư viện, Danh sách phát,
  Kế hoạch — plus Quản trị for administrators. Right: account link (initial avatar + name) or the
  "Đăng nhập" primary button for guests. Current section: `aria-current="page"` and a 2px wine bar
  under the word. Upload is reached from the library's primary action and the dashboard (it is a
  library task, not a destination).
- **Under 768:** logo left; menu button right (44×44, `aria-expanded`, `aria-controls`); it opens a
  full-screen sheet with 56px rows, the account row, and closes on route change, Escape, or tapping
  a link. Body scroll is locked while open.
- **Plan sub-navigation:** plan detail, readiness and handoff share `PlanNav`: three tabs-as-links
  (Trình tự lễ, Kiểm tra sẵn sàng, Bàn giao) under the plan title with `aria-current`.
- **Back links:** sub-pages show a small "← Về …" link above the title, never below.
- Skip link "Tới nội dung" stays the first focusable element; `scroll-padding-top` equals the
  header height so focused elements never hide under it.

## 8. Responsive behaviour

Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.

| Pattern | ≥ 1024 | 768–1023 | < 768 |
|---|---|---|---|
| Page head | Title left, actions right on one line | Same, actions wrap under | Stacked, primary action full width |
| Editorial split (landing, track) | 7/5 columns | 1 column, visual after text | 1 column |
| Track rows | number · title/artist · vocal · duration · preview | drop vocal column | title/artist + duration; status under title |
| Plan timeline | time rail left (96px), stage body right, tools top-right | rail 64px | rail collapses to a number badge; tools become a row under the title |
| Studio | waveform full width 240px tall, controls in 3 groups side by side | waveform 200px, controls 2 columns | waveform 160px with horizontal zoom scroll, transport sticky at the bottom of the band, fields 2 columns |
| Forms | 2 columns | 2 columns | 1 column, buttons full width |

No horizontal page scroll at 320px. Tap targets ≥ 44px at every width (checkboxes and sliders keep a 44px hit row).

## 9. Interaction and motion

Tokens (`globals.css`): `--m-in` 150ms, `--m-out` 120ms, `--m-press` 90ms, `--m-panel` 200ms,
`--ease` cubic-bezier(.2,.8,.2,1), `--ease-enter` cubic-bezier(.22,1,.36,1).

- Buttons: 1px step up on hover, 1px down + scale .985 on press (fine pointer only for hover).
- Linked rows/cards: 2px lift and `--shadow-lift` on hover; the row's title underlines.
- Links: underline thickens/darkens on hover; nav words draw a 1px line.
- Menu sheet: fades in with a 6px drop in 200ms, closes in 120ms.
- Landing hero: enters once on load — headline lines rise 12px and fade (700ms, 80ms apart), the
  lead and buttons follow, the product frame settles from scale .98. Nothing else animates on
  scroll anywhere in the product.
- Studio: playhead moves with real playback time (requestAnimationFrame) only while playing;
  handles have a 120ms colour change on hover/drag; the dirty indicator appears without animation.
- Only `transform`, `opacity` and colours animate. No bounce, tilt, parallax, carousels or
  scroll reveals.
- `prefers-reduced-motion: reduce`: no transforms; colours still change; the hero stands as written;
  skeletons stop pulsing.

## 10. Studio editor specifics

- Layout: top bar (file name, source facts, dirty/saved state chip, primary save); waveform
  surface with time ruler; transport row; parameter groups (Đoạn cắt, Fade, Âm lượng); export strip.
- Waveform: up to 600 peak bars from the real `/waveform` response; bars outside the selection
  dim, inside champagne; fade ramps drawn as diagonal shading; playhead 2px line with a time tag.
- Trim handles: 16px-wide grab zones (44px touch), `role="slider"` with `aria-valuenow` in ms and
  `aria-valuetext` in m:ss.s; ←/→ move 100ms, Shift+←/→ 1s, Home/End to bounds. Dragging pushes one
  undo step per drag. Typed inputs remain as the non-drag alternative (spec FR-038).
- Zoom: 1×, 2×, 4×, 8× buttons; the surface scrolls horizontally; "Vừa đoạn chọn" zooms to the
  selection.
- Clicking the waveform outside the handles moves the cursor/playhead position used by "Nghe từ
  con trỏ" (seek inside the selection, spec FR-015).
- Shortcuts (only when focus is not in a text field): Space play/stop, L loop, Ctrl/⌘+Z undo,
  Shift+Ctrl/⌘+Z redo, Ctrl/⌘+S save. Listed in a visible "Phím tắt" line.

## 11. Content rules

- Vietnamese, sentence case, plain words. Buttons are a verb + object ("Lưu bản chỉnh", "Xuất MP3").
- Durations as `m:ss` (`1:20`) or `m:ss.s` in the editor; sizes in MB; dates `vi-VN`.
- Never show UUIDs, raw enum values or byte counts to users; map them to labels.
- No invented artwork, ratings, testimonials or track metadata. Missing duration shows "—".
