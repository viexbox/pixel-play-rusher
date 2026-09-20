-- Mercado v2: colores comerciables, fecha de obtención del objeto (para el bloqueo de 24 h) y consulta de precios recientes
ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_item_type_check;
ALTER TABLE market_listings ADD CONSTRAINT market_listings_item_type_check CHECK (item_type IN ('wskin', 'kskin', 'banner', 'color'));
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS obtained_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS market_sales_recent ON market_sales (created_at DESC);
