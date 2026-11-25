# Feature Specification: Wedding Music Planner

**Feature Branch**: `001-wedding-music-planner`

**Created**: 2026-11-19

**Status**: Approved

**Input**: User description: "Build the complete Vietnamese Wedding Music Planner defined by WMP-001 through WMP-018, including discovery, Google sign-in, private audio, editing, MP3 export, playlists, wedding plans, readiness, handoff, administration, and honest YouTube import behavior."

## User Scenarios & Testing *(mandatory)*

Priority orders delivery. Every story below is in the release. A later priority is not a cut.

### User Story 1 - Sign in and return to the same account (Priority: P1)

A guest can read public product information. A person signs in with Google, gets one application account the first time, and returns to that same account later, including from another device. Signing out ends that session. Opening a protected page sends the person to sign in and then back to the page they asked for.

**Why this priority**: Private music, plans, and exports have no owner without a stable account.

**Independent Test**: Sign in with one Google identity, create a private playlist, sign out, sign in again, and confirm the playlist is still there. A second Google identity cannot open it.

**Acceptance Scenarios**:

1. **Given** a new Google identity, **When** the person signs in, **Then** the product creates one application account and shows that person's profile.
2. **Given** an existing account, **When** the same Google identity signs in again, **Then** the product opens the same account and does not create a second user.
3. **Given** a repeated sign-in callback, **When** it is processed more than once, **Then** the product still has only one user for that Google identity.
4. **Given** a signed-in user, **When** they sign out, **Then** private pages and private files are no longer available in that session.
5. **Given** user A is signed in, **When** user B signs in on the same browser, **Then** user A's private information is cleared from the session and user B sees only their own data.
6. **Given** an expired or cancelled sign-in, **When** the person returns to the product, **Then** they see a clear error and no private data.
7. **Given** a signed-in user, **When** they confirm account deletion, **Then** the account and its private data are removed and a later sign-in of a new identity does not restore that private data.

---

### User Story 2 - Discover published wedding music (Priority: P1)

A guest searches a Vietnamese wedding catalog by title, artist, and keyword, including accent-insensitive Vietnamese matching. They filter by ceremony stage, mood, style, language, and instrumental or vocal, then sort, page, and clear filters. Only published entries appear.

**Why this priority**: Discovery is the public value of the product before anyone uploads music.

**Independent Test**: With a known published set and one unpublished entry, search and each filter return only the expected published entries, and an empty filter shows a clear empty state.

**Acceptance Scenarios**:

1. **Given** published and unpublished entries, **When** a guest searches or browses, **Then** only published entries appear.
2. **Given** a title stored with Vietnamese accents, **When** a guest searches with or without accents, **Then** the matching song is found.
3. **Given** active filters, **When** the guest clears them, **Then** the unfiltered published list returns.
4. **Given** no matches, **When** a search finishes, **Then** the page shows an empty state rather than an error.
5. **Given** a slow search, **When** results are not ready, **Then** the page shows a loading state.

---

### User Story 3 - Preview a catalog track (Priority: P1)

A person opens a track and sees title, artist, artwork, duration, style, mood, recommended stages, source information, and usage permission. When playback is permitted, they can play, pause, seek, see progress and times, and change listening volume. Only one preview plays at a time. A metadata-only track does not offer an editable audio source.

**Why this priority**: People must judge a song before saving it into a wedding.

**Independent Test**: Open one playable track and one metadata-only track. Control playback on the playable track. Confirm the metadata-only track cannot be edited as audio.

**Acceptance Scenarios**:

1. **Given** a playable published track, **When** the listener presses play, pause, and seek, **Then** the heard audio and the displayed times follow those actions.
2. **Given** one preview is playing, **When** another preview starts, **Then** the first preview stops.
3. **Given** a page load, **When** the person has not pressed play, **Then** audio does not start by itself.
4. **Given** a playback failure, **When** the audio cannot be read, **Then** the page explains the failure.
5. **Given** the listener changes player volume, **When** they later save an edit, **Then** the saved revision gain is unchanged by that listening volume.
6. **Given** a metadata-only track, **When** the person opens it, **Then** details are visible and it is not offered as an editable audio source.

---

### User Story 4 - Upload private audio (Priority: P1)

