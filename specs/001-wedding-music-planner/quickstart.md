# Quickstart Validation

## Prerequisites

- Node.js 22
- Docker, for the project database on port 5433
- FFmpeg and FFprobe on `PATH`
- Liquibase on `PATH`
- A `.env` copied from `.env.example`

Google client credentials are optional. Without them, interactive Google sign-in is blocked and test mode covers automated sign-in. YouTube acquisition remains blocked even when a Data API key is present.

## Setup

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

In another terminal:

```bash
npm run worker
```

## Checks

1. Open the landing page and confirm the visible copy is Vietnamese.
2. `npm test` creates two test users, proves a private playlist is isolated, rejects a bad upload, trims a generated tone, and exports an MP3 that FFprobe reports as `mp3`.
3. Submit `https://www.youtube.com/watch?v=dQw4w9WgXcQ` only if a network metadata call is acceptable. The page may show public metadata. Confirm import ends blocked and creates no ready asset. Prefer the fixture id `fixture:tone` for the successful import path.
4. Build a two-stage plan, leave one required stage empty, and confirm readiness names that stage.
5. Complete a one-cue plan, download the ZIP, and confirm it contains an MP3, a PDF, and a CSV.
6. Browser execution: `npm run test:e2e` when Chrome launches. If the runtime reports an unsupported browser, record the check as blocked.

## Expected local URLs

- Site: `http://127.0.0.1:3000`
- Database: `127.0.0.1:5433`, database `wedding_music`
