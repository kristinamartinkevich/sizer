-- Sizer: the lookup function's ledger. Run after 0004.
--   Every lookup that reaches the model is recorded here by the lookup-chart Edge Function: which
--   brand and kind of item, from which shop, by which install (the random per-install id the
--   extension already sends with fit reports), and how it ended. The function reads it back for two
--   things only: the daily caps (20 per install, 300 overall) and the 30-day "no chart" markers that
--   stop it asking the model about the same chartless brand again. A row is written as 'pending'
--   before the model is asked, so lookups running at the same moment count against the caps, and
--   updated to its outcome after; a lookup that would pass a cap deletes its own row.
--   Only the function writes and reads it, with the service-role key. The public key sees nothing:
--   RLS is on with no policies, and the table grants are revoked from the API roles as well.
-- Paste into the Supabase SQL editor and run as a whole.

create table public.chart_lookups (
  id          uuid        primary key default gen_random_uuid(),
  brand       text        not null,                     -- the brand as brands.aliases spells it: lowercase
  kind        text        not null,                     -- bottoms | tops | dresses | shoes
  shop        text        not null,                     -- shop hostname
  install     uuid        not null,
  outcome     text        not null check (outcome in ('pending', 'chart', 'no_chart', 'error')),
  reason      text,                                     -- why no chart, or what went wrong, or what was stored
  created_at  timestamptz not null default now(),
  constraint brand_short check (length(brand) between 1 and 80),
  constraint kind_known check (kind in ('bottoms', 'tops', 'dresses', 'shoes')),
  constraint shop_shape check (shop ~ '^[a-z0-9.-]+$' and length(shop) <= 253)
);

comment on table public.chart_lookups is 'One row per model lookup by the lookup-chart function: the daily caps and the 30-day no-chart markers.';

create index chart_lookups_install_idx on public.chart_lookups (install, created_at);
create index chart_lookups_created_idx on public.chart_lookups (created_at);

alter table public.chart_lookups enable row level security;
-- No policies on purpose: the function writes and reads with the service role, which bypasses RLS.
revoke all on table public.chart_lookups from anon, authenticated;
