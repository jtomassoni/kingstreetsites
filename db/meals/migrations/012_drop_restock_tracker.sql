-- Remove Restock Tracker tables. 011 created them; the tool is gone.

DROP TABLE IF EXISTS public.restock_alerts CASCADE;
DROP TABLE IF EXISTS public.restock_stock_events CASCADE;
DROP TABLE IF EXISTS public.restock_store_state CASCADE;
DROP TABLE IF EXISTS public.restock_checks CASCADE;
DROP TABLE IF EXISTS public.restock_products CASCADE;
DROP TABLE IF EXISTS public.restock_settings CASCADE;
