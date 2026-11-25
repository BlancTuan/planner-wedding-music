# Research: Wedding Music Planner

## Decision: Next.js and TypeScript application

**Decision**: Use Next.js (App Router) and TypeScript for the website and trusted HTTP API in one application.

**Rationale**: The product needs server-rendered Vietnamese pages, authenticated mutations, file downloads, and a private API. One application keeps authorization next to the pages and avoids a second deployable for a single-team product.

**Alternatives considered**: A separate React client plus a standalone API adds a second contract surface and a second process without a current scaling need. A Python API plus a static site splits the team’s workflow away from the selected fullstack-web profile.

## Decision: Enable the React profile flag

**Decision**: Set `.cursor/project-profile.json` `react` to true through `scripts/bootstrap.sh --profile fullstack-web --react` before React implementation.

**Rationale**: The selected stack is React. The project rule applies Vercel React guidance only when that flag is true.

**Alternatives considered**: Leaving `react` false would hide the required React performance skill after Next.js is chosen.

## Decision: PostgreSQL with SQL changesets

**Decision**: Use PostgreSQL 16 in a project-specific Docker Compose service on port 5433. Schema changes are Liquibase formatted SQL changesets in `db/changelog/`. Application queries use the `pg` driver and explicit SQL.

**Rationale**: Relational constraints are required for ownership, uniqueness of a Google subject, playlist order, and optimistic versions. SQL changesets match the repository migration rule. Port 5433 avoids the PostgreSQL instance already used by other local projects. Explicit SQL keeps one schema source.

**Alternatives considered**: SQLite cannot enforce the same concurrent job-locking pattern as cleanly for a worker. An ORM-owned migration history would duplicate or replace the SQL changeset rule. Reusing the existing shared database risks other projects’ data.

## Decision: Database-backed sessions and Google sign-in

**Decision**: Verify the Google ID token with `jose` against Google's JWKS, checking issuer, audience, signature, and expiration. Then issue a hashed database session. Link accounts by `provider + subject`. Grant administrator only when the Google subject is present in the server allowlist `ADMIN_GOOGLE_SUBS`.

**Rationale**: Logout must invalidate the session. Email is not a stable identity. Administrator access must not be self-serve. Owning the session table avoids a second user model.

**Alternatives considered**: Auth.js was the first candidate and was rejected because its default adapter duplicates `User` and `UserSession`. A long-lived browser token cannot be revoked reliably. Email-only linking merges distinct Google identities.

## Decision: Test sign-in is not a production identity

**Decision**: Automated tests may create a session only when `AUTH_TEST_MODE=true` and the process is not production. Production sign-in remains Google token verification. Live Google sign-in stays blocked until `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are provided.

**Rationale**: The environment has no Google client credentials. A hidden password login would violate the specification. Tests still need two distinct subjects so ownership can be proven.

**Alternatives considered**: Skipping authentication tests until a human completes Google consent leaves the ownership rules unverified.

## Decision: Private local storage behind an authorized download route

**Decision**: Store bytes under `storage/` through a storage port. Keys are opaque. Downloads require a session and an ownership check. `storage/` is gitignored.

**Rationale**: The specification forbids public URLs for private media. Local disk matches Ubuntu development. The port can later point at a private object store without changing revision records.

**Alternatives considered**: Writing into the user’s Downloads folder does not create server-side processing storage. Committing media fixtures that are generated in tests is unnecessary; committed fixtures are tiny generated tones, not wedding songs.

## Decision: Postgres job worker

**Decision**: Persist upload, import, and export jobs in PostgreSQL. A worker process claims rows with `FOR UPDATE SKIP LOCKED`, limits one active export per user, and caps queued exports at five.

**Rationale**: Accepted jobs must survive a closed browser and a process restart. Adding Redis repeats a queue that PostgreSQL can already lock.

**Alternatives considered**: In-memory queues disappear on restart. A second Redis dependency is already running for other projects but is not required here.

## Decision: FFmpeg and FFprobe for real audio

**Decision**: Use the installed FFmpeg 4.2.7 and FFprobe. Validate uploads by probing the codec, not the extension. Build waveform peaks by streaming mono PCM and bucketing peaks. Export MP3 with libmp3lame at 44.1 kHz and 192 kbps, then probe the output.

**Rationale**: libmp3lame is present, so MP3 export is real. Streaming peaks avoids loading a full decoded buffer for a 10-minute file.

**Alternatives considered**: Renaming WAV to `.mp3` fails the real-MP3 requirement. A synthetic waveform fails the honest-state principle.

## Decision: YouTube audio download with yt-dlp

**Decision**: Parse only YouTube video ids from known URL shapes. Fetch public metadata from YouTube oEmbed, plus Data API `videos.list` when `YOUTUBE_API_KEY` is set. The acquisition adapter runs `yt-dlp` (path from `YTDLP_PATH`, default `yt-dlp`) with `execFile`, never a shell. It passes only the canonical `https://www.youtube.com/watch?v=<id>` URL after `--`, with `--no-playlist`, a `!is_live & duration <= 600` match filter, a 100 MiB size cap, and a 5-minute timeout. yt-dlp extracts the best audio and converts it to MP3 with FFmpeg into a per-job temporary directory. The existing probe, waveform, and asset registration then run unchanged. The fixture adapter stays for tests.

