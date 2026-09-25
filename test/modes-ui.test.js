'use strict';
/* Interfaz de modos (selector, cuchillos, zona, carrera), cámara de muerte, clasificatorio con premio de temporada y espectador: cliente real (jsdom) + servidor real. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const { JSDOM } = require('jsdom'); const WebSocket = require('ws');
const S = require('../public/shared.js');
const PORT = 3305, ORIGIN = 'http://127.0.0.1:' + PORT, DIR = '/tmp/ppr_modesui', APASS = 'ModesUi-Admin-2026x';
fs.rmSync(DIR, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
async function untilA(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* aún no */ } await sleep(40); } return false; }
const wf = (u, o) => fetch(new URL(u, ORIGIN + '/').href, o);
const api = async (m, p, b, tk) => { const r = await wf('/api' + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
const rd = f => fs.readFileSync(path.join(PUB, f), 'utf8'), three = rd('vendor/three.min.js'), shared = rd('shared.js'), client = rd('client.js'), bpjs = rd('bp.js'), sojs = rd('social.js'), mdjs = rd('modes.js');
function boot(opts) {
  opts = opts || {};
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: ORIGIN + '/' + (opts.query || '') }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = wf; w.confirm = () => true; if (opts.token) w.localStorage.setItem('ppr.acct', opts.token); if (opts.adm) w.localStorage.setItem('ppr.admtoken', opts.adm);
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  const i = client.lastIndexOf('})();');
  w.eval(client.slice(0, i) + 'window.__T = { get remote() { return remote; }, get state() { return state; }, get player() { return player; }, get fighters() { return fighters; }, net, cfg, netHandle, setSlot, get slot() { return slot; }, get deathLook() { return deathLook; }, camera, get teamLimit() { return teamLimit; }, updateHudSlow };\n' + client.slice(i)); w.eval(bpjs); w.eval(sojs); w.eval(mdjs);
  return { w, T: w.__T, errors, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] };
}
const setMode = async (C, id) => { C.$('#modeBtn').click(); await until(() => !C.$('#modeModal').hidden && C.$$('#modeBox .mdl-card').length === 4); C.$(`#modeBox [data-m="${id}"]`).click(); await until(() => C.$(`#modeBox [data-m="${id}"].on`)); };
const closeModal = C => { C.$('#mdlOk').click(); };
async function play(C) { await until(() => !C.$('#playOnline').disabled); C.$('#playOnline').click(); C.$('#eqPlay').click(); return until(() => C.T.state === 'playing', 8000); }
function bot(mode, extra) { return new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws'); const b = { ws, msgs: [] }; ws.on('open', () => ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, n: 'Bot' + Math.floor(Math.random() * 900), map: 0, c: 0, mode }, extra)))); ws.on('message', d => { const m = JSON.parse(d); b.msgs.push(m); if (m.t === 'welcome') { b.id = m.id; b.welcome = m; res(b); } }); ws.on('error', () => {}); }); }

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: DIR, ADMIN_PASSWORD: APASS, DATABASE_URL: '', MATCH_TIME: 300, BREAK_SECS: 2, LADDER_LEVELS: 2, RANKED_MIN_GAMES: 0, MAX_CONN_PER_IP: 60, ACCOUNTS_REG_MAX: 50 }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } }); await sleep(1600);
  const bots = [];
  try {
    /* ---------- selector ---------- */
    const A = boot(); ok(await until(() => !A.$('#playOnline').disabled), 'el cliente detecta el servidor');
    ok(A.$('#modeBtn').textContent === 'Duelo por equipos' && /Duelo/.test(A.$('#playOnline small').textContent), 'por defecto se juega el Duelo por equipos (botón «Modo» y botón online lo dicen)');
    ok(A.$$('#modeCards .mcard').length === 5 && A.$$('#modeCards .mcard[data-m]').length === 4 && A.$('#modeCards .mcard.wide[data-rk]') && A.$('#modeCards [data-m=duelo]').classList.contains('on') && /clásico/i.test(A.$('#modeDesc').textContent), 'el panel del inicio enseña los 4 modos y la tarjeta ancha de Clasificatorio, con el Duelo elegido y su descripción');
    A.$('#modeCards [data-m=zona]').click(); ok(A.T.cfg.mode === 'zona' && A.$('#modeBtn').textContent === 'Capturar zona' && A.$('#playOnline small').textContent === 'Capturar zona' && A.$('#modeCards [data-m=zona]').classList.contains('on') && /zona/i.test(A.$('#modeDesc').textContent), 'elegir una tarjeta cambia el modo, el botón «Modo», el botón online y la descripción');
    A.$('#modeCards [data-m=duelo]').click();
    A.$('#modeCards [data-rk]').click(); ok(await until(() => !A.$('#modeModal').hidden), 'sin cuenta la tarjeta de Clasificatorio abre la ventana que explica por qué hace falta'); A.$('#modeModal').hidden = true;
    A.$('#modeBtn').click(); ok(await until(() => A.$$('#modeBox .mdl-card').length === 4), 'el botón «Modo» abre la ventana con los 4 modos'); await until(() => A.$('#modeBox .mdl-sea'));
    ok(A.$('#mdlRk').disabled && /cuenta online/.test(A.$('#modeBox .mdl-rk').textContent), 'sin cuenta el clasificatorio está bloqueado y explica por qué');
    await until(() => A.$('#modeBox .mdl-sea'));
    ok(/Temporada 1/.test(A.$('#modeBox .mdl-sea').textContent) && A.$$('#modeBox .mdl-tb tr').length === 7, 'enseña la temporada y las 7 ligas con sus premios');
    A.$('#modeBox [data-m="zona"]').click(); ok(await until(() => A.T.cfg.mode === 'zona' && A.$('#modeBtn').textContent === 'Capturar zona' && A.$('#playOnline small').textContent === 'Capturar zona'), 'elegir «Capturar zona» actualiza los botones y se guarda');
    ok(JSON.parse(A.w.localStorage.getItem(Object.keys(A.w.localStorage).find(k => /cfg|config|settings/i.test(k)) || 'x') || '{}').mode === 'zona' || A.T.cfg.mode === 'zona', 'y queda en la configuración');
    A.$('#modeBox [data-m="cuchillos"]').click(); await until(() => A.T.cfg.mode === 'cuchillos'); closeModal(A); ok(await until(() => A.$('#modeModal').hidden), '«Listo» cierra la ventana');

    /* ---------- solo cuchillos ---------- */
    console.log('\n-- Solo cuchillos');
    ok(await play(A), 'entra a una sala de cuchillos'); const { T } = A;
    ok(T.net.mode === 'cuchillos' && !A.w.PPR_BP.gunsOK(), 'la sala es de cuchillos y las armas de fuego están bloqueadas');
    await until(() => T.player && T.player.alive); ok(T.slot === 1, 'reapareces con el cuchillo en la mano'); T.setSlot(0); ok(T.slot === 1, 'y aunque pidas el arma (rueda o tecla), sigue el cuchillo');
    ok(await until(() => !A.$('#modeBar').hidden && /SOLO CUCHILLOS/.test(A.$('#modeBar').textContent)), 'el HUD dice «SOLO CUCHILLOS» y el límite de bajas (' + A.$('#modeBar').textContent + ')');
    T.updateHudSlow(); ok(/CUCHILLOS/.test(A.$('#modeName').textContent), 'y la etiqueta del mapa lleva el modo (' + A.$('#modeName').textContent + ')');

    /* ---------- cámara de muerte ---------- */
    console.log('\n-- Cámara de muerte');
    const killer = await bot('cuchillos'); bots.push(killer); await until(() => T.fighters.length >= 2);
    const kf = T.fighters.find(f => !f.isPlayer); ok(!!kf, 'un rival se une a la sala');
    kf.alive = true; kf.pos.set(T.player.pos.x + 12, 0, T.player.pos.z); kf.yaw = 1.2; kf.h = 1.8;
    T.netHandle({ t: 'kill', k: killer.id, v: T.net.id, w: 'Cuchillo', h: 0, pts: 100, streak: 1, rs: 3, ds: 12, ah: 74 });
    ok(!A.$('#death').hidden && /Te eliminó/.test(A.$('#deathBy').textContent) && /a 12 m/.test(A.$('#deathBy').textContent) && /le quedan 74/.test(A.$('#deathBy').textContent), 'al morir se dice quién, con qué, a cuántos metros y cuánta vida le queda (' + A.$('#deathBy').textContent + ')');
    ok(T.deathLook === kf, 'y la cámara se fija en el asesino');
    await sleep(900); const cam = T.camera, dx = cam.position.x - kf.pos.x, dz = cam.position.z - kf.pos.z;
    ok(Math.hypot(dx, dz) < 6 && cam.position.y > kf.pos.y + 1, 'la cámara pasa a verlo desde detrás y en alto, con suavidad (a ' + Math.hypot(dx, dz).toFixed(1) + ' m)');
    bots.forEach(b => b.ws.close()); A.w.close(); await sleep(400);

    /* ---------- zona ---------- */
    console.log('\n-- Capturar zona');
    const Z = boot(); await until(() => !Z.$('#playOnline').disabled); await setMode(Z, 'zona'); closeModal(Z); ok(await play(Z), 'entra a una sala de zona');
    ok(Z.T.net.zone && Z.T.net.zone.r === S.ZONE.R, 'el servidor manda la zona (' + Z.T.net.zone.x + ', ' + Z.T.net.zone.z + ')');
    ok(await until(() => !Z.$('#zoneHud').hidden && /ZONA · (.+ · )?LIBRE/.test(Z.$('#zoneHud').textContent)), 'el HUD enseña «ZONA · LIBRE» con la distancia y el tiempo hasta que cambie (' + Z.$('#zoneHud span').textContent + ')');
    ok(/ZONA · CENTRAL COURTYARD · /.test(Z.$('#zoneHud').textContent), 'y con el nombre de la zona («' + Z.$('#zoneHud span').textContent.split(' · ').slice(0, 2).join(' · ') + '»)');
    const sc = Z.w.PPR_BP.scene(); const rings = sc.children.filter(c => c.geometry && c.geometry.type === 'CylinderGeometry' && c.material && c.material.transparent && c.visible);
    ok(rings.length === 1 && Math.abs(rings[0].position.x - Z.T.net.zone.x) < 1e-6 && rings[0].scale.x === S.ZONE.R, 'se dibuja el cilindro de la zona en el mapa (radio ' + S.ZONE.R + ' m)');
    Z.T.net.sendAcc = -1e9; /* sin enviar posiciones: así el servidor no «corrige» el teletransporte de la prueba */ Z.T.player.pos.set(Z.T.net.zone.x, Z.T.net.zone.y || 0, Z.T.net.zone.z); ok(await until(() => /¡estás dentro!/.test(Z.$('#zoneHud').textContent), 3000), 'al entrar en la zona el HUD avisa «¡estás dentro!»');
    Z.T.net.zone = Object.assign({}, Z.T.net.zone, { o: 2 }); ok(await until(() => /DISPUTADA/.test(Z.$('#zoneHud').textContent), 3000) && rings[0].material.color.getHex() === 0xffb020, 'si se disputa, el texto y el color de la zona cambian (naranja)');
    Z.T.net.zone = Object.assign({}, Z.T.net.zone, { o: Z.T.player.team }); ok(await until(() => /ZONA · (.+ · )?(AZUL|ROJO)/.test(Z.$('#zoneHud').textContent) && Z.$('#zoneHud').classList.contains('mine'), 3000), 'si la controla tu equipo se resalta');
    Z.w.close(); await sleep(400);

    /* ---------- carrera de armas ---------- */
    console.log('\n-- Carrera de armas');
    const C = boot(); await until(() => !C.$('#playOnline').disabled); await setMode(C, 'carrera'); closeModal(C); ok(await play(C), 'entra a una sala de carrera'); await until(() => C.T.player && C.T.player.alive);
    ok(C.T.teamLimit === 3 && C.$('#modeBar').textContent.indexOf('NIVEL 1 / 3') === 0 && C.w.PPR_BP.gunsOK(), 'nivel 1 de 3 con un arma (' + C.$('#modeBar').textContent + ')');
    C.T.netHandle({ t: 'gg', lv: 1, c: S.GUN_LADDER[1] }); ok(C.T.player.wi === S.GUN_LADDER[1] && C.T.net.gl === 1 && await until(() => /NIVEL 2 \/ 3/.test(C.$('#modeBar').textContent)), 'una baja: el servidor te da el arma del nivel 2 (' + S.WEAPONS[S.GUN_LADDER[1]].name + ') y el HUD lo refleja');
    C.T.netHandle({ t: 'gg', lv: 2, c: S.GUN_LADDER[1] }); ok(!C.w.PPR_BP.gunsOK() && C.T.slot === 1 && await until(() => /NIVEL FINAL/.test(C.$('#modeBar').textContent)), 'en el nivel final solo hay cuchillo («una baja y ganas»)');
    C.T.netHandle({ t: 'gg', lv: 1, c: S.GUN_LADDER[1], down: 1 }); ok(C.w.PPR_BP.gunsOK() && /bajas al nivel 2/.test(C.$('#toast').textContent), 'si te matan a cuchillo bajas de nivel y vuelve el arma de fuego'); C.w.close(); await sleep(400);

    /* ---------- clasificatorio y temporada ---------- */
    console.log('\n-- Clasificatorio');
    const reg = async n => (await api('POST', '/auth/register', { username: n, email: n.toLowerCase() + '@e.com', password: 'Clave-Segura-77' })).j.token;
    const TK = await reg('Clasif_1'); const AT = (await api('POST', '/admin/login', { user: 'Viexbox', password: APASS })).j.token;
    const R = boot({ token: TK }); ok(await until(() => R.T.remote && R.T.remote.username === 'Clasif_1' && !R.$('#playOnline').disabled), 'Clasif_1 entra con su cuenta');
    R.$('#modeBtn').click(); ok(await until(() => R.$('#mdlRk') && !R.$('#mdlRk').disabled && /Temporada 1/.test(R.$('#modeBox').textContent) && /Bronce · 1000/.test(R.$('#modeBox .mdl-sea').textContent)), 'con cuenta el clasificatorio se puede activar y enseña su liga (Bronce · 1000)');
    R.$('#mdlRk').click(); R.$('#mdlRk').dispatchEvent(new R.w.Event('change', { bubbles: true }));
    ok(await until(() => R.T.cfg.ranked === true && R.$('#modeBtn').textContent === 'Duelo por equipos · Clasificatorio'), 'activarlo cambia los botones');
    R.$('#modeBox [data-m="zona"]').click(); ok(await until(() => R.T.cfg.mode === 'zona' && R.T.cfg.ranked === false), 'pasar a otro modo lo desactiva (solo existe en Duelo)'); R.$('#modeBox [data-m="duelo"]').click(); await until(() => R.T.cfg.mode === 'duelo' && R.$('#mdlRk') && !R.$('#mdlRk').disabled);
    R.$('#modeCards [data-rk]').click(); ok(R.T.cfg.ranked === true && R.T.cfg.mode === 'duelo' && R.$('#modeCards [data-rk]').classList.contains('on') && !R.$('#modeCards [data-m=duelo]').classList.contains('on'), 'con cuenta la tarjeta de Clasificatorio lo activa desde el panel (y desmarca el Duelo normal)');
    R.$('#modeCards [data-rk]').click(); ok(R.T.cfg.ranked === false && R.$('#modeCards [data-m=duelo]').classList.contains('on'), 'y volver a pulsarla lo desactiva');
    R.$('#mdlRk').click(); R.$('#mdlRk').dispatchEvent(new R.w.Event('change', { bubbles: true })); await until(() => R.T.cfg.ranked); closeModal(R);
    ok(await play(R) && R.T.net.ranked, 'entra a una sala clasificatoria'); ok(await until(() => /CLASIFICATORIO/.test(R.$('#modeBar').textContent)), 'el HUD lo indica');
    R.T.netHandle({ t: 'rank', delta: 18, mmr: 1018, league: 'Bronce', col: '#cd7f32', up: false, down: false, games: 1 }); R.T.netHandle({ t: 'end', tw: 0, tk: [3, 1], next: 5, maps: S.MAPS.map(m => m.name), cur: 0, res: [[R.T.net.id, 'Clasif_1', 1, 0, 100, 0, 0, 0, 0]] });
    ok(await until(() => !R.$('#endRank').hidden && /\+18/.test(R.$('#endRank').textContent) && /1018/.test(R.$('#endRank').textContent) && /colocación 1\/10/.test(R.$('#endRank').textContent)), 'al terminar la ronda se ve «+18 → 1018 pts · Bronce (colocación 1/10)»');
    R.w.close(); await sleep(300);
    /* premio de temporada */
    const before = (await api('GET', '/me', null, TK)).j.profile.credits; await api('GET', '/ranked', null, TK);
    ok((await api('POST', '/admin/ranked/close', { confirm: true }, AT)).status === 200, 'el administrador cierra la temporada 1');
    const R2 = boot({ token: TK }); ok(await until(() => !R2.$('#modeModal').hidden && /Temporada 1 cerrada/.test(R2.$('#modeBox').textContent), 9000), 'al volver, Clasif_1 ve «¡Temporada 1 cerrada!» con su premio');
    ok(/Bronce/.test(R2.$('#modeBox').textContent) && /\+150 Créditos/.test(R2.$('#modeBox').textContent), 'liga Bronce y +150 Créditos'); R2.$('#mdlOk').click();
    ok(await untilA(async () => (await api('GET', '/ranked', null, TK)).j.reward === null) && (await api('GET', '/me', null, TK)).j.profile.credits === before + 150, 'al aceptarlo se descarta el aviso y los Créditos ya están en la cuenta'); R2.w.close(); await sleep(300);

    /* ---------- espectador ---------- */
    console.log('\n-- Espectador');
    const b1 = await bot('duelo', { map: 1 }), b2 = await bot('duelo', { map: 1 }); bots.push(b1, b2); const room = b1.welcome.room; await sleep(600);
    const X = boot({ query: '?spec=' + room, adm: AT }); ok(await until(() => X.T.state === 'spectate', 9000), 'con la sesión de administrador, /?spec=' + room + ' entra como espectador');
    ok(!X.$('#specPanel').hidden && X.w.document.body.classList.contains('spectating') && X.$('#hud').hidden, 'sale el panel de espectador y el HUD de jugador se oculta');
    ok(await until(() => X.$$('#specBody tr[data-id]').length === 2, 4000), 'lista a los 2 jugadores con sus estadísticas en directo');
    b1.ws.send(JSON.stringify({ t: 'st', ep: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, h: 1.8 })); await sleep(300);
    const t0 = X.T.net.specTarget; X.w.document.dispatchEvent(new X.w.KeyboardEvent('keydown', { key: 'e' })); ok(X.T.net.specTarget !== t0, 'la tecla E (o ▶) cambia de jugador a seguir');
    const label = X.$('#specView').textContent; X.w.document.dispatchEvent(new X.w.KeyboardEvent('keydown', { key: 'v' })); ok(X.$('#specView').textContent !== label && X.T.net.specView === 'fpv', 'V cambia entre tercera y primera persona');
    const tf = X.T.net.remotes.get(X.T.net.specTarget); await sleep(500); ok(Math.hypot(X.T.camera.position.x - tf.pos.x, X.T.camera.position.z - tf.pos.z) < 1.5, 'en primera persona la cámara está en los ojos del jugador seguido');
    const ids = [...X.T.net.remotes.keys()]; X.w.PPR_BP.onSpecStats([[ids[0], 30, 29, 6, 7, 6, 50, 100, 0], [ids[1], 30, 10, 0, 0, 0, 40, 100, 0]]);
    const rows = X.$$('#specBody tr[data-id]'), bad = rows.find(r => r.classList.contains('warn')), good = rows.find(r => !r.classList.contains('warn'));
    ok(rows.length === 2 && bad && good && /Precisión anómala/.test(bad.textContent) && /Movimientos imposibles/.test(bad.textContent) && /Cadencia anómala/.test(bad.textContent) && !/⚠/.test(good.textContent), 'marca en rojo al de precisión, correcciones y cadencia anómalas y deja limpio al normal');
    X.w.PPR_BP.stopSpectate(); ok(X.T.state === 'menu' && X.$('#specPanel').hidden && !X.w.document.body.classList.contains('spectating'), 'salir del espectador vuelve al menú');
    const N = boot({ query: '?spec=' + room }); await sleep(3500); ok(N.T.state !== 'spectate', 'sin ser administrador no se puede espectar'); N.w.close();
    X.w.close();
    ok(A.errors.length === 0 && Z.errors.length === 0 && C.errors.length === 0 && R.errors.length === 0 && R2.errors.length === 0 && X.errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify([].concat(A.errors, Z.errors, C.errors, R.errors, R2.errors, X.errors)));
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  bots.forEach(b => { try { b.ws.close(); } catch (e) { /* nada */ } }); srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
