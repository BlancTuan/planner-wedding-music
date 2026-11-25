--liquibase formatted sql

--changeset wedding:001-schema
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION vi_fold(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT unaccent(replace(lower(coalesce(input, '')), 'đ', 'd'));
$$;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  display_name varchar(120) NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  email varchar(320),
  avatar_url text,
  role varchar(16) NOT NULL CHECK (role IN ('USER', 'ADMIN')),
  storage_used_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
  storage_quota_bytes bigint NOT NULL DEFAULT 1073741824 CHECK (storage_quota_bytes >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  deletion_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL,
  subject varchar(255) NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE music_categories (
  id uuid PRIMARY KEY,
  kind varchar(16) NOT NULL CHECK (kind IN ('CEREMONY', 'MOOD', 'STYLE', 'LANGUAGE')),
  name_vi varchar(120) NOT NULL CHECK (char_length(name_vi) BETWEEN 1 AND 120),
  slug varchar(80) NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 80),
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (kind, slug)
);

CREATE TABLE artists (
  id uuid PRIMARY KEY,
  name varchar(200) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX artists_name_lower_idx ON artists (lower(name));

CREATE TABLE tags (
  id uuid PRIMARY KEY,
  name varchar(80) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX tags_name_lower_idx ON tags (lower(name));

CREATE TABLE audio_assets (
  id uuid PRIMARY KEY,
  owner_user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  source_type varchar(16) NOT NULL CHECK (source_type IN ('CATALOG', 'UPLOAD', 'YOUTUBE')),
  status varchar(16) NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
  original_filename varchar(255),
  media_format varchar(8) CHECK (media_format IN ('MP3', 'WAV', 'OTHER')),
  duration_ms integer CHECK (duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 600000)),
  sample_rate integer,
  channels integer CHECK (channels IS NULL OR channels >= 1),
  byte_size bigint NOT NULL DEFAULT 0 CHECK (byte_size >= 0 AND byte_size <= 104857600),
  storage_key text NOT NULL,
  content_hash text,
  source_version integer NOT NULL DEFAULT 1 CHECK (source_version >= 1),
  replaces_asset_id uuid REFERENCES audio_assets (id),
  youtube_video_id varchar(16),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_type = 'CATALOG' OR owner_user_id IS NOT NULL)
);

CREATE TABLE waveforms (
  asset_id uuid PRIMARY KEY REFERENCES audio_assets (id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  bucket_count integer NOT NULL CHECK (bucket_count >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_tracks (
  id uuid PRIMARY KEY,
  title varchar(300) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  artist_id uuid NOT NULL REFERENCES artists (id),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  style_category_id uuid REFERENCES music_categories (id),
  mood_category_id uuid REFERENCES music_categories (id),
  language_category_id uuid REFERENCES music_categories (id),
  vocal_type varchar(16) NOT NULL CHECK (vocal_type IN ('VOCAL', 'INSTRUMENTAL', 'MIXED')),
  source_note varchar(2000),
  usage_permission varchar(32) NOT NULL CHECK (usage_permission IN ('PREVIEW_ALLOWED', 'METADATA_ONLY', 'RESTRICTED')),
  publish_state varchar(16) NOT NULL CHECK (publish_state IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED')),
  audio_asset_id uuid REFERENCES audio_assets (id),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_track_stages (
  track_id uuid NOT NULL REFERENCES catalog_tracks (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES music_categories (id),
  PRIMARY KEY (track_id, category_id)
);

CREATE TABLE catalog_track_tags (
  track_id uuid NOT NULL REFERENCES catalog_tracks (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags (id),
  PRIMARY KEY (track_id, tag_id)
);

CREATE TABLE audio_revisions (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES audio_assets (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  trim_start_ms integer NOT NULL CHECK (trim_start_ms >= 0),
  trim_end_ms integer NOT NULL,
  fade_in_ms integer NOT NULL CHECK (fade_in_ms BETWEEN 0 AND 10000),
  fade_out_ms integer NOT NULL CHECK (fade_out_ms BETWEEN 0 AND 10000),
  gain_db numeric(5, 2) NOT NULL DEFAULT 0 CHECK (gain_db BETWEEN -24 AND 6),
  processing_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (trim_end_ms > trim_start_ms),
  CHECK (trim_end_ms - trim_start_ms >= 1000)
);

CREATE TABLE upload_jobs (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  asset_id uuid REFERENCES audio_assets (id) ON DELETE SET NULL,
  state varchar(16) NOT NULL CHECK (state IN ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED')),
  error_code text,
  temp_storage_key text,
  idempotency_key varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key)
);

CREATE TABLE youtube_import_jobs (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  video_id varchar(80) NOT NULL,
  original_url varchar(2000) NOT NULL,
  state varchar(32) NOT NULL CHECK (state IN (
    'PENDING', 'FETCHING_METADATA', 'AWAITING_IMPORT', 'DOWNLOADING', 'EXTRACTING_AUDIO',
    'GENERATING_WAVEFORM', 'READY_FOR_EDITING', 'FAILED', 'CANCELLED'
  )),
  acquisition_state varchar(16) NOT NULL CHECK (acquisition_state IN ('AVAILABLE', 'BLOCKED', 'UNAVAILABLE')),
  title text,
  channel_name text,
  thumbnail_url text,
  duration_ms integer,
  asset_id uuid REFERENCES audio_assets (id) ON DELETE SET NULL,
  error_code text,
  idempotency_key varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key)
);

CREATE TABLE export_artifacts (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES audio_revisions (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  state varchar(16) NOT NULL CHECK (state IN ('QUEUED', 'PROCESSING', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_code text,
  storage_key text,
  duration_ms integer,
  idempotency_key varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key)
);

CREATE TABLE playlists (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name varchar(160) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  description varchar(4000),
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE playlist_items (
  id uuid PRIMARY KEY,
  playlist_id uuid NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES audio_revisions (id) ON DELETE RESTRICT,
  note varchar(1000),
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE (playlist_id, position)
);

CREATE TABLE wedding_plans (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name varchar(160) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  wedding_date date,
  location varchar(240),
  time_zone varchar(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  notes varchar(8000),
  state varchar(16) NOT NULL CHECK (state IN ('DRAFT', 'READY', 'NEEDS_REVIEW', 'ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  listening_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wedding_stages (
  id uuid PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES wedding_plans (id) ON DELETE CASCADE,
  name varchar(160) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  description varchar(4000),
  approximate_time varchar(80),
  estimated_duration_ms integer CHECK (estimated_duration_ms IS NULL OR estimated_duration_ms >= 0),
  status varchar(16) NOT NULL CHECK (status IN ('MUSIC_REQUIRED', 'NO_MUSIC', 'SKIPPED')),
  position integer NOT NULL CHECK (position >= 0),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (plan_id, position)
);

CREATE TABLE music_cues (
  id uuid PRIMARY KEY,
  stage_id uuid NOT NULL REFERENCES wedding_stages (id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES audio_revisions (id) ON DELETE RESTRICT,
  instruction varchar(2000),
  responsible_person varchar(120),
  advisory_timing varchar(200),
  position integer NOT NULL CHECK (position >= 0),
  listening_approved_at timestamptz,
  playlist_item_id uuid,
  source_playlist_id uuid,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (stage_id, position)
);

CREATE TABLE handoff_packages (
  id uuid PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES wedding_plans (id) ON DELETE CASCADE,
  plan_version integer NOT NULL,
  state varchar(16) NOT NULL CHECK (state IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  storage_key text,
  is_outdated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE administrative_audit_logs (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES users (id),
  action varchar(80) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id uuid NOT NULL,
  summary varchar(1000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_records (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key varchar(200) NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX catalog_tracks_publish_idx ON catalog_tracks (publish_state);
CREATE INDEX audio_assets_owner_idx ON audio_assets (owner_user_id);
CREATE INDEX export_artifacts_owner_state_idx ON export_artifacts (owner_user_id, state);

--changeset wedding:002-catalog-seed
INSERT INTO music_categories (id, kind, name_vi, slug, sort_order) VALUES
  ('10000000-0000-4000-8000-000000000001', 'CEREMONY', 'Đón khách', 'don-khach', 1),
  ('10000000-0000-4000-8000-000000000002', 'CEREMONY', 'Giới thiệu lễ', 'gioi-thieu-le', 2),
  ('10000000-0000-4000-8000-000000000003', 'CEREMONY', 'Lối vào cô dâu', 'loi-vao-co-dau', 3),
  ('10000000-0000-4000-8000-000000000004', 'CEREMONY', 'Lối vào chú rể', 'loi-vao-chu-re', 4),
  ('10000000-0000-4000-8000-000000000005', 'CEREMONY', 'Nghi lễ gia tiên', 'nghi-le-gia-tien', 5),
  ('10000000-0000-4000-8000-000000000006', 'CEREMONY', 'Trao nhẫn', 'trao-nhan', 6),
  ('10000000-0000-4000-8000-000000000007', 'CEREMONY', 'Cắt bánh', 'cat-banh', 7),
  ('10000000-0000-4000-8000-000000000008', 'CEREMONY', 'Nâng ly', 'nang-ly', 8),
  ('10000000-0000-4000-8000-000000000009', 'CEREMONY', 'Tiệc cưới', 'tiec-cuoi', 9),
  ('10000000-0000-4000-8000-000000000010', 'CEREMONY', 'Nhạc nền', 'nhac-nen', 10),
  ('10000000-0000-4000-8000-000000000011', 'CEREMONY', 'Tiễn khách', 'tien-khach', 11),
  ('10000000-0000-4000-8000-000000000021', 'MOOD', 'Trang trọng', 'trang-trong', 1),
  ('10000000-0000-4000-8000-000000000022', 'MOOD', 'Êm đềm', 'em-dem', 2),
  ('10000000-0000-4000-8000-000000000031', 'STYLE', 'Nhạc hòa tấu', 'hoa-tau', 1),
  ('10000000-0000-4000-8000-000000000032', 'STYLE', 'Nhạc acoustic', 'acoustic', 2),
  ('10000000-0000-4000-8000-000000000041', 'LANGUAGE', 'Tiếng Việt', 'tieng-viet', 1),
  ('10000000-0000-4000-8000-000000000042', 'LANGUAGE', 'Không lời', 'khong-loi', 2);

INSERT INTO artists (id, name) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Biên tập Wedding Music Planner');

INSERT INTO tags (id, name) VALUES
  ('30000000-0000-4000-8000-000000000001', 'mẫu');

INSERT INTO catalog_tracks (
  id, title, artist_id, duration_ms, style_category_id, mood_category_id, language_category_id,
  vocal_type, source_note, usage_permission, publish_state
) VALUES
  (
    '40000000-0000-4000-8000-000000000001',
    'Mẫu khúc đón khách',
    '20000000-0000-4000-8000-000000000001',
    NULL,
    '10000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000022',
    '10000000-0000-4000-8000-000000000042',
    'INSTRUMENTAL',
    'Mục lục mẫu, chưa gắn tệp nghe.',
    'METADATA_ONLY',
    'PUBLISHED'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'Mẫu bản nháp chưa xuất bản',
    '20000000-0000-4000-8000-000000000001',
    NULL,
    NULL,
    NULL,
    NULL,
    'VOCAL',
    'Không được hiện công khai.',
    'METADATA_ONLY',
    'DRAFT'
  );

INSERT INTO catalog_track_stages (track_id, category_id) VALUES
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

INSERT INTO catalog_track_tags (track_id, tag_id) VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001');

--changeset wedding:003-upload-filename
ALTER TABLE upload_jobs ADD COLUMN original_filename varchar(255);

--changeset wedding:004-artifact-bytes-and-audit-actor
ALTER TABLE export_artifacts ADD COLUMN byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0);
ALTER TABLE handoff_packages ADD COLUMN byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0);
ALTER TABLE administrative_audit_logs ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE administrative_audit_logs DROP CONSTRAINT administrative_audit_logs_actor_user_id_fkey;
ALTER TABLE administrative_audit_logs ADD CONSTRAINT administrative_audit_logs_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL;

--changeset wedding:005-one-active-export-per-user
CREATE UNIQUE INDEX export_artifacts_one_active_per_owner_idx
  ON export_artifacts (owner_user_id) WHERE state IN ('PROCESSING', 'VERIFYING');

--changeset wedding:006-catalog-library-copy
ALTER TABLE audio_assets
  ADD COLUMN catalog_track_id uuid REFERENCES catalog_tracks (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX audio_assets_owner_catalog_track_idx
  ON audio_assets (owner_user_id, catalog_track_id)
  WHERE owner_user_id IS NOT NULL AND catalog_track_id IS NOT NULL;

--changeset wedding:007-revision-name
ALTER TABLE audio_revisions ADD COLUMN name varchar(120);

--changeset wedding:008-catalog-track-duration-backfill
UPDATE catalog_tracks t SET duration_ms = a.duration_ms
FROM audio_assets a
WHERE a.id = t.audio_asset_id AND t.duration_ms IS NULL AND a.duration_ms IS NOT NULL;

--changeset wedding:009-temporary-audio-sessions
CREATE TABLE audio_edit_sessions (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  state varchar(32) NOT NULL CHECK (state IN (
    'CREATED', 'FETCHING_METADATA', 'IMPORTING_AUDIO', 'CONVERTING_AUDIO',
    'GENERATING_WAVEFORM', 'READY', 'EXPORTING', 'FAILED', 'EXPIRED'
  )),
  source_kind varchar(16) NOT NULL CHECK (source_kind IN ('YOUTUBE', 'UPLOAD', 'FIXTURE', 'NONE')),
  title text,
  channel_name text,
  thumbnail_url text,
  source_url text,
  video_id varchar(16),
  error_code varchar(64),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms > 0),
  audio_key text,
  waveform_key text,
  edits jsonb NOT NULL DEFAULT '{"segments":[],"fadeInMs":0,"fadeOutMs":0,"gainDb":0}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX audio_edit_sessions_expires_idx ON audio_edit_sessions (expires_at);

CREATE TABLE audio_session_exports (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES audio_edit_sessions (id) ON DELETE CASCADE,
  state varchar(16) NOT NULL CHECK (state IN ('EXPORTING', 'COMPLETED', 'FAILED')),
  storage_key text,
  duration_ms integer,
  error_code varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);
