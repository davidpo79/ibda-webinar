CREATE POLICY "No direct client access to takbull payment orders"
ON public.takbull_payment_orders
FOR ALL
USING (false)
WITH CHECK (false);