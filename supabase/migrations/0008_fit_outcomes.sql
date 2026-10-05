-- Sizer: "did it fit?" outcomes. Run after 0007.
--   A week after Sizer sizes a product (or when the shopper comes back to it), the extension asks
--   whether they bought it, which size, and how it fitted. An answer is sent here anonymously:
--   the item key, brand, kind of clothing, shop hostname, the size bought and the size Sizer
--   suggested, too small / right / too big, the areas that did not fit, the chart tier, and the
--   random per-install id, used only so a second answer for the same item replaces the first and
--   to hold each install to a daily limit. No measurements, no profile, no page address.
--   The public key cannot read or write fit_outcomes: writes go through report_fit_outcome(),
--   reads through brand_fit, which shows only counts per brand and kind of clothing, and only
--   once ten outcomes are in, so a single shopper's purchase never shows on its own.
-- Paste into the Supabase SQL editor and run (one transaction).

create table public.fit_outcomes (
  item_key       text        not null,                    -- "<brand>|<style>", normalised by the extension
  brand          text        not null,
  kind           text        not null,
  shop           text        not null,                    -- shop hostname
  install_id     uuid        not null,
  size_bought    text        not null,
  size_suggested text        not null,
  outcome        text        not null,                    -- small: too small, right, big: too big
  areas          text[]      not null default '{}',
  chart_tier     smallint,
  reported_at    timestamptz not null default now(),
  primary key (item_key, install_id),
  constraint outcome_known check (outcome in ('small', 'right', 'big')),
  constraint kind_known check (kind in ('bottoms', 'tops', 'dresses', 'outerwear', 'shoes')),
  constraint key_shape check (item_key ~ '^[a-z0-9 ]+\|[a-z0-9]+$' and length(item_key) <= 200),
  constraint shop_shape check (shop ~ '^[a-z0-9.-]+$' and length(shop) <= 120),
  constraint brand_short check (length(btrim(brand)) between 1 and 80),
  constraint sizes_short check (length(btrim(size_bought)) between 1 and 20 and length(size_suggested) <= 20),
  constraint areas_known check (areas <@ array['bust', 'chest', 'waist', 'hip', 'length', 'inseam', 'shoulder', 'sleeve', 'foot']::text[] and cardinality(areas) <= 9),
  constraint tier_range check (chart_tier is null or chart_tier between 0 and 5)
);

create index fit_outcomes_install_idx on public.fit_outcomes (install_id, reported_at);

alter table public.fit_outcomes enable row level security;
-- No policies on purpose, and the grants Supabase gives every new table are revoked as well:
-- anon and authenticated reach the rows only through the function and the view below.
revoke all on table public.fit_outcomes from anon, authenticated;

-- The parameter names are the fields the extension sends (outcomeBody in src/feedback.js), so the
-- body posts to /rest/v1/rpc/report_fit_outcome as it is. Bad input is refused with a message.
create or replace function public.report_fit_outcome(
  item_key text, brand text, kind text, shop text, install uuid,
  size_bought text, size_suggested text, outcome text,
  areas text[] default '{}', chart_tier integer default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if report_fit_outcome.install is null then raise exception 'install is required'; end if;
  if report_fit_outcome.outcome is null or report_fit_outcome.outcome not in ('small', 'right', 'big') then
    raise exception 'outcome must be small, right or big';
  end if;
  if report_fit_outcome.kind is null or report_fit_outcome.kind not in ('bottoms', 'tops', 'dresses', 'outerwear', 'shoes') then
    raise exception 'unknown kind of clothing';
  end if;
  if (select count(*) from public.fit_outcomes o where o.install_id = report_fit_outcome.install and o.reported_at > now() - interval '1 day') >= 50 then
    raise exception 'too many outcomes from this install today';
  end if;
  insert into public.fit_outcomes (item_key, brand, kind, shop, install_id, size_bought, size_suggested, outcome, areas, chart_tier)
  values (
    report_fit_outcome.item_key, btrim(report_fit_outcome.brand), report_fit_outcome.kind, lower(report_fit_outcome.shop),
    report_fit_outcome.install, btrim(report_fit_outcome.size_bought), coalesce(btrim(report_fit_outcome.size_suggested), ''),
    report_fit_outcome.outcome, coalesce(report_fit_outcome.areas, '{}'), report_fit_outcome.chart_tier
  )
  on conflict on constraint fit_outcomes_pkey do update
    set brand = excluded.brand, kind = excluded.kind, shop = excluded.shop, size_bought = excluded.size_bought,
        size_suggested = excluded.size_suggested, outcome = excluded.outcome, areas = excluded.areas,
        chart_tier = excluded.chart_tier, reported_at = now();
end $$;

revoke all on function public.report_fit_outcome(text, text, text, text, uuid, text, text, text, text[], integer) from public;
grant execute on function public.report_fit_outcome(text, text, text, text, uuid, text, text, text, text[], integer) to anon, authenticated;

-- What buyers of each brand said, per kind of clothing, counted only where they bought the size
-- Sizer suggested: that is what tells Sizer its answer for the brand runs small or large. The brand
-- is keyed the way the extension matches names (lower case, & as "and", other marks as spaces).
-- Shown only from ten outcomes, the point at which the extension starts to use them.
create view public.brand_fit as
  select
    btrim(regexp_replace(replace(lower(o.brand), '&', ' and '), '[^a-z0-9]+', ' ', 'g')) as brand_key,
    o.kind,
    count(*) filter (where o.outcome = 'small')::integer as small,
    count(*) filter (where o.outcome = 'right')::integer as tts,
    count(*) filter (where o.outcome = 'big')::integer as large,
    count(*)::integer as total
  from public.fit_outcomes o
  where upper(regexp_replace(o.size_bought, '\s+', '', 'g')) = upper(regexp_replace(o.size_suggested, '\s+', '', 'g'))
  group by 1, 2
  having count(*) >= 10;

revoke all on public.brand_fit from anon, authenticated;
grant select on public.brand_fit to anon, authenticated;
