# Wedding Music Planner

A Vietnamese website for planning ceremony music. Guests browse a published catalog. Signed-in users keep a private library, cut audio into immutable revisions, export real MP3 files, arrange playlists and wedding plans, and download a handoff package for the person who plays the music.

The interface copy is Vietnamese. Requirements live in `specs/001-wedding-music-planner/`.

## What this project includes

- **Catalog.** Search and filter published tracks by ceremony stage, mood, style, language, and vocal or instrumental. Matching ignores Vietnamese accents.
- **Accounts.** Google sign-in in production. A local test session on the sign-in page when `AUTH_TEST_MODE=true` and `NODE_ENV` is not `production`.
- **Private audio.** Upload MP3 or WAV, preview, trim on a waveform, set fade and gain, and keep every saved revision. The source file stays unchanged.
- **Export.** A background worker renders a revision to MP3 with FFmpeg.
- **Plans.** Playlists, a suggested Vietnamese ceremony structure, stage cues, a readiness check, and a ZIP handoff that contains the MP3 files, a PDF, and a CSV.
- **Administration.** Catalog management for Google subjects listed in `ADMIN_GOOGLE_SUBS`. The default test subject is `test-admin`.
- **YouTube.** Public metadata can be read when `YOUTUBE_API_KEY` is set. Downloading YouTube media stays blocked. No ready asset is created from a YouTube URL.

The app is one Next.js 15 project (App Router, React 19, TypeScript, Tailwind CSS) with PostgreSQL 16 and files on disk.

| Path | Role |
| --- | --- |
| `src/app/` | Pages and HTTP route handlers |
| `src/server/` | Auth, catalog, library, plans, media |
| `src/worker/` | Upload processing and MP3 export |
| `db/changelog/changelog.sql` | SQL changesets, including the catalog seed |
| `storage/` | Private uploads and exports (created at runtime, not committed) |

Main pages: `/` landing, `/kham-pha` catalog, `/bai-hat/[id]` track, `/dang-nhap` sign-in, `/thu-vien` library, `/tai-len` upload, `/bien-tap/[id]` editor, `/danh-sach-phat` playlists, `/ke-hoach` plans, `/quan-tri` admin.

## Prerequisites

- Node.js 22 and npm
- Docker, for the database in `docker-compose.yml`
- FFmpeg and FFprobe on `PATH`

## Configure

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL. Local default is `postgres://wedding:wedding@127.0.0.1:5433/wedding_music`. |
| `AUTH_TEST_MODE` | `true` shows the local test sign-in form. Ignored when `NODE_ENV=production`. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth client. Required for real sign-in. |
| `AUTH_GOOGLE_REDIRECT_URI` | Callback. Local default is `http://127.0.0.1:3000/api/auth/google/callback`. |
| `ADMIN_GOOGLE_SUBS` | Comma-separated Google subjects that receive the admin role. |
| `YOUTUBE_API_KEY` | Optional. Enables public metadata lookup only. |
| `STORAGE_ROOT` | Directory for private media. Default `storage`. |
| `APP_ORIGIN` | Public origin of the site. Local default `http://127.0.0.1:3000`. |

## Start for development

From the repository root:

```bash
docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

In a second terminal, start the worker. Uploads and MP3 exports stay queued until it is running.

```bash
npm run worker
```

Open `http://127.0.0.1:3000`. The database listens on `127.0.0.1:5433`. `GET /api/health` returns `{ "ok": true }` when the app can reach PostgreSQL.

`npm run db:migrate` applies each unused changeset in `db/changelog/changelog.sql` and records it in `databasechangelog`. The catalog seed is changeset `wedding:002-catalog-seed`.

## Build

```bash
npm run typecheck
npm test
npm run build
```

`npm test` runs Vitest. `npm run test:e2e` runs Playwright and needs a browser runtime this host can launch.

## Deploy and start

There is no application image in this repository. `docker-compose.yml` runs PostgreSQL only. A host deploy is:

1. Provide PostgreSQL 16 and set `DATABASE_URL`. The compose file publishes Postgres on `127.0.0.1:5433` with user `wedding`, password `wedding`, and database `wedding_music`.
2. Install Node.js 22, FFmpeg, and FFprobe on the app host.
3. Copy `.env.example` to `.env` and set production values. Set `AUTH_TEST_MODE` to anything other than a value you rely on: test sessions are disabled when `NODE_ENV=production`. Set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GOOGLE_REDIRECT_URI`, `APP_ORIGIN`, and `ADMIN_GOOGLE_SUBS`. Point `STORAGE_ROOT` at a persistent directory.
4. Install dependencies, apply the schema, and build:

```bash
npm install
npm run db:migrate
npm run build
```

`tsx` (used by `npm run worker`) is a dev dependency, so do not omit dev dependencies on the host that runs the worker.

5. Start the site and the worker as two processes:

```bash
npm start
npm run worker
```

`npm start` serves the production build on `http://127.0.0.1:3000`. Put a reverse proxy in front of that port and set `APP_ORIGIN` to the public URL. Register the same origin in the Google redirect URI.

Keep `storage/` (or the configured `STORAGE_ROOT`) and the Postgres volume across restarts. Private audio and export files are not in the database.
