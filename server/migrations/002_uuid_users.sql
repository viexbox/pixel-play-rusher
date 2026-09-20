-- Las cuentas pasan a identificarse por un UUID permanente (texto) en vez de un número secuencial ligado al orden de registro.
-- Las filas de cuentas antiguas se reasignan al UUID nuevo al arrancar el servidor (server/battlepass.js → remapUsers).
ALTER TABLE bp_progress  ALTER COLUMN user_id   TYPE TEXT USING user_id::text;
ALTER TABLE bp_claims    ALTER COLUMN user_id   TYPE TEXT USING user_id::text;
ALTER TABLE bp_inventory ALTER COLUMN user_id   TYPE TEXT USING user_id::text;
ALTER TABLE bp_equipped  ALTER COLUMN user_id   TYPE TEXT USING user_id::text;
ALTER TABLE bp_gifts     ALTER COLUMN from_user TYPE TEXT USING from_user::text;
ALTER TABLE bp_gifts     ALTER COLUMN to_user   TYPE TEXT USING to_user::text;
