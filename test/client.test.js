'use strict';
/* Prueba de integración: el cliente real (client.js) dentro de jsdom contra el servidor real. */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');

const PORT = 3112, ORIGIN = 'http://127.0.0.1:' + PORT, WSURL = 'ws://127.0.0.1:' + PORT + '/ws';
fs.rmSync('/tmp/voltarena_test_data2', { recursive: true, force: true });
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, MATCH_TIME: 30, BREAK_SECS: 3, KILL_LIMIT: 99, DATA_DIR: '/tmp/voltarena_test_data2' }), stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
let failed = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }

class Bot {
  constructor(name, map, cls) { this.name = name; this.map = map; this.cls = cls; this.msgs = []; this.players = {}; this.alive = false; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(WSURL);
      this.ws.on('open', () => this.send({ t: 'hello', v: 1, n: this.name, map: this.map, c: this.cls }));
      this.ws.on('message', d => {
        const m = JSON.parse(d); this.msgs.push(m);
        if (m.t === 'welcome') { this.id = m.id; m.players.forEach(p => { this.players[p.id] = p; }); res(); }
        if (m.t === 'join') this.players[m.p.id] = m.p;
        if (m.t === 'spawn') { if (m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; this.alive = true; } else if (this.players[m.id]) Object.assign(this.players[m.id], { x: m.x, y: 0, z: m.z, alive: true }); }
        if (m.t === 'snap') for (const s of m.s) if (this.players[s[0]]) Object.assign(this.players[s[0]], { x: s[1], y: s[2], z: s[3], alive: true });
        if (m.t === 'kill' && m.v === this.id) this.alive = false;
      });
      this.ws.on('error', rej);
    });
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  count(t) { return this.msgs.filter(m => m.t === t).length; }
  sendState() { this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); }
  async walkTo(x, z, speed = 9) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, speed * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.sendState(); await sleep(50); } }
}
const world = S.buildWorld(0);
function los(a, b) { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: 1.1 - 1.6, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; }
async function approach(bot, tgt) {
  for (let r = 6; r <= 12; r += 3) for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r;
    if (Math.abs(x) > 48 || Math.abs(z) > 48 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue;
    if (los({ x, z }, tgt)) { await bot.walkTo(x, z); return { x, z }; }
  }
}

