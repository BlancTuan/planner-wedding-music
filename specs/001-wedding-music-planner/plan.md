# Implementation Plan: Wedding Music Planner

**Branch**: `001-wedding-music-planner` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-wedding-music-planner/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Wedding Music Planner is a Vietnamese website for discovering published ceremony music, signing in with Google, uploading or importing permitted audio, editing immutable revisions, exporting real MP3 files, and handing off a wedding plan. The application is a Next.js and TypeScript codebase with PostgreSQL, SQL changesets, a database-backed worker, and FFmpeg. YouTube metadata is separate from media acquisition. The acquisition adapter downloads YouTube audio with yt-dlp and FFmpeg into private storage.

## Technical Context

**Language/Version**: TypeScript 5 on Node.js 22

**Primary Dependencies**: Next.js App Router, React, Tailwind CSS, `jose` for Google ID tokens, Zod, `pg`, PDFKit, a streaming ZIP library, Liquibase formatted SQL changesets

**Storage**: PostgreSQL 16 on port 5433 and private files under `storage/`

**Testing**: Vitest for unit and integration tests. Playwright when a browser process launches. Media fixtures are generated tones.

**Target Platform**: Ubuntu Linux server process and modern desktop, tablet, and mobile browsers

**Project Type**: Web application, single Next.js project

**Performance Goals**: Catalog search or an empty state within 2 seconds for 50 published rows. A 3-minute local upload becomes ready or fails within 1 minute. Export duration matches the revision within 200 milliseconds.

**Constraints**: Server-side ownership on every private read. No public media URLs. YouTube downloads pass only a normalized video id to yt-dlp. Upload limit 100 MiB. Source limit 10 minutes. Quota 1 GiB. One active export and five queued exports per user. Vietnamese interface copy.

**Scale/Scope**: One wedding-planning product, 19 routes, the entities in `data-model.md`, and the acceptance scenarios in the specification. Initial deployment is local.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Result |
| --- | --- |
| I. Specification before implementation | Pass. This plan implements only `spec.md`. |
| II. Honest product states | Pass. Job states are persisted. YouTube metadata cannot mark an asset ready. Only a downloaded, probed audio file with a real waveform becomes ready. |
| III. Server-side ownership | Pass. Session user id is resolved on the server. Private downloads check ownership. Administrators do not receive a private-library query. |
| IV. Immutable media | Pass. Revisions are insert-only. Playlist snapshots copy revision ids. Handoff packages store a plan version. |
| V. Verified completion | Pass. Story tasks include failing tests first. A browser that does not launch stays blocked. |

Post-design re-check: the contracts and data model keep acquisition, metadata, and export as separate records. No gate exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/001-wedding-music-planner/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   └── media-acquisition.md
└── tasks.md
```

### Source Code (repository root)

```text
src/app/                      # Vietnamese pages and route handlers
src/server/                   # auth, catalog, library, youtube, plans, media
src/components/               # shared interface
src/worker/                   # job worker
db/changelog/                 # Liquibase SQL changesets
tests/unit/
tests/integration/
tests/fixtures/media/
storage/                      # gitignored runtime files
```

**Structure Decision**: One Next.js project. Route handlers stay thin. Domain SQL and media processing live under `src/server` and `src/worker`. There is no separate frontend package.

## Complexity Tracking

No constitution violations require an exception.

## Phase 0 and Phase 1 outputs

- `research.md` records the stack, the YouTube download decision, and the test-mode sign-in boundary.
- `data-model.md` records entities, constraints, and state rules.
- `contracts/http-api.md` and `contracts/media-acquisition.md` are the interface contracts.
- `quickstart.md` is the local validation guide.

## Agent ownership during implementation

- Planner owns these Spec Kit files.
- UI designer owns `src/components` visual changes and `src/app` presentation markup after the behavior contract is fixed.
- Fullstack implementation owns `src/server`, `src/app/api`, `src/worker`, `db/changelog`, and tests for assigned tasks.
- QA runs the tests and does not treat a screenshot as a pass.
- Reviewer reads the diff and does not edit it.
