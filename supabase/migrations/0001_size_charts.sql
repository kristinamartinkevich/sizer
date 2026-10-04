-- Sizer: brand size charts, sourced from each brand's official size guide.
-- Paste into the Supabase SQL editor (Dashboard → SQL Editor → New query → Run).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- brands
-- ---------------------------------------------------------------------------
create table public.brands (
  id          text primary key,                      -- stable slug, e.g. 'rag-bone'
  name        text not null,                         -- display name, e.g. 'rag & bone'
  aliases     text[] not null default '{}',          -- spellings seen on shop pages, lowercase
  website     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- size_charts: one published chart from one source, as a whole
-- ---------------------------------------------------------------------------
create type public.measurement_basis as enum ('body', 'garment');
create type public.chart_category as enum ('jeans', 'trousers', 'bottoms', 'tops', 'dresses', 'general');
create type public.size_system as enum ('denim_waist', 'eu', 'us', 'uk', 'it', 'fr', 'letter', 'mixed');
create type public.source_type as enum ('brand_site', 'retailer_brand_chart');
create type public.chart_status as enum ('draft', 'verified', 'retired');

create table public.size_charts (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           text not null references public.brands(id) on delete cascade,
  gender             text not null default 'women' check (gender in ('women', 'men', 'unisex')),
  category           public.chart_category not null,
  fit_line           text,                           -- e.g. 'Ribcage', when a fit has its own chart
  measurement_basis  public.measurement_basis not null,
  basis_evidence     text,                           -- the wording that proves body vs garment
  unit               text not null check (unit in ('cm', 'in')),
  size_system        public.size_system not null,
  source_url         text not null,
  source_type        public.source_type not null,
  retailer           text,                           -- set when source_type = 'retailer_brand_chart'
  retrieved_on       date not null,
  fit_advice         text,                           -- verbatim advice from the guide, if any
  status             public.chart_status not null default 'draft',
  verified_by        text,
  verified_at        timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint retailer_when_retailer_source
    check (source_type <> 'retailer_brand_chart' or retailer is not null)
);

create index size_charts_brand_idx on public.size_charts (brand_id, gender, category) where status = 'verified';

-- ---------------------------------------------------------------------------
-- size_chart_rows: one size on one chart. Measurements are ranges, as published.
-- A single published value v is stored as [v, v]. Null means the chart doesn't give it.
-- ---------------------------------------------------------------------------
create table public.size_chart_rows (
  id          uuid primary key default gen_random_uuid(),
  chart_id    uuid not null references public.size_charts(id) on delete cascade,
  position    smallint not null,                     -- order on the chart, smallest first
  label       text not null,                         -- exactly as printed: '27', '38', 'M', 'W27'
  aliases     jsonb not null default '{}'::jsonb,    -- {"us":"4","eu":"36","uk":"8","letter":"S"}
  bust_min    numeric(5,1), bust_max    numeric(5,1),
  waist_min   numeric(5,1), waist_max   numeric(5,1),
  hip_min     numeric(5,1), hip_max     numeric(5,1),
  inseam_min  numeric(5,1), inseam_max  numeric(5,1),
  unique (chart_id, position),
  unique (chart_id, label),
  check (bust_min   is null or bust_max   >= bust_min),
  check (waist_min  is null or waist_max  >= waist_min),
  check (hip_min    is null or hip_max    >= hip_min),
  check (inseam_min is null or inseam_max >= inseam_min)
);

-- ---------------------------------------------------------------------------
-- fit_notes: brand-level fit reputation, kept apart from the published chart
-- so opinion never gets mixed into measured data.
-- ---------------------------------------------------------------------------
create table public.fit_notes (
  id          uuid primary key default gen_random_uuid(),
  brand_id    text not null references public.brands(id) on delete cascade,
  category    public.chart_category,                 -- null = whole brand
  fit_line    text,
  tendency    numeric(3,2) not null default 0 check (tendency between -1 and 1), -- +0.5 = leans half a size small
  note        text not null,                         -- shown to the shopper, plain words
  evidence    text,                                  -- where this came from
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at upkeep
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger brands_touch before update on public.brands for each row execute function public.touch_updated_at();
create trigger size_charts_touch before update on public.size_charts for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- What the extension downloads: verified charts only, one JSON document per brand.
-- ---------------------------------------------------------------------------
create or replace view public.chart_bundle as
select
  b.id as brand_id,
  b.name as brand_name,
  b.aliases,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'gender', c.gender,
      'category', c.category,
      'fit_line', c.fit_line,
      'measurement_basis', c.measurement_basis,
      'unit', c.unit,
      'size_system', c.size_system,
      'source_url', c.source_url,
      'retrieved_on', c.retrieved_on,
      'fit_advice', c.fit_advice,
      'rows', (
        select jsonb_agg(jsonb_build_object(
          'label', r.label, 'aliases', r.aliases,
          'bust', case when r.bust_min is null then null else jsonb_build_array(r.bust_min, r.bust_max) end,
          'waist', case when r.waist_min is null then null else jsonb_build_array(r.waist_min, r.waist_max) end,
          'hip', case when r.hip_min is null then null else jsonb_build_array(r.hip_min, r.hip_max) end,
          'inseam', case when r.inseam_min is null then null else jsonb_build_array(r.inseam_min, r.inseam_max) end
        ) order by r.position)
        from public.size_chart_rows r where r.chart_id = c.id
      )
    ) order by c.category, c.fit_line nulls first)
    from public.size_charts c where c.brand_id = b.id and c.status = 'verified'
  ), '[]'::jsonb) as charts,
  coalesce((
    select jsonb_agg(jsonb_build_object('category', n.category, 'fit_line', n.fit_line, 'tendency', n.tendency, 'note', n.note))
    from public.fit_notes n where n.brand_id = b.id
  ), '[]'::jsonb) as fit_notes,
  greatest(b.updated_at, (select max(c.updated_at) from public.size_charts c where c.brand_id = b.id)) as updated_at
from public.brands b;

-- ---------------------------------------------------------------------------
-- Access: anyone may read, nobody may write through the API.
-- Writes happen in the SQL editor or with the service key, never from the extension.
-- ---------------------------------------------------------------------------
alter table public.brands enable row level security;
alter table public.size_charts enable row level security;
alter table public.size_chart_rows enable row level security;
alter table public.fit_notes enable row level security;

create policy "public read brands"      on public.brands          for select to anon, authenticated using (true);
create policy "public read charts"      on public.size_charts     for select to anon, authenticated using (status = 'verified');
create policy "public read rows"        on public.size_chart_rows for select to anon, authenticated
  using (exists (select 1 from public.size_charts c where c.id = chart_id and c.status = 'verified'));
create policy "public read fit notes"   on public.fit_notes       for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.brands, public.size_charts, public.size_chart_rows, public.fit_notes, public.chart_bundle to anon, authenticated;
