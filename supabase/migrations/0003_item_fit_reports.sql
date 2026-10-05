-- Sizer: pooled fit reports. Run after 0002.
--   Every Sizer install that reads buyers' reviews on a product page sends the tally (how many said
--   runs small / runs large / true to size) for that style on that shop. Nothing about the person
--   travels: brand, style, shop hostname, the counts, and a random per-install id used only so a
--   re-read replaces the earlier report instead of adding to it.
--   The public key cannot read or write the table directly: writes go through report_item_fit(),
--   reads through item_fit_by_vendor, which shows one row per style and shop.
-- Paste into the Supabase SQL editor and run.

create table public.item_fit_reports (
  item_key     text        not null,                      -- "<brand>|<style>", normalised by the extension
  brand        text        not null,
  style        text        not null,
  vendor       text        not null,                      -- shop hostname
  install_id   uuid        not null,
  small        integer     not null,
  large        integer     not null,
  tts          integer     not null,
  total        integer     not null,
  from_summary boolean     not null default false,        -- counts derived from the shop's own fit bar
  reported_at  timestamptz not null default now(),
  primary key (item_key, vendor, install_id),
  constraint counts_sane check (small >= 0 and large >= 0 and tts >= 0 and total >= 0 and small + large + tts <= total and total <= 5000),
  constraint key_shape check (item_key ~ '^[a-z0-9 ]+\|[a-z0-9]+$' and length(item_key) <= 120),
  constraint vendor_shape check (vendor ~ '^[a-z0-9.-]+$' and length(vendor) <= 120),
  constraint names_short check (length(brand) <= 80 and length(style) <= 80)
);

create index item_fit_reports_install_idx on public.item_fit_reports (install_id, reported_at);

alter table public.item_fit_reports enable row level security;
-- No policies on purpose: anon and authenticated reach the rows only through the function and the view below.

create or replace function public.report_item_fit(
  p_item_key text, p_brand text, p_style text, p_vendor text, p_install uuid,
  p_small integer, p_large integer, p_tts integer, p_total integer, p_from_summary boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.item_fit_reports where install_id = p_install and reported_at > now() - interval '1 day') >= 300 then
    raise exception 'too many reports from this install today';
  end if;
  insert into public.item_fit_reports (item_key, brand, style, vendor, install_id, small, large, tts, total, from_summary)
  values (p_item_key, p_brand, p_style, p_vendor, p_install, p_small, p_large, p_tts, p_total, coalesce(p_from_summary, false))
  on conflict (item_key, vendor, install_id) do update
    set small = excluded.small, large = excluded.large, tts = excluded.tts, total = excluded.total,
        from_summary = excluded.from_summary, brand = excluded.brand, style = excluded.style, reported_at = now();
end $$;

revoke all on function public.report_item_fit(text, text, text, text, uuid, integer, integer, integer, integer, boolean) from public;
grant execute on function public.report_item_fit(text, text, text, text, uuid, integer, integer, integer, integer, boolean) to anon, authenticated;

-- One row per style and shop: the fullest, most recent read of that shop's reviews, so many
-- installs reading the same shop page never multiply its reviews.
create or replace view public.item_fit_by_vendor as
  select distinct on (item_key, vendor)
    item_key, vendor, small, large, tts, total, from_summary, reported_at
  from public.item_fit_reports
  order by item_key, vendor, total desc, reported_at desc;

grant select on public.item_fit_by_vendor to anon, authenticated;
