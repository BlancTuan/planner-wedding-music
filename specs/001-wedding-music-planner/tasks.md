---

description: "Task list for Wedding Music Planner"
---

# Tasks: Wedding Music Planner

**Input**: Design documents from `/specs/001-wedding-music-planner/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. The constitution requires a failing test before each behavior change.

**Organization**: Tasks are grouped by user story. Priority order is P1, then P2, then P3. All stories remain in the release.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Application: `src/`
- SQL changesets: `db/changelog/`
- Tests: `tests/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the Next.js application shell and local database project.

- [x] T001 Create the Next.js TypeScript project files `package.json`, `tsconfig.json`, `next.config.ts`, and `next-env.d.ts`
- [x] T002 [P] Add Tailwind and Vietnamese font setup in `postcss.config.js`, `src/app/globals.css`, and `src/app/layout.tsx`
- [x] T003 [P] Add `.env.example` and ignore `storage/`, `.next/`, and coverage in `.gitignore`
- [x] T004 [P] Add the project database in `docker-compose.yml` on port 5433
- [x] T005 Add Vitest configuration in `vitest.config.ts` and test scripts in `package.json`
- [x] T006 Set `react` to true with `scripts/bootstrap.sh --profile fullstack-web --react`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, database access, errors, storage, and the worker claim loop. No story is complete before this phase.

- [ ] T007 Create Liquibase SQL changesets in `db/changelog/changelog.sql` for every constrained field in `data-model.md`: `User.displayName`, `User.email`, `User.avatarUrl`, `User.role`, `User.storageUsedBytes`, `User.storageQuotaBytes`, `User.version`, `User.deletionRequestedAt`, `AuthIdentity.provider`, `AuthIdentity.subject`, `UserSession.tokenHash`, `UserSession.expiresAt`, `UserSession.revokedAt`, `MusicCategory.kind`, `MusicCategory.nameVi`, `MusicCategory.slug`, `MusicCategory.sortOrder`, `MusicCategory.isActive`, `Artist.name`, `Tag.name`, `CatalogTrack.title`, `CatalogTrack.durationMs`, `CatalogTrack.vocalType`, `CatalogTrack.sourceNote`, `CatalogTrack.usagePermission`, `CatalogTrack.publishState`, `CatalogTrack.version`, `AudioAsset.sourceType`, `AudioAsset.status`, `AudioAsset.originalFilename`, `AudioAsset.mediaFormat`, `AudioAsset.durationMs`, `AudioAsset.sampleRate`, `AudioAsset.channels`, `AudioAsset.byteSize`, `AudioAsset.storageKey`, `AudioAsset.contentHash`, `AudioAsset.sourceVersion`, `AudioAsset.replacesAssetId`, `AudioAsset.youtubeVideoId`, `Waveform.bucketCount`, `AudioRevision.trimStartMs`, `AudioRevision.trimEndMs`, `AudioRevision.fadeInMs`, `AudioRevision.fadeOutMs`, `AudioRevision.gainDb`, `AudioRevision.processingVersion`, `UploadJob.state`, `UploadJob.idempotencyKey`, `YouTubeImportJob.videoId`, `YouTubeImportJob.originalUrl`, `YouTubeImportJob.state`, `YouTubeImportJob.acquisitionState`, `YouTubeImportJob.idempotencyKey`, `ExportArtifact.state`, `ExportArtifact.progress`, `ExportArtifact.idempotencyKey`, `Playlist.name`, `Playlist.description`, `Playlist.version`, `PlaylistItem.note`, `PlaylistItem.position`, `WeddingPlan.name`, `WeddingPlan.weddingDate`, `WeddingPlan.location`, `WeddingPlan.timeZone`, `WeddingPlan.notes`, `WeddingPlan.state`, `WeddingPlan.version`, `WeddingPlan.listeningApprovedAt`, `WeddingStage.name`, `WeddingStage.description`, `WeddingStage.approximateTime`, `WeddingStage.estimatedDurationMs`, `WeddingStage.status`, `WeddingStage.position`, `WeddingStage.version`, `MusicCue.instruction`, `MusicCue.responsiblePerson`, `MusicCue.advisoryTiming`, `MusicCue.position`, `MusicCue.listeningApprovedAt`, `MusicCue.version`, `HandoffPackage.planVersion`, `HandoffPackage.state`, `HandoffPackage.isOutdated`, `AdministrativeAuditLog.action`, `AdministrativeAuditLog.summary`, `IdempotencyRecord.key`, `IdempotencyRecord.requestHash`
- [ ] T008 Implement environment parsing in `src/server/env.ts`
- [ ] T009 Implement the PostgreSQL pool in `src/server/db.ts`
- [ ] T010 Implement the shared error body in `src/server/errors.ts` and `src/server/http.ts`
- [ ] T011 Implement private storage keys in `src/server/storage.ts`
- [ ] T012 Implement job claiming in `src/worker/claim.ts`
- [ ] T013 Add the health route in `src/app/api/health/route.ts`

