-- Sumit replaces Takbull as the payment gateway. New order-tracking table;
-- the old takbull_payment_orders table is left in place (historical data)
-- but is no longer written to.
CREATE TABLE IF NOT EXISTS public.sumit_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference text UNIQUE NOT NULL,
  transaction_id text,
  email text NOT NULL,
  package_id text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.sumit_payment_orders TO service_role;

ALTER TABLE public.sumit_payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to sumit payment orders"
ON public.sumit_payment_orders
FOR ALL
USING (false)
WITH CHECK (false);
