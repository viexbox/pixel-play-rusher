'use strict';
/* Administración del servidor (Viexbox): credenciales, roles, baneos, chat en vivo, reportes, historial y mantenimiento. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PORT = 3170, HTTP = 'http://127.0.0.1:' + PORT, WSU = 'ws://127.0.0.1:' + PORT;
const DATA = '/tmp/ppr_admin_test'; const PASS = 'Prueba-Clave-2026x', PASS2 = 'Otra-Clave-Nueva-77';
fs.rmSync(DATA, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(20); } return false; }
const procs = [];
process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
function start(env, port) {
  const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port || PORT, DATA_DIR: DATA, MATCH_TIME: 120, KILL_LIMIT: 2, BREAK_SECS: 2, HISTORY_MIN_SECS: 1 }, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; }); procs.push(p); return p;
}
let srv = start({ ADMIN_PASSWORD: PASS });
let ipn = 10; const nextIp = () => '10.9.8.' + (ipn++);
async function call(method, p, body, token, ip) {
  const r = await fetch(HTTP + '/api/admin' + p, { method, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip || '10.0.0.1' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ } return { status: r.status, j };
}
class Bot {
  constructor(name, extra, ip, map, cls) { this.name = name; this.extra = extra || {}; this.ip = ip || nextIp(); this.map = map == null ? 0 : map; this.cls = cls || 0; this.msgs = []; this.pos = null; this.ep = 0; this.id = null; this.players = {}; this.closed = false; }
  connect() {
    return new Promise(res => {
      this.ws = new WebSocket(WSU + '/ws', { headers: { 'X-Forwarded-For': this.ip } });
      this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: this.map, c: this.cls }, this.extra)));
      this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.on(m); if (m.t === 'welcome' || m.t === 'err') res(m); });
      this.ws.on('close', () => { this.closed = true; res(null); }); this.ws.on('error', () => {});
    });
  }
  on(m) {
    if (m.t === 'welcome') { this.id = m.id; this.role = m.rl; this.tm = m.tm; m.players.forEach(p => { this.players[p.id] = p; }); }
    if (m.t === 'join') this.players[m.p.id] = m.p;
    if (m.t === 'spawn') { if (m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; } else if (this.players[m.id]) Object.assign(this.players[m.id], { x: m.x, z: m.z }); }
    if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; }
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); }
  chat(t) { this.send({ t: 'chat', m: t }); }
  sendState() { this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.sendState(); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}
const world = S.buildWorld(0);
const los = (a, b) => { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: 1.1 - 1.6, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; };
async function approach(bot, tgt) { for (let r = 6; r <= 12; r += 3) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 38 || Math.abs(z) > 38 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; if (los({ x, z }, tgt)) { await bot.walkTo(x, z); return true; } } return false; }

(async () => {
  await sleep(1100);
  try {
    /* ---------- Credenciales ---------- */
    let r = await call('GET', '/overview'); ok(r.status === 401, 'la API de administración exige sesión (sin token → 401)');
    r = await call('POST', '/login', { user: 'Viexbox', password: 'incorrecta' }, null, '10.7.7.1'); ok(r.status === 401 && /incorrectos/.test(r.j.error), 'contraseña incorrecta → error genérico');
    r = await call('POST', '/login', { user: 'Otro', password: PASS }, null, '10.7.7.1'); ok(r.status === 401, 'otro usuario no puede entrar aunque sepa la contraseña');
    for (let i = 0; i < 5; i++) await call('POST', '/login', { user: 'Viexbox', password: 'x' + i }, null, '10.7.7.2');
    r = await call('POST', '/login', { user: 'Viexbox', password: PASS }, null, '10.7.7.2'); ok(r.status === 429, 'tras 5 intentos fallidos la IP queda bloqueada 5 min (' + (r.j && r.j.error) + ')');
    r = await call('POST', '/login', { user: 'viexbox', password: PASS }, null, '10.7.7.3'); const T = r.j && r.j.token;
    ok(r.status === 200 && T && T.length === 64 && r.j.user === 'Viexbox', 'acceso correcto del dueño (usuario Viexbox, token de sesión)');
    const adminFile = fs.readFileSync(path.join(DATA, 'admin.json'), 'utf8');
    ok(!adminFile.includes(PASS) && /"hash":"[0-9a-f]{128}"/.test(adminFile) && (fs.statSync(path.join(DATA, 'admin.json')).mode & 0o077) === 0, 'la contraseña se guarda solo como hash scrypt y el archivo es privado (600)');
    ok(!srv.out.includes(PASS), 'la contraseña no aparece en el registro del servidor');
    r = await call('GET', '/me', null, T); ok(r.j.user === 'Viexbox', 'sesión válida (/me)');
    let hp = await fetch(HTTP + '/admin'); const html = await hp.text();
    ok(hp.status === 200 && /Panel de administración/.test(html) && /noindex/.test(hp.headers.get('x-robots-tag') || ''), 'el panel se sirve en /admin (sin indexar)');

    /* ---------- Roles: administrador e influencers ---------- */
    const a1 = new Bot('Viexbox'); let m = await a1.connect();
    ok(m.t === 'err' && /reservado/.test(m.m) && await until(() => a1.closed), 'el nombre «Viexbox» está reservado: nadie puede usarlo sin la sesión de administrador');
    for (const n of ['V1exb0x', 'Viexbox_2', 'xViexboxx']) { const b = new Bot(n); const mm = await b.connect(); ok(mm && mm.t === 'err', 'variante «' + n + '» también rechazada'); }
    const fake = new Bot('Viexbox', { adm: 'a'.repeat(64) }); m = await fake.connect(); ok(m.t === 'err', 'un token de administrador falso no sirve');
    const p1 = new Bot('Pepe'); await p1.connect();
    const adm = new Bot('LoQueSea', { adm: T }); m = await adm.connect();
    ok(m.t === 'welcome' && m.rl === 'admin' && await until(() => p1.players[adm.id]), 'con la sesión del panel entra como administrador');
    ok(p1.players[adm.id].n === 'Viexbox' && p1.players[adm.id].rl === 'admin', 'el resto de jugadores lo ven como «Viexbox» con rol de administrador');
    r = await call('POST', '/influencers/add', { name: 'ProGamer', note: 'canal de pruebas' }, T); const KEY = r.j && r.j.key;
    ok(r.status === 200 && /^INF-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(KEY), 'se crea un influencer y se muestra su clave una sola vez (' + KEY + ')');
    await sleep(1800); ok(!fs.readFileSync(path.join(DATA, 'influencers.json'), 'utf8').includes(KEY), 'la clave no se guarda en claro (solo su huella)');
    r = await call('POST', '/influencers/add', { name: 'Viexbox2' }, T); ok(r.status === 400, 'no se puede crear un influencer con el nombre del administrador');
    r = await call('POST', '/influencers/add', { name: 'progamer' }, T); ok(r.status === 400, 'nombre de influencer repetido rechazado');
    const inf1 = new Bot('cualquiera', { inf: KEY }); m = await inf1.connect();
    ok(m.t === 'welcome' && m.rl === 'inf' && await until(() => p1.players[inf1.id] && p1.players[inf1.id].n === 'ProGamer' && p1.players[inf1.id].rl === 'inf'), 'con su clave, el influencer entra verificado y con su nombre');
    const imp = new Bot('ProGamer'); m = await imp.connect(); ok(m.t === 'err' && /reservado/.test(m.m), 'sin clave nadie puede usar el nombre del influencer');
    const badKey = new Bot('Normal1', { inf: 'INF-0000-0000-0000' }); m = await badKey.connect(); ok(m.t === 'welcome' && !m.rl, 'una clave falsa no da ningún rol (entra como jugador normal)');
    badKey.close();
    r = await call('GET', '/influencers', null, T); ok(r.j.influencers.length === 1 && !JSON.stringify(r.j).includes(KEY) && !JSON.stringify(r.j).includes('keyHash'), 'el listado no revela claves ni huellas');

    /* ---------- Combate: el rol viaja con las bajas y los disparos ---------- */
    p1.close(); inf1.close(); await sleep(200);
    let victim = new Bot('Victima'); await victim.connect();
    for (let n = 0; n < 8 && victim.tm === adm.tm; n++) { victim.close(); await sleep(150); victim = new Bot('Victima'); await victim.connect(); }   // los equipos se reparten al azar: el objetivo debe ser del equipo contrario (no hay fuego amigo)
    ok(victim.tm !== adm.tm, 'la víctima está en el equipo contrario al del administrador'); await until(() => victim.pos && adm.pos);
    const tpos = { x: victim.pos.x, z: victim.pos.z }; const found = await approach(adm, tpos);
    ok(found, 'el administrador se coloca con línea de visión'); await sleep(1700);
    const eye = () => ({ o: [adm.pos.x, 1.6, adm.pos.z], d: (() => { const dx = tpos.x - adm.pos.x, dz = tpos.z - adm.pos.z, dy = 1.1 - 1.6, l = Math.hypot(dx, dy, dz); return [dx / l, dy / l, dz / l]; })() });
    for (let i = 0; i < 14 && !victim.has('kill'); i++) { const e = eye(); adm.send({ t: 'shoot', o: e.o, d: [e.d] }); await sleep(120); }
    ok(await until(() => victim.has('kill', k => k.kr === 'admin' && k.k === adm.id)), 'la baja del administrador lleva su rol («kr: admin») para el efecto dorado');
    ok(victim.has('shot', s => s.rl === 'admin'), 'sus disparos también llevan el rol (trazadoras doradas)');

    /* ---------- Chat: filtro, modo lento, silencios y bloqueo ---------- */
    const wa = new WebSocket(WSU + '/admin-ws', { headers: { 'X-Forwarded-For': '10.0.0.9' } }); const feed = []; wa.on('message', d => feed.push(JSON.parse(d))); await new Promise(res => wa.on('open', res));
    wa.send(JSON.stringify({ t: 'auth', token: T })); ok(await until(() => feed.some(x => x.t === 'ready')), 'el panel se conecta al canal en directo (/admin-ws)');
    const badWs = new WebSocket(WSU + '/admin-ws', { headers: { 'X-Forwarded-For': '10.0.0.9' } }); await new Promise(res => badWs.on('open', res)); let closed = false; badWs.on('close', () => { closed = true; }); badWs.send(JSON.stringify({ t: 'auth', token: 'malo' })); ok(await until(() => closed), 'un token inválido no abre el canal en directo');
    const c1 = new Bot('Charla1'); await c1.connect(); const c2 = new Bot('Charla2'); await c2.connect(); await sleep(200);
    c1.chat('hola a todos'); ok(await until(() => c2.has('chat', x => x.m === 'hola a todos' && x.i > 0)) && await until(() => feed.some(x => x.t === 'chat' && x.msg.text === 'hola a todos' && x.msg.scope.startsWith('room:') && x.msg.name === 'Charla1')), 'el mensaje llega a la sala y aparece al instante en el panel (con sala y autor)');
    const mid = feed.find(x => x.t === 'chat' && x.msg.text === 'hola a todos').msg.id;
    r = await call('POST', '/chat/delete', { id: mid }, T); ok(r.status === 200 && await until(() => c1.has('chatdel', x => x.i === mid) && c2.has('chatdel', x => x.i === mid)), 'borrar un mensaje lo retira de la pantalla de los jugadores');
    await call('POST', '/settings', { words: ['tonto'], filterMode: 'mask', slowMs: 0 }, T); c1.chat('eres tonto'); ok(await until(() => c2.has('chat', x => x.m === 'eres *****')) && feed.some(x => x.t === 'chat' && x.msg.flagged && x.msg.text === 'eres tonto'), 'filtro «tapar»: la palabra sale como ***** y el panel ve el original marcado');
    await call('POST', '/settings', { filterMode: 'block' }, T); await sleep(50); c1.chat('otro tonto'); ok(await until(() => c1.has('notice', x => /palabras no permitidas/.test(x.m))) && !c2.has('chat', x => /otro/.test(x.m)), 'filtro «bloquear»: el mensaje no se envía y se avisa');
    await call('POST', '/settings', { words: [], filterMode: 'mask', slowMs: 3000 }, T); c2.chat('uno'); await sleep(100); c2.chat('dos'); await sleep(300);
    ok(c1.has('chat', x => x.m === 'uno') && !c1.has('chat', x => x.m === 'dos'), 'modo lento: el segundo mensaje seguido se descarta');
    await call('POST', '/settings', { slowMs: 0, chatLocked: true }, T); c2.chat('bloqueado?'); ok(await until(() => c2.has('notice', x => /desactivado/.test(x.m))) && !c1.has('chat', x => x.m === 'bloqueado?'), 'chat bloqueado: los jugadores no pueden escribir');
    r = await call('POST', '/chat/say', { text: 'Hola desde la administración', scope: 'all' }, T); ok(await until(() => c1.has('chat', x => x.m === 'Hola desde la administración' && x.rl === 'admin' && x.n === 'Viexbox')), 'el administrador habla desde el panel con su nombre dorado incluso con el chat bloqueado');
    await call('POST', '/settings', { chatLocked: false }, T);
    r = await call('POST', '/player/action', { name: 'Charla2', action: 'mute', minutes: 5, reason: 'spam' }, T); await sleep(60); c2.chat('sigo aquí'); ok(r.status === 200 && await until(() => c2.has('notice', x => /silenciado/.test(x.m))) && !c1.has('chat', x => x.m === 'sigo aquí'), 'silenciar a un jugador: no puede hablar y se le avisa');
    r = await call('POST', '/player/action', { name: 'Charla2', action: 'unmute' }, T); await sleep(60); c2.chat('ya puedo'); ok(await until(() => c1.has('chat', x => x.m === 'ya puedo')), 'quitar el silencio');
    await call('POST', '/player/action', { name: 'Charla1', action: 'warn', reason: 'cuidado con el lenguaje' }, T); ok(await until(() => c1.has('notice', x => x.kind === 'warn' && /cuidado/.test(x.m))), 'aviso oficial a un jugador');
    const lob = new WebSocket(WSU + '/ws', { headers: { 'X-Forwarded-For': nextIp() } }); const lobMsgs = []; lob.on('message', d => lobMsgs.push(JSON.parse(d))); await new Promise(res => lob.on('open', res)); lob.send(JSON.stringify({ t: 'lobby', n: 'Lobbista', inf: KEY })); await until(() => lobMsgs.some(x => x.t === 'lobbyok'));
    lob.send(JSON.stringify({ t: 'chat', m: 'buenas' })); ok(await until(() => lobMsgs.some(x => x.t === 'chat' && x.n === 'ProGamer' && x.rl === 'inf')) && feed.some(x => x.t === 'chat' && x.msg.scope === 'lobby' && x.msg.role === 'inf'), 'el chat del lobby también muestra el rol y llega al panel'); lob.close();

    /* ---------- Baneos ---------- */
    const troll = new Bot('Troll', {}, '10.5.5.5'); await troll.connect(); await until(() => troll.pos);
    r = await call('POST', '/player/action', { name: 'Troll', action: 'ban', minutes: 60, reason: 'insultos' }, T);
    ok(r.status === 200 && await until(() => troll.closed) && troll.has('err', x => /baneado/.test(x.m) && /insultos/.test(x.m)), 'banear a un jugador conectado: se le expulsa con el motivo');
    const t2 = new Bot('Troll', {}, '10.6.6.6'); m = await t2.connect(); ok(m.t === 'err' && /baneado/.test(m.m), 'no puede volver a entrar con ese nombre');
    const t3 = new Bot('Otro', {}, '10.5.5.5'); m = await t3.connect(); ok(m.t === 'err' && /baneado/.test(m.m), 'ni con otro nombre desde la misma IP (baneo por IP anonimizada)');
    r = await call('GET', '/bans', null, T); const ban = r.j.bans.find(b => b.type === 'name'); ok(r.j.bans.length === 2 && ban.until > Date.now() && !JSON.stringify(r.j).includes('10.5.5.5'), 'lista de baneos con caducidad; la IP real no se guarda ni se muestra');
    for (const b of r.j.bans) await call('POST', '/bans/remove', { id: b.id }, T);
    const t4 = new Bot('Troll', {}, '10.5.5.5'); m = await t4.connect(); ok(m.t === 'welcome', 'al levantar el baneo puede volver a entrar'); t4.close();
    r = await call('POST', '/bans/add', { type: 'name', value: 'Viexbox' }, T); ok(r.status === 400, 'el administrador no se puede banear');
    r = await call('POST', '/player/action', { name: 'Viexbox', action: 'kick' }, T); ok(r.status === 400, 'ni expulsar ni sancionar al administrador');

    /* ---------- Reportes ---------- */
    const rep1 = new Bot('Acusador'); await rep1.connect(); await sleep(150); const culpable = Object.values(rep1.players).find(p => p.n === 'Charla1');
    rep1.send({ t: 'report', id: culpable.id, cat: 'insultos', text: 'me insulta en el chat' });
    ok(await until(() => rep1.has('reportok', x => x.ok)) && await until(() => feed.some(x => x.t === 'report' && x.report.target === 'Charla1')), 'un jugador reporta a otro y el panel lo recibe en directo');
    rep1.send({ t: 'report', id: culpable.id, cat: 'trampas', text: 'de nuevo' }); ok(await until(() => rep1.msgs.filter(x => x.t === 'reportok').length === 2 && rep1.msgs.filter(x => x.t === 'reportok')[1].ok === false), 'no se puede reportar dos veces al mismo jugador seguidas');
    rep1.send({ t: 'report', id: rep1.id, cat: 'otro', text: 'yo' }); ok(await until(() => rep1.msgs.filter(x => x.t === 'reportok').length === 3 && !rep1.msgs.filter(x => x.t === 'reportok')[2].ok), 'tampoco a uno mismo');
    r = await call('GET', '/reports', null, T); const rp = r.j.reports[0];
    ok(rp.target === 'Charla1' && rp.reporter === 'Acusador' && rp.cat === 'insultos' && rp.status === 'open' && Array.isArray(rp.chat) && rp.chat.length > 0 && rp.stats && typeof rp.stats.k === 'number', 'el reporte guarda motivo, estadísticas del acusado y las últimas líneas del chat');
    r = await call('POST', '/reports/update', { id: rp.id, status: 'actioned', note: 'aviso dado' }, T); ok(r.j.report.status === 'actioned' && r.j.report.note === 'aviso dado', 'se puede marcar como «acción tomada» y anotar');
    r = await call('GET', '/reports/players', null, T); ok(r.j.players[0].name === 'Charla1' && r.j.players[0].reports === 1, 'ranking de jugadores problemáticos');

    /* ---------- Historial y análisis ---------- */
    const cheat = new Bot('Tramposo'); await cheat.connect(); await until(() => cheat.pos);
    for (let i = 0; i < 6; i++) { cheat.pos.x += 30; cheat.sendState(); await sleep(60); cheat.pos = { x: cheat.pos.x, y: 0, z: cheat.pos.z }; await sleep(40); }
    ok(await until(() => cheat.msgs.filter(x => x.t === 'fix').length >= 6), 'seis teletransportes imposibles corregidos por el servidor');
    r = await call('POST', '/rooms/action', { id: (await call('GET', '/players', null, T)).j.players.find(p => p.name === 'Tramposo').room, action: 'end' }, T); ok(r.status === 200, 'terminar la ronda desde el panel');
    await sleep(500);
    r = await call('GET', '/history?name=Tramposo', null, T); ok(r.j.history.length >= 1 && r.j.history[0].fixes >= 6 && r.j.history[0].name === 'Tramposo', 'el historial guarda la partida con métricas (disparos, aciertos, correcciones)');
    r = await call('GET', '/history?name=Viexbox', null, T); ok(r.j.history.length >= 1 && r.j.history[0].k >= 1 && r.j.history[0].shots >= 1 && r.j.history[0].hits >= 1, 'las bajas del administrador quedan en el historial con precisión');
    r = await call('GET', '/analysis', null, T); const an = r.j.players.find(p => p.name === 'Tramposo'); ok(an && an.flags.some(f => /Movimientos imposibles/.test(f)) && an.score >= 10, 'análisis de comportamiento: marca al jugador con movimientos imposibles (' + (an && an.flags.join(' | ')) + ')');

    /* ---------- Estadísticas generales ---------- */
    r = await call('GET', '/overview', null, T); const o = r.j;
    ok(o.online >= 4 && o.totals.joins >= 8 && o.totals.messages >= 5 && o.totals.matches >= 2 && o.totals.reports === 1 && o.totals.bans >= 2 && o.perMap['0'] >= 3 && o.series.length >= 1 && o.top.length >= 0 && o.mem.rss > 0 && o.uniques24h >= 5, 'panel de estadísticas: jugadores, entradas, mensajes, partidas, reportes, baneos, mapas y series (' + o.online + ' en línea, ' + o.totals.joins + ' entradas, ' + o.uniques24h + ' únicos)');

    /* ---------- Mantenimiento ---------- */
    r = await call('POST', '/announce', { text: 'Reinicio esta noche' }, T); ok(await until(() => c1.has('notice', x => x.kind === 'announce' && x.m === 'Reinicio esta noche')), 'anuncio global a todos los jugadores');
    r = await call('POST', '/maintenance', { on: true, message: 'Volvemos en 10 minutos', kickNow: true }, T);
    ok(await until(() => c1.closed && c2.closed), 'modo mantenimiento con «expulsar ahora»: se cierra a los jugadores');
    const late = new Bot('Tarde'); m = await late.connect(); ok(m.t === 'err' && /Volvemos en 10 minutos/.test(m.m), 'en mantenimiento nadie nuevo puede entrar');
    const adm2 = new Bot('x', { adm: T }); m = await adm2.connect(); ok(m.t === 'welcome' && m.rl === 'admin', 'el administrador sí puede entrar en mantenimiento'); adm2.close();
    await call('POST', '/maintenance', { on: false }, T); const back = new Bot('Vuelvo'); m = await back.connect(); ok(m.t === 'welcome', 'al desactivar el mantenimiento se puede entrar de nuevo');
    r = await call('POST', '/shutdown', { seconds: 600, restart: true }, T); const sv = await call('GET', '/server', null, T); ok(sv.j.shutdown && sv.j.node && sv.j.cpus > 0 && sv.j.dataBytes > 0, 'apagado programado y datos del servidor (Node ' + sv.j.node + ', ' + sv.j.cpus + ' CPU)');
    r = await call('POST', '/shutdown/cancel', {}, T); ok(r.j.ok && !(await call('GET', '/server', null, T)).j.shutdown, 'se puede cancelar el apagado');
    r = await call('POST', '/kickall', {}, T); ok(await until(() => back.closed) && r.j.kicked >= 1, 'expulsar a todos');
    r = await call('GET', '/backup', null, T); ok(r.status === 200 && r.j.version === 1 && Array.isArray(r.j.leaderboard) && r.j.reports.list.length === 1 && !JSON.stringify(r.j).includes('"hash"'), 'copia de seguridad descargable (sin credenciales)');
    r = await call('POST', '/leaderboard/reset', { confirm: 'no' }, T); ok(r.status === 400, 'vaciar la clasificación exige escribir BORRAR');
    r = await call('POST', '/leaderboard/reset', { confirm: 'BORRAR' }, T); ok(r.status === 200, 'vaciar la clasificación con confirmación');
    r = await call('GET', '/logs', null, T); ok(r.j.logs.length > 0 && !r.j.logs.join('\n').includes(PASS), 'registro del servidor visible en el panel (sin contraseñas)');
    r = await call('GET', '/audit', null, T); const acts = r.j.audit.map(a => a.action); ok(['login', 'influencer-crear', 'jugador-ban', 'chat-borrar', 'mantenimiento-on', 'anuncio', 'reporte-actioned'].every(a => acts.includes(a)), 'la auditoría anota todas las acciones del administrador');
    r = await call('POST', '/password', { current: 'mal', next: PASS2 }, T); ok(r.status === 401, 'cambiar contraseña: exige la actual');
    r = await call('POST', '/password', { current: PASS, next: 'corta1' }, T); ok(r.status === 400, 'cambiar contraseña: la nueva debe ser larga (12+) con letras y números');
    const T2 = (await call('POST', '/login', { user: 'Viexbox', password: PASS }, null, '10.7.7.4')).j.token;
    r = await call('POST', '/password', { current: PASS, next: PASS2 }, T); ok(r.status === 200 && (await call('GET', '/me', null, T2)).status === 401 && (await call('GET', '/me', null, T)).status === 200, 'contraseña cambiada: las demás sesiones se cierran');
    ok((await call('POST', '/login', { user: 'Viexbox', password: PASS }, null, '10.7.7.5')).status === 401 && (await call('POST', '/login', { user: 'Viexbox', password: PASS2 }, null, '10.7.7.5')).status === 200, 'la contraseña antigua deja de valer');
    r = await call('POST', '/logout', {}, T); ok((await call('GET', '/me', null, T)).status === 401, 'cerrar sesión invalida el token');

    /* ---------- Persistencia tras reiniciar ---------- */
    for (const b of [adm, victim, c1, c2, rep1, cheat, back, late]) b.close(); wa.close(); await sleep(200);
    srv.kill('SIGTERM'); await sleep(500); srv = start({});
    await sleep(1100); const T3 = (await call('POST', '/login', { user: 'Viexbox', password: PASS2 }, null, '10.7.7.6')).j.token;
    ok(!!T3 && !srv.out.includes('CUENTA DE ADMINISTRADOR CREADA'), 'tras reiniciar, la misma contraseña sigue valiendo y no se crea otra cuenta');
    ok((await call('GET', '/reports', null, T3)).j.reports.length === 1 && (await call('GET', '/history?name=Tramposo', null, T3)).j.history.length >= 1 && (await call('GET', '/influencers', null, T3)).j.influencers.length === 1, 'reportes, historial e influencers se conservan');
    const persist = new Bot('cualquiera', { inf: KEY }); m = await persist.connect(); ok(m.t === 'welcome' && m.rl === 'inf', 'la clave del influencer sigue funcionando tras reiniciar'); persist.close();
    srv.kill('SIGTERM'); await sleep(400);

    /* ---------- Cuenta inicial (sin ADMIN_PASSWORD) + lista de IP permitidas ---------- */
    fs.rmSync(DATA, { recursive: true, force: true }); const g = start({ ADMIN_ALLOWED_IPS: '10.1.1.1' }); await sleep(1300);
    ok(/Usuario:\s+Viexbox/.test(g.out) && /Contraseña inicial:\s+Viexbox-2026/.test(g.out) && /cambiarla/.test(g.out), 'sin ADMIN_PASSWORD, el servidor crea la cuenta con la contraseña inicial y avisa de que hay que cambiarla');
    r = await call('POST', '/login', { user: 'Viexbox', password: 'Viexbox-2026' }, null, '10.2.2.2'); ok(r.status === 403, 'ADMIN_ALLOWED_IPS: una IP no permitida no puede ni intentar entrar');
    r = await call('POST', '/login', { user: 'Viexbox', password: 'Viexbox-2026' }, null, '10.1.1.1'); ok(r.status === 200 && r.j.mustChange === true, 'la IP permitida entra con la contraseña inicial y el servidor exige cambiarla');
    g.kill('SIGTERM'); await sleep(300);

    /* ---------- Apagado programado real ---------- */
    fs.rmSync(DATA, { recursive: true, force: true }); const z = start({ ADMIN_PASSWORD: PASS }); await sleep(1100);
    const Tz = (await call('POST', '/login', { user: 'Viexbox', password: PASS }, null, '10.7.7.9')).j.token; let exited = null; z.on('exit', c => { exited = c; });
    await call('POST', '/shutdown', { seconds: 5, restart: true }, Tz); ok(await until(() => exited !== null, 9000) && exited === 0, 'el reinicio programado cierra el proceso limpiamente (para que pm2/Docker lo relancen)');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
