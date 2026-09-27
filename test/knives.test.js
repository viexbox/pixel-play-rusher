'use strict';
/* Cuchillos de la ruleta: cada tirada cuesta PX (lo cobra el servidor, que también pone el azar) y nunca da repetidos;
   se equipan solo si los tienes y los demás jugadores ven tu cuchillo. En el cliente (jsdom): cada modelo se construye,
   la mariposa se abre y se cierra, y las hojas con efecto mueven sus luces cada fotograma. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
const APASS = 'Knife-Admin-2026xy';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 40; const ip = () => '10.9.7.' + (ipn++);

function clientChecks() {
  console.log('=== Cliente: modelos y efectos ===');
  const PUB = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('sin servidor'));
  w.eval(fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'));
  w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.THREE.GLTFLoader = function () { this.load = () => {}; };
  w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));
  let c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'); const i = c.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  c = c.slice(0, i) + 'window.__T = { knifeMesh, setButterfly, tickKnives, knifeG, fillCharacter, TEAMS };\n' + c.slice(i);
  w.eval(c);
  const T = w.__T, THREE = w.THREE;
  const kinds = new Set();
  for (const K of S.KNIFE_SKINS) {
    const g = T.knifeMesh(K); let n = 0; const box = new THREE.Box3().setFromObject(g); g.traverse(o => { if (o.isMesh) n++; });
    kinds.add(K.kind || 'classic');
    ok(n >= 4 && n <= 40 && box.min.z < -0.3 && box.max.z > 0.1, K.id + ': ' + (K.kind || 'classic') + ' con ' + n + ' piezas, hoja hasta z=' + box.min.z.toFixed(2) + ' y mango hasta z=' + box.max.z.toFixed(2));
  }
  ok(['classic', 'bayonet', 'dagger', 'butterfly', 'karambit', 'machete'].every(k => kinds.has(k)), 'hay seis modelos distintos: ' + [...kinds].join(', '));
  const bf = T.knifeMesh(S.KNIFE_SKINS.find(k => k.kind === 'butterfly'));
  T.setButterfly(bf, 0); const closed = new THREE.Box3().setFromObject(bf); T.setButterfly(bf, 1); const open = new THREE.Box3().setFromObject(bf);
  ok(closed.min.z > -0.12 && open.min.z < -0.3, 'la mariposa se cierra (la hoja se recoge junto a la mano, z=' + closed.min.z.toFixed(2) + ') y se abre (z=' + open.min.z.toFixed(2) + ')');
  const fxK = S.KNIFE_SKINS.find(k => k.fx), m = (() => { let r = null; T.knifeMesh(fxK).traverse(o => { if (o.isMesh && o.material.emissiveMap) r = o.material; }); return r; })();
  const o0 = m && m.emissiveMap.offset.x; T.tickKnives(0.25);
  ok(m && m.emissiveMap.offset.x !== o0, fxK.n + ': la hoja tiene un mapa de luz y se desplaza cada fotograma (luces que se mueven)');
  const g = new THREE.Group(); g.userData.skins = { knife: 'k_karambit_plasma' }; T.fillCharacter(g, T.TEAMS[0].c, 0, 1, 0);
  let tp = false; g.userData.knife.traverse(o => { if (o.isMesh && o.material.emissiveMap) tp = true; });
  ok(tp, 'en tercera persona el muñeco lleva el cuchillo que tiene equipado (el karambit con luces)');
  ok(!errors.length, 'sin errores en el cliente' + (errors.length ? ': ' + errors[0] : ''));
  ok(!S.KNIFE_SKINS.filter(k => k.ru).some(k => Object.values(S.BP_TIERS || {}).some(t => (t.free && t.free.id === k.id) || (t.vip && t.vip.id === k.id))), 'los cuchillos de la ruleta no salen en el pase de batalla');
}

async function server() {
  console.log('\n=== Servidor: ruleta y visibilidad ===');
  const port = 3951, B = 'http://127.0.0.1:' + port, dir = fs.mkdtempSync('/tmp/ppr-knives-');
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: '' }), stdio: 'ignore' }); procs.push(srv);
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  await sleep(1400);
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77', terms: true })).j.token;
  const TA = await reg('Nora_3', 'nora@e.com'), TB = await reg('Iker_5', 'iker@e.com');
  const LA = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  const R = S.KNIFE_ROULETTE, pool = S.KNIFE_SKINS.filter(k => k.ru);
  await call('POST', '/api/admin/px', { username: 'Nora_3', delta: R.px * pool.length + 10, reason: 'prueba' }, LA);
  const px = async tk => (await call('GET', '/api/me', null, tk)).j.profile.px, p0 = await px(TA);
  const odds = S.rouletteOdds([]); ok(odds.length === pool.length && Math.abs(odds.reduce((a, o) => a + o.p, 0) - 1) < 1e-9, 'probabilidades de la ruleta: ' + pool.length + ' cuchillos y suman 100 %');
  const leg = odds.filter(o => S.KNIFE_SKINS.find(k => k.id === o.id).r === 'leyenda').reduce((a, o) => a + o.p, 0);
  ok(Math.abs(leg - R.weights.leyenda / 100) < 1e-9, 'los legendarios salen un ' + (leg * 100) + ' % de las veces');
  ok(S.rouletteOdds(pool.map(k => k.id)).length === 0 && S.rouletteOdds(pool.slice(1).map(k => k.id))[0].p === 1, 'si solo te falta uno, sale ese seguro; si los tienes todos, no hay tirada');
  ok((await call('POST', '/api/bp/knife-spin', {})).status === 401, 'sin sesión no se gira');
  ok((await call('POST', '/api/bp/knife-spin', {}, TB)).status === 402, 'sin PX suficientes no se gira');
  const got = [];
  for (let i = 0; i < pool.length; i++) { const r = await call('POST', '/api/bp/knife-spin', {}, TA); if (r.status === 200) got.push(r.j.knife); }
  ok(got.length === pool.length && new Set(got).size === pool.length && got.every(id => pool.some(k => k.id === id)), pool.length + ' tiradas dan los ' + pool.length + ' cuchillos, sin ningún repetido (' + got.join(', ') + ')');
  ok((await px(TA)) === p0 - R.px * pool.length, 'cada tirada cobra exactamente ' + R.px + ' PX');
  const extra = await call('POST', '/api/bp/knife-spin', {}, TA);
  ok(extra.status === 409 && (await px(TA)) === p0 - R.px * pool.length, 'con todos, la ruleta no deja girar ni cobra (' + extra.j.error + ')');
  ok((await call('POST', '/api/bp/knife-buy', { id: pool[0].id }, TA)).status === 404, 'ya no se venden sueltos: solo por la ruleta');
  const K = S.KNIFE_SKINS.find(k => k.id === 'k_mariposa_aurora');
  ok((await call('POST', '/api/bp/equip', { slot: 'knife', item: K.id }, TB)).status === 403, 'no se puede equipar un cuchillo que no tienes');
  const eq = await call('POST', '/api/bp/equip', { slot: 'knife', item: K.id }, TA);
  ok(eq.status === 200 && eq.j.state.equipped.knife === K.id, 'el tuyo sí se equipa');
  const conn = (name, tk) => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); const msgs = [];
    ws.on('message', d => msgs.push(JSON.parse(d))); ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', v: 1, n: name, map: 0, c: 0, acct: tk || '' })); res({ ws, msgs }); }); });
  const seer = await conn('Iker_5', TB); await until(() => seer.msgs.some(m => m.t === 'welcome'));
  const owner = await conn('Nora_3', TA);
  ok(await until(() => seer.msgs.some(m => (m.t === 'look' && m.sk && m.sk.knife === K.id) || (m.t === 'join' && m.p.sk && m.p.sk.knife === K.id))), 'otro jugador de la sala recibe el cuchillo de Nora');
  for (const c of [seer, owner]) try { c.ws.close(); } catch (e) { /* nada */ }
  srv.kill();
}

(async () => {
  try { clientChecks(); await server(); } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