A signed-in user uploads an MP3 or WAV PCM file by picker or drag and drop, watches progress, and can cancel or retry a recoverable failure. The product checks size, real format, and duration, extracts metadata, and stores the file privately. The source stays unchanged. The upload is ready only after validation and required processing succeed.

**Why this priority**: Personal audio is the path that does not depend on an external video platform.

**Independent Test**: Upload a valid short MP3, reject a renamed non-audio file and a corrupted file, and confirm the valid file appears only for the owner.

**Acceptance Scenarios**:

1. **Given** a signed-in user and a valid MP3 or WAV PCM within the limits, **When** the upload finishes processing, **Then** a private source asset is ready with duration and format shown.
2. **Given** a file that is too large, too long, corrupted, or not real MP3 or WAV PCM, **When** the user submits it, **Then** the product rejects it and does not mark it ready.
3. **Given** an in-progress upload, **When** the user cancels, **Then** the incomplete file is not kept as a ready asset.
4. **Given** a recoverable processing failure, **When** the user retries, **Then** the product does not create uncontrolled duplicate ready assets.
5. **Given** another signed-in user, **When** they try to open the owner's source, **Then** access is denied.
6. **Given** a guest, **When** they try to upload, **Then** the product asks them to sign in and stores nothing.

---

### User Story 5 - Edit audio and keep every revision (Priority: P1)

A user opens ready audio, sees a waveform from that audio, zooms, chooses a start and end, types timestamps, plays the selection, loops it, and sets fade in, fade out, and gain. Preview matches those choices. Save creates a new immutable revision. The source and older revisions stay as they were. Reopening a revision restores its exact settings.

**Why this priority**: Ceremony music is useful only when a chosen section can be saved and reused.

**Independent Test**: Trim a known fixture, apply fade and gain, save, reopen, and confirm the source file and the previous revision are unchanged.

**Acceptance Scenarios**:

1. **Given** ready audio, **When** the user selects a range inside the source, **Then** the preview plays that range with the chosen fades and gain.
2. **Given** a start that is not before the end, or a range outside the source, or fades longer than the clip, **When** the user tries to save, **Then** the product rejects the values.
3. **Given** a saved revision, **When** the user changes settings and saves again, **Then** a new revision exists and the earlier revision is unchanged.
4. **Given** an open revision, **When** the user changes settings and leaves without saving, **Then** the product warns about unsaved changes and the stored revision stays unchanged.
5. **Given** gain high enough to clip, **When** the preview is shown, **Then** the user sees a clipping warning.
6. **Given** a phone-width screen, **When** dragging the waveform is difficult, **Then** the user can still enter start and end times.

---

### User Story 6 - Export a real MP3 (Priority: P1)

A user exports one saved revision. The finished file is a real MP3 that contains the trim, fades, and gain of that revision. The job shows queued, processing, verifying, completed, failed, or cancelled. The user can retry a failure or cancel an unfinished job. Closing the page does not drop an accepted job. A failed export deletes neither the source nor the revision.

**Why this priority**: The wedding handoff depends on playable files, not on project settings alone.

**Independent Test**: Export a revision with a known trim, confirm the downloaded file plays and matches that section, then fail one job and confirm the source remains.

**Acceptance Scenarios**:

1. **Given** a saved revision, **When** export completes, **Then** the user can download a playable MP3 of that revision only.
2. **Given** an accepted export, **When** the user closes the page and returns, **Then** the job status is still visible and a completed file can be downloaded.
3. **Given** a failed export, **When** the user retries, **Then** the product does not create uncontrolled duplicate active jobs for the same revision.
4. **Given** a completed export, **When** another user requests the file, **Then** access is denied.
5. **Given** the user cancels an unfinished export, **When** the job stops, **Then** its state is cancelled and the source and revision remain.

---

### User Story 7 - Organize playlists (Priority: P2)

A signed-in user creates, renames, describes, duplicates, archives, and deletes playlists. They add the same song more than once, choose a specific revision for each item, add notes, reorder items, and see total duration. Removing an item does not delete its source. Two sessions cannot silently overwrite each other's newer playlist edits.

**Why this priority**: Playlists are the bridge between a library and a ceremony plan.

