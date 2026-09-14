-- Track where an order came from so we can meter online-website orders
-- (Free-tier monthly cap). NULL = dine-in / cashier POS; "web" = online site.
-- Idempotent: safe to run more than once.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS "source" text;

-- Helps the monthly online-order count stay fast.
CREATE INDEX IF NOT EXISTS orders_restaurant_source_created_idx
  ON orders ("restaurantId", "source", "createdAt");
