// Supabase Edge Function entry: wires the pure handler to the real clients. Supabase injects
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; ANTHROPIC_API_KEY is the secret lookup-chart already uses.
// No key is ever logged or returned: a missing variable is reported by name only.
import { restDb } from "./db.ts";
import { handle } from "./handler.ts";

export { handle };

Deno.serve((req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !serviceKey || !anthropicKey) {
    const missing = [
      ["SUPABASE_URL", supabaseUrl],
      ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
      ["ANTHROPIC_API_KEY", anthropicKey],
    ].filter(([, v]) => !v).map(([name]) => name);
    console.error(`fit-dossier: not configured, missing ${missing.join(", ")}`);
    return new Response(JSON.stringify({ dossier: null, error: "The fit check is not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  return handle(req, { db: restDb(supabaseUrl, serviceKey), fetch, anthropicKey, log: (line) => console.log(line) });
});
