-- Trajes de personaje (tienda): nuevo tipo de objeto en el inventario.
ALTER TABLE bp_inventory DROP CONSTRAINT IF EXISTS bp_inventory_item_type_check;
ALTER TABLE bp_inventory ADD CONSTRAINT bp_inventory_item_type_check CHECK (item_type IN ('wskin', 'kskin', 'banner', 'pet', 'avatar', 'outfit'));
