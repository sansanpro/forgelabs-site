-- ForgeLabs App Ad Studio: accounts, apps, uploads, hooks, packs and the render queue.
-- Every object is prefixed studio_ so the old lead product's tables are untouched.
-- Safe to run again: tables and columns use IF NOT EXISTS, functions are replaced, and
-- policies are dropped and recreated.
--
-- Who can do what:
--   the browser (authenticated)  reads and edits its own rows; queues work only through
--                                studio_queue(), which checks the free pack allowance
--   the worker (service_role)    claims jobs with studio_claim_job() and reports back with
--                                studio_finish_job() and studio_job_progress()

-- ── tables ──────────────────────────────────────────────────────────────────

create table if not exists public.studio_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  free_packs int not null default 1,   -- beta allowance; raise it by hand to grant more
  packs_used int not null default 0,
  is_admin boolean not null default false,
  ai_day date,
  ai_calls int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Untitled app' check (char_length(name) between 1 and 80),
  brief jsonb not null default '{}'::jsonb,
  brand jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_projects_owner on public.studio_projects (owner, updated_at desc);

create table if not exists public.studio_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('screen', 'recording', 'icon')),
  -- in the studio-uploads bucket, always under the owner's folder: {owner}/{project}/{file}
  path text not null check (split_part(path, '/', 1) = owner::text),
  label text not null default '' check (char_length(label) <= 80),
  status_bar boolean not null default true,
  width int,
  height int,
  bytes int,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists studio_assets_project on public.studio_assets (project_id, sort);

create table if not exists public.studio_hooks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null default 'custom' check (char_length(category) <= 40),
  text text not null check (char_length(text) between 3 and 160),
  benefit text not null default '' check (char_length(benefit) <= 140),
  source text not null default 'user' check (source in ('ai', 'template', 'user')),
  checks jsonb not null default '[]'::jsonb,
  selected boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists studio_hooks_project on public.studio_hooks (project_id, created_at);

create table if not exists public.studio_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  spec jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'running', 'preview_ready', 'done', 'failed')),
  preview jsonb,
  result jsonb,
  error text,
  charged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_batches_project on public.studio_batches (project_id, created_at desc);

create table if not exists public.studio_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.studio_batches(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('preview', 'pack')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts int not null default 0,
  worker text,
  locked_at timestamptz,
  progress text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists studio_jobs_queue on public.studio_jobs (status, created_at);
create index if not exists studio_jobs_batch on public.studio_jobs (batch_id, created_at desc);

-- ── every signed-up user gets an account row ────────────────────────────────

create or replace function public.studio_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.studio_accounts (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists studio_on_auth_user_created on auth.users;
create trigger studio_on_auth_user_created after insert on auth.users
  for each row execute function public.studio_handle_new_user();

insert into public.studio_accounts (id, email)
  select id, email from auth.users on conflict (id) do nothing;

-- ── row level security ─────────────────────────────────────────────────────

alter table public.studio_accounts enable row level security;
alter table public.studio_projects enable row level security;
alter table public.studio_assets enable row level security;
alter table public.studio_hooks enable row level security;
alter table public.studio_batches enable row level security;
alter table public.studio_jobs enable row level security;

revoke all on public.studio_accounts, public.studio_projects, public.studio_assets, public.studio_hooks,
  public.studio_batches, public.studio_jobs from anon, authenticated;

grant select on public.studio_accounts to authenticated;
grant select, insert, update, delete on public.studio_projects, public.studio_assets, public.studio_hooks to authenticated;
grant select, delete on public.studio_batches to authenticated;
grant insert (project_id, spec) on public.studio_batches to authenticated;
grant update (spec, updated_at) on public.studio_batches to authenticated;
grant select on public.studio_jobs to authenticated;

drop policy if exists "own account" on public.studio_accounts;
create policy "own account" on public.studio_accounts for select to authenticated using (id = auth.uid());

drop policy if exists "own projects" on public.studio_projects;
create policy "own projects" on public.studio_projects for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own assets" on public.studio_assets;
create policy "own assets" on public.studio_assets for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.studio_projects p where p.id = project_id and p.owner = auth.uid()));

drop policy if exists "own hooks" on public.studio_hooks;
create policy "own hooks" on public.studio_hooks for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.studio_projects p where p.id = project_id and p.owner = auth.uid()));

drop policy if exists "own batches: read" on public.studio_batches;
create policy "own batches: read" on public.studio_batches for select to authenticated using (owner = auth.uid());
drop policy if exists "own batches: create" on public.studio_batches;
create policy "own batches: create" on public.studio_batches for insert to authenticated
  with check (owner = auth.uid() and exists (select 1 from public.studio_projects p where p.id = project_id and p.owner = auth.uid()));
-- the spec can't change while the worker is using it
drop policy if exists "own batches: edit" on public.studio_batches;
create policy "own batches: edit" on public.studio_batches for update to authenticated
  using (owner = auth.uid() and status not in ('queued', 'running')) with check (owner = auth.uid());
drop policy if exists "own batches: delete" on public.studio_batches;
create policy "own batches: delete" on public.studio_batches for delete to authenticated
  using (owner = auth.uid() and status not in ('queued', 'running'));

drop policy if exists "own jobs" on public.studio_jobs;
create policy "own jobs" on public.studio_jobs for select to authenticated using (owner = auth.uid());

-- ── queueing work: the only way a browser creates a job ────────────────────

