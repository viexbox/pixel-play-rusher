-- Fotos de perfil personalizadas (JPEG o PNG ya reducidas por el navegador; máximo 60 KB cada una)
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id    TEXT PRIMARY KEY,
  mime       TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png')),
  data       BYTEA NOT NULL CHECK (octet_length(data) <= 60000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
