#!/bin/sh
# Applies every migration to a throwaway local Postgres, each file as ONE transaction, the way the
# Supabase SQL editor runs a pasted file. A migration that only works when split, or that trips a
# Postgres rule (an enum value used in the transaction that added it, a non-immutable index
# predicate), fails here instead of in the operator's dashboard.
#   sh tools/check-migrations.sh            needs initdb, pg_ctl and psql on PATH
set -eu
cd "$(dirname "$0")/.."
# Without a valid locale the macOS postmaster aborts with "became multithreaded during startup".
export LC_ALL=C

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null || { echo "check-migrations: $bin not found (brew install postgresql@16)" >&2; exit 2; }
done

# A short path: the server's Unix socket lives here, and macOS caps socket paths near 104 bytes.
dir=$(mktemp -d /tmp/sizer-pg.XXXXXX)
port=$(( 20000 + $$ % 20000 ))
cleanup() { pg_ctl -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT INT TERM

initdb -D "$dir/data" -U postgres -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "$dir/data" -o "-p $port -k $dir -c listen_addresses=''" -l "$dir/log" -w start >/dev/null \
  || { echo "check-migrations: server did not start" >&2; cat "$dir/log" >&2; exit 2; }

run() { psql -h "$dir" -p "$port" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

# The API roles Supabase provides, which the migrations grant to, and the default privileges a
# Supabase project gives them on every new table in public: RLS and explicit revokes are what keep
# a table private there, so the check must not get privacy for free from missing grants.
run -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"
run -c "grant usage on schema public to anon, authenticated, service_role;"
run -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;"

for f in supabase/migrations/*.sql; do
  if run -1 -f "$f" >"$dir/out" 2>&1; then
    echo "ok   $f"
  else
    echo "FAIL $f"; sed 's/^/     /' "$dir/out"; exit 1
  fi
done

# What the anonymous role sees: verified and machine-read charts with their provenance, never drafts.
run >/dev/null <<'SQL'
insert into public.brands (id, name, aliases) values ('helsa', 'Helsa', '{helsa}');
insert into public.size_charts (brand_id, category, measurement_basis, unit, size_system, source_url, source_type, retailer, retrieved_on, status, read_by)
values ('helsa', 'dresses', 'body', 'cm', 'letter', 'https://helsastudio.com/size-guide', 'brand_site', null, '2026-10-05', 'machine_read', 'lookup-chart'),
       ('helsa', 'tops', 'body', 'cm', 'letter', 'https://www.revolve.com/sizeguide', 'retailer_house_chart', 'revolve.com', '2026-10-05', 'draft', null);
set role anon;
do $$
declare charts jsonb;
begin
  select b.charts into charts from public.chart_bundle b where b.brand_id = 'helsa';
  if jsonb_array_length(charts) <> 1 then raise exception 'anon sees % charts for helsa, expected 1', jsonb_array_length(charts); end if;
  if charts->0->>'status' <> 'machine_read' or charts->0->>'source_type' <> 'brand_site' or charts->0->>'read_by' <> 'lookup-chart'
    then raise exception 'chart provenance missing from the bundle: %', charts->0; end if;
  if (select count(*) from public.size_charts) <> 1 then raise exception 'anon can read a draft chart'; end if;
end $$;
SQL
echo "ok   chart_bundle serves machine-read charts with provenance and hides drafts"

# The lookup ledger: the function (service role) writes and reads it; the public key can do neither.
run >/dev/null <<'SQL'
set role service_role;
insert into public.chart_lookups (brand, kind, shop, install, outcome, reason)
values ('helsa', 'dresses', 'revolveclothing.fr', '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64', 'no_chart', 'no size guide');
do $$
begin
  if (select count(*) from public.chart_lookups) <> 1 then raise exception 'the service role cannot read chart_lookups'; end if;
end $$;
reset role;
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.chart_lookups'::regclass) then
    raise exception 'chart_lookups has row level security off';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chart_lookups') then
    raise exception 'chart_lookups has a policy, it should have none';
  end if;
end $$;
set role anon;
do $$
declare seen bigint;
begin
  begin
    select count(*) into seen from public.chart_lookups;
    if seen > 0 then raise exception 'anon can read chart_lookups (% rows)', seen; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.chart_lookups (brand, kind, shop, install, outcome)
    values ('x', 'tops', 'example.com', '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64', 'chart');
    raise exception 'anon can write chart_lookups';
  exception when insufficient_privilege then null;
  end;
end $$;
SQL
echo "ok   chart_lookups is written by the service role and closed to anon"

# Fit dossiers (0006): the function (service role) writes dossiers and the ledger; the public key
# reads dossiers through fit_dossier_public only, and cannot read the tables or write anything.
run >/dev/null <<'SQL'
do $$
declare caps record;
begin
  select per_install_per_day, global_per_day into caps from public.fit_dossier_settings;
  if caps.per_install_per_day <> 40 or caps.global_per_day <> 2000 then raise exception 'fit_dossier_settings seeded with %', caps; end if;
  if exists (select 1 from pg_class where oid in ('public.fit_dossiers'::regclass, 'public.dossier_requests'::regclass, 'public.fit_dossier_settings'::regclass) and not relrowsecurity) then
    raise exception 'a fit dossier table has row level security off';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('fit_dossiers', 'dossier_requests', 'fit_dossier_settings')) then
    raise exception 'a fit dossier table has a policy, it should have none';
  end if;
  -- The grants are revoked as well as RLS being on, so either alone still keeps the tables closed.
  if exists (select 1 from unnest(array['public.fit_dossiers', 'public.dossier_requests', 'public.fit_dossier_settings']) t,
                           unnest(array['anon', 'authenticated']) r,
                           unnest(array['select', 'insert', 'update', 'delete']) p
             where has_table_privilege(r, t, p)) then
    raise exception 'an API role still holds a grant on a fit dossier table';
  end if;
  if has_table_privilege('anon', 'public.fit_dossier_public', 'insert') or has_table_privilege('anon', 'public.fit_dossier_public', 'update')
     or has_table_privilege('anon', 'public.fit_dossier_public', 'delete') then
    raise exception 'anon holds a write grant on fit_dossier_public';
  end if;
end $$;
set role service_role;
insert into public.fit_dossiers (item_key, brand, style, kind, verdict, strength, areas, brand_note, sources)
values ('helsa|wd1', 'Helsa', 'WD1', 'dresses', 'small', 0.7,
        '[{"area":"bust","direction":"tight","note":"Snug across the bust."}]',
        'Cuts slim through the bodice.', '[{"url":"https://example.com/review","title":"Review"}]');
insert into public.fit_dossiers (item_key, brand, style, kind, verdict, strength, areas, brand_note, sources)
values ('helsa|wd1', 'Helsa', 'WD1', 'dresses', 'large', 0.5, '[]', null, '[]')
on conflict (item_key) do update set verdict = excluded.verdict, strength = excluded.strength, created_at = now();
insert into public.dossier_requests (item_key, brand, kind, shop, install, outcome)
values ('helsa|wd1', 'Helsa', 'dresses', 'revolveclothing.fr', '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64', 'pending');
update public.dossier_requests set outcome = 'dossier' where item_key = 'helsa|wd1';
do $$
begin
  if (select count(*) from public.fit_dossiers) <> 1 then raise exception 'the upsert on item_key added a second dossier'; end if;
  if (select verdict from public.fit_dossiers) <> 'large' then raise exception 'the upsert on item_key did not replace the dossier'; end if;
  if (select count(*) from public.dossier_requests where outcome = 'dossier') <> 1 then raise exception 'the service role cannot write dossier_requests'; end if;
  if (select count(*) from public.fit_dossier_settings) <> 1 then raise exception 'the service role cannot read fit_dossier_settings'; end if;
end $$;
reset role;
set role anon;
do $$
declare seen bigint; cols text;
begin
  if (select count(*) from public.fit_dossier_public where item_key = 'helsa|wd1') <> 1 then raise exception 'anon cannot read fit_dossier_public'; end if;
  select string_agg(column_name, ',' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'fit_dossier_public';
  if cols <> 'item_key,verdict,strength,areas,brand_note,sources,created_at' then raise exception 'fit_dossier_public serves %', cols; end if;
  begin
    select count(*) into seen from public.fit_dossiers;
    if seen > 0 then raise exception 'anon can read fit_dossiers (% rows)', seen; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into seen from public.dossier_requests;
    if seen > 0 then raise exception 'anon can read dossier_requests (% rows)', seen; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into seen from public.fit_dossier_settings;
    if seen > 0 then raise exception 'anon can read fit_dossier_settings (% rows)', seen; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.fit_dossier_public (item_key, verdict, strength, areas, brand_note, sources)
    values ('x|y', 'small', 1, '[]', null, '[]');
    raise exception 'anon can write through fit_dossier_public';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.fit_dossier_public set verdict = 'tts';
    raise exception 'anon can update through fit_dossier_public';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.fit_dossier_public;
    raise exception 'anon can delete through fit_dossier_public';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.fit_dossiers (item_key, brand, style, kind) values ('x|y', 'x', 'y', 'tops');
    raise exception 'anon can write fit_dossiers';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.dossier_requests (item_key, brand, kind, shop, install, outcome)
    values ('x|y', 'x', 'tops', 'example.com', '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64', 'pending');
    raise exception 'anon can write dossier_requests';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.fit_dossier_settings set per_install_per_day = 100000;
    raise exception 'anon can change fit_dossier_settings';
  exception when insufficient_privilege then null;
  end;
end $$;
SQL
echo "ok   fit_dossier_public is the only thing anon reads from 0006, and anon writes nothing"

# The chart image reader (0007): the function (service role) writes and reads chart_images and the
# caps row; the public key can do neither; a product-text call keeps nothing about the page.
run >/dev/null <<'SQL'
set role service_role;
insert into public.chart_images (route, url_hash, image_url, brand, kind, install, outcome, chart)
values ('image', repeat('a', 64), 'https://cdn.example/size-chart.png', 'helsa', 'dresses', '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64', 'chart', '{"category":"general"}'),
       ('product', null, null, null, null, '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64', 'read', null);
do $$
begin
  if (select count(*) from public.chart_images) <> 2 then raise exception 'the service role cannot read chart_images'; end if;
  if (select per_install_per_day from public.chart_image_settings) <> 40 or (select global_per_day from public.chart_image_settings) <> 2000
    then raise exception 'the caps row is missing or not 40 and 2000'; end if;
  update public.chart_image_settings set per_install_per_day = 41;
  begin
    insert into public.chart_image_settings (id) values (false);
    raise exception 'chart_image_settings took a second row';
  exception when check_violation then null;
  end;
  begin
    insert into public.chart_images (route, image_url, install, outcome)
    values ('product', 'https://shop.example/p/1', '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64', 'read');
    raise exception 'a product row kept a page address';
  exception when check_violation then null;
  end;
  begin
    insert into public.chart_images (route, url_hash, image_url, brand, kind, install, outcome)
    values ('image', repeat('b', 64), 'http://cdn.example/size-chart.png', 'helsa', 'dresses', '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64', 'no_chart');
    raise exception 'an image row took a non-https address';
  exception when check_violation then null;
  end;
end $$;
reset role;
do $$
declare t text;
begin
  foreach t in array array['chart_images', 'chart_image_settings'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception '% has row level security off', t; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then raise exception '% has a policy, it should have none', t; end if;
  end loop;
end $$;
set role anon;
do $$
declare seen bigint;
begin
  begin
    select count(*) into seen from public.chart_images;
    if seen > 0 then raise exception 'anon can read chart_images (% rows)', seen; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into seen from public.chart_image_settings;
    if seen > 0 then raise exception 'anon can read chart_image_settings'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.chart_images (route, install, outcome) values ('product', '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64', 'read');
    raise exception 'anon can write chart_images';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.chart_image_settings set global_per_day = 1000000;
    if found then raise exception 'anon can change the caps'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
SQL
echo "ok   chart_images and its caps row are written by the service role and closed to anon"

# Fit outcomes (0008): the public key writes outcomes only through report_fit_outcome(), which
# validates them; it cannot read or write fit_outcomes; it reads brand_fit, counts per brand and kind
# where the size bought was the size suggested, shown only from ten outcomes.
run >/dev/null <<'SQL'
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.fit_outcomes'::regclass) then raise exception 'fit_outcomes has row level security off'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fit_outcomes') then raise exception 'fit_outcomes has a policy, it should have none'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete']) p
             where has_table_privilege(r, 'public.fit_outcomes', p)) then
    raise exception 'an API role still holds a grant on fit_outcomes';
  end if;
  if has_table_privilege('anon', 'public.brand_fit', 'insert') or has_table_privilege('anon', 'public.brand_fit', 'update')
     or has_table_privilege('anon', 'public.brand_fit', 'delete') then
    raise exception 'anon holds a write grant on brand_fit';
  end if;
end $$;
set role anon;
do $$
declare i integer; seen bigint; cols text; row record;
begin
  -- Ten buyers of rag & bone jeans who bought the suggested size: eight too small, two right.
  for i in 1..10 loop
    perform public.report_fit_outcome(
      item_key => 'rag and bone|wren', brand => case when i % 2 = 0 then 'rag & bone' else 'RAG&BONE' end, kind => 'bottoms',
      shop => 'www.Zalando.de', install => ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
      size_bought => 'W27 ', size_suggested => 'w27', outcome => case when i <= 8 then 'small' else 'right' end,
      areas => case when i <= 8 then array['waist', 'hip'] else '{}' end, chart_tier => 2);
  end loop;
  -- A buyer who chose another size says nothing about Sizer's answer for the brand.
  perform public.report_fit_outcome('rag and bone|wren', 'rag & bone', 'bottoms', 'www.zalando.de',
    '00000000-0000-4000-8000-000000000099', '28', '27', 'big', '{}', null);
  -- The first install changes its mind: its answer is replaced, not added.
  perform public.report_fit_outcome('rag and bone|wren', 'rag & bone', 'bottoms', 'www.zalando.de',
    '00000000-0000-4000-8000-000000000001', 'W27', 'W27', 'right', '{}', 2);
  -- A suggestion that already carried a learned step does not vote (it would vote the step away).
  perform public.report_fit_outcome(item_key => 'rag and bone|wren', brand => 'rag & bone', kind => 'bottoms',
    shop => 'www.zalando.de', install => '00000000-0000-4000-8000-000000000098'::uuid, size_bought => 'W28',
    size_suggested => 'W28', outcome => 'right', learned_step => 1);
  -- One install answering for ten items of one brand is one vote, and one vote shows nothing.
  for i in 1..10 loop
    perform public.report_fit_outcome('solo brand|s' || i, 'Solo Brand', 'bottoms', 'shop.example',
      '00000000-0000-4000-8000-00000000501a', '30', '30', 'small', '{}', null);
  end loop;
  -- Three outcomes for another brand stay hidden.
  for i in 1..3 loop
    perform public.report_fit_outcome('mother|looker', 'MOTHER', 'bottoms', 'www.revolve.com',
      ('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, '26', '26', 'small', '{}', 1);
  end loop;

  select string_agg(column_name, ',' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'brand_fit';
  if cols <> 'brand_key,kind,small,tts,large,total' then raise exception 'brand_fit serves %', cols; end if;
  if (select count(*) from public.brand_fit) <> 1 then raise exception 'brand_fit shows % rows, expected only rag and bone', (select count(*) from public.brand_fit); end if;
  select * into row from public.brand_fit;
  if row.brand_key <> 'rag and bone' or row.kind <> 'bottoms' or row.small <> 7 or row.tts <> 3 or row.large <> 0 or row.total <> 10 then
    raise exception 'brand_fit row is %', row;
  end if;

  begin
    perform public.report_fit_outcome('rag and bone|wren', 'rag & bone', 'bottoms', 'www.zalando.de', gen_random_uuid(), '27', '27', 'meh', '{}', null);
    raise exception 'an unknown outcome was accepted';
  exception when raise_exception then
    if sqlerrm not like 'outcome must be%' then raise; end if;
  end;
  begin
    perform public.report_fit_outcome(item_key => 'rag and bone|wren', brand => 'rag & bone', kind => 'bottoms', shop => 'www.zalando.de',
      install => gen_random_uuid(), size_bought => '27', size_suggested => '27', outcome => 'small', learned_step => 2);
    raise exception 'a learned step of 2 was accepted';
  exception when raise_exception then
    if sqlerrm not like 'learned_step must be%' then raise; end if;
  end;
  begin
    perform public.report_fit_outcome('rag and bone|wren', 'rag & bone', 'hats', 'www.zalando.de', gen_random_uuid(), '27', '27', 'small', '{}', null);
    raise exception 'an unknown kind was accepted';
  exception when raise_exception then
    if sqlerrm not like 'unknown kind%' then raise; end if;
  end;
  begin
    perform public.report_fit_outcome('rag and bone|wren', 'rag & bone', 'bottoms', 'www.zalando.de', gen_random_uuid(), '27', '27', 'small', array['waist', 'measurements 70 97'], null);
    raise exception 'an unknown area was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.report_fit_outcome('https://shop.example/p/1', 'rag & bone', 'bottoms', 'www.zalando.de', gen_random_uuid(), '27', '27', 'small', '{}', null);
    raise exception 'an item key shaped like an address was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.report_fit_outcome('rag and bone|wren', 'rag & bone', 'bottoms', 'https://www.zalando.de/p', gen_random_uuid(), '27', '27', 'small', '{}', null);
    raise exception 'a shop that is not a hostname was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.report_fit_outcome('rag and bone|wren', 'rag & bone', 'bottoms', 'www.zalando.de', gen_random_uuid(), ' ', '27', 'small', '{}', null);
    raise exception 'an empty size bought was accepted';
  exception when check_violation then null;
  end;

  -- One install is held to fifty outcomes a day.
  for i in 1..50 loop
    perform public.report_fit_outcome('cap test|s' || i, 'Cap Test', 'tops', 'shop.example', '00000000-0000-4000-8000-00000000ca00', 'M', 'M', 'right', '{}', null);
  end loop;
  begin
    perform public.report_fit_outcome('cap test|s51', 'Cap Test', 'tops', 'shop.example', '00000000-0000-4000-8000-00000000ca00', 'M', 'M', 'right', '{}', null);
    raise exception 'the fifty-first outcome of the day was accepted';
  exception when raise_exception then
    if sqlerrm not like 'too many outcomes%' then raise; end if;
  end;

  begin
    select count(*) into seen from public.fit_outcomes;
    if seen > 0 then raise exception 'anon can read fit_outcomes (% rows)', seen; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.fit_outcomes (item_key, brand, kind, shop, install_id, size_bought, size_suggested, outcome)
    values ('x|y', 'x', 'tops', 'shop.example', gen_random_uuid(), 'M', 'M', 'small');
    raise exception 'anon can write fit_outcomes directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.brand_fit;
    raise exception 'anon can delete through brand_fit';
  exception when insufficient_privilege or feature_not_supported or object_not_in_prerequisite_state then null;
  end;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.fit_outcomes where item_key = 'rag and bone|wren') <> 12 then raise exception 'the replaced answer was added instead'; end if;
  if (select shop from public.fit_outcomes limit 1) <> 'www.zalando.de' then raise exception 'the shop was not lower-cased'; end if;
end $$;
SQL
echo "ok   fit_outcomes is written through report_fit_outcome only; anon reads brand_fit counts, one vote per install, from ten installs"
