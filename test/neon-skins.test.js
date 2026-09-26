'use strict';
/* Skins de neón del Pase VIP: 11, una por arma, en niveles de la vía VIP que antes daban PX. Solo se reclaman con el VIP;
   quien ya había reclamado ese nivel cuando daba PX recibe la skin UNA vez (aunque después la venda, no vuelve a aparecer).
   Contra los dos almacenes: archivos y PostgreSQL (si hay uno en PG_TEST_URL). */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const S = require('../public/shared.js');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
const APASS = 'Neon-Admin-2026xy';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 80; const ip = () => '10.7.6.' + (ipn++);

console.log('=== 1. Datos ===');
const neon = S.WEAPON_SKINS.filter(k => k.neon), OSARIO = S.BP_TIERS.find(t => t.vip.id === 'asalto_osario');
ok(neon.length === 11 && new Set(neon.map(k => k.w)).size === S.WEAPONS.length, 'hay 11 skins de neón, una por cada arma del juego');
ok(neon.every(k => S.BP_TIERS.some(t => t.vip.t === 'wskin' && t.vip.id === k.id) && !S.BP_TIERS.some(t => t.free.id === k.id)), 'todas están en la vía VIP del pase y ninguna en la gratuita');
ok(neon.every(k => ['epico', 'leyenda'].includes(k.r) && /^#[0-9a-f]{6}$/i.test(k.neon.col) && /^n_/.test(k.neon.pat)), 'todas son épicas o legendarias, con color y dibujo de neón');
ok(!!OSARIO && OSARIO.level === 35, 'Osario (Asalto) está en el nivel 35 VIP');

async function scenario(label, port, dir, dbUrl) {
  console.log('\n=== Almacén: ' + label + ' ===');
  const B = 'http://127.0.0.1:' + port, env = Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: dbUrl || '' });
  const start = () => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' }); procs.push(p); return p; };
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  let srv = start(); await sleep(dbUrl ? 2200 : 1400);
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77', terms: true })).j.token;
  const TK = await reg('Neon_Vip', 'nv@e.com'), TF = await reg('Neon_Free', 'nf@e.com');
  const LA = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  for (const u of ['Neon_Vip', 'Neon_Free']) await call('POST', '/api/admin/px', { username: u, delta: 9000, reason: 'prueba' }, LA);
  const bp = async tk => (await call('GET', '/api/bp', null, tk)).j.state, has = (st, id) => st.inventory.some(i => i.t === 'wskin' && i.id === id);

  await call('POST', '/api/bp/skip', { levels: 40 }, TF);
  const noVip = await call('POST', '/api/bp/claim', { level: 35, track: 'vip' }, TF);
  ok(noVip.status === 403 && !has(await bp(TF), 'asalto_osario'), 'sin el VIP no se puede reclamar Osario, aunque llegues al nivel 35');

  ok((await call('POST', '/api/bp/buy', {}, TK)).status === 200, 'se compra el Pase VIP');
  await call('POST', '/api/bp/skip', { levels: 40 }, TK);
  const cl = await call('POST', '/api/bp/claim', { level: 35, track: 'vip' }, TK);
  ok(cl.status === 200 && has(cl.j.state, 'asalto_osario'), 'con el VIP y el nivel 35, Osario se reclama y queda en el inventario');
  ok((await call('POST', '/api/bp/claim', { level: 35, track: 'vip' }, TK)).status === 409, 'no se puede reclamar dos veces');

  /* ---- jugador de antes del cambio: reclamó el nivel 35 cuando daba 10 PX (y por tanto no tiene la skin) ---- */
  let uid = null;
  if (dbUrl) {
    const { Client } = require('pg'); const c = new Client({ connectionString: dbUrl }); await c.connect();
    uid = (await c.query("SELECT user_id FROM bp_claims WHERE level = 35 AND track = 'vip' AND item_id = 'asalto_osario'")).rows[0].user_id;   // solo Neon_Vip lo ha reclamado
    await c.query("UPDATE bp_claims SET item_type = 'px', item_id = '15' WHERE user_id = $1 AND level = 35 AND track = 'vip'", [uid]);
    await c.query("DELETE FROM bp_inventory WHERE user_id = $1 AND item_id = 'asalto_osario'", [uid]);
    await c.end();
  } else {
    srv.kill(); await sleep(400);
    const f = path.join(dir, 'battlepass.json'), d = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const k in d.users) { const u = d.users[k]; if (u.claims && u.claims['35:vip']) { uid = k; u.claims['35:vip'] = { t: 'px', id: '15', ts: Date.now() }; delete u.inventory['wskin:asalto_osario']; } }
    fs.writeFileSync(f, JSON.stringify(d)); srv = start(); await sleep(1400);
  }
  ok(!!uid, 'se prepara un jugador VIP «de antes» que cobró los 10 PX del nivel 35 y no tiene Osario');
  const st1 = await bp(TK);
  ok(has(st1, 'asalto_osario'), 'al abrir el pase recibe Osario automáticamente');
  ok(st1.inventory.filter(i => i.id === 'asalto_osario').length === 1, 'una sola copia');

  /* ---- la vende (o la intercambia): ya no la tiene. Abrir el pase otra vez no se la vuelve a dar ---- */
  if (dbUrl) { const { Client } = require('pg'); const c = new Client({ connectionString: dbUrl }); await c.connect(); await c.query("DELETE FROM bp_inventory WHERE user_id = $1 AND item_id = 'asalto_osario'", [uid]); await c.end(); }
  else { srv.kill(); await sleep(400); const f = path.join(dir, 'battlepass.json'), d = JSON.parse(fs.readFileSync(f, 'utf8')); delete d.users[uid].inventory['wskin:asalto_osario']; fs.writeFileSync(f, JSON.stringify(d)); srv = start(); await sleep(1400); }
  await bp(TK); const st2 = await bp(TK);
  ok(!has(st2, 'asalto_osario'), 'si la vende, abrir el pase no se la vuelve a dar: la entrega es una sola vez (no se pueden fabricar skins para vender)');

  /* ---- un jugador SIN VIP que cobró los PX de ese nivel no recibe nada (la skin es solo del VIP) ---- */
  const stF = await bp(TF);
  ok(!has(stF, 'asalto_osario'), 'quien no tiene el VIP no la recibe');
  srv.kill(); await sleep(300);
}

(async () => {
  const base = fs.mkdtempSync('/tmp/ppr-neon-');
  await scenario('archivos', 3934, path.join(base, 'files'), '');
  let pgOk = false; try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('\n(sin PostgreSQL accesible: ' + e.message + ' — solo se prueba con archivos)'); }
  if (pgOk) await scenario('PostgreSQL', 3935, path.join(base, 'pg'), PG_URL);
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
