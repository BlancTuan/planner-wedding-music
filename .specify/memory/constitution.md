<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0
- Modified principles: none renamed
- Modified sections: Product Constraints, the rule that blocked YouTube media acquisition is
  removed. The product downloads YouTube audio on import. Downloaded media stays private.
- Added sections: none
- Removed sections: none
- Bump rationale: MAJOR, because a prohibition was reversed and approved artifacts that relied on
  it (spec FR-041 to FR-043, research YouTube decision, plan constraints, tasks note) now conflict.
- Follow-up TODOs: update specs/001-wedding-music-planner spec.md, research.md, plan.md,
  contracts/media-acquisition.md, and tasks.md to match.
-->

# Wedding Music Planner Constitution

## Core Principles

### I. Specification Before Implementation

Every product change MUST trace to an approved Spec Kit specification,
architecture plan, and task. Spec Kit is the only requirements and sequencing
workflow. Implementation MUST NOT start for a behavior that the current
specification does not require. Agents MUST NOT invent business requirements
or replace this workflow with a second planning system.

### II. Honest Product States

The product MUST report only work that actually completed. Metadata retrieval
is not media import. A saved revision is not an exported file. An exported
file is not user listening approval. A created wedding plan is not a ready
plan. The product MUST NOT present placeholder audio, a renamed non-MP3 file,
a synthetic waveform, or an embedded video player as a completed import,
edit, or export.

### III. Server-Side Ownership and Authorization

Private media, jobs, revisions, playlists, plans, and exports MUST be
authorized on the server for the owning application user. The permanent
account identity MUST be an internal user id linked to a stable provider
subject, not an email address alone. Guest, authenticated user, and
administrator permissions MUST differ. Administrators MUST NOT receive
private user media merely because they are administrators. The client MUST
NOT be trusted to supply another user's identity or to hide unauthorized
data only in the interface.

### IV. Immutable Media and Explicit Replacement

Original source media MUST stay unchanged by editing. A source asset, an
editing revision, and an exported artifact MUST remain distinct records.
Saving an edit MUST create a new immutable revision. Playlists and wedding
cues MUST keep the revision they selected until a user explicitly replaces
it. A later playlist edit MUST NOT silently change an existing wedding plan.
A handoff package MUST be built from one consistent plan snapshot.

### V. Verified Completion

Behavior changes MUST be proven by tests written and observed to fail before
the implementation change, then by passing tests. A feature MUST NOT be
marked complete because its files exist, because a screen renders, or because
a browser screenshot looks correct. Browser checks require a working browser
runtime; an unavailable browser is a blocked check. Critical review findings
MUST be resolved or explicitly recorded before the related feature is marked
complete.

## Product Constraints

The product language for people using the site is Vietnamese. Technical
documentation and source code conventions are English. Google is the only
end-user sign-in method unless a later approved specification adds another.
The product MUST NOT request Gmail, Drive, or YouTube account scopes merely
to sign in.

The product downloads the audio of a YouTube video on the server when a
signed-in user imports it, and registers that audio in the user's private
library for editing. Downloaded media MUST stay private to the importing user
and MUST NOT be published, shared publicly, or added to the public catalog.
When a video cannot be downloaded, the product MUST preserve the metadata it
obtained, show the real reason, and record the import as failed.

Personal data MUST survive refresh, a new browser session, and sign-in from
another device. Browser storage MAY cache drafts. It MUST NOT be the only
copy of playlists, plans, revisions, or exports. Conflicting edits MUST be
detected and MUST NOT be overwritten silently.

Out of scope unless a future specification approves it: public streaming,
social features, generated music, voice separation, live mixing, automatic
ceremony playback, payments, real-time multi-user editing, public sharing of
private imports, native mobile apps, invitations, RSVP, seating, and budgets.

## Delivery Workflow

The main agent orchestrates. The planner owns Spec Kit requirements,
architecture, dependencies, and tasks. The UI designer owns visual design and
MUST NOT change approved business rules. The implementation agent owns
assigned tasks, interface contracts, and test-first behavior changes. The QA
role checks acceptance criteria independently. The reviewer reports defects
and does not edit the implementation during review.

Work proceeds from constitution, to specification, to clarification only when
a material choice remains unsafe to default, to architecture, to tasks, then
to implementation in dependency order. One feature specification covers the
approved release. Priority orders delivery. It does not delete later
requirements from the release.

Quality gates for each feature are: an approved requirement, working behavior,
persistence where the requirement needs it, validation, server-side
authorization, error and empty states, automated tests, browser verification
where a runtime exists, and an independent review. Feature states are
NOT_STARTED, IN_PROGRESS, BLOCKED, IMPLEMENTED_UNVERIFIED, VERIFIED, and
COMPLETED. COMPLETED is forbidden while a required check is BLOCKED.

## Governance

This constitution supersedes conflicting local practice for Wedding Music
Planner. Amendments require a dated change to this file, a semantic version
bump, and a short impact note. MAJOR bumps remove or redefine a principle.
MINOR bumps add a principle or materially expand a rule. PATCH bumps clarify
wording only. Reviews MUST check ownership, honest states, immutability, and
test evidence against the principles above. Runtime guidance lives in the
approved specification, plan, and tasks for the active feature. The starter
repository and globally installed skills MUST NOT be modified to satisfy a
product change.

**Version**: 2.0.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-23
