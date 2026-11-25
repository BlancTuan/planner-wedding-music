# Data Model: Wedding Music Planner

Identifiers are UUID strings. Timestamps are stored in UTC. Enum values are uppercase snake case. Mutable aggregates that can be edited from two sessions include `version`.

## User

| Field | Constraint |
| --- | --- |
| `User.id` | Required UUID primary key |
| `User.displayName` | Required, 1–120 characters |
| `User.email` | Optional display value, max 320 characters, not an identity key |
| `User.avatarUrl` | Optional URL text |
| `User.role` | Required, `USER` or `ADMIN` |
| `User.storageUsedBytes` | Required integer, minimum 0 |
| `User.storageQuotaBytes` | Required integer, default 1073741824 |
| `User.version` | Required integer, starts at 1 |
| `User.deletionRequestedAt` | Optional timestamp |
| `User.createdAt` | Required timestamp |
| `User.updatedAt` | Required timestamp |

A deleted user row is removed together with owned private rows. Administrator audit rows keep the actor id only while the user exists; the summary text must not include private media bytes.

## AuthIdentity

| Field | Constraint |
| --- | --- |
| `AuthIdentity.id` | Required UUID |
| `AuthIdentity.userId` | Required reference to `User.id` |
| `AuthIdentity.provider` | Required, initial value `google` |
| `AuthIdentity.subject` | Required, 1–255 characters |
| `AuthIdentity.createdAt` | Required timestamp |

Unique `(AuthIdentity.provider, AuthIdentity.subject)`. One identity maps to one user.

## UserSession

| Field | Constraint |
| --- | --- |
| `UserSession.id` | Required UUID |
| `UserSession.userId` | Required reference to `User.id` |
| `UserSession.tokenHash` | Required unique secret hash, raw token is not stored |
| `UserSession.expiresAt` | Required timestamp |
| `UserSession.revokedAt` | Optional timestamp |
| `UserSession.createdAt` | Required timestamp |

A session is active only when `revokedAt` is empty and `expiresAt` is in the future.

## MusicCategory

| Field | Constraint |
| --- | --- |
| `MusicCategory.id` | Required UUID |
| `MusicCategory.kind` | Required, `CEREMONY`, `MOOD`, `STYLE`, or `LANGUAGE` |
| `MusicCategory.nameVi` | Required, 1–120 characters |
| `MusicCategory.slug` | Required, 1–80 characters, unique within `kind` |
| `MusicCategory.sortOrder` | Required integer |
| `MusicCategory.isActive` | Required boolean |

## Artist

| Field | Constraint |
| --- | --- |
| `Artist.id` | Required UUID |
| `Artist.name` | Required, 1–200 characters, unique case-insensitively |
| `Artist.createdAt` | Required timestamp |

## Tag

| Field | Constraint |
| --- | --- |
| `Tag.id` | Required UUID |
| `Tag.name` | Required, 1–80 characters, unique case-insensitively |

## CatalogTrack

| Field | Constraint |
| --- | --- |
| `CatalogTrack.id` | Required UUID |
| `CatalogTrack.title` | Required, 1–300 characters |
| `CatalogTrack.artistId` | Required reference to `Artist.id` |
| `CatalogTrack.durationMs` | Optional integer, minimum 0 |
| `CatalogTrack.styleCategoryId` | Optional reference to a `STYLE` category |
| `CatalogTrack.moodCategoryId` | Optional reference to a `MOOD` category |
| `CatalogTrack.languageCategoryId` | Optional reference to a `LANGUAGE` category |
| `CatalogTrack.vocalType` | Required, `VOCAL`, `INSTRUMENTAL`, or `MIXED` |
| `CatalogTrack.sourceNote` | Optional text, max 2000 characters |
| `CatalogTrack.usagePermission` | Required, `PREVIEW_ALLOWED`, `METADATA_ONLY`, or `RESTRICTED` |
| `CatalogTrack.publishState` | Required, `DRAFT`, `PUBLISHED`, or `UNPUBLISHED` |
| `CatalogTrack.audioAssetId` | Optional reference to `AudioAsset.id` |
| `CatalogTrack.version` | Required integer, starts at 1 |
| `CatalogTrack.createdAt` | Required timestamp |
| `CatalogTrack.updatedAt` | Required timestamp |

