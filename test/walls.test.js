'use strict';
/* Colisiones con paredes en el servidor y emparejamiento clasificatorio con espera. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PORT = 3360, D = '/tmp/ppr_walls', B = 'http://127.0.0.1:' + PORT, APASS = 'Wall-Admin-2026x';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let ipn = 10; const ip = () => '10.9.7.' + (ipn++);
const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
class Bot {
  constructor(name, extra) { this.name = name; this.extra = extra || {}; this.msgs = []; this.pos = null; this.ep = 0; this.id = null; this.others = new Map(); this.spawnAt = 0; }
  connect(map) { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } }); this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: map || 0, c: 0 }, this.extra))); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; this.welcome = m; for (const p of m.players || []) this.others.set(p.id, { x: p.x, z: p.z }); res(m); } if (m.t === 'err') res(m); if (m.t === 'spawn') { if (m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; this.spawnAt = Date.now(); } else this.others.set(m.id, { x: m.x, z: m.z, at: Date.now() }); } if (m.t === 'kill' && m.v === this.id) this.spawnAt = Date.now() + 1e9; /* muerto: no se puede atacar hasta que reaparezca */ if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; } }); this.ws.on('error', () => {}); this.ws.on('close', () => { this.closed = true; res({ t: 'err', m: 'cerrado' }); }); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); } last(t) { return [...this.msgs].reverse().find(m => m.t === t); } all(t) { return this.msgs.filter(m => m.t === t); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}

