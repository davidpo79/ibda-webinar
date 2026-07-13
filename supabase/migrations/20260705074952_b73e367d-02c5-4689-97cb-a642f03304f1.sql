
DROP POLICY "Anyone can register" ON public.webinar_registrations;

CREATE POLICY "Anyone can register with valid data"
  ON public.webinar_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(trim(full_name)) BETWEEN 2 AND 100
    AND length(trim(phone)) BETWEEN 6 AND 20
    AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    AND length(email) <= 255
  );
