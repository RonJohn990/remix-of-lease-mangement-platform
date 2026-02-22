
-- 1. Add new fields to entities table
ALTER TABLE public.entities
  ADD COLUMN address text NOT NULL DEFAULT '',
  ADD COLUMN location text NOT NULL DEFAULT '',
  ADD COLUMN pin_code text NOT NULL DEFAULT '',
  ADD COLUMN financial_year_start text NOT NULL DEFAULT '04-01',
  ADD COLUMN financial_year_end text NOT NULL DEFAULT '03-31';

-- 2. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'lease_creator', 'viewer');

-- 3. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Create user_entity_assignments (links users to groups/entities)
CREATE TABLE public.user_entity_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  corporate_id uuid REFERENCES public.corporate_groups(corporate_id) ON DELETE CASCADE NOT NULL,
  entity_id uuid REFERENCES public.entities(entity_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, corporate_id, entity_id)
);
ALTER TABLE public.user_entity_assignments ENABLE ROW LEVEL SECURITY;

-- 6. Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

CREATE OR REPLACE FUNCTION public.has_entity_access(_user_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_entity_assignments
    WHERE user_id = _user_id AND entity_id = _entity_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_group_access(_user_id uuid, _corporate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_entity_assignments
    WHERE user_id = _user_id AND corporate_id = _corporate_id
  )
$$;

-- 7. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. RLS Policies

-- Profiles: users see own, admins see all
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR auth.uid() = user_id);

-- User roles: only admins
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- User entity assignments: only admins manage, users can view own
CREATE POLICY "Admins manage assignments" ON public.user_entity_assignments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users view own assignments" ON public.user_entity_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Drop old permissive policies on existing tables
DROP POLICY IF EXISTS "Allow full access to corporate_groups" ON public.corporate_groups;
DROP POLICY IF EXISTS "Allow full access to entities" ON public.entities;
DROP POLICY IF EXISTS "Allow full access to leases" ON public.leases;

-- Corporate groups: admins full access, others see assigned
CREATE POLICY "Admins manage groups" ON public.corporate_groups
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users view assigned groups" ON public.corporate_groups
  FOR SELECT TO authenticated
  USING (public.has_group_access(auth.uid(), corporate_id));

-- Entities: admins full access, others see assigned
CREATE POLICY "Admins manage entities" ON public.entities
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users view assigned entities" ON public.entities
  FOR SELECT TO authenticated
  USING (public.has_entity_access(auth.uid(), entity_id));

-- Leases: admins full, lease_creators CRUD on assigned entities, viewers read assigned
CREATE POLICY "Admins manage leases" ON public.leases
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Lease creators manage assigned leases" ON public.leases
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'lease_creator')
    AND public.has_entity_access(auth.uid(), entity_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'lease_creator')
    AND public.has_entity_access(auth.uid(), entity_id)
  );

CREATE POLICY "Viewers read assigned leases" ON public.leases
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'viewer')
    AND public.has_entity_access(auth.uid(), entity_id)
  );