**Rationale**: yt-dlp is the maintained tool for this job and already uses the installed FFmpeg. Passing a normalized id, not the user URL, keeps the downloader from fetching arbitrary addresses. MP3 at about 190 kbps keeps a 10-minute source near 14 MB, inside the upload limit.

**Alternatives considered**: Direct stream URL extraction in Node breaks whenever YouTube changes its player. Keeping the download blocked was the previous decision and was reversed by constitution 2.0.0.

## Decision: Vietnamese search

**Decision**: Enable PostgreSQL `unaccent` and a SQL function that also maps `đ/Đ` to `d` before comparison. Catalog and library search use that function on title, artist, and keyword fields.

**Rationale**: Accent-insensitive Vietnamese search is a product requirement. Default `unaccent` does not treat `đ` as `d`.

**Alternatives considered**: Application-side folding loads the whole catalog into memory and skips the database index.

## Decision: Optimistic concurrency and idempotency keys

**Decision**: Mutable aggregates carry an integer `version`. Updates succeed only when the submitted version matches. Clients send `Idempotency-Key` for upload creation, import creation, revision save, and export creation. The unique key is `(user_id, idempotency_key)` plus a request hash.

**Rationale**: Two tabs must not silently overwrite each other. Retries after a timeout must not create a second ready asset or export.

**Alternatives considered**: Last-write-wins fails the conflict scenario. Server-generated idempotency keys change on every retry and therefore do not deduplicate.

## Decision: Documents and packages

**Decision**: Generate CSV as UTF-8 text and PDF with PDFKit. Build the ZIP with a streaming archiver after every required MP3 has been verified. Store the package as a snapshot bound to the plan version.

**Rationale**: The handoff must contain real files and stay stable if the plan changes later.

**Alternatives considered**: HTML printed by the browser is not a stored package. Building the ZIP from live plan rows can mix versions during an edit.

## Decision: Visual system

**Decision**: Use Tailwind CSS and a small local component set. Typography is Be Vietnam Pro for text and a serif display face for headings. Colors are warm ivory, ink, and a restrained wine accent. The taste skill governs the pages when they are built.

**Rationale**: Be Vietnam Pro covers Vietnamese diacritics. A local component set avoids a large unused component kit while staying consistent.

**Alternatives considered**: A generic dashboard kit fights the romantic, editorial direction. Loading a full component registry before the pages exist adds unused code.

## Decision: Tests

**Decision**: Vitest for unit and integration tests. Playwright is used only if a browser process actually launches. Generated WAV and MP3 tones are the media fixtures. Browser failure is recorded as blocked.

**Rationale**: The constitution rejects screenshot-only proof and rejects copyrighted YouTube fixtures.

**Alternatives considered**: Manual clicking as the only test leaves regressions unproven. Depending on a live YouTube video makes the suite non-deterministic and rights-unsafe.