**Independent Test**: Build a playlist with two items that use the same source and different revisions, reorder it, reopen it, and remove one item without deleting the source.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they add two items for one song, **Then** each item has its own identity, note, and selected revision.
2. **Given** a saved order, **When** the user reopens the playlist, **Then** the same order and total duration are shown.
3. **Given** a playlist item, **When** the user removes it, **Then** the source audio and other playlists remain.
4. **Given** a newer save from another session, **When** this session saves an older copy, **Then** the product reports a conflict and keeps the newer save.
5. **Given** a duplicated playlist, **When** the user edits one copy, **Then** the other copy does not change.

---

### User Story 8 - Build a wedding plan and cues (Priority: P2)

A user creates one or more plans with name, optional date, optional location, time zone, and notes. They start from an empty plan or a suggested Vietnamese ceremony structure, then edit stages. Each stage can hold ordered cues that point at a specific revision, with instructions, a responsible person, and advisory timing. The product never starts audio because a ceremony clock is reached. Copying playlist items into a stage snapshots their order and revisions. Later playlist edits do not change that stage unless the user explicitly refreshes it.

**Why this priority**: The ceremony timeline is the product's planning outcome.

**Independent Test**: Create a plan from the suggested structure, add a cue, snapshot a playlist into one stage, change the playlist, and confirm the stage is unchanged until an explicit refresh.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they create an empty plan and a plan from the suggested structure, **Then** both plans are editable and independent.
2. **Given** a stage, **When** the user adds, renames, reorders, duplicates, or removes stages and cues, **Then** the saved plan shows that order after reopening.
3. **Given** a stage marked no-music or skipped, **When** the user had cues there, **Then** the cue information is kept for later restoration and skipped stages are excluded from handoff.
4. **Given** a playlist snapshot in a stage, **When** the playlist changes later, **Then** the stage keeps the original items until the user explicitly refreshes or replaces them.
5. **Given** a duplicated plan, **When** one plan is edited, **Then** the other plan does not share that change.
6. **Given** an archived plan, **When** the user reopens it, **Then** it becomes editable again. Deleting a plan requires confirmation.

---

### User Story 9 - Review readiness and export the handoff (Priority: P2)

The product lists concrete readiness problems: required stages without cues, missing sources, invalid revisions, unavailable media, failed or unfinished exports, unreviewed cues, permission problems, and duration mismatches. System audio readiness and the user's listening approval are separate. A plan is ready only when required checks pass and the user confirms. After that, any relevant cue, revision, order, or instruction change returns the plan to needs-review. The user downloads PDF instructions, CSV instructions, and a ZIP that contains those documents plus the real MP3 files for the approved snapshot.

**Why this priority**: The ceremony handoff is the final user outcome.

**Independent Test**: Leave one required stage empty and confirm the plan cannot become ready. Complete and approve a small plan, export the ZIP, then change one cue and confirm the previous package is marked outdated.

**Acceptance Scenarios**:

1. **Given** a missing required cue, **When** the user opens readiness, **Then** the message names that stage and the plan cannot become ready.
2. **Given** a completed export the user has not approved by listening, **When** readiness is shown, **Then** listening approval is still outstanding.
3. **Given** all required checks pass, **When** the user confirms readiness, **Then** the plan state becomes ready.
4. **Given** a ready plan, **When** the user changes a cue, revision, order, or relevant instruction, **Then** the previous approval is invalidated.
5. **Given** a ready snapshot, **When** the handoff export completes, **Then** the ZIP contains the matching MP3 files, PDF, and CSV, with stable ordering and no duplicate file names.
6. **Given** a skipped stage or an incomplete package, **When** export runs, **Then** skipped audio is absent and an incomplete package is rejected.
7. **Given** a plan change after a package was built, **When** the user views that package, **Then** it is clearly marked outdated.

---

### User Story 10 - Administer the public catalog (Priority: P2)

An administrator manages entries, categories, artists, tags, and recommended stages; attaches permitted catalog media; edits source information; publishes and unpublishes; reviews processing failures; and reads audit records. Unpublishing hides an entry. It is different from removing permission to use audio already selected. Replacing catalog media creates a new source version. Plans that depend on a changed or removed catalog source show a readiness warning. Administrator actions are denied to guests and normal users.

**Why this priority**: The public catalog must be curated without exposing private libraries.

