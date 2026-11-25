# UI audit — Nhịp lễ (Wedding Music Planner)

Date: 2026-11-20. Scope: every route under `src/app` and every component under `src/components`.
Method: source read of all 18 pages and 5 components, plus full-page screenshots at 1440, 820 and
390 px of every route, signed in with the local test session as `test-admin`
(`docs/design/screenshots/before/*.png`). Reference rules: `.agents/skills/design-taste-frontend`
(`SKILL.md`, `references/system.md`, `motion.md`, `copy.md`, `layout-v4.md` section 5) and the
approved spec `specs/001-wedding-music-planner/spec.md` (FR-009, FR-015, FR-037, FR-038).

Baseline before redesign: `npm run typecheck` clean, `vitest run` 31 files / 166 tests pass.

## 1. Summary

The product is functionally complete, but every screen is the same template: a serif h1, a row of
pill buttons, and a white rounded box with a list inside. Nothing tells a visitor this is a wedding
music product rather than a generic CRUD admin. The two experiences the product needs, an editorial
planning surface and a precise audio workstation, are not differentiated at all: the audio editor
looks like a settings form.

The five most damaging problems, in order:

1. **The audio editor is a form, not an editor.** A 112px strip of 160 bars, five millisecond number
   inputs, and seven equal-weight pill buttons. No selection region, no trim handles, no playhead,
   no time ruler, no zoom, no transport. Spec FR-015 requires drag trim boundaries, zoom and seek.
2. **The wedding plan page is an undifferentiated wall.** 11 stages × (5 small buttons + select +
   details + 2 forms) = ~120 controls at the same visual weight (see `plan-1440.png`). Status,
   progress and the ceremony order are invisible.
3. **Playlist detail shows raw UUIDs** (`4febeba3-ca81-…`) as track names, total duration in raw
   milliseconds ("Tổng 48000 ms"), and asks users to type a "Mã bản chỉnh" (revision UUID) to add a
   song.
4. **Headings render in a fallback font for Vietnamese diacritics.** `Fraunces` is loaded with
   `subsets: ["latin"]` only, so every heading with ạ, ễ, ọ, ư… mixes two faces.
5. **Mobile navigation is a wrapped paragraph of links** (three lines at 390px, ~20px tap height),
   with no menu, no current-page marker, and the user name floating on its own line.

## 2. Findings by category

### 2.1 Visual hierarchy

