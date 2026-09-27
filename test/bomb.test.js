'use strict';
/* [BOMBA] Modo «Desactivar bomba» con jugadores reales por WebSocket: rondas sin reaparecer, plantar en A/B manteniendo E,
   desactivar, explosión, eliminación, tiempo agotado, papeles que se alternan y final de partida. Rondas cortas por variables. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PORT = 3346, D = '/tmp/ppr_bomb';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let ipn = 10; const ip = () => '10.9.8.' + (ipn++);
class Bot {
  constructor(name, extra) { this.name = name; this.extra = extra || {}; this.msgs = []; this.pos = null; this.ep = 0; this.id = null; this.others = new Map(); this.spawnAt = 0; }
  connect(map) { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } }); this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: map || 0, c: 0 }, this.extra))); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; this.welcome = m; for (const p of m.players || []) this.others.set(p.id, { x: p.x, z: p.z }); res(m); } if (m.t === 'err') res(m); if (m.t === 'spawn') { if (m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; this.spawnAt = Date.now(); } else this.others.set(m.id, { x: m.x, z: m.z, at: Date.now() }); } if (m.t === 'kill' && m.v === this.id) this.spawnAt = Date.now() + 1e9; /* muerto: no se puede atacar hasta que reaparezca */ if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; } }); this.ws.on('error', () => {}); this.ws.on('close', () => { this.closed = true; res({ t: 'err', m: 'cerrado' }); }); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); } last(t) { return [...this.msgs].reverse().find(m => m.t === t); } all(t) { return this.msgs.filter(m => m.t === t); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}
const world = S.buildWorld(0);
const los = (a, b) => { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: -0.4, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; };
async function ring(bot, tgt, r0, r1) { for (let r = r0; r <= r1 + (r0 > 3 ? 8 : 1.5); r += 0.6) for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 56 || Math.abs(z) > 56 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; if (los({ x, z }, tgt)) { await bot.walkTo(x, z); return true; } } return false; }
const aim = (b, t) => { const dx = t.x - b.pos.x, dy = 1.2 - 1.6, dz = t.z - b.pos.z, l = Math.hypot(dx, dy, dz); return [dx / l, dy / l, dz / l]; };
/* atacante mata a víctima: how = 'gun' | 'knife' → true si llegó el mensaje de baja */
async function kill(att, vic, how) {
  const seen = () => att.msgs.some(m => m.t === 'kill' && m.k === att.id && m.v === vic.id && m.n === undefined && m.ts === undefined && m.after);
  const mark = att.msgs.length, done = () => att.msgs.slice(mark).some(m => m.t === 'kill' && m.k === att.id && m.v === vic.id);
  for (let tries = 0; tries < 4 && !done(); tries++) {
    await until(() => vic.pos && Date.now() - vic.spawnAt > 1800 && Date.now() - att.spawnAt > 1800, 6000);
    const t = { x: vic.pos.x, z: vic.pos.z }; att.others.set(vic.id, t);
    const rr = how === 'knife' ? await ring(att, t, 1.4, 2.2) : await ring(att, t, 6, 12); if (process.env.DBG) console.log('DBG try', tries, how, 'ring', rr, 'att', att.name, JSON.stringify(att.pos), 'vic', JSON.stringify(t), 'attAlive?', att.msgs.filter(m => m.t === 'spawn' && m.id === att.id).length);
    if (!rr) { await sleep(500); continue; }
    for (let i = 0; i < 22 && !done(); i++) { const d = aim(att, t); if (how === 'knife') att.send({ t: 'melee', d }); else att.send({ t: 'shoot', o: [att.pos.x, 1.6, att.pos.z], d: [d] }); await sleep(how === 'knife' ? 520 : 130); }
  }
  return done();
}

