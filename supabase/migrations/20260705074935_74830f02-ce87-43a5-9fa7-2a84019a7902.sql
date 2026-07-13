
CREATE TABLE public.webinar_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  firm_name TEXT,
  bar_license TEXT,
  webinar_1 BOOLEAN NOT NULL DEFAULT true,
  webinar_2 BOOLEAN NOT NULL DEFAULT true,
  interested_core BOOLEAN NOT NULL DEFAULT false,
  interested_premium BOOLEAN NOT NULL DEFAULT false,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.webinar_registrations TO anon;
GRANT INSERT ON public.webinar_registrations TO authenticated;
GRANT ALL ON public.webinar_registrations TO service_role;

ALTER TABLE public.webinar_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can register"
  ON public.webinar_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