Public search returns rows whose `publishState` is `PUBLISHED` and whose categories are active. `usagePermission` is independent from `AudioAsset.status`.

## CatalogTrackStage

| Field | Constraint |
| --- | --- |
| `CatalogTrackStage.trackId` | Required reference to `CatalogTrack.id` |
| `CatalogTrackStage.categoryId` | Required reference to a `CEREMONY` category |

Unique `(trackId, categoryId)`.

## CatalogTrackTag

| Field | Constraint |
| --- | --- |
| `CatalogTrackTag.trackId` | Required reference |
| `CatalogTrackTag.tagId` | Required reference |

Unique pair.

## AudioAsset

| Field | Constraint |
| --- | --- |
| `AudioAsset.id` | Required UUID |
| `AudioAsset.ownerUserId` | Optional reference to `User.id`; required unless `sourceType` is `CATALOG` |
| `AudioAsset.sourceType` | Required, `CATALOG`, `UPLOAD`, or `YOUTUBE` |
| `AudioAsset.status` | Required, `PENDING`, `PROCESSING`, `READY`, or `FAILED` |
| `AudioAsset.originalFilename` | Optional, max 255 characters |
| `AudioAsset.mediaFormat` | Optional, `MP3`, `WAV`, or `OTHER` |
| `AudioAsset.durationMs` | Optional integer, minimum 0, maximum 600000 when ready |
| `AudioAsset.sampleRate` | Optional integer |
| `AudioAsset.channels` | Optional integer, minimum 1 |
| `AudioAsset.byteSize` | Required integer, minimum 0, maximum 104857600 for uploads |
| `AudioAsset.storageKey` | Required opaque key |
| `AudioAsset.contentHash` | Optional hex digest |
| `AudioAsset.sourceVersion` | Required integer, starts at 1 |
| `AudioAsset.replacesAssetId` | Optional self-reference; replacement never updates the replaced row |
| `AudioAsset.youtubeVideoId` | Optional, 11-character video id when `sourceType` is `YOUTUBE` |
| `AudioAsset.createdAt` | Required timestamp |

Source bytes are insert-only. A ready asset is not updated in place to change its audio.

## Waveform

| Field | Constraint |
| --- | --- |
| `Waveform.assetId` | Required unique reference to `AudioAsset.id` |
| `Waveform.storageKey` | Required key of peak JSON generated from that asset |
| `Waveform.bucketCount` | Required integer, minimum 1 |
| `Waveform.createdAt` | Required timestamp |

## AudioRevision

| Field | Constraint |
| --- | --- |
| `AudioRevision.id` | Required UUID |
| `AudioRevision.assetId` | Required reference to a `READY` asset |
| `AudioRevision.ownerUserId` | Required reference to `User.id` |
| `AudioRevision.trimStartMs` | Required integer, minimum 0 |
| `AudioRevision.trimEndMs` | Required integer, greater than `trimStartMs` |
| `AudioRevision.fadeInMs` | Required integer, 0–10000 |
| `AudioRevision.fadeOutMs` | Required integer, 0–10000 |
| `AudioRevision.gainDb` | Required number, -24 through 6, default 0 |
| `AudioRevision.processingVersion` | Required integer |
| `AudioRevision.createdAt` | Required timestamp |

`trimEndMs - trimStartMs` is at least 1000. `fadeInMs + fadeOutMs` is at most the clip length. Rows are not updated after insert.

## UploadJob

| Field | Constraint |
| --- | --- |
| `UploadJob.id` | Required UUID |
| `UploadJob.ownerUserId` | Required reference |
| `UploadJob.assetId` | Optional reference until processing creates the asset |
| `UploadJob.state` | Required, `PENDING`, `PROCESSING`, `READY`, `FAILED`, or `CANCELLED` |
| `UploadJob.errorCode` | Optional stable code |
| `UploadJob.idempotencyKey` | Required, unique with `ownerUserId` |
| `UploadJob.createdAt` | Required timestamp |
| `UploadJob.updatedAt` | Required timestamp |

## YouTubeImportJob

