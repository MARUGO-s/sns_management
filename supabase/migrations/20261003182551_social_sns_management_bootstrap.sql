-- SNS-only bootstrap for MARUGO-s/sns_management on the shared gourmet project.
-- Apply this ONE reviewed migration; never db push/reset against gourmet.
-- Existing gourmet tables, policies, Auth settings and Edge Functions are untouched.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND left(c.relname,7)='social_')
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='social_private')
    OR EXISTS (SELECT 1 FROM storage.buckets WHERE id='social-post-files') THEN
    RAISE EXCEPTION 'SNS namespace already exists; inspect before applying bootstrap';
  END IF;
END $$;

-- Adapted from Instatic TalksX 20260726102900_social_ops_storage.sql
create table if not exists public.social_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.social_workspace_members (
  workspace_id uuid not null references public.social_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.social_workspaces(id) on delete cascade,
  title text not null,
  body text not null default '',
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'failed')),
  owner_name text not null default '',
  format text not null default 'post',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_post_channels (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'tiktok', 'x', 'threads')),
  primary key (post_id, channel)
);

create table if not exists public.social_post_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.social_workspaces(id) on delete cascade,
  post_id uuid not null references public.social_posts(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check (file_size >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.social_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.social_workspaces(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'tiktok', 'x', 'threads')),
  app_id text not null default '',
  callback_url text not null default '',
  scopes text not null default '',
  status text not null default 'unconfigured' check (status in ('unconfigured', 'configured', 'needs_review')),
  secret_ref text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, channel)
);

create index if not exists social_posts_workspace_created_idx
  on public.social_posts (workspace_id, created_at desc);
create index if not exists social_posts_workspace_status_idx
  on public.social_posts (workspace_id, status, scheduled_at);
create index if not exists social_post_files_post_idx
  on public.social_post_files (post_id);

create or replace function public.is_social_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.social_workspaces w
    where w.id = target_workspace_id
      and w.created_by = (select auth.uid())
  )
  or exists (
    select 1
    from public.social_workspace_members m
    where m.workspace_id = target_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

alter table public.social_workspaces enable row level security;
alter table public.social_workspace_members enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_channels enable row level security;
alter table public.social_post_files enable row level security;
alter table public.social_integrations enable row level security;

create policy "workspace members can view workspaces"
  on public.social_workspaces for select to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.social_workspace_members m
      where m.workspace_id = id and m.user_id = (select auth.uid())
    )
  );

create policy "users can create workspaces"
  on public.social_workspaces for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "workspace owners can update workspaces"
  on public.social_workspaces for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "workspace owners can delete workspaces"
  on public.social_workspaces for delete to authenticated
  using (created_by = (select auth.uid()));

create policy "members can view their membership"
  on public.social_workspace_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.social_workspaces w
      where w.id = workspace_id and w.created_by = (select auth.uid())
    )
  );

create policy "workspace owners can manage members"
  on public.social_workspace_members for all to authenticated
  using (
    exists (
      select 1 from public.social_workspaces w
      where w.id = workspace_id and w.created_by = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.social_workspaces w
      where w.id = workspace_id and w.created_by = (select auth.uid())
    )
  );

create policy "workspace members can view posts"
  on public.social_posts for select to authenticated
  using (public.is_social_workspace_member(workspace_id));

create policy "workspace members can create posts"
  on public.social_posts for insert to authenticated
  with check (
    public.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "workspace members can update posts"
  on public.social_posts for update to authenticated
  using (public.is_social_workspace_member(workspace_id))
  with check (public.is_social_workspace_member(workspace_id));

create policy "workspace members can delete posts"
  on public.social_posts for delete to authenticated
  using (public.is_social_workspace_member(workspace_id));

create policy "workspace members can manage post channels"
  on public.social_post_channels for all to authenticated
  using (
    exists (
      select 1 from public.social_posts p
      where p.id = post_id and public.is_social_workspace_member(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.social_posts p
      where p.id = post_id and public.is_social_workspace_member(p.workspace_id)
    )
  );

create policy "workspace members can manage post files"
  on public.social_post_files for all to authenticated
  using (public.is_social_workspace_member(workspace_id))
  with check (
    public.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "workspace members can view integrations"
  on public.social_integrations for select to authenticated
  using (public.is_social_workspace_member(workspace_id));

create policy "workspace members can manage integrations"
  on public.social_integrations for all to authenticated
  using (public.is_social_workspace_member(workspace_id))
  with check (
    public.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

grant select, insert, update, delete on public.social_workspaces to authenticated;
grant select, insert, update, delete on public.social_workspace_members to authenticated;
grant select, insert, update, delete on public.social_posts to authenticated;
grant select, insert, update, delete on public.social_post_channels to authenticated;
grant select, insert, update, delete on public.social_post_files to authenticated;
grant select, insert, update, delete on public.social_integrations to authenticated;

insert into storage.buckets (id, name, public)
values ('social-post-files', 'social-post-files', false)
on conflict (id) do update set public = false;

create policy "workspace members can read post files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'social-post-files'
    and public.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  );

create policy "workspace members can upload post files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'social-post-files'
    and public.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  );

create policy "workspace members can update post files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'social-post-files'
    and public.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  )
  with check (
    bucket_id = 'social-post-files'
    and public.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  );

create policy "workspace members can delete post files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'social-post-files'
    and public.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  );

-- Adapted from Instatic TalksX 20260726103150_consolidate_social_rls_policies.sql
drop policy if exists "workspace members can view integrations" on public.social_integrations;
drop policy if exists "workspace members can manage integrations" on public.social_integrations;

create policy "workspace members can manage integrations"
  on public.social_integrations for all to authenticated
  using (public.is_social_workspace_member(workspace_id))
  with check (
    public.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

drop policy if exists "members can view their membership" on public.social_workspace_members;
drop policy if exists "workspace owners can manage members" on public.social_workspace_members;

create policy "members can view and owners can manage membership"
  on public.social_workspace_members for all to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.social_workspaces w
      where w.id = workspace_id and w.created_by = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.social_workspaces w
      where w.id = workspace_id and w.created_by = (select auth.uid())
    )
  );