const bombs = b => b.all('bomb').map(m => m.b);
const lastBomb = b => { const x = b.last('bomb'); return x && x.b; };
const waitBomb = (b, f, ms) => until(() => b.msgs.some(m => m.t === 'bomb' && m.b && f(m.b)), ms || 20000).then(r => r && [...b.msgs].reverse().find(m => m.t === 'bomb' && m.b && f(m.b)).b);   // busca en todo lo recibido: cada condición lleva el número de ronda
const hold = async (b, ms) => { b.send({ t: 'bact', on: 1 }); const t0 = Date.now(); while (Date.now() - t0 < ms) { b.send({ t: 'st', ep: b.ep, x: b.pos.x, y: 0, z: b.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(100); } b.send({ t: 'bact', on: 0 }); };
const A = S.MAPS[0].bomb[0];

(async () => {
  fs.rmSync(D, { recursive: true, force: true });
  const env = Object.assign({}, process.env, { PORT, DATA_DIR: D, DATABASE_URL: '', WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '0', BREAK_SECS: 2, MAX_CONN_PER_IP: 60, BOMB_WIN: 3, BOMB_ROUND: 16, BOMB_FUSE: 12, BOMB_PAUSE: 1 });
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } }); await sleep(1600);
  try {
    ok(S.MODES.bomba && S.MODES.bomba.name === 'Desactivar bomba' && S.MAPS.every(m => m.bomb && m.bomb.map(b => b.n).join() === 'A,B'), 'existe el modo «Desactivar bomba» y cada mapa tiene sus puntos A y B');
    ok(S.MAPS.every((m, i) => m.bomb.every(b => !S.overlapAt(S.buildWorld(i).colliders, b.x, b.y, b.z, 1.2, 1.8))), 'los puntos A y B están en sitios libres');
    const r = new Bot('Rojo', { mode: 'bomba', tm: 1 }), a = new Bot('Azul', { mode: 'bomba', tm: 0 });
    const wr = await r.connect(0); await a.connect(0);
    await until(() => r.pos && a.pos && r.welcome && a.welcome);
    const byTeam = t => (r.welcome.tm === t ? r : a);
    ok(wr.mode === 'bomba' && wr.lim === 3 && r.welcome.tm !== a.welcome.tm, 'sala de bomba: límite de ' + wr.lim + ' rondas y un jugador en cada equipo');
    /* ---------- Ronda 1: ataca ROJO; se planta en A y AZUL la desactiva ---------- */
    const b1 = await waitBomb(r, b => b.st === 'live' && b.n === 1);
    ok(b1 && b1.att === 1, 'empieza la ronda 1 y ataca el equipo ROJO (' + JSON.stringify(b1 && { n: b1.n, att: b1.att }) + ')');
    const att = byTeam(1), def = byTeam(0);
    await until(() => Date.now() - att.spawnAt > 600 && Date.now() - def.spawnAt > 600, 4000);
    await hold(att, 1200); ok(!att.has('bprog', m => m.p > 0), 'mantener E fuera de A o B no hace nada');
    await att.walkTo(A.x, A.z); const mark = att.msgs.length; await hold(att, 1500);
    ok(att.msgs.slice(mark).some(m => m.t === 'bprog' && m.k === 'plant' && m.p > 0.2 && m.p < 1), 'en A, mantener E va rellenando la barra de plantar');
    await att.walkTo(A.x + 2, A.z); await sleep(200); ok(att.last('bprog') && att.last('bprog').p === 0 && lastBomb(att).st === 'live', 'moverse (o soltar E) antes de tiempo cancela: la bomba no se planta');
    await att.walkTo(A.x, A.z); await hold(att, 3400);
    const pl = await waitBomb(def, b => b.st === 'planted' && b.n === 1, 3000);
    ok(pl && pl.site === 'A' && Math.hypot(pl.x - A.x, pl.z - A.z) < 1 && pl.fuse > 0, '3 s en A: bomba plantada en A y todos lo saben (mecha de ' + (pl && pl.fuse) + ' s)');
    await def.walkTo(pl.x + 1, pl.z); const dmark = def.msgs.length; await hold(def, 1200);
    ok(def.msgs.slice(dmark).some(m => m.t === 'bprog' && m.k === 'defuse' && m.p > 0), 'el defensor junto a la bomba empieza a desactivarla');
    const e1 = await waitBomb(att, b => b.st === 'pause' && b.n === 1, 16000);
    ok(e1 && e1.why === 'explota' && e1.w === 1 && e1.tk[1] === 1, 'lo deja a medias (hacen falta 5 s sin moverse): la bomba explota y la ronda es para ROJO (' + JSON.stringify(e1 && { why: e1.why, w: e1.w, tk: e1.tk }) + ')');
    /* ---------- Ronda 2: se cambian los papeles; ataca AZUL, planta y ROJO la desactiva a tiempo ---------- */
    const b2 = await waitBomb(r, b => b.st === 'live' && b.n === 2, 6000);
    ok(b2 && b2.att === 0, 'ronda 2: los papeles se cambian y ahora ataca AZUL');
    ok(await until(() => r.all('spawn').length >= 2 && a.all('spawn').length >= 2, 3000), 'y todos reaparecen al empezar la ronda');
    const att2 = byTeam(0), def2 = byTeam(1); const B2 = S.MAPS[0].bomb[1];
    await until(() => Date.now() - att2.spawnAt > 600, 3000); await att2.walkTo(B2.x, B2.z); await hold(att2, 3400);
    const pl2 = await waitBomb(def2, b => b.st === 'planted' && b.n === 2, 3000); ok(pl2 && pl2.site === 'B', 'AZUL planta en B');
    await def2.walkTo(pl2.x - 1, pl2.z); def2.send({ t: 'bact', on: 1 });
    const e2 = await waitBomb(def2, b => b.st === 'pause' && b.n === 2, 9000); def2.send({ t: 'bact', on: 0 });
    ok(e2 && e2.why === 'desactivada' && e2.w === 1 && e2.tk[1] === 2, 'ROJO la desactiva (sin moverse durante 5 s): ronda para ROJO, 2 – 0 (' + JSON.stringify(e2 && { why: e2.why, w: e2.w, tk: e2.tk }) + ')');
    /* ---------- Ronda 3: ataca ROJO; AZUL elimina al atacante, que no reaparece ---------- */
    const b3 = await waitBomb(r, b => b.st === 'live' && b.n === 3, 6000); ok(b3 && b3.att === 1, 'ronda 3: vuelve a atacar ROJO');
    const vic = byTeam(1), kil = byTeam(0);
    const killed = await kill(kil, vic, 'gun'); const km = kil.last('kill'), sp0 = vic.all('spawn').filter(m => m.id === vic.id).length;
    ok(killed && km && km.rs === 0, 'AZUL elimina al atacante; el aviso de baja no trae cuenta atrás de reaparición (rs = 0)');
    const e3 = await waitBomb(kil, b => b.st === 'pause' && b.n === 3, 4000);
    ok(e3 && e3.why === 'eliminados' && e3.w === 0 && e3.tk[0] === 1, 'sin atacantes vivos, la ronda es para AZUL (' + JSON.stringify(e3 && { why: e3.why, w: e3.w, tk: e3.tk }) + ')');
    ok(vic.all('spawn').filter(m => m.id === vic.id).length === sp0, 'el eliminado no reaparece: espera a la ronda siguiente');
    /* ---------- Ronda 4: ataca AZUL y no planta: se acaba el tiempo y gana ROJO la partida (3 rondas) ---------- */
    const b4 = await waitBomb(r, b => b.st === 'live' && b.n === 4, 6000); ok(b4 && b4.att === 0, 'ronda 4: ataca AZUL');
    const e4 = await waitBomb(r, b => b.st === 'pause' && b.n === 4, 22000);
    ok(e4 && e4.why === 'tiempo' && e4.w === 1 && e4.tk[1] === 3, 'nadie planta y se acaba el tiempo: ronda para los defensores (ROJO), 3 – 1 (' + JSON.stringify(e4 && { why: e4.why, w: e4.w, tk: e4.tk }) + ')');
    ok(await until(() => r.has('end'), 4000) && r.last('end').tw === 1 && r.last('end').tk[1] === 3, 'con 3 rondas ROJO gana la partida (pantalla final)');
    const nb = await waitBomb(r, b => b.st === 'live' && b.n === 1, 9000); ok(nb && nb.att === 1 && nb.tk[0] === 0 && nb.tk[1] === 0, 'la partida siguiente empieza de cero, en la ronda 1');
    r.close(); a.close();
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); srv.kill(); process.exit(failed ? 1 : 0);
})();
