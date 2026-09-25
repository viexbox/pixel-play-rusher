'use strict';
/* Pase de batalla (backend): reglas de XP, reclamar, VIP, regalo, saltar niveles, equipar, XP por partida, panel y persistencia.
   Se ejecuta contra los dos almacenes: PostgreSQL (si hay uno accesible en PG_TEST_URL) y archivos JSON. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
const APASS = 'Pase-Admin-2026xy';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 20; const ip = () => '10.7.3.' + (ipn++);
class Bot {
  constructor(port, name, extra) { this.port = port; this.name = name; this.extra = extra || {}; this.msgs = []; this.pos = null; this.ep = 0; }
  connect() { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + this.port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: 0, c: 0 }, this.extra))); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; res(m); } if (m.t === 'err') res(m); if (m.t === 'spawn' && m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; } if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; } }); this.ws.on('error', () => {}); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); }
  last(t) { return [...this.msgs].reverse().find(m => m.t === t); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}
const world = S.buildWorld(0);
const los = (a, b) => { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: -0.5, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; };
async function approach(bot, tgt) { for (let r = 6; r <= 12; r += 3) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 38 || Math.abs(z) > 38 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; if (los({ x, z }, tgt)) { await bot.walkTo(x, z); return true; } } return false; }

async function scenario(label, port, dir, dbUrl) {
  console.log('\n=== Almacén: ' + label + ' ===');
  const B = 'http://127.0.0.1:' + port;
  const startSrv = () => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, MATCH_TIME: 120, KILL_LIMIT: 99, BREAK_SECS: 3, HISTORY_MIN_SECS: 1, MAX_CONN_PER_IP: 30, ACCOUNTS_REG_MAX: 50 }, dbUrl ? { DATABASE_URL: dbUrl } : { DATABASE_URL: '' }), stdio: ['ignore', 'pipe', 'pipe'] }); p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; }); procs.push(p); return p; };
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77' })).j.token;
  let srv = startSrv(); await sleep(dbUrl ? 2200 : 1400);
  const st = await call('GET', '/api/status'); ok(st.j.bp === true && st.j.db === (dbUrl ? 'postgres' : 'archivos'), 'el servidor arranca con el almacén «' + st.j.db + '»');
  const TA = await reg('Zoe_7', 'zoe@e.com'), TB = await reg('Nico_9', 'nico@e.com'), TC = await reg('Lucia_3', 'lucia@e.com');
  const LA = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token, adm = (m, p, b) => call(m, '/api/admin' + p, b, LA);
  await adm('POST', '/px', { username: 'Zoe_7', delta: 6000, reason: 'prueba' }); await adm('POST', '/px', { username: 'Nico_9', delta: 100, reason: 'prueba' });
  const px = async tk => (await call('GET', '/api/me', null, tk)).j.profile.px, bp = async tk => (await call('GET', '/api/bp', null, tk)).j.state;

  /* ---- estado inicial y reglas de reclamo ---- */
  ok((await call('GET', '/api/bp')).status === 401 && (await call('POST', '/api/bp/claim', { level: 1, track: 'free' })).status === 401, 'sin sesión no se puede ver ni tocar el pase');
  let s0 = await bp(TA); ok(s0.level === 1 && s0.xp === 0 && s0.vip === false && s0.need === 250 && s0.prices.vip === 1500 && s0.prices.skip === 120 && s0.claims.length === 0, 'estado inicial: nivel 1, 0 XP, sin VIP, precios 1.500 PX y 120 PX por nivel');
  ok((await call('POST', '/api/bp/claim', { level: 2, track: 'free' }, TA)).status === 400, 'no se puede reclamar un nivel que aún no se ha alcanzado');
  ok((await call('POST', '/api/bp/claim', { level: 1, track: 'vip' }, TA)).status === 403, 'la fila VIP está bloqueada sin el pase');
  for (const bad of [{ level: 0, track: 'free' }, { level: 51, track: 'free' }, { level: 1, track: 'oro' }, { level: 'x', track: 'free' }]) ok((await call('POST', '/api/bp/claim', bad, TA)).status === 400, 'reclamo no válido rechazado: ' + JSON.stringify(bad));
  const p0 = await px(TA); let r = await call('POST', '/api/bp/claim', { level: 1, track: 'free' }, TA);
  ok(r.status === 200 && r.j.reward.t === 'px' && r.j.reward.n === 8 && await px(TA) === p0 + 8, 'nivel 1 gratis: +8 PX en el saldo');
  ok((await call('POST', '/api/bp/claim', { level: 1, track: 'free' }, TA)).status === 409 && await px(TA) === p0 + 8, 'no se puede reclamar dos veces (y no se paga dos veces)');

  /* ---- comprar el VIP ---- */
  ok((await call('POST', '/api/bp/buy', {}, TB)).status === 402 && (await bp(TB)).vip === false, 'sin PX suficientes no se compra el VIP y no se cobra nada');
  const [b1, b2] = await Promise.all([call('POST', '/api/bp/buy', {}, TA), call('POST', '/api/bp/buy', {}, TA)]); const okBuys = [b1, b2].filter(x => x.status === 200).length;
  ok(okBuys === 1 && [b1, b2].some(x => x.status === 400) && await px(TA) === p0 + 8 - 1500 && (await bp(TA)).vip === true, 'dos compras simultáneas (doble clic): solo una tiene efecto y se cobra 1.500 PX una vez');

  /* ---- reclamar la fila VIP, banner y equipar ---- */
  r = await call('POST', '/api/bp/claim', { level: 1, track: 'vip' }, TA); ok(r.status === 200 && r.j.reward.t === 'banner' && r.j.reward.id === 's1' && r.j.state.inventory.some(i => i.t === 'banner' && i.id === 's1'), 'ahora sí: el banner exclusivo S1 (nivel 1 VIP) pasa al inventario');
  ok((await call('POST', '/api/bp/equip', { slot: 'banner', item: 's1' }, TA)).j.state.equipped.banner === 's1', 'y se puede equipar');
  ok((await call('POST', '/api/bp/equip', { slot: 'banner', item: 's1' }, TC)).status === 403, 'quien no lo tiene no puede equiparlo');

  /* ---- saltar niveles ---- */
  let pk = await px(TA); r = await call('POST', '/api/bp/skip', { levels: 5 }, TA);
  ok(r.status === 200 && r.j.skipped === 5 && r.j.cost === 600 && r.j.state.level === 6 && r.j.state.xp === S.bpTotalXp(6) && await px(TA) === pk - 600, 'saltar 5 niveles: nivel 6, XP exacta (' + S.bpTotalXp(6) + ') y 600 PX cobrados');
  ok((await call('POST', '/api/bp/skip', { levels: 0 }, TA)).status === 400 && (await call('POST', '/api/bp/skip', { levels: -3 }, TA)).status === 400, 'cantidades no válidas rechazadas');
  ok((await call('POST', '/api/bp/skip', { levels: 5 }, TB)).status === 402, 'sin PX no se salta');
  ok((await call('POST', '/api/bp/skip', { levels: 999 }, TA)).status === 402, 'pedir todos los niveles sin PX suficientes se rechaza y no cobra'); await adm('POST', '/px', { username: 'Zoe_7', delta: 6000, reason: 'prueba' });
  pk = await px(TA); r = await call('POST', '/api/bp/skip', { levels: 999 }, TA); ok(r.status === 200 && r.j.skipped === 44 && r.j.state.level === 50 && r.j.cost === 44 * 120 && await px(TA) === pk - 5280, 'pedir más de la cuenta se limita al nivel 50 (44 niveles, 5.280 PX)');
  ok((await call('POST', '/api/bp/skip', { levels: 1 }, TA)).status === 400, 'en el nivel máximo no se puede saltar más');

  /* ---- reclamar todo ---- */
  const before = await bp(TA), pBefore = await px(TA); r = await call('POST', '/api/bp/claim-all', {}, TA);
  const wantPx = S.BP_TIERS.reduce((n, t) => n + (t.free.t === 'px' ? t.free.n : 0) + (t.vip.t === 'px' ? t.vip.n : 0), 0) - 8;   // todo menos lo ya reclamado (nivel 1 gratis)
  ok(r.status === 200 && r.j.claimed.length === 100 - 2 && r.j.state.claims.length === 100, 'reclamar todo: las 98 recompensas pendientes (50 niveles × 2 filas)');
  ok(await px(TA) === pBefore + wantPx, 'y suma exactamente los PX del pase (' + wantPx + ')');
  const inv = r.j.state.inventory; ok(inv.filter(i => i.t === 'wskin').length === 15 && inv.filter(i => i.t === 'kskin').length === 7 && inv.filter(i => i.t === 'banner').length === 1, 'el inventario tiene las 15 skins de armas, las 7 de cuchillo y el banner');
  ok((await call('POST', '/api/bp/claim-all', {}, TA)).status === 400, 'una segunda vez no hay nada pendiente');

  /* ---- equipar ---- */
  r = await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'ak_dragon' }, TA); ok(r.status === 200 && r.j.state.equipped['weapon:ak'] === 'ak_dragon', 'equipar la skin Dragón en la AK');
  ok((await call('POST', '/api/bp/equip', { slot: 'weapon:asalto', item: 'ak_dragon' }, TA)).status === 400, 'una skin no se puede poner en otra arma');
  ok((await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'inventada' }, TA)).status === 400 && (await call('POST', '/api/bp/equip', { slot: 'cabeza', item: 's1' }, TA)).status === 400, 'objetos o ranuras inventados: rechazados');
  ok((await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'ak_dragon' }, TC)).status === 403, 'sin tenerla, tampoco');
  ok((await call('POST', '/api/bp/equip', { slot: 'knife', item: 'k_oro' }, TA)).j.state.equipped.knife === 'k_oro', 'cuchillo Oro real equipado');
  ok(!(await call('POST', '/api/bp/equip', { slot: 'knife', item: 'k_clasico' }, TA)).j.state.equipped.knife, 'elegir el cuchillo clásico quita la skin');
  ok(!(await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: null }, TA)).j.state.equipped['weapon:ak'], 'y se puede quitar una skin de arma');
  await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'ak_dragon' }, TA); await call('POST', '/api/bp/equip', { slot: 'knife', item: 'k_oro' }, TA);

  /* ---- regalar ---- */
  await adm('POST', '/px', { username: 'Nico_9', delta: 2000, reason: 'prueba' }); await adm('POST', '/px', { username: 'Lucia_3', delta: 100, reason: 'prueba' });
  ok((await call('POST', '/api/bp/gift', { to: 'Zoe_7' }, TA)).status === 400, 'no se puede regalar el pase a uno mismo');
  ok((await call('POST', '/api/bp/gift', { to: 'NoExiste' }, TA)).status === 404, 'ni a alguien que no existe');
  pk = await px(TA); r = await call('POST', '/api/bp/gift', { to: 'nico_9' }, TA);
  ok(r.status === 200 && r.j.to === 'Nico_9' && await px(TA) === pk - 1500, 'Zoe regala el pase a Nico (sin distinguir mayúsculas): −1.500 PX a Zoe');
  const sb = await bp(TB); ok(sb.vip === true && sb.giftedBy === 'Zoe_7', 'Nico tiene el VIP y ve quién se lo regaló');
  pk = await px(TA); ok((await call('POST', '/api/bp/gift', { to: 'Nico_9' }, TA)).status === 400 && await px(TA) === pk, 'regalarlo otra vez a Nico se rechaza sin cobrar');
  ok((await call('POST', '/api/bp/gift', { to: 'Zoe_7' }, TC)).status === 400 && (await call('POST', '/api/bp/gift', { to: 'Nico_9' }, TC)).status === 400, 'Lucia (100 PX) no puede regalar');
  pk = await px(TC); ok((await call('POST', '/api/bp/gift', { to: 'Zoe_7' }, TC)).status !== 200 && await px(TC) === pk, 'y a Lucia no se le cobra nada');
  ok((await call('POST', '/api/bp/buy', {}, TB)).status === 400, 'Nico ya no puede comprarlo: lo tiene');

  /* ---- XP por partida real (Nico gana a Lucia) ---- */
  const SH = new Bot(port, 'x', { acct: TB }), VI = new Bot(port, 'y', { acct: TC }); await SH.connect(); await VI.connect();
  await until(() => SH.pos && VI.pos); await sleep(1700); const tpos = { x: VI.pos.x, z: VI.pos.z }; ok(await approach(SH, tpos), 'los dos jugadores están en la misma sala con línea de visión');
  const xb0 = (await bp(TB)).xp, xc0 = (await bp(TC)).xp;
  for (let i = 0; i < 16 && !VI.has('kill'); i++) { const dx = tpos.x - SH.pos.x, dz = tpos.z - SH.pos.z, dy = -0.5, l = Math.hypot(dx, dy, dz); SH.send({ t: 'shoot', o: [SH.pos.x, 1.6, SH.pos.z], d: [[dx / l, dy / l, dz / l]] }); await sleep(120); }
  const room = (await adm('GET', '/players')).j.players.find(p => p.name === 'Nico_9').room; await adm('POST', '/rooms/action', { id: room, action: 'end' });
  ok(await until(() => SH.has('bpxp') && VI.has('bpxp')), 'al acabar la ronda el servidor manda la XP del pase a las dos cuentas');
  const xw = SH.last('bpxp'), xl = VI.last('bpxp'), ptsW = SH.last('award').stats.points, ptsL = VI.last('award').stats.points;
  ok(xw.xp === S.bpXpFor(ptsW, true) && xw.xp > 0 && xl.xp === S.bpXpFor(ptsL, false), 'el ganador recibe XP según la fórmula (' + xw.xp + ' XP por ' + ptsW + ' puntos, con bonus de victoria) y el otro la suya (' + xl.xp + ')');
  ok((await bp(TB)).xp === xb0 + xw.xp && (await bp(TC)).xp === xc0 + xl.xp && xw.total === xb0 + xw.xp, 'las dos cuentas guardan la XP en el servidor (el mensaje trae el total y el nivel)');
  ok(xw.level === S.bpLevelOf(xb0 + xw.xp).level, 'y el nivel del mensaje coincide con la curva (' + xw.level + ')'); SH.close(); VI.close();

  /* ---- panel de administración ---- */
  ok((await call('POST', '/api/admin/bp/grant', { username: 'Lucia_3', xp: 500 })).status === 401, 'sin sesión de administrador no se concede nada');
  r = await adm('POST', '/bp/grant', { username: 'Lucia_3', xp: 700, vip: true }); ok(r.status === 200 && r.j.state.vip && r.j.state.xp >= 700, 'el administrador concede VIP y XP a una cuenta');
  ok((await adm('POST', '/bp/grant', { username: 'NoExiste', xp: 5 })).status === 404 && (await adm('POST', '/bp/grant', { username: 'Lucia_3' })).status === 400, 'cuentas inexistentes o peticiones vacías: rechazadas');
  r = await adm('POST', '/bp/grant', { username: 'Lucia_3', xp: 100000 }); ok(r.status === 200 && r.j.state.xp === S.bpTotalXp(50) && r.j.state.level === 50, 'la XP nunca pasa del tope del nivel 50 (' + S.bpTotalXp(50) + ')');
  ok((await adm('GET', '/bp/user?username=lucia_3')).j.state.vip === true && (await adm('GET', '/audit')).j.audit.some(a => a.action === 'pase-conceder' && /Lucia_3/.test(a.detail)), 'consulta de un usuario y anotación en la auditoría');

  /* ---- persistencia ---- */
  const fin = { A: await bp(TA), B: await bp(TB), C: await bp(TC) }; const pxA = await px(TA); await sleep(1800);
  srv.kill('SIGTERM'); await sleep(1200); srv = startSrv(); await sleep(dbUrl ? 2200 : 1400);
  const after = { A: await bp(TA), B: await bp(TB), C: await bp(TC) };
  ok(JSON.stringify(after) === JSON.stringify(fin) && after.A.claims.length === 100 && after.A.vip && after.A.level === 50 && after.A.equipped['weapon:ak'] === 'ak_dragon' && after.B.giftedBy === 'Zoe_7', 'tras reiniciar el servidor, el nivel, la XP, el VIP, los reclamados, el inventario y lo equipado siguen igual');
  ok(await px(TA) === pxA && (await call('POST', '/api/auth/login', { identifier: 'Zoe_7', password: 'Clave-Segura-77' })).status === 200, 'y también el saldo de PX y las cuentas');
  if (dbUrl) {
    const { Client } = require('pg'); const c = new Client({ connectionString: dbUrl }); await c.connect();
    const q = async (sql, a) => (await c.query(sql, a)).rows;
    const zoe = (await q("SELECT name FROM app_docs WHERE name='accounts.json'")).length; const users = (await q("SELECT data->'users' AS u FROM app_docs WHERE name='accounts.json'"))[0].u; const zid = Object.values(users).find(u => u.username === 'Zoe_7').id;   // las cuentas se guardan por UUID
    const row = (await q('SELECT xp, level, vip FROM bp_progress WHERE user_id = $1 AND season = 1', [zid]))[0];
    ok(zoe === 1 && row.level === 50 && row.vip === true && row.xp === S.bpTotalXp(50), 'en PostgreSQL: bp_progress guarda nivel 50, VIP y la XP exacta; las cuentas están en app_docs');
    ok((await q('SELECT count(*)::int AS n FROM bp_claims WHERE user_id = $1', [zid]))[0].n === 100 && (await q('SELECT count(*)::int AS n FROM bp_inventory WHERE user_id = $1', [zid]))[0].n === 23 && (await q('SELECT count(*)::int AS n FROM bp_equipped WHERE user_id = $1', [zid]))[0].n === 3 && (await q('SELECT count(*)::int AS n FROM bp_gifts'))[0].n === 1, 'bp_claims (100), bp_inventory (23), bp_equipped (3) y bp_gifts (1) con los datos esperados');
    let dup = ''; try { await c.query("INSERT INTO bp_claims (user_id, season, level, track, item_type, item_id) VALUES ($1, 1, 1, 'free', 'px', '8')", [zid]); } catch (e) { dup = e.code; }
    ok(dup === '23505', 'la propia base de datos impide reclamar dos veces (clave única): error ' + dup);
    let bad = ''; try { await c.query("INSERT INTO bp_progress (user_id, season, xp, level) VALUES (999, 1, -5, 1)"); } catch (e) { bad = e.code; }
    let bad2 = ''; try { await c.query("INSERT INTO bp_claims (user_id, season, level, track, item_type, item_id) VALUES (999, 1, 1, 'oro', 'px', '1')"); } catch (e) { bad2 = e.code; }
    ok(bad === '23514' && bad2 === '23514', 'y rechaza XP negativa y filas de pase inventadas (restricciones CHECK)');
    ok((await q("SELECT id FROM schema_migrations ORDER BY id")).map(x => x.id).join() === '001_init.sql,002_uuid_users.sql,003_market.sql,004_avatars.sql,005_market_v2.sql,006_pets_event.sql', 'las migraciones quedan registradas en orden (001 a 006: base, UUID, mercado, fotos, mercado v2 y mascotas)');
    await c.end();
  } else { const f = JSON.parse(fs.readFileSync(path.join(dir, 'battlepass.json'), 'utf8')); ok(Object.keys(f.users).length >= 3 && f.gifts.length === 1, 'en archivo: battlepass.json guarda los usuarios y el regalo'); }
  srv.kill('SIGTERM'); await sleep(600);
}

(async () => {
  const dirs = ['/tmp/ppr_bp_file', '/tmp/ppr_bp_pg']; for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  let pgOk = false;
  try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('(PostgreSQL no disponible en ' + PG_URL.replace(/:[^:@]*@/, ':***@') + ': ' + e.message + ' → solo se prueba el almacén de archivos)'); }
  try {
    if (pgOk) await scenario('PostgreSQL', 3186, dirs[1], PG_URL);
    await scenario('archivos JSON', 3187, dirs[0], null);
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
