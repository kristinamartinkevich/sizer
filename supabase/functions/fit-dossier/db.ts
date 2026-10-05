// The function's database client: Supabase's REST endpoint (PostgREST) through plain fetch, with the
// service-role key Supabase injects into the function's environment. The key goes only into these
// request headers; it is never logged, returned or written, and errors carry the status and the
// response body, never the request. Copied from lookup-chart/db.ts; nothing is shared at runtime.
import type { Caps, DossierDb, RequestRecord, StoredDossier } from "./handler.ts";

// The columns fit_dossier_public serves: what the function returns, never brand, style or kind.
const PUBLIC = "item_key,verdict,strength,areas,brand_note,sources,created_at";

export function restDb(supabaseUrl: string, serviceKey: string, f: typeof fetch = fetch): DossierDb {
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

  return {
    async findDossier(itemKey, since) {
      const found = await rows<StoredDossier>("findDossier", "fit_dossiers", {
        select: PUBLIC,
        item_key: `eq.${itemKey}`,
        created_at: `gt.${since}`,
        limit: "1",
      });
      return found[0] ?? null;
    },

    async readCaps() {
      const found = await rows<{ per_install_per_day: number; global_per_day: number }>("readCaps", "fit_dossier_settings", {
        select: "per_install_per_day,global_per_day",
        limit: "1",
      });
      if (!found.length) return null;
      const caps: Caps = { perInstallPerDay: Number(found[0].per_install_per_day), globalPerDay: Number(found[0].global_per_day) };
      if (!Number.isInteger(caps.perInstallPerDay) || !Number.isInteger(caps.globalPerDay)) throw new Error("readCaps failed: settings are not whole numbers");
      return caps;
    },

    async reserveRequest(record) {
      const body: RequestRecord = { ...record, outcome: "pending", reason: null };
      const res = await call("reserveRequest", "POST", "dossier_requests", { select: "id" }, { body, prefer: "return=representation" });
      const [row] = await res.json() as { id: string }[];
      if (!row) throw new Error("reserveRequest failed: nothing returned");
      return row.id;
    },

    async countRequests(since, install) {
      const params: Record<string, string> = { select: "id", created_at: `gt.${since}` };
      if (install) params.install = `eq.${install}`;
      const res = await call("countRequests", "HEAD", "dossier_requests", params, { prefer: "count=exact" });
      const range = res.headers.get("content-range") || "";
      const total = Number(range.split("/")[1]);
      if (!Number.isInteger(total)) throw new Error(`countRequests failed: no count in Content-Range "${range}"`);
      return total;
    },

    async finishRequest(id, outcome, reason) {
      await call("finishRequest", "PATCH", "dossier_requests", { id: `eq.${id}` }, { body: { outcome, reason }, prefer: "return=minimal" });
    },

    async cancelRequest(id) {
      await call("cancelRequest", "DELETE", "dossier_requests", { id: `eq.${id}` }, { prefer: "return=minimal" });
    },

    async saveDossier(record) {
      const res = await call("saveDossier", "POST", "fit_dossiers", { on_conflict: "item_key", select: PUBLIC }, {
        body: record,
        prefer: "resolution=merge-duplicates,return=representation",
      });
      const [row] = await res.json() as StoredDossier[];
      if (!row) throw new Error("saveDossier failed: nothing returned");
      return row;
    },
  };
}
