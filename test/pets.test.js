'use strict';
/* Mascotas (backend + red): se compran con PX en el servidor, que cobra el precio exacto, no deja comprar sin saldo ni
   dos veces, no deja equipar una que no tienes, y los demás jugadores de la sala ven la mascota equipada.
   Se ejecuta contra los dos almacenes: archivos y PostgreSQL (si hay uno en PG_TEST_URL; necesita la migración 006). */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
const APASS = 'Pets-Admin-2026xy';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 40; const ip = () => '10.9.4.' + (ipn++);

async function scenario(label, port, dir, dbUrl) {
  console.log('\n=== Almacén: ' + label + ' ===');
  const B = 'http://127.0.0.1:' + port;
  const env = Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: dbUrl || '' });
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' }); procs.push(srv);
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  await sleep(dbUrl ? 2200 : 1400);
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77', terms: true })).j.token;
  const TA = await reg('Mia_4', 'mia@e.com'), TB = await reg('Leo_8', 'leo@e.com');
  ok(!!TA && !!TB, 'se crean dos cuentas online');
  const LA = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  const cheap = S.PETS.slice().sort((a, b) => a.px - b.px)[0], pricey = S.PETS.slice().sort((a, b) => b.px - a.px)[0];
  await call('POST', '/api/admin/px', { username: 'Mia_4', delta: cheap.px + 50, reason: 'prueba' }, LA);
  const px = async tk => (await call('GET', '/api/me', null, tk)).j.profile.px, bp = async tk => (await call('GET', '/api/bp', null, tk)).j.state;
  const p0 = await px(TA);

  ok((await call('POST', '/api/bp/pet-buy', { id: cheap.id })).status === 401, 'sin sesión no se puede comprar');
  ok((await call('POST', '/api/bp/pet-buy', { id: 'pet_inventada' }, TA)).status === 400, 'una mascota que no existe no se puede comprar');

  const nomoney = await call('POST', '/api/bp/pet-buy', { id: pricey.id }, TA);
  ok(nomoney.status === 402 && (await px(TA)) === p0, 'sin PX suficientes no se compra y no se cobra nada (' + nomoney.j.error + ')');

  const buy = await call('POST', '/api/bp/pet-buy', { id: cheap.id }, TA);
  ok(buy.status === 200 && (await px(TA)) === p0 - cheap.px, 'comprar «' + cheap.n + '» cobra exactamente ' + cheap.px + ' PX (' + p0 + ' → ' + (await px(TA)) + ')');
  ok((await bp(TA)).inventory.some(i => i.t === 'pet' && i.id === cheap.id), 'y la mascota queda guardada en el inventario');
  const again = await call('POST', '/api/bp/pet-buy', { id: cheap.id }, TA);
  ok(again.status === 409 && (await px(TA)) === p0 - cheap.px, 'comprarla otra vez no se permite ni cobra');

  const [r1, r2] = await Promise.all([call('POST', '/api/bp/pet-buy', { id: S.PETS[1].id }, TA), call('POST', '/api/bp/pet-buy', { id: S.PETS[1].id }, TA)]);
  ok((await px(TA)) === p0 - cheap.px, 'dos compras a la vez sin saldo no cobran nada (' + r1.status + ', ' + r2.status + ')');

  ok((await call('POST', '/api/bp/equip', { slot: 'pet', item: pricey.id }, TA)).status === 403, 'no se puede equipar una mascota que no tienes');
  ok((await call('POST', '/api/bp/equip', { slot: 'pet', item: cheap.id }, TB)).status === 403, 'ni la de otro jugador');
  const eq = await call('POST', '/api/bp/equip', { slot: 'pet', item: cheap.id }, TA);
  ok(eq.status === 200 && eq.j.state.equipped.pet === cheap.id, 'la tuya sí se equipa');

  /* ---- en la partida: los demás la ven, y nadie puede ponerse una mascota «de mentira» desde el cliente ---- */
  const conn = (name, tk, extra) => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); const msgs = [];
    ws.on('message', d => msgs.push(JSON.parse(d))); ws.on('open', () => { ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, n: name, map: 0, c: 0, acct: tk || '' }, extra || {}))); res({ ws, msgs }); }); });
  const seer = await conn('Leo_8', TB); await until(() => seer.msgs.some(m => m.t === 'welcome'));
  const owner = await conn('Mia_4', TA); await until(() => owner.msgs.some(m => m.t === 'welcome'));
  ok(await until(() => seer.msgs.some(m => (m.t === 'pet' && m.pt === cheap.id) || (m.t === 'join' && m.p.pt === cheap.id))), 'otro jugador de la sala ve la mascota de Mia al entrar');
  const cheater = await conn('Tramposo', '', { pt: pricey.id, pet: pricey.id }); await sleep(600);
  ok(!seer.msgs.some(m => (m.t === 'join' && m.p.n === 'Tramposo' && m.p.pt) || (m.t === 'pet' && m.pt === pricey.id)), 'un invitado que se inventa una mascota desde el cliente no la consigue (la decide el servidor)');
  for (const c of [seer, owner, cheater]) try { c.ws.close(); } catch (e) { /* nada */ }
  srv.kill(); await sleep(300);
}

(async () => {
  const base = fs.mkdtempSync('/tmp/ppr-pets-');
  await scenario('archivos', 3931, path.join(base, 'files'), '');
  let pgOk = false; try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('\n(sin PostgreSQL accesible: ' + e.message + ' — solo se prueba con archivos)'); }
  if (pgOk) await scenario('PostgreSQL', 3932, path.join(base, 'pg'), PG_URL);
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