create or replace function public.studio_queue(p_batch uuid, p_kind text)
returns public.studio_jobs language plpgsql security definer set search_path = public as $$
declare
  b public.studio_batches;
  a public.studio_accounts;
  j public.studio_jobs;
  n int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_kind not in ('preview', 'pack') then raise exception 'bad_kind'; end if;
  insert into studio_accounts (id, email) values (auth.uid(), auth.jwt() ->> 'email') on conflict (id) do nothing;

  select * into b from studio_batches where id = p_batch and owner = auth.uid() for update;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from studio_jobs where batch_id = p_batch and status in ('queued', 'running')) then
    raise exception 'already_queued';
  end if;
  n := jsonb_array_length(coalesce(b.spec -> 'hooks', '[]'::jsonb));
  if n < 1 or n > 5 then raise exception 'hooks_1_to_5'; end if;

  select * into a from studio_accounts where id = auth.uid() for update;
  if p_kind = 'preview' then
    select count(*) into n from studio_jobs
      where owner = auth.uid() and kind = 'preview' and created_at > now() - interval '1 day';
    if n >= 40 and not a.is_admin then raise exception 'preview_limit'; end if;
  else
    if not a.is_admin and a.packs_used >= a.free_packs then raise exception 'no_packs_left'; end if;
    update studio_accounts set packs_used = packs_used + 1 where id = auth.uid();
    update studio_batches set charged = true where id = p_batch;
  end if;

  update studio_batches set status = 'queued', error = null, updated_at = now() where id = p_batch;
  insert into studio_jobs (batch_id, owner, kind) values (p_batch, auth.uid(), p_kind) returning * into j;
  return j;
end $$;

-- ── the worker's side ──────────────────────────────────────────────────────

create or replace function public.studio_finish_job(p_job uuid, p_ok boolean, p_result jsonb, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare
  j public.studio_jobs;
  b public.studio_batches;
begin
  update studio_jobs set status = case when p_ok then 'done' else 'failed' end, error = p_error,
         progress = null, finished_at = now()
   where id = p_job returning * into j;
  if not found then return; end if;
  select * into b from studio_batches where id = j.batch_id for update;
  if p_ok and j.kind = 'preview' then
    update studio_batches set preview = p_result, status = 'preview_ready', error = null, updated_at = now() where id = j.batch_id;
  elsif p_ok then
    update studio_batches set result = p_result, status = 'done', error = null, updated_at = now() where id = j.batch_id;
  else
    update studio_batches set status = 'failed', error = p_error, updated_at = now() where id = j.batch_id;
    -- a pack that failed doesn't count against the allowance
    if j.kind = 'pack' and b.charged then
      update studio_accounts set packs_used = greatest(0, packs_used - 1) where id = j.owner;
      update studio_batches set charged = false where id = j.batch_id;
    end if;
  end if;
end $$;

create or replace function public.studio_claim_job(p_worker text)
returns setof public.studio_jobs language plpgsql security definer set search_path = public as $$
declare
  j public.studio_jobs;
begin
  -- Jobs whose worker vanished three times are given up on, and refunded
  for j in select * from studio_jobs
            where status = 'running' and locked_at < now() - interval '20 minutes' and attempts >= 3 loop
    perform studio_finish_job(j.id, false, null, 'The render stopped before it finished. Try again.');
  end loop;

  select * into j from studio_jobs
   where status = 'queued' or (status = 'running' and locked_at < now() - interval '20 minutes')
   order by created_at
   limit 1
   for update skip locked;
  if not found then return; end if;
  update studio_jobs set status = 'running', attempts = attempts + 1, worker = p_worker, locked_at = now(),
         progress = 'Starting'
   where id = j.id returning * into j;
  update studio_batches set status = 'running', updated_at = now() where id = j.batch_id;
  return next j;
end $$;

create or replace function public.studio_job_progress(p_job uuid, p_text text)
returns void language sql security definer set search_path = public as $$
  update studio_jobs set progress = left(p_text, 200), locked_at = now() where id = p_job and status = 'running';
$$;

-- ── AI calls: a daily allowance per account ────────────────────────────────

create or replace function public.studio_ai_allow()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  a public.studio_accounts;
begin
  if auth.uid() is null then return false; end if;
  insert into studio_accounts (id, email) values (auth.uid(), auth.jwt() ->> 'email') on conflict (id) do nothing;
  update studio_accounts
     set ai_calls = case when ai_day = current_date then ai_calls + 1 else 1 end, ai_day = current_date
   where id = auth.uid() returning * into a;
  return a.is_admin or a.ai_calls <= 60;
end $$;

revoke all on function public.studio_queue(uuid, text), public.studio_finish_job(uuid, boolean, jsonb, text),
  public.studio_claim_job(text), public.studio_job_progress(uuid, text), public.studio_ai_allow(),
  public.studio_handle_new_user() from public, anon, authenticated;
grant execute on function public.studio_queue(uuid, text), public.studio_ai_allow() to authenticated;
grant execute on function public.studio_finish_job(uuid, boolean, jsonb, text), public.studio_claim_job(text),
  public.studio_job_progress(uuid, text) to service_role;

-- ── storage: uploads and finished packs, each user in their own folder ─────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-uploads', 'studio-uploads', false, 52428800,
        array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit)
values ('studio-renders', 'studio-renders', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists "studio uploads: read own" on storage.objects;
create policy "studio uploads: read own" on storage.objects for select to authenticated
  using (bucket_id = 'studio-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "studio uploads: add own" on storage.objects;
create policy "studio uploads: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "studio uploads: change own" on storage.objects;
create policy "studio uploads: change own" on storage.objects for update to authenticated
  using (bucket_id = 'studio-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "studio uploads: delete own" on storage.objects;
create policy "studio uploads: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'studio-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "studio renders: read own" on storage.objects;
create policy "studio renders: read own" on storage.objects for select to authenticated
  using (bucket_id = 'studio-renders' and (storage.foldername(name))[1] = auth.uid()::text);