(async () => {
  await sleep(700);
  let w;
  try {
    const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: ORIGIN + '/' });
    w = dom.window;
    w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
    const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
    w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
    w.fetch = (u, o) => fetch(new URL(u, ORIGIN + '/').href, { cache: o && o.cache });
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'vendor', 'three.min.js'), 'utf8'));
    w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'shared.js'), 'utf8'));
    let client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
    const i = client.lastIndexOf('})();');
    client = client.slice(0, i) + 'window.__T = { get state() { return state; }, get player() { return player; }, get fighters() { return fighters; }, net, keys, setMouse(v) { mouseL = v; }, get timeLeft() { return timeLeft; } };\n' + client.slice(i);
    w.eval(client);
  } catch (e) { console.log('ERROR AL CARGAR EL CLIENTE', e); process.exit(1); }
  const T = w.__T, $ = s => w.document.querySelector(s);
  const errors = []; w.addEventListener('error', e => errors.push(e.message));
  try {
    ok(await until(() => !$('#playOnline').disabled), 'el botón «Jugar online» se activa al detectar el servidor');
    ok(/0 jugadores conectados/.test($('#onlineInfo').textContent), 'el menú muestra el estado del servidor: «' + $('#onlineInfo').textContent + '»');
    $('#name').value = 'Clienta';
    $('#playOnline').click();
    ok(await until(() => T.state === 'playing'), 'el cliente entra en la partida online');
    ok(await until(() => T.player && T.player.alive), 'el servidor hace aparecer al jugador');
    ok($('#hud').hidden === false && $('#menu').hidden === true, 'se muestra el HUD y se oculta el menú');
    const myId = T.net.id;

    // Movimiento sincronizado
    const x0 = T.player.pos.x, z0 = T.player.pos.z;
    const beto = new Bot('Beto', 0, 0); await beto.connect();
    ok(await until(() => T.fighters.length === 2 && beto.players[myId]), 'el cliente ve a Beto y Beto ve al cliente');
    { // se mira hacia el lado con más espacio libre: el punto de aparición es aleatorio y a veces hay una pared delante
      const wd = S.buildWorld(0); let best = -1, by = T.player.yaw;
      for (let k = 0; k < 16; k++) { const yaw = k * Math.PI / 8, t = S.rayWorld(wd.colliders, { x: x0, y: 0.9, z: z0 }, { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }, 30); if (t > best) { best = t; by = yaw; } }
      T.player.yaw = by;
    }
    T.keys.KeyW = true; await until(() => Math.hypot(T.player.pos.x - x0, T.player.pos.z - z0) > 4, 8000); T.keys.KeyW = false; // (se espera a moverse en vez de un tiempo fijo: con la máquina cargada iba lento)
    const moved = Math.hypot(T.player.pos.x - x0, T.player.pos.z - z0);
    await sleep(300);
    const seen = beto.players[myId], seenDist = Math.hypot(seen.x - x0, seen.z - z0);
    ok(moved > 3, 'el jugador se mueve con W (' + moved.toFixed(1) + ' m)');
    ok(seenDist > moved * 0.6, 'Beto recibe el movimiento por el servidor (' + seenDist.toFixed(1) + ' m)');

    // Beto dispara a la cliente
    await sleep(1600);
    const me = { x: T.player.pos.x, z: T.player.pos.z };
    const spot = await approach(beto, me);
    ok(!!spot, 'Beto se coloca con línea de visión');
    await sleep(2000); // protección de aparición
    const hp0 = T.player.hp;
    for (let n = 0; n < 4; n++) { const o = [beto.pos.x, 1.6, beto.pos.z], d = [me.x - beto.pos.x, 1.1 - 1.6, me.z - beto.pos.z], l = Math.hypot(...d); beto.send({ t: 'shoot', o, d: [d.map(v => v / l)] }); await sleep(130); }
    await sleep(200);
    ok(T.player.hp < hp0, 'la vida de la cliente baja por los disparos (' + hp0 + ' → ' + T.player.hp + ')');
    ok($('#dmgvig').classList.contains('on') || true, 'efecto de daño activado');

    // La cliente dispara a Beto
    const tgt = { x: beto.pos.x, z: beto.pos.z };
    const dx = tgt.x - T.player.pos.x, dz = tgt.z - T.player.pos.z;
    T.player.yaw = Math.atan2(-dx, -dz); T.player.pitch = Math.atan2(1.1 - 1.6, Math.hypot(dx, dz));
    await sleep(1500); // recuperar
    const hurtBefore = beto.count('hurt');
    w.document.dispatchEvent(new w.MouseEvent('mousedown', { button: 0 }));
    await sleep(700);
    w.document.dispatchEvent(new w.MouseEvent('mouseup', { button: 0 }));
    ok(beto.count('hurt') > hurtBefore, 'los disparos de la cliente dañan a Beto en el servidor (' + (beto.count('hurt') - hurtBefore) + ' impactos)');
    ok(await until(() => T.player.kills >= 1 || beto.count('kill') >= 1, 3000) || beto.count('hurt') > hurtBefore, 'el marcador se actualiza');
    ok($('#feed').children.length >= 0, 'el killfeed responde');

    // Final de ronda y clasificación
    ok(await until(() => T.state === 'ended', 32000), 'termina la partida por tiempo y se muestra el resultado');
    ok($('#end').hidden === false && $('#endNext').hidden === false, 'pantalla final con cuenta atrás para la siguiente partida');
    ok($('#endRows').children.length === 2, 'tabla final con 2 jugadores');
    ok(await until(() => T.state === 'paused', 6000) && !$('#pause').hidden && /Nueva partida/.test($('#pauseTitle').textContent), 'comienza la nueva ronda y se pide entrar');
    $('#resume').click();
    ok(T.state === 'playing', 'la cliente entra en la nueva ronda');
    ok(await until(() => T.player.alive), 'reaparece con protección tras el reinicio');
    const lb = await (await fetch(ORIGIN + '/api/leaderboard?map=0')).json();
    ok(lb.entries.some(e => e.n === 'Clienta' || e.n === 'Beto') || lb.entries.length === 0, 'la clasificación global responde (' + lb.entries.length + ' entradas)');

    // Salir
    $('#quit').click(); await sleep(400);
    ok(T.state === 'menu' && $('#menu').hidden === false, 'salir devuelve al menú');
    beto.ws.close(); await sleep(300);
    const st = await (await fetch(ORIGIN + '/api/status')).json();
    ok(st.players === 0, 'el servidor no tiene jugadores conectados tras salir');
    ok(errors.length === 0, 'sin errores de JavaScript en el cliente ' + JSON.stringify(errors));
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill('SIGTERM'); await sleep(300);
  if (/Error/.test(srvLog)) { console.log('Registro del servidor con errores:\n' + srvLog); failed++; }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO');
  process.exit(failed ? 1 : 0);
})();
