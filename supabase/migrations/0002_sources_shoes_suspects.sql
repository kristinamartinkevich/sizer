-- Sizer: amendments after the research pass. Run after 0001 (already applied on the project).
--   * keep an archive link next to every source link, and a source link on fit notes
--   * conversion-only charts (Diesel, Pieces) have no measurements, so basis and unit may be null together
--   * rows may carry anything else the chart prints (thigh, rise, inseam by length) in `extra`
--   * rows the brand page gets visibly wrong stay as published and are marked suspect
--   * shoes: a category and a foot-length range
-- Paste into the Supabase SQL editor and run. Then paste supabase/seed/charts_draft.sql.

alter type public.chart_category add value if not exists 'shoes';

alter table public.size_charts
  alter column measurement_basis drop not null,
  alter column unit drop not null,
  add column source_archive_url text,
  add constraint basis_and_unit_together check ((measurement_basis is null) = (unit is null)),
  add constraint verified_charts_are_dated check (status <> 'verified' or (verified_by is not null and verified_at is not null));

comment on column public.size_charts.source_url is 'The brand page the chart was read from.';
comment on column public.size_charts.source_archive_url is 'A Wayback Machine snapshot of source_url, taken on retrieved_on.';
comment on column public.size_charts.notes is 'What the researcher saw: typos, contradictions, gaps.';

alter table public.size_chart_rows
  add column foot_length_min numeric(4,1),
  add column foot_length_max numeric(4,1),
  add column extra jsonb not null default '{}'::jsonb,
  add column suspect boolean not null default false,
  add column suspect_note text,
  add constraint foot_length_range check (foot_length_min is null or foot_length_max >= foot_length_min),
  add constraint suspect_rows_say_why check (not suspect or suspect_note is not null);

comment on column public.size_chart_rows.foot_length_min is 'Shoes: heel to longest toe, in the chart''s unit.';
comment on column public.size_chart_rows.extra is 'Anything else the chart prints: thigh, rise, front_rise, inseam_by_length.';
comment on column public.size_chart_rows.suspect is 'Kept exactly as published, but visibly wrong on the brand page; the engine skips it.';

alter table public.fit_notes add column source_url text;

-- Same columns as before plus the new fields, so the extension keeps reading one document per brand.
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
    from public.size_charts c where c.brand_id = b.id and c.status = 'verified'
  ), '[]'::jsonb) as charts,
  coalesce((
    select jsonb_agg(jsonb_build_object('category', n.category, 'fit_line', n.fit_line, 'tendency', n.tendency, 'note', n.note, 'source_url', n.source_url))
    from public.fit_notes n where n.brand_id = b.id
  ), '[]'::jsonb) as fit_notes,
  greatest(b.updated_at, (select max(c.updated_at) from public.size_charts c where c.brand_id = b.id)) as updated_at
from public.brands b;

grant select on public.chart_bundle to anon, authenticated;