**Checkpoint**: Migrations apply and the health route reports the database.

---

## Phase 3: User Story 1 - Sign in and return to the same account (Priority: P1)

**Goal**: One Google subject maps to one user, sessions can be revoked, and a second subject cannot read the first user's data.

**Independent Test**: Create two subjects, store a marker row for the first, and prove the second subject receives 404. Repeat the first subject and prove the user id is unchanged.

### Tests for User Story 1

- [ ] T014 [P] [US1] Write failing identity and session tests in `tests/unit/auth-identity.test.ts`
- [ ] T015 [P] [US1] Write failing account-deletion tests in `tests/unit/account-deletion.test.ts`

### Implementation for User Story 1

- [ ] T016 [US1] Implement account linking and session revocation in `src/server/auth.ts` for `User.role`, `AuthIdentity.provider`, `AuthIdentity.subject`, `UserSession.tokenHash`, `UserSession.expiresAt`, and `UserSession.revokedAt` as defined in `data-model.md`
- [ ] T017 [US1] Implement Google token checks in `src/server/google-token.ts`
- [ ] T018 [US1] Add session routes in `src/app/api/session/route.ts`, `src/app/api/session/logout/route.ts`, `src/app/api/session/test/route.ts`, and `src/app/api/auth/google/callback/route.ts`
- [ ] T019 [US1] Add account deletion in `src/app/api/account/route.ts` using `User.version` and `User.deletionRequestedAt` from `data-model.md`
- [ ] T020 [US1] Add the sign-in and profile pages in `src/app/dang-nhap/page.tsx` and `src/app/tai-khoan/page.tsx`

---

## Phase 4: User Story 2 - Discover published wedding music (Priority: P1)

**Goal**: Guests search and filter published tracks only, including accent-insensitive Vietnamese text.

**Independent Test**: Seed one published and one unpublished track. Search with and without accents returns only the published match.

### Tests for User Story 2

- [ ] T021 [P] [US2] Write failing catalog search tests in `tests/unit/catalog-search.test.ts`

### Implementation for User Story 2

- [ ] T022 [US2] Implement accent folding and catalog queries in `src/server/catalog.ts` for `CatalogTrack.title`, `CatalogTrack.publishState`, `CatalogTrack.vocalType`, `MusicCategory.kind`, and `MusicCategory.slug` as defined in `data-model.md`
- [ ] T023 [US2] Add `src/app/api/catalog/tracks/route.ts` and `src/app/api/catalog/categories/route.ts`
- [ ] T024 [US2] Add the discovery page in `src/app/kham-pha/page.tsx`

---

## Phase 5: User Story 3 - Preview a catalog track (Priority: P1)

**Goal**: Track detail and a single preview player. Metadata-only tracks do not expose editable audio.

**Independent Test**: A `METADATA_ONLY` track returns details and rejects preview audio. Listening volume is not sent as gain.

### Tests for User Story 3

- [ ] T025 [P] [US3] Write failing preview permission tests in `tests/unit/preview-permission.test.ts`

### Implementation for User Story 3

- [ ] T026 [US3] Enforce `CatalogTrack.usagePermission` from `data-model.md` in `src/server/catalog.ts`
- [ ] T027 [US3] Add `src/app/api/catalog/tracks/[trackId]/route.ts` and `src/app/api/catalog/tracks/[trackId]/preview/route.ts`
- [ ] T028 [US3] Add the detail page and player in `src/app/bai-hat/[trackId]/page.tsx` and `src/components/audio-player.tsx`

