-- Sizer: chart provenance. Run after 0003.
--   * a chart can now be 'machine_read': found and read by the lookup function, not yet checked by
--     a person. The extension downloads it and says so; flipping it to 'verified' needs no code.
--   * a chart can come from a shop's own house guide ('retailer_house_chart'), used only when the
--     brand has nothing of its own.
--   * read_by and lookup_note record who read a chart and why they believed it is the brand's.
--   * the bundle carries status, source_type, retailer and read_by so the extension can rank.
-- Paste into the Supabase SQL editor and run as a whole.
--
-- Postgres refuses to use an enum value in the transaction that added it ("unsafe use of new
-- value"), and the SQL editor runs a pasted file as one transaction. Every comparison below
-- therefore goes through ::text, so this file applies in one paste.

alter type public.chart_status add value if not exists 'machine_read';
alter type public.source_type add value if not exists 'retailer_house_chart';

alter table public.size_charts
  add column read_by text,
  add column lookup_note text,
  add constraint machine_read_charts_say_who check (status::text <> 'machine_read' or read_by is not null);

comment on column public.size_charts.read_by is 'Who read the chart: null for human research, ''lookup-chart'' for the function.';
comment on column public.size_charts.lookup_note is 'The reader''s one-line justification, for review.';

-- Not a partial index on machine_read: an index predicate may only call IMMUTABLE functions, the
-- enum-to-text cast is STABLE, and the enum literal itself cannot be used in this transaction.
-- A plain index with status as its last column serves the lookup function's
-- "brand + category + verified or machine_read" query just as well.
create index size_charts_brand_category_status_idx on public.size_charts (brand_id, category, status);

-- Same document as before, plus the provenance of each chart.
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
      'source_archive_url', c.source_archive_url,
      'source_type', c.source_type,
      'retailer', c.retailer,
      'status', c.status,
      'read_by', c.read_by,
      'retrieved_on', c.retrieved_on,
      'fit_advice', c.fit_advice,
      'rows', (
        select jsonb_agg(jsonb_build_object(
          'label', r.label, 'aliases', r.aliases,
          'bust',        case when r.bust_min        is null then null else jsonb_build_array(r.bust_min,        r.bust_max)        end,
          'waist',       case when r.waist_min       is null then null else jsonb_build_array(r.waist_min,       r.waist_max)       end,
          'hip',         case when r.hip_min         is null then null else jsonb_build_array(r.hip_min,         r.hip_max)         end,
          'inseam',      case when r.inseam_min      is null then null else jsonb_build_array(r.inseam_min,      r.inseam_max)      end,
          'foot_length', case when r.foot_length_min is null then null else jsonb_build_array(r.foot_length_min, r.foot_length_max) end,
          'extra', r.extra,
          'suspect', case when r.suspect then r.suspect_note else null end
        ) order by r.position)
        from public.size_chart_rows r where r.chart_id = c.id
      )
    ) order by c.category, c.fit_line nulls first)
    from public.size_charts c where c.brand_id = b.id and c.status::text in ('verified', 'machine_read')
  ), '[]'::jsonb) as charts,
  coalesce((
    select jsonb_agg(jsonb_build_object('category', n.category, 'fit_line', n.fit_line, 'tendency', n.tendency, 'note', n.note, 'source_url', n.source_url))
    from public.fit_notes n where n.brand_id = b.id
  ), '[]'::jsonb) as fit_notes,
  greatest(b.updated_at, (select max(c.updated_at) from public.size_charts c where c.brand_id = b.id)) as updated_at
from public.brands b;

grant select on public.chart_bundle to anon, authenticated;

-- Readers may now see machine-read charts too. Drafts and retired charts stay private.
drop policy "public read charts" on public.size_charts;
drop policy "public read rows" on public.size_chart_rows;

create policy "public read charts" on public.size_charts for select to anon, authenticated
  using (status::text in ('verified', 'machine_read'));
create policy "public read rows" on public.size_chart_rows for select to anon, authenticated
  using (exists (select 1 from public.size_charts c where c.id = chart_id and c.status::text in ('verified', 'machine_read')));