-- Adapted from Instatic TalksX 20260726104635_secure_integration_secrets.sql
create table if not exists public.social_integration_secrets (
  integration_id uuid primary key
    references public.social_integrations(id) on delete cascade,
  client_secret text not null default '',
  access_token text not null default '',
  refresh_token text not null default '',
  webhook_secret text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.social_integration_secrets is
  'Server-only SNS credentials. Values are never returned to browser clients.';

alter table public.social_integration_secrets enable row level security;

revoke all on public.social_integration_secrets from anon, authenticated;
grant select, insert, update, delete on public.social_integration_secrets to service_role;

update storage.buckets
set file_size_limit = 20971520
where id = 'social-post-files';

-- Adapted from Instatic TalksX 20260726111630_fix_social_rls_recursion.sql
create schema if not exists social_private;

revoke all on schema social_private from public;
revoke all on schema social_private from anon;
grant usage on schema social_private to authenticated;

create or replace function social_private.is_social_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.social_workspaces w
    where w.id = target_workspace_id
      and w.created_by = (select auth.uid())
  );
$$;

create or replace function social_private.is_social_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select social_private.is_social_workspace_owner(target_workspace_id)
  or exists (
    select 1
    from public.social_workspace_members m
    where m.workspace_id = target_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function social_private.is_social_workspace_owner(uuid) from public;
revoke all on function social_private.is_social_workspace_owner(uuid) from anon;
revoke all on function social_private.is_social_workspace_member(uuid) from public;
revoke all on function social_private.is_social_workspace_member(uuid) from anon;
grant execute on function social_private.is_social_workspace_owner(uuid) to authenticated;
grant execute on function social_private.is_social_workspace_member(uuid) to authenticated;

drop policy if exists "workspace members can view workspaces" on public.social_workspaces;
create policy "workspace members can view workspaces"
  on public.social_workspaces for select to authenticated
  using (social_private.is_social_workspace_member(id));

drop policy if exists "members can view and owners can manage membership"
  on public.social_workspace_members;
drop policy if exists "members can view their membership"
  on public.social_workspace_members;
drop policy if exists "workspace owners can manage members"
  on public.social_workspace_members;

create policy "workspace members can view membership"
  on public.social_workspace_members for select to authenticated
  using (social_private.is_social_workspace_member(workspace_id));

create policy "workspace owners can add members"
  on public.social_workspace_members for insert to authenticated
  with check (social_private.is_social_workspace_owner(workspace_id));

create policy "workspace owners can update members"
  on public.social_workspace_members for update to authenticated
  using (social_private.is_social_workspace_owner(workspace_id))
  with check (social_private.is_social_workspace_owner(workspace_id));

create policy "workspace owners can remove members"
  on public.social_workspace_members for delete to authenticated
  using (social_private.is_social_workspace_owner(workspace_id));

drop policy if exists "workspace members can view posts" on public.social_posts;
create policy "workspace members can view posts"
  on public.social_posts for select to authenticated
  using (social_private.is_social_workspace_member(workspace_id));

drop policy if exists "workspace members can create posts" on public.social_posts;
create policy "workspace members can create posts"
  on public.social_posts for insert to authenticated
  with check (
    social_private.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

drop policy if exists "workspace members can update posts" on public.social_posts;
create policy "workspace members can update posts"
  on public.social_posts for update to authenticated
  using (social_private.is_social_workspace_member(workspace_id))
  with check (social_private.is_social_workspace_member(workspace_id));

drop policy if exists "workspace members can delete posts" on public.social_posts;
create policy "workspace members can delete posts"
  on public.social_posts for delete to authenticated
  using (social_private.is_social_workspace_member(workspace_id));

drop policy if exists "workspace members can manage post channels"
  on public.social_post_channels;
create policy "workspace members can manage post channels"
  on public.social_post_channels for all to authenticated
  using (
    exists (
      select 1
      from public.social_posts p
      where p.id = post_id
        and social_private.is_social_workspace_member(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.social_posts p
      where p.id = post_id
        and social_private.is_social_workspace_member(p.workspace_id)
    )
  );

drop policy if exists "workspace members can manage post files"
  on public.social_post_files;
create policy "workspace members can manage post files"
  on public.social_post_files for all to authenticated
  using (social_private.is_social_workspace_member(workspace_id))
  with check (
    social_private.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

drop policy if exists "workspace members can view integrations"
  on public.social_integrations;
drop policy if exists "workspace members can manage integrations"
  on public.social_integrations;
create policy "workspace members can manage integrations"
  on public.social_integrations for all to authenticated
  using (social_private.is_social_workspace_member(workspace_id))
  with check (
    social_private.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

drop policy if exists "workspace members can read post files" on storage.objects;
create policy "workspace members can read post files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'social-post-files'
    and social_private.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "workspace members can upload post files" on storage.objects;
create policy "workspace members can upload post files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'social-post-files'
    and social_private.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "workspace members can update post files" on storage.objects;
create policy "workspace members can update post files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'social-post-files'
    and social_private.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  )
  with check (
    bucket_id = 'social-post-files'
    and social_private.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "workspace members can delete post files" on storage.objects;
create policy "workspace members can delete post files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'social-post-files'
    and social_private.is_social_workspace_member((split_part(name, '/', 1))::uuid)
  );

drop function if exists public.is_social_workspace_member(uuid);

-- Adapted from Instatic TalksX 20260726114941_allow_workspace_owner_returning.sql
drop policy if exists "workspace members can view workspaces"
  on public.social_workspaces;

create policy "workspace members can view workspaces"
  on public.social_workspaces for select to authenticated
  using (
    created_by = (select auth.uid())
    or social_private.is_social_workspace_member(id)
  );

-- Adapted from Instatic TalksX 20260726121622_add_social_admin_console.sql
create table public.social_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

comment on table public.social_admin_users is
  'Application-wide administrators. Membership is managed outside browser clients.';

create table public.social_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  created_at timestamptz not null,
  last_sign_in_at timestamptz
);

comment on table public.social_user_profiles is
  'Admin-readable directory synchronized from auth.users without exposing the auth schema.';

create table public.social_audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid,
  actor_user_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  entity_type text not null,
  entity_id uuid,
  label text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.social_audit_logs is
  'Administrative activity log. Post bodies and integration secrets are intentionally excluded.';

create index social_audit_logs_created_idx
  on public.social_audit_logs (created_at desc);
create index social_audit_logs_workspace_idx
  on public.social_audit_logs (workspace_id, created_at desc);
create index social_audit_logs_actor_idx
  on public.social_audit_logs (actor_user_id, created_at desc);

alter table public.social_admin_users enable row level security;
alter table public.social_user_profiles enable row level security;
alter table public.social_audit_logs enable row level security;

create or replace function social_private.is_social_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.social_admin_users administrator
    where administrator.user_id = (select auth.uid())
  );
$$;

revoke all on function social_private.is_social_admin() from public;
revoke all on function social_private.is_social_admin() from anon;
grant execute on function social_private.is_social_admin() to authenticated;

create policy "users can check their administrator access"
  on public.social_admin_users for select to authenticated
  using (user_id = (select auth.uid()));

create policy "administrators can view user profiles"
  on public.social_user_profiles for select to authenticated
  using ((select social_private.is_social_admin()));

create policy "administrators can view audit logs"
  on public.social_audit_logs for select to authenticated
  using ((select social_private.is_social_admin()));

create policy "administrators can view all workspaces"
  on public.social_workspaces for select to authenticated
  using ((select social_private.is_social_admin()));

create policy "administrators can view all memberships"
  on public.social_workspace_members for select to authenticated
  using ((select social_private.is_social_admin()));

create policy "administrators can view all posts"
  on public.social_posts for select to authenticated
  using ((select social_private.is_social_admin()));

create policy "administrators can update all posts"
  on public.social_posts for update to authenticated
  using ((select social_private.is_social_admin()))
  with check ((select social_private.is_social_admin()));

create policy "administrators can view all post channels"
  on public.social_post_channels for select to authenticated
  using ((select social_private.is_social_admin()));

create policy "administrators can view all post files"
  on public.social_post_files for select to authenticated
  using ((select social_private.is_social_admin()));

create policy "administrators can view all integrations"
  on public.social_integrations for select to authenticated
  using ((select social_private.is_social_admin()));

create policy "administrators can read all post file objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'social-post-files'
    and (select social_private.is_social_admin())
  );

grant select on public.social_admin_users to authenticated;
grant select on public.social_user_profiles to authenticated;
grant select on public.social_audit_logs to authenticated;
revoke all on public.social_admin_users from anon;
revoke all on public.social_user_profiles from anon;
revoke all on public.social_audit_logs from anon;

-- Shared Auth: do not copy gourmet users into the SNS directory.

create or replace function social_private.sync_social_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only synchronize users who explicitly opened the SNS application.
  if not exists (select 1 from public.social_user_profiles where user_id = new.id) then
    return new;
  end if;

  insert into public.social_user_profiles (
    user_id,
    email,
    created_at,
    last_sign_in_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    new.created_at,
    new.last_sign_in_at
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    created_at = excluded.created_at,
    last_sign_in_at = excluded.last_sign_in_at;

  return new;
end;
$$;

revoke all on function social_private.sync_social_user_profile() from public;
revoke all on function social_private.sync_social_user_profile() from anon;
revoke all on function social_private.sync_social_user_profile() from authenticated;

drop trigger if exists sync_social_user_profile on auth.users;
create trigger sync_social_user_profile
  after insert or update of email, last_sign_in_at on auth.users
  for each row execute function social_private.sync_social_user_profile();

create or replace function social_private.audit_social_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  audit_workspace_id uuid;
  audit_entity_id uuid;
  audit_label text;
  audit_metadata jsonb := '{}'::jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'social_post_channels' then
    select post.workspace_id
      into audit_workspace_id
      from public.social_posts post
      where post.id = (row_data ->> 'post_id')::uuid;
    audit_entity_id := (row_data ->> 'post_id')::uuid;
  else
    audit_workspace_id := nullif(row_data ->> 'workspace_id', '')::uuid;
    audit_entity_id := nullif(row_data ->> 'id', '')::uuid;
  end if;

  if tg_table_name = 'social_workspaces' then
    audit_workspace_id := nullif(row_data ->> 'id', '')::uuid;
    audit_metadata := jsonb_build_object('name', coalesce(row_data ->> 'name', ''));
  elsif tg_table_name = 'social_workspace_members' then
    audit_entity_id := nullif(row_data ->> 'user_id', '')::uuid;
    audit_metadata := jsonb_build_object('role', coalesce(row_data ->> 'role', ''));
  elsif tg_table_name = 'social_posts' then
    audit_metadata := jsonb_build_object(
      'status', coalesce(row_data ->> 'status', ''),
      'scheduled_at', row_data -> 'scheduled_at'
    );
  elsif tg_table_name = 'social_post_channels' then
    audit_metadata := jsonb_build_object('channel', coalesce(row_data ->> 'channel', ''));
  elsif tg_table_name = 'social_post_files' then
    audit_metadata := jsonb_build_object(
      'content_type', coalesce(row_data ->> 'content_type', ''),
      'file_size', coalesce((row_data ->> 'file_size')::bigint, 0)
    );
  elsif tg_table_name = 'social_integrations' then
    audit_metadata := jsonb_build_object(
      'channel', coalesce(row_data ->> 'channel', ''),
      'status', coalesce(row_data ->> 'status', '')
    );
  end if;

  audit_label := coalesce(
    row_data ->> 'title',
    row_data ->> 'file_name',
    row_data ->> 'name',
    row_data ->> 'channel',
    row_data ->> 'role',
    ''
  );

  insert into public.social_audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    label,
    metadata
  )
  values (
    audit_workspace_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    audit_entity_id,
    audit_label,
    audit_metadata
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function social_private.audit_social_change() from public;
revoke all on function social_private.audit_social_change() from anon;
revoke all on function social_private.audit_social_change() from authenticated;

create trigger audit_social_workspaces
  after insert or update or delete on public.social_workspaces
  for each row execute function social_private.audit_social_change();

create trigger audit_social_workspace_members
  after insert or update or delete on public.social_workspace_members
  for each row execute function social_private.audit_social_change();

create trigger audit_social_posts
  after insert or update or delete on public.social_posts
  for each row execute function social_private.audit_social_change();

create trigger audit_social_post_channels
  after insert or update or delete on public.social_post_channels
  for each row execute function social_private.audit_social_change();

create trigger audit_social_post_files
  after insert or update or delete on public.social_post_files
  for each row execute function social_private.audit_social_change();

create trigger audit_social_integrations
  after insert or update or delete on public.social_integrations
  for each row execute function social_private.audit_social_change();

-- Adapted from Instatic TalksX 20260726122528_consolidate_social_admin_rls.sql
drop policy if exists "administrators can view all workspaces"
  on public.social_workspaces;
drop policy if exists "workspace members can view workspaces"
  on public.social_workspaces;
create policy "workspace members and administrators can view workspaces"
  on public.social_workspaces for select to authenticated
  using (
    created_by = (select auth.uid())
    or social_private.is_social_workspace_member(id)
    or (select social_private.is_social_admin())
  );

drop policy if exists "administrators can view all memberships"
  on public.social_workspace_members;
drop policy if exists "workspace members can view membership"
  on public.social_workspace_members;
create policy "workspace members and administrators can view membership"
  on public.social_workspace_members for select to authenticated
  using (
    social_private.is_social_workspace_member(workspace_id)
    or (select social_private.is_social_admin())
  );

drop policy if exists "administrators can view all posts"
  on public.social_posts;
drop policy if exists "workspace members can view posts"
  on public.social_posts;
create policy "workspace members and administrators can view posts"
  on public.social_posts for select to authenticated
  using (
    social_private.is_social_workspace_member(workspace_id)
    or (select social_private.is_social_admin())
  );

drop policy if exists "administrators can update all posts"
  on public.social_posts;
drop policy if exists "workspace members can update posts"
  on public.social_posts;
create policy "workspace members and administrators can update posts"
  on public.social_posts for update to authenticated
  using (
    social_private.is_social_workspace_member(workspace_id)
    or (select social_private.is_social_admin())
  )
  with check (
    social_private.is_social_workspace_member(workspace_id)
    or (select social_private.is_social_admin())
  );

drop policy if exists "administrators can view all post channels"
  on public.social_post_channels;
drop policy if exists "workspace members can manage post channels"
  on public.social_post_channels;

create policy "workspace members and administrators can view post channels"
  on public.social_post_channels for select to authenticated
  using (
    exists (
      select 1
      from public.social_posts post
      where post.id = post_id
        and social_private.is_social_workspace_member(post.workspace_id)
    )
    or (select social_private.is_social_admin())
  );

create policy "workspace members can add post channels"
  on public.social_post_channels for insert to authenticated
  with check (
    exists (
      select 1
      from public.social_posts post
      where post.id = post_id
        and social_private.is_social_workspace_member(post.workspace_id)
    )
  );

create policy "workspace members can update post channels"
  on public.social_post_channels for update to authenticated
  using (
    exists (
      select 1
      from public.social_posts post
      where post.id = post_id
        and social_private.is_social_workspace_member(post.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.social_posts post
      where post.id = post_id
        and social_private.is_social_workspace_member(post.workspace_id)
    )
  );

create policy "workspace members can remove post channels"
  on public.social_post_channels for delete to authenticated
  using (
    exists (
      select 1
      from public.social_posts post
      where post.id = post_id
        and social_private.is_social_workspace_member(post.workspace_id)
    )
  );

drop policy if exists "administrators can view all post files"
  on public.social_post_files;
drop policy if exists "workspace members can manage post files"
  on public.social_post_files;

create policy "workspace members and administrators can view post files"
  on public.social_post_files for select to authenticated
  using (
    social_private.is_social_workspace_member(workspace_id)
    or (select social_private.is_social_admin())
  );

create policy "workspace members can add post files"
  on public.social_post_files for insert to authenticated
  with check (
    social_private.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "workspace members can update post files"
  on public.social_post_files for update to authenticated
  using (social_private.is_social_workspace_member(workspace_id))
  with check (
    social_private.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "workspace members can remove post files"
  on public.social_post_files for delete to authenticated
  using (social_private.is_social_workspace_member(workspace_id));

drop policy if exists "administrators can view all integrations"
  on public.social_integrations;
drop policy if exists "workspace members can manage integrations"
  on public.social_integrations;

create policy "workspace members and administrators can view integrations"
  on public.social_integrations for select to authenticated
  using (
    social_private.is_social_workspace_member(workspace_id)
    or (select social_private.is_social_admin())
  );

create policy "workspace members can add integrations"
  on public.social_integrations for insert to authenticated
  with check (
    social_private.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "workspace members can update integrations"
  on public.social_integrations for update to authenticated
  using (social_private.is_social_workspace_member(workspace_id))
  with check (
    social_private.is_social_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "workspace members can remove integrations"
  on public.social_integrations for delete to authenticated
  using (social_private.is_social_workspace_member(workspace_id));

drop policy if exists "administrators can read all post file objects"
  on storage.objects;
drop policy if exists "workspace members can read post files"
  on storage.objects;
create policy "workspace members and administrators can read post files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'social-post-files'
    and (
      social_private.is_social_workspace_member((split_part(name, '/', 1))::uuid)
      or (select social_private.is_social_admin())
    )
  );

-- Adapted from Instatic TalksX 20260726124138_manage_social_administrators.sql
create or replace function social_private.can_remove_social_admin(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    social_private.is_social_admin()
    and exists (
      select 1
      from public.social_admin_users administrator
      where administrator.user_id = target_user_id
    )
    and (
      select count(*)
      from public.social_admin_users
    ) > 1;
$$;

revoke all on function social_private.can_remove_social_admin(uuid) from public;
revoke all on function social_private.can_remove_social_admin(uuid) from anon;
grant execute on function social_private.can_remove_social_admin(uuid) to authenticated;

drop policy if exists "users can check their administrator access"
  on public.social_admin_users;

create policy "users can check and administrators can view administrator access"
  on public.social_admin_users for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select social_private.is_social_admin())
  );

create policy "administrators can grant administrator access"
  on public.social_admin_users for insert to authenticated
  with check (
    (select social_private.is_social_admin())
    and granted_by = (select auth.uid())
  );

create policy "administrators can revoke administrator access"
  on public.social_admin_users for delete to authenticated
  using ((select social_private.can_remove_social_admin(user_id)));

grant select, insert, delete on public.social_admin_users to authenticated;
revoke update on public.social_admin_users from authenticated;

create or replace function social_private.audit_social_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  target_email text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  select profile.email
    into target_email
    from public.social_user_profiles profile
    where profile.user_id = (row_data ->> 'user_id')::uuid;

  insert into public.social_audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    label,
    metadata
  )
  values (
    (select auth.uid()),
    lower(tg_op),
    'social_admin_users',
    (row_data ->> 'user_id')::uuid,
    coalesce(target_email, '管理者アカウント'),
    jsonb_build_object('access', 'administrator')
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function social_private.audit_social_admin_change() from public;
revoke all on function social_private.audit_social_admin_change() from anon;
revoke all on function social_private.audit_social_admin_change() from authenticated;

drop trigger if exists audit_social_admin_users
  on public.social_admin_users;
create trigger audit_social_admin_users
  after insert or delete on public.social_admin_users
  for each row execute function social_private.audit_social_admin_change();

-- Adapted from Instatic TalksX 20260726130739_add_social_store_affiliation.sql
create table public.social_stores (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null unique,
  area text not null,
  sort_order integer not null unique check (sort_order > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.social_stores is
  'Public store directory used for account affiliation and workspace reporting.';

insert into public.social_stores (id, name, area, sort_order)
values
  ('marugo', 'マルゴ', '新宿', 1),
  ('marugo-second', 'マルゴ セカンド', '新宿', 2),
  ('marugo-grande', 'マルゴ グランデ', '新宿', 3),
  ('371-bar', 'サンナナイチ バル', '新宿', 4),
  ('xenlon-claudia', 'シェンロン&クラウディア', '新宿', 5),
  ('claudia2', 'クラウディア2', '新宿', 6),
  ('sauvage', 'ソバージュ', '新宿', 7),
  ('bar-pelota', 'バルぺロタ', '新宿', 8),
  ('trattoria-briccola', 'トラットリア ブリッコラ', '新宿', 9),
  ('violette', 'ヴィオレット', '新宿', 10),
  ('marugo-otto', 'マルゴ オット', '新宿', 11),
  ('donaiya-shinjuku', '元祖どないや 新宿三丁目店', '新宿', 12),
  ('marugo-yotsuya', 'マルゴ 四谷', '四谷・水道橋', 13),
  ('sushi-koruri', '鮨こるり', '四谷・水道橋', 14),
  ('bistro-cavacava', 'ビストロ サヴァサヴァ', '四谷・水道橋', 15),
  ('marugo-s', 'マルゴエス', '四谷・水道橋', 16),
  ('marugo-marunouchi', 'マルゴ丸の内', '丸の内', 17),
  ('yakiniku-marugo', '焼肉マルゴ', '丸の内', 18),
  ('erics-by-eric-trochon', 'エリックスバイエリックトロション', '丸の内', 19),
  ('mitan', 'ミタン', '丸の内', 20),
  ('marugo-shinbashi', 'マルゴ 新橋', '新橋', 21),
  ('marugo-d', 'マルゴ D', '愛知', 22),
  ('blu-nero', 'BLU NERO', '新店舗', 23);

alter table public.social_stores enable row level security;

create policy "anyone can view active social stores"
  on public.social_stores for select to anon
  using (is_active);

create policy "users can view active stores and administrators all stores"
  on public.social_stores for select to authenticated
  using (
    is_active
    or (select social_private.is_social_admin())
  );

grant select on public.social_stores to anon, authenticated;
revoke insert, update, delete on public.social_stores from anon, authenticated;

alter table public.social_workspaces
  add column store_id text references public.social_stores(id) on delete restrict;

alter table public.social_user_profiles
  add column store_id text references public.social_stores(id) on delete restrict;

comment on column public.social_workspaces.store_id is
  'Store represented by this workspace.';
comment on column public.social_user_profiles.store_id is
  'Canonical store affiliation selected during account onboarding.';

create index social_workspaces_store_idx
  on public.social_workspaces (store_id);
create index social_user_profiles_store_idx
  on public.social_user_profiles (store_id);

drop policy if exists "administrators can view user profiles"
  on public.social_user_profiles;

create policy "users can view own profile and administrators all profiles"
  on public.social_user_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select social_private.is_social_admin())
  );

create policy "users can set an unassigned store affiliation"
  on public.social_user_profiles for update to authenticated
  using (
    user_id = (select auth.uid())
    and store_id is null
  )
  with check (
    user_id = (select auth.uid())
    and store_id is not null
    and exists (
      select 1
      from public.social_stores store
      where store.id = store_id
        and store.is_active
    )
  );

grant update (store_id) on public.social_user_profiles to authenticated;

create or replace function social_private.sync_social_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_store_id text;
begin
  -- Only synchronize users who explicitly opened the SNS application.
  if not exists (select 1 from public.social_user_profiles where user_id = new.id) then
    return new;
  end if;

  select store.id
    into selected_store_id
    from public.social_stores store
    where store.id = nullif(new.raw_user_meta_data ->> 'social_store_id', '')
      and store.is_active
    limit 1;

  insert into public.social_user_profiles (
    user_id,
    email,
    created_at,
    last_sign_in_at,
    store_id
  )
  values (
    new.id,
    coalesce(new.email, ''),
    new.created_at,
    new.last_sign_in_at,
    selected_store_id
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    created_at = excluded.created_at,
    last_sign_in_at = excluded.last_sign_in_at,
    store_id = coalesce(
      public.social_user_profiles.store_id,
      excluded.store_id
    );

  return new;
end;
$$;

revoke all on function social_private.sync_social_user_profile() from public;
revoke all on function social_private.sync_social_user_profile() from anon;
revoke all on function social_private.sync_social_user_profile() from authenticated;

update public.social_user_profiles profile
set store_id = store.id
from auth.users auth_user
join public.social_stores store
  on store.id = nullif(
    auth_user.raw_user_meta_data ->> 'social_store_id',
    ''
  )
  and store.is_active
where profile.user_id = auth_user.id
  and profile.store_id is null;

-- Adapted from Instatic TalksX 20260726135609_add_social_media_processing.sql
update storage.buckets
set file_size_limit = 52428800
where id = 'social-post-files';

alter table public.social_post_files
  add column media_variant text not null default 'original'
    check (media_variant in ('original', 'processed')),
  add column generated_from_file_id uuid
    references public.social_post_files(id) on delete set null;

create index social_post_files_generated_from_idx
  on public.social_post_files (generated_from_file_id);

create table public.social_media_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.social_workspaces(id) on delete cascade,
  post_id uuid not null
    references public.social_posts(id) on delete cascade,
  source_file_id uuid not null
    references public.social_post_files(id) on delete restrict,
  output_file_id uuid
    references public.social_post_files(id) on delete set null,
  requested_by uuid not null
    references auth.users(id) on delete restrict,
  operation text not null default 'crop'
    check (operation = 'crop'),
  crop_config jsonb not null,
  status text not null default 'queued'
    check (
      status in (
        'queued',
        'processing',
        'completed',
        'failed',
        'cancelled'
      )
    ),
  provider_run_name text not null default '',
  output_storage_path text not null default '',
  error_code text not null default '',
  error_message text not null default '',
  attempts integer not null default 0 check (attempts >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    crop_config ->> 'aspect' in ('1:1', '4:5', '9:16', '16:9')
    and jsonb_typeof(crop_config -> 'positionX') = 'number'
    and jsonb_typeof(crop_config -> 'positionY') = 'number'
    and jsonb_typeof(crop_config -> 'zoom') = 'number'
    and (crop_config ->> 'positionX')::numeric between 0 and 100
    and (crop_config ->> 'positionY')::numeric between 0 and 100
    and (crop_config ->> 'zoom')::numeric between 100 and 200
  )
);

comment on table public.social_media_jobs is
  'Asynchronous image and video processing requests executed by the Cloud Run media worker.';

create index social_media_jobs_workspace_status_idx
  on public.social_media_jobs (workspace_id, status, created_at desc);
create index social_media_jobs_post_idx
  on public.social_media_jobs (post_id, created_at desc);
create index social_media_jobs_source_file_idx
  on public.social_media_jobs (source_file_id);

alter table public.social_media_jobs enable row level security;

create policy "workspace members and administrators can view media jobs"
  on public.social_media_jobs for select to authenticated
  using (
    social_private.is_social_workspace_member(workspace_id)
    or (select social_private.is_social_admin())
  );

create policy "workspace members can create media jobs"
  on public.social_media_jobs for insert to authenticated
  with check (
    social_private.is_social_workspace_member(workspace_id)
    and requested_by = (select auth.uid())
    and status = 'queued'
    and exists (
      select 1
      from public.social_post_files source_file
      where source_file.id = source_file_id
        and source_file.workspace_id = workspace_id
        and source_file.post_id = post_id
        and source_file.created_by = (select auth.uid())
        and source_file.content_type like 'video/%'
        and source_file.media_variant = 'original'
    )
  );

create policy "requesters can cancel queued media jobs"
  on public.social_media_jobs for update to authenticated
  using (
    social_private.is_social_workspace_member(workspace_id)
    and requested_by = (select auth.uid())
    and status in ('queued', 'failed')
  )
  with check (
    social_private.is_social_workspace_member(workspace_id)
    and requested_by = (select auth.uid())
    and status = 'cancelled'
  );

grant select, insert on public.social_media_jobs to authenticated;
grant update (status, updated_at) on public.social_media_jobs to authenticated;
grant all on public.social_media_jobs to service_role;
revoke all on public.social_media_jobs from anon;

create trigger audit_social_media_jobs
  after insert or update or delete on public.social_media_jobs
  for each row execute function social_private.audit_social_change();

-- Adapted from Instatic TalksX 20260726141243_fix_media_job_rls_qualification.sql
drop policy if exists "workspace members can create media jobs"
  on public.social_media_jobs;

create policy "workspace members can create media jobs"
  on public.social_media_jobs for insert to authenticated
  with check (
    social_private.is_social_workspace_member(social_media_jobs.workspace_id)
    and social_media_jobs.requested_by = (select auth.uid())
    and social_media_jobs.status = 'queued'
    and exists (
      select 1
      from public.social_post_files source_file
      where source_file.id = social_media_jobs.source_file_id
        and source_file.workspace_id = social_media_jobs.workspace_id
        and source_file.post_id = social_media_jobs.post_id
        and source_file.created_by = (select auth.uid())
        and source_file.content_type like 'video/%'
        and source_file.media_variant = 'original'
    )
  );

-- Adapted from Instatic TalksX 20260727152027_add_media_job_dispatching_state.sql
alter table public.social_media_jobs
  drop constraint if exists social_media_jobs_status_check;

alter table public.social_media_jobs
  add constraint social_media_jobs_status_check
  check (
    status in (
      'queued',
      'dispatching',
      'processing',
      'completed',
      'failed',
      'cancelled'
    )
  );

comment on column public.social_media_jobs.status is
  'queued: waiting for dispatch; dispatching: Cloud Run accepted the request but the worker has not started; processing: the worker has started; terminal states are completed, failed, and cancelled.';

-- Adapted from Instatic TalksX 20260727171106_add_media_timeline_editing.sql
create or replace function social_private.is_valid_media_timeline_config(config jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  trim_start numeric := 0;
  trim_end numeric;
begin
  if jsonb_typeof(config) is distinct from 'object' then
    return false;
  end if;

  if coalesce(
    config ->> 'aspect' in ('1:1', '4:5', '9:16', '16:9'),
    false
  ) is not true
    or jsonb_typeof(config -> 'positionX') is distinct from 'number'
    or jsonb_typeof(config -> 'positionY') is distinct from 'number'
    or jsonb_typeof(config -> 'zoom') is distinct from 'number'
    or (config ->> 'positionX')::numeric not between 0 and 100
    or (config ->> 'positionY')::numeric not between 0 and 100
    or (config ->> 'zoom')::numeric not between 100 and 200
  then
    return false;
  end if;

  if config ? 'startTime' then
    if jsonb_typeof(config -> 'startTime') is distinct from 'number' then
      return false;
    end if;
    trim_start := (config ->> 'startTime')::numeric;
    if trim_start < 0 then
      return false;
    end if;
  end if;

  if config ? 'endTime' then
    if jsonb_typeof(config -> 'endTime') is distinct from 'number' then
      return false;
    end if;
    trim_end := (config ->> 'endTime')::numeric;
    if trim_end - trim_start < 0.5 then
      return false;
    end if;
  end if;

  if config ? 'cuts' then
    if jsonb_typeof(config -> 'cuts') is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(config -> 'cuts') > 32 then
      return false;
    end if;

    for item in
      select value from jsonb_array_elements(config -> 'cuts')
    loop
      if jsonb_typeof(item) is distinct from 'object'
        or jsonb_typeof(item -> 'start') is distinct from 'number'
        or jsonb_typeof(item -> 'end') is distinct from 'number'
        or (item ->> 'start')::numeric < 0
        or (item ->> 'end')::numeric - (item ->> 'start')::numeric < 0.1
      then
        return false;
      end if;
    end loop;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function social_private.is_valid_media_timeline_config(jsonb)
  from public, anon;
grant usage on schema social_private to authenticated, service_role;
grant execute on function social_private.is_valid_media_timeline_config(jsonb)
  to authenticated, service_role;

alter table public.social_media_jobs
  drop constraint if exists social_media_jobs_crop_config_check;

alter table public.social_media_jobs
  add constraint social_media_jobs_crop_config_check
  check (social_private.is_valid_media_timeline_config(crop_config));

comment on function social_private.is_valid_media_timeline_config(jsonb) is
  'Validates crop and optional timeline fields for media processing jobs.';

-- Adapted from Instatic TalksX 20260727204751_harden_media_timeline_validation.sql
create or replace function social_private.is_valid_media_timeline_config(config jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  trim_start numeric := 0;
  trim_end numeric;
begin
  if jsonb_typeof(config) is distinct from 'object' then
    return false;
  end if;

  if coalesce(
    config ->> 'aspect' in ('1:1', '4:5', '9:16', '16:9'),
    false
  ) is not true
    or jsonb_typeof(config -> 'positionX') is distinct from 'number'
    or jsonb_typeof(config -> 'positionY') is distinct from 'number'
    or jsonb_typeof(config -> 'zoom') is distinct from 'number'
    or (config ->> 'positionX')::numeric not between 0 and 100
    or (config ->> 'positionY')::numeric not between 0 and 100
    or (config ->> 'zoom')::numeric not between 100 and 200
  then
    return false;
  end if;

  if config ? 'startTime' then
    if jsonb_typeof(config -> 'startTime') is distinct from 'number' then
      return false;
    end if;
    trim_start := (config ->> 'startTime')::numeric;
    if trim_start < 0 then
      return false;
    end if;
  end if;

  if config ? 'endTime' then
    if jsonb_typeof(config -> 'endTime') is distinct from 'number' then
      return false;
    end if;
    trim_end := (config ->> 'endTime')::numeric;
    if trim_end - trim_start < 0.5 then
      return false;
    end if;
  end if;

  if config ? 'cuts' then
    if jsonb_typeof(config -> 'cuts') is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(config -> 'cuts') > 32 then
      return false;
    end if;

    for item in
      select value from jsonb_array_elements(config -> 'cuts')
    loop
      if jsonb_typeof(item) is distinct from 'object'
        or jsonb_typeof(item -> 'start') is distinct from 'number'
        or jsonb_typeof(item -> 'end') is distinct from 'number'
        or (item ->> 'start')::numeric < 0
        or (item ->> 'end')::numeric - (item ->> 'start')::numeric < 0.1
      then
        return false;
      end if;
    end loop;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function social_private.is_valid_media_timeline_config(jsonb)
  from public, anon;
grant usage on schema social_private to authenticated, service_role;
grant execute on function social_private.is_valid_media_timeline_config(jsonb)
  to authenticated, service_role;

alter table public.social_media_jobs
  drop constraint if exists social_media_jobs_crop_config_check;

alter table public.social_media_jobs
  add constraint social_media_jobs_crop_config_check
  check (social_private.is_valid_media_timeline_config(crop_config));

comment on function social_private.is_valid_media_timeline_config(jsonb) is
  'Validates crop and optional timeline fields for media processing jobs.';

-- Adapted from Instatic TalksX 20260728040605_enforce_media_timeline_remaining_duration.sql
create or replace function social_private.is_valid_media_timeline_config(config jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  trim_start numeric := 0;
  trim_end numeric;
  cut_start numeric;
  cut_end numeric;
  merged_start numeric;
  merged_end numeric;
  removed_duration numeric := 0;
begin
  if jsonb_typeof(config) is distinct from 'object' then
    return false;
  end if;

  if coalesce(
    config ->> 'aspect' in ('1:1', '4:5', '9:16', '16:9'),
    false
  ) is not true
    or jsonb_typeof(config -> 'positionX') is distinct from 'number'
    or jsonb_typeof(config -> 'positionY') is distinct from 'number'
    or jsonb_typeof(config -> 'zoom') is distinct from 'number'
    or (config ->> 'positionX')::numeric not between 0 and 100
    or (config ->> 'positionY')::numeric not between 0 and 100
    or (config ->> 'zoom')::numeric not between 100 and 200
  then
    return false;
  end if;

  if config ? 'startTime' then
    if jsonb_typeof(config -> 'startTime') is distinct from 'number' then
      return false;
    end if;
    trim_start := (config ->> 'startTime')::numeric;
    if trim_start < 0 then
      return false;
    end if;
  end if;

  if config ? 'endTime' then
    if jsonb_typeof(config -> 'endTime') is distinct from 'number' then
      return false;
    end if;
    trim_end := (config ->> 'endTime')::numeric;
    if trim_end - trim_start < 0.5 then
      return false;
    end if;
  end if;

  if config ? 'cuts' then
    if jsonb_typeof(config -> 'cuts') is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(config -> 'cuts') > 32 then
      return false;
    end if;

    for item in
      select value
      from jsonb_array_elements(config -> 'cuts')
      order by (value ->> 'start')::numeric, (value ->> 'end')::numeric
    loop
      if jsonb_typeof(item) is distinct from 'object'
        or jsonb_typeof(item -> 'start') is distinct from 'number'
        or jsonb_typeof(item -> 'end') is distinct from 'number'
        or (item ->> 'start')::numeric < 0
        or (item ->> 'end')::numeric - (item ->> 'start')::numeric < 0.1
      then
        return false;
      end if;

      if trim_end is not null then
        cut_start := greatest(trim_start, (item ->> 'start')::numeric);
        cut_end := least(trim_end, (item ->> 'end')::numeric);
        if cut_end - cut_start >= 0.1 then
          if merged_start is null then
            merged_start := cut_start;
            merged_end := cut_end;
          elsif cut_start <= merged_end then
            merged_end := greatest(merged_end, cut_end);
          else
            removed_duration := removed_duration + merged_end - merged_start;
            merged_start := cut_start;
            merged_end := cut_end;
          end if;
        end if;
      end if;
    end loop;
  end if;

  if trim_end is not null then
    if merged_start is not null then
      removed_duration := removed_duration + merged_end - merged_start;
    end if;
    if trim_end - trim_start - removed_duration < 0.5 then
      return false;
    end if;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function social_private.is_valid_media_timeline_config(jsonb)
  from public, anon;
grant usage on schema social_private to authenticated, service_role;
grant execute on function social_private.is_valid_media_timeline_config(jsonb)
  to authenticated, service_role;

alter table public.social_media_jobs
  drop constraint if exists social_media_jobs_crop_config_check;

alter table public.social_media_jobs
  add constraint social_media_jobs_crop_config_check
  check (social_private.is_valid_media_timeline_config(crop_config));

comment on function social_private.is_valid_media_timeline_config(jsonb) is
  'Validates crop fields and optional timeline ranges, including at least 0.5 seconds remaining after merged cuts.';

-- Adapted from Instatic TalksX 20260814133000_allow_post_delete_with_media_jobs.sql
alter table public.social_media_jobs
  drop constraint if exists social_media_jobs_source_file_id_fkey;

alter table public.social_media_jobs
  add constraint social_media_jobs_source_file_id_fkey
    foreign key (source_file_id)
    references public.social_post_files(id)
    on delete cascade;


-- Shared-project isolation and explicit privileges (override platform defaults).
REVOKE ALL ON public.social_workspaces, public.social_workspace_members,
  public.social_posts, public.social_post_channels, public.social_post_files,
  public.social_integrations, public.social_integration_secrets,
  public.social_admin_users, public.social_user_profiles, public.social_audit_logs,
  public.social_stores, public.social_media_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_workspaces,
  public.social_workspace_members, public.social_posts, public.social_post_channels,
  public.social_post_files, public.social_integrations TO authenticated;
GRANT SELECT ON public.social_user_profiles, public.social_audit_logs TO authenticated;
GRANT UPDATE (store_id) ON public.social_user_profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.social_admin_users TO authenticated;
GRANT SELECT ON public.social_stores TO anon, authenticated;
GRANT SELECT, INSERT ON public.social_media_jobs TO authenticated;
GRANT UPDATE (status, updated_at) ON public.social_media_jobs TO authenticated;
GRANT ALL ON public.social_workspaces, public.social_workspace_members,
  public.social_posts, public.social_post_channels, public.social_post_files,
  public.social_integrations, public.social_integration_secrets,
  public.social_admin_users, public.social_user_profiles, public.social_audit_logs,
  public.social_stores, public.social_media_jobs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.social_audit_logs_id_seq TO service_role;

CREATE FUNCTION social_private.ensure_profile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.social_user_profiles (user_id, email, created_at, last_sign_in_at, store_id)
  SELECT u.id, coalesce(u.email, ''), u.created_at, u.last_sign_in_at,
    (SELECT s.id FROM public.social_stores s
     WHERE s.id = nullif(u.raw_user_meta_data ->> 'social_store_id','') AND s.is_active)
  FROM auth.users u WHERE u.id = caller
  ON CONFLICT (user_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION social_private.ensure_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION social_private.ensure_profile() TO authenticated;
CREATE FUNCTION public.social_ensure_profile()
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT social_private.ensure_profile(); $$;
REVOKE ALL ON FUNCTION public.social_ensure_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_ensure_profile() TO authenticated;

-- Invalid/future gourmet storage paths must not throw UUID parsing errors.
CREATE FUNCTION social_private.file_workspace(object_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
BEGIN RETURN split_part(object_name, '/', 1)::uuid;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION social_private.file_workspace(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION social_private.file_workspace(text) TO authenticated;

DROP POLICY "workspace members and administrators can read post files" ON storage.objects;
DROP POLICY "workspace members can upload post files" ON storage.objects;
DROP POLICY "workspace members can update post files" ON storage.objects;
DROP POLICY "workspace members can delete post files" ON storage.objects;
CREATE POLICY social_files_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='social-post-files' AND (
    social_private.is_social_workspace_member(social_private.file_workspace(name))
    OR (SELECT social_private.is_social_admin())
  )
);
CREATE POLICY social_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='social-post-files'
  AND social_private.is_social_workspace_member(social_private.file_workspace(name))
);
CREATE POLICY social_files_update ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id='social-post-files'
  AND social_private.is_social_workspace_member(social_private.file_workspace(name))
) WITH CHECK (
  bucket_id='social-post-files'
  AND social_private.is_social_workspace_member(social_private.file_workspace(name))
);
CREATE POLICY social_files_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='social-post-files'
  AND social_private.is_social_workspace_member(social_private.file_workspace(name))
);

CREATE INDEX social_workspaces_created_by_idx ON public.social_workspaces(created_by);
CREATE INDEX social_workspace_members_user_idx ON public.social_workspace_members(user_id);
CREATE INDEX social_posts_created_by_idx ON public.social_posts(created_by);
CREATE INDEX social_post_files_workspace_idx ON public.social_post_files(workspace_id);
CREATE INDEX social_post_files_created_by_idx ON public.social_post_files(created_by);
CREATE INDEX social_integrations_created_by_idx ON public.social_integrations(created_by);
CREATE INDEX social_admin_users_granted_by_idx ON public.social_admin_users(granted_by);
CREATE INDEX social_media_jobs_output_file_idx ON public.social_media_jobs(output_file_id);
CREATE INDEX social_media_jobs_requested_by_idx ON public.social_media_jobs(requested_by);
