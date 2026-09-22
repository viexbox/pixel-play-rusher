'use strict';
/* Bloqueo del puntero (pointer lock): se libera al morir (para poder usar la tienda con el ratón) y se recupera al reaparecer.
   Simula la API real del navegador sobre jsdom (que no la implementa) para probar la interacción completa, no solo que se llame a una función. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' });
const w = dom.window;
w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
w.HTMLCanvasElement.prototype.getContext = () => ctx;
w.fetch = () => Promise.reject(new Error('sin servidor'));
w.eval(fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'));
w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));

/* Simulación fiel de la API de bloqueo del puntero: requestPointerLock() y exitPointerLock() cambian document.pointerLockElement
   y disparan 'pointerlockchange', tal como hace un navegador real; así se prueba la reacción del juego a ese evento, no solo la llamada. */
let lockEl = null, reqCalls = 0, exitCalls = 0;
Object.defineProperty(w.document, 'pointerLockElement', { get: () => lockEl, configurable: true });
w.HTMLCanvasElement.prototype.requestPointerLock = function () { reqCalls++; lockEl = this; w.document.dispatchEvent(new w.Event('pointerlockchange')); };
w.document.exitPointerLock = () => { exitCalls++; if (lockEl) { lockEl = null; w.document.dispatchEvent(new w.Event('pointerlockchange')); } };

let c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'); const i = c.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
c = c.slice(0, i) + "window.__T = { get state() { return state; }, get player() { return player; }, get bots() { return bots; }, cfg, keys, kill, step, setMouse(v) { mouseL = v; }, setMouseR(v) { mouseR = v; } };\n" + c.slice(i);
w.eval(c);

const world = S.buildWorld(0);
(async () => {
  await sleep(200);
  const T = w.__T, $ = s => w.document.querySelector(s);

  $('#play').click(); ok(T.state === 'playing', 'arranca una partida de entrenamiento');
  ok(w.document.pointerLockElement !== null && reqCalls >= 1, 'al empezar a jugar se pide el bloqueo del puntero (' + reqCalls + ' veces)');

  const antes = exitCalls;
  T.kill(T.player, T.bots[0], false, 'Prueba');
  ok(!$('#death').hidden, 'el jugador muere: aparece la tienda');
  ok(exitCalls === antes + 1 && w.document.pointerLockElement === null, 'al morir se libera el bloqueo del puntero (exitPointerLock llamado, sin elemento bloqueado)');
  ok(w.getComputedStyle(w.document.body).cursor !== 'none', 'y el CURSOR se ve de verdad (antes quedaba invisible con «cursor:none» aunque se soltara el bloqueo, y no se podía apuntar a «Purchase»)');
  ok($('#pause').hidden, 'y NO se abre el menú de pausa solo por perder el bloqueo estando muerto');

  /* mientras se ve la tienda: ni un clic ni Escape deben volver a capturar el ratón o abrir la pausa */
  const reqAntes = reqCalls;
  w.document.dispatchEvent(new w.MouseEvent('mousedown', { button: 0, bubbles: true }));
  ok(reqCalls === reqAntes && w.document.pointerLockElement === null, 'un clic sobre la tienda NO vuelve a capturar el ratón (sigue libre)');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  ok($('#pause').hidden, 'pulsar Escape con la tienda abierta tampoco abre la pausa');

  /* reaparecer (en el modo entrenamiento no hay comprador con dinero suficiente garantizado, así que reaparece con lo que tenga) */
  const antes2 = exitCalls;
  T.kill(T.player, T.bots[0], false, 'Prueba 2');
  ok(w.getComputedStyle($('#death')).pointerEvents !== 'none', 'la tienda no hereda «pointer-events:none» de #hud (si no, los clics en Purchase atraviesan el panel y llegan al canvas, sin que el botón los reciba)');
  T.player.respawnAt = 0; for (let f = 0; f < 6; f++) T.step(1 / 60);
  ok($('#death').hidden, 'al reaparecer se cierra la tienda');
  ok(w.document.pointerLockElement !== null && reqCalls > reqAntes, 'y se recupera el bloqueo del puntero automáticamente (sin que el jugador tenga que hacer clic)');
  ok(w.getComputedStyle(w.document.body).cursor === 'none', 'y el cursor vuelve a ocultarse, como en cualquier partida normal');

  /* control: una vez vivo, perder el bloqueo (p. ej. Alt+Tab) SÍ debe abrir la pausa, como antes */
  w.document.exitPointerLock();
  ok(!$('#pause').hidden, 'estando vivo, perder el bloqueo del puntero sigue abriendo la pausa (no se ha roto el comportamiento anterior)');

  ok(errors.length === 0, 'sin errores de JavaScript (' + errors.length + ')');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
