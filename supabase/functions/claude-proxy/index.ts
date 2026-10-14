// FloppyOS · Edge Function "claude-proxy"
// Keeps the Claude API key in Supabase (never on your devices). Only requests carrying a valid
// session of OWNER_EMAIL, from an allowed origin, to the Messages endpoints, are forwarded.
// Secrets required (Edge Functions → Secrets): ANTHROPIC_API_KEY, OWNER_EMAIL.
// Optional: ALLOWED_ORIGINS (comma-separated; default https://sadaybb.github.io,http://localhost:5173).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://sadaybb.github.io,http://localhost:5173').split(',').map((s) => s.trim());
const ALLOWED_PATH = /^\/v1\/messages(\/count_tokens)?$/;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const okOrigin = ORIGINS.includes(origin);
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': okOrigin ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': req.headers.get('access-control-request-headers') ?? 'authorization, content-type, anthropic-version, anthropic-beta',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  const deny = (status: number, msg: string) => new Response(JSON.stringify({ type: 'error', error: { type: 'forbidden', message: msg } }), { status, headers: { ...cors, 'content-type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
  if (req.method !== 'POST') return deny(405, 'Método no permitido');
  if (!okOrigin) return deny(403, 'Origen no permitido');

  // Fail closed if the function is not fully configured.
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const owner = Deno.env.get('OWNER_EMAIL')?.trim().toLowerCase();
  if (!apiKey || !owner) return deny(503, 'La función no está configurada (faltan secretos).');

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return deny(401, 'Falta la sesión');
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return deny(401, 'Sesión no válida');
  if (data.user.email?.toLowerCase() !== owner) return deny(403, 'Esta cuenta no puede usar la IA');

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/claude-proxy/, '');
  if (!ALLOWED_PATH.test(path)) return deny(404, 'Ruta no permitida');

  const headers = new Headers({ 'x-api-key': apiKey, 'content-type': 'application/json' });
  for (const h of ['anthropic-version', 'anthropic-beta']) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const upstream = await fetch(`https://api.anthropic.com${path}${url.search}`, { method: 'POST', headers, body: await req.text() });
  const out = new Headers(cors);
  out.set('content-type', upstream.headers.get('content-type') ?? 'application/json');
  const reqId = upstream.headers.get('request-id');
  if (reqId) out.set('request-id', reqId);
  return new Response(upstream.body, { status: upstream.status, headers: out });
});
