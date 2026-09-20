-- Mercado de cosméticos entre jugadores (se paga con Créditos). Al anunciar un objeto sale del inventario y queda «en depósito» en el anuncio.
CREATE TABLE IF NOT EXISTS market_listings (
  id         BIGSERIAL PRIMARY KEY,
  seller     TEXT NOT NULL,
  item_type  TEXT NOT NULL CHECK (item_type IN ('wskin', 'kskin', 'banner')),
  item_id    TEXT NOT NULL,
  price      INTEGER NOT NULL CHECK (price > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_listings_seller ON market_listings (seller);
-- Registro de ventas (auditoría y precios de referencia)
CREATE TABLE IF NOT EXISTS market_sales (
  id         BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL,
  seller     TEXT NOT NULL,
  buyer      TEXT NOT NULL,
  item_type  TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  price      INTEGER NOT NULL CHECK (price > 0),
  fee        INTEGER NOT NULL CHECK (fee >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_sales_item ON market_sales (item_type, item_id, created_at DESC);