**Independent Test**: As an administrator, publish and unpublish an entry and confirm a guest sees only the published one. As a normal user, confirm the same action is denied. Confirm a private user file is not listed in the admin catalog.

**Acceptance Scenarios**:

1. **Given** an administrator, **When** they create a category and a track and publish it, **Then** guests can find that track under the new category.
2. **Given** a published track, **When** the administrator unpublishes it, **Then** it disappears from public search and existing plans receive a readiness warning if they still depend on it.
3. **Given** catalog media that plans already reference, **When** the administrator replaces the media, **Then** a new source version is stored and the previous version remains for those references.
4. **Given** a guest or normal user, **When** they call an administrator action, **Then** the product denies it.
5. **Given** an administrator, **When** they review operational failures, **Then** they see processing failures and audit records without automatic access to another user's private media.

---

### User Story 11 - Download YouTube audio and edit it (Priority: P1)

A signed-in user pastes a normal YouTube video or compatible Shorts URL. The product shows the real title, channel, thumbnail, duration, original URL, import availability, and processing status for that video. A playlist parameter does not import the whole playlist. Malformed URLs are rejected. The user downloads the audio of that video into their private library with one action. The product extracts playable audio, generates a real waveform, and opens the same waveform editor as uploads, where the user trims, fades, sets gain, saves revisions, and exports an MP3. If the download fails, the product keeps the metadata, shows the real reason, and does not claim success.

**Why this priority**: YouTube is a required discovery path, and a false success would mislead a wedding.

**Independent Test**: Submit a valid URL and an invalid URL. Download a short public video and confirm the audio appears in the library with a waveform, can be trimmed and saved as a revision, and can be exported. Make the download fail and confirm no audio asset becomes ready.

**Acceptance Scenarios**:

1. **Given** a valid single-video URL, **When** the user submits it, **Then** the displayed title, channel, thumbnail, and duration match that video.
2. **Given** a malformed URL, **When** the user submits it, **Then** the product rejects it and does not fetch an arbitrary address.
3. **Given** a private, removed, or unsupported video, **When** lookup finishes, **Then** the product shows an accurate error.
4. **Given** metadata was fetched, **When** audio has not been imported, **Then** the status does not say the audio is ready.
5. **Given** a download that fails or a video longer than the source limit, **When** the user asks to import, **Then** the job ends failed with the real reason, with no fake waveform and no ready audio.
6. **Given** a downloadable public video, **When** import completes, **Then** the private library contains playable audio, a matching waveform, a saved revision path, and an MP3 export path.
7. **Given** a repeated import request, **When** the first job is still active, **Then** the product does not start an uncontrolled duplicate job.
8. **Given** an interrupted or failed import, **When** the user returns, **Then** the stored status and error remain, and temporary files from the failed attempt are not left as ready media.

---

### User Story 12 - Manage storage, deletion, and the full site (Priority: P3)

The user sees storage use against a quota, cannot exceed it, and is blocked from deleting a source that a wedding plan still needs unless they resolve that dependency. Deleting an unused asset removes its orphaned processing files. The site is Vietnamese, responsive, and usable by keyboard, with visible focus, loading, empty, and error states, unsaved-change warnings, and confirmation before destructive actions.

**Why this priority**: These rules protect finished plans and make the earlier stories usable on a phone.

**Independent Test**: Fill storage near the quota and reject the next oversized upload. Try to delete a source used by a plan and confirm the plan still plays. Complete the primary path on a narrow viewport using the keyboard.

**Acceptance Scenarios**:

1. **Given** a user near the quota, **When** an upload or import would exceed it, **Then** the product rejects it and shows the current usage.
2. **Given** a source used by a wedding cue, **When** the user tries to delete it, **Then** the product shows the dependency and does not delete it.
3. **Given** an unused source, **When** the user deletes it, **Then** its private files and leftover temporary outputs are removed and other users' data remains.
4. **Given** a guest, signed-in user, or administrator, **When** they open each page they are allowed to use, **Then** the page has a working empty, loading, and error state where data can be missing or fail.
5. **Given** a destructive action, **When** the user has not confirmed, **Then** the product does not perform it.

---

### Edge Cases

