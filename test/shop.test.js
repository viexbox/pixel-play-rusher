'use strict';
/* Tienda de armas de la pantalla de reaparición: economía en el servidor real (WebSocket) y renderizado en el cliente (jsdom). */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }

console.log('=== 1. La tienda en shared.js ===');
ok(S.SHOP.length === 11 && S.SHOP.every(x => S.WEAPONS[x.wi] && x.price > 0), 'las 11 armas del juego están en la tienda, todas con precio (antes solo 8: faltaban Torrente, Dúo y AK)');
ok(new Set(S.SHOP.map(x => x.wi)).size === 11, 'ninguna arma se repite en la tienda');
{
  const asalto = S.WEAPONS[S.SHOP[0].wi], st = S.shopStats(asalto);
  ok(st.rpm === Math.round(60 / asalto.interval) && st.dmg === asalto.dmg, 'las estadísticas de la tarjeta (DMG, RPM) salen de los números reales del arma (' + asalto.name + ': ' + JSON.stringify(st) + ')');
  ok(st.acc >= 40 && st.acc <= 97 && st.rng >= 1 && st.rng <= 99, 'ACC y RNG quedan dentro de una escala legible (0-99)');
}

/* ---------- 2. Economía en un servidor real ---------- */
console.log('\n=== 2. Economía de la tienda en el servidor real ===');
const PORT = 3777, D = '/tmp/ppr_shop', B = 'http://127.0.0.1:' + PORT;
class Bot {
  constructor(name) { this.name = name; this.msgs = []; this.pos = null; this.id = null; this.spawnAt = 0; this.others = new Map(); }
  connect() { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': '10.9.9.' + (++Bot.n) } }); this.ws.on('open', () => this.send({ t: 'hello', v: 1, n: this.name, map: 0, c: 0 }));
    this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.on(m); if (m.t === 'welcome') { this.id = m.id; this.welcome = m; res(m); } }); this.ws.on('error', () => {}); }); }
  on(m) {
    if (m.t === 'spawn' && m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; this.spawnAt = Date.now(); }
    if (m.t === 'spawn' && this.others.has(m.id)) this.others.set(m.id, { x: m.x, z: m.z });
    if (m.t === 'join') this.others.set(m.p.id, { x: 0, z: 0 });
    if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; }
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); } last(t) { return [...this.msgs].reverse().find(m => m.t === t); } all(t) { return this.msgs.filter(m => m.t === t); }
  async walkTo(x, z, secs = 6) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000 && Math.hypot(x - this.pos.x, z - this.pos.z) > 0.3) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: 0, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}
Bot.n = 0;
const world = S.buildWorld(0);
const los = (a, b) => { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: -0.4, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; };
async function ring(bot, tgt) { for (let r = 6; r <= 20; r += 0.6) for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 48 || Math.abs(z) > 48 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; if (los({ x, z }, tgt)) { await bot.walkTo(x, z); return true; } } return false; }
async function killOnce(att, vic) {
  const mark = att.msgs.length, done = () => att.msgs.slice(mark).some(m => m.t === 'kill' && m.k === att.id && m.v === vic.id);
  for (let tries = 0; tries < 5 && !done(); tries++) {
    await until(() => vic.pos && Date.now() - vic.spawnAt > 1600 && Date.now() - att.spawnAt > 1600, 6000);
    const t = { x: vic.pos.x, z: vic.pos.z }; if (!await ring(att, t)) { await sleep(400); continue; }
    for (let i = 0; i < 24 && !done(); i++) { const dx = t.x - att.pos.x, dy = 1.2 - 1.6, dz = t.z - att.pos.z, l = Math.hypot(dx, dy, dz); att.send({ t: 'shoot', o: [att.pos.x, 1.6, att.pos.z], d: [[dx / l, dy / l, dz / l]] }); await sleep(130); }
  }
  return done();
}

