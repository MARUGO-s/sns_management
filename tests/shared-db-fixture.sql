CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(),
  last_sign_in_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}'
);
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
CREATE TABLE public.gourmet_fixture (id integer PRIMARY KEY, marker text);
INSERT INTO public.gourmet_fixture VALUES (1, 'preserve-gourmet');
INSERT INTO auth.users(id,email) VALUES
  ('00000000-0000-4000-8000-000000000001','gourmet@example.invalid'),
  ('00000000-0000-4000-8000-000000000002','sns-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000003','sns-b@example.invalid');