| Screen | Problem |
|---|---|
| Landing `/` | Hero card ("Lễ nhà, 16:00") is a plain white list with a blank bottom third; it neither shows the product nor reads as a ceremony. Steps 1-2-3 are a generic three-column feature row. |
| Discover `/kham-pha` | Filter "Lọc" button is full column width and darker than the results; results are plain text rows with no duration, stage or preview affordance. The stage taxonomy (the product's core idea) is hidden inside a select. |
| Track `/bai-hat/[id]` | Title, metadata and native `<audio>` are stacked with equal weight; the permission state reads as a footnote. |
| Dashboard `/bang-dieu-khien` | Four identical cards linking to nav destinations: it duplicates the header and shows no state (no plans, no exports, no next step). |
| Editor `/bien-tap/[id]` | Waveform is the smallest element on the page; the primary action "Lưu bản mới" sits among six outline pills. |
| Plan `/ke-hoach/[id]` | Destructive "Xoá phần" sits beside "Lên/Xuống" at the same size; plan status is one plain sentence; readiness and handoff are two underlined text links. |
| Readiness, handoff | Single-column text with plain rows; the readiness result (ready vs N issues) has no visual state. |
| Admin | A bare `<ul>` of "kind: errorCode" strings. |

### 2.2 Spacing

- No spacing scale. Pages mix `mt-1/2/3/4/6/8/10` arbitrarily; the plan page uses `mt-2` between
  unrelated groups and `mt-3` inside one group.
- Every page starts at `py-10` with the h1 flush under the header; heading-to-content is 24px on
  some pages, 8px on others.
- Landing hero has ~110px of dead space under the right card at 1440; discover and library leave
  60% of the viewport empty with no empty-state composition.

### 2.3 Typography

- Fraunces without the Vietnamese subset (see summary 4). Weights 500/600 only, so headings look
  heavy at 36px.
- Tracked uppercase eyebrow ("NHẠC LỄ CƯỚI", `tracking-[0.18em]`) — tracked capitals reduce
  legibility of Vietnamese diacritics and break the Taste rule of sentence-case labels.
- 14px (`text-sm`) is used for body copy in many places (filters help, cue rows, export status,
  readiness hints); the plan page's stage controls are effectively 12-13px at 1440.
- No defined type scale: h1 is `text-4xl` everywhere except the landing (`text-5xl/6xl`); h2 varies
  between `text-xl`, `text-lg`, `text-2xl`.
- Numbers are not tabular: times like "2.0 giây → 50.0 giây" jitter while editing.

### 2.4 Repetitive components

- The same `rounded-3xl border border-line bg-white p-5` box wraps the editor, plan profile, each
  stage, sign-in form, YouTube form and discover list.
- Pill buttons in four ad-hoc variants (`bg-ink`, `bg-wine`, `border-ink`, `border-wine`) at three
  heights (`py-1`, `py-1.5`, `py-2`, `py-3`) with no rule for which is primary.
- Inputs are restyled inline 40+ times with copy-pasted class strings.

### 2.5 Navigation

- Five nav labels plus "Quản trị" and the user name; no current-page indication anywhere.
- "Danh sách" is ambiguous (list of what?). "Tải nhạc" (upload) is a top-level item although it is a
  library action.
- Plan sub-pages (readiness, handoff) have no shared sub-navigation; you return via a text link.
- At 390 the header grows to ~110px of wrapped links; no menu button, no `aria-expanded`.
- The skip link exists but lands on the `<main>` without offset context; good, keep it.
- The Next.js dev indicator overlaps content at bottom-left (dev only, not a product issue).

### 2.6 Mobile layouts (390px)

- Header: three wrapped link lines, tap targets ~20px tall (below 44px).
- Plan page: stage control row wraps into 3-4 lines of tiny pills; selects overflow their row.
- Editor: number fields stack to one column, the waveform is 260px wide with no way to zoom.
- Library: action pills wrap under the filename, separate from the item they act on.
- Discover filters stack fine, but the "Lọc" button and "Xoá bộ lọc" link sit on separate rows.

### 2.7 Missing interaction states

- **Loading:** plain text "Đang tải…" on library, plan, readiness, handoff, account; plans and
  playlists lists show nothing while loading (indistinguishable from empty).
- **Empty:** plans and playlists lists have no empty state at all. Discover's empty state is a
  dashed box with one sentence and no way forward.
- **Error:** plans and playlists list fetches ignore non-401 errors; the account page has no error
  path; admin catalog shows raw ids in success text.
- **Busy:** plan actions (reorder, add cue, status change) give no pending feedback; double clicks
  are possible. Upload shows a text line only, no progress.
- **Hover/press:** only `hover:text-wine` on nav and `hover:-translate-y-0.5` on dashboard cards.
  Buttons have no hover, press or disabled styling beyond `opacity-50`.
- **Selected/current:** no `aria-current` in nav; no selected state for stage filters.
- **Editor dirty state:** "Bản đang sửa khác bản đã lưu" is a 14px grey line inside a box.

### 2.8 Accessibility

| Issue | Where | Severity |
|---|---|---|
| Tap targets under 44px | nav links, plan stage pills (`py-1 text-sm` ≈ 26px), export buttons (`py-1.5` ≈ 30px), playlist "Lên/Gỡ" text links | High |
| Inputs without visible labels (placeholder as label) | library search, plans create name, playlists create name, playlist "Mã bản chỉnh", admin catalog fields, plan "Tên phần lễ mới" | High |
| Generic accessible names | plan stage buttons "Nhân bản", "Xoá phần" lack the stage name; cue "Lên/Xuống" repeat identically across cues | Medium |
| Waveform is `aria-hidden` with no textual summary of the selection | editor | Medium |
| Status messages not announced | upload progress, YouTube info, playlist errors, admin messages (no `role="status"`/`alert`) | Medium |
| Raw enum shown to users | plans list shows `DRAFT`, account shows `USER`/`ADMIN`, admin shows `UPLOAD_FAILED` codes | Medium |
| `text-stone-500` (#78716c) on #f3ece4 ≈ 4.0:1 — below 4.5:1 for 14px text | track meta, home card | Medium |
| No `prefers-reduced-motion` handling (only one hover transform exists today) | global | Low |
| Focus ring present and visible (`#8f3d4b`, 2px) | global | Pass |
| `lang="vi"`, skip link, labelled `nav` | layout, shell | Pass |

### 2.9 Content and copy

- Raw technical strings shown to users: UUIDs, milliseconds, enum states, byte counts on the account
  page ("Đã dùng 11289678 / 1073741824 byte").
- English placeholder data in the dev catalog ("Audit Track") is data, not UI; out of scope.
- Landing sub-line is a list of negatives ("Không tự phát…, không ghi đè…"); the hard fact (MP3
  handoff per ceremony step) is buried.

## 3. Constraints for the redesign

- Keep every route, API call, request body, version/idempotency header and confirm dialog as is.
- Keep every user-visible capability: nothing removed, including YouTube metadata flow and the
  test-session form.
- No fabricated artwork or metadata: tracks have no cover images in the data model, so none is
  shown. Music visuals come from real data only (waveform peaks, durations, stage names).
- Vietnamese UI copy; sentence case; no tracked capitals.
- Spec FR-038: keyboard access, visible focus, unsaved-change warning, destructive confirmation,
  non-drag alternatives for any drag interaction.

## 4. Priorities

1. Application shell and navigation (all screens benefit; fixes the mobile header).
2. Design tokens and shared component classes (fixes the repetition and inconsistency at the root).
3. Audio editor as a studio surface (largest gap against spec FR-015).
4. Plan timeline (largest density problem).
5. Discover, track, library, playlists (raw data presentation, empty/loading states).
6. Readiness, handoff, auth, profile, admin.
