'use strict';
/* [SKINS VISIBLES] Los demás jugadores ven tus skins de arma equipadas. Las decide el inventario de tu cuenta en el servidor:
   una cuenta sin skins no manda nada y un cliente que se invente una skin no la consigue. Archivos y PostgreSQL. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test', APASS = 'Look-Admin-2026xy';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 100; const ip = () => '10.6.7.' + (ipn++);
async function scenario(label, port, dir, dbUrl) {
  console.log('\n=== Almacén: ' + label + ' ===');
  const B = 'http://127.0.0.1:' + port, env = Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: dbUrl || '' });
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' }); procs.push(srv); await sleep(dbUrl ? 2200 : 1400);
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77', terms: true })).j.token;
  const TA = await reg('Mia_Skin', 'ms@e.com'), TC = await reg('Sin_Skin', 'ss@e.com');
  const LA = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  await call('POST', '/api/admin/px', { username: 'Mia_Skin', delta: 9000, reason: 'prueba' }, LA);
  await call('POST', '/api/bp/buy', {}, TA); await call('POST', '/api/bp/skip', { levels: 40 }, TA); await call('POST', '/api/bp/claim', { level: 35, track: 'vip' }, TA);
  const eq = await call('POST', '/api/bp/equip', { slot: 'weapon:asalto', item: 'asalto_osario' }, TA);
  ok(eq.status === 200 && eq.j.state.equipped['weapon:asalto'] === 'asalto_osario', 'Mia tiene Osario y la lleva equipada en el Asalto');
  ok((await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'asalto_osario' }, TA)).status >= 400, 'no se puede equipar una skin en un arma que no es la suya');
  const conn = (name, tk, extra) => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); const msgs = [];
    ws.on('message', d => msgs.push(JSON.parse(d))); ws.on('open', () => { ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, n: name, map: 0, c: 0, acct: tk || '' }, extra || {}))); res({ ws, msgs }); }); });
  const seer = await conn('Mirón', ''); await until(() => seer.msgs.some(m => m.t === 'welcome'));
  const skOf = n => { const j = seer.msgs.find(m => m.t === 'join' && m.p.n === n); if (!j) return undefined; const lk = seer.msgs.find(m => m.t === 'look' && m.id === j.p.id); return (lk && lk.sk) || j.p.sk || null; };
  const mia = await conn('Mia_Skin', TA);
  ok(await until(() => { const s = skOf('Mia_Skin'); return s && s.asalto === 'asalto_osario'; }), 'otro jugador de la sala recibe que Mia lleva Osario en el Asalto');
  const sin = await conn('Sin_Skin', TC); await until(() => skOf('Sin_Skin') !== undefined); await sleep(500);
  ok(!skOf('Sin_Skin'), 'una cuenta sin skins no manda ninguna');
  const tramp = await conn('Tramposo', '', { sk: { asalto: 'asalto_osario' }, skins: { asalto: 'asalto_osario' } }); await until(() => skOf('Tramposo') !== undefined); await sleep(500);
  ok(!skOf('Tramposo'), 'un invitado que se inventa una skin desde su navegador no la consigue (la decide el servidor)');
  const late = await conn('Llega_Tarde', ''); await until(() => late.msgs.some(m => m.t === 'welcome')); await sleep(300);
  const w = late.msgs.find(m => m.t === 'welcome'), inRoom = (w.players || w.ps || []).find(p => p.n === 'Mia_Skin');
  ok(!!inRoom && inRoom.sk && inRoom.sk.asalto === 'asalto_osario', 'y quien entra después también la ve (va en la lista de jugadores de la bienvenida)');
  for (const c of [seer, mia, sin, tramp, late]) try { c.ws.close(); } catch (e) { /* nada */ }
  srv.kill(); await sleep(300);
}
(async () => {
  const base = fs.mkdtempSync('/tmp/ppr-look-');
  await scenario('archivos', 3936, path.join(base, 'files'), '');
  let pgOk = false; try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('\n(sin PostgreSQL accesible: ' + e.message + ')'); }
  if (pgOk) await scenario('PostgreSQL', 3937, path.join(base, 'pg'), PG_URL);
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