/* Jugador LEGÍTIMO: usa la misma física que el cliente (S.moveEntity) y manda su posición cada 50 ms, como el juego. */
function legit(bot, mapIdx) {
  const cols = S.buildWorld(mapIdx).colliders, e = { pos: { x: bot.pos.x, y: 0, z: bot.pos.z }, vel: { x: 0, y: 0, z: 0 }, hw: 0.35, h: 1.8, onGround: true };
  let seed = 12345 + mapIdx; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  let tx = e.pos.x, tz = e.pos.z, t = 0, frames = 0; const wps = S.buildWorld(mapIdx).waypoints;
  return {
    e, cols, sent: 0,
    step(dt) {
      t -= dt; if (t <= 0) { const w = wps[Math.floor(rnd() * wps.length)]; tx = w[0]; tz = w[1]; t = 1.5 + rnd() * 3; }   // camina en línea recta hacia un punto aleatorio (choca y se desliza por las paredes)
      const d = Math.hypot(tx - e.pos.x, tz - e.pos.z) || 1, sp = rnd() < 0.002 ? 12 : 7.4; e.vel.x = (tx - e.pos.x) / d * sp; e.vel.z = (tz - e.pos.z) / d * sp;
      if (e.onGround && rnd() < 0.02) e.vel.y = S.CONST.JUMP;   // saltos al azar
      S.moveEntity(cols, e, dt); frames++;
      if (frames % 3 === 0) { bot.send({ t: 'st', ep: bot.ep, x: +e.pos.x.toFixed(3), y: +e.pos.y.toFixed(3), z: +e.pos.z.toFixed(3), yaw: 0, pitch: 0, h: 1.8 }); this.sent++; }
    }
  };
}
/* Camino por el suelo (celdas de 1 m) desde una posición hasta otra, esquivando paredes */
function groundPath(mapIdx, from, to) {
  const cols = S.buildWorld(mapIdx).colliders, half = S.MAPS[mapIdx].half, blocked = (x, z) => cols.some(c => x + 0.5 > c.minX && x - 0.5 < c.maxX && z + 0.5 > c.minZ && z - 0.5 < c.maxZ && c.maxY > 0.05 && c.minY < 1.8);   // el camino va a ras de suelo (y = 0): cualquier cosa que sobresalga, incluso un peldaño de 0,45 m, se rodea
  const key = (a, b) => a + ',' + b, s = [Math.round(from.x), Math.round(from.z)], g = [Math.round(to.x), Math.round(to.z)], prev = new Map([[key(s[0], s[1]), null]]), q = [s];
  for (let i = 0; i < q.length; i++) { const [a, b] = q[i]; if (a === g[0] && b === g[1]) break; for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db, k = key(na, nb); if (Math.abs(na) > half - 1 || Math.abs(nb) > half - 1 || prev.has(k) || blocked(na, nb)) continue; prev.set(k, [a, b]); q.push([na, nb]); } }
  const out = []; for (let c = g, k = key(c[0], c[1]); prev.has(k) && c; c = prev.get(k), k = c ? key(c[0], c[1]) : '') out.push(c); return out.reverse();
}
async function walkPath(bot, path) {   // sigue el camino a 8 m/s mandando la posición cada 50 ms
  for (const [x, z] of path) { while (Math.hypot(x - bot.pos.x, z - bot.pos.z) > 0.05) { const dx = x - bot.pos.x, dz = z - bot.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 8 * 0.05); bot.pos.x += dx / d * st; bot.pos.z += dz / d * st; bot.send({ t: 'st', ep: bot.ep, x: bot.pos.x, y: 0, z: bot.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
}

(async () => {
  fs.rmSync(D, { recursive: true, force: true });
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: D, ADMIN_PASSWORD: APASS, DATABASE_URL: '', MATCH_TIME: 300, BREAK_SECS: 2, MAX_CONN_PER_IP: 60, ACCOUNTS_REG_MAX: 50, WALL_CHECK: '1', RANKED_WIDEN_SECS: 1.5, RANKED_LEAVE_MS: 999999 }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } }); await sleep(1700);
  try {
    /* ---------- 1) jugadores legítimos: cero falsos positivos ---------- */
    console.log('=== Jugadores legítimos (física real del cliente) ===');
    for (const [mapIdx, secs] of [[0, 45]]) {
      const bot = new Bot('Legit' + mapIdx, {}); await bot.connect(mapIdx); await until(() => bot.pos); await sleep(300); const sim = legit(bot, mapIdx); const t0 = Date.now();
      while (Date.now() - t0 < secs * 1000) { sim.step(1 / 60); await sleep(16); }
      const fixes = bot.all('fix').length; ok(fixes === 0 && sim.sent > secs * 12, S.MAPS[mapIdx].name + ': ' + secs + ' s de movimiento (' + sim.sent + ' posiciones, saltos, escaleras y choques contra paredes) sin ninguna corrección del servidor (' + fixes + ')'); bot.close(); await sleep(200);
    }
    /* ---------- 2) tramposo: atravesar paredes ---------- */
    console.log('\n=== Atravesar paredes ===');
    const M = 0, WZ = 14, wall = S.buildWorld(M).colliders.find(c => Math.abs(c.minX - 26.8) < 0.01 && Math.abs(c.maxX - 29.2) < 0.01 && c.minZ < WZ && c.maxZ > WZ);   // contenedor de la Lower Plaza: 2,4 m de grosor
    ok(!!wall && wall.maxY - wall.minY > 1.5, 'hay un contenedor de 2,4 m de grosor en Nexus Outpost para probar (x de 26,8 a 29,2)');
    const ch = new Bot('Tramposo', {}); await ch.connect(M); await until(() => ch.pos); await sleep(1800);
    const A = { x: 26.4, z: WZ }; await walkPath(ch, groundPath(M, ch.pos, { x: 25.6, z: WZ }).concat([[A.x, A.z]])); await sleep(100);   // hasta una casilla libre y de ahí al borde del muro
    ok(Math.hypot(ch.pos.x - A.x, ch.pos.z - A.z) < 0.4 && ch.all('fix').length === 0, 'el tramposo llega andando (por el suelo, sin trampas) junto al muro: no hay correcciones (' + ch.all('fix').length + ')');
    const fixes0 = ch.all('fix').length; let caught = 0;
    for (let i = 0; i < 12; i++) { const before = ch.all('fix').length; await sleep(150); ch.send({ t: 'st', ep: ch.ep, x: 29.6, y: 0, z: WZ, yaw: 0, pitch: 0, h: 1.8 }); await sleep(60); if (ch.all('fix').length > before) caught++; else { ch.pos = { x: 29.6, y: 0, z: WZ }; } }
    ok(caught === 12, 'saltar al otro lado del muro de golpe (3,2 m en 0,15 s, dentro del límite de velocidad): el servidor lo rechaza las 12 veces (' + caught + '/12)');
    const lastFix = ch.last('fix'); ok(lastFix && Math.abs(lastFix.x - A.x) < 0.3 && Math.abs(lastFix.z - A.z) < 0.3, 'y lo devuelve a su sitio legítimo (' + lastFix.x.toFixed(1) + ', ' + lastFix.z.toFixed(1) + ')');
    /* meterse dentro del muro poco a poco (noclip) */
    let inside = 0; ch.pos = { x: lastFix.x, y: 0, z: lastFix.z }; ch.ep = lastFix.ep;
    for (let i = 0; i < 10; i++) { const before = ch.all('fix').length; ch.send({ t: 'st', ep: ch.ep, x: 26.4 + 0.3 * (i + 1), y: 0, z: WZ, yaw: 0, pitch: 0, h: 1.8 }); await sleep(60); const fx = ch.last('fix'); if (ch.all('fix').length > before) { inside++; ch.pos = { x: fx.x, y: fx.y, z: fx.z }; ch.ep = fx.ep; } }
    ok(inside >= 8, 'avanzar poco a poco hacia dentro del muro (noclip) se corta en cuanto el cuerpo entra: ' + inside + ' de 10 pasos rechazados y el resto son los que aún no tocaban');
    ok(ch.all('fix').every(f => f.x < 26.8 - 0.28 + 0.05 || f.x > 29.2), 'ninguna corrección deja al jugador dentro del muro');
    const players = (await call('GET', '/api/admin/players', null, (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token)).j.players; ok(players.some(p => p.name === 'Tramposo'), 'el tramposo sigue conectado (se le corrige, no se le expulsa: un lag legítimo no debe echar a nadie)'); ch.close();

    /* ---------- 3) emparejamiento clasificatorio con espera ---------- */
    console.log('\n=== Emparejamiento clasificatorio con poca gente ===');
    const AT = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token, reg = async n => (await call('POST', '/api/auth/register', { username: n, email: n.toLowerCase() + '@e.com', password: 'Clave-Segura-77' })).j.token;
    const set = (u, m) => call('POST', '/api/admin/ranked/set', { username: u, mmr: m }, AT);
    const T = {}; for (const [n, m] of [['Liga_Bronce', 1000], ['Liga_Plat', 1500], ['Liga_Plat2', 1520], ['Liga_Elite', 1950], ['Liga_Elite2', 1960]]) { T[n] = await reg(n); await set(n, m); }
    const join = async n => { const b = new Bot(n, { rk: 1, acct: T[n] }); const w = await b.connect(0); b.room = w.room; return b; };
    const a = await join('Liga_Bronce'); const p1 = await join('Liga_Plat');
    ok(a.room !== p1.room, 'al principio un jugador de Platino (liga 4) no entra en la sala de uno de Bronce (liga 1): diferencia 3');
    p1.close(); await sleep(300); await sleep(4700);   // la sala de Bronce lleva ~5 s con un solo jugador → acepta hasta 4 ligas de diferencia
    const p2 = await join('Liga_Plat2'); ok(p2.room === a.room, 'tras esperar ~5 s solo, la sala de Bronce se abre a ligas más lejanas y Platino entra: el que esperaba ya tiene rival (' + p2.room + ' = ' + a.room + ')');
    const e1 = await join('Liga_Elite'); ok(e1.room !== a.room, 'pero una sala con 2 jugadores ya no se ensancha: un jugador de Élite va a otra sala');
    const e2 = await join('Liga_Elite2'); ok(e2.room === e1.room, 'y los dos de Élite se encuentran entre sí (liga más cercana antes que la sala más llena)');
    [a, p2, e1, e2].forEach(b => b.close());
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
