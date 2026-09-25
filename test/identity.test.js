'use strict';
/* Identidad por ID único: migración de cuentas antiguas (clave = nombre, id numérico) a UUID sin perder nada, cambio de nombre,
   nombres duplicados con sugerencias, invitados con nombre de una cuenta y una sola sesión de juego por cuenta.
   Se ejecuta con archivos JSON y (si hay uno accesible en PG_TEST_URL) con PostgreSQL. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const crypto = require('crypto'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 30; const ip = () => '10.8.5.' + (ipn++);
const scryptHex = (pw, salt) => crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');

class Bot {
  constructor(port, name, extra) { this.port = port; this.name = name; this.extra = extra || {}; this.msgs = []; this.closed = false; }
  connect() { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + this.port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); this.ws.on('open', () => this.ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, n: this.name, map: 0, c: 0 }, this.extra)))); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome' || m.t === 'err') res(m); }); this.ws.on('close', () => { this.closed = true; }); this.ws.on('error', () => {}); }); }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}

async function scenario(label, port, dir, dbUrl) {
  console.log('\n=== Almacén: ' + label + ' ===');
  const B = 'http://127.0.0.1:' + port; const now = Date.now();
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const user = (id, name, email, px, pts) => ({ id, username: name, key: name.toLowerCase().replace(/[^a-z0-9]/g, ''), email, salt: 'ab'.repeat(16), hash: scryptHex('Clave-Segura-77', 'ab'.repeat(16)), createdAt: now - 9e6, lastLogin: now - 1e6, px, stats: { games: 5, kills: 20, deaths: 10, wins: 2, streak: 4, points: pts, best: 400 }, unlocked: [0, 1, 2, 3, 5], claimed: [0], day: { d: '', px: 0 } });
  const legacyAccounts = { seq: 2, users: { pepe1: user(1, 'Pepe_1', 'pepe@e.com', 700, 900), lola2: user(2, 'Lola_2', 'lola@e.com', 50, 100) },
    sessions: { [sha('token-antiguo-pepe')]: { uid: 1, exp: now + 86400000 }, [sha('token-huerfano')]: { uid: 99, exp: now + 86400000 } },
    orders: [{ id: 'cs_old_1', uid: 1, user: 'Pepe_1', pack: 'px1300', px: 1300, amount: 199, currency: 'eur', status: 'paid', ts: now - 5e6 }], pxlog: [] };
  const legacyLb = { entries: [{ n: 'Pepe_1', p: 500, k: 12, d: 4, h: 3, c: 'Asalto', m: 0, t: now - 3e6, r: 0 }, { n: 'Anónimo', p: 300, k: 5, d: 5, h: 0, c: 'Asalto', m: 0, t: now - 3e6, r: 0 }] };
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  if (dbUrl) {
    const { Client } = require('pg'); const c = new Client({ connectionString: dbUrl }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await c.query('CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    await c.query(fs.readFileSync(path.join(__dirname, '..', 'server', 'migrations', '001_init.sql'), 'utf8')); await c.query("INSERT INTO schema_migrations (id) VALUES ('001_init.sql')");   // instalación anterior: solo la migración 001, con ids numéricos
    await c.query("INSERT INTO bp_progress (user_id, season, xp, level, vip) VALUES (1, 1, 2000, $1, TRUE)", [S.bpLevelOf(2000).level]);
    await c.query("INSERT INTO bp_claims (user_id, season, level, track, item_type, item_id) VALUES (1, 1, 1, 'free', 'px', '8')");
    await c.query("INSERT INTO bp_inventory (user_id, item_type, item_id, source) VALUES (1, 'banner', 's1', 'antiguo'), (1, 'kskin', 'k_oxido', 'antiguo')");
    await c.query("INSERT INTO bp_equipped (user_id, slot, item_id) VALUES (1, 'banner', 's1')");
    await c.query("INSERT INTO app_docs (name, data) VALUES ('accounts.json', $1::jsonb), ('leaderboard.json', $2::jsonb)", [JSON.stringify(legacyAccounts), JSON.stringify(legacyLb)]);
    await c.end();
  } else {
    fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(legacyAccounts)); fs.writeFileSync(path.join(dir, 'leaderboard.json'), JSON.stringify(legacyLb));
    fs.writeFileSync(path.join(dir, 'battlepass.json'), JSON.stringify({ users: { '1': { xp: 2000, level: S.bpLevelOf(2000).level, vip: true, vipSince: now - 1e6, giftedBy: '', xpDay: '', xpToday: 0, claims: { '1:free': { t: 'px', id: '8', ts: now } }, inventory: { 'banner:s1': { t: 'banner', id: 's1', source: 'antiguo', ts: now }, 'kskin:k_oxido': { t: 'kskin', id: 'k_oxido', source: 'antiguo', ts: now } }, equipped: { banner: 's1' } } }, gifts: [] }));
  }
  const start = () => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: 'Ident-Admin-2026xy', MAX_CONN_PER_IP: 30, ACCOUNTS_REG_MAX: 50 }, dbUrl ? { DATABASE_URL: dbUrl } : { DATABASE_URL: '' }), stdio: ['ignore', 'pipe', 'pipe'] }); p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; }); procs.push(p); return p; };
  let srv = start(); await sleep(dbUrl ? 2600 : 1600);

  /* ---------- 1. Migración de una instalación antigua ---------- */
  ok(/Cuentas migradas a identificador único \(UUID\): 2/.test(srv.out), 'al arrancar, el servidor migra las 2 cuentas antiguas a UUID');
  let r = await call('POST', '/api/auth/login', { identifier: 'Pepe_1', password: 'Clave-Segura-77' }); const TP = r.j.token, pid = r.j.profile.id;
  ok(r.status === 200 && UUID.test(pid) && r.j.profile.px === 700 && r.j.profile.stats.points === 900 && r.j.profile.unlocked.includes(5) && r.j.profile.claimed.includes(0), 'la cuenta antigua entra con su nombre y contraseña de siempre: ahora con UUID y con sus PX, estadísticas, colores y rangos intactos');
  ok((await call('POST', '/api/auth/login', { identifier: 'PEPE_1', password: 'Clave-Segura-77' })).status === 200 && (await call('POST', '/api/auth/login', { identifier: 'pepe@e.com', password: 'Clave-Segura-77' })).j.profile.id === pid, 'y también sin distinguir mayúsculas y con su correo (siempre el mismo ID)');
  r = await call('GET', '/api/me', null, 'token-antiguo-pepe'); ok(r.status === 200 && r.j.profile.id === pid, 'la sesión que ya tenía abierta sigue valiendo (no hay que volver a iniciar sesión tras actualizar)');
  ok((await call('GET', '/api/me', null, 'token-huerfano')).status === 401, 'una sesión que apuntaba a una cuenta inexistente se descarta');
  r = await call('GET', '/api/bp', null, TP); const bs = r.j.state; ok(bs.xp === 2000 && bs.vip === true && bs.claims.includes('1:free') && bs.inventory.some(i => i.id === 's1') && bs.inventory.some(i => i.id === 'k_oxido') && bs.equipped.banner === 's1', 'el pase de batalla de la cuenta antigua (XP, VIP, reclamados, inventario y banner equipado) pasa al UUID sin perder nada');
  ok((await call('GET', '/api/bp', null, (await call('POST', '/api/auth/login', { identifier: 'Lola_2', password: 'Clave-Segura-77' })).j.token)).j.state.xp === 0, 'y el de otra cuenta no se mezcla (Lola, sin progreso)');
  await sleep(1800);
  if (dbUrl) { const { Client } = require('pg'); const c = new Client({ connectionString: dbUrl }); await c.connect(); const q = async (s, a) => (await c.query(s, a)).rows;
    const docs = (await q("SELECT data FROM app_docs WHERE name='accounts.json'"))[0].data; const keys = Object.keys(docs.users);
    ok(keys.length === 2 && keys.every(k => UUID.test(k)) && Object.values(docs.users).every(u => UUID.test(u.id) && u.id === Object.keys(docs.users).find(k => docs.users[k] === u)) && docs.users[pid].legacyId === '1', 'en PostgreSQL las cuentas quedan guardadas por UUID (no por nombre) y conservan su antiguo id como legacyId');
    ok((await q('SELECT count(*)::int AS n FROM bp_progress WHERE user_id = $1', [pid]))[0].n === 1 && (await q("SELECT count(*)::int AS n FROM bp_progress WHERE user_id = '1'"))[0].n === 0 && (await q('SELECT count(*)::int AS n FROM bp_inventory WHERE user_id = $1', [pid]))[0].n === 2 && (await q('SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', ['bp_progress', 'user_id']))[0].data_type === 'text', 'las filas bp_* pasaron del id 1 al UUID y la columna user_id ahora es texto (migración 002)');
    await c.end();
  } else { const doc = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8')); const bpf = JSON.parse(fs.readFileSync(path.join(dir, 'battlepass.json'), 'utf8'));
    ok(Object.keys(doc.users).length === 2 && Object.keys(doc.users).every(k => UUID.test(k)) && doc.users[pid].legacyId === '1' && !doc.users.pepe1, 'en archivo las cuentas quedan guardadas por UUID (ya no por nombre)');
    ok(bpf.users[pid] && !bpf.users['1'] && bpf.users[pid].xp === 2000, 'battlepass.json también pasa a UUID'); }
  /* La clasificación antigua sigue a la cuenta por su nombre viejo la primera vez que cambia de nombre (ver abajo) */

  /* ---------- 2. Nombres: duplicados, sugerencias y cambio de nombre ---------- */
  r = await call('POST', '/api/auth/register', { username: 'Ana_1', email: 'ana@e.com', password: 'Clave-Segura-77' }); const TA = r.j.token, aid = r.j.profile.id;
  ok(r.status === 200 && UUID.test(aid), 'un registro nuevo recibe un UUID');
  r = await call('POST', '/api/auth/register', { username: 'ANA_1', email: 'ana2@e.com', password: 'Clave-Segura-77' });
  ok(r.status === 409 && /en uso/.test(r.j.error) && Array.isArray(r.j.suggestions) && r.j.suggestions.length >= 2, 'un nombre repetido se gestiona con un 409 claro y alternativas libres (' + (r.j.suggestions || []).join(', ') + ')');
  r = await call('POST', '/api/auth/register', { username: r.j.suggestions[0], email: 'ana3@e.com', password: 'Clave-Segura-77' }); ok(r.status === 200, 'y la primera sugerencia sí se puede registrar');
  const TB = r.j.token;
  await call('POST', '/api/bp/claim', { level: 1, track: 'free' }, TA);
  r = await call('GET', '/api/me', null, TA); const pxA = r.j.profile.px; ok(pxA === 8, 'Ana reclama el nivel 1 del pase (+8 PX)');
  ok((await call('POST', '/api/me/rename', { username: 'Pepe_1' }, TA)).status === 409 && (await call('POST', '/api/me/rename', { username: 'a' }, TA)).status === 400 && (await call('POST', '/api/me/rename', { username: 'Guest_9' }, TA)).status === 400 && (await call('POST', '/api/me/rename', { username: 'Ana_1' }, TA)).status === 400, 'no se puede cambiar a un nombre ocupado, inválido, reservado ni al mismo que ya tienes');
  r = await call('POST', '/api/me/rename', { username: 'Ana_Nueva' }, TA);
  ok(r.status === 200 && r.j.profile.username === 'Ana_Nueva' && r.j.profile.id === aid, 'Ana cambia de nombre: el ID es el mismo');
  r = await call('GET', '/api/me', null, TA); ok(r.status === 200 && r.j.profile.id === aid && r.j.profile.px === pxA && r.j.profile.username === 'Ana_Nueva', 'su sesión sigue abierta y sus PX intactos');
  r = await call('GET', '/api/bp', null, TA); ok(r.j.state.claims.includes('1:free'), 'y el pase de batalla también (lo reclamado sigue reclamado)');
  ok((await call('POST', '/api/auth/login', { identifier: 'Ana_1', password: 'Clave-Segura-77' })).status === 401 && (await call('POST', '/api/auth/login', { identifier: 'ana_nueva', password: 'Clave-Segura-77' })).j.profile.id === aid, 'el nombre viejo ya no entra; el nuevo sí, con el mismo ID');
  r = await call('POST', '/api/me/rename', { username: 'Ana_Otra' }, TA); ok(r.status === 429 && /día/.test(r.j.error), 'un segundo cambio seguido se pide esperar (evita el abuso)');
  r = await call('POST', '/api/auth/register', { username: 'Ana_1', email: 'ana4@e.com', password: 'Clave-Segura-77' }); const oldNameId = r.j.profile && r.j.profile.id; ok(r.status === 200 && oldNameId !== aid, 'el nombre que Ana dejó queda libre y otra persona puede registrarlo, con su propio ID (nada de Ana se mezcla)');
  ok((await call('GET', '/api/bp', null, r.j.token)).j.state.claims.length === 0, 'y esa persona empieza con el pase en blanco');
  /* La clasificación sigue a la cuenta */
  r = await call('POST', '/api/me/rename', { username: 'Pepe_Nuevo' }, TP); ok(r.status === 200, 'Pepe (cuenta antigua) también puede cambiar de nombre');
  const lb = (await (await fetch(B + '/api/leaderboard?map=0', { headers: { 'X-Forwarded-For': ip() } })).json()); const rows = lb.entries || lb.list || lb;
  ok(Array.isArray(rows) && rows.some(e => e.n === 'Pepe_Nuevo' && e.p === 500) && !rows.some(e => e.n === 'Pepe_1') && rows.some(e => e.n === 'Anónimo') && rows.every(e => !('a' in e)), 'su entrada de la clasificación pasa al nombre nuevo, la de un jugador sin cuenta no se toca y la clasificación pública no muestra IDs');

  /* ---------- 3. Entrar a jugar ---------- */
  const g = new Bot(port, 'Lola_2'); let m = await g.connect(); await sleep(300);
  ok(m.t === 'welcome' && /^Lola_2_\d{3}$/.test(m.n) && g.msgs.some(x => x.t === 'notice' && /Inicia sesión/.test(x.m)), 'un invitado (o con la sesión caducada) que pide «Lola_2» ya no recibe un error ni se le cierra: juega como «' + m.n + '» y se le explica');
  const TL = (await call('POST', '/api/auth/login', { identifier: 'Lola_2', password: 'Clave-Segura-77' })).j.token; const l1 = new Bot(port, 'x', { acct: TL }); m = await l1.connect(); ok(m.t === 'welcome' && m.n === 'Lola_2', 'con su sesión, Lola entra con su nombre');
  const l2 = new Bot(port, 'x', { acct: TL }); m = await l2.connect(); await sleep(500);
  ok(m.t === 'welcome' && m.n === 'Lola_2' && l1.closed && l1.msgs.some(x => x.t === 'err' && /otra pestaña/.test(x.m)) && !l2.closed, 'si la misma cuenta abre una segunda pestaña, la nueva entra y la anterior se cierra con un aviso (una cuenta = un jugador)');
  const st = await (await fetch(B + '/api/status', { headers: { 'X-Forwarded-For': ip() } })).json(); ok(st.players === 1 || st.players === 2, 'no quedan jugadores duplicados de esa cuenta (' + st.players + ' en total con el invitado)');
  const tr = new Bot(port, 'x', { acct: TP }); m = await tr.connect(); ok(m.t === 'welcome' && m.n === 'Pepe_Nuevo', 'y tras cambiar de nombre, entra a jugar con el nombre nuevo sin más pasos');
  g.close(); l2.close(); tr.close();

  /* ---------- 4. Persistencia tras reiniciar ---------- */
  await sleep(1800); srv.kill('SIGTERM'); await sleep(1200); srv = start(); await sleep(dbUrl ? 2600 : 1600);
  ok(!/Cuentas migradas/.test(srv.out), 'al reiniciar no se vuelve a migrar nada');
  r = await call('POST', '/api/auth/login', { identifier: 'Pepe_Nuevo', password: 'Clave-Segura-77' }); ok(r.status === 200 && r.j.profile.id === pid && r.j.profile.px === 700, 'tras reiniciar, Pepe entra con su nombre nuevo, su mismo ID y sus PX');
  r = await call('GET', '/api/bp', null, TP); ok(r.j.state.xp === 2000 && r.j.state.vip, 'y su pase de batalla sigue igual');
  r = await call('GET', '/api/me', null, TA); ok(r.j.profile.username === 'Ana_Nueva', 'el cambio de nombre de Ana también se conserva');
  srv.kill('SIGTERM'); await sleep(600);
}
(async () => {
  let pgOk = false;
  try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.end(); pgOk = true; } catch (e) { console.log('(PostgreSQL no disponible: ' + e.message + ' → solo se prueba con archivos)'); }
  try { if (pgOk) await scenario('PostgreSQL', 3230, '/tmp/ppr_id_pg', PG_URL); await scenario('archivos JSON', 3231, '/tmp/ppr_id_file', null); } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
