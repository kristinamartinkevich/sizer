# Commitments from feat-brand-chart-lookup-b3

No commitments. Everything in HANDOFF §3.3, and the coordinator's additions (check-migrations for 0005
with anon closed out of chart_lookups; waist and hip, or foot length, required on two rows), was built
in this bundle. Nothing was deferred.

For B4, not a deferral: the lookup function drops `shopGuide.charts[].source_url` on input, but B4 must
still not send the page address, as HANDOFF §3.4 item 4 says. Deploy needs `--no-verify-jwt` (see
`supabase/functions/lookup-chart/README.md`).

## Amendments to prior commitments

None.
