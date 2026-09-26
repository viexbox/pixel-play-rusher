'use strict';
/* Roles en el juego (cliente real en jsdom + servidor real): nombre dorado del administrador, tic azul, efecto dorado de las bajas,
   chat moderado, avisos, reportes, código de influencer y recompensas por rango. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
const PORT = 3171, ORIGIN = 'http://127.0.0.1:' + PORT, WSU = 'ws://127.0.0.1:' + PORT + '/ws', DATA = '/tmp/ppr_roles_test', PASS = 'Roles-Prueba-2026x';
fs.rmSync(DATA, { recursive: true, force: true });
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: DATA, ADMIN_PASSWORD: PASS, MATCH_TIME: 120, KILL_LIMIT: 99, HISTORY_MIN_SECS: 1, MAX_CONN_PER_IP: 30 }), stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(20); } return false; }
const api = async (m, p, body, tk) => { const r = await fetch(ORIGIN + '/api/admin' + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
class Bot {
  constructor(name, extra) { this.name = name; this.extra = extra || {}; this.msgs = []; this.pos = null; this.ep = 0; this.players = {}; }
  connect() { return new Promise(res => { this.ws = new WebSocket(WSU); this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: 0, c: 0 }, this.extra))); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; m.players.forEach(p => { this.players[p.id] = p; }); res(m); } if (m.t === 'join') this.players[m.p.id] = m.p; if (m.t === 'spawn') { if (m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; } } if (m.t === 'err') res(m); }); this.ws.on('error', () => {}); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  sendState() { this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.sendState(); await sleep(50); } }
}
const world = S.buildWorld(0);
const los = (a, b) => { const o = { x: a.x, y: 1.6, z: a.z }, d = { x: b.x - a.x, y: -0.5, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; };
async function approach(bot, tgt) { for (let r = 6; r <= 12; r += 3) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r; if (Math.abs(x) > 56 || Math.abs(z) > 56 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; if (los({ x, z }, tgt)) { await bot.walkTo(x, z); return true; } } return false; }

const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
function boot(url, withServer) {
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = withServer ? (u, o) => fetch(new URL(u, ORIGIN + '/').href, { cache: o && o.cache }) : () => Promise.reject(new Error('sin servidor'));
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared);
  const i = client.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  w.eval(client.slice(0, i) + 'window.__T = { get state() { return state; }, get player() { return player; }, get fighters() { return fighters; }, net, cfg, goldFx, step, showTab, renderRanks, store, K, krTotal, unlocked, chatSend, openReport, setPauseTexts, RANKS, tierOf, netHandle, renderMenuStats };\n' + client.slice(i));
  return { w, T: w.__T, errors, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] };
}
(async () => {
  await sleep(900);
  try {
    const T0 = (await api('POST', '/login', { user: 'Viexbox', password: PASS })).j.token;
    const KEY = (await api('POST', '/influencers/add', { name: 'ProGamer' }, T0)).j.key;

    /* ---------- Administrador dentro del juego ---------- */
    const A = boot(ORIGIN + '/', true); const { T, $, $$, w } = A;
    ok(await until(() => !$('#playOnline').disabled), 'el cliente detecta el servidor');
    w.localStorage.setItem('ppr.admtoken', T0);
    $('#name').value = 'Cualquiera'; $('#playOnline').click(); $('#eqPlay').click();
    ok(await until(() => T.state === 'playing' && T.player && T.player.alive), 'entra en la partida online con la sesión del administrador');
    ok(T.player.name === 'Viexbox' && T.player.rl === 'admin', 'el servidor le pone el nombre «Viexbox» y el rol de administrador (aunque escribiera otro nombre)');
    T.step(0.05); await sleep(700);
    ok(A.$('#hud').innerHTML.includes('rl-admin') && A.$('#liveRows').innerHTML.includes('vt'), 'la clasificación en vivo muestra el nombre dorado neón con el tic azul');
    const cssOk = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'); ok(/\.rl-admin\{color:#ffd54a[^}]*text-shadow:[^}]*#ffb400/.test(cssOk) && /@keyframes goldn/.test(cssOk), 'el estilo .rl-admin es dorado con brillo neón animado');

    /* ---------- Otros jugadores: influencer con tic azul, normal sin nada ---------- */
    const rival = new Bot('Rival'); const rm = await rival.connect(); let inf, mi;   // los equipos son aleatorios y no hay fuego amigo: el influencer debe ser del equipo contrario al rival
    for (let n = 0; n < 10; n++) { inf = new Bot('x', { inf: KEY }); mi = await inf.connect(); if (mi.tm !== rm.tm) break; inf.ws.close(); await sleep(150); }
    ok(mi.rl === 'inf', 'el influencer entra con su clave');
    await until(() => [...T.net.remotes.values()].some(f => f.name === 'ProGamer') && [...T.net.remotes.values()].some(f => f.name === 'Rival'));
    const remotes = [...T.net.remotes.values()]; const fi = remotes.find(f => f.name === 'ProGamer'), fr = remotes.find(f => f.name === 'Rival');
    ok(fi.rl === 'inf' && !fr.rl && fi.label && fr.label, 'el cliente distingue: ProGamer (influencer) y Rival (normal), cada uno con su etiqueta 3D');
    await sleep(700); const liveHtml = A.$('#liveRows').innerHTML;
    ok(/rl-admin">ProGamer<\/span><svg class="vt"/.test(liveHtml) && /class="pn">Rival<\/span>/.test(liveHtml) && !/Rival<\/span><svg/.test(liveHtml), 'en la tabla, el influencer (verificado) lleva nombre dorado y tic azul; el jugador normal, nombre azul sin tic');

    /* ---------- Efecto dorado en las bajas de influencers ---------- */
    await until(() => inf.pos && rival.pos); await sleep(1700); const tp = { x: rival.pos.x, z: rival.pos.z };
    ok(await approach(inf, tp), 'el influencer se coloca con línea de visión'); const before = T.goldFx.length; let seen = false, gold = false;
    const mon = setInterval(() => { if (T.goldFx.length > before) seen = true; if ($$('#feed li.gold').length) gold = true; }, 15);
    for (let i = 0; i < 14 && !inf.msgs.some(m => m.t === 'kill'); i++) { const dx = tp.x - inf.pos.x, dz = tp.z - inf.pos.z, dy = -0.5, l = Math.hypot(dx, dy, dz); inf.send({ t: 'shoot', o: [inf.pos.x, 1.6, inf.pos.z], d: [[dx / l, dy / l, dz / l]] }); await sleep(120); }
    await until(() => seen && gold, 3000); clearInterval(mon);
    ok(seen, 'la baja del influencer dispara el efecto dorado neón (anillo, destello y rayo de luz)'); ok(gold, 'y aparece resaltada en dorado en el registro de bajas');
    await sleep(1000); T.step(0.1); ok(T.goldFx.length === 0, 'el efecto se limpia solo (sin fugas de memoria)');
    ok(!A.$$('#feed li.gold').some(li => /Rival/.test(li.textContent) && li.classList.contains('mine')), 'la baja de un jugador normal no tiene efecto dorado');

    /* ---------- Baja del propio administrador ---------- */
    ok(A.$$('#goldflash').length === 1, 'existe la capa de destello dorado en pantalla');
    T.net.remotes.get(rival.id).alive = true; T.netHandle({ t: 'kill', kr: 'admin', k: T.net.id, v: rival.id, w: 'Sheriff', pts: 100, h: true, streak: 1, rs: 3 });
    ok($('#killcard').classList.contains('gold') && /Rival/.test($('#killcard').textContent) && $('#goldflash').classList.contains('on'), 'cuando el administrador elimina a alguien: tarjeta de baja dorada y destello en pantalla');
    ok(T.goldFx.length >= 3 && $$('#feed li.gold.mine').length >= 1, 'y también el anillo, el destello y el rayo de luz en el mapa');

    /* ---------- Chat: roles, borrado y avisos ---------- */
    inf.send({ t: 'chat', m: 'hola desde el influencer' });
    ok(await until(() => $$('#chatLog li.from-inf').some(li => /hola desde el influencer/.test(li.textContent) && li.querySelector('.vt'))), 'el chat muestra al influencer con su tic azul');
    let r = await api('POST', '/chat/say', { text: 'Mensaje del dueño', scope: 'all' }, T0);
    ok(await until(() => $$('#chatLog li.from-admin').some(li => /Mensaje del dueño/.test(li.textContent) && li.querySelector('.rl-admin') && li.querySelector('.vt'))), 'el chat muestra al administrador con el nombre dorado neón y el tic azul');
    const mid = (await api('GET', '/chat/recent', null, T0)).j.chat.find(c => c.text === 'hola desde el influencer').id;
    await api('POST', '/chat/delete', { id: mid }, T0); ok(await until(() => !$$('#chatLog li').some(li => /hola desde el influencer/.test(li.textContent))), 'un mensaje borrado por la moderación desaparece del chat');
    await api('POST', '/announce', { text: 'Torneo a las 20:00' }, T0); ok(await until(() => $('#notice').classList.contains('on') && /Torneo/.test($('#notice').textContent)) && $$('#chatLog li.sys').some(li => /Torneo/.test(li.textContent)), 'los anuncios del servidor salen como banner y en el chat');
    await api('POST', '/player/action', { name: 'Viexbox', action: 'warn' }, T0); // el administrador no es sancionable
    const cli = (await api('GET', '/players', null, T0)).j.players.find(p => p.name === 'Rival'); await api('POST', '/player/action', { name: 'Rival', action: 'warn', reason: 'buen juego' }, T0);
    ok(rival.msgs.some(m => m.t === 'notice' && m.kind === 'warn'), 'los avisos oficiales llegan al jugador señalado');

    /* ---------- Reportes desde el juego ---------- */
    T.setPauseTexts('round'); ok(A.$('#reportBtn').hidden === false, 'en línea, el menú de pausa ofrece «Reportar jugador»');
    T.openReport(); ok(!$('#reportModal').hidden && $$('#repTarget option').some(o => o.textContent === 'Rival'), 'el formulario lista a los jugadores de la sala');
    $$('#repTarget option').find(o => o.textContent === 'Rival').selected = true; $('#repCat').value = 'trampas'; $('#repText').value = 'apunta sospechosamente bien';
    $('#reportForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    ok(await until(() => /Reporte enviado/.test($('#repMsg').textContent)), 'el jugador envía el reporte y recibe confirmación');
    T.chatSend('/reportar ProGamer insultos en el chat'); ok(await until(() => $$('#chatLog li.sys').filter(li => /Reporte enviado/.test(li.textContent)).length >= 2), 'también funciona con el comando /reportar nombre motivo');
    r = await api('GET', '/reports', null, T0); console.log('   reportes:', JSON.stringify(r.j.reports.map(x => [x.reporter, x.target, x.cat]))); ok(r.j.reports.length === 2 && r.j.reports.some(x => x.target === 'Rival' && x.cat === 'trampas' && x.reporter === 'Viexbox') && r.j.reports.some(x => x.target === 'ProGamer'), 'el panel de administración recibe ambos reportes');

    /* ---------- Código de influencer en Ajustes ---------- */
    const B = boot(ORIGIN + '/', true); await until(() => !B.$('#playOnline').disabled);
    B.$('#infKey').value = KEY.toLowerCase(); B.$('#infKey').dispatchEvent(new B.w.Event('change'));
    ok(B.T.cfg.infKey === KEY && B.w.localStorage.getItem('voltarena.v1.cfg').includes(KEY), 'el código de influencer se guarda (en mayúsculas) en los ajustes');
    B.$('#name').value = 'Cualquiera2'; B.$('#playOnline').click(); B.$('#eqPlay').click(); ok(await until(() => B.T.state === 'playing' && B.T.player), 'entra en partida');
    ok(B.T.player.rl === 'inf' && B.T.player.name === 'ProGamer', 'con su código, el influencer entra verificado y con su nombre reservado');
    const C = boot(ORIGIN + '/', true); await until(() => !C.$('#playOnline').disabled); C.$('#name').value = 'ProGamer'; C.$('#playOnline').click(); C.$('#eqPlay').click();
    ok(await until(() => /reservado/.test(C.$('#netMsg') ? C.$('#netMsg').textContent : '') || C.T.state !== 'playing' && /reservado/.test(C.w.document.body.textContent)), 'sin código, nadie puede entrar con el nombre de un influencer (el juego muestra el motivo)');

    ok(A.errors.length + B.errors.length + C.errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify([...A.errors, ...B.errors, ...C.errors]));

    /* ---------- Rangos y recompensas (sin servidor) ---------- */
    const R = boot('https://ejemplo.test/', false); await sleep(250);
    R.T.store.set(R.T.K.stats, { games: 5, kills: 30, wins: 1, streak: 0, points: 6000, best: 900 });
    R.T.showTab('ranks'); await sleep(50);
    ok(R.$$('#ranksBox .tier').length === 6 && /Oro/.test(R.$('#ranksBox .rankhead').textContent) && R.$$('#ranksBox [data-claim]').length === 3, 'pestaña Rangos: 6 rangos, con 6.000 puntos eres Oro y hay 3 recompensas por reclamar');
    const kr0 = R.T.krTotal(); R.$('#ranksBox [data-claim="2"]').click();
    ok(R.T.krTotal() === kr0 + 400 && R.T.unlocked().includes(11) && R.T.cfg.rankClaimed.includes(2), 'reclamar Oro: +400 KR y se desbloquea su color exclusivo, «Oro»');   // [RANGOS] antes daba Violeta, que también se vende en la tienda
    ok(R.$$('#ranksBox [data-claim]').length === 2 && /Reclamado/.test(R.$$('#ranksBox .tier')[2].textContent), 'la recompensa reclamada no se puede repetir');
    R.$('#ranksBox [data-claim="2"]') && R.$('#ranksBox [data-claim="2"]').click(); ok(R.T.krTotal() === kr0 + 400, 'y no da KR dos veces');
    R.$$('#ranksBox [data-claim]').forEach(b => b.click()); ok(R.T.krTotal() === kr0 + 400 + 50 + 150, 'reclamar Bronce y Plata suma sus KR');
    R.T.renderRanks(); ok(/Platino/.test(R.$$('#ranksBox .tier')[3].textContent) && R.$$('#ranksBox .tier')[3].querySelector('.st') && /Bloqueado/.test(R.$$('#ranksBox .tier')[3].textContent), 'los rangos superiores siguen bloqueados');
    R.T.renderRanks(); ok(/ORO/.test(R.$('#lvlN').textContent) || (R.T.renderMenuStats(), /ORO/.test(R.$('#lvlN').textContent)), 'el menú muestra el rango junto al nivel («' + R.$('#lvlN').textContent + '»)');
    ok(R.errors.length === 0, 'sin errores de JavaScript en rangos ' + JSON.stringify(R.errors));
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  try { srv.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
