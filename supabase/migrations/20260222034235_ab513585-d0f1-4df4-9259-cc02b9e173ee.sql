
-- Corporate Groups
CREATE TABLE public.corporate_groups (
  corporate_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corporate_group_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.corporate_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to corporate_groups" ON public.corporate_groups FOR ALL USING (true) WITH CHECK (true);

-- Entities
CREATE TABLE public.entities (
  entity_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corporate_id UUID NOT NULL REFERENCES public.corporate_groups(corporate_id) ON DELETE CASCADE,
  legal_entity_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to entities" ON public.entities FOR ALL USING (true) WITH CHECK (true);

-- Leases
CREATE TABLE public.leases (
  lease_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES public.entities(entity_id) ON DELETE CASCADE,
  legal_entity_name TEXT NOT NULL DEFAULT '',
  lease_version INTEGER NOT NULL DEFAULT 1,
  lease_event TEXT NOT NULL DEFAULT 'INITIAL',
  lease_name TEXT NOT NULL,
  vendor_name TEXT NOT NULL DEFAULT '',
  tagged_employee TEXT NOT NULL DEFAULT '',
  asset_unit TEXT NOT NULL DEFAULT '',
  concerned_person TEXT NOT NULL DEFAULT '',
  lease_comments TEXT NOT NULL DEFAULT '',
  payment_frequency TEXT NOT NULL DEFAULT 'Monthly',
  lease_type TEXT NOT NULL DEFAULT '',
  lease_start_date DATE NOT NULL,
  lease_end_date DATE NOT NULL,
  rent_commencement_date DATE NOT NULL,
  discount_rate_ibr NUMERIC NOT NULL DEFAULT 0,
  monthly_lease_amount NUMERIC NOT NULL DEFAULT 0,
  number_installments INTEGER NOT NULL DEFAULT 0,
  security_deposit NUMERIC NOT NULL DEFAULT 0,
  initial_direct_cost NUMERIC NOT NULL DEFAULT 0,
  short_term_flag BOOLEAN NOT NULL DEFAULT false,
  low_value_flag BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'Active',
  escalations JSONB NOT NULL DEFAULT '[]'::jsonb,
  modifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to leases" ON public.leases FOR ALL USING (true) WITH CHECK (true);
