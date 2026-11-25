# Implementation progress

Updated: 2026-11-20

Spec Kit feature: `specs/001-wedding-music-planner`. Constitution v1.0.0. This file is the checkpoint for the next session. A feature is not `COMPLETED` while a required check is blocked.

## Environment

- Next.js 15 App Router, React 19, TypeScript, Tailwind, PostgreSQL 16 on `127.0.0.1:5433`.
- SQL changesets `wedding:001-schema`, `wedding:002-catalog-seed`, and `wedding:003-upload-filename` are applied.
- `npx tsc --noEmit` passed. `npx next build` passed. `npx vitest run`: 16 files, 31 tests passed, including the persistence integration test.
- Dev server: `npm run dev` on `http://127.0.0.1:3000`.
- Playwright browser runtime is unavailable on this Ubuntu host (`BROWSER_CHECK=not-pass`). System Chrome was used for page checks. That is not a Playwright pass.
- Google OAuth client id and secret are empty. `GET /api/auth/google` redirects to `/dang-nhap?error=chua-cau-hinh`.
- YouTube media acquisition downloads audio with yt-dlp (`YTDLP_PATH`, default `yt-dlp`) into the owner's private library, then opens the waveform editor at `/bien-tap/{assetId}`. Tests use a fake downloader and `fixture:` ids under `tests/fixtures/media`.

## Verified in this session

- Public catalog search `q=mau` returns `Mẫu khúc đón khách`. Draft `Mẫu bản nháp chưa xuất bản` stays hidden. Ceremony slug `don-khach` plus `INSTRUMENTAL` returns the published sample.
- Preview of that metadata-only track returns 403 `PREVIEW_FORBIDDEN`.
- Test sessions create one user per Google subject. A second sign-in with the same subject returns the same user id. `userFromToken` loads that user. Account deletion removes the user after dependent playlist items and cues are cleared.
- A WAV upload becomes `READY`. A non-audio file becomes upload state `FAILED` / `INVALID_AUDIO` and creates no asset. Another user receives 404 for the private asset.
- A revision export completes as real MP3: 44.1 kHz, stereo, 192 kb/s, duration about 2.04 s for a 2 s clip. The other user receives 404 for the file.
- Playlist create and a suggested wedding plan (11 stages) succeed over HTTP.
- YouTube URL `https://www.youtube.com/watch?v=jNQXAC9IVRw` returns title `Me at the zoo` and channel `jawed`. The import job is `FAILED` / `BLOCKED` with no asset. A malformed host returns 422. `fixture:tone` becomes `READY_FOR_EDITING`.
- Chrome rendered `/`, `/kham-pha?q=mau`, the track page, sign-in, the signed-in dashboard, library, editor, and plan list. The editor showed a real peak strip and the trim fields for `tone.wav`. Track permission and vocal type, library source status, and dashboard storage are in Vietnamese.

## Feature states

| ID | State | Notes |
| --- | --- | --- |
| WMP-001 | BLOCKED | Session, returning subject, logout cookie, and account deletion work. Live Google sign-in needs `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. |
| WMP-002 | IMPLEMENTED_UNVERIFIED | Search, accent fold, filters, and draft exclusion are checked. Sort and pagination are implemented and not exercised in the browser. |
| WMP-003 | IMPLEMENTED_UNVERIFIED | Detail page and metadata-only refusal are checked. Playback of a real catalog file is not, because the seeded track has no audio. |
| WMP-004 | IMPLEMENTED_UNVERIFIED | Library lists the uploaded WAV after sign-in. |
| WMP-005 | IMPLEMENTED_UNVERIFIED | HTTP upload and rejection are checked. Drag-and-drop and cancel were not clicked. |
| WMP-006 | IMPLEMENTED_UNVERIFIED | Editor renders waveform and controls. Trim, fade, gain, undo, and save were not clicked in the browser. |
| WMP-007 | IMPLEMENTED_UNVERIFIED | Immutable revisions and playlist version conflicts pass in the integration test. |
| WMP-008 | IMPLEMENTED_UNVERIFIED | Real MP3 export and private download are checked. Cancel, retry, and worker recovery after a closed browser are not. |
| WMP-009 | IMPLEMENTED_UNVERIFIED | Playlist create is checked over HTTP. Reorder and duplicate items are not. |
| WMP-010 | IMPLEMENTED_UNVERIFIED | Suggested plan create is checked over HTTP. |
| WMP-011 | IMPLEMENTED_UNVERIFIED | Cue snapshot behavior is covered by the service integration test, not by the page. |
| WMP-012 | IMPLEMENTED_UNVERIFIED | Readiness and approval invalidation are covered by tests, not by the review page. |
| WMP-013 | IMPLEMENTED_UNVERIFIED | The service test builds a ZIP with PDF, CSV, and MP3. The download page was not used. |
| WMP-014 | IN_PROGRESS | A normal user receives 403 on admin failures. Catalog management UI is thin. |
| WMP-015 | IMPLEMENTED_UNVERIFIED | Version conflict is tested for playlists. Two-tab UI conflict is not. |
| WMP-016 | IMPLEMENTED_UNVERIFIED | Quota rules are unit-tested. Account deletion works. Dependency-blocked asset delete is not exercised over HTTP. |
| WMP-017 | IN_PROGRESS | Public and signed-in pages render in Chrome on desktop. Mobile landing and discovery were screenshotted. Playwright and the Taste finish gate were not run. |
| WMP-018 | BLOCKED | Metadata and the blocked acquisition state are verified against a real public video. Permitted YouTube download does not exist. Fixture audio can be edited through the same asset pipeline. |

## Next independent task

Open the waveform editor for an uploaded WAV in the browser, save a revision, export the MP3 from the page, add that revision to a playlist, copy the playlist into a wedding stage, and download the handoff ZIP from the plan page. Keep YouTube acquisition blocked.
