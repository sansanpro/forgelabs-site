-- Launch report: traffic, sign-ups, packs and the render queue.
-- Paste into the SQL editor of the Studio's Supabase project (cuijqoorjgvlyiyizgxi), highlight
-- one block and run it: run the whole file and the editor shows only the last block's result.
-- Visits come from assets/visit.js
-- (supabase/migrations/20261127120000_site_visits.sql). A visitor is counted once a day, so a
-- sign-up is traced to where that visitor first came from on the same day.

-- 1. By day and source: visitors, and how many of them signed up and made a pack
with first_view as (
  select distinct on (visitor, at::date) visitor, at::date as day,
         coalesce(utm_source, referrer, 'direct') as source, utm_campaign as campaign
    from site_visits
   where event = 'view'
   order by visitor, at::date, at
)
select f.day, f.source, f.campaign,
       count(distinct f.visitor) as visitors,
       count(distinct v.visitor) filter (where v.event = 'signup') as signups,
       count(distinct v.visitor) filter (where v.event = 'pack') as packs
  from first_view f
  left join site_visits v on v.visitor = f.visitor and v.at::date = f.day and v.event <> 'view'
 group by 1, 2, 3
 order by 1 desc, 4 desc;

-- 2. Most viewed pages, last 7 days
select path, count(*) as views, count(distinct visitor) as visitors
  from site_visits
 where event = 'view' and at > now() - interval '7 days'
 group by 1
 order by 2 desc;

-- 3. Accounts and packs by day, from the Studio's own tables (counts everyone, whatever the
--    visit counter saw)
select d.day,
       (select count(*) from studio_accounts where created_at::date = d.day) as new_accounts,
       (select count(*) from studio_jobs where kind = 'pack' and status = 'done' and finished_at::date = d.day) as packs_done,
       (select count(*) from studio_jobs where kind = 'pack' and status = 'failed' and finished_at::date = d.day) as packs_failed
  from (select generate_series(current_date - 13, current_date, interval '1 day')::date as day) d
 order by 1 desc;

-- 4. The render queue right now: jobs waiting, the longest wait, and the workers seen lately
select (select count(*) from studio_jobs where status = 'queued') as queued,
       (select count(*) from studio_jobs where status = 'running') as running,
       (select round(extract(epoch from now() - min(created_at)) / 60) from studio_jobs where status = 'queued') as oldest_wait_min,
       (select count(*) from studio_workers where seen_at > now() - interval '3 minutes') as workers_on,
       (select max(seen_at) from studio_workers) as last_seen;
