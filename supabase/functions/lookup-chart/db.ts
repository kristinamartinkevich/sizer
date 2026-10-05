// The function's database client: Supabase's REST endpoint (PostgREST) through plain fetch, with the
// service-role key Supabase injects into the function's environment. The key goes only into these
// request headers; it is never logged, returned or written, and errors carry the status and the
// response body, never the request.
import type { BrandRecord, LookupDb, LookupRecord, StoredChart, StoredRow } from "./handler.ts";

export function restDb(supabaseUrl: string, serviceKey: string, f: typeof fetch = fetch): LookupDb {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;

  async function call(op: string, method: string, path: string, params: Record<string, string>, opts: { body?: unknown; prefer?: string } = {}) {
    const url = new URL(`${base}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    };
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

  // A text[] literal holding one element, quoted so commas, braces and spaces in a brand survive.
  const arrayLiteral = (s: string) => `{"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"}`;

  return {
    async findBrand(alias, slug) {
      const select = "id,name,aliases,website";
      const byAlias = await rows<BrandRecord>("findBrand", "brands", { select, aliases: `cs.${arrayLiteral(alias)}`, limit: "1" });
      if (byAlias.length) return byAlias[0];
      const byId = await rows<BrandRecord>("findBrand", "brands", { select, id: `eq.${slug}`, limit: "1" });
      return byId[0] ?? null;
    },

    findCharts(brandId, categories) {
      return rows<StoredChart>("findCharts", "size_charts", {
        select: "*,size_chart_rows(*)",
        brand_id: `eq.${brandId}`,
        category: `in.(${categories.join(",")})`,
        status: "in.(verified,machine_read)",
        "size_chart_rows.order": "position.asc",
      });
    },

    async latestNoChart(brand, kind, since) {
      const found = await rows<{ reason: string | null }>("latestNoChart", "chart_lookups", {
        select: "reason,created_at",
        brand: `eq.${brand}`,
        kind: `eq.${kind}`,
        outcome: "eq.no_chart",
        created_at: `gt.${since}`,
        order: "created_at.desc",
        limit: "1",
      });
      return found.length ? { reason: found[0].reason } : null;
    },

    async countLookups(since, install) {
      const params: Record<string, string> = { select: "id", created_at: `gt.${since}` };
      if (install) params.install = `eq.${install}`;
      const res = await call("countLookups", "HEAD", "chart_lookups", params, { prefer: "count=exact" });
      const range = res.headers.get("content-range") || "";
      const total = Number(range.split("/")[1]);
      if (!Number.isInteger(total)) throw new Error(`countLookups failed: no count in Content-Range "${range}"`);
      return total;
    },

    async insertBrand(brand) {
      await call("insertBrand", "POST", "brands", { on_conflict: "id" }, { body: brand, prefer: "resolution=ignore-duplicates,return=minimal" });
    },

    async setAliases(id, aliases) {
      await call("setAliases", "PATCH", "brands", { id: `eq.${id}` }, { body: { aliases }, prefer: "return=minimal" });
    },

    async insertChart(record) {
      const res = await call("insertChart", "POST", "size_charts", {}, { body: record, prefer: "return=representation" });
      const [row] = await res.json() as StoredChart[];
      if (!row) throw new Error("insertChart failed: nothing returned");
      return row;
    },

    async insertRows(records) {
      const res = await call("insertRows", "POST", "size_chart_rows", {}, { body: records, prefer: "return=representation" });
      return await res.json() as StoredRow[];
    },

    async deleteChart(id) {
      await call("deleteChart", "DELETE", "size_charts", { id: `eq.${id}` }, { prefer: "return=minimal" });
    },

    async recordLookup(record: LookupRecord) {
      await call("recordLookup", "POST", "chart_lookups", {}, { body: record, prefer: "return=minimal" });
    },
  };
}
