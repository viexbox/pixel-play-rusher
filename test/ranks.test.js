'use strict';
/* Rangos: cada rango (de Plata a Maestro) da un color exclusivo que no se compra, no se vende ni se intercambia; quien
   ya había reclamado rangos recibe su color nuevo; y en la partida nadie puede llevar un color que no tiene. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const APASS = 'Rango-Admin-2026xy';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 60; const ip = () => '10.8.5.' + (ipn++);

(async () => {
  console.log('=== 1. Datos: cada rango da un color exclusivo ===');
  const ranked = S.RANKS.filter(r => r.color != null);
  ok(ranked.length === 5 && ranked.map(r => r.n).join() === 'Plata,Oro,Platino,Diamante,Maestro', 'de Plata a Maestro, los 5 rangos dan color (antes Plata no daba ninguno)');
  ok(ranked.every(r => S.COLOR_COSTS[r.color] === null), 'ninguno de esos colores tiene precio en la tienda');
  ok(ranked.every(r => S.colorRarity(r.color) === 'leyenda'), 'y todos son de rareza legendaria');
  ok(new Set(ranked.map(r => r.color)).size === 5 && ranked.every(r => S.COLOR_HEX[r.color] === r.col), 'cada uno es distinto y tiene el tono de su propio rango');
  ok([5, 6, 8, 9].every(i => S.COLOR_COSTS[i] > 0), 'los colores que antes daban los rangos (Violeta, Cian, Carbón, Blanco) siguen a la venta como siempre');

  console.log('\n=== 2. Servidor ===');
  const dir = fs.mkdtempSync('/tmp/ppr-rank-'), port = 3933, B = 'http://127.0.0.1:' + port;
  const env = Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: '' });
  const start = () => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' }); procs.push(p); return p; };
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  let srv = start(); await sleep(1400);
  const login = async u => (await call('POST', '/api/auth/login', { identifier: u, password: 'Clave-Segura-77' })).j.token;
  const TK = (await call('POST', '/api/auth/register', { username: 'Rango_T', email: 'rango@e.com', password: 'Clave-Segura-77', terms: true })).j.token;
  const LA = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  await call('POST', '/api/admin/px', { username: 'Rango_T', delta: 5000, reason: 'prueba' }, LA);
  const me = async tk => (await call('GET', '/api/me', null, tk)).j.profile;
  const px0 = (await me(TK)).px;
  const buyRank = await call('POST', '/api/me/unlock', { i: 11 }, TK);
  ok(buyRank.status === 400 && (await me(TK)).px === px0 && !(await me(TK)).unlocked.includes(11), 'intentar comprar el color de Oro se rechaza y no cobra nada (' + buyRank.j.error + ')');
  const buyNormal = await call('POST', '/api/me/unlock', { i: 5 }, TK);
  ok(buyNormal.status === 200 && (await me(TK)).px === px0 - 150, 'un color normal (Violeta) se sigue comprando por su precio (150 PX)');
  ok((await call('POST', '/api/me/claim', { i: 2 }, TK)).status === 400, 'no se puede reclamar Oro sin los puntos');

  /* un jugador de antes del cambio: tenía Oro y Platino reclamados (con los colores viejos) */
  srv.kill(); await sleep(400);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f));
  let patched = false;
  for (const f of files) { const d = JSON.parse(fs.readFileSync(f, 'utf8')); const users = d.users || {}; for (const k in users) { const u = users[k]; if (u.username === 'Rango_T') { u.claimed = [0, 1, 2, 3]; u.stats.points = 14000; u.unlocked = [0, 1, 2, 3, 5, 6]; patched = true; } } if (patched) { fs.writeFileSync(f, JSON.stringify(d)); break; } }
  ok(patched, 'se prepara un jugador «de antes» con Plata, Oro y Platino ya reclamados');
  srv = start(); await sleep(1400);
  const TK2 = await login('Rango_T'), p2 = await me(TK2 || TK);
  ok([10, 11, 12].every(i => p2.unlocked.includes(i)) && !p2.unlocked.includes(13), 'al volver, recibe los colores exclusivos de Plata, Oro y Platino, y no el de Diamante');
  ok(p2.unlocked.includes(5) && p2.unlocked.includes(6), 'y conserva los colores que ya tenía');
  ok((await call('POST', '/api/me/claim', { i: 3 }, TK2 || TK)).status === 400, 'no puede volver a reclamar Platino para cobrarlo dos veces');

  const sell = await call('POST', '/api/market/list', { t: 'color', id: '11', price: 100 }, TK2 || TK);
  ok(sell.status >= 400, 'el color de Oro no se puede vender en el mercado (' + (sell.j.error || sell.status) + ')');

  console.log('\n=== 3. En la partida nadie lleva un color que no tiene ===');
  const conn = (name, tk, lk) => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); const msgs = [];
    ws.on('message', d => msgs.push(JSON.parse(d))); ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', v: 1, n: name, map: 0, c: 0, lk, acct: tk || '' })); res({ ws, msgs }); }); });
  const seer = await conn('Mirón', '', [0, 0]); await until(() => seer.msgs.some(m => m.t === 'welcome'));
  const lkOf = n => { const m = seer.msgs.find(x => x.t === 'join' && x.p.n === n); return m ? m.p.lk[0] : undefined; };
  const guest = await conn('Invitado1', '', [14, 0]);
  ok(await until(() => lkOf('Invitado1') === 0), 'un invitado que pide el color de Maestro entra con el color normal');
  const guestPaid = await conn('Invitado2', '', [5, 0]);
  ok(await until(() => lkOf('Invitado2') === 5), 'un invitado sí puede llevar un color de pago que desbloqueó en su navegador, como antes');
  const hasIt = await conn('Rango_T', TK2 || TK, [11, 0]);
  ok(await until(() => lkOf('Rango_T') === 11), 'con cuenta, llevas tu color de Oro porque lo has ganado');
  for (const c of [seer, guest, guestPaid, hasIt]) try { c.ws.close(); } catch (e) { /* nada */ }
  const reg2 = (await call('POST', '/api/auth/register', { username: 'Sin_Rango', email: 'sin@e.com', password: 'Clave-Segura-77', terms: true })).j.token;
  const seer2 = await conn('Mirón2', '', [0, 0]); await until(() => seer2.msgs.some(m => m.t === 'welcome'));
  const cheat = await conn('Sin_Rango', reg2, [13, 0]);
  ok(await until(() => { const m = seer2.msgs.find(x => x.t === 'join' && x.p.n === 'Sin_Rango'); return m && m.p.lk[0] === 0; }), 'con cuenta pero sin el rango, pedir el color de Diamante no sirve: entra con el normal');
  for (const c of [seer2, cheat]) try { c.ws.close(); } catch (e) { /* nada */ }
  srv.kill();
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
