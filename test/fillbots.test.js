'use strict';
/* Bots de relleno del servidor: aparecen, se mueven, disparan y matan; se van al entrar personas; no dan premios con un solo jugador real; no hay bots en clasificatorio. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PORT = 3400, D = '/tmp/ppr_fill', B = 'http://127.0.0.1:' + PORT, APASS = 'Fill-Admin-2026xyz';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let ipn = 10; const ip = () => '10.9.9.' + (ipn++);
const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
const NAMES = ['Nova', 'Kraken', 'Pixel', 'Rayo', 'Ciclón', 'Sombra', 'Turbo', 'Cobra', 'Bruno', 'Volt', 'Zeta', 'Titán', 'Brasa', 'Cobalto'];
class Bot {
  constructor(name, extra) { this.name = name; this.extra = extra || {}; this.msgs = []; this.pos = null; this.ep = 0; this.id = null; this.others = new Map(); this.spawnAt = 0; }
  connect(map) { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } }); this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: map || 0, c: 0 }, this.extra))); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; this.welcome = m; for (const p of m.players || []) this.others.set(p.id, { x: p.x, z: p.z }); res(m); } if (m.t === 'err') res(m); if (m.t === 'spawn') { if (m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; this.spawnAt = Date.now(); } else this.others.set(m.id, { x: m.x, z: m.z, at: Date.now() }); } if (m.t === 'kill' && m.v === this.id) this.spawnAt = Date.now() + 1e9; /* muerto: no se puede atacar hasta que reaparezca */ if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; } }); this.ws.on('error', () => {}); this.ws.on('close', () => { this.closed = true; res({ t: 'err', m: 'cerrado' }); }); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); } last(t) { return [...this.msgs].reverse().find(m => m.t === t); } all(t) { return this.msgs.filter(m => m.t === t); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}

const start = async env => { fs.rmSync(D, { recursive: true, force: true }); const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: D, ADMIN_PASSWORD: APASS, DATABASE_URL: '', MATCH_TIME: 300, BREAK_SECS: 3, MAX_CONN_PER_IP: 80, ACCOUNTS_REG_MAX: 60, WALL_CHECK: '0', REQUIRE_TERMS: '0', HISTORY_MIN_SECS: 1 }, env), stdio: 'ignore' }); procs.push(p); await sleep(1700); return p; };
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill('SIGKILL'); } catch (e) { /* nada */ } });
const joins = b => b.all('join').map(m => m.p.n).filter(n => NAMES.includes(n));
const lastSnap = b => b.last('snap');
/* Camina por el suelo hasta un punto siguiendo la rejilla de navegación (la misma física que el cliente); para si llega, si muere (cambia su época) o si se acaba el tiempo. */
async function goTo(bot, world, to, maxSecs) {
  const e = { pos: { x: bot.pos.x, y: 0, z: bot.pos.z }, vel: { x: 0, y: 0, z: 0 }, hw: 0.35, h: 1.8, onGround: true }, field = S.navField(world.nav, to[0], to[1]), t0 = Date.now(), ep0 = bot.ep; let nf = bot.all('fix').length;
  while (Date.now() - t0 < maxSecs * 1000 && bot.ep === ep0 && Math.hypot(to[0] - e.pos.x, to[1] - e.pos.z) > 3) {
    if (bot.all('fix').length !== nf) { nf = bot.all('fix').length; e.pos.x = bot.pos.x; e.pos.z = bot.pos.z; }   // el servidor lo corrigió: se parte de ahí
    const d = S.navDir(world.nav, field, e.pos.x, e.pos.z); if (!d) break; e.vel.x = d[0] * 6; e.vel.z = d[1] * 6; S.moveEntity(world.colliders, e, 0.05);
    bot.pos.x = e.pos.x; bot.pos.z = e.pos.z; bot.send({ t: 'st', ep: bot.ep, x: +e.pos.x.toFixed(3), y: +e.pos.y.toFixed(3), z: +e.pos.z.toFixed(3), yaw: 0, pitch: 0, h: 1.8 }); await sleep(50);
  }
}

