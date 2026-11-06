// API de la carta — Cloudflare Pages Functions
//
// GET  /api/menu   → devuelve { patches, extras } (público, sin claves)
// PUT  /api/menu   → guarda la carta. Requiere cabecera "X-Admin-Password".
// POST /api/menu   → sin cuerpo: comprueba la contraseña (login del admin).
//                    { action: "change_password", newPassword } → cambia la contraseña.
//
// Configuración en Cloudflare (Settings → Bindings / Variables and secrets):
//   MENU            → KV namespace (binding)
//   ADMIN_PASSWORD  → secreto: contraseña inicial y LLAVE DE EMERGENCIA
//
// Contraseña: cuando se cambia desde el admin se guarda cifrada (PBKDF2) en KV ("auth").
// Desde entonces vale la nueva y también ADMIN_PASSWORD (para recuperar el acceso
// si alguien olvida la suya). Para volver a la inicial: borrar la clave "auth" del KV.

const KEY = 'menu';
const BACKUP_PREFIX = 'backup:';
const BACKUP_TTL = 60 * 60 * 24 * 90;          // copias de seguridad: 90 días
const MAX_BODY = 256 * 1024;                    // 256 KB, de sobra para la carta
const AUTH_KEY = 'auth';
const PBKDF2_ITER = 100000;                     // máximo admitido por Workers
const MIN_PW = 8, MAX_PW = 200;

// Webs que pueden usar el admin desde otro dominio
const ALLOWED_ORIGINS = [
  'https://elviejogutidimi2-source.github.io',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const host = new URL(request.url).origin;
  const allowed = origin === host || ALLOWED_ORIGINS.includes(origin);
  // GET es público (la carta). Escribir solo desde nuestras propias webs + contraseña.
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '*',
    'Access-Control-Allow-Methods': allowed ? 'GET, PUT, POST, OPTIONS' : 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(request, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request), ...extra },
  });
}

// Comparación en tiempo constante (no revela cuántos caracteres acertaste)
async function samePassword(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function unb64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

function sameBytes(a, b) {
  const x = new Uint8Array(a), y = new Uint8Array(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function storedAuth(env) {
  if (!env.MENU) return null;
  const a = await env.MENU.get(AUTH_KEY, { type: 'json' });
  return a && a.hash && a.salt ? a : null;
}

async function checkPassword(given, env) {
  if (!given) return false;
  // Llave de emergencia: la contraseña puesta en Cloudflare siempre sirve
  if (await samePassword(given, env.ADMIN_PASSWORD || '')) return true;
  const a = await storedAuth(env);
  if (!a) return false;
  const h = await pbkdf2(given, unb64(a.salt), a.iter || PBKDF2_ITER);
  return sameBytes(h, unb64(a.hash));
}

async function authorized(request, env) {
  const ok = await checkPassword(request.headers.get('X-Admin-Password') || '', env);
  if (!ok) await new Promise(r => setTimeout(r, 800));   // frena intentos a lo bruto
  return ok;
}

function configured(env) {
  return !!(env.MENU && env.ADMIN_PASSWORD);
}

async function changePassword(request, env, newPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PW || newPassword.length > MAX_PW) {
    return json(request, { error: 'weak_password', min: MIN_PW }, 400);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(newPassword, salt, PBKDF2_ITER);
  await env.MENU.put(AUTH_KEY, JSON.stringify({ salt: b64(salt), hash: b64(hash), iter: PBKDF2_ITER, changedAt: new Date().toISOString() }));
  return json(request, { ok: true });
}

function validMenu(data) {
  return data && typeof data === 'object' && !Array.isArray(data)
    && data.patches && typeof data.patches === 'object' && !Array.isArray(data.patches)
    && Array.isArray(data.extras || []);
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestGet({ request, env }) {
  if (!env.MENU) return json(request, { error: 'not_configured' }, 503);
  const stored = await env.MENU.get(KEY, { type: 'json', cacheTtl: 30 });
  return json(request, stored || { patches: {}, extras: [], empty: true }, 200, {
    'Cache-Control': 'public, max-age=0, must-revalidate',
  });
}

export async function onRequestPost({ request, env }) {
  if (!configured(env)) return json(request, { error: 'not_configured' }, 503);
  if (!(await authorized(request, env))) return json(request, { error: 'wrong_password' }, 401);
  const text = await request.text();
  if (!text) return json(request, { ok: true });            // solo login
  if (text.length > 4096) return json(request, { error: 'too_large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json(request, { error: 'invalid_json' }, 400); }
  if (body && body.action === 'change_password') return changePassword(request, env, body.newPassword);
  return json(request, { error: 'unknown_action' }, 400);
}

export async function onRequestPut({ request, env }) {
  if (!configured(env)) return json(request, { error: 'not_configured' }, 503);
  if (!(await authorized(request, env))) return json(request, { error: 'wrong_password' }, 401);

  const text = await request.text();
  if (text.length > MAX_BODY) return json(request, { error: 'too_large' }, 413);
  let data;
  try { data = JSON.parse(text); } catch { return json(request, { error: 'invalid_json' }, 400); }
  if (!validMenu(data)) return json(request, { error: 'invalid_menu' }, 400);

  const clean = { patches: data.patches, extras: data.extras || [], updatedAt: new Date().toISOString() };

  // Copia de seguridad de la versión anterior antes de sobrescribir
  const previous = await env.MENU.get(KEY);
  if (previous) {
    await env.MENU.put(BACKUP_PREFIX + new Date().toISOString(), previous, { expirationTtl: BACKUP_TTL });
  }
  await env.MENU.put(KEY, JSON.stringify(clean));
  return json(request, { ok: true, updatedAt: clean.updatedAt });
}
