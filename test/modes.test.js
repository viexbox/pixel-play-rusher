'use strict';
/* Modos de juego (cuchillos, carrera de armas, capturar zona), clasificatorio con temporadas y espectador de administrador, con jugadores reales por WebSocket. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PORT = 3300, D = '/tmp/ppr_modes', B = 'http://127.0.0.1:' + PORT, APASS = 'Modes-Admin-2026xyz';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let ipn = 10; const ip = () => '10.9.5.' + (ipn++);
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
async function ring(bot, tgt, r0, r1) { for (let r = r0; r <= r1 + (r0 > 3 ? 8 : 1.5); r += 0.6) for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 48 || Math.abs(z) > 48 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; if (los({ x, z }, tgt)) { await bot.walkTo(x, z); return true; } } return false; }
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
const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };

(async () => {
  fs.rmSync(D, { recursive: true, force: true });
  const env = Object.assign({}, process.env, { PORT, DATA_DIR: D, ADMIN_PASSWORD: APASS, DATABASE_URL: '', MATCH_TIME: 300, BREAK_SECS: 2, HISTORY_MIN_SECS: 1, MAX_CONN_PER_IP: 60, ACCOUNTS_REG_MAX: 60, KNIFE_KILL_LIMIT: 2, ZONE_LIMIT: 3, ZONE_MOVE_SECS: 16, LADDER_LEVELS: 2, RANKED_LEAVE_MS: 1500, RANKED_MIN_GAMES: 1 });
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } }); await sleep(1600);
  try {
    const AT = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token, adm = (m, p, b) => call(m, '/api/admin' + p, b, AT);
    /* ---------- modo por defecto ---------- */
    let a = new Bot('Duelo1'); let w = await a.connect(0); ok(w.mode === 'duelo' && w.rk === 0 && w.lim === 40 && w.zone === null, 'sin pedir modo se juega el Duelo por equipos de siempre (límite ' + w.lim + ' bajas)');
    let z = new Bot('Zona1', { mode: 'zona' }); const wz = await z.connect(0); ok(wz.mode === 'zona' && wz.room !== w.room && wz.zone && wz.zone.r === S.ZONE.R && wz.zone.o === -1 && wz.lim === 3, 'cada modo tiene sus propias salas (' + wz.room + ' ≠ ' + w.room + '); la zona llega en el welcome');
    let x = new Bot('Raro', { mode: 'inventado' }); ok((await x.connect(0)).mode === 'duelo', 'un modo desconocido cae al Duelo'); x.close(); a.close(); z.close(); await sleep(300);

    /* ---------- Solo cuchillos ---------- */
    console.log('\n-- Solo cuchillos');
    const k1 = new Bot('Cuchi1', { mode: 'cuchillos' }), k2 = new Bot('Cuchi2', { mode: 'cuchillos' }); const kw = await k1.connect(0); await k2.connect(0); await until(() => k1.pos && k2.pos && k1.others.size);
    ok(kw.mode === 'cuchillos' && kw.lim === 2, 'la sala es de cuchillos');
    await until(() => Date.now() - k1.spawnAt > 1800 && Date.now() - k2.spawnAt > 1800); const t2 = { x: k2.pos.x, z: k2.pos.z };
    ok(await ring(k1, t2, 6, 12), 'Cuchi1 llega a un sitio con línea de tiro');
    for (let i = 0; i < 20; i++) { const d = aim(k1, t2); k1.send({ t: 'shoot', o: [k1.pos.x, 1.6, k1.pos.z], d: [d] }); await sleep(120); }
    ok(!k1.has('hit') && !k2.has('hurt') && !k1.has('kill'), 'disparar no hace nada: en «Solo cuchillos» no hay armas de fuego (20 disparos, 0 impactos)');
    ok(await kill(k1, k2, 'knife') && k2.has('hurt', m => m.d === 60), 'a cuchillo sí: cada golpe quita 60 y la baja llega');
    ok(await kill(k1, k2, 'knife') && await until(() => k1.has('end')), 'con 2 bajas (límite de la prueba) termina la ronda y gana su equipo');
    const ek = k1.last('end'); ok(ek.tw === k1.welcome.tm && ek.tk[k1.welcome.tm] === 2, 'el marcador refleja las 2 bajas del equipo ganador'); k1.close(); k2.close(); await sleep(400);

    /* ---------- Carrera de armas ---------- */
    console.log('\n-- Carrera de armas');
    const c1 = new Bot('Carrera1', { mode: 'carrera' }), c2 = new Bot('Carrera2', { mode: 'carrera' }); const cw = await c1.connect(0); await c2.connect(0); await until(() => c1.pos && c2.pos);
    ok(cw.mode === 'carrera' && cw.lim === 3, 'sala de carrera (2 niveles de armas + cuchillo en la prueba)');
    ok(await kill(c1, c2, 'gun') && await until(() => c1.has('gg')), 'primera baja con arma: sube de nivel'); let gg = c1.last('gg'); ok(gg.lv === 1 && gg.c === S.GUN_LADDER[1], 'Carrera1 pasa al nivel 1 con el arma ' + S.WEAPONS[gg.c].name);
    ok(await kill(c1, c2, 'gun') && c1.all('gg').pop().lv === 2, 'segunda baja: nivel 2 = solo cuchillo');
    const before = c2.has('hurt') ? c2.all('hurt').length : 0;
    await until(() => Date.now() - c2.spawnAt > 1800); { const t = { x: c2.pos.x, z: c2.pos.z }; await ring(c1, t, 6, 12); for (let i = 0; i < 15; i++) { const d = aim(c1, t); c1.send({ t: 'shoot', o: [c1.pos.x, 1.6, c1.pos.z], d: [d] }); await sleep(120); } }
    ok(c2.all('hurt').length === before, 'en el nivel del cuchillo las armas de fuego dejan de funcionar');
    ok(await kill(c2, c1, 'knife') && await until(() => c1.has('gg', m => m.down)), 'si te matan a cuchillo bajas de nivel');
    ok(c1.all('gg').pop().lv === 1 && c1.all('gg').pop().down === 1, 'Carrera1 vuelve al nivel 1'); ok(c2.all('gg').pop().lv >= 1, 'y quien lo mató sube');
    ok(await kill(c1, c2, 'gun') && c1.all('gg').pop().lv === 2, 'vuelve a subir al nivel del cuchillo');
    ok(await kill(c1, c2, 'knife') && await until(() => c1.has('end')), 'una baja con cuchillo en el último nivel gana la ronda');
    ok(c1.last('end').tw === c1.welcome.tm, 'gana el equipo de Carrera1'); c1.close(); c2.close(); await sleep(400);

    /* ---------- Capturar zona ---------- */
    console.log('\n-- Capturar zona');
    const rA = new Bot('RotA', { mode: 'zona' }), rB = new Bot('RotB', { mode: 'zona' }); const rw = await rA.connect(1); await rB.connect(1);   // sala aparte (mapa 1): nadie puntúa, solo se observa el traslado
    const zA = new Bot('ZonaA', { mode: 'zona' }), zB = new Bot('ZonaB', { mode: 'zona' }); const zw = await zA.connect(0); await zB.connect(0); await until(() => zA.pos && zB.pos);
    let Z = zw.zone; await Promise.all([zA.walkTo(Z.x + 9, Z.z - 2), zB.walkTo(Z.x + 9, Z.z + 2)]);   // primero esperan fuera de la zona (radio 5,5) para entrar a la vez: si uno llega mucho antes, puntúa a solas y la ronda acaba antes de la disputa
    await Promise.all([zA.walkTo(Z.x, Z.z), zB.walkTo(Z.x + 1, Z.z)]);
    if (process.env.DBG) console.log('DBG zona', JSON.stringify(Z), 'A', JSON.stringify(zA.pos), 'B', JSON.stringify(zB.pos), 'msgs', zA.all('zone').length, JSON.stringify(zA.all('zone').slice(-2)), 'teams', zA.welcome.tm, zB.welcome.tm, 'fix', zA.all('fix').length, zB.all('fix').length);
    ok(await until(() => zA.all('zone').some(m => m.z && m.z.o === 2), 4000), 'si los dos equipos están dentro, la zona queda disputada (o = 2)');
    const zs0 = zA.all('zone').filter(m => m.z && m.z.o === 2).pop().z.zs.join(); await sleep(1500); ok(zA.all('zone').pop().z.zs.join() === zs0 && zA.all('zone').pop().z.o === 2, 'y mientras está disputada nadie suma');
    await zB.walkTo(Z.x + 12, Z.z);
    ok(await until(() => zA.all('zone').some(m => m.z && m.z.o === zw.tm && m.z.zs[zw.tm] >= 1), 4000), 'si se queda solo un equipo, suma un punto por segundo');
    ok(await until(() => zA.has('end'), 8000), 'al llegar al límite (3 puntos en la prueba) termina la ronda'); const ez = zA.last('end');
    ok(ez.tw === zw.tm && ez.tk[zw.tm] >= 3, 'gana el equipo que controló la zona');
    ok(ez.res.find(r => r[0] === zA.id)[4] > 0, 'y el jugador de la zona suma puntos personales (' + ez.res.find(r => r[0] === zA.id)[4] + ')'); zA.close(); zB.close(); await sleep(300);
    /* la zona cambia de sitio cada cierto tiempo */
    ok(await until(() => rA.all('zone').some(m => m.z && Math.hypot(m.z.x - rw.zone.x, m.z.z - rw.zone.z) >= 20), 20000), 'la zona se traslada a otro punto al menos 20 m más allá al cabo de 16 s'); rA.close(); rB.close(); await sleep(300);

    /* ---------- Clasificatorio ---------- */
    console.log('\n-- Clasificatorio');
    const reg = async n => (await call('POST', '/api/auth/register', { username: n, email: n.toLowerCase() + '@e.com', password: 'Clave-Segura-77' })).j.token;
    const T1 = await reg('Rank_1'), T2 = await reg('Rank_2'), T3 = await reg('Rank_3'), T4 = await reg('Rank_4');
    const g = new Bot('Invitado', { rk: 1 }); ok((await g.connect(0)).t === 'err', 'un invitado no puede jugar el clasificatorio (necesita cuenta)');
    const rz = new Bot('Rz', { rk: 1, mode: 'zona', acct: T1 }); const rzr = await rz.connect(0); ok(rzr.t === 'err' && /Duelo/.test(rzr.m), 'el clasificatorio solo existe en Duelo por equipos');
    const st1 = (await call('GET', '/api/ranked', null, T1)).j; ok(st1.me.mmr === 1000 && st1.me.league === 'Bronce' && st1.season.id === 1 && st1.season.daysLeft >= 29, 'cuenta nueva: 1000 puntos, liga Bronce, temporada 1 (' + st1.season.daysLeft + ' días)');
    await adm('POST', '/ranked/set', { username: 'Rank_4', mmr: 1950 });
    const r1 = new Bot('x', { rk: 1, acct: T1 }), r2 = new Bot('x', { rk: 1, acct: T2 }), r4 = new Bot('x', { rk: 1, acct: T4 });
    const w1 = await r1.connect(0), w2 = await r2.connect(0), w4 = await r4.connect(0);
    ok(w1.rk === 1 && w2.room === w1.room && w4.room !== w1.room, 'emparejamiento por liga: Rank_1 y Rank_2 (Bronce) comparten sala; Rank_4 (Élite) va a otra (' + w4.room + ' ≠ ' + w1.room + ')');
    await until(() => r1.pos && r2.pos); ok(await kill(r1, r2, 'gun'), 'Rank_1 elimina a Rank_2'); r4.close();
    await call('POST', '/api/admin/rooms/action', { id: w1.room, action: 'end' }, AT);
    ok(await until(() => r1.has('rank') && r2.has('rank')), 'al terminar reciben su nueva puntuación'); const k1r = r1.last('rank'), k2r = r2.last('rank');
    ok(k1r.delta > 0 && k2r.delta < 0 && k1r.mmr === 1000 + k1r.delta && k2r.mmr === 1000 + k2r.delta, 'el ganador sube (+' + k1r.delta + ') y el perdedor baja (' + k2r.delta + '); primeras partidas = colocación');
    const s1 = (await call('GET', '/api/ranked', null, T1)).j; ok(s1.me.mmr === k1r.mmr && s1.me.games === 1 && s1.me.wins === 1, 'queda guardado en la cuenta (1 partida, 1 victoria)');
    /* abandono */
    r1.close(); r2.close(); await sleep(500);
    const l1 = new Bot('x', { rk: 1, acct: T3 }), l2 = new Bot('x', { rk: 1, acct: T1 }), l3 = new Bot('x', { rk: 1, acct: T2 }); await l1.connect(0); await l2.connect(0); await l3.connect(0); await sleep(2000);
    const mmr3 = (await call('GET', '/api/ranked', null, T3)).j.me.mmr; l1.close(); await sleep(600);
    const m3 = (await call('GET', '/api/ranked', null, T3)).j.me; ok(m3.mmr === mmr3 - S.RANKED.LEAVE_PENALTY && m3.games === 1, 'abandonar una partida clasificatoria en marcha resta ' + S.RANKED.LEAVE_PENALTY + ' puntos y cuenta como partida'); l2.close(); l3.close();
    /* temporada */
    const before1 = (await call('GET', '/api/me', null, T1)).j.profile.credits, me1 = (await call('GET', '/api/ranked', null, T1)).j.me;
    ok((await adm('POST', '/ranked/close', {})).status === 400, 'cerrar la temporada exige confirmación explícita');
    const cl = await adm('POST', '/ranked/close', { confirm: true }); ok(cl.status === 200 && cl.j.closed === 1 && cl.j.players >= 2, 'el administrador cierra la temporada 1 (' + cl.j.players + ' jugadores con premio)');
    const s2 = (await call('GET', '/api/ranked', null, T1)).j, lg = S.LEAGUES[S.leagueIdx(me1.peak)];
    ok(s2.season.id === 2 && s2.me.games === 0 && s2.me.mmr === Math.round(1000 + (me1.mmr - 1000) * 0.5), 'empieza la temporada 2 con reinicio suave (' + me1.mmr + ' → ' + s2.me.mmr + ')');
    ok(s2.reward && s2.reward.league === lg.n && s2.reward.cr === lg.cr && (await call('GET', '/api/me', null, T1)).j.profile.credits === before1 + lg.cr, 'recibe el premio de su mejor liga (' + lg.n + ': ' + lg.cr + ' CR)');
    ok(s2.badges.length === 1 && s2.badges[0].s === 1 && s2.badges[0].l === lg.n, 'y una insignia de la temporada 1 en su perfil');
    ok((await call('POST', '/api/ranked/ack', {}, T1)).status === 200 && (await call('GET', '/api/ranked', null, T1)).j.reward === null, 'el aviso del premio se descarta al verlo');
    ok((await call('GET', '/api/ranked', null, T4)).j.me.games === 0 && (await adm('GET', '/ranked')).j.history[0].id === 1, 'quien no jugó no cobra nada y el cierre queda en el historial del panel');

    /* ---------- Espectador ---------- */
    console.log('\n-- Espectador');
    const p1 = new Bot('Jug1'), p2 = new Bot('Jug2'); const pw = await p1.connect(2); await p2.connect(2); await until(() => p1.pos && p2.pos);
    const noadm = new Bot('x', { spec: 1, room: pw.room, adm: 'token-falso' }); ok((await noadm.connect(2)).t === 'err', 'sin ser administrador no se puede espectar');
    const sp = new Bot('x', { spec: 1, room: pw.room, adm: AT }); const sw = await sp.connect(2);
    ok(sw.spec === 1 && sw.players.length === 2 && sw.room === pw.room, 'el administrador entra como espectador y ve a los 2 jugadores');
    ok(await until(() => sp.has('snap')) && await until(() => sp.has('sstats'), 3000), 'recibe las posiciones y, cada segundo, las estadísticas de cada jugador');
    const ss = sp.last('sstats'); ok(ss.p.length === 2 && ss.p[0].length === 9, 'con disparos, aciertos, cabezas, correcciones, cadencia sospechosa y ping por jugador');
    ok(((await adm('GET', '/players')).j.players || []).length === 2, 'el espectador no cuenta como jugador');
    p1.send({ t: 'chat', m: 'hola' }); sp.send({ t: 'chat', m: 'no deberia' }); await sleep(300); ok(!p1.has('chat', m => m.n === 'Espectador'), 'y no puede escribir en el chat');
    const nope = new Bot('x', { spec: 1, room: 9999, adm: AT }); ok((await nope.connect(2)).t === 'err', 'una sala que no existe se rechaza'); [p1, p2, sp].forEach(b => b.close());
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
