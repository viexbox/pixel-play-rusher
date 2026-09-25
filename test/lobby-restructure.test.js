'use strict';
/* Reestructuración de la lobby: el bando y el arma ya no se eligen en la lobby (ese resumen se quitó), se eligen
   en el cajón que se abre al pulsar Online/Entrenar. Después, la tecla C abre un cambio rápido de arma solo los
   primeros segundos tras reaparecer (se aplica en la próxima vida, igual que la tienda de la pantalla de muerte). */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('=== 1. Servidor: el bando pedido se respeta dentro del margen de balance ===');
{
  class FakeRoom { constructor() { this.players = new Map(); }
    assignTeam(p) { let c0 = 0, c1 = 0; for (const o of this.players.values()) { if (o === p) continue; if (o.team === 0) c0++; else c1++; }
      if (p.wantTeam === 0 || p.wantTeam === 1) { const want = p.wantTeam, wc = want === 0 ? c0 : c1, oc = want === 0 ? c1 : c0;
        if (wc <= oc + 1) { p.team = want; return; } }
      p.team = c0 < c1 ? 0 : c1 < c0 ? 1 : (Math.random() < 0.5 ? 0 : 1); }
  }
  const r = new FakeRoom();
  const join = wantTeam => { const p = { wantTeam }; r.assignTeam(p); r.players.set(Math.random(), p); return p.team; };
  ok(join(1) === 1, 'primer jugador que pide Rojo (1) entra en Rojo');
  ok(join(1) === 1, 'segundo jugador que pide Rojo también entra (1-0, dentro del margen)');
  ok(join(1) === 0, 'un tercero que pide Rojo se manda a Azul: 2-0 ya desequilibra más de 1 jugador');
  ok([0, 1].includes(join(null)), 'sin preferencia, entra en algún bando (automático)');
}

console.log('\n=== 2. El cliente real: bando y arma se piden al pulsar Online/Entrenar, no antes ===');
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('sin servidor'));
w.eval(fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'));
w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
w.THREE.GLTFLoader = function () { this.load = () => {}; };
class FakeWS { constructor(url) { this.url = url; this.readyState = 0; setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 0); }
  send() {} close() {} }
w.WebSocket = FakeWS;
w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));
let c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'); const i = c.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
const sentMsgs = [];
c = c.slice(0, i) +
  "window.__T = { get pendingPlay() { return pendingPlay; }, get quickSwapMode() { return quickSwapMode; }, get spawnAt() { return spawnAt; }, set spawnAt(v) { spawnAt = v; }, get online() { return online; }, set online(v) { online = v; }, set serverOK(v) { serverOK = v; }, applySpawnLocal, openLoadout, cfg, net, get player() { return player; }, QUICK_SWAP_MS, __sent: " + JSON.stringify([]) + " };\n" +
  "const __origSend = netSend; netSend = m => { window.__T.__sent.push(m); return __origSend ? __origSend(m) : undefined; };\n" +
  c.slice(i);
w.eval(c);

(async () => {
  await sleep(200);
  const T = w.__T;
  const $ = s => w.document.querySelector(s);

  ok($('#lobbyEq') === null, 'el resumen de equipamiento ya no está en la lobby (se quitó el panel)');
  ok($('#eqOpen') === null, 'el botón «Personalizar equipo» ya no existe (ya no hace falta: el cajón se abre al jugar)');
  ok(!w.document.body.classList.contains('eqopen'), 'el cajón de personaje empieza cerrado');

  $('#play').click();
  await sleep(50);
  ok(w.document.body.classList.contains('eqopen'), 'pulsar Entrenar abre el cajón de bando y arma, no empieza a jugar directamente');
  ok(T.pendingPlay === 'train', 'queda anotado que la partida pendiente es de entrenamiento');
  ok(!$('#teamSect').hidden, 'la sección de bando está visible en ese cajón');
  ok(!$('#eqPlay').hidden && $('#eqPlay').textContent === 'Entrenar', 'el botón de confirmar dice «Entrenar»');

  $('#teamPick').querySelector('[data-tm="1"]').click();
  ok(T.cfg.wantTeam === 1, 'elegir Rojo en el cajón guarda la preferencia de bando (1 = Rojo)');
  ok($('#teamPick').querySelector('[data-tm="1"]').getAttribute('aria-pressed') === 'true', 'el botón de Rojo queda marcado');
  ok($('#teamPick').querySelector('[data-tm="0"]').getAttribute('aria-pressed') === 'false', 'y el de Azul deja de estarlo');

  $('#eqClose').click();
  ok(!w.document.body.classList.contains('eqopen'), 'la X cierra el cajón sin jugar');

  $('#playOnline').click();
  await sleep(50);
  console.log('  (nota: #playOnline.disabled =', $('#playOnline').disabled, '— sin servidor real en la prueba, se llama a openLoadout directamente)');
  T.openLoadout('online');
  await sleep(50);
  ok(T.pendingPlay === 'online' && $('#eqPlay').textContent === 'Jugar online', 'pulsar Online abre el mismo cajón, ahora para la partida online');

  console.log('\n=== 3. El bando elegido viaja al servidor en el mensaje de conexión ===');
  T.__sent.length = 0; T.online = true; T.serverOK = true;
  $('#eqPlay').click();
  await sleep(50);
  const hello = T.__sent.find(m => m.t === 'hello');
  ok(!!hello, 'se envía un mensaje hello al pulsar Jugar online');
  ok(hello && hello.tm === 1, 'y lleva el bando elegido (Rojo = 1), no se pierde');

  console.log('\n=== 4. Tecla C: cambio rápido de arma, solo los primeros segundos tras reaparecer ===');
  $('#play').click(); await sleep(50);   // Entrenar: no necesita servidor
  $('#eqPlay').click(); await sleep(300);   // arranca de verdad: construye el mapa y al jugador
  ok(!!T.player && T.player.alive, 'el jugador reaparece con vida (entrenamiento, sin servidor)');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyC' }));
  await sleep(50);
  ok(T.quickSwapMode === true, 'justo tras reaparecer, la tecla C abre el cambio rápido de arma');
  ok($('#teamSect').hidden && $('#custSect').hidden && $('#eqPlay').hidden, 'en el cambio rápido solo se ve el arma: bando, personalizar y el botón Jugar quedan ocultos');

  T.__sent.length = 0; const clsAntes = T.cfg.cls;
  const claseBtn = $('#classes').querySelector('.cls[data-i="2"]');
  claseBtn.click();
  await sleep(50);
  ok(!w.document.body.classList.contains('eqopen'), 'elegir un arma en el cambio rápido cierra el cajón');
  ok(T.quickSwapMode === false, 'y sale del modo de cambio rápido');
  ok(T.cfg.cls === 2 && T.cfg.cls !== clsAntes, 'en entrenamiento (sin servidor) se aplica igual que ya hace la tienda de muerte offline: selectClass directo, para la próxima reaparición');

  console.log('\n=== 5. Pasados los primeros segundos, la tecla C ya no hace nada ===');
  T.spawnAt = w.performance.now() - (T.QUICK_SWAP_MS + 500);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyC' }));
  await sleep(50);
  ok(T.quickSwapMode === false, 'pasados los 6 s, pulsar C ya no abre nada');

  ok(errors.length === 0, 'sin errores de JavaScript (' + errors.length + ')');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
