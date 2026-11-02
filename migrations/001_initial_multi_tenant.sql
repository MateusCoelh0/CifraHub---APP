-- Fundação multi-banda do CifraHub. O servidor atual continua usando data.json.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS band_members (
  band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ADMIN', 'MEMBER', 'VIEWER')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (band_id, user_id)
);
CREATE INDEX IF NOT EXISTS band_members_user_id_idx ON band_members(user_id);

CREATE TABLE IF NOT EXISTS songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  title text NOT NULL,
  artist text,
  musical_key text,
  tempo integer CHECK (tempo IS NULL OR tempo > 0),
  lyrics text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (band_id, id)
);
CREATE INDEX IF NOT EXISTS songs_band_title_idx ON songs(band_id, title);

CREATE TABLE IF NOT EXISTS playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (band_id, id)
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  band_id uuid NOT NULL,
  playlist_id uuid NOT NULL,
  song_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (playlist_id, position),
  UNIQUE (playlist_id, song_id),
  FOREIGN KEY (band_id, playlist_id) REFERENCES playlists(band_id, id) ON DELETE CASCADE,
  FOREIGN KEY (band_id, song_id) REFERENCES songs(band_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  playlist_id uuid,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'LIVE', 'ENDED')),
  state jsonb NOT NULL DEFAULT '{"currentSongId":null,"currentSongIndex":null,"transpose":0,"capo":0,"autoScrollSpeed":0,"isAutoScrolling":false,"scrollPosition":0,"stageMode":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  UNIQUE (band_id, id),
  FOREIGN KEY (band_id, playlist_id) REFERENCES playlists(band_id, id)
);
CREATE INDEX IF NOT EXISTS sessions_band_status_idx ON sessions(band_id, status);

CREATE TABLE IF NOT EXISTS session_members (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('HOST', 'MEMBER')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS session_members_user_id_idx ON session_members(user_id);

COMMIT;
