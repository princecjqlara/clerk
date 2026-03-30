-- AI Receptionist Admin Dashboard Schema

-- 1. Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nvidia_api_key TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_users INTEGER NOT NULL DEFAULT 5,
  custom_instructions TEXT DEFAULT '',
  business_phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tenant members
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- 4. Call logs
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL DEFAULT 'Unknown',
  caller_name TEXT DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  transcript JSONB DEFAULT '[]'::jsonb,
  message_taken TEXT DEFAULT '',
  ai_model_used TEXT DEFAULT 'meta/llama-3.1-8b-instruct',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('active', 'completed', 'missed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Usage stats
CREATE TABLE IF NOT EXISTS public.usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_calls INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_duration INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, date)
);

-- Add goal_config JSONB for storing AI config, ElevenLabs keys, etc.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS call_goal TEXT DEFAULT 'book' CHECK (call_goal IN ('book', 'order'));
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS goal_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS elevenlabs_keys JSONB DEFAULT '[]'::jsonb;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins full access profiles" ON public.profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Service role bypass profiles" ON public.profiles FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins full access tenants" ON public.tenants FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Members read own tenant" ON public.tenants FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = id AND tm.user_id = auth.uid() AND tm.is_active = true)
);
CREATE POLICY "Service role bypass tenants" ON public.tenants FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins full access tenant_members" ON public.tenant_members FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Service role bypass tenant_members" ON public.tenant_members FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins full access call_logs" ON public.call_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Members read own tenant calls" ON public.call_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = tenant_id AND tm.user_id = auth.uid())
);
CREATE POLICY "Service role bypass call_logs" ON public.call_logs FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins full access usage_stats" ON public.usage_stats FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Service role bypass usage_stats" ON public.usage_stats FOR ALL USING (auth.role() = 'service_role');

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
