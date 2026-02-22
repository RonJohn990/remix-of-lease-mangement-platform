
-- Lease Types master table
CREATE TABLE public.lease_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lease_type_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lease_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage lease types"
  ON public.lease_types FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view lease types"
  ON public.lease_types FOR SELECT
  TO authenticated
  USING (true);

-- Asset Locations master table
CREATE TABLE public.asset_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage asset locations"
  ON public.asset_locations FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view asset locations"
  ON public.asset_locations FOR SELECT
  TO authenticated
  USING (true);
