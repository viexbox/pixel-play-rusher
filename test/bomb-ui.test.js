'use strict';
/* [BOMBA] Interfaz del modo «Desactivar bomba»: selector, barra de ronda, puntos A/B en 3D, avisos, barra de plantar con E, resultado de
   la ronda y pantalla de muerte sin cuenta atrás. Cliente real (jsdom) + servidor real + un segundo jugador por WebSocket. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const { JSDOM } = require('jsdom'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PORT = 3348, ORIGIN = 'http://127.0.0.1:' + PORT, DIR = '/tmp/ppr_bombui', APASS = 'BombUi-Admin-2026x';
fs.rmSync(DIR, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
async function untilA(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* aún no */ } await sleep(40); } return false; }
const wf = (u, o) => fetch(new URL(u, ORIGIN + '/').href, o);
const api = async (m, p, b, tk) => { const r = await wf('/api' + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
const rd = f => fs.readFileSync(path.join(PUB, f), 'utf8'), three = rd('vendor/three.min.js'), shared = rd('shared.js'), client = rd('client.js'), bpjs = rd('bp.js'), sojs = rd('social.js'), mdjs = rd('modes.js');
function boot(opts) {
  opts = opts || {};
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: ORIGIN + '/' + (opts.query || '') }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = wf; w.confirm = () => true; if (opts.token) w.localStorage.setItem('ppr.acct', opts.token); if (opts.adm) w.localStorage.setItem('ppr.admtoken', opts.adm);
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  const i = client.lastIndexOf('})();');
  w.eval(client.slice(0, i) + 'window.__T = { get remote() { return remote; }, get state() { return state; }, get player() { return player; }, get fighters() { return fighters; }, net, cfg, netHandle, setSlot, get slot() { return slot; }, get deathLook() { return deathLook; }, camera, get teamLimit() { return teamLimit; }, updateHudSlow };\n' + client.slice(i)); w.eval(bpjs); w.eval(sojs); w.eval(mdjs);
  return { w, T: w.__T, errors, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] };
}
const setMode = async (C, id) => { C.$('#modeBtn').click(); await until(() => !C.$('#modeModal').hidden && C.$$('#modeBox .mdl-card').length >= 4); C.$(`#modeBox [data-m="${id}"]`).click(); await until(() => C.$(`#modeBox [data-m="${id}"].on`)); C.$('#mdlOk').click(); };
async function play(C) { await until(() => !C.$('#playOnline').disabled); C.$('#playOnline').click(); C.$('#eqPlay').click(); return until(() => C.T.state === 'playing', 8000); }
class Raw {
  constructor(name) { this.name = name; this.msgs = []; this.pos = null; this.ep = 0; }
  connect() { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': '10.4.4.9' } }); this.ws.on('open', () => this.send({ t: 'hello', v: 1, n: this.name, map: 0, c: 0, mode: 'bomba' }));
    this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; this.tm = m.tm; res(m); } if (m.t === 'spawn' && m.id === this.id) { this.pos = { x: m.x, z: m.z }; this.ep = m.ep; } }); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 0.45); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: 0, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
  async hold(ms) { this.send({ t: 'bact', on: 1 }); const t0 = Date.now(); while (Date.now() - t0 < ms) { this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: 0, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(100); } this.send({ t: 'bact', on: 0 }); }
}
(async () => {
  const env = Object.assign({}, process.env, { PORT, DATA_DIR: DIR, ADMIN_PASSWORD: APASS, DATABASE_URL: '', WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '0', BOMB_WIN: 2, BOMB_ROUND: 40, BOMB_FUSE: 20, BOMB_PAUSE: 2 });
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' }); process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } });
  await untilA(async () => (await wf('/healthz')).ok, 8000);
  try {
    const C = boot(); await sleep(400);
    await setMode(C, 'bomba');
    ok(C.T.cfg.mode === 'bomba' && /Desactivar bomba/.test(C.$('#modeBtn').textContent), 'el selector ofrece «Desactivar bomba» y queda elegido (' + C.$('#modeBtn').textContent + ')');
    ok(C.$$('#modeCards .mcard').some(b => b.dataset.m === 'bomba'), 'y también está en las tarjetas de modo del inicio');
    ok(await play(C) && C.T.net.mode === 'bomba', 'se entra a una sala de bomba');
    const R = new Raw('Rival'); await R.connect(); await until(() => R.pos);
    ok(await until(() => C.T.net.bomb && C.T.net.bomb.st === 'live', 8000), 'con dos jugadores empieza la ronda 1 (' + JSON.stringify(C.T.net.bomb) + ')');
    ok(await until(() => /BOMBA · RONDA 1 · ROJO 0 – 0 AZUL · gana el primero a 2/.test(C.$('#modeBar').textContent)), 'la barra de arriba dice la ronda, el marcador y a cuántas se gana: «' + C.$('#modeBar').textContent + '»');
    const meAtt = C.T.player.team === C.T.net.bomb.att;
    ok(await until(() => !C.$('#bombHud').hidden && C.$('#bombHud b').textContent === (meAtt ? 'ATACAS' : 'DEFIENDES')), 'el aviso central dice tu papel: ' + C.$('#bombHud b').textContent + ' · ' + C.$('#bombHud span').textContent);
    const scene = C.w.PPR_BP.scene(); let sprites = 0, rings = 0; scene.traverse(o => { if (o.isSprite) sprites++; if (o.geometry && o.geometry.type === 'RingGeometry') rings++; });
    ok(sprites >= 2 && rings >= 2, 'en el mapa se ven los puntos A y B (anillo en el suelo y letra flotante): ' + rings + ' anillos, ' + sprites + ' letras');
    const A = S.MAPS[0].bomb[0], key = (code, type) => C.w.document.dispatchEvent(new C.w.KeyboardEvent(type, { code, bubbles: true }));
    const moveMe = (x, z) => { C.T.player.pos.set(x, 0, z); C.T.player.vel.set(0, 0, 0); };
    const walkMe = async (x, z) => { for (let k = 0; k < 400; k++) { const p = C.T.player.pos, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); if (d < 0.2) break; const st = Math.min(d, 0.4); moveMe(p.x + dx / d * st, p.z + dz / d * st); await sleep(50); } };   // andando (el servidor corrige los teletransportes)
    if (meAtt) {
      await until(() => C.T.player.alive, 3000); await walkMe(A.x, A.z); 
      ok(await until(() => /Mantén E para plantar la bomba en A/.test(C.$('#bombHud span').textContent), 3000), 'en A el aviso dice «Mantén E para plantar la bomba en A»');
      key('KeyE', 'keydown'); const hold = setInterval(() => moveMe(A.x, A.z), 50);
      ok(await until(() => C.$('#bombHud').classList.contains('prog') && /Plantando/.test(C.$('#bombHud span').textContent), 3000), 'mantener E: «Plantando…» con la barra de progreso (' + C.$('#bombHud .bbar i').style.width + ')');
      ok(await until(() => C.T.net.bomb.st === 'planted', 5000), 'a los 3 s la bomba queda plantada'); clearInterval(hold); key('KeyE', 'keyup');
      ok(await until(() => /BOMBA PLANTADA EN A/.test(C.$('#bombHud b').textContent) && C.$('#bombHud').classList.contains('alarm')), 'el aviso cambia a «BOMBA PLANTADA EN A» y parpadea');
      await R.walkTo(C.T.net.bomb.x + 1, C.T.net.bomb.z); await R.hold(5600);
    } else {
      await until(() => R.pos, 3000); await R.walkTo(A.x, A.z); await R.hold(3400);
      ok(await until(() => C.T.net.bomb.st === 'planted', 4000), 'el rival planta la bomba en A');
      ok(await until(() => /¡BOMBA EN A!/.test(C.$('#bombHud b').textContent) && / m$/.test(C.$('#bombHud span').textContent)), 'el aviso dice «¡BOMBA EN A!» y a cuántos metros está (' + C.$('#bombHud span').textContent + ')');
      const b = C.T.net.bomb; await walkMe(b.x - 1, b.z); ok(await until(() => /Mantén E para desactivar/.test(C.$('#bombHud span').textContent), 3000), 'junto a la bomba: «Mantén E para desactivar la bomba»');
      key('KeyE', 'keydown'); const hold = setInterval(() => moveMe(b.x - 1, b.z), 50);
      ok(await until(() => /Desactivando/.test(C.$('#bombHud span').textContent) && C.$('#bombHud').classList.contains('prog'), 3000), 'mantener E: «Desactivando…» con la barra');
      await until(() => C.T.net.bomb.st === 'pause', 8000); clearInterval(hold); key('KeyE', 'keyup');
    }
    ok(await until(() => C.T.net.bomb.st === 'pause' && !C.$('#bombRes').hidden, 4000), 'al acabar la ronda sale el cartel del resultado: «' + C.$('#bombRes b').textContent + ' · ' + C.$('#bombRes span').textContent + '»');
    ok(/RONDA PARA EL EQUIPO (ROJO|AZUL)/.test(C.$('#bombRes b').textContent) && /Bomba desactivada/.test(C.$('#bombRes span').textContent), 'y explica por qué (bomba desactivada)');
    ok(await until(() => C.T.net.bomb.st === 'live' && C.T.net.bomb.n === 2, 6000) && await until(() => C.$('#bombRes').hidden, 4000), 'empieza la ronda 2 y el cartel se va');
    C.T.netHandle({ t: 'kill', k: R.id, v: C.T.net.id, w: 'Asalto', h: 0, pts: 100, streak: 1, rs: 0, ds: 10, ah: 90 });
    ok(await until(() => /siguiente ronda/.test(C.$('#deathCount') ? C.$('#deathCount').textContent : '')), 'al morir: «Reapareces en la siguiente ronda.» (sin cuenta atrás)');
    ok(C.errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(C.errors.slice(0, 2)));
    R.ws.close(); C.w.close();
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); srv.kill(); process.exit(failed ? 1 : 0);
})();