---

## Phase 6: User Story 4 - Upload private audio (Priority: P1)

**Goal**: Valid MP3 and WAV PCM become private ready assets. Bad files are rejected.

**Independent Test**: Probe a generated WAV and accept it. Probe a text file renamed to `.mp3` and reject it.

### Tests for User Story 4

- [ ] T029 [P] [US4] Write failing media probe tests in `tests/unit/media-probe.test.ts`

### Implementation for User Story 4

- [ ] T030 [US4] Implement FFprobe validation in `src/server/media/probe.ts` for `AudioAsset.mediaFormat`, `AudioAsset.durationMs`, `AudioAsset.sampleRate`, `AudioAsset.channels`, and `AudioAsset.byteSize` as defined in `data-model.md`
- [ ] T031 [US4] Implement upload jobs in `src/server/library.ts` for `UploadJob.state` and `UploadJob.idempotencyKey` from `data-model.md`
- [ ] T032 [US4] Add upload routes in `src/app/api/uploads/route.ts` and `src/app/api/uploads/[jobId]/route.ts`
- [ ] T033 [US4] Add the upload page in `src/app/tai-len/page.tsx`

---

## Phase 7: User Story 5 - Edit audio and keep every revision (Priority: P1)

**Goal**: Waveform peaks come from real audio. Saving creates a new revision and leaves the source unchanged.

**Independent Test**: Invalid trim and overlong fades are rejected. Two saves create two revision ids.

### Tests for User Story 5

- [ ] T034 [P] [US5] Write failing revision rule tests in `tests/unit/revision-rules.test.ts`
- [ ] T035 [P] [US5] Write failing waveform tests in `tests/unit/waveform.test.ts`

### Implementation for User Story 5

- [ ] T036 [US5] Implement revision checks in `src/server/media/revision-rules.ts` for `AudioRevision.trimStartMs`, `AudioRevision.trimEndMs`, `AudioRevision.fadeInMs`, `AudioRevision.fadeOutMs`, and `AudioRevision.gainDb` as defined in `data-model.md`
- [ ] T037 [US5] Implement peak generation in `src/server/media/waveform.ts` for `Waveform.bucketCount` from `data-model.md`
- [ ] T038 [US5] Add revision routes in `src/app/api/assets/[assetId]/revisions/route.ts`
- [ ] T039 [US5] Add the editor page in `src/app/bien-tap/[assetId]/page.tsx` and `src/components/waveform-editor.tsx`

---

## Phase 8: User Story 6 - Export a real MP3 (Priority: P1)

**Goal**: A revision renders to a probed MP3. Failed jobs do not delete the revision. Duplicate active jobs are rejected.

**Independent Test**: Export a one-second tone trim and require `codec_name` `mp3` from FFprobe.

### Tests for User Story 6

- [ ] T040 [P] [US6] Write failing MP3 export tests in `tests/unit/mp3-export.test.ts`

### Implementation for User Story 6

- [ ] T041 [US6] Implement rendering in `src/server/media/export-mp3.ts` for `ExportArtifact.state`, `ExportArtifact.progress`, and `ExportArtifact.durationMs` as defined in `data-model.md`
- [ ] T042 [US6] Add export routes in `src/app/api/revisions/[revisionId]/exports/route.ts` and `src/app/api/exports/[exportId]/route.ts`
- [ ] T043 [US6] Process export jobs from `src/worker/index.ts`

---

## Phase 9: User Story 11 - Download YouTube audio and edit it (Priority: P1)

**Goal**: Valid URLs normalize. Metadata is not success. Import downloads the audio, builds a waveform, and opens the editor.

**Independent Test**: Reject a malformed URL. A YouTube id downloads into ready audio. A failed download ends `FAILED` with no asset.

### Tests for User Story 11

- [ ] T044 [P] [US11] Write failing URL and acquisition tests in `tests/unit/youtube-import.test.ts`

### Implementation for User Story 11

