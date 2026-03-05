BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS content_item (
  id               BIGINT PRIMARY KEY,
  md_id            BIGINT,
  tmdb_id          BIGINT,
  movie_id         VARCHAR(64) NOT NULL,
  type             SMALLINT NOT NULL,
  play_type        VARCHAR(32),
  tag              VARCHAR(64),
  title            TEXT NOT NULL,
  url              TEXT,
  img              TEXT,
  imdb_score       VARCHAR(16),
  "desc"           TEXT,
  release          VARCHAR(32),
  release_year     INT,
  genre            TEXT,
  "cast"           TEXT,
  duration         VARCHAR(32),
  country          TEXT,
  production       TEXT,
  last_season      INT,
  last_episode     INT,
  channels         JSONB NOT NULL DEFAULT '{}'::jsonb,
  cover_img        TEXT,
  genre_lang       TEXT,
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE content_item
  ADD COLUMN IF NOT EXISTS tag VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_item_movie_id_type
  ON content_item (movie_id, type);
CREATE INDEX IF NOT EXISTS idx_content_item_tmdb_id
  ON content_item (tmdb_id);
CREATE INDEX IF NOT EXISTS idx_content_item_release_year
  ON content_item (release_year DESC);
CREATE INDEX IF NOT EXISTS idx_content_item_tag
  ON content_item (tag);
CREATE INDEX IF NOT EXISTS idx_content_item_channels_gin
  ON content_item USING gin (channels);
CREATE INDEX IF NOT EXISTS idx_content_item_raw_gin
  ON content_item USING gin (raw);

UPDATE content_item
SET tag = NULLIF(BTRIM(raw->>'tag'), '')
WHERE (tag IS NULL OR BTRIM(tag) = '')
  AND raw ? 'tag';

DROP TRIGGER IF EXISTS trg_content_item_updated_at ON content_item;
CREATE TRIGGER trg_content_item_updated_at
BEFORE UPDATE ON content_item
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS tv_episode_item (
  id               BIGINT PRIMARY KEY,
  movie_id         VARCHAR(64) NOT NULL,
  season           VARCHAR(64) NOT NULL,
  episode          VARCHAR(255) NOT NULL,
  channels         JSONB NOT NULL DEFAULT '{}'::jsonb,
  position         INT,
  season_num       INT,
  episode_num      INT,
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tv_episode_movie_season_episode_num
  ON tv_episode_item (movie_id, season_num, episode_num);
CREATE INDEX IF NOT EXISTS idx_tv_episode_movie_id
  ON tv_episode_item (movie_id);
CREATE INDEX IF NOT EXISTS idx_tv_episode_channels_gin
  ON tv_episode_item USING gin (channels);

DROP TRIGGER IF EXISTS trg_tv_episode_item_updated_at ON tv_episode_item;
CREATE TRIGGER trg_tv_episode_item_updated_at
BEFORE UPDATE ON tv_episode_item
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS home_category_section (
  id               BIGSERIAL PRIMARY KEY,
  name             VARCHAR(128) NOT NULL,
  has_all          BOOLEAN NOT NULL DEFAULT FALSE,
  tags             JSONB NOT NULL DEFAULT '[]'::jsonb,
  ui_type          INT NOT NULL DEFAULT 1,
  sort_order       INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_home_category_section_name
  ON home_category_section (name);
CREATE INDEX IF NOT EXISTS idx_home_category_section_sort
  ON home_category_section (sort_order);

DROP TRIGGER IF EXISTS trg_home_category_section_updated_at ON home_category_section;
CREATE TRIGGER trg_home_category_section_updated_at
BEFORE UPDATE ON home_category_section
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS home_category_item (
  section_id        BIGINT NOT NULL REFERENCES home_category_section(id) ON DELETE CASCADE,
  content_id        BIGINT NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_home_category_item_section_sort
  ON home_category_item (section_id, sort_order);

DROP TRIGGER IF EXISTS trg_home_category_item_updated_at ON home_category_item;
CREATE TRIGGER trg_home_category_item_updated_at
BEFORE UPDATE ON home_category_item
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS home_banner_item (
  id               BIGSERIAL PRIMARY KEY,
  content_id       BIGINT REFERENCES content_item(id) ON DELETE SET NULL,
  sort_order       INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_banner_item_sort
  ON home_banner_item (sort_order);

DROP TRIGGER IF EXISTS trg_home_banner_item_updated_at ON home_banner_item;
CREATE TRIGGER trg_home_banner_item_updated_at
BEFORE UPDATE ON home_banner_item
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS provider_channel (
  id               BIGSERIAL PRIMARY KEY,
  name             VARCHAR(64) NOT NULL,
  img              TEXT NOT NULL,
  sort_order       INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_channel_name
  ON provider_channel (name);

DROP TRIGGER IF EXISTS trg_provider_channel_updated_at ON provider_channel;
CREATE TRIGGER trg_provider_channel_updated_at
BEFORE UPDATE ON provider_channel
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS provider_channel_item (
  channel_id        BIGINT NOT NULL REFERENCES provider_channel(id) ON DELETE CASCADE,
  content_id        BIGINT NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_channel_item_channel_sort
  ON provider_channel_item (channel_id, sort_order);

DROP TRIGGER IF EXISTS trg_provider_channel_item_updated_at ON provider_channel_item;
CREATE TRIGGER trg_provider_channel_item_updated_at
BEFORE UPDATE ON provider_channel_item
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS play_resolve_cache (
  id               BIGSERIAL PRIMARY KEY,
  line_url         TEXT NOT NULL,
  force            BOOLEAN NOT NULL DEFAULT FALSE,
  response_data    JSONB NOT NULL,
  expire_at        TIMESTAMPTZ,
  last_status      SMALLINT NOT NULL DEFAULT 1,
  error_msg        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_play_resolve_cache_line_url
  ON play_resolve_cache (line_url);
CREATE INDEX IF NOT EXISTS idx_play_resolve_cache_expire
  ON play_resolve_cache (expire_at);

DROP TRIGGER IF EXISTS trg_play_resolve_cache_updated_at ON play_resolve_cache;
CREATE TRIGGER trg_play_resolve_cache_updated_at
BEFORE UPDATE ON play_resolve_cache
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS upstream_resolve_cache (
  watch_url    TEXT PRIMARY KEY,
  files        JSONB NOT NULL,
  captions     JSONB NOT NULL,
  resolved_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upstream_resolve_cache_resolved_at
  ON upstream_resolve_cache (resolved_at);

-- App runtime configuration (managed via admin UI)
CREATE TABLE IF NOT EXISTS app_config (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure single config row exists
INSERT INTO app_config (id, data) VALUES (1, '{}') ON CONFLICT DO NOTHING;

COMMIT;
