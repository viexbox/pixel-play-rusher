'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const S = require('../public/shared.js');

const PORT = 3111, URL = 'ws://127.0.0.1:' + PORT + '/ws', HTTP = 'http://127.0.0.1:' + PORT;
const DATA = '/tmp/voltarena_test_data';
fs.rmSync(DATA, { recursive: true, force: true });
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], {
  env: Object.assign({}, process.env, { PORT, MATCH_TIME: 120, BREAK_SECS: 3, KILL_LIMIT: 2, DATA_DIR: DATA }), stdio: ['ignore', 'pipe', 'pipe']
});
let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });

let failed = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

class Bot {
  constructor(name, map, cls) { this.name = name; this.map = map; this.cls = cls; this.msgs = []; this.pos = null; this.ep = 0; this.id = null; this.alive = false; this.players = {}; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', () => this.send({ t: 'hello', v: 1, n: this.name, map: this.map, c: this.cls }));
      this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.on(m); if (m.t === 'welcome') res(); });
      this.ws.on('error', rej);
      this.ws.on('close', () => { this.closed = true; });
    });
  }
  on(m) {
    if (m.t === 'welcome') { this.id = m.id; m.players.forEach(p => { this.players[p.id] = p; }); }
    if (m.t === 'join') this.players[m.p.id] = m.p;
    if (m.t === 'spawn') {
      if (m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; this.alive = true; }
      else if (this.players[m.id]) Object.assign(this.players[m.id], { x: m.x, y: 0, z: m.z, alive: true });
    }
    if (m.t === 'snap') for (const s of m.s) if (this.players[s[0]]) Object.assign(this.players[s[0]], { x: s[1], y: s[2], z: s[3], alive: true });
    if (m.t === 'kill' && m.v === this.id) this.alive = false;
    if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; }
    if (m.t === 'kill' && this.players[m.v]) this.players[m.v].alive = false;
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  count(t) { return this.msgs.filter(m => m.t === t).length; }
  async waitFor(t, pred, ms = 8000) {
    const t0 = Date.now();
    for (;;) {
      const m = this.msgs.find(x => x.t === t && (!pred || pred(x)));
      if (m) return m;
      if (Date.now() - t0 > ms) return null;
      await sleep(20);
    }
  }
  sendState() { this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); }
  async walkTo(x, z, speed = 8) {
    while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) {
      const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, speed * 0.05);
      this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.sendState(); await sleep(50);
    }
  }
}

