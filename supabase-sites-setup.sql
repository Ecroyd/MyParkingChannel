-- Create sites table for tenant site system
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert test site
INSERT INTO public.sites (name, slug)
VALUES ('Test Site', 'testsite')
ON CONFLICT (slug) DO NOTHING;

-- Insert another test site
INSERT INTO public.sites (name, slug)
VALUES ('Demo Site', 'demo')
ON CONFLICT (slug) DO NOTHING;

-- Enable RLS
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Allow public read access" ON public.sites
FOR SELECT USING (true);
