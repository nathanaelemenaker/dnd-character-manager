-- Drop existing FK and re-add with ON DELETE CASCADE
ALTER TABLE "InventoryItem" DROP CONSTRAINT IF EXISTS "InventoryItem_itemDefId_fkey";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemDefId_fkey"
  FOREIGN KEY ("itemDefId") REFERENCES "ItemDefinition"(id) ON DELETE CASCADE ON UPDATE CASCADE;
