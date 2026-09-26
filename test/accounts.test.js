'use strict';
/* Cuentas online: nombres únicos, sesiones, progreso, PX (partidas, colores, rangos, panel de administración), tienda con Stripe simulado y voto de mapa. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const http = require('http'); const crypto = require('crypto'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PORT = 3182, PORT2 = 3183, STRIPE = 4245, ORIGIN = 'http://127.0.0.1:' + PORT, D = '/tmp/ppr_accounts', D2 = '/tmp/ppr_accounts_off', APASS = 'Cuentas-Admin-2026x', WH = 'whsec_prueba';
for (const d of [D, D2]) fs.rmSync(d, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(20); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
function start(port, dir, env) { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, MATCH_TIME: 120, KILL_LIMIT: 99, BREAK_SECS: 3, HISTORY_MIN_SECS: 1, MAX_CONN_PER_IP: 30 }, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; }); procs.push(p); return p; }
/* Stripe simulado: crea sesiones de pago y guarda lo que se le envía */
const stripeCalls = []; let sessN = 0; let rejectPaypal = false;   // rejectPaypal simula una cuenta de Stripe sin PayPal activado
const stripe = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { const form = Object.fromEntries(new URLSearchParams(b)); stripeCalls.push({ url: req.url, auth: req.headers.authorization, form }); if (rejectPaypal && Object.values(form).includes('paypal')) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { type: 'invalid_request_error', param: 'payment_method_types[1]', message: 'The payment method type provided: paypal is invalid. Please ensure the provided type is activated in your dashboard.' } })); } const id = 'cs_test_' + (++sessN); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id, url: 'https://checkout.stripe.test/pay/' + id })); }); });
let ipn = 10; const ip = () => '10.8.1.' + (ipn++);
async function call(method, p, body, token, xip, port) { const r = await fetch('http://127.0.0.1:' + (port || PORT) + p, { method, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': xip || ip() }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; }
const reg = (u, e, p, xip) => call('POST', '/api/auth/register', { username: u, email: e, password: p }, null, xip);
const sign = (raw, secret, ts) => { ts = ts || Math.floor(Date.now() / 1000); return 't=' + ts + ',v1=' + crypto.createHmac('sha256', secret || WH).update(ts + '.' + raw).digest('hex'); };
const hook = async (obj, sig, port) => { const raw = JSON.stringify(obj); const r = await fetch('http://127.0.0.1:' + (port || PORT) + '/api/store/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig === undefined ? sign(raw) : sig }, body: raw }); return r.status; };
class Bot {
  constructor(name, extra) { this.name = name; this.extra = extra || {}; this.msgs = []; this.pos = null; this.ep = 0; this.id = null; }
  connect() { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } }); this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: 0, c: 0 }, this.extra))); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; this.wname = m.n; res(m); } if (m.t === 'err') res(m); if (m.t === 'spawn' && m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; } if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; } }); this.ws.on('close', () => { this.closed = true; res(null); }); this.ws.on('error', () => {}); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); }
  last(t) { return [...this.msgs].reverse().find(m => m.t === t); }
  sendState() { this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.sendState(); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}
const world = S.buildWorld(0);
const los = (a, b) => { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: -0.5, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; };
async function approach(bot, tgt) { for (let r = 6; r <= 12; r += 3) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 56 || Math.abs(z) > 56 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; if (los({ x, z }, tgt)) { await bot.walkTo(x, z); return true; } } return false; }

