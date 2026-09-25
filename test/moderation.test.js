'use strict';
/* Moderación de fotos antes de mostrarlas (revisión manual, servicio externo, desactivada), caché con ETag y dirección de CDN. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const zlib = require('zlib'); const http = require('http');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
const png = w => { const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(w, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * w); for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 256; return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
const url = b => 'data:image/png;base64,' + b.toString('base64');
let ipn = 30; const ip = () => '10.4.2.' + (ipn++);

/* ---- servicio de moderación simulado: 16 px = correcto · 17 = rechaza · 18 = no responde · 19 = respuesta que no es JSON ---- */
const seen = []; let mock = null;
function startMock() { return new Promise(res => { mock = http.createServer((req, rs) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { let j = {}; try { j = JSON.parse(b); } catch (e) { /* nada */ } const buf = Buffer.from(j.image || '', 'base64'), w = buf.readUInt32BE(16); seen.push({ auth: req.headers.authorization, mime: j.mime, w, len: buf.length });
  if (w === 18) return; if (w === 19) { rs.writeHead(200, { 'Content-Type': 'text/plain' }); return rs.end('oops'); }
  rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(w === 17 ? { ok: false, reason: 'contenido no permitido' } : { ok: true })); }); }); mock.listen(3320, '127.0.0.1', res); }); }

async function run(label, port, env, fn) {
  console.log('\n=== ' + label + ' ==='); const dir = '/tmp/ppr_mod_' + port; fs.rmSync(dir, { recursive: true, force: true });
  const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: 'Mod-Admin-2026xyz', DATABASE_URL: '', MAX_CONN_PER_IP: 30, ACCOUNTS_REG_MAX: 50, AVATAR_GAP_MS: 0, AVATAR_MODERATION: '', AVATAR_MODERATION_URL: '', AVATAR_CDN_URL: '' }, env), stdio: 'ignore' }); procs.push(p); await sleep(1700);
  const B = 'http://127.0.0.1:' + port;
  const call = async (m, pth, b, tk, hdr) => { const r = await fetch(B + pth, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}, hdr || {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null), h: r.headers }; };
  const raw = async (pth, hdr) => { const r = await fetch(B + pth, { headers: Object.assign({ 'X-Forwarded-For': ip() }, hdr || {}) }); return { status: r.status, h: r.headers, buf: Buffer.from(await r.arrayBuffer()) }; };
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77' })).j.token;
  const TA = await reg('Ana_1', 'a@e.com'), TB = await reg('Beto_2', 'b@e.com'); const AD = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: 'Mod-Admin-2026xyz' })).j.token;
  const ctx = { B, call, raw, TA, TB, AD, adm: (m, pth, b) => call(m, '/api/admin' + pth, b, AD), up: (tk, buf) => call('POST', '/api/social/avatar', { image: url(buf) }, tk), prof: (n, tk) => call('GET', '/api/profile?name=' + n, null, tk) };
  try { await fn(ctx); } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  p.kill('SIGTERM'); await sleep(500);
}