(async () => {
  try {
    console.log('=== Un jugador solo, con bots ===');
    let srv = await start({ FILL_BOTS: 8, BOT_SKILL: 1 });
    const AT = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token, reg = async n => (await call('POST', '/api/auth/register', { username: n, email: n.toLowerCase() + '@e.com', password: 'Clave-Segura-77' })).j.token;
    const T1 = await reg('Solo_1'), T2 = await reg('Dos_2');
    const h1 = new Bot('Solo_1', { acct: T1 }); const w1 = await h1.connect(0);
    ok(w1.t === 'welcome' && w1.mode === 'duelo', 'un jugador real entra a una sala de Duelo');
    ok(await until(() => joins(h1).length === 7, 9000), 'la sala se completa con 7 bots (hasta 8 en total): ' + joins(h1).join(', '));
    ok(new Set(joins(h1)).size === 7, 'cada bot tiene un nombre distinto');
    ok(await until(() => lastSnap(h1) && lastSnap(h1).w === 0), 'la partida empieza sola: ya no dice «esperando rivales»');
    const pos = b => Object.fromEntries((lastSnap(b).s || []).map(x => [x[0], [x[1], x[3]]])); const samples = [pos(h1)]; for (let k = 0; k < 6; k++) { await sleep(1000); samples.push(pos(h1)); } const p0 = samples[0], p1 = samples[6];
    /* «se mueve» = recorrido acumulado (un bot que combate hace strafe: recorre metros y acaba donde empezó, así que el desplazamiento neto no sirve) */
    const pathOf = id => { let L = 0, prev = null; for (const sm of samples) if (sm[id]) { if (prev) L += Math.hypot(sm[id][0] - prev[0], sm[id][1] - prev[1]); prev = sm[id]; } return L; };
    const moved = Object.keys(p1).filter(id => +id !== h1.id && pathOf(id) > 6).length; ok(moved >= 3, 'los bots se mueven por el mapa (' + moved + ' de 7 han recorrido más de 6 m en 6 s)');
    const seenIds = new Set([...Object.keys(p0), ...Object.keys(p1), ...samples.flatMap(sm => Object.keys(sm))]); ok(seenIds.size >= 7 && Object.keys(p1).length >= 4, 'y aparecen en las posiciones que ven todos (' + seenIds.size + ' de 8 vistos en la ventana, ' + Object.keys(p1).length + ' vivos ahora: con bots que combaten, alguno espera a reaparecer)');
    ok(await until(() => h1.has('shot', m => m.id !== h1.id), 45000), 'los bots disparan');
    ok(await until(() => h1.has('hurt') || h1.has('kill', m => m.v === h1.id), 60000), 'y aciertan: el jugador recibe daño');
    /* quieto en su base el jugador tiene a sus compañeros bots, que abaten a los rivales antes de rematarlo: para probar que un bot PUEDE eliminar a una persona se le lleva a la base enemiga, donde está solo */
    await goTo(h1, S.buildWorld(0), S.MAPS[0].spawns[1 - w1.tm][0], 40);
    ok(await until(() => h1.has('kill', m => m.v === h1.id), 90000), 'y llegan a eliminarlo cuando se adentra en la base enemiga (los bots juegan de verdad, con las mismas reglas)');
    const kill = h1.all('kill').find(m => m.v === h1.id); ok(kill && kill.k !== h1.id && kill.w, 'la baja dice quién (un bot) y con qué arma (' + (kill && kill.w) + ')');
    const rooms = (await call('GET', '/api/admin/players', null, AT)).j.players; ok(rooms.length === 1 && rooms[0].name === 'Solo_1', 'el panel solo ve al jugador real (los bots no cuentan como jugadores)');
    const ov = (await call('GET', '/api/admin/overview', null, AT)).j; ok(ov.online === 1 && ov.rooms.length === 1 && ov.rooms[0].players === 1 && ov.rooms[0].bots === 7, 'y en las salas: 1 jugador real y 7 bots');

    console.log('\n-- Se van al entrar personas');
    const h2 = new Bot('Dos_2', { acct: T2 }); const w2 = await h2.connect(0); ok(w2.room === w1.room, 'un segundo jugador real entra en la MISMA sala (los bots no la llenan)');
    ok(await until(() => h1.has('leave') , 6000), 'al entrar, sobra un bot y se va'); await sleep(1500);
    const ov2 = (await call('GET', '/api/admin/overview', null, AT)).j; ok(ov2.rooms[0].players === 2 && ov2.rooms[0].bots === 6, 'con 2 jugadores reales quedan 6 bots (8 en total)');

    console.log('\n-- Premios: solo con 2 jugadores reales');
    ok(await until(() => h1.has('kill', m => m.v === h1.id) && h2.msgs.length > 0, 1000), 'preparación: alguien tiene actividad');
    await until(() => h2.has('kill', m => m.v === h2.id) || h1.all('kill').filter(m => m.v === h1.id).length >= 2, 60000);
    await call('POST', '/api/admin/rooms/action', { id: w1.room, action: 'end' }, AT); ok(await until(() => h1.has('end') && h2.has('end'), 6000), 'termina la ronda');
    const e = h1.last('end'); ok(e.nb === 6 && e.rw === true, 'el mensaje de fin dice que había 6 bots y que la ronda SÍ da premios (hay 2 jugadores reales)');
    ok(h1.has('award') || h2.has('award'), 'y el jugador con actividad recibe su premio (PX y Créditos)');
    const me1 = (await call('GET', '/api/me', null, T1)).j.profile, me2 = (await call('GET', '/api/me', null, T2)).j.profile; ok(me1.stats.games + me2.stats.games >= 1, 'las estadísticas de la cuenta suben');
    const lb = (await (await fetch(B + '/api/leaderboard?map=0', { headers: { 'X-Forwarded-For': ip() } })).json()).entries || []; ok(lb.every(x => !NAMES.includes(x.n)), 'ningún bot aparece en la clasificación global (' + lb.map(x => x.n).join(', ') + ')');
    h2.close(); await sleep(1500);

    console.log('\n-- Sin premios con un solo jugador real');
    await until(() => h1.has('round', m => true) && lastSnap(h1), 8000); await sleep(3500);
    const before = h1.all('award').length, gBefore = (await call('GET', '/api/me', null, T1)).j.profile.stats.games;
    await until(() => h1.has('kill', m => m.v === h1.id) || true, 100); await call('POST', '/api/admin/rooms/action', { id: w1.room, action: 'end' }, AT); ok(await until(() => h1.all('end').length >= 2, 6000), 'termina otra ronda con 1 jugador real y 7 bots');
    const e2 = h1.last('end'); ok(e2.nb === 7 && e2.rw === false, 'ahora el fin de ronda dice «sin premios» (nb=' + e2.nb + ', rw=' + e2.rw + ')');
    await sleep(500); ok(h1.all('award').length === before && (await call('GET', '/api/me', null, T1)).j.profile.stats.games === gBefore, 'no llega ningún premio ni suben las estadísticas, aunque haya habido bajas: no se puede granjear contra bots');
    h1.close(); await sleep(1500);
    ok((await call('GET', '/api/admin/overview', null, AT)).j.rooms.length === 0, 'cuando se va el último jugador real la sala desaparece con sus bots');

    console.log('\n=== Clasificatorio, modos y desactivación ===');
    const rk = new Bot('Solo_1', { acct: T1, rk: 1 }); const wr = await rk.connect(0); await sleep(4000);
    ok(wr.rk === 1 && joins(rk).length === 0 && (lastSnap(rk) ? lastSnap(rk).w === 1 : true), 'en clasificatorio NO hay bots (solo se juega contra personas: sigue «esperando rivales»)'); rk.close(); await sleep(600);
    const zn = new Bot('Solo_1', { acct: T1, mode: 'zona' }); await zn.connect(1); ok(await until(() => joins(zn).length === 7, 9000), 'en Capturar zona también se completa con bots'); ok(await until(() => zn.has('zone', m => m.z && m.z.o >= 0), 40000), 'y los bots van a la zona: llegan a disputarla o capturarla'); zn.close(); await sleep(600);
    const kn = new Bot('Solo_1', { acct: T1, mode: 'cuchillos' }); const wk = await kn.connect(2); ok(await until(() => joins(kn).length === 7, 9000), 'en Solo cuchillos igual');
    await goTo(kn, S.buildWorld(0), S.MAPS[0].spawns[1 - wk.tm][0], 40);   // como arriba: quieto en su base lo defienden sus compañeros; en la base enemiga está solo
    ok(await until(() => kn.has('hurt', m => m.d === 60) || kn.has('kill', m => m.w === 'Cuchillo'), 90000), 'y los bots pelean a cuchillo (60 de daño por golpe)'); kn.close(); await sleep(600);
    procs.pop().kill('SIGKILL'); await sleep(500);
    srv = await start({ FILL_BOTS: 0 }); const off = new Bot('Solo_2', {}); await off.connect(0); await sleep(3000); ok(joins(off).length === 0 && lastSnap(off) && lastSnap(off).w === 1, 'con FILL_BOTS=0 no hay bots y la sala espera a un rival como antes'); off.close();
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill('SIGKILL'); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