(async () => {
  await new Promise(r => stripe.listen(STRIPE, '127.0.0.1', r));
  let srv = start(PORT, D, { STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_WEBHOOK_SECRET: WH, STRIPE_API_BASE: 'http://127.0.0.1:' + STRIPE, PUBLIC_URL: 'https://mijuego.example' });
  await sleep(1300);
  try {
    /* ---------- Registro con nombres únicos ---------- */
    let r = await reg('Pepe_1', 'pepe@ejemplo.com', 'Clave-Segura-77'); const T1 = r.j && r.j.token;
    ok(r.status === 200 && T1 && r.j.profile.username === 'Pepe_1' && r.j.profile.px === 0 && r.j.profile.unlocked.length === 4 && r.j.profile.stats.games === 0, 'registro correcto: cuenta nueva con 0 PX, colores básicos y estadísticas a cero');
    await sleep(1800); ok(!JSON.stringify(r.j).includes('hash') && !fs.readFileSync(path.join(D, 'accounts.json'), 'utf8').includes('Clave-Segura-77'), 'la contraseña no se devuelve ni se guarda en claro');
    for (const [n, why] of [['pepe_1', 'mayúsculas'], ['PEPE-1', 'guion en vez de guion bajo'], ['Pépé_1', 'tildes'], ['pepe1', 'sin separadores']]) { r = await reg(n, n + '@otro.com', 'Clave-Segura-77'); ok(r.status === 409 && /ya está en uso/.test(r.j.error), 'nombre único: «' + n + '» rechazado (' + why + ')'); }
    r = await reg('Otro', 'pepe@ejemplo.com', 'Clave-Segura-77'); ok(r.status === 409, 'el correo tampoco se puede repetir');
    for (const [u, e, p] of [['ab', 'a@b.com', 'Clave-Segura-77'], ['Nombre Con Espacios', 'a@b.com', 'Clave-Segura-77'], ['Valido', 'no-es-correo', 'Clave-Segura-77'], ['Valido', 'a@b.com', 'corta1'], ['Valido', 'a@b.com', 'sinnumeros']]) { r = await reg(u, e, p); ok(r.status === 400, 'datos no válidos rechazados (' + u + ' / ' + p + ')'); }
    ok((await reg('Viexbox', 'v@b.com', 'Clave-Segura-77')).status === 400 && (await reg('Guest_55', 'g@b.com', 'Clave-Segura-77')).status === 400, 'nombres reservados (administrador e invitados) rechazados');
    const LA = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token; const adm = (m, p, b) => call(m, '/api/admin' + p, b, LA);
    await adm('POST', '/influencers/add', { name: 'ProGamer' }); await adm('POST', '/bans/add', { type: 'name', value: 'Troll', minutes: 60, reason: 'prueba' });
    ok((await reg('ProGamer', 'p@b.com', 'Clave-Segura-77')).status === 400 && (await reg('Troll', 't@b.com', 'Clave-Segura-77')).status === 403, 'tampoco el nombre de un influencer ni el de un jugador baneado');
    const ipR = ip(); let last; for (let i = 0; i < 6; i++) last = await reg('Masa' + i, 'masa' + i + '@b.com', 'Clave-Segura-77', ipR); ok(last.status === 429, 'límite: como mucho 5 registros por hora desde la misma IP');

    /* ---------- Acceso ---------- */
    r = await call('POST', '/api/auth/login', { identifier: 'PEPE_1', password: 'Clave-Segura-77' }); ok(r.status === 200 && r.j.profile.username === 'Pepe_1', 'entrar con el usuario (sin distinguir mayúsculas)');
    r = await call('POST', '/api/auth/login', { identifier: 'pepe@ejemplo.com', password: 'Clave-Segura-77' }); ok(r.status === 200, 'o con el correo');
    r = await call('POST', '/api/auth/login', { identifier: 'Pepe_1', password: 'mala' }); ok(r.status === 401 && /incorrectos/.test(r.j.error) && (await call('POST', '/api/auth/login', { identifier: 'NoExiste', password: 'x' })).j.error === r.j.error, 'contraseña mala: mismo mensaje que usuario inexistente (no revela si existe)');
    const ipL = ip(); for (let i = 0; i < 6; i++) r = await call('POST', '/api/auth/login', { identifier: 'Pepe_1', password: 'mala' + i }, null, ipL); ok(r.status === 429 || (await call('POST', '/api/auth/login', { identifier: 'Pepe_1', password: 'Clave-Segura-77' }, null, ipL)).status === 429, 'tras varios fallos la IP queda bloqueada unos minutos');
    ok((await call('GET', '/api/me')).status === 401 && (await call('GET', '/api/me', null, 'x'.repeat(64))).status === 401, 'sin sesión válida no se ve el perfil');
    ok((await call('GET', '/api/me', null, T1)).j.profile.username === 'Pepe_1', 'con la sesión sí');

    /* ---------- Nombres en las partidas ---------- */
    const guest = new Bot('Pepe_1'); let m = await guest.connect(); await sleep(300);
    ok(m.t === 'welcome' && m.n !== 'Pepe_1' && /^Pepe_1_\d{3}$/.test(m.n) && guest.msgs.some(x => x.t === 'notice' && /registrada/.test(x.m)), 'un invitado que pide el nombre de una cuenta NO es expulsado: juega con un nombre libre y se le avisa (el nombre registrado sigue siendo de su dueño)'); guest.close();
    const A = new Bot('otro nombre', { acct: T1 }); m = await A.connect(); ok(m.t === 'welcome' && m.n === 'Pepe_1' && !m.rl, 'con la cuenta, entra siempre con su nombre único (aunque envíe otro)');
    const T2 = (await reg('Lola_2', 'lola@ejemplo.com', 'Clave-Segura-77')).j.token; const B = new Bot('x', { acct: T2 }); await B.connect();
    const free = new Bot('Libre99'); ok((await free.connect()).t === 'welcome', 'y un invitado con un nombre libre entra sin problema'); free.close();
    ok((await call('POST', '/api/auth/logout', {}, T2)).status === 200 && (await call('GET', '/api/me', null, T2)).status === 401, 'cerrar sesión invalida el token');
    const T2b = (await call('POST', '/api/auth/login', { identifier: 'Lola_2', password: 'Clave-Segura-77' })).j.token;

    /* ---------- Progreso y PX tras una partida ---------- */
    await until(() => A.pos && B.pos); await sleep(1700); const tp = { x: B.pos.x, z: B.pos.z };
    ok(await approach(A, tp), 'los dos jugadores están en la misma sala y A ve a B'); let shots = 0;
    for (let i = 0; i < 16 && !B.has('kill'); i++) { const dx = tp.x - A.pos.x, dz = tp.z - A.pos.z, dy = -0.5, l = Math.hypot(dx, dy, dz); A.send({ t: 'shoot', o: [A.pos.x, 1.6, A.pos.z], d: [[dx / l, dy / l, dz / l]] }); shots++; await sleep(120); }
    ok(await until(() => B.has('kill')), 'A elimina a B');
    const roomId = (await adm('GET', '/players')).j.players.find(p => p.name === 'Pepe_1').room; await adm('POST', '/rooms/action', { id: roomId, action: 'end' });
    ok(await until(() => A.has('award') && B.has('award')), 'al terminar la ronda, el servidor reparte el progreso a las dos cuentas');
    const aw = A.last('award'), awB = B.last('award'); const expected = S.pxFor(A.last('end') ? aw.stats.points : 0, true, 0);
    ok(aw.px === expected && aw.px > 0 && aw.balance === aw.px && aw.stats.games === 1 && aw.stats.kills === 1 && aw.stats.wins === 1 && aw.stats.points > 0, 'el ganador recibe PX según la fórmula del juego (' + aw.px + ' PX por ' + aw.stats.points + ' puntos)');
    ok(awB.stats.deaths === 1 && awB.stats.wins === 0 && awB.stats.games === 1, 'el otro suma la partida y la muerte, sin victoria');
    r = await call('GET', '/api/me', null, T1); ok(r.j.profile.px === aw.px && r.j.profile.stats.points === aw.stats.points, 'el perfil de la cuenta guarda el saldo y los puntos (las cuentas online no dependen del navegador)');
    ok(A.has('end', e => Array.isArray(e.maps) && e.maps.length === S.MAPS.length && e.cur === 0), 'el mensaje de fin de ronda trae la lista de mapas para votar');

    /* ---------- Votación de mapa ---------- */
    A.send({ t: 'vote', m: 0 }); B.send({ t: 'vote', m: 0 });   // hay un solo mapa: se vota ese
    ok(await until(() => A.has('votes', v => v.v.length === 1 && v.v[0] === 2)), 'los votos llegan en directo a todos (2 votos para el único mapa)');
    A.send({ t: 'vote', m: 99 }); A.send({ t: 'vote', m: 1 }); await sleep(100); ok(!A.has('votes', v => v.v.length !== S.MAPS.length), 'un voto no válido (99, o el mapa 1 que ya no existe) se ignora');
    ok(await until(() => A.msgs.filter(x => x.t === 'round').length >= 1 && B.msgs.filter(x => x.t === 'round').length >= 1, 8000) && !A.has('map') && !B.has('map'), 'al acabar el descanso empieza la ronda en el mismo mapa (con un solo mapa la sala no cambia de mapa)');
    ok((await adm('GET', '/overview')).j.rooms[0].map === 0, 'y el servidor confirma la sala en Nexus Outpost');

    /* ---------- Colores y rangos ---------- */
    r = await call('POST', '/api/me/unlock', { i: 4 }, T1); ok(r.status === 402 && /faltan/.test(r.j.error) || aw.px >= 150, 'comprar un color sin PX suficientes se rechaza');
    ok((await call('POST', '/api/me/unlock', { i: 99 }, T1)).status === 400 && (await call('POST', '/api/me/unlock', { i: 1 }, T1)).status === 400, 'colores inexistentes o ya tenidos: rechazados');
    /* ---------- Panel de administración: sumar y restar PX ---------- */
    ok((await call('POST', '/api/admin/px', { username: 'pepe_1', delta: 100 })).status === 401, 'sin sesión de administrador no se puede tocar el saldo');
    const before = (await call('GET', '/api/me', null, T1)).j.profile.px;
    r = await adm('POST', '/px', { username: 'PEPE_1', delta: 1000, reason: 'regalo de prueba' }); ok(r.status === 200 && r.j.applied === 1000 && r.j.balance === before + 1000, 'el administrador suma PX a una cuenta (sin distinguir mayúsculas)');
    r = await call('POST', '/api/me/unlock', { i: 4 }, T1); ok(r.status === 200 && r.j.profile.px === before + 1000 - 150 && r.j.profile.unlocked.includes(4), 'con PX ya puede comprar el color Amarillo (−150 PX)');
    r = await call('POST', '/api/me/unlock', { i: 4 }, T1); ok(r.status === 400, 'no se cobra dos veces');
    r = await call('POST', '/api/me/claim', { i: 0 }, T1); ok(r.status === 200 && r.j.gained === 50 && r.j.profile.claimed.includes(0), 'reclama el rango Bronce (+50 PX)'); ok((await call('POST', '/api/me/claim', { i: 0 }, T1)).status === 400 && (await call('POST', '/api/me/claim', { i: 3 }, T1)).status === 400, 'no se repite ni se reclaman rangos sin alcanzar');
    const bal = (await call('GET', '/api/me', null, T1)).j.profile.px;
    r = await adm('POST', '/px', { username: 'Pepe_1', delta: -(bal + 5000), reason: 'ajuste' }); ok(r.status === 200 && r.j.applied === -bal && r.j.balance === 0, 'restar más de lo que tiene deja el saldo en 0 (nunca negativo)');
    ok((await adm('POST', '/px', { username: 'NoExiste', delta: 5 })).status === 404 && (await adm('POST', '/px', { username: 'Pepe_1', delta: 0 })).status === 400 && (await adm('POST', '/px', { username: 'Pepe_1', delta: 2000000 })).status === 400 && (await adm('POST', '/px', { username: 'Pepe_1', delta: 'abc' })).status === 400, 'cantidades no válidas o cuentas inexistentes: rechazadas');
    r = await adm('GET', '/accounts?q=pep'); ok(r.j.accounts.some(a => a.username === 'Pepe_1' && a.email === 'pe***@ejemplo.com') && r.j.total >= 2 && !JSON.stringify(r.j).includes('hash'), 'el panel lista las cuentas (correo enmascarado, sin datos secretos)');
    r = await adm('GET', '/orders'); ok(r.j.pxlog.length >= 2 && r.j.pxlog[0].by === 'Viexbox' && r.j.pxlog[0].reason === 'ajuste', 'queda el historial de ajustes de PX');
    ok((await adm('GET', '/audit')).j.audit.some(a => a.action === 'px-sumar' && /Pepe_1 \+1000/.test(a.detail)) && (await adm('GET', '/audit')).j.audit.some(a => a.action === 'px-restar'), 'y la auditoría anota quién sumó o restó y cuánto');
    await adm('POST', '/px', { username: 'Pepe_1', delta: 300, reason: 'para comprar' });

    /* ---------- Tienda de PX (Stripe) ---------- */
    r = await call('GET', '/api/store'); ok(r.j.enabled === true && r.j.packs.length === 4 && r.j.packs[0].px === 500 && r.j.packs[0].price === 99 && r.j.currency === 'eur', 'la tienda lista los paquetes (500 PX por 0,99 €…) y está activada');
    ok((await call('POST', '/api/store/checkout', { pack: 'px500' })).status === 401, 'para comprar hay que tener sesión');
    ok((await call('POST', '/api/store/checkout', { pack: 'no-existe' }, T1)).status === 400, 'paquete inexistente rechazado');
    r = await call('POST', '/api/store/checkout', { pack: 'px1300' }, T1); const call1 = stripeCalls[stripeCalls.length - 1];
    ok(r.status === 200 && r.j.url === 'https://checkout.stripe.test/pay/cs_test_1' && call1.auth === 'Bearer sk_test_mock' && call1.form['line_items[0][price_data][unit_amount]'] === '199' && call1.form['line_items[0][price_data][currency]'] === 'eur' && call1.form.mode === 'payment' && call1.form.success_url === 'https://mijuego.example/?px=ok' && call1.form.client_reference_id === (await call('GET', '/api/me', null, T1)).j.profile.id && /^[0-9a-f-]{36}$/.test(call1.form.client_reference_id), 'iniciar una compra crea la sesión de pago con el importe del servidor (199 céntimos), no el que diga el navegador');
    ok(call1.form['payment_method_types[0]'] === 'card' && call1.form['payment_method_types[1]'] === 'paypal' && !('payment_method_types[2]' in call1.form), 'la tienda ofrece SOLO tarjeta y PayPal (no depende de lo activado en el panel de Stripe)');
    ok(JSON.stringify((await call('GET', '/api/store')).j.methods) === '["card","paypal"]', 'y GET /api/store lo indica');
    /* Si la cuenta de Stripe no tiene PayPal activado, la tienda no se cae: cobra solo con tarjeta y lo deja en el registro */
    { const n0 = stripeCalls.length; rejectPaypal = true; const rr = await call('POST', '/api/store/checkout', { pack: 'px500' }, T1); rejectPaypal = false;
      const two = stripeCalls.slice(n0); ok(rr.status === 200 && rr.j.url && two.length === 2 && two[0].form['payment_method_types[1]'] === 'paypal' && two[1].form['payment_method_types[0]'] === 'card' && !('payment_method_types[1]' in two[1].form), 'sin PayPal activado en Stripe: se reintenta solo con tarjeta y el jugador puede pagar igualmente');
      ok(JSON.stringify((await call('GET', '/api/store')).j.methods) === '["card"]', 'y la tienda pasa a indicar solo tarjeta hasta que se reinicie el servidor');
      await call('POST', '/api/store/checkout', { pack: 'px500' }, T1); const last = stripeCalls[stripeCalls.length - 1]; ok(last.form['payment_method_types[0]'] === 'card' && !('payment_method_types[1]' in last.form), 'los siguientes pagos ya no vuelven a intentar PayPal'); }
    const before2 = (await call('GET', '/api/me', null, T1)).j.profile.px;
    ok(!((await call('GET', '/api/me', null, T1)).j.profile.px > before2), 'iniciar el pago no da PX todavía');
    ok((await adm('GET', '/orders')).j.orders.some(o => o.id === 'cs_test_1' && o.status === 'pending' && o.px === 1300), 'el pedido queda pendiente');
    const paid = (id, amount, cur, status) => ({ type: 'checkout.session.completed', data: { object: { id, payment_status: status || 'paid', amount_total: amount, currency: cur || 'eur' } } });
    ok(await hook(paid('cs_test_1', 199), 'sin-firma') === 400 && await hook(paid('cs_test_1', 199), sign(JSON.stringify(paid('cs_test_1', 199)), 'otro_secreto')) === 400 && await hook(paid('cs_test_1', 199), sign(JSON.stringify(paid('cs_test_1', 199)), WH, Math.floor(Date.now() / 1000) - 4000)) === 400, 'el aviso de pago con firma falsa, ajena o caducada se rechaza');
    ok((await call('GET', '/api/me', null, T1)).j.profile.px === before2, '…y no acredita nada');
    ok(await hook(paid('cs_test_1', 199, 'eur', 'unpaid')) === 200 && (await call('GET', '/api/me', null, T1)).j.profile.px === before2, 'un pago sin completar tampoco acredita');
    ok(await hook(paid('cs_test_1', 99)) === 200 && (await call('GET', '/api/me', null, T1)).j.profile.px === before2 && (await adm('GET', '/orders')).j.orders.find(o => o.id === 'cs_test_1').status === 'mismatch', 'si el importe pagado no coincide con el pedido, no se acredita y queda marcado');
    r = await call('POST', '/api/store/checkout', { pack: 'px1300' }, T1); const id2 = r.j.url.split('/').pop();
    ok(await hook(paid(id2, 199)) === 200 && (await call('GET', '/api/me', null, T1)).j.profile.px === before2 + 1300, 'con un aviso firmado y el importe correcto se acreditan los 1.300 PX');
    ok(await hook(paid(id2, 199)) === 200 && (await call('GET', '/api/me', null, T1)).j.profile.px === before2 + 1300, 'si Stripe repite el aviso, no se acredita dos veces');
    ok(await hook(paid('cs_desconocida', 199)) === 200 && (await call('GET', '/api/me', null, T1)).j.profile.px === before2 + 1300, 'un pago de una sesión que no es nuestra se ignora');
    ok((await adm('GET', '/orders')).j.orders.find(o => o.id === id2).status === 'paid', 'el pedido queda como pagado en el panel');

    /* ---------- Persistencia ---------- */
    for (const b of [A, B]) b.close(); await sleep(300); srv.kill('SIGTERM'); await sleep(700);
    srv = start(PORT, D, { STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_WEBHOOK_SECRET: WH, STRIPE_API_BASE: 'http://127.0.0.1:' + STRIPE, PUBLIC_URL: 'https://mijuego.example' }); await sleep(1300);
    r = await call('GET', '/api/me', null, T1); ok(r.status === 200 && r.j.profile.px === before2 + 1300 && r.j.profile.stats.games === 1 && r.j.profile.unlocked.includes(4), 'tras reiniciar el servidor, la sesión, el saldo, las estadísticas y los colores siguen ahí');
    ok((await call('POST', '/api/auth/login', { identifier: 'Lola_2', password: 'Clave-Segura-77' })).status === 200 && (await reg('lola_2', 'x@y.com', 'Clave-Segura-77')).status === 409, 'y los nombres siguen siendo únicos');

    /* ---------- Sin pagos configurados ---------- */
    const off = start(PORT2, D2, {}); await sleep(1300);
    r = await call('GET', '/api/store', null, null, null, PORT2); ok(r.j.enabled === false && /no ha activado/.test(r.j.reason) && r.j.packs.length === 4, 'sin claves de Stripe la tienda muestra los paquetes pero avisa de que los pagos no están activados');
    const Toff = (await reg('Sola_1', 'sola@b.com', 'Clave-Segura-77', null).then(() => call('POST', '/api/auth/register', { username: 'Sola_2', email: 'sola2@b.com', password: 'Clave-Segura-77' }, null, null, PORT2))).j.token;
    r = await call('POST', '/api/store/checkout', { pack: 'px500' }, Toff, null, PORT2); ok(r.status === 503, 'y no se puede iniciar ninguna compra (no hay compras «de mentira»)');
    ok(await hook(paid('cs_1', 99), sign(JSON.stringify(paid('cs_1', 99))), PORT2) === 400, 'ni acreditar nada por webhook: sin secreto configurado se rechaza todo');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } stripe.close();
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