- A second Google identity must never receive the first identity's playlist, upload, revision, export, or plan.
- Refresh, a closed browser, and a second device must show the latest saved server data.
- Two open tabs saving the same playlist, plan, or profile must not silently keep the older write.
- Repeated submission after a timeout must not create a second ready upload, import, or export for the same request.
- A zero-length selection, a fade longer than the clip, and a timestamp outside the source must be rejected.
- Player listening volume must not change stored gain.
- A metadata-only catalog track must not enter the editor as audio.
- Export failure, import failure, and account deletion must not remove unrelated users' files.
- Skipped and no-music stages must not add MP3 files to the handoff package.
- An outdated handoff package must remain downloadable only with a clear outdated mark, and must not be described as the current ready snapshot.
- YouTube playlist URLs must process only the selected video.
- Unavailable YouTube media must not be shown as a successful download.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (WMP-001)**: The product MUST let a person sign in with Google, create one account on first success, and recognize the same person on return. Google MUST be the only end-user sign-in method in this release.
- **FR-002 (WMP-001)**: The product MUST keep an application session until sign-out or expiration, MUST reject invalid, cancelled, and expired sign-in, and MUST return the person to the originally requested page when that page is safe to open after sign-in.
- **FR-003 (WMP-001)**: The product MUST identify the Google person by a stable provider subject, MUST use an internal user id for ownership, and MUST NOT treat email address as the permanent identity.
- **FR-004 (WMP-001)**: The product MUST show profile information, MUST end access on sign-out, and MUST complete a confirmed account-deletion request by removing the account and its private data.
- **FR-005 (WMP-002)**: A guest MUST be able to search published music by title, artist, and keyword, with Vietnamese accent-insensitive matching, and MUST be able to filter by ceremony stage, mood, style, language, and instrumental or vocal.
- **FR-006 (WMP-002)**: Search results MUST be sortable and paginated, MUST have a clear-filters action, and MUST show loading and empty states. Unpublished entries MUST NOT appear in public results.
- **FR-007 (WMP-002)**: Ceremony categories MUST be administrable and MUST NOT force every wedding plan to use the same stage list. The initial suggested categories are Guest Arrival, Ceremony Introduction, Bride Entrance, Groom Entrance, Family Ceremony, Ring Exchange, Cake Cutting, Toast, Wedding Banquet, Background Music, and Farewell.
- **FR-008 (WMP-003)**: A track detail view MUST show title, artist, artwork or thumbnail, duration, style, mood, recommended stages, source information, and usage permission.
- **FR-009 (WMP-003)**: Permitted preview MUST support play, pause, seek, progress, current time, duration, listening volume, and playback errors. Only one preview MAY play at a time, and playback MUST NOT start automatically.
- **FR-010 (WMP-003)**: A metadata-only track MUST NOT be presented as an editable audio source. Listening volume MUST NOT change a saved revision's gain.
- **FR-011 (WMP-004)**: Each signed-in user MUST have a private library of uploaded audio, successfully imported audio, saved revisions, and export artifacts, with search, source type, duration, format, processing status, revision history, and available downloads.
- **FR-012 (WMP-004)**: Source types MUST be distinguishable as catalog, upload, and YouTube. Catalog media and personal media MUST share the same editing and export behavior once a real audio source is ready.
- **FR-013 (WMP-005)**: A signed-in user MUST be able to upload MP3 and WAV PCM by file picker or drag and drop, see progress, cancel, and retry a recoverable failure. The product MUST validate size, actual media format, and duration, and MUST NOT trust the file extension alone.
- **FR-014 (WMP-005)**: Source audio MUST remain immutable. An upload MUST NOT become ready until validation and required processing succeed. Failed upload leftovers MUST be cleaned up. Duplicate submissions MUST NOT create uncontrolled ready copies.
- **FR-015 (WMP-006)**: The editor MUST show a waveform derived from the real audio and MUST let the user zoom, set and drag trim boundaries, type timestamps, play and loop the selection, seek inside it, set fade in, fade out, and gain, reset the selection, undo and redo supported edits, and save a new revision.
- **FR-016 (WMP-006)**: A selection MUST satisfy start at or after zero, start before end, and end at or before the source duration. Combined fades MUST NOT exceed the selected duration. Invalid times MUST be rejected. The shortest saved clip is one second. Timestamp entry MUST accept 10-millisecond precision.
- **FR-017 (WMP-006)**: Preview MUST reflect the selected trim, fades, and gain, MUST NOT overlap another playback, and MUST warn when the gain may clip. Unsaved editor changes MUST remain unsaved until the user saves. Opening a revision MUST restore its exact parameters.
- **FR-018 (WMP-007)**: The product MUST keep source assets, revisions, and export artifacts as separate records. A revision MUST store its source, trim start, trim end, fade in, fade out, gain, processing configuration version, creation time, and owner.
- **FR-019 (WMP-007)**: Every save MUST create a new immutable revision. Playlist items and cues MUST keep their originally selected revision until the user explicitly replaces that item or cue.
- **FR-020 (WMP-008)**: Export MUST render the selected revision, including trim, fades, and gain, into a real MP3 file, then check that the output is MP3 and that its duration matches the revision. The source and revision MUST be preserved.
- **FR-021 (WMP-008)**: Export jobs MUST use the states queued, processing, verifying, completed, failed, and cancelled. The user MUST see progress and errors, MUST be able to retry and cancel, and MUST NOT get uncontrolled duplicate active jobs. Accepted jobs MUST survive a closed page. Completed files MUST remain private to the owner.
- **FR-022 (WMP-009)**: A signed-in user MUST be able to create, rename, describe, duplicate, archive, and delete playlists; add and remove items; reorder items; select a revision per item; add notes; preview items; and see total duration. The same song MAY appear more than once as separate items.
- **FR-023 (WMP-009)**: Removing a playlist item MUST NOT delete its source. Playlist order MUST persist. Conflicting playlist saves MUST be detected and MUST NOT silently overwrite a newer save.
- **FR-024 (WMP-010)**: A signed-in user MUST be able to create, edit, duplicate, archive, reopen, and delete multiple wedding plans. A plan MUST store name, optional wedding date, optional location, time zone, notes, ordered stages, and preparation status. Delete MUST require confirmation.
- **FR-025 (WMP-010)**: A user MUST be able to start from an empty plan or a suggested Vietnamese ceremony structure. Suggested stages MUST be editable. Duplicating a plan MUST copy its structure without sharing later edits.
- **FR-026 (WMP-011)**: A user MUST be able to add, rename, reorder, duplicate, and remove stages; add a description, approximate time, estimated duration, and stage status. Stage status MUST include music required, no music, and skipped.
- **FR-027 (WMP-011)**: A user MUST be able to add one or more revision cues, import playlist entries as a snapshot, reorder cues, replace a revision explicitly, remove a cue, and store playback instructions, a responsible person, and advisory timing. The product MUST NOT autoplay audio from the ceremony clock.
- **FR-028 (WMP-011)**: Switching a stage away from music required MUST preserve existing cue information for restoration. Skipped and no-music stages MUST NOT contribute audio to the handoff package. An explicit refresh action is required before later playlist edits change a stage snapshot.
- **FR-029 (WMP-012)**: Readiness MUST report required stages without cues, missing sources, invalid revisions, unavailable media, failed exports, unfinished exports, unreviewed cues, permission problems, and duration discrepancies as separate actionable messages.
- **FR-030 (WMP-012)**: System-verified audio readiness and user listening approval MUST be separate. A plan MUST become ready only after required checks pass and the user confirms. A relevant later edit MUST invalidate that approval. Plan states MUST include draft, ready, needs review, and archived.
- **FR-031 (WMP-013)**: A handoff MUST be creatable as PDF instructions, CSV instructions, and a ZIP containing those documents and the required MP3 files. The package MUST name the plan, version, date, time zone, ordered stages, ordered cues, file names, durations, instructions, and notes.
- **FR-032 (WMP-013)**: A package MUST come from one snapshot, MUST preserve selected revisions, MUST order files deterministically, MUST avoid duplicate file names, MUST verify every required file, MUST exclude skipped stages, and MUST be rejected when incomplete. A package built before a later plan change MUST be marked outdated.
- **FR-033 (WMP-014)**: An administrator MUST be able to manage catalog entries, categories, artists, tags, recommended stages, permitted catalog media, source information, publish state, processing-failure review, and audit records. These actions MUST be denied to other roles.
- **FR-034 (WMP-014)**: Unpublishing MUST be distinct from revoking use of audio already selected. Replacing catalog media MUST create a new source version. Changes that invalidate selected media MUST raise readiness warnings on affected plans.
- **FR-035 (WMP-015)**: Playlists, plans, revisions, jobs, and profile data MUST persist on the server across refresh, a new visit, and another device. Important creates MUST be safe to retry. Updates that carry an older version MUST be rejected with a visible conflict.
- **FR-036 (WMP-016)**: The product MUST show storage use, enforce a quota, reject oversized uploads and imports, clean temporary files, and block deletion of a source that a plan still requires unless the user resolves that dependency. Unused-asset deletion MUST remove orphaned private artifacts. Account deletion MUST clean that account's private data.
- **FR-037 (WMP-017)**: The site MUST be in Vietnamese and MUST include the public landing page, discovery, track detail, sign-in and authentication states, user dashboard, library, upload and YouTube import, editor, playlist list, playlist editor, wedding plan list, plan detail, ceremony timeline and cue editor, readiness, exports, profile and storage, administrator dashboard, administrator catalog, and error, loading, and empty states.
- **FR-038 (WMP-017)**: The interface MUST be usable on desktop, tablet, and mobile; MUST support keyboard access and visible focus; MUST warn about unsaved changes; MUST confirm destructive actions; and MUST provide a non-drag alternative for drag-and-drop tasks. Visual design MUST follow the project's approved taste direction: elegant, modern, romantic, and professional.
- **FR-039 (WMP-018)**: The product MUST accept common single-video YouTube and compatible Shorts URLs, MUST normalize the video id, MUST ignore extra playlist items, and MUST reject malformed URLs. It MUST NOT treat a user-supplied address as an open-ended download destination.
- **FR-040 (WMP-018)**: For a resolvable video, the product MUST show title, channel, thumbnail, duration, original URL, import availability, and processing status that belong to that video. Metadata success MUST NOT be shown as audio import success.
- **FR-041 (WMP-018)**: Import MUST create a durable job, download the best available audio of the normalized video into private processing storage, convert it to MP3, validate the media, generate a real waveform, and register the audio in the owner's library as a YouTube source. The user MUST NOT be required to download the video manually. The downloaded audio MUST open in the waveform editor used for uploads.
- **FR-042 (WMP-018)**: Import jobs MUST represent pending, fetching metadata, awaiting import, downloading, extracting audio, generating waveform, ready for editing, failed, and cancelled. The user MUST see progress and errors and MUST be able to cancel and safely retry. Active duplicate imports of the same request MUST be prevented.
- **FR-043 (WMP-018)**: When a download fails, the video is unavailable, or the video exceeds the source duration limit, the product MUST keep the metadata it obtained, MUST show the real reason, MUST mark the job failed, MUST remove partial files, and MUST NOT invent a file, waveform, or success state. Imported media MUST remain private.
- **FR-044**: Guests MUST NOT save playlists, upload or import media, save revisions, create plans, or read private files. Users MUST access only their own private resources. Administrators MUST NOT automatically read private user media.
- **FR-045**: Initial product limits, all configurable later, are: 100 MiB maximum upload, 10 minutes maximum source duration, 1 second minimum clip, 0 to 10 seconds fade per end within the clip, gain from -24 dB to +6 dB with a default of 0 dB, an initial personal quota of 1 GiB, one active export at a time per user, and five queued exports per user.