| Field | Constraint |
| --- | --- |
| `YouTubeImportJob.id` | Required UUID |
| `YouTubeImportJob.ownerUserId` | Required reference |
| `YouTubeImportJob.videoId` | Required normalized id |
| `YouTubeImportJob.originalUrl` | Required original URL text, max 2000 characters |
| `YouTubeImportJob.state` | Required, `PENDING`, `FETCHING_METADATA`, `AWAITING_IMPORT`, `DOWNLOADING`, `EXTRACTING_AUDIO`, `GENERATING_WAVEFORM`, `READY_FOR_EDITING`, `FAILED`, or `CANCELLED` |
| `YouTubeImportJob.acquisitionState` | Required, `AVAILABLE`, `BLOCKED`, or `UNAVAILABLE` |
| `YouTubeImportJob.title` | Optional |
| `YouTubeImportJob.channelName` | Optional |
| `YouTubeImportJob.thumbnailUrl` | Optional |
| `YouTubeImportJob.durationMs` | Optional |
| `YouTubeImportJob.assetId` | Optional reference, set only when audio is actually stored |
| `YouTubeImportJob.errorCode` | Optional |
| `YouTubeImportJob.idempotencyKey` | Required, unique with `ownerUserId` |
| `YouTubeImportJob.createdAt` | Required timestamp |
| `YouTubeImportJob.updatedAt` | Required timestamp |

`READY_FOR_EDITING` is valid only when `assetId` points at a `READY` asset. `BLOCKED` and `UNAVAILABLE` never have a ready asset.

## ExportArtifact

| Field | Constraint |
| --- | --- |
| `ExportArtifact.id` | Required UUID |
| `ExportArtifact.revisionId` | Required reference |
| `ExportArtifact.ownerUserId` | Required reference, must equal the revision owner |
| `ExportArtifact.state` | Required, `QUEUED`, `PROCESSING`, `VERIFYING`, `COMPLETED`, `FAILED`, or `CANCELLED` |
| `ExportArtifact.progress` | Required integer, 0–100 |
| `ExportArtifact.errorCode` | Optional |
| `ExportArtifact.storageKey` | Optional, required when `COMPLETED` |
| `ExportArtifact.durationMs` | Optional, required when `COMPLETED` |
| `ExportArtifact.idempotencyKey` | Required, unique with `ownerUserId` |
| `ExportArtifact.createdAt` | Required timestamp |
| `ExportArtifact.updatedAt` | Required timestamp |

At most one row per owner is in `PROCESSING` or `VERIFYING`. At most five rows per owner are `QUEUED`.

## Playlist

| Field | Constraint |
| --- | --- |
| `Playlist.id` | Required UUID |
| `Playlist.ownerUserId` | Required reference |
| `Playlist.name` | Required, 1–160 characters |
| `Playlist.description` | Optional, max 4000 characters |
| `Playlist.archivedAt` | Optional timestamp |
| `Playlist.version` | Required integer, starts at 1 |
| `Playlist.createdAt` | Required timestamp |
| `Playlist.updatedAt` | Required timestamp |

## PlaylistItem

| Field | Constraint |
| --- | --- |
| `PlaylistItem.id` | Required UUID |
| `PlaylistItem.playlistId` | Required reference |
| `PlaylistItem.revisionId` | Required reference |
| `PlaylistItem.note` | Optional, max 1000 characters |
| `PlaylistItem.position` | Required integer, unique within the playlist, starts at 0 |

Deleting an item does not delete `AudioRevision` or `AudioAsset`.

## WeddingPlan

| Field | Constraint |
| --- | --- |
| `WeddingPlan.id` | Required UUID |
| `WeddingPlan.ownerUserId` | Required reference |
| `WeddingPlan.name` | Required, 1–160 characters |
| `WeddingPlan.weddingDate` | Optional date |
| `WeddingPlan.location` | Optional, max 240 characters |
| `WeddingPlan.timeZone` | Required IANA zone, default `Asia/Ho_Chi_Minh` |
| `WeddingPlan.notes` | Optional, max 8000 characters |
| `WeddingPlan.state` | Required, `DRAFT`, `READY`, `NEEDS_REVIEW`, or `ARCHIVED` |
| `WeddingPlan.version` | Required integer, starts at 1 |
| `WeddingPlan.listeningApprovedAt` | Optional timestamp, empty unless `state` is `READY` |
| `WeddingPlan.createdAt` | Required timestamp |
| `WeddingPlan.updatedAt` | Required timestamp |