(async () => {
  await startMock();
  /* ---------- desactivada ---------- */
  await run('Moderación desactivada (off)', 3310, { AVATAR_MODERATION: 'off' }, async c => {
    const P1 = png(16); let r = await c.up(c.TA, P1); ok(r.status === 200 && r.j.status === 'ok' && r.j.avatar.kind === 'custom', 'con la moderación desactivada la foto se ve al momento');
    const g = await c.raw('/api/avatar?u=Ana_1&v=1'); ok(g.status === 200 && g.buf.equals(P1), 'y se sirve byte a byte');
    const et = g.h.get('etag'); ok(/^"[0-9a-f]{16}"$/.test(et) && g.h.get('cache-control') === 'public, max-age=86400', 'lleva ETag y, al ir con versión (?v=), se puede guardar un día (' + g.h.get('cache-control') + ')');
    const g2 = await c.raw('/api/avatar?u=Ana_1&v=1', { 'If-None-Match': et }); ok(g2.status === 304 && g2.buf.length === 0, 'si el navegador (o el CDN) ya la tiene, el servidor responde 304 sin reenviar la imagen');
    ok((await c.raw('/api/avatar?u=Ana_1')).h.get('cache-control') === 'public, max-age=300', 'sin versión, solo 5 minutos');
    ok((await c.raw('/api/avatar?u=Ana_1', { 'If-None-Match': '"otra"' })).status === 200, 'y si la copia del navegador es otra, se reenvía');
  });
  /* ---------- revisión manual (por defecto) ---------- */
  await run('Revisión manual (AVATAR_MODERATION=hold)', 3311, { AVATAR_MODERATION: 'hold' }, async c => {
    const P1 = png(20); let r = await c.up(c.TA, P1);
    ok(r.status === 200 && r.j.status === 'pending' && r.j.avatar.status === 'pending' && r.j.avatar.preview === url(P1), 'con la revisión manual la foto queda EN REVISIÓN y el dueño la ve (vista previa incrustada)');
    const own = (await c.prof('Ana_1', c.TA)).j.profile; ok(own.avatar.status === 'pending' && own.avatar.preview === url(P1), 'en su propio perfil la ve con el aviso «en revisión»');
    const other = (await c.prof('Ana_1', c.TB)).j.profile, anon = (await c.prof('Ana_1')).j.profile; ok(other.avatar.kind === 'preset' && anon.avatar.kind === 'preset' && !JSON.stringify(other).includes('preview'), 'los demás ven una foto predefinida, nunca la imagen pendiente');
    ok((await c.raw('/api/avatar?u=Ana_1')).status === 404 && (await c.raw('/api/avatar?u=Ana_1&v=1')).status === 404, 'y la imagen no se puede pedir directamente (404)');
    await c.call('POST', '/api/social/request', { name: 'Beto_2' }, c.TA); await c.call('POST', '/api/social/accept', { name: 'Ana_1' }, c.TB); const fr = (await c.call('GET', '/api/social', null, c.TB)).j.friends[0]; ok(fr.avatar.kind === 'preset', 'tampoco en la lista de amigos');
    ok((await c.call('GET', '/api/admin/social/avatars/pending')).status === 401 && (await c.call('GET', '/api/admin/social/avatars/pending', null, c.TA)).status === 401, 'la cola de revisión es solo para administradores');
    let q = (await c.adm('GET', '/social/avatars/pending')).j; ok(q.mode === 'hold' && q.pending.length === 1 && q.pending[0].username === 'Ana_1' && q.pending[0].preview === url(P1), 'el panel la ve en la cola con su imagen');
    ok((await c.adm('POST', '/social/avatars/review', { username: 'Ana_1', approve: true })).status === 200, 'el administrador la aprueba');
    const g = await c.raw('/api/avatar?u=Ana_1'); ok(g.status === 200 && g.buf.equals(P1) && (await c.prof('Ana_1', c.TB)).j.profile.avatar.kind === 'custom', 'ahora la ven todos (byte a byte)');
    ok((await c.adm('GET', '/social/avatars/pending')).j.pending.length === 0 && (await c.adm('POST', '/social/avatars/review', { username: 'Ana_1', approve: true })).status === 404, 'sale de la cola y no se puede aprobar dos veces');
    /* nueva foto → vuelve a revisión; se rechaza con motivo */
    ok((await c.up(c.TA, png(21))).j.status === 'pending' && (await c.prof('Ana_1', c.TB)).j.profile.avatar.kind === 'preset', 'una foto nueva vuelve a pasar por revisión (mientras tanto los demás ven una predefinida)');
    ok((await c.adm('POST', '/social/avatars/review', { username: 'Ana_1', approve: false, reason: 'no es apropiada' })).status === 200, 'el administrador la rechaza con un motivo');
    const after = (await c.prof('Ana_1', c.TA)).j.profile; ok(after.avatar.kind === 'preset' && /no es apropiada/.test(after.note) && (await c.raw('/api/avatar?u=Ana_1')).status === 404, 'la foto se borra y el dueño ve el motivo («' + after.note + '»)');
    ok((await c.up(c.TA, png(22))).status === 200 && (await c.prof('Ana_1', c.TA)).j.profile.note === '', 'al subir otra, el aviso desaparece');
    ok((await c.call('POST', '/api/social/avatar', { preset: 4 }, c.TB)).j.avatar.kind === 'preset' && (await c.adm('GET', '/social/avatars/pending')).j.pending.length === 1, 'las fotos predefinidas no necesitan revisión (y la cola solo tiene la pendiente de Ana)');
    const au = (await c.adm('GET', '/audit')).j.audit.map(a => a.action); ok(au.includes('foto-aprobar') && au.includes('foto-rechazar'), 'aprobar y rechazar quedan en la auditoría');
  });
  await run('Sin configurar (por defecto: desactivada)', 3315, {}, async c => { const r = await c.up(c.TA, png(16)); ok(r.status === 200 && r.j.status === 'ok' && (await c.raw('/api/avatar?u=Ana_1')).status === 200, 'sin configurar nada las fotos se ven al momento, como siempre'); });
  /* ---------- servicio externo ---------- */
  await run('Servicio externo (auto)', 3312, { AVATAR_MODERATION: 'auto', AVATAR_MODERATION_URL: 'http://127.0.0.1:3320/check', AVATAR_MODERATION_KEY: 'clave-secreta', AVATAR_MODERATION_TIMEOUT_MS: 1500 }, async c => {
    const P16 = png(16); let r = await c.up(c.TA, P16);
    ok(r.status === 200 && r.j.status === 'ok' && (await c.raw('/api/avatar?u=Ana_1')).status === 200, 'si el servicio dice que está bien, se muestra al momento sin intervención');
    const last = seen[seen.length - 1]; ok(last.auth === 'Bearer clave-secreta' && last.mime === 'image/png' && last.w === 16 && last.len === P16.length, 'el servicio recibió la imagen, su tipo y la clave (Authorization)');
    r = await c.up(c.TB, png(17)); ok(r.status === 400 && /Foto rechazada: contenido no permitido/.test(r.j.error), 'si el servicio la rechaza, se devuelve el motivo al jugador («' + (r.j && r.j.error) + '»)');
    ok((await c.prof('Beto_2', c.TB)).j.profile.avatar.kind === 'preset' && (await c.adm('GET', '/social/avatars/pending')).j.pending.length === 0, 'y no se guarda nada ni entra en la cola');
    const t0 = Date.now(); r = await c.up(c.TB, png(18)); ok(r.status === 200 && r.j.status === 'pending' && Date.now() - t0 < 4000, 'si el servicio no responde (límite 1,5 s), la foto queda en revisión manual en vez de mostrarse o perderse (' + (Date.now() - t0) + ' ms)');
    r = await c.up(c.TB, png(19)); ok(r.status === 200 && r.j.status === 'pending', 'y si responde algo que no es JSON, también');
    ok((await c.adm('GET', '/social/avatars/pending')).j.pending.length === 1 && (await c.adm('GET', '/social/avatars/pending')).j.mode === 'auto', 'la cola tiene la pendiente de Beto y el panel indica el modo «auto»');
    mock.close(); mock.closeAllConnections(); await sleep(300); r = await c.up(c.TA, png(16));   // se cierran también las conexiones persistentes: el servicio queda realmente caído
    ok(r.status === 200 && r.j.status === 'pending', 'si el servicio está caído, todo va a revisión manual: nunca se muestra una foto sin revisar');
  });
  /* ---------- CDN ---------- */
  await run('Dirección de CDN', 3313, { AVATAR_MODERATION: 'off', AVATAR_CDN_URL: 'https://cdn.ejemplo.com/' }, async c => {
    await c.up(c.TA, png(16)); const a = (await c.prof('Ana_1')).j.profile.avatar; ok(/^https:\/\/cdn\.ejemplo\.com\/api\/avatar\?u=Ana_1&v=1$/.test(a.url), 'las fotos se piden al CDN configurado (' + a.url + ')');
    const r = await fetch(c.B + '/', { headers: { 'X-Forwarded-For': ip() } }); const csp = r.headers.get('content-security-policy') || ''; ok(/img-src 'self' data: https:\/\/cdn\.ejemplo\.com;/.test(csp), 'y la política de seguridad permite imágenes de ese origen (y solo de ese)');
    ok((await c.raw('/api/avatar?u=Ana_1&v=1')).status === 200, 'el servidor sigue sirviendo la foto (es el origen que el CDN consulta)');
  });
  await run('Sin CDN', 3314, { AVATAR_MODERATION: 'off' }, async c => { await c.up(c.TA, png(16)); ok(/^api\/avatar\?u=Ana_1/.test((await c.prof('Ana_1')).j.profile.avatar.url), 'sin CDN la dirección es la del propio servidor'); const r = await fetch(c.B + '/', { headers: { 'X-Forwarded-For': ip() } }); ok(/img-src 'self' data:;/.test(r.headers.get('content-security-policy') || ''), 'y la política no cambia'); });
  try { mock.close(); } catch (e) { /* ya cerrado */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