(async () => {
  fs.rmSync(D, { recursive: true, force: true });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: D, WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '0', TEAM_KILL_LIMIT: '1', BREAK_SECS: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  try {
    let up = false; for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(B + '/healthz')).ok; } catch (e) { await sleep(100); } }
    ok(up, 'el servidor arranca');

    const A = new Bot('Comprador'), Bbot = new Bot('Rival'); const wA = await A.connect(), wBw = await Bbot.connect();
    ok(wA.cash === S.CONST.SHOP_START_CASH && wBw.cash === S.CONST.SHOP_START_CASH, 'cada jugador empieza con ' + S.CONST.SHOP_START_CASH + ' de Cash (mensaje de bienvenida)');
    ok(Array.isArray(wA.shop) && wA.shop.length === 11 && wA.shop[0].price === S.SHOP[0].price, 'el servidor manda la lista completa de la tienda al conectar');
    await until(() => A.pos && Bbot.pos, 4000);
    ok(wA.tm !== wBw.tm, 'los dos jugadores han quedado en equipos distintos (necesario para poder eliminarse)');

    /* --- compra que no se puede pagar --- */
    const costoso = S.SHOP.findIndex(x => x.price > S.CONST.SHOP_START_CASH);
    A.send({ t: 'buy', i: costoso });
    ok(await until(() => A.has('buy', m => m.ok === false && m.reason === 'cash' && m.cash === S.CONST.SHOP_START_CASH), 3000), 'comprar un arma que cuesta más del dinero disponible se rechaza (el dinero no cambia)');

    /* --- índice de arma no válido --- */
    A.send({ t: 'buy', i: 99 });
    ok(await until(() => A.has('buy', m => m.ok === false && m.reason === 'weapon'), 3000), 'un índice de tienda que no existe se rechaza sin tirar el servidor');

    /* --- compra que sí se puede pagar --- */
    const barato = S.SHOP.reduce((best, x, i) => (x.price < S.SHOP[best].price ? i : best), 0);
    const before = A.msgs.length; A.send({ t: 'buy', i: barato });
    ok(await until(() => A.msgs.slice(before).some(m => m.t === 'buy' && m.ok === true && m.wi === S.SHOP[barato].wi && m.cash === S.CONST.SHOP_START_CASH - S.SHOP[barato].price), 3000),
      'comprar un arma que sí se puede pagar (' + S.WEAPONS[S.SHOP[barato].wi].name + ', $' + S.SHOP[barato].price + ') descuenta el dinero y confirma el arma');

    /* --- recompensa real por una baja: A elimina a B con el arma --- */
    const cashBefore = A.last('buy').cash;
    ok(await killOnce(A, Bbot), 'A consigue eliminar a B disparando de verdad (física del servidor)');
    ok(await until(() => A.has('hit', m => m.k === 1 && m.cash === cashBefore + S.CONST.SHOP_KILL_CASH), 3000), 'la baja da ' + S.CONST.SHOP_KILL_CASH + ' de Cash, sumados al dinero que tenía (' + cashBefore + ' → ' + (cashBefore + S.CONST.SHOP_KILL_CASH) + ')');
    ok(!Bbot.has('hit', m => m.k === 1 && m.cash != null) && !Bbot.msgs.some(m => m.t === 'buy'), 'a quien muere no le llega ningún cambio de dinero');

    /* --- fin de ronda: el dinero de TODOS vuelve al inicial --- */
    ok(await until(() => A.has('end'), 6000), 'la ronda termina (el límite de bajas por equipo estaba en 1)');
    ok(await until(() => A.has('cash', m => m.cash === S.CONST.SHOP_START_CASH), 6000) && await until(() => Bbot.has('cash', m => m.cash === S.CONST.SHOP_START_CASH), 1000),
      'al empezar la ronda siguiente, el dinero de los DOS jugadores vuelve a ' + S.CONST.SHOP_START_CASH);

    A.close(); Bbot.close();
  } catch (e) { ok(false, 'error en la prueba de servidor: ' + e.message); } finally { srv.kill(); }

  /* ---------- 3. Cliente: la tienda se dibuja y solo se compra ahí (sin atajo de teclas) ---------- */
  console.log('\n=== 3. Cliente: la tienda en la pantalla de reaparición ===');
  const PUB = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('sin servidor'));
  w.eval(fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'));
  w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));
  let c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'); const i = c.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  c = c.slice(0, i) + "window.__T = { get state() { return state; }, get player() { return player; }, get bots() { return bots; }, cfg, keys, get botCash() { return botCash; }, kill, step, setMouse(v) { mouseL = v; }, setMouseR(v) { mouseR = v; } };\n" + c.slice(i);
  w.eval(c);
  await sleep(200);
  const T = w.__T, $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];

  $('#play').click(); ok(T.state === 'playing', 'arranca una partida de entrenamiento');
  for (let f = 0; f < 60; f++) T.step(1 / 60);

  const clsAntes = T.cfg.cls;
  T.kill(T.player, T.bots[0], false, 'Prueba');
  ok(!$('#death').hidden, 'al morir aparece la pantalla de reaparición');
  ok(!$('#shop').classList.contains('off'), 'la tienda se ve de entrada, sin tener que abrirla');
  ok($('#deathPick') === null, 'ya no existe la lista de elegir arma gratis con el teclado');
  const cards = $$('#shopGrid .wcard'); ok(cards.length === 11, 'la tienda pinta las 11 tarjetas (' + cards.length + ')');

  const priceOf = card => +card.querySelector('em').textContent.replace(/\D/g, '');
  const insuficiente = cards.find(cd => priceOf(cd) > T.botCash && !cd.classList.contains('owned'));
  ok(insuficiente && insuficiente.classList.contains('locked') && insuficiente.querySelector('button').disabled, 'un arma que no se puede pagar se ve apagada y con el botón deshabilitado');
  const equipada = cards.find(cd => S.WEAPONS[S.SHOP[[...cards].indexOf(cd)].wi].id === S.WEAPONS[T.cfg.cls].id);
  if (equipada) ok(equipada.classList.contains('owned') && /Equipada/i.test(equipada.querySelector('button').textContent), 'el arma ya equipada se marca como «Equipada», sin poder comprarla otra vez');

  /* pulsar los números 1-9 estando muerto YA NO cambia de arma (se ha quitado a petición del usuario) */
  const before = T.cfg.cls;
  for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) { w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code, bubbles: true })); }
  ok(T.cfg.cls === before, 'las teclas 1-4 ya NO cambian de arma al morir (' + before + ' sigue siendo ' + T.cfg.cls + ')');

  /* comprar de verdad desde la tarjeta: descuenta dinero y equipa el arma */
  const asequible = cards.find(cd => !cd.classList.contains('locked') && !cd.classList.contains('owned'));
  if (asequible) {
    const si = [...cards].indexOf(asequible), price = priceOf(asequible), cashAntes = T.botCash, wi = S.SHOP[si].wi;
    asequible.querySelector('button').click();
    ok(T.botCash === cashAntes - price, 'comprar una tarjeta asequible descuenta su precio exacto (' + cashAntes + ' → ' + T.botCash + ')');
    ok(T.cfg.cls === wi, 'y equipa esa arma para el próximo respawn (' + S.WEAPONS[wi].name + ')');
  } else ok(false, 'no había ninguna tarjeta asequible para probar la compra (revisar el dinero inicial frente a los precios)');

  ok(errors.length === 0, 'sin errores de JavaScript en todo el proceso (' + errors.length + ')');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
