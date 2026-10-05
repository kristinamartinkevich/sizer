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
