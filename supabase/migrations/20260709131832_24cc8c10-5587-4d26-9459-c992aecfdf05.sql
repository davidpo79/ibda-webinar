CREATE TABLE IF NOT EXISTS public.takbull_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uniq_id text UNIQUE NOT NULL,
  order_reference text UNIQUE NOT NULL,
  email text NOT NULL,
  package_id text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.takbull_payment_orders TO service_role;

ALTER TABLE public.takbull_payment_orders ENABLE ROW LEVEL SECURITY;