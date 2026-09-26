'use strict';
/* Eventos temporales: modo destacado semanal, eventos del administrador, tope de multiplicadores y premios reales de una partida. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js'); const { createEvents, weekOf, ROTATION } = require('../server/events.js');
const PORT = 3350, D = '/tmp/ppr_events', B = 'http://127.0.0.1:' + PORT, APASS = 'Ev-Admin-2026xyz';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let ipn = 10; const ip = () => '10.9.6.' + (ipn++);
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
const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };


(async () => {
  /* ---------- lógica pura ---------- */
  console.log('=== Reglas ===');
  const routes = {}; const stub = (env, into) => createEvents({ S, accounts: { http: { send() {} } }, admin: { addRoutes: r => Object.assign(into || {}, r), audit() {} }, dataDir: fs.mkdtempSync('/tmp/ev_'), log() {}, env: env || {} });
  const ev = stub({}, routes), MON = Date.UTC(2026, 0, 5), WEEK = 7 * 86400000;
  ok(ROTATION.join() === 'zona,cuchillos,carrera,duelo' && [0, 1, 2, 3, 4, 5].map(i => ev.featuredMode(MON + i * WEEK)).join() === 'zona,cuchillos,carrera,duelo,zona,cuchillos', 'el modo destacado rota cada semana: zona → cuchillos → carrera → duelo → zona…');
  ok(ev.featuredMode(MON + WEEK - 1) === 'zona' && ev.featuredMode(MON + WEEK) === 'cuchillos' && ev.featuredMode(MON - 1) === 'duelo', 'el cambio es exactamente el lunes a las 00:00 UTC (también antes de la fecha de referencia)');
  const f = ev.featured(MON + 3 * 86400000); ok(f.mode === 'zona' && f.px === 1.5 && f.cr === 1.5 && f.startsAt === MON && f.endsAt === MON + WEEK && /50 %/.test(f.desc) && /Capturar zona/.test(f.name), 'el evento destacado: +50 % de PX y Créditos, de lunes a lunes, con su descripción');
  ok(stub({ EVENT_FEATURED_MULT: '1' }).featured(MON) === null && stub({ EVENT_FEATURED_MULT: '1' }).active(MON).length === 0, 'EVENT_FEATURED_MULT=1 desactiva el modo destacado');
  let m = ev.multFor({ mode: 'zona', cls: 0 }, MON); ok(m.px === 1.5 && m.cr === 1.5 && m.names.length === 1, 'jugando al modo destacado se multiplica ×1,5');
  m = ev.multFor({ mode: 'duelo', cls: 0 }, MON); ok(m.px === 1 && m.cr === 1 && m.names.length === 0, 'en otro modo no cambia nada');
  const start = b => routes['POST /events/start']({ b, s: { user: 'admin' } }), stop = id => routes['POST /events/stop']({ b: { id }, s: { user: 'admin' } });
  ok(start({ name: 'x', px: 2, cr: 1, hours: 1 }).code === 400 && start({ name: 'Bueno', mode: 'inventado', px: 2, cr: 1, hours: 1 }).code === 400 && start({ name: 'Bueno', px: 4, cr: 1, hours: 1 }).code === 400 && start({ name: 'Bueno', px: 0.5, cr: 1, hours: 1 }).code === 400 && start({ name: 'Bueno', px: 1, cr: 1, hours: 1 }).code === 400 && start({ name: 'Bueno', px: 2, cr: 1, hours: 0 }).code === 400 && start({ name: 'Bueno', px: 2, cr: 1, hours: 9999 }).code === 400 && start({ name: 'Bueno', cls: 99, px: 2, cr: 1, hours: 1 }).code === 400, 'se rechazan nombres cortos, modos y armas inventados, multiplicadores fuera de 1–3, eventos sin bonificación y duraciones absurdas');
  const e1 = start({ name: '<b>Doble</b> de cuchillos', mode: 'cuchillos', px: 2, cr: 2, hours: 2 }); ok(e1.ok && e1.event.mode === 'cuchillos' && e1.event.px === 2 && e1.event.endsAt - Date.now() > 3600000, 'un evento válido se crea (modo, multiplicadores y duración)');
  ok(!/[<>]/.test(e1.event.name), 'y el nombre se limpia (sin < ni >)');
  const now = Date.now(); m = ev.multFor({ mode: 'cuchillos', cls: 0 }, now); const feat = ev.featured(now), fm = feat && feat.mode === 'cuchillos' ? 1.5 : 1;
  ok(m.px === Math.min(3, 2 * fm) && m.cr === Math.min(3, 2 * fm) && ev.multFor({ mode: 'zona', cls: 0 }, now).px === (feat && feat.mode === 'zona' ? 1.5 : 1), 'el evento solo cuenta en su modo (×2' + (fm > 1 ? ' × el destacado, con tope ×3' : '') + ')');
  const e2 = start({ name: 'Solo francotiradores', cls: [3], px: 2, cr: 1, hours: 1 }); { const t2 = Date.now(), p3 = ev.multFor({ mode: 'duelo', cls: 3 }, t2).px, p0 = ev.multFor({ mode: 'duelo', cls: 0 }, t2).px;   /* [CORREGIDO] la hora de DESPUÉS de crear el evento: con la de antes, si pasaba 1 ms, el evento aún no había empezado */ ok(p3 >= 2 && p3 >= p0 * 2 - 1e-9 && p0 < p3, 'un evento por arma solo cuenta con esa arma (Lince ×' + p3 + ' frente a otra arma ×' + p0 + ', cualquier día de la semana)'); }   // [CORREGIDO] el fin de semana ya da ×2 a todas: se compara con el mismo día, no con un número fijo
  const e3 = start({ name: 'Mega', px: 3, cr: 3, hours: 1 }); ok(ev.multFor({ mode: 'cuchillos', cls: 3 }, now).px === 3 && ev.multFor({ mode: 'cuchillos', cls: 3 }, now).cr === 3, 'varios eventos a la vez se multiplican pero con un tope de ×3 (2 × 2 × 3 = 12 → 3)');
  ok(start({ name: 'Cuarto', px: 2, cr: 1, hours: 1 }).ok && start({ name: 'Quinto', px: 2, cr: 1, hours: 1 }).ok && start({ name: 'Sexto', px: 2, cr: 1, hours: 1 }).code === 400, 'como mucho 5 eventos del administrador a la vez');
  ok(stop(e3.event.id).ok && stop(e3.event.id).code === 404 && stop(9999).code === 404, 'terminar un evento lo quita (y no se puede terminar dos veces)');
  ok(routes['GET /events']().next.map(n => n.mode).join() === [1, 2, 3, 4].map(i => ev.featuredMode(Date.now() + i * WEEK)).join() && routes['GET /events']().active.length >= 4, 'el panel ve el calendario de las próximas 4 semanas y los eventos activos');

  /* ---------- servidor ---------- */
  console.log('\n=== Servidor ===');
  fs.rmSync(D, { recursive: true, force: true });
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: D, ADMIN_PASSWORD: APASS, DATABASE_URL: '', MATCH_TIME: 300, BREAK_SECS: 2, HISTORY_MIN_SECS: 1, MAX_CONN_PER_IP: 60, ACCOUNTS_REG_MAX: 50, KNIFE_KILL_LIMIT: 1 }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } }); await sleep(1700);
  try {
    const AT = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token, adm = (m2, p, b2) => call(m2, '/api/admin' + p, b2, AT);
    const pub = async () => (await call('GET', '/api/events')).j;
    let j = await pub(); const fm2 = ev.featuredMode(Date.now()); ok(j.ok && j.events.length === 1 && j.events[0].mode === fm2 && j.events[0].auto && j.events[0].px === 1.5 && j.events[0].endsAt > j.now, 'la ruta pública enseña el modo destacado de esta semana (' + fm2 + ') sin necesidad de sesión');
    ok((await call('POST', '/api/admin/events/start', { name: 'Intruso', px: 3, cr: 3, hours: 1 })).status === 401 && (await call('GET', '/api/admin/events')).status === 401, 'solo el administrador crea eventos o mira el panel');
    ok((await adm('POST', '/events/start', { name: 'Mal', px: 9, cr: 1, hours: 1 })).status === 400, 'y el servidor aplica las mismas validaciones');
    const t0 = await adm('POST', '/events/start', { name: 'Efímero', px: 2, cr: 1, hours: 0.001 }); ok(t0.status === 200 && (await pub()).events.some(e => e.name === 'Efímero'), 'un evento recién lanzado aparece en la ruta pública');
    await sleep(4200); ok(!(await pub()).events.some(e => e.name === 'Efímero') && (await adm('GET', '/events')).j.custom.some(e => e.name === 'Efímero'), 'caduca solo al acabar su duración y queda en el historial del panel');
    ok((await adm('GET', '/audit')).j.audit.some(a => a.action === 'evento-crear'), 'crear eventos queda en la auditoría');

    /* ---------- premios reales ---------- */
    console.log('\n-- Premios en una partida real');
    const reg = async n => (await call('POST', '/api/auth/register', { username: n, email: n.toLowerCase() + '@e.com', password: 'Clave-Segura-77' })).j.token;
    const TA = await reg('Evento_1'), TB = await reg('Evento_2');
    const expected = (points, evs, mode) => { let px = 1, cr = 1; for (const e of evs) if (!e.mode || e.mode === mode) { px *= e.px; cr *= e.cr; } return { px: Math.min(3, px), cr: Math.min(3, cr) }; };
    const round = async () => {
      const a = new Bot('EvA', { mode: 'cuchillos', acct: TA }), c = new Bot('EvB', { mode: 'cuchillos', acct: TB }); await a.connect(0); await c.connect(0); await until(() => a.pos && c.pos);
      const killed = await kill(a, c, 'knife'), done = await until(() => a.has('award') && a.has('end'), 9000); const out = { killed, done, award: a.last('award'), end: a.last('end'), id: a.id, cls: 0 }; a.close(); c.close(); await sleep(600); return out;
    };
    const r1 = await round(); const evs1 = (await pub()).events; const pts1 = r1.end && r1.end.res.find(x => x[0] === r1.id)[4];
    ok(r1.killed && r1.done && pts1 > 0, 'ronda 1 (solo con el modo destacado): baja a cuchillo y fin de ronda (' + pts1 + ' puntos)');
    let ex = expected(pts1, evs1, 'cuchillos'); ok(r1.award.cr === Math.round(S.crFor(pts1, true) * ex.cr) && r1.award.px === Math.round(S.pxFor(pts1, true, 0) * ex.px), 'los premios de la ronda 1 cuadran: ' + r1.award.px + ' PX y ' + r1.award.cr + ' CR (multiplicador de Créditos ×' + ex.cr + ')');
    ok(Array.isArray(r1.award.ev) && r1.award.ev.length === evs1.filter(e => !e.mode || e.mode === 'cuchillos').length, 'el mensaje de premio dice qué eventos se aplicaron (' + JSON.stringify(r1.award.ev) + ')');
    await adm('POST', '/events/start', { name: 'Finde de cuchillos', mode: 'cuchillos', px: 2, cr: 3, hours: 1 }); const evs2 = (await pub()).events;
    const r2 = await round(); const pts2 = r2.end && r2.end.res.find(x => x[0] === r2.id)[4]; ex = expected(pts2, evs2, 'cuchillos');
    ok(r2.killed && r2.done && r2.award.ev.includes('Finde de cuchillos'), 'ronda 2 (con el evento «Finde de cuchillos»): el premio menciona el evento');
    ok(r2.award.cr === Math.round(S.crFor(pts2, true) * ex.cr) && r2.award.px === Math.round(S.pxFor(pts2, true, 0) * ex.px) && ex.cr === 3, 'y se multiplica de verdad: ' + r2.award.px + ' PX y ' + r2.award.cr + ' CR (×' + ex.px + ' PX, ×' + ex.cr + ' CR, con el tope de ×3)');
    const me = (await call('GET', '/api/me', null, TA)).j.profile; ok(me.credits === r1.award.cr + r2.award.cr && r2.award.crBalance === me.credits, 'los Créditos de la cuenta suman los dos premios (' + me.credits + ')');
    const id = (await adm('GET', '/events')).j.active.find(e => e.name === 'Finde de cuchillos').id; ok((await adm('POST', '/events/stop', { id })).status === 200, 'el administrador termina el evento');
    const r3 = await round(); const pts3 = r3.end && r3.end.res.find(x => x[0] === r3.id)[4]; const ex3 = expected(pts3, (await pub()).events, 'cuchillos');
    ok(r3.killed && r3.done && !r3.award.ev.includes('Finde de cuchillos') && r3.award.cr === Math.round(S.crFor(pts3, true) * ex3.cr), 'ronda 3 (evento terminado): vuelve a la bonificación normal (×' + ex3.cr + ' CR)');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
