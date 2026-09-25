'use strict';
/* Perfiles y opciones sociales: perfil público con verificado, foto (validación por contenido), estado, amigos, bloqueos, denuncias y panel.
   Se ejecuta con PostgreSQL (si hay uno accesible) y con archivos. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const zlib = require('zlib'); const WebSocket = require('ws');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 60; const ip = () => '10.6.4.' + (ipn++);
/* --- imágenes de prueba --- */
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
const png = (w, h, noise) => { const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h); if (noise) for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 256; return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
const jpeg = (w, h) => { const b = Buffer.alloc(2 + 18 + 19 + 2); let o = 0; Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]).copy(b, o); o += 20; Buffer.from([0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]).copy(b, o); o += 19; Buffer.from([0xff, 0xd9]).copy(b, o); return b.slice(0, o + 2); };
const dataUrl = (buf, type) => 'data:image/' + (type || 'png') + ';base64,' + buf.toString('base64');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

async function scenario(label, port, dir, dbUrl) {
  console.log('\n=== Almacén: ' + label + ' ===');
  const B = 'http://127.0.0.1:' + port; fs.rmSync(dir, { recursive: true, force: true });
  const start = () => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: 'Soc-Admin-2026xyz', MAX_CONN_PER_IP: 30, ACCOUNTS_REG_MAX: 50, AVATAR_GAP_MS: 400, AVATAR_MODERATION: 'off' }, dbUrl ? { DATABASE_URL: dbUrl } : { DATABASE_URL: '' }), stdio: 'ignore' }); procs.push(p); return p; };
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null), h: r.headers }; };
  let srv = start(); await sleep(dbUrl ? 2600 : 1600);
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77' })).j.token;
  const TA = await reg('Ana_1', 'ana@e.com'), TB = await reg('Beto_2', 'beto@e.com'), TC = await reg('Cami_3', 'cami@e.com');
  const AD = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: 'Soc-Admin-2026xyz' })).j.token, adm = (m, p, b) => call(m, '/api/admin' + p, b, AD);
  const prof = (name, tk) => call('GET', '/api/profile?name=' + encodeURIComponent(name), null, tk), soc = tk => call('GET', '/api/social', null, tk), post = (p, b, tk) => call('POST', '/api/social/' + p, b, tk);

  /* ---- perfil público ---- */
  let r = await prof('ana_1'); const raw = JSON.stringify(r.j);
  ok(r.status === 200 && r.j.profile.username === 'Ana_1' && r.j.profile.rank.n === 'Bronce' && r.j.profile.stats.games === 0 && r.j.profile.avatar.kind === 'preset' && r.j.profile.verified === 0 && r.j.profile.relation === 'none' && r.j.profile.online === null, 'el perfil público de un jugador se ve sin iniciar sesión (foto predefinida, Bronce, sin verificar)');
  ok(!UUID.test(raw) && !/email|hash|salt|ana@e/.test(raw), 'y no filtra el ID de la cuenta, el correo ni contraseñas');
  ok((await prof('NoExiste')).status === 404, 'un jugador inexistente da 404');

  /* ---- verificado ---- */
  ok((await adm('POST', '/verify', { username: 'Ana_1' })).status === 200 && (await prof('Ana_1')).j.profile.verified === 'acc', 'el administrador verifica una cuenta: insignia visible para todos');
  ok((await call('POST', '/api/admin/verify', { username: 'Ana_1' })).status === 401 && (await call('POST', '/api/admin/verify', { username: 'Ana_1' }, TA)).status === 401, 'nadie más puede verificar (ni con una cuenta de jugador)');
  await adm('POST', '/verify', { username: 'Ana_1', verified: false }); ok((await prof('Ana_1')).j.profile.verified === 0, 'y se puede quitar');
  await adm('POST', '/verify', { username: 'Ana_1', verified: true });
  const infKey = (await adm('POST', '/influencers/add', { name: 'Famoso' })).j.key; ok(!!infKey, 'se crea un influencer aparte para comprobar el tic por rol');

  /* ---- estado ---- */
  r = await post('status', { status: '  Hola <b>mundo</b>\n' + 'x'.repeat(80) }, TA); ok(r.status === 200 && r.j.status.length === 40 && !/[<>\n]/.test(r.j.status), 'el estado se limpia (sin <>, saltos de línea) y se recorta a 40 caracteres');
  ok((await prof('Ana_1')).j.profile.status === r.j.status && (await post('status', { status: 'x' })).status === 401, 'aparece en el perfil; exige sesión');

  /* ---- foto de perfil ---- */
  ok((await post('avatar', { preset: 3 }, TA)).j.avatar.id === 3 && (await prof('Ana_1')).j.profile.avatar.id === 3, 'elegir una foto predefinida (3)'); await sleep(450);
  ok((await post('avatar', { preset: 99 }, TA)).status === 400 && (await post('avatar', { preset: -1 }, TA)).status === 400 && (await post('avatar', { preset: 1.5 }, TA)).status === 400, 'las predefinidas fuera de rango o no enteras se rechazan'); await sleep(450);
  const P1 = png(16, 16, true); r = await post('avatar', { image: dataUrl(P1) }, TA);
  ok(r.status === 200 && r.j.avatar.kind === 'custom' && /^api\/avatar\?u=Ana_1&v=1$/.test(r.j.avatar.url), 'subir una foto propia (PNG 16×16)');
  const img = await fetch(B + '/api/avatar?u=ana_1', { headers: { 'X-Forwarded-For': ip() } }); const got = Buffer.from(await img.arrayBuffer());
  ok(img.status === 200 && img.headers.get('content-type') === 'image/png' && img.headers.get('x-content-type-options') === 'nosniff' && got.equals(P1) && /sandbox/.test(img.headers.get('content-security-policy') || ''), 'se sirve con su tipo real, nosniff y CSP restrictiva, byte a byte');
  ok((await post('avatar', { image: dataUrl(P1) }, TA)).status === 429, 'cambiar la foto otra vez enseguida se frena (evita el abuso)'); await sleep(450);
  ok((await post('avatar', { image: dataUrl(jpeg(64, 64), 'jpeg') }, TA)).status === 200 && (await fetch(B + '/api/avatar?u=Ana_1', { headers: { 'X-Forwarded-For': ip() } })).headers.get('content-type') === 'image/jpeg', 'también JPEG (el tipo lo decide el contenido)'); await sleep(450);
  const bad = async (image, code, msg) => { const x = await post('avatar', { image }, TA); ok(x.status === code, msg + ' [' + x.status + ']'); await sleep(450); };
  await bad(dataUrl(Buffer.from('esto no es una imagen'), 'png'), 400, 'un archivo que dice ser PNG pero no lo es se rechaza');
  await bad(dataUrl(Buffer.from('GIF89a' + 'x'.repeat(50)), 'png'), 400, 'un GIF disfrazado de PNG se rechaza');
  await bad('data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64'), 400, 'un SVG (puede llevar scripts) se rechaza');
  await bad('data:text/html;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64'), 400, 'HTML disfrazado se rechaza');
  await bad('https://ejemplo.com/foto.png', 400, 'una dirección web en vez de una imagen se rechaza');
  await bad(dataUrl(png(150, 150, true)), 413, 'una imagen de más de 60 KB se rechaza');
  await bad(dataUrl(png(600, 600, false)), 400, 'una imagen pequeña en bytes pero de 600×600 píxeles («bomba de descompresión») se rechaza');
  await bad(dataUrl(jpeg(2000, 2000), 'jpeg'), 400, 'un JPEG de 2000×2000 se rechaza');
  await bad(dataUrl(jpeg(0, 0), 'jpeg'), 400, 'y uno con tamaño 0');
  ok((await post('avatar', { image: dataUrl(P1) }, null)).status === 401, 'subir foto exige sesión');
  ok((await fetch(B + '/api/avatar?u=Beto_2', { headers: { 'X-Forwarded-For': ip() } })).status === 404 && (await fetch(B + '/api/avatar?u=Nadie', { headers: { 'X-Forwarded-For': ip() } })).status === 404, 'quien no tiene foto propia o no existe: 404');
  r = await post('avatar', { remove: true }, TA); ok(r.status === 200 && r.j.avatar.kind === 'preset' && (await fetch(B + '/api/avatar?u=Ana_1', { headers: { 'X-Forwarded-For': ip() } })).status === 404, 'quitar la foto propia'); await sleep(450);
  await post('avatar', { image: dataUrl(png(8, 8, true)) }, TA);

  /* ---- amigos ---- */
  ok((await post('request', { name: 'Ana_1' }, TA)).status === 400 && (await post('request', { name: 'NoExiste' }, TA)).status === 404, 'no puedes añadirte a ti mismo ni a alguien que no existe');
  ok((await post('request', { name: 'beto_2' }, TA)).j.relation === 'pending-out' && (await post('request', { name: 'Beto_2' }, TA)).status === 400, 'Ana envía una solicitud a Beto (y no se puede repetir)');
  let sb = (await soc(TB)).j; ok(sb.incoming.length === 1 && sb.incoming[0].username === 'Ana_1' && sb.incoming[0].verified === 'acc' && sb.friends.length === 0, 'Beto la ve como solicitud recibida (con la insignia de Ana)');
  ok((await prof('Ana_1', TB)).j.profile.relation === 'pending-in' && (await prof('Beto_2', TA)).j.profile.relation === 'pending-out', 'y los perfiles indican el estado de la relación');
  ok((await post('accept', { name: 'Cami_3' }, TB)).status === 400, 'no se puede aceptar una solicitud que no existe');
  ok((await post('accept', { name: 'Ana_1' }, TB)).j.relation === 'friend', 'Beto acepta');
  ok((await soc(TA)).j.friends.map(x => x.username).join() === 'Beto_2' && (await soc(TB)).j.friends.map(x => x.username).join() === 'Ana_1' && (await soc(TB)).j.incoming.length === 0 && (await soc(TA)).j.outgoing.length === 0, 'ya son amigos los dos y las solicitudes desaparecen');
  ok((await post('request', { name: 'Beto_2' }, TA)).status === 400, 'y no se puede pedir amistad a un amigo');
  /* presencia: solo los amigos ven si estás en línea */
  const lobby = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); await new Promise(res => { lobby.on('open', () => lobby.send(JSON.stringify({ t: 'lobby', acct: TB }))); lobby.on('message', d => { if (JSON.parse(d).t === 'lobbyok') res(); }); }); await sleep(200);
  ok((await soc(TA)).j.friends[0].online === 'lobby' && (await prof('Beto_2', TA)).j.profile.online === 'lobby', 'Ana ve a su amigo Beto «en el menú»');
  ok((await prof('Beto_2', TC)).j.profile.online === null && (await prof('Beto_2')).j.profile.online === null, 'pero Cami (no amiga) y los anónimos no ven si está conectado (privacidad)');
  const game = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); await new Promise(res => { game.on('open', () => game.send(JSON.stringify({ t: 'hello', v: 1, n: 'x', map: 0, c: 0, acct: TB }))); game.on('message', d => { if (JSON.parse(d).t === 'welcome') res(); }); }); await sleep(200);
  ok((await soc(TA)).j.friends[0].online === 'game', 'y «jugando» cuando entra en una partida'); game.close(); lobby.close(); await sleep(300);
  ok((await soc(TA)).j.friends[0].online === 'off', 'y «desconectado» al salir');
  ok((await post('remove', { name: 'Beto_2' }, TA)).j.relation === 'none' && (await soc(TB)).j.friends.length === 0 && (await post('remove', { name: 'Beto_2' }, TA)).status === 400, 'eliminar un amigo lo quita de las dos listas');
  /* solicitudes cruzadas se aceptan solas; rechazar; cancelar */
  await post('request', { name: 'Cami_3' }, TA); ok((await post('request', { name: 'Ana_1' }, TC)).j.relation === 'friend', 'si Cami también le pide amistad a Ana, se aceptan a la vez');
  await post('remove', { name: 'Cami_3' }, TA); await post('request', { name: 'Cami_3' }, TB); ok((await post('decline', { name: 'Beto_2' }, TC)).j.relation === 'none' && (await soc(TB)).j.outgoing.length === 0, 'rechazar una solicitud');
  await post('request', { name: 'Cami_3' }, TB); ok((await post('cancel', { name: 'Cami_3' }, TB)).j.relation === 'none' && (await soc(TC)).j.incoming.length === 0 && (await post('cancel', { name: 'Cami_3' }, TB)).status === 400, 'y cancelar la que enviaste');
  /* bloquear */
  await post('request', { name: 'Beto_2' }, TA); await post('accept', { name: 'Ana_1' }, TB);
  ok((await post('block', { name: 'Beto_2' }, TA)).j.relation === 'blocked' && (await soc(TB)).j.friends.length === 0 && (await soc(TA)).j.blocked[0].username === 'Beto_2', 'bloquear a un amigo rompe la amistad y lo apunta en la lista de bloqueados');
  ok((await post('request', { name: 'Ana_1' }, TB)).status === 400 && (await post('request', { name: 'Beto_2' }, TA)).status === 400 && (await prof('Beto_2', TA)).j.profile.relation === 'blocked', 'el bloqueado no puede pedirte amistad (ni tú a él mientras esté bloqueado)');
  ok((await post('unblock', { name: 'Beto_2' }, TA)).j.relation === 'none' && (await post('unblock', { name: 'Beto_2' }, TA)).status === 400 && (await post('request', { name: 'Ana_1' }, TB)).status === 200, 'desbloquear y volver a poder enviarse solicitudes'); await post('cancel', { name: 'Ana_1' }, TB);

  /* ---- denuncias ---- */
  ok((await post('report', { name: 'Cami_3', cat: 'foto', text: 'foto ofensiva' }, TA)).status === 200 && (await post('report', { name: 'Cami_3', cat: 'foto' }, TA)).status === 400 && (await post('report', { name: 'Ana_1' }, TA)).status === 400 && (await post('report', { name: 'Nadie' }, TA)).status === 404 && (await post('report', { name: 'Cami_3' })).status === 401, 'denunciar: una vez por jugador, no a uno mismo, ni a inexistentes, y con sesión');
  const rep = (await adm('GET', '/social/reports')).j.reports; ok(rep.length === 1 && rep[0].byName === 'Ana_1' && rep[0].targetName === 'Cami_3' && rep[0].cat === 'foto', 'el panel ve la denuncia');
  await post('avatar', { image: dataUrl(png(8, 8, true)) }, TC); ok((await adm('POST', '/social/avatar-remove', { username: 'Cami_3' })).status === 200 && (await fetch(B + '/api/avatar?u=Cami_3', { headers: { 'X-Forwarded-For': ip() } })).status === 404, 'el administrador retira una foto ofensiva');
  ok((await adm('POST', '/social/reports/close', { id: rep[0].id })).status === 200 && (await adm('GET', '/audit')).j.audit.some(a => a.action === 'foto-retirar') && (await adm('GET', '/audit')).j.audit.some(a => a.action === 'verificar'), 'cierra la denuncia y todo queda en la auditoría');

  /* ---- persistencia ---- */
  const snap = JSON.stringify([(await prof('Ana_1', TA)).j.profile.status, (await prof('Ana_1')).j.profile.verified, (await soc(TA)).j.blocked.length, (await prof('Ana_1')).j.profile.avatar.kind]); const bytes = Buffer.from(await (await fetch(B + '/api/avatar?u=Ana_1', { headers: { 'X-Forwarded-For': ip() } })).arrayBuffer());
  await sleep(1800); srv.kill('SIGTERM'); await sleep(1200); srv = start(); await sleep(dbUrl ? 2600 : 1600);
  const bytes2 = Buffer.from(await (await fetch(B + '/api/avatar?u=Ana_1', { headers: { 'X-Forwarded-For': ip() } })).arrayBuffer());
  ok(JSON.stringify([(await prof('Ana_1', TA)).j.profile.status, (await prof('Ana_1')).j.profile.verified, (await soc(TA)).j.blocked.length, (await prof('Ana_1')).j.profile.avatar.kind]) === snap && bytes.length > 50 && bytes.equals(bytes2), 'tras reiniciar el servidor siguen el estado, el verificado, los bloqueos y la foto (byte a byte)');
  if (dbUrl) {
    const { Client } = require('pg'); const c = new Client({ connectionString: dbUrl }); await c.connect(); let e1 = '', e2 = '';
    try { await c.query("INSERT INTO user_avatars (user_id, mime, data) VALUES ('t', 'image/gif', 'x')"); } catch (e) { e1 = e.code; } try { await c.query("INSERT INTO user_avatars (user_id, mime, data) VALUES ('t2', 'image/png', $1)", [Buffer.alloc(60001)]); } catch (e) { e2 = e.code; }
    ok(e1 === '23514' && e2 === '23514' && (await c.query('SELECT count(*)::int AS n FROM user_avatars')).rows[0].n >= 1, 'PostgreSQL: user_avatars guarda las fotos y rechaza tipos que no sean JPEG/PNG y las de más de 60 KB');
    await c.end();
  }
  srv.kill('SIGTERM'); await sleep(600);
}
(async () => {
  let pgOk = false;
  try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('(PostgreSQL no disponible → solo archivos)'); }
  try { if (pgOk) await scenario('PostgreSQL', 3290, '/tmp/ppr_soc_pg', PG_URL); await scenario('archivos JSON', 3291, '/tmp/ppr_soc_file', null); } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