- [ ] T045 [US11] Implement URL parsing in `src/server/youtube/url.ts` for `YouTubeImportJob.videoId` and `YouTubeImportJob.originalUrl` as defined in `data-model.md`
- [ ] T046 [US11] Implement the YouTube download and fixture adapters in `src/server/youtube/acquisition.ts` for `YouTubeImportJob.acquisitionState` from `data-model.md` and `contracts/media-acquisition.md`
- [ ] T047 [US11] Implement metadata lookup in `src/server/youtube/metadata.ts`
- [ ] T048 [US11] Add import routes in `src/app/api/youtube/metadata/route.ts` and `src/app/api/youtube/imports/route.ts`
- [ ] T049 [US11] Show import status on `src/app/tai-len/page.tsx`
- [ ] T049a [P] [US11] Write failing tests for yt-dlp arguments, error mapping, and a download import that becomes ready audio in `tests/unit/youtube-import.test.ts` and `tests/integration/youtube-download.test.ts`
- [ ] T049b [US11] Implement the yt-dlp adapter in `src/server/youtube/acquisition.ts` and the download job in `src/server/youtube/imports.ts`
- [ ] T049c [US11] Add the download action and progress to `src/components/youtube-import-card.tsx` and `src/app/tai-len/page.tsx`, opening `/bien-tap/{assetId}` when ready

---

## Phase 10: User Story 7 - Organize playlists (Priority: P2)

**Goal**: Playlist items are independent. Order persists. Stale versions conflict. Item removal does not delete audio.

**Independent Test**: Two items share a source and keep different revision ids. An older version receives 409.

### Tests for User Story 7

- [ ] T050 [P] [US7] Write failing playlist version tests in `tests/unit/playlist-version.test.ts`

### Implementation for User Story 7

- [ ] T051 [US7] Implement playlists in `src/server/playlists.ts` for `Playlist.name`, `Playlist.version`, `PlaylistItem.position`, and `PlaylistItem.note` as defined in `data-model.md`
- [ ] T052 [US7] Add playlist routes in `src/app/api/playlists/route.ts` and `src/app/api/playlists/[playlistId]/route.ts`
- [ ] T053 [US7] Add pages `src/app/danh-sach-phat/page.tsx` and `src/app/danh-sach-phat/[playlistId]/page.tsx`

---

## Phase 11: User Story 8 - Build a wedding plan and cues (Priority: P2)

**Goal**: Empty and suggested plans, stage order, cue snapshots, and no shared mutable state after duplicate.

**Independent Test**: Snapshot a playlist, change the playlist, and prove the stage cue revision ids stay the same.

### Tests for User Story 8

- [ ] T054 [P] [US8] Write failing plan snapshot tests in `tests/unit/plan-snapshot.test.ts`

### Implementation for User Story 8

- [ ] T055 [US8] Implement plans in `src/server/plans.ts` for `WeddingPlan.timeZone`, `WeddingPlan.state`, `WeddingStage.status`, `WeddingStage.position`, `MusicCue.revisionId`, and `MusicCue.instruction` as defined in `data-model.md`
- [ ] T056 [US8] Add plan routes under `src/app/api/plans/`
- [ ] T057 [US8] Add `src/app/ke-hoach/page.tsx` and `src/app/ke-hoach/[planId]/page.tsx`

---

## Phase 12: User Story 9 - Review readiness and export the handoff (Priority: P2)

**Goal**: Named readiness failures, separate listening approval, and a ZIP with real MP3, PDF, and CSV from one snapshot.

**Independent Test**: A required stage with no cue cannot become ready. A completed package is marked outdated after the plan version changes.

### Tests for User Story 9

- [ ] T058 [P] [US9] Write failing readiness tests in `tests/unit/readiness.test.ts`
- [ ] T059 [P] [US9] Write failing package content tests in `tests/unit/handoff-package.test.ts`

### Implementation for User Story 9

- [ ] T060 [US9] Implement readiness in `src/server/readiness.ts` for `WeddingPlan.listeningApprovedAt` and `MusicCue.listeningApprovedAt` from `data-model.md`
- [ ] T061 [US9] Implement PDF, CSV, and ZIP output in `src/server/handoff.ts` for `HandoffPackage.planVersion` and `HandoffPackage.isOutdated` from `data-model.md`
- [ ] T062 [US9] Add readiness and handoff routes under `src/app/api/plans/[planId]/`
- [ ] T063 [US9] Add `src/app/ke-hoach/[planId]/san-sang/page.tsx` and `src/app/ke-hoach/[planId]/ban-giao/page.tsx`

