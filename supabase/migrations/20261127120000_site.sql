-- The public site's own data: visit counts and the paid-plans waitlist. Safe to run again.
--
-- Visits: a count of page views, sign-ups and packs, and where the visitor came from. Nothing
-- is stored in the visitor's browser and no cookie is set. assets/visit.js sends the page, the
-- host of the site that sent the visitor and any utm_ tags in the link. A visitor is a hash of
-- their IP address and browser with a salt that changes daily, and the old salt is deleted, so
-- one visitor can be counted within a day but not followed from day to day. The IP address
-- itself is never stored. supabase/launch-report.sql reads it.
--
-- Who can do what:
--   the browser (anon, authenticated)  calls site_visit() and site_waitlist_join(), nothing else
--   the owner                          reads the tables in the SQL editor

create table if not exists public.site_salts (
  for_day date primary key,
  salt text not null
);

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  visitor text not null,   -- sha256 of the day's salt, IP address and user agent
  event text not null default 'view' check (event in ('view', 'signup', 'pack')),
  path text not null,
  referrer text,           -- host only, and only when it's another site
  utm_source text,
  utm_medium text,
  utm_campaign text
);
create index if not exists site_visits_at on public.site_visits (at);
create index if not exists site_visits_visitor on public.site_visits (visitor, at);

-- No policies or grants: the browser can't read or write these tables directly
alter table public.site_salts enable row level security;
alter table public.site_visits enable row level security;
revoke all on public.site_salts, public.site_visits from anon, authenticated;

create or replace function public.site_visit(p_path text, p_ref text default null,
                                             p_utm jsonb default '{}'::jsonb, p_event text default 'view')
returns void language plpgsql security definer set search_path = public as $$
declare
  h json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text := trim(split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'cf-connecting-ip', ''), ',', 1));
  s text;
  v text;
begin
  if p_event not in ('view', 'signup', 'pack') then return; end if;
  select salt into s from site_salts where for_day = current_date;
  if not found then
    insert into site_salts (for_day, salt) values (current_date, gen_random_uuid()::text) on conflict (for_day) do nothing;
    delete from site_salts where for_day < current_date;
    select salt into s from site_salts where for_day = current_date;
  end if;
  v := encode(sha256(convert_to(s || '|' || ip || '|' || coalesce(h ->> 'user-agent', ''), 'UTF8')), 'hex');
  -- A script hammering this from one address stops being counted
  if (select count(*) from site_visits where visitor = v and at > now() - interval '1 hour') >= 200 then return; end if;
  insert into site_visits (visitor, event, path, referrer, utm_source, utm_medium, utm_campaign)
  values (v, p_event, left(coalesce(nullif(p_path, ''), '/'), 200), nullif(left(lower(p_ref), 100), ''),
          nullif(left(p_utm ->> 'source', 100), ''), nullif(left(p_utm ->> 'medium', 100), ''),
          nullif(left(p_utm ->> 'campaign', 100), ''));
end $$;

revoke all on function public.site_visit(text, text, jsonb, text) from public;
grant execute on function public.site_visit(text, text, jsonb, text) to anon, authenticated;

-- ── the paid-plans waitlist ────────────────────────────────────────────────
-- One row per email, from the pricing section's form. The owner emails the list when plans open.

create table if not exists public.site_waitlist (
  email text primary key,
  note text,
  at timestamptz not null default now()
);
alter table public.site_waitlist enable row level security;
revoke all on public.site_waitlist from anon, authenticated;

create or replace function public.site_waitlist_join(p_email text, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if char_length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return false; end if;
  -- A script filling the list with made-up addresses stops after a couple of hundred an hour
  if (select count(*) from site_waitlist where at > now() - interval '1 hour') >= 200 then return false; end if;
  insert into site_waitlist (email, note) values (e, nullif(left(trim(coalesce(p_note, '')), 200), ''))
    on conflict (email) do nothing;
  return true;
end $$;

revoke all on function public.site_waitlist_join(text, text) from public;
grant execute on function public.site_waitlist_join(text, text) to anon, authenticated;
