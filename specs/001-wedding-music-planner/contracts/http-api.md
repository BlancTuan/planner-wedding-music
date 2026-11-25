# HTTP API Contract

Base path: `/api`. Response JSON uses camelCase. Enum values are uppercase snake case. Error body:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu không hợp lệ",
    "details": {}
  }
}
```

| Status | Meaning |
| --- | --- |
| 400 | Malformed request |
| 401 | No active session |
| 403 | Session exists, role or ownership forbids the action |
| 404 | Missing resource, including another user's private id |
| 409 | Version conflict or idempotency key reused with a different payload |
| 413 | File or quota exceeded |
| 422 | Semantically invalid values |
| 429 | Rate limit |

Mutations that create uploads, imports, revisions, or exports require header `Idempotency-Key`. Updates that change a versioned aggregate require `version` and return the new version.

Private routes resolve the user from the server session. A body field named `userId` is ignored.

## Session

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/session` | Optional | `{ user: null }` or the profile summary |
| POST | `/api/session/test` | Test mode only | Creates a session for a named test subject. Disabled in production. |
| POST | `/api/session/logout` | User | Revokes the current session |
| DELETE | `/api/account` | User | Confirmed account deletion. Body `{ confirm: true, version }` |

Google sign-in starts at `/api/auth/google` and returns through `/api/auth/google/callback`. After success the browser goes to the safe internal path stored before sign-in, or to the dashboard.

## Catalog

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/catalog/tracks` | Guest | Paginated published tracks. Query: `q`, `stage`, `mood`, `style`, `language`, `vocalType`, `sortBy`, `page`, `pageSize` |
| GET | `/api/catalog/tracks/{trackId}` | Guest | Published detail, or 404 |
| GET | `/api/catalog/tracks/{trackId}/preview` | Guest | Audio bytes only when permission is `PREVIEW_ALLOWED` and the asset is ready |
| GET | `/api/catalog/categories` | Guest | Active categories |

`pageSize` maximum is 50. `sortBy` is `title`, `artist`, or `recent`.

## Library and upload

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/library` | User | Own assets, revisions, and exports. Query: `q`, `sourceType`, `status` |
| GET | `/api/library/usage` | User | `{ storageUsedBytes, storageQuotaBytes }` |
| POST | `/api/uploads` | User | Multipart file. Creates an upload job. |
| POST | `/api/uploads/{jobId}/cancel` | Owner | Cancels an unfinished job |
| POST | `/api/uploads/{jobId}/retry` | Owner | Retries a failed job with the same stored intent |
| GET | `/api/assets/{assetId}` | Owner or public catalog preview rules | Asset metadata |
| GET | `/api/assets/{assetId}/waveform` | Owner, or guest if published preview | Peak JSON |
| GET | `/api/assets/{assetId}/audio` | Owner, or guest if published preview | Source bytes |
| DELETE | `/api/assets/{assetId}` | Owner | Deletes only when no plan cue references a revision of the asset. Otherwise 409 `ASSET_IN_USE` with the plan names. |

## Revisions and exports

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/assets/{assetId}/revisions` | Owner | Immutable history |
| POST | `/api/assets/{assetId}/revisions` | Owner | Creates a revision. Does not update an existing row. |
| GET | `/api/revisions/{revisionId}` | Owner | One revision |
| POST | `/api/revisions/{revisionId}/exports` | Owner | Queues an export |
| GET | `/api/exports/{exportId}` | Owner | Job status |
| POST | `/api/exports/{exportId}/cancel` | Owner | Cancels unfinished work |
| POST | `/api/exports/{exportId}/retry` | Owner | New attempt only when failed, using a new key or the same key if the payload matches |
| GET | `/api/exports/{exportId}/file` | Owner | MP3 bytes when completed |

Revision body: `trimStartMs`, `trimEndMs`, `fadeInMs`, `fadeOutMs`, `gainDb`.

## YouTube

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| POST | `/api/youtube/metadata` | User | Body `{ url }`. Returns normalized video info and `acquisitionState`. Does not create a ready asset. |
| POST | `/api/youtube/imports` | User | Creates an import job for a normalized video id or a `fixture:` test id. |
| GET | `/api/youtube/imports/{jobId}` | Owner | Job status |
| POST | `/api/youtube/imports/{jobId}/cancel` | Owner | Cancel |
| POST | `/api/youtube/imports/{jobId}/retry` | Owner | Safe retry |

A YouTube host with no permitted adapter finishes as `acquisitionState: BLOCKED` and `state: FAILED` or stays `AWAITING_IMPORT` only until the user confirms import; after confirmation the terminal state is `FAILED` with `errorCode: NO_PERMITTED_ACQUISITION_METHOD`. Metadata fields may still be present. `assetId` is null.

## Playlists

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/playlists` | User | Own playlists |
| POST | `/api/playlists` | User | Create |
| GET | `/api/playlists/{playlistId}` | Owner | Playlist and items |
| PATCH | `/api/playlists/{playlistId}` | Owner | Name, description, archive flag, `version` |
| POST | `/api/playlists/{playlistId}/duplicate` | Owner | New playlist and new item ids |
| DELETE | `/api/playlists/{playlistId}` | Owner | Deletes items, not audio |
| POST | `/api/playlists/{playlistId}/items` | Owner | Body `{ revisionId, note, version }` |
| PATCH | `/api/playlists/{playlistId}/items/{itemId}` | Owner | Note or revision replacement, `version` |
| DELETE | `/api/playlists/{playlistId}/items/{itemId}` | Owner | Removes one item |
| PUT | `/api/playlists/{playlistId}/order` | Owner | Body `{ itemIds, version }` |

