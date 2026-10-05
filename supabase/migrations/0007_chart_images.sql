-- Sizer: the read-chart-image function's cache, ledger and caps. Run after 0005; it does not need 0006.
--   Every call that reaches the model is one row in chart_images, written by the read-chart-image Edge
--   Function with the service-role key:
--   * route 'image': a shop's size chart image, read with Claude vision. The row keeps the SHA-256 of
--     the image address (the cache key, so the next shopper's request for the same image is answered
--     without asking the model again), the image address itself (a public asset on the shop's CDN, for
--     review in the dashboard), the brand and kind of item it was asked for, and what was read (chart,
--     a jsonb in the shape the function stores) or why nothing was.
--   * route 'product': the "Read this page with AI" fallback. Nothing about the page is kept: no text,
--     no address, no brand, no answer. The row exists only so the call counts against the caps.
--   A row is written as 'pending' before the model is asked, so calls landing at the same moment count
--   against the caps, and updated to its outcome after; a call that would pass a cap deletes its row.
--   The caps live in chart_image_settings, one row, which the operator may edit in the dashboard.
--   Only the function reads and writes both tables. The public key sees nothing: RLS is on with no
--   policies, and the table grants are revoked from the API roles as well.
-- Paste into the Supabase SQL editor and run as a whole.

create table public.chart_images (
  id          uuid        primary key default gen_random_uuid(),
  route       text        not null check (route in ('image', 'product')),
  url_hash    text,                                     -- sha-256 of image_url, lowercase hex; image route only
  image_url   text,                                     -- the chart image's public address; image route only
  brand       text,                                     -- the brand the image was read for; image route only
  kind        text,                                     -- bottoms | tops | dresses | shoes; image route only
  install     uuid        not null,                     -- the random per-install id, for the per-install cap
  outcome     text        not null check (outcome in ('pending', 'chart', 'no_chart', 'read', 'error')),
  reason      text,                                     -- why no chart, or what went wrong
  chart       jsonb,                                    -- what was read from the image, when outcome is 'chart'
  created_at  timestamptz not null default now(),
  constraint hash_shape   check (url_hash is null or url_hash ~ '^[0-9a-f]{64}$'),
  constraint url_shape    check (image_url is null or (image_url like 'https://%' and length(image_url) <= 2048)),
  constraint brand_short  check (brand is null or length(brand) between 1 and 80),
  constraint kind_known   check (kind is null or kind in ('bottoms', 'tops', 'dresses', 'shoes')),
  constraint image_row    check (route <> 'image' or (url_hash is not null and image_url is not null and brand is not null and kind is not null and outcome <> 'read')),
  constraint product_row  check (route <> 'product' or (url_hash is null and image_url is null and brand is null and kind is null and chart is null and outcome in ('pending', 'read', 'error'))),
  constraint chart_kept   check ((outcome = 'chart') = (chart is not null))
);

comment on table public.chart_images is 'One row per model call by the read-chart-image function: the per-image cache, the daily caps.';

create index chart_images_hash_idx    on public.chart_images (url_hash, created_at) where route = 'image';
create index chart_images_install_idx on public.chart_images (install, created_at);
create index chart_images_created_idx on public.chart_images (created_at);

alter table public.chart_images enable row level security;
-- No policies on purpose: the function writes and reads with the service role, which bypasses RLS.
revoke all on table public.chart_images from anon, authenticated;

-- The caps, as one row the operator can change: calls per install and calls overall in any 24 hours.
create table public.chart_image_settings (
  id                   boolean primary key default true check (id),
  per_install_per_day  integer not null default 40   check (per_install_per_day > 0),
  global_per_day       integer not null default 2000 check (global_per_day > 0)
);

comment on table public.chart_image_settings is 'The read-chart-image daily caps. One row; edit it to change them.';

insert into public.chart_image_settings default values;

alter table public.chart_image_settings enable row level security;
revoke all on table public.chart_image_settings from anon, authenticated;