## WeddingStage

| Field | Constraint |
| --- | --- |
| `WeddingStage.id` | Required UUID |
| `WeddingStage.planId` | Required reference |
| `WeddingStage.name` | Required, 1–160 characters |
| `WeddingStage.description` | Optional, max 4000 characters |
| `WeddingStage.approximateTime` | Optional, max 80 characters |
| `WeddingStage.estimatedDurationMs` | Optional integer, minimum 0 |
| `WeddingStage.status` | Required, `MUSIC_REQUIRED`, `NO_MUSIC`, or `SKIPPED` |
| `WeddingStage.position` | Required integer, unique within the plan |
| `WeddingStage.version` | Required integer |

Cues remain stored when `status` changes.

## MusicCue

| Field | Constraint |
| --- | --- |
| `MusicCue.id` | Required UUID |
| `MusicCue.stageId` | Required reference |
| `MusicCue.revisionId` | Required reference |
| `MusicCue.instruction` | Optional, max 2000 characters |
| `MusicCue.responsiblePerson` | Optional, max 120 characters |
| `MusicCue.advisoryTiming` | Optional, max 200 characters |
| `MusicCue.position` | Required integer, unique within the stage |
| `MusicCue.listeningApprovedAt` | Optional timestamp |
| `MusicCue.playlistItemId` | Optional original item id copied at snapshot time; no live foreign-key dependency that updates the cue |
| `MusicCue.version` | Required integer |

## HandoffPackage

| Field | Constraint |
| --- | --- |
| `HandoffPackage.id` | Required UUID |
| `HandoffPackage.planId` | Required reference |
| `HandoffPackage.planVersion` | Required integer copied from the plan at build time |
| `HandoffPackage.state` | Required, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, or `CANCELLED` |
| `HandoffPackage.storageKey` | Optional, required when `COMPLETED` |
| `HandoffPackage.isOutdated` | Required boolean, true when the plan version later differs |
| `HandoffPackage.createdAt` | Required timestamp |

## AdministrativeAuditLog

| Field | Constraint |
| --- | --- |
| `AdministrativeAuditLog.id` | Required UUID |
| `AdministrativeAuditLog.actorUserId` | Required reference |
| `AdministrativeAuditLog.action` | Required, max 80 characters |
| `AdministrativeAuditLog.entityType` | Required, max 80 characters |
| `AdministrativeAuditLog.entityId` | Required UUID |
| `AdministrativeAuditLog.summary` | Required, max 1000 characters, no private file bytes |
| `AdministrativeAuditLog.createdAt` | Required timestamp |

## IdempotencyRecord

| Field | Constraint |
| --- | --- |
| `IdempotencyRecord.userId` | Required reference |
| `IdempotencyRecord.key` | Required, max 200 characters |
| `IdempotencyRecord.requestHash` | Required |
| `IdempotencyRecord.responseStatus` | Required integer |
| `IdempotencyRecord.responseBody` | Required JSON |
| `IdempotencyRecord.createdAt` | Required timestamp |

Unique `(userId, key)`. The same key with a different hash is a conflict.

## Relationships

- One user owns many identities, sessions, assets, revisions, jobs, playlists, plans, and packages.
- One catalog track has one artist, optional style, mood, and language, many ceremony categories, many tags, and at most one current asset pointer.
- One asset has one waveform, many revisions, and may be replaced only by a new asset row.
- One revision has many export artifacts, playlist items, and cues.
- One plan has many stages. One stage has many cues.
- One plan has many handoff packages. A package does not update when the plan changes; `isOutdated` does.

## State notes

- Upload ready requires a validated asset and a waveform.
- YouTube metadata does not change `acquisitionState` to success.
- Export completed does not set `MusicCue.listeningApprovedAt`.
- Plan `READY` requires stored readiness success plus `listeningApprovedAt`.
- A change to cue content, revision choice, order, or instruction increments `WeddingPlan.version`, clears `listeningApprovedAt`, and sets state to `NEEDS_REVIEW` when it was `READY`.