### Key Entities

- **User**: Application account, profile, role, storage use, and deletion state.
- **Auth Identity**: Link from one Google subject to one internal user. Email is display data, not the identity key.
- **Session**: Server-recognized sign-in that can expire and can be revoked.
- **Artist**: Public name used by catalog entries.
- **Music Category**: Administrable ceremony, mood, style, or language classification.
- **Catalog Track**: Published or unpublished public music entry, permission state, and optional permitted media. Permission state is separate from processing state.
- **Audio Asset**: Immutable private or catalog source, with source type catalog, upload, or YouTube, technical metadata, and processing status.
- **Audio Revision**: Immutable edit of one asset: trim, fades, gain, processing version, owner, and creation time.
- **Export Artifact**: MP3 output of one revision, with job state and private download.
- **Upload Job**: Validation and processing of one local file submission.
- **YouTube Import Job**: Metadata, availability, acquisition, extraction, and waveform progress for one video reference.
- **Playlist**: Owned ordered list with description and archive state.
- **Playlist Item**: One occurrence of a chosen revision, with its own note and position.
- **Wedding Plan**: Owned plan, optional date and location, time zone, notes, version, and preparation state.
- **Wedding Stage**: Ordered stage inside one plan, with status, timing, and description.
- **Music Cue**: Ordered cue inside one stage, bound to one revision, with instructions and advisory timing.
- **Handoff Package**: Snapshot export containing instructions and the MP3 files for that snapshot, with an outdated flag when the plan changes later.
- **Administrative Audit Log**: Who performed an administrative change, what changed, and when. It does not include private media contents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time person can finish Google sign-in and see an account profile in under 2 minutes when Google responds normally.
- **SC-002**: A returning person sees their previously saved playlist and audio revision after a new sign-in, including from a second device.
- **SC-003**: In a catalog of at least 50 published entries, a search or filter change shows results or a clear empty state within 2 seconds for a normal local load.
- **SC-004**: A guest can start, pause, and seek a permitted preview, and a second preview never leaves the first one playing.
- **SC-005**: A valid MP3 or WAV PCM under the size and duration limits becomes a private ready asset, or shows a specific failure, within 1 minute for a 3-minute file on the local development machine.
- **SC-006**: Invalid, corrupted, and oversized files are rejected in 100 percent of the tested cases and never appear as ready audio.
- **SC-007**: A user can trim, fade, and change gain, hear those choices in preview, and reopen the saved revision with the same parameters.
- **SC-008**: An exported file opens in a common music player, is a real MP3, and its audible section matches the saved trim within 200 milliseconds.
- **SC-009**: Closing the browser after an export is accepted does not lose the job. A later visit shows the same final state.
- **SC-010**: Reordering a playlist of 20 items and reopening it preserves every item identity and the saved order.
- **SC-011**: A wedding plan with 11 stages can be reordered and reopened without losing cues. A playlist edit after a snapshot changes zero stage cues until an explicit refresh.
- **SC-012**: Readiness names each missing required item. A plan with one known gap cannot be marked ready.
- **SC-013**: A completed handoff ZIP contains the expected MP3, PDF, and CSV files, and each MP3 plays. A package built before a later plan edit is marked outdated.
- **SC-014**: In conflict tests, the older of two overlapping saves is rejected and the newer saved content remains.
- **SC-015**: 100 percent of tested cross-user private links are denied for library items, revisions, exports, playlists, plans, and packages.
- **SC-016**: A valid YouTube URL shows the matching public video details. An invalid URL is rejected. A short public video becomes editable audio with a waveform. A failed download never appears as ready audio.
- **SC-017**: A person who has not used the product before can complete upload, edit, save, export, playlist add, and plan cue on a phone-width screen without a horizontal trap that hides the primary actions.

