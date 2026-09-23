'use strict';
/* Pantalla de inicio (nombre, KR, eventos, personalización, chat) y aspecto elegido en línea. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const WebSocket = require('ws'); const { JSDOM } = require('jsdom'); const S = require('../public/shared.js');
const PORT = 3115, ORIGIN = 'http://127.0.0.1:' + PORT, WSURL = 'ws://127.0.0.1:' + PORT + '/ws';
fs.rmSync('/tmp/pixel_test_lobby', { recursive: true, force: true });
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, MATCH_TIME: 120, DATA_DIR: '/tmp/pixel_test_lobby' }), stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) {} });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const open = (first) => new Promise((res, rej) => { const ws = new WebSocket(WSURL); const b = { ws, msgs: [] }; ws.on('open', () => { ws.send(JSON.stringify(first)); res(b); }); ws.on('message', d => b.msgs.push(JSON.parse(d))); ws.on('error', rej); });
const has = (b, f) => b.msgs.some(f);

(async () => {
  await sleep(700);
  try {
    // --- servidor: chat del lobby y de la sala ---
    const l1 = await open({ t: 'lobby', n: 'Lola' }), l2 = await open({ t: 'lobby', n: 'Leo' });
    ok(await until(() => has(l1, m => m.t === 'lobbyok') && has(l2, m => m.t === 'lobbyok')), 'dos clientes entran en el chat del lobby');
    l1.ws.send(JSON.stringify({ t: 'chat', m: '  Hola <b>mundo</b>\u0007  ' }));
    ok(await until(() => has(l2, m => m.t === 'chat' && m.n === 'Lola' && m.m === 'Hola bmundo/b')), 'el mensaje del lobby llega a los demás, saneado (sin < >)');
    await sleep(800); const before = l2.msgs.filter(m => m.t === 'chat').length;
    l1.ws.send(JSON.stringify({ t: 'chat', m: 'a' })); l1.ws.send(JSON.stringify({ t: 'chat', m: 'b' })); l1.ws.send(JSON.stringify({ t: 'chat', m: 'c' }));
    await sleep(300); ok(l2.msgs.filter(m => m.t === 'chat').length - before === 1, 'límite de velocidad: 3 mensajes seguidos → solo pasa 1 (' + (l2.msgs.filter(m => m.t === 'chat').length - before) + ')');
    let st = await (await fetch(ORIGIN + '/api/status')).json(); ok(st.players === 0 && st.lobby === 2, 'estado: 0 jugadores en partida y 2 en el lobby');
    const long = await open({ t: 'lobby', n: 'X' }); await sleep(100); long.ws.send(JSON.stringify({ t: 'chat', m: 'x'.repeat(500) })); await sleep(200);
    ok(l2.msgs.some(m => m.t === 'chat' && m.n === 'X' && m.m.length === 120), 'los mensajes se recortan a 120 caracteres');

    // --- jugadores con aspecto elegido ---
    const p1 = await open({ t: 'hello', v: 1, n: 'Ana', map: 0, c: 3, lk: [6, 2] });
    ok(await until(() => has(p1, m => m.t === 'welcome')), 'jugador con aspecto entra en sala');
    const p2 = await open({ t: 'hello', v: 1, n: 'Beto', map: 0, c: 0, lk: [99, -5] });
    await until(() => has(p2, m => m.t === 'welcome'));
    const w2 = p2.msgs.find(m => m.t === 'welcome'), a = w2.players.find(p => p.n === 'Ana');
    ok(a && a.lk && a.lk[0] === 6 && a.lk[1] === 2, 'el aspecto (color, piel) llega a los demás jugadores');
    ok(has(p1, m => m.t === 'join' && m.p.n === 'Beto' && m.p.lk[0] === 15 && m.p.lk[1] === 0), 'valores de aspecto fuera de rango se corrigen (15, 0)');
    p1.ws.send(JSON.stringify({ t: 'chat', m: 'gg' }));
    ok(await until(() => has(p2, m => m.t === 'chat' && m.n === 'Ana' && m.m === 'gg') && has(p1, m => m.t === 'chat' && m.m === 'gg')), 'el chat de la sala llega a todos los de la sala');
    ok(!has(l2, m => m.t === 'chat' && m.m === 'gg'), 'el chat de la sala no se cuela en el lobby');
    st = await (await fetch(ORIGIN + '/api/status')).json(); ok(st.players === 2, 'estado: 2 jugadores en partida');

    // --- cliente real: pantalla de inicio ---
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: ORIGIN + '/' }); const w = dom.window;
    w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
    const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
    w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
    w.fetch = (u, o) => fetch(new URL(u, ORIGIN + '/').href, { cache: o && o.cache });
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'vendor', 'three.min.js'), 'utf8'));
    w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'shared.js'), 'utf8'));
    let c = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8'); const i = c.lastIndexOf('})();');
    c = c.slice(0, i) + 'window.__T = { get state() { return state; }, get player() { return player; }, get fighters() { return fighters; }, cfg, keys, step, COLORS, damage, setMouse(v) { mouseL = v; } };\n' + c.slice(i);
    const errors = []; w.addEventListener('error', e => errors.push(e.message)); w.eval(c);
    const T = w.__T, $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];

    ok(/Pixel Play Rusher/.test(w.document.title) && /PIXEL PLAY\s*RUSHER/i.test($('#brandTop .logo').textContent), 'la pantalla de inicio muestra el nombre «Pixel Play Rusher»');
    ok(/PIXEL PLAY\s*RUSHER/i.test($('#brandHud').textContent), 'el HUD de la partida incluye el nombre del juego');
    ok($('#lobbyTL #name') && $('#lobbyTL #krTotal') && $('#lobbyTL #stK'), 'arriba a la derecha: perfil, estadísticas del jugador y contador de PX');
    const tabs = $$('.nav button').map(b => b.dataset.tab).sort().join();
    ok($$('.nav button').length === 10 && tabs === 'controls,home,maps,market,pass,profile,rank,ranks,settings,store' && $$('#topNav button').length === 6 && $('#topNav button[data-tab=pass]') && $('#topNav button[data-tab=profile]') && $('#topNav button[data-tab=market]'), 'las 10 secciones siguen accesibles: 6 arriba en el centro y el resto en el perfil (Rangos, Mapas) y en la barra de abajo (Controles, Ajustes)');
    ok($('#lobbyNews #eventBox') && $('#lobbyNews #daily') && $('#lobbyNews #newsMap'), 'arriba a la izquierda: noticias (el mapa nuevo), evento de hoy y desafíos diarios');
    ok($('#lobbyPlay #serverBtn') && $('#lobbyPlay #onlineInfo') && $('#lobbyPlay #modeCards') && $('#lobbyPlay #modeBtn'), 'a la izquierda: servidor y modo de juego');
    ok($('#lobbyCenter .modebar #mapBtn') && $$('#lobbyCenter .modebar #diff button').length === 3, 'bajo los botones de jugar: mapa y dificultad de los bots');
    ok(!$('#lobbyEq'), 'ya no hay resumen de equipamiento en la lobby: el bando y el arma se eligen al entrar a partida');
    ok($('#lobbyCenter #playOnline') && $('#lobbyCenter #play') && $$('#lobbyCenter .mode').length === 2 && /ONLINE/.test($('#playOnline').textContent) && /ENTRENAR/.test($('#play').textContent), 'en el centro, bajo el título: botones ONLINE y ENTRENAR');
    ok($('#lobbyR #charView') && $('#lobbyR #classes') && $('#lobbyR #teamPick') && $('#lobbyR #swColors') && $('#lobbyR #swSkins'), 'cajón de antes de jugar: personaje, bando, armas y personalización');
    /* el cajón de antes de jugar */
    ok(!w.document.body.classList.contains('eqopen') && ($('#play').click(), w.document.body.classList.contains('eqopen')) && ($('#eqClose').click(), !w.document.body.classList.contains('eqopen')), '«Entrenar» abre el cajón de bando y arma, y ✕ lo cierra sin jugar');
    $('#play').click();
    { const c0 = T.cfg.cls, next = (c0 + 1) % S.WEAPONS.length; $$('#classes .cls')[next].click(); ok(T.cfg.cls === next && T.cfg.cls !== c0 && $$('#classes .cls')[next].getAttribute('aria-pressed') === 'true', 'al elegir otra arma en el cajón, queda guardada y marcada (' + S.WEAPONS[next].name + ')'); }
    ok($('#swColors .cs[aria-pressed="true"]').dataset.i == T.cfg.look.col, 'el color elegido queda marcado en el cajón');
    $('#eqClose').click();
    $('#newsMap').click(); ok(!$('#lobbyC').hidden && !$('#tab-maps').hidden && w.document.body.classList.contains('tabopen'), 'la noticia del mapa abre la sección Mapas'); $('#topNav button[data-tab=home]').click(); ok($('#lobbyC').hidden && !w.document.body.classList.contains('tabopen'), 'y «Inicio» la cierra');
    ok($('#chat #chatIn') && $('#chatIn').getAttribute('placeholder').length > 5, 'entrada de texto (chat)');
    ok($$('#classes .cls').length === S.WEAPONS.length && S.WEAPONS.length === 11 && $$('#classes .cls').some(e => /Vórtice/.test(e.textContent)) && $$('#classes .cls').some(e => /Centinela/.test(e.textContent)) && $$('#swColors .cs').length === COLORS_N(T) , 'equipamiento (11 clases, con la AK, el Vórtice y el Centinela) y colores listados');
    function COLORS_N(T) { return T.COLORS.length; }
    ok(/×\d/.test($('#eventBox').textContent) && $$('#daily li').length === 3, 'evento del día y 3 desafíos diarios');
    ok(await until(() => !$('#playOnline').disabled) && await until(() => /LOBBY/.test($('#chatCh').textContent), 4000), 'el chat del inicio se conecta al servidor (canal LOBBY)');
    ok(await until(() => $$('#chatLog li').some(li => /Chat del lobby conectado/.test(li.textContent))), 'aviso de conexión al chat del lobby');
    l1.ws.send(JSON.stringify({ t: 'chat', m: 'buenas desde el lobby' }));
    ok(await until(() => $$('#chatLog li').some(li => /Lola/.test(li.textContent) && /buenas desde el lobby/.test(li.textContent))), 'el cliente recibe mensajes del lobby');
    $('#chatIn').value = 'hola a todos'; $('#chatIn').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ok(await until(() => l2.msgs.some(m => m.t === 'chat' && m.m === 'hola a todos')), 'el cliente envía mensajes al lobby con Enter');

    // navegación
    ok($('#lobbyC').hidden === true, 'en «Inicio» no hay panel central');
    $('.nav button[data-tab="maps"]').click(); ok(!$('#lobbyC').hidden && !$('#tab-maps').hidden && $('#tab-rank').hidden, 'el menú abre la sección «Mapas»');
    $('.nav button[data-tab="settings"]').click(); ok(!$('#tab-settings').hidden && $('#tab-maps').hidden, 'el menú abre «Ajustes»');
    $('.nav button[data-tab="home"]').click(); ok($('#lobbyC').hidden, '«Inicio» vuelve a ocultar el panel');

    // personalización y KR
    const wKR = () => JSON.parse(w.localStorage.getItem('voltarena.v1.kr') || '0');
    const locked = $$('#swColors .cs.locked')[0], idx = +locked.dataset.i, cost = T.COLORS[idx].cost;
    locked.click(); ok(/Te faltan/.test($('#custMsg').textContent) && T.cfg.look.col !== idx, 'un color bloqueado sin KR suficientes no se puede elegir');
    w.localStorage.setItem('voltarena.v1.kr', String(cost + 40)); $$('#swColors .cs')[idx].click();
    ok(T.cfg.look.col === idx && wKR() === 40 && /Desbloqueado/.test($('#custMsg').textContent), 'con KR suficientes se desbloquea, se cobra (' + cost + ' KR) y se elige');
    ok(!$$('#swColors .cs')[idx].classList.contains('locked'), 'el color queda desbloqueado');
    $$('#swSkins .cs')[3].click(); ok(T.cfg.look.skin === 3, 'se elige el tono de piel');
    $$('#classes .cls')[3].click(); ok(T.cfg.cls === 3 && /Lince/.test($('#charTitle').textContent), 'se elige el Lince en el equipamiento');
    ok(JSON.parse(w.localStorage.getItem('voltarena.v1.cfg')).look.col === idx, 'la personalización se guarda');

    // partida contra bots hasta el final → KR y desafíos
    $('#play').click(); $('#eqPlay').click(); ok(T.state === 'playing', 'entrenamiento con el Lince y el aspecto elegido');
    ok(/PIXEL PLAY/i.test($('#brandHud').textContent) && $('#hsName').textContent.length > 0, 'el HUD de la partida muestra nombre del juego, jugador y KR (' + $('#hsKr').textContent + ')');
    for (let f = 0; f < 200; f++) T.step(1 / 60);
    const victims = T.fighters.filter(x => !x.isPlayer && x.team !== T.player.team);   // los equipos de los bots son aleatorios: solo se puede eliminar a los ENEMIGOS (no hay fuego amigo)
    T.damage(victims[0], 500, T.player, true, 'Lince'); T.damage(victims[1], 500, T.player, false, 'Lince');
    for (let f = 0; f < 60 * 200 && T.state === 'playing'; f++) T.step(1 / 60);
    ok(T.state === 'ended', 'la partida termina');
    const kr = wKR(); ok(kr > 40, 'las bajas dan KR (' + kr + ' KR tras la partida)');
    ok(/PX/.test($('#endSub').textContent), 'la pantalla final muestra los PX ganados: «' + $('#endSub').textContent.replace(/\s+/g, ' ').slice(0, 90) + '»');
    const daily = JSON.parse(w.localStorage.getItem('voltarena.v1.daily')); ok(daily && daily.p.games === 1, 'los desafíos diarios cuentan la partida');
    $('#toMenu').click(); ok($('#krTotal').textContent.replace(/\D/g, '') === String(kr), 'el contador de KR del inicio se actualiza (' + $('#krTotal').textContent + ')');

    // Lince: ×3
    const lince = S.WEAPONS.find(x => x.id === 'lince'); ok(Math.abs(1 / lince.aimFov - 3) < 0.01, 'el Lince hace zoom ×3 (aimFov ' + lince.aimFov + ')');

    // aspecto de un jugador remoto en línea (color y piel llegan al cliente)
    ok(await until(() => !$('#playOnline').disabled), 'servidor disponible de nuevo');
    $('#playOnline').click(); $('#eqPlay').click(); ok(await until(() => T.state === 'playing'), 'entra en partida online');
    ok(await until(() => T.fighters.some(f => !f.isPlayer && f.name === 'Ana')), 'el cliente ve a Ana');
    const ana = T.fighters.find(f => f.name === 'Ana'); ok(ana.color === ['#2f7bff', '#ff3b48'][ana.team] && ana.skin === 2, 'Ana se ve con el color de su equipo (' + ana.color + ') y la piel elegida');
    p2.ws.send(JSON.stringify({ t: 'chat', m: 'mensaje de sala' })); await sleep(50);
    ok(await until(() => $$('#chatLog li').some(li => /mensaje de sala/.test(li.textContent))) && /SALA/.test($('#chatCh').textContent), 'en partida el chat es el de la sala');
    ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors));
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
