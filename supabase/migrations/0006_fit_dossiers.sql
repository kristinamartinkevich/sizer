-- Sizer: fit dossiers, what people say about how one item fits. Run after 0005.
--   The fit-dossier Edge Function asks the model once per item (brand and style) for fit commentary
--   from retailer reviews, blogs and the brand's fit reputation, and keeps the answer here for
--   everyone for 30 days. A dossier holds no shopper data: the item, a verdict, per-area notes, a
--   brand note and the pages they rest on.
--   dossier_requests is the function's ledger for the daily caps, like chart_lookups: a row is written
--   as 'pending' before the model is asked, so requests running at the same moment count against the
--   caps, then updated to its outcome; a request that would pass a cap deletes its own row.
--   fit_dossier_settings holds the caps in one row. The operator changes them with an update, for
--   example: update public.fit_dossier_settings set per_install_per_day = 60;
--   Only the function writes, with the service-role key. The public key reads dossiers through the
--   fit_dossier_public view and nothing else: RLS is on with no policies on all three tables, and
--   their grants are revoked from the API roles.
-- Paste into the Supabase SQL editor and run as a whole.

create table public.fit_dossiers (
  id          uuid         primary key default gen_random_uuid(),
  item_key    text         not null unique,              -- "<brand>|<style>", as item_fit_reports keys it
  brand       text         not null,
  style       text         not null,
  kind        text         not null,                     -- bottoms | tops | dresses | shoes
  verdict     text,                                      -- small | tts | large, null when no source holds one up
  strength    numeric(4,3) not null default 0,           -- 0 to 1, how consistent the evidence is
  areas       jsonb        not null default '[]'::jsonb, -- [{ area, direction, note }]
  brand_note  text,
  sources     jsonb        not null default '[]'::jsonb, -- [{ url, title }], each a page a web search returned
  created_at  timestamptz  not null default now(),
  constraint key_shape check (item_key ~ '^[a-z0-9 ]+\|[a-z0-9]+$' and length(item_key) <= 120),
  constraint names_short check (length(brand) between 1 and 80 and length(style) between 1 and 80),
  constraint kind_known check (kind in ('bottoms', 'tops', 'dresses', 'shoes')),
  constraint verdict_known check (verdict is null or verdict in ('small', 'tts', 'large')),
  constraint strength_range check (strength >= 0 and strength <= 1),
  constraint areas_list check (jsonb_typeof(areas) = 'array'),
  constraint sources_list check (jsonb_typeof(sources) = 'array'),
  constraint brand_note_short check (brand_note is null or length(brand_note) <= 200)
);

comment on table public.fit_dossiers is 'One fit dossier per item, written by the fit-dossier function and served for 30 days.';

create table public.dossier_requests (
  id          uuid        primary key default gen_random_uuid(),
  item_key    text        not null,
  brand       text        not null,
  kind        text        not null,
  shop        text        not null,                     -- shop hostname
  install     uuid        not null,
  outcome     text        not null check (outcome in ('pending', 'dossier', 'empty', 'error')),
  reason      text,
  created_at  timestamptz not null default now(),
  constraint key_shape check (length(item_key) between 1 and 120),
  constraint brand_short check (length(brand) between 1 and 80),
  constraint kind_known check (kind in ('bottoms', 'tops', 'dresses', 'shoes')),
  constraint shop_shape check (shop ~ '^[a-z0-9.-]+$' and length(shop) <= 253)
);

comment on table public.dossier_requests is 'One row per model call by the fit-dossier function: the daily caps.';

create index dossier_requests_install_idx on public.dossier_requests (install, created_at);
create index dossier_requests_created_idx on public.dossier_requests (created_at);

create table public.fit_dossier_settings (
  id                   boolean     primary key default true check (id),  -- one row only
  per_install_per_day  integer     not null check (per_install_per_day > 0),
  global_per_day       integer     not null check (global_per_day > 0),
  updated_at           timestamptz not null default now()
);

comment on table public.fit_dossier_settings is 'The fit-dossier function''s daily caps. Change them here; the function reads them on every call.';

insert into public.fit_dossier_settings (id, per_install_per_day, global_per_day) values (true, 40, 2000);

alter table public.fit_dossiers enable row level security;
alter table public.dossier_requests enable row level security;
alter table public.fit_dossier_settings enable row level security;
-- No policies on purpose: the function writes and reads with the service role, which bypasses RLS.
revoke all on table public.fit_dossiers from anon, authenticated;
revoke all on table public.dossier_requests from anon, authenticated;
revoke all on table public.fit_dossier_settings from anon, authenticated;

-- The one thing the public key may read. The view runs with its owner's rights, so it reaches the
-- table without opening it. A plain one-table view is updatable, so every grant is revoked first and
-- only select is given back: anon must not write through it.
create view public.fit_dossier_public as
  select item_key, verdict, strength, areas, brand_note, sources, created_at
  from public.fit_dossiers;

revoke all on public.fit_dossier_public from anon, authenticated;
grant select on public.fit_dossier_public to anon, authenticated;
