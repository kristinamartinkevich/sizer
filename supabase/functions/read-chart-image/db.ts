// The function's database client: Supabase's REST endpoint (PostgREST) through plain fetch, with the
// service-role key Supabase injects into the function's environment. The key goes only into these
// request headers; it is never logged, returned or written, and errors carry the status and the
// response body, never the request. Copied from lookup-chart's db.ts; nothing is shared at runtime.
import type { CallRecord, ImageDb, StoredRead } from "./handler.ts";

export function restDb(supabaseUrl: string, serviceKey: string, f: typeof fetch = fetch): ImageDb {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;

  async function call(op: string, method: string, path: string, params: Record<string, string>, opts: { body?: unknown; prefer?: string } = {}) {
    const url = new URL(`${base}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers.Prefer = opts.prefer;
    const res = await f(url.toString(), { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`${op} failed: HTTP ${res.status} ${text}`);
    }
    return res;
  }

  async function rows<T>(op: string, path: string, params: Record<string, string>): Promise<T[]> {
    return await (await call(op, "GET", path, params)).json() as T[];
  }

  return {
    async cachedImage(urlHash, noChartSince) {
      const found = await rows<StoredRead>("cachedImage", "chart_images", {
        select: "outcome,chart,reason",
        route: "eq.image",
        url_hash: `eq.${urlHash}`,
        or: `(outcome.eq.chart,and(outcome.eq.no_chart,created_at.gt.${noChartSince}))`,
        order: "outcome.asc,created_at.desc",
        limit: "1",
      });
      return found[0] ?? null;
    },

    async capSettings() {
      const found = await rows<{ per_install_per_day: number; global_per_day: number }>("capSettings", "chart_image_settings", {
        select: "per_install_per_day,global_per_day",
        limit: "1",
      });
      return found[0] ?? null;
    },

    async countCalls(since, install) {
      const params: Record<string, string> = { select: "id", created_at: `gt.${since}` };
      if (install) params.install = `eq.${install}`;
      const res = await call("countCalls", "HEAD", "chart_images", params, { prefer: "count=exact" });
      const range = res.headers.get("content-range") || "";
      const total = Number(range.split("/")[1]);
      if (!range || !Number.isInteger(total)) throw new Error(`countCalls failed: no count in Content-Range "${range}"`);
      return total;
    },

    async reserveCall(record: CallRecord) {
      const res = await call("reserveCall", "POST", "chart_images", { select: "id" }, { body: { ...record, outcome: "pending" }, prefer: "return=representation" });
      const [row] = await res.json() as { id: string }[];
      if (!row) throw new Error("reserveCall failed: nothing returned");
      return row.id;
    },

    async finishCall(id, outcome, reason, chart) {
      await call("finishCall", "PATCH", "chart_images", { id: `eq.${id}` }, { body: { outcome, reason, chart }, prefer: "return=minimal" });
    },

    async cancelCall(id) {
      await call("cancelCall", "DELETE", "chart_images", { id: `eq.${id}` }, { prefer: "return=minimal" });
    },
  };
}