---

## Phase 13: User Story 10 - Administer the public catalog (Priority: P2)

**Goal**: Administrators publish catalog entries. Other roles are denied. Replacing media creates a new asset version.

**Independent Test**: A normal user receives 403 on publish. Unpublishing removes the track from guest search.

### Tests for User Story 10

- [ ] T064 [P] [US10] Write failing administrator authorization tests in `tests/unit/admin-auth.test.ts`

### Implementation for User Story 10

- [ ] T065 [US10] Implement catalog administration in `src/server/admin-catalog.ts` for `CatalogTrack.publishState`, `CatalogTrack.version`, `AudioAsset.sourceVersion`, and `AdministrativeAuditLog.summary` as defined in `data-model.md`
- [ ] T066 [US10] Add admin routes under `src/app/api/admin/`
- [ ] T067 [US10] Add `src/app/quan-tri/page.tsx` and `src/app/quan-tri/danh-muc/page.tsx`

---

## Phase 14: User Story 12 - Storage, deletion, and the full site (Priority: P3)

**Goal**: Quota enforcement, dependency-safe deletion, and the remaining pages and states.

**Independent Test**: A source referenced by a cue returns `ASSET_IN_USE`. An upload over the remaining quota is rejected.

### Tests for User Story 12

- [ ] T068 [P] [US12] Write failing quota and deletion tests in `tests/unit/storage-quota.test.ts`

### Implementation for User Story 12

- [ ] T069 [US12] Enforce `User.storageUsedBytes` and `User.storageQuotaBytes` from `data-model.md` in `src/server/library.ts`
- [ ] T070 [US12] Add the landing page and dashboard in `src/app/page.tsx` and `src/app/bang-dieu-khien/page.tsx`
- [ ] T071 [US12] Add the library page in `src/app/thu-vien/page.tsx`

---

## Phase 15: Polish and verification

**Purpose**: Cross-story checks, browser status, and the progress record.

- [ ] T072 Add the implementation progress record in `docs/implementation-progress.md`
- [ ] T073 Run the unit suite and record browser availability for `tests/e2e/`
- [ ] T074 Review authorization, immutable revisions, and YouTube download handling against `specs/001-wedding-music-planner/spec.md`

---

## Phase R: Functional audit repairs

**Purpose**: Repair confirmed defects from `docs/audits/functional-audit.md` without changing approved requirements. Progress and evidence: `docs/audits/repair-progress.md`. Each task starts with a failing regression test where practical.