## Wedding plans

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/plans` | User | Own plans |
| POST | `/api/plans` | User | Body `{ name, template: "EMPTY" or "VIETNAMESE_SUGGESTED", timeZone }` |
| GET | `/api/plans/{planId}` | Owner | Plan, stages, cues |
| PATCH | `/api/plans/{planId}` | Owner | Profile fields and `version` |
| POST | `/api/plans/{planId}/duplicate` | Owner | Deep copy with new ids |
| POST | `/api/plans/{planId}/archive` | Owner | Sets `ARCHIVED` |
| POST | `/api/plans/{planId}/reopen` | Owner | Returns an archived plan to `DRAFT` |
| DELETE | `/api/plans/{planId}` | Owner | Body `{ confirm: true, version }` |
| POST | `/api/plans/{planId}/stages` | Owner | Add stage |
| PATCH | `/api/plans/{planId}/stages/{stageId}` | Owner | Edit stage, including status |
| PUT | `/api/plans/{planId}/stages/order` | Owner | Reorder |
| POST | `/api/plans/{planId}/stages/{stageId}/duplicate` | Owner | Copy stage and cues |
| DELETE | `/api/plans/{planId}/stages/{stageId}` | Owner | Remove stage |
| POST | `/api/plans/{planId}/stages/{stageId}/cues` | Owner | Add cue |
| POST | `/api/plans/{planId}/stages/{stageId}/cues/from-playlist` | Owner | Snapshot body `{ playlistId, version }` |
| POST | `/api/plans/{planId}/stages/{stageId}/cues/refresh-playlist` | Owner | Explicit replace body `{ playlistId, version }` |
| PATCH | `/api/plans/{planId}/cues/{cueId}` | Owner | Instruction, person, timing, revision replacement, listening approval |
| PUT | `/api/plans/{planId}/stages/{stageId}/cues/order` | Owner | Reorder |
| DELETE | `/api/plans/{planId}/cues/{cueId}` | Owner | Remove cue |
| GET | `/api/plans/{planId}/readiness` | Owner | `{ checks: [{ code, message, stageId, cueId }] }` |
| POST | `/api/plans/{planId}/readiness/confirm` | Owner | Sets `READY` only when checks are empty |
| POST | `/api/plans/{planId}/handoff` | Owner | Builds a package from the current ready snapshot |
| GET | `/api/plans/{planId}/handoff` | Owner | `{ items: [{ id, planVersion, state, isOutdated, byteSize, createdAt }] }`, newest first |
| GET | `/api/plans/{planId}/handoff/{packageId}` | Owner | Status, including `isOutdated` |
| GET | `/api/plans/{planId}/handoff/{packageId}/file` | Owner | ZIP bytes |

## Administration

All routes require `ADMIN`. They never list another user's private assets.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/admin/audit` | Recent audit rows |
| GET | `/api/admin/failures` | Failed catalog, upload, and import jobs without private file paths in the message |
| POST | `/api/admin/categories` | Create category |
| PATCH | `/api/admin/categories/{categoryId}` | Update category |
| POST | `/api/admin/artists` | Create artist |
| POST | `/api/admin/tags` | Create tag |
| POST | `/api/admin/tracks` | Create draft track |
| PATCH | `/api/admin/tracks/{trackId}` | Edit metadata, `version` |
| POST | `/api/admin/tracks/{trackId}/publish` | `PUBLISHED` |
| POST | `/api/admin/tracks/{trackId}/unpublish` | `UNPUBLISHED` |
| POST | `/api/admin/tracks/{trackId}/media` | Attach a new catalog asset version |

## Module boundaries

- `src/server/auth` owns session lookup and role checks.
- `src/server/catalog` owns public search.
- `src/server/library` owns assets, uploads, revisions, and exports.
- `src/server/youtube` owns URL parsing, metadata, and import jobs. It calls `MediaAcquisitionPort` and does not know how a future adapter downloads.
- `src/server/plans` owns playlists, plans, readiness, and handoff.
- `src/server/media` owns probe, waveform, and MP3 rendering.
- Route handlers validate input and map domain errors to the error body. They do not contain SQL.
