-- [EVOLUTIVAS] Armas evolutivas: nuevo tipo de objeto en el inventario y su nivel y fichas por jugador.
ALTER TABLE bp_inventory DROP CONSTRAINT IF EXISTS bp_inventory_item_type_check;
ALTER TABLE bp_inventory ADD CONSTRAINT bp_inventory_item_type_check CHECK (item_type IN ('wskin', 'kskin', 'banner', 'pet', 'avatar', 'outfit', 'evo'));
CREATE TABLE IF NOT EXISTS bp_evo (
  user_id    TEXT NOT NULL,
  skin_id    TEXT NOT NULL,
  level      INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  tokens     INTEGER NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  kills      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skin_id)
);
