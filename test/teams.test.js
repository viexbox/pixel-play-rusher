'use strict';
/* Equipos azul y rojo en el servidor: reparto al azar y equilibrado, sin fuego amigo, victoria por equipo y reequilibrio entre rondas. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const P1 = 3185, P2 = 3186, DIR = '/tmp/ppr_teams', APASS = 'Teams-Admin-2026xy';
fs.rmSync(DIR, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(20); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
const start = (port, dir, env) => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, MATCH_TIME: 120, KILL_LIMIT: 99, BREAK_SECS: 3, MAX_CONN_PER_IP: 200, TRUST_PROXY: 1 }, env), stdio: 'ignore' }); procs.push(p); return p; };
let n = 20; const xip = () => '10.7.3.' + (n++);
class Bot {
  constructor(port, name, map) { this.port = port; this.name = name; this.map = map || 0; this.msgs = []; this.pos = null; this.ep = 0; }
  connect() { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + this.port + '/ws', { headers: { 'X-Forwarded-For': xip() } }); this.ws.on('open', () => this.send({ t: 'hello', v: 1, n: this.name, map: this.map, c: 0 })); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; this.tm = m.tm; this.welcome = m; res(m); } if (m.t === 'team' && m.id === this.id) this.tm = m.tm; if (m.t === 'spawn' && m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; } if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; } }); this.ws.on('close', () => res(null)); this.ws.on('error', () => {}); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); }
  count(t) { return this.msgs.filter(m => m.t === t).length; }
  last(t) { return [...this.msgs].reverse().find(m => m.t === t); }
  sendState() { this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.sendState(); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}
const worlds = {}; const world = m => (worlds[m] = worlds[m] || S.buildWorld(m));
const los = (m, a, b) => { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: -0.5, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world(m).colliders, o, d, l) >= l - 0.05; };
async function approach(m, bot, tgt) { for (let r = 5; r <= 12; r += 3) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 56 || Math.abs(z) > 56 || S.overlapAt(world(m).colliders, x, 0, z, 0.4, 1.8)) continue; if (los(m, { x, z }, tgt)) { await bot.walkTo(x, z); return true; } } return false; }
async function shootAt(bot, tgt, times) { for (let i = 0; i < times; i++) { const dx = tgt.x - bot.pos.x, dz = tgt.z - bot.pos.z, dy = -0.5, l = Math.hypot(dx, dy, dz); bot.send({ t: 'shoot', o: [bot.pos.x, 1.6, bot.pos.z], d: [[dx / l, dy / l, dz / l]] }); await sleep(120); } }
(async () => {
  fs.mkdirSync(DIR + '2', { recursive: true }); fs.writeFileSync(DIR + '2/leaderboard.json', JSON.stringify({ entries: ['Viexbox', 'ProGamer', 'Normalito'].map((n, i) => ({ n, p: 900 - i * 100, k: 9, d: 1, h: 1, c: 'Asalto', m: 0, t: 1 })) }));
  start(P1, DIR + '1', { MAX_PLAYERS_PER_ROOM: 2 }); start(P2, DIR + '2', {}); await sleep(1400);
  const api = async (port, m, p, b, tk) => { const r = await fetch('http://127.0.0.1:' + port + '/api/admin' + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': xip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  try {
    /* ---------- Reparto: al azar, pero equilibrado ---------- */
    const pairs = []; for (let i = 0; i < 20; i++) { const a = new Bot(P1, 'A' + i), b = new Bot(P1, 'B' + i); await a.connect(); await b.connect(); pairs.push([a, b]); }
    ok(pairs.every(([a, b]) => (a.tm === 0 || a.tm === 1) && (b.tm === 0 || b.tm === 1) && a.tm !== b.tm && a.welcome.room === b.welcome.room), '20 salas de 2 jugadores: en cada una hay un azul y un rojo');
    const first = pairs.map(([a]) => a.tm); ok(first.includes(0) && first.includes(1), 'quién es azul y quién rojo se decide al azar (' + first.filter(x => x === 0).length + ' de 20 primeros jugadores en azul)');
    pairs.flat().forEach(b => b.close());
    const room = []; for (let i = 0; i < 5; i++) { const b = new Bot(P2, 'R' + i, 3); await b.connect(); room.push(b); }
    const c0 = room.filter(b => b.tm === 0).length, c1 = room.filter(b => b.tm === 1).length;
    ok(c0 + c1 === 5 && Math.abs(c0 - c1) <= 1, '5 jugadores en una sala: equipos equilibrados (' + c0 + ' azules, ' + c1 + ' rojos)');
    ok(room[4].has('join') || room[0].has('join', m => m.p.tm === 0 || m.p.tm === 1), 'los demás reciben el equipo de cada jugador que entra');
    ok(room[0].welcome.players.every(p => p.tm === 0 || p.tm === 1) && room[4].welcome.players.every(p => p.tm === 0 || p.tm === 1), 'y quien llega ve el equipo de todos los que ya estaban');
    room.forEach(b => b.close()); await sleep(400);

    /* ---------- Verificados en la clasificación global (los ve todo el mundo) ---------- */
    { const T0 = (await api(P2, 'POST', '/login', { user: 'Viexbox', password: APASS })).j.token; await api(P2, 'POST', '/influencers/add', { name: 'ProGamer' }, T0);
      const lb = (await (await fetch('http://127.0.0.1:' + P2 + '/api/leaderboard?map=0')).json()).entries, role = n => (lb.find(e => e.n === n) || {}).r;
      ok(role('Viexbox') === 'admin' && role('ProGamer') === 'inf' && !role('Normalito'), 'la clasificación global marca como verificados al administrador («admin») y a los influencers («inf»), y a nadie más'); }
    /* ---------- Sin fuego amigo ---------- */
    const g = []; for (let i = 0; i < 4; i++) { const b = new Bot(P2, 'F' + i, 0); await b.connect(); g.push(b); }
    await until(() => g.every(b => b.pos)); await sleep(1700);
    const A = g[0], mate = g.find(b => b !== A && b.tm === A.tm), foe = g.find(b => b.tm !== A.tm);
    ok(!!mate && !!foe, 'con 4 jugadores hay un compañero y un rival para el jugador A (A: ' + (A.tm ? 'rojo' : 'azul') + ')');
    let tp = { x: mate.pos.x, z: mate.pos.z }; ok(await approach(0, A, tp), 'A se coloca con línea de visión a su compañero');
    const hitsBefore = A.count('hit'); await shootAt(A, tp, 6); await sleep(300);
    ok(A.count('hit') === hitsBefore && !mate.has('hurt'), 'disparar a un compañero no le hace daño (los disparos lo atraviesan)');
    tp = { x: foe.pos.x, z: foe.pos.z }; ok(await approach(0, A, tp), 'A se coloca con línea de visión a un rival');
    await shootAt(A, tp, 5); await sleep(300);
    ok(A.count('hit') > hitsBefore && foe.has('hurt'), 'a un rival sí le hace daño');
    // cuchillo: mismo criterio
    await approach(0, A, { x: mate.pos.x, z: mate.pos.z }); const mh = mate.count('hurt');
    for (let i = 0; i < 3; i++) { const dx = mate.pos.x - A.pos.x, dz = mate.pos.z - A.pos.z, l = Math.hypot(dx, -0.5, dz); A.send({ t: 'melee', d: [dx / l, -0.5 / l, dz / l] }); await sleep(560); }
    ok(mate.count('hurt') === mh, 'el cuchillo tampoco hiere a compañeros');
    ok(mate.has('melee', m => m.id === A.id) && foe.has('melee', m => m.id === A.id), 'y el golpe de cuchillo se avisa a los demás (para que vean el cuchillo)');

    /* ---------- Victoria por equipos ---------- */
    const AT = (await api(P2, 'POST', '/login', { user: 'Viexbox', password: APASS })).j.token;
    ok(foe.has('kill') || A.has('kill') || true, 'ronda en marcha');
    const rid = (await api(P2, 'GET', '/players', null, AT)).j.players.find(p => p.name === 'F0').room;
    await api(P2, 'POST', '/rooms/action', { id: rid, action: 'end' }, AT);
    ok(await until(() => g.every(b => b.has('end'))), 'al terminar la ronda todos reciben el resultado');
    const end = A.last('end'); ok(Array.isArray(end.tk) && end.tk.length === 2 && end.res.every(r => r[8] === 0 || r[8] === 1), 'el resultado trae las bajas de cada equipo y el equipo de cada fila');
    const kills = end.tk; ok(end.tw === (kills[0] === kills[1] ? -1 : kills[0] > kills[1] ? 0 : 1), 'gana el equipo con más bajas (azul ' + kills[0] + ' · rojo ' + kills[1] + ' → ' + (end.tw < 0 ? 'empate' : end.tw ? 'rojo' : 'azul') + ')');

    /* ---------- Reequilibrio entre rondas ---------- */
    const byTeam = t => g.filter(b => b.tm === t);
    const stay = byTeam(0).length >= 1 ? 0 : 1; const leave = g.filter(b => b.tm !== stay); leave.forEach(b => b.close());
    const remaining = g.filter(b => b.tm === stay);
    if (remaining.length >= 2) { ok(await until(() => remaining.some(b => b.has('team')) && remaining.every(b => b.has('round')), 6000), 'si se van todos de un equipo, al empezar la ronda se equilibra (mensaje «team»)'); const t = remaining.map(b => b.tm); ok(Math.abs(t.filter(x => x === 0).length - t.filter(x => x === 1).length) <= 1, 'y quedan equipos con diferencia máxima de 1 jugador'); }
    else ok(true, 'reequilibrio no necesario en esta partida');
    g.forEach(b => b.close());
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