- [x] R001 Track `src/server/storage/quota.ts` by narrowing `.gitignore` to `/storage/` (Q0)
- [x] R002 [P] Safe sign-in return path, `Secure` cookies in production, clear OAuth cookies (A1, A6, A7, A8) in `src/app/api/auth/google/**`, `src/server/auth/redirect.ts`
- [x] R003 [P] Gate `fixture:` imports to test mode, read-only fixtures, strict video id, idempotency key reuse 409 (Y1, Y3, Y4) in `src/server/youtube/**`
- [x] R004 Keep the archive flag and description on playlist rename, reject duplicate reorder ids, keep omitted plan fields on PATCH and invalidate READY (P-ARCH, P-DESC, P-REORDER, PL-PATCH) in `src/server/playlists.ts`, `src/server/plans.ts`
- [x] R005 Export and download from the editor and library, revision history in the library, export cancel guard, stale job recovery, retry route (X1, X2, X3, X5, L2, V1, E1) in `src/server/media/assets.ts`, `src/components/waveform-editor.tsx`, `src/app/thu-vien/page.tsx`
- [x] R006 Per-cue listening approval and cue add from a revision picker, missing-export readiness check, approval reset on revision replace, confirm row guard (R1, R2, R3, PL-REPLACE, R5) in `src/server/readiness.ts`, `src/server/plans.ts`, `src/app/ke-hoach/[planId]/**`
- [x] R007 Reachable handoff with package history, plan version, date, notes and responsible person in PDF and CSV, CSV formula escaping (H0, H1, H3, H5, PL-DATE) in `src/server/handoff.ts`, `src/app/ke-hoach/[planId]/ban-giao/page.tsx`
- [x] R008 Storage accounting for exports and packages, account deletion in one transaction with file removal, audit FK `ON DELETE SET NULL` SQL changeset, role refresh on sign-in (S1, S2, S6, A2, A3, A4) in `src/server/auth.ts`, `src/server/media/assets.ts`, `db/changelog/changelog.sql`
- [x] R009 Stage and cue reorder, duplicate, remove; stage time and duration fields; refresh scoped to one playlist (PL-MISSING, PL-STAGE, PL-REFRESH) in `src/server/plans.ts`, `src/app/api/plans/[planId]/route.ts`
- [x] R010 Review follow-ups: transactional child edits for plans and playlists, archived plans read-only until reopened, plan PATCH date and name validation, `readCookie` guard, editor loop uses the latest draft
- [x] R011 Export queue per FR-045 (one active, five queued per user), quota on queue and completion, cancel stops ffmpeg (X4) in `src/server/media/assets.ts`, `src/server/media/export-mp3.ts`, `src/worker/claim.ts`, `db/changelog/changelog.sql`
- [x] R012 Handoff snapshot transaction and package quota charge, atomic asset quota charge, non-UUID path ids answer 404, admin list re-checked per request, cue row resets after reload in `src/server/handoff.ts`, `src/server/plans.ts`, `src/server/media/assets.ts`, `src/server/http.ts`, `src/server/auth.ts`
- [x] R013 Contract routes for plan duplicate, archive, reopen and every stage and cue operation, sharing one schema module with the action POST in `src/app/api/plans/[planId]/**`, `src/server/plans/schemas.ts`, `src/server/plans/route.ts`
- [x] R014 Time zone validation, export cancel across processes and in the claim window, worker stale recovery with a 3-minute lease, quota reservation for queued exports in `src/server/media/assets.ts`, `src/worker/claim.ts`, `src/server/plans/schemas.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup has no dependencies.
- Foundational work blocks every user story.
- P1 stories after the foundation: US1, US2, US3, US4, US5, US6, US11.
- US3 depends on catalog rows from US2.
- US5 depends on a ready asset from US4.
- US6 depends on a revision from US5.
- US11 uses the same probe, waveform, and export path as US4–US6.
- US7 depends on revisions from US5.
- US8 depends on playlists from US7.
- US9 depends on plans from US8 and exports from US6.
- US10 depends on catalog storage from US2.
- US12 depends on assets and cues.

### User Story Dependencies

- US1 can be tested with the session API and no media.
- US2 can be tested with seeded catalog rows and no sign-in.
- US4 can be tested with a generated file and a test session.
- US11's download path is tested with a fake downloader, without a YouTube network call. It needs US4 processing.

### Parallel Opportunities

- T002, T003, and T004 touch different files.
- Test files T014, T015, T021, T025, T029, T034, T035, T040, T044, T050, T054, T058, T059, T064, and T068 are different files and can be written in parallel before their implementations.
- Do not edit `src/server/catalog.ts`, `src/server/library.ts`, or `src/app/tai-len/page.tsx` from two tasks at once.

### Parallel Example: User Story 1

```bash
# Tests first, different files:
tests/unit/auth-identity.test.ts
tests/unit/account-deletion.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Finish Setup and Foundational.
2. Finish User Story 1.
3. Stop and run the identity tests before starting media.

### Incremental Delivery

Ship P1 stories in order, then playlists, plans, handoff, administration, and quota. Do not mark a story complete while its test is failing or its browser check is blocked.

### Parallel Team Strategy

After the foundation, one writer owns `src/server/library.ts` and the editor, and another owns catalog pages. They must not edit the same file.

---

## Notes

- Tests are required by the constitution, not optional for this feature.
- YouTube audio is downloaded with yt-dlp. Pass only a normalized video id.
- Suggested MVP for a checkpoint is User Story 1 plus the foundation. The release is still the full task list.