const world = S.buildWorld(0);
function losClear(a, b) { // de a (ojo) a pecho de b
  const o = { x: a.x, y: 1.6, z: a.z }, t = { x: b.x, y: 1.1, z: b.z };
  const d = { x: t.x - o.x, y: t.y - o.y, z: t.z - o.z }, len = Math.hypot(d.x, d.y, d.z);
  d.x /= len; d.y /= len; d.z /= len;
  return S.rayWorld(world.colliders, o, d, len) >= len - 0.05;
}
async function approach(a, target) {
  for (let r = 6; r <= 12; r += 3) for (let k = 0; k < 24; k++) {
    const ang = k / 24 * Math.PI * 2, x = target.x + Math.cos(ang) * r, z = target.z + Math.sin(ang) * r;
    if (Math.abs(x) > 56 || Math.abs(z) > 56 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue;
    if (losClear({ x, z }, target)) { await a.walkTo(x, z, 9); return { x, z }; }
  }
  return null;
}
function aimAt(a, b) {
  const o = { x: a.pos.x, y: 1.6, z: a.pos.z }, d = { x: b.x - o.x, y: 1.1 - o.y, z: b.z - o.z }, len = Math.hypot(d.x, d.y, d.z);
  return { o: [o.x, o.y, o.z], d: [d.x / len, d.y / len, d.z / len] };
}

(async () => {
  await sleep(700);
  try {
    // --- HTTP ---
    let r = await fetch(HTTP + '/api/status'); let j = await r.json();
    ok(r.status === 200 && j.players === 0, 'API /api/status responde (0 jugadores)');
    r = await fetch(HTTP + '/'); const html = await r.text();
    ok(r.status === 200 && html.includes('Krunxa') && r.headers.get('content-security-policy'), 'la página principal se sirve con cabecera CSP');
    r = await fetch(HTTP + '/shared.js'); ok(r.status === 200, 'shared.js se sirve');
    r = await fetch(HTTP + '/vendor/three.min.js'); ok(r.status === 200, 'three.min.js local se sirve');
    r = await fetch(HTTP + '/../server.js'); ok(r.status === 404, 'no se puede salir de /public (server.js → 404)');
    r = await fetch(HTTP + '/%2e%2e/server.js'); ok(r.status === 404, 'ruta con ../ codificado → 404');
    r = await fetch(HTTP + '/api/leaderboard?map=-1'); j = await r.json(); ok(Array.isArray(j.entries) && j.entries.length === 0, 'clasificación vacía al empezar');

    // --- Versión incorrecta ---
    const bad = new WebSocket(URL); let badMsg = null;
    await new Promise(res => { bad.on('open', () => bad.send(JSON.stringify({ t: 'hello', v: 99, n: 'x', map: 0, c: 0 }))); bad.on('message', d => { badMsg = JSON.parse(d); }); bad.on('close', res); });
    ok(badMsg && badMsg.t === 'err', 'versión de protocolo incorrecta rechazada');

    // --- Dos jugadores en la misma sala ---
    const A = new Bot('Ana', 0, 0), B = new Bot('Beto', 0, 2);
    await A.connect(); await A.waitFor('spawn', m => m.id === A.id);
    await B.connect(); await B.waitFor('spawn', m => m.id === B.id);
    const wa = A.msgs.find(m => m.t === 'welcome'), wb = B.msgs.find(m => m.t === 'welcome');
    ok(wa.room === wb.room, 'los dos jugadores comparten sala (' + wa.room + ')');
    await sleep(150);
    ok(A.players[B.id] && B.players[A.id], 'cada jugador ve al otro');
    ok(A.pos && B.pos, 'ambos han reaparecido con posición del servidor');
    await sleep(300);
    ok(A.count('snap') > 3, 'llegan instantáneas periódicas (' + A.count('snap') + ')');
    j = await (await fetch(HTTP + '/api/status')).json();
    ok(j.players === 2 && j.rooms.length === 1, 'estado: 2 jugadores, 1 sala');

    // --- Anti-trampas: teletransporte ---
    const ox = A.pos.x; A.pos.x = ox + 30; A.sendState(); await sleep(150);
    const fixMsg = await A.waitFor('fix', null, 1000);
    ok(!!fixMsg && Math.abs(fixMsg.x - ox) < 0.5, 'un teletransporte de 30 m es rechazado y se recoloca al jugador');
    A.pos = { x: fixMsg.x, y: 0, z: fixMsg.z }; A.ep = fixMsg.ep;

    // --- Combate ---
    B.msgs.length = 0; A.msgs.length = 0;
    // B (Ana atacante = asalto): acercarse con línea de visión
    const target = { x: B.pos.x, z: B.pos.z };
    const spot = await approach(A, target);
    ok(!!spot, 'Ana llega a una posición con línea de visión hacia Beto');
    await sleep(300);
    let aim = aimAt(A, target);
    // ráfaga imposible: 15 disparos en 100 ms → solo unos pocos cuentan
    for (let i = 0; i < 15; i++) A.send({ t: 'shoot', o: aim.o, d: [aim.d] });
    await sleep(300);
    const hitsSpam = A.count('hit');
    ok(hitsSpam >= 1 && hitsSpam <= 4, 'límite de cadencia: 15 disparos instantáneos → ' + hitsSpam + ' impactos');
    ok(B.count('hurt') === hitsSpam, 'Beto recibe un aviso de daño por cada impacto');
    // disparo a través de una pared no impacta: colocar a Ana detrás de la pirámide (posición conocida)
    // matar a Beto
    for (let i = 0; i < 12 && !B.msgs.find(m => m.t === 'kill'); i++) { A.send({ t: 'shoot', o: aim.o, d: [aim.d] }); await sleep(120); }
    const kill = await A.waitFor('kill', null, 2000);
    ok(!!kill && kill.k === A.id && kill.v === B.id, 'Beto eliminado por Ana (arma: ' + (kill && kill.w) + ')');
    ok(kill && kill.pts >= 100, 'la baja da al menos 100 puntos (' + (kill && kill.pts) + ')');
    const board = await A.waitFor('board', b => b.b.some(r => r[0] === A.id && r[1] === 1), 2500);
    ok(!!board, 'el marcador refleja 1 baja de Ana');
    // Beto reaparece a los 3 s
    const respawn = await B.waitFor('spawn', m => m.id === B.id, 4500);
    ok(!!respawn && respawn.ep > 1, 'Beto reaparece tras 3 s con nueva época (' + (respawn && respawn.ep) + ')');
    ok(B.msgs.some(m => m.t === 'kill') && Date.now() > 0, 'los eventos de baja llegan a todos');

    // segundo asesinato con cuchillo (60) + disparos: llegar al límite de 2 bajas
    B.pos = { x: respawn.x, y: 0, z: respawn.z }; B.ep = respawn.ep;
    await sleep(1700); // fin de la protección de aparición
    const t2 = { x: B.pos.x, z: B.pos.z };
    const spot2 = await approach(A, t2);
    ok(!!spot2, 'Ana vuelve a acercarse');
    await sleep(300); aim = aimAt(A, t2);
    A.msgs.length = 0;
    for (let i = 0; i < 14 && !A.msgs.find(m => m.t === 'end'); i++) { A.send({ t: 'shoot', o: aim.o, d: [aim.d] }); await sleep(120); }
    const end = await A.waitFor('end', null, 3000);
    ok(!!end, 'la partida termina al alcanzar el límite de bajas');
    ok(end && end.res[0][1] === 'Ana' && end.res[0][2] === 2, 'Ana gana con 2 bajas');
    await sleep(2500);
    j = await (await fetch(HTTP + '/api/leaderboard?map=0')).json();
    ok(j.entries.length >= 1 && j.entries[0].n === 'Ana' && j.entries[0].p >= 200, 'la clasificación global guarda a Ana (' + JSON.stringify(j.entries[0]) + ')');
    const roundMsg = await A.waitFor('round', null, 4000);
    ok(!!roundMsg, 'tras el descanso empieza una nueva ronda');
    const sp = await A.waitFor('spawn', m => m.id === A.id && m.ep > 1, 1500);
    ok(!!sp, 'todos reaparecen al empezar la ronda');
    j = await (await fetch(HTTP + '/api/leaderboard?map=-1')).json();
    ok(j.entries.length >= 1, 'la clasificación de todos los mapas también responde');

    // --- Salida de un jugador ---
    B.ws.close(); await sleep(300);
    ok(A.msgs.some(m => m.t === 'leave' && m.id === B.id), 'Ana recibe el aviso de que Beto se fue');
    A.ws.close(); await sleep(300);
    j = await (await fetch(HTTP + '/api/status')).json();
    ok(j.players === 0 && j.rooms.length === 0, 'la sala vacía se elimina');
    ok(fs.existsSync(DATA + '/leaderboard.json'), 'el archivo leaderboard.json existe en disco');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill('SIGTERM');
  await sleep(300);
  if (/Error/.test(srvLog)) { console.log('Registro del servidor con errores:\n' + srvLog); failed++; }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO');
  process.exit(failed ? 1 : 0);
})();
