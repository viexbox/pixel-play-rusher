-- Documentos de la aplicación (cuentas, panel de administración, clasificación…): sustituyen a los archivos JSON cuando hay PostgreSQL.
CREATE TABLE IF NOT EXISTS app_docs (
  name       TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pase de batalla: progreso de cada usuario en cada temporada.
CREATE TABLE IF NOT EXISTS bp_progress (
  user_id    INTEGER NOT NULL,
  season     INTEGER NOT NULL,
  xp         INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level      INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 50),
  vip        BOOLEAN NOT NULL DEFAULT FALSE,
  vip_since  TIMESTAMPTZ,
  gifted_by  TEXT,
  xp_day     DATE,
  xp_today   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season)
);

-- Recompensas reclamadas (una fila por nivel y fila del pase: nunca se reclama dos veces).
CREATE TABLE IF NOT EXISTS bp_claims (
  user_id    INTEGER NOT NULL,
  season     INTEGER NOT NULL,
  level      INTEGER NOT NULL CHECK (level BETWEEN 1 AND 50),
  track      TEXT NOT NULL CHECK (track IN ('free', 'vip')),
  item_type  TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season, level, track)
);

-- Objetos que posee el usuario (skins de armas y de cuchillos, banners).
CREATE TABLE IF NOT EXISTS bp_inventory (
  user_id     INTEGER NOT NULL,
  item_type   TEXT NOT NULL CHECK (item_type IN ('wskin', 'kskin', 'banner')),
  item_id     TEXT NOT NULL,
  source      TEXT NOT NULL,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_id)
);

-- Qué lleva puesto: 'weapon:<id arma>', 'knife' o 'banner'.
CREATE TABLE IF NOT EXISTS bp_equipped (
  user_id INTEGER NOT NULL,
  slot    TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
);

-- Regalos de pase VIP (registro de auditoría).
CREATE TABLE IF NOT EXISTS bp_gifts (
  id         BIGSERIAL PRIMARY KEY,
  from_user  INTEGER NOT NULL,
  to_user    INTEGER NOT NULL,
  season     INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bp_claims_user ON bp_claims (user_id, season);
CREATE INDEX IF NOT EXISTS bp_gifts_to ON bp_gifts (to_user);