## Assumptions

- The master implementation request on 2026-11-19 approves this release scope. Priority does not remove P2 or P3 stories from the release.
- The initial suggested ceremony list is a starting template only. Couples may delete, rename, and reorder stages.
- The default wedding time zone for a new plan is Asia/Ho_Chi_Minh. The user can change it.
- Account deletion is performed by the signed-in user after an explicit confirmation. It is not a separate administrator approval queue. Audit records of administrative catalog actions remain, without private media contents.
- The first administrators are designated by a server-side allowlist of Google subjects. Users cannot grant themselves administrator access.
- Public catalog preview is available only when the catalog entry has permitted playable audio and a usage permission that allows preview. Otherwise the entry remains metadata.
- YouTube metadata comes from public oEmbed and the optional Data API. Media acquisition is a separate adapter that downloads audio on the server. Automated tests replace the downloader with a local fixture so the suite does not depend on a live YouTube video.
- Initial limits in FR-045 are product defaults, not permanent constants. Export quality starts at the common music setting of 44.1 kHz and 192 kbps.
- Listening approval is a user action recorded on the cue or plan. It is not inferred from a completed export.
- Conflicting edits use a visible version conflict. The product does not merge two plans automatically.
- The interface copy is Vietnamese. Specification, plan, tasks, and code identifiers are English.
- This release excludes public streaming, social features, generated music, voice separation, live mixing, automatic ceremony playback, payments, real-time collaboration, public sharing of private imports, native apps, invitations, RSVP, seating, and budgets.
