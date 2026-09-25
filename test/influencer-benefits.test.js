'use strict';
/* Beneficios de un influencer (o administrador) que juega con su cuenta: debe recibir PX, estadísticas, XP del pase y entrada de clasificación por ID,
   igual que cualquier otro jugador. Antes, tener un rol desvinculaba la cuenta y no se entregaba nada. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PORT = 3270, D = '/tmp/ppr_inf', B = 'http://127.0.0.1:' + PORT, APASS = 'Inf-Admin-2026xyz';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let ipn = 10; const ip = () => '10.9.7.' + (ipn++);
class Bot {
  constructor(name, extra) { this.name = name; this.extra = extra || {}; this.msgs = []; this.pos = null; this.ep = 0; this.id = null; }
  connect() { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } }); this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: 0, c: 0 }, this.extra))); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; res(m); } if (m.t === 'err') res(m); if (m.t === 'spawn' && m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; } if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; } }); this.ws.on('error', () => {}); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t) { return this.msgs.some(m => m.t === t); } last(t) { return [...this.msgs].reverse().find(m => m.t === t); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}
const world = S.buildWorld(0);
const los = (a, b) => { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: -0.5, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; };
async function approach(bot, tgt) { for (let r = 6; r <= 12; r += 3) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 38 || Math.abs(z) > 38 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; if (los({ x, z }, tgt)) { await bot.walkTo(x, z); return true; } } return false; }
const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };

(async () => {
  fs.rmSync(D, { recursive: true, force: true });
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: D, ADMIN_PASSWORD: APASS, DATABASE_URL: '', MATCH_TIME: 120, BREAK_SECS: 3, HISTORY_MIN_SECS: 1, MAX_CONN_PER_IP: 30, ACCOUNTS_REG_MAX: 50 }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } }); await sleep(1500);
  try {
    const TS = (await call('POST', '/api/auth/register', { username: 'Streamer_1', email: 's@e.com', password: 'Clave-Segura-77' })).j.token;
    const AT = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
    const KEY = (await call('POST', '/api/admin/influencers/add', { name: 'ProGamer' }, AT)).j.key;
    const me0 = (await call('GET', '/api/me', null, TS)).j.profile;
    const inf = new Bot('x', { acct: TS, inf: KEY }); const w0 = await inf.connect();
    ok(w0.t === 'welcome' && w0.n === 'ProGamer' && w0.rl === 'inf', 'el influencer entra con su nombre verificado (tic azul) usando su cuenta');
    const foe = new Bot('Rival', {}); await foe.connect(); await until(() => inf.pos && foe.pos); await sleep(1700);
    const tp = { x: foe.pos.x, z: foe.pos.z }; ok(await approach(inf, tp), 'llega al rival con línea de tiro');
    for (let i = 0; i < 16 && !foe.has('kill'); i++) { const dx = tp.x - inf.pos.x, dz = tp.z - inf.pos.z, dy = -0.5, l = Math.hypot(dx, dy, dz); inf.send({ t: 'shoot', o: [inf.pos.x, 1.6, inf.pos.z], d: [[dx / l, dy / l, dz / l]] }); await sleep(120); }
    const room = (await call('GET', '/api/admin/players', null, AT)).j.players.find(p => p.name === 'ProGamer').room; await call('POST', '/api/admin/rooms/action', { id: room, action: 'end' }, AT);
    ok(await until(() => inf.has('award')), 'al terminar la partida el influencer recibe su premio (mensaje award) — antes no llegaba nunca');
    const aw = inf.last('award'), me1 = (await call('GET', '/api/me', null, TS)).j.profile;
    ok(aw && me1.px === me0.px + aw.px && aw.px > 0, 'sus PX suben en la cuenta (+' + (aw && aw.px) + ')');
    ok(aw.cr > 0 && me1.credits === me0.credits + aw.cr && aw.crBalance === me1.credits, 'y sus Créditos, la segunda moneda (+' + aw.cr + ' CR)');
    ok(me1.stats.games === 1 && me1.stats.kills >= 1 && me1.stats.points > 0, 'y sus estadísticas de cuenta (partidas, bajas, puntos)');
    ok(await until(() => inf.has('bpxp')) && (await call('GET', '/api/bp', null, TS)).j.state.xp > 0, 'y la XP del pase de batalla');
    const lb = (await (await fetch(B + '/api/leaderboard?map=0', { headers: { 'X-Forwarded-For': ip() } })).json()).entries;
    ok(lb.some(e => e.n === 'ProGamer' && e.r === 'inf'), 'y aparece en la clasificación con su tic de verificado');
    ok(JSON.stringify(lb).indexOf(me1.id) < 0, 'sin exponer el ID de la cuenta');
    inf.close(); foe.close();
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
