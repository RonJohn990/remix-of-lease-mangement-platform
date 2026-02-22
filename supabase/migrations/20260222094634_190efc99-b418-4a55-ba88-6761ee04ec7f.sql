
-- Create workflow_roles table for custom roles used in future workflows
CREATE TABLE public.workflow_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workflow_roles ENABLE ROW LEVEL SECURITY;

-- Admins can manage workflow roles
CREATE POLICY "Admins manage workflow roles"
ON public.workflow_roles
FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- All authenticated users can view workflow roles
CREATE POLICY "Authenticated users can view workflow roles"
ON public.workflow_roles
FOR SELECT
USING (true);
