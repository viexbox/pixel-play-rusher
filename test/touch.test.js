'use strict';
/* [MÓVIL] Controles táctiles: en una pantalla táctil sin ratón se puede jugar (antes salía «ábrelo desde un ordenador»).
   Joystick, mirar arrastrando, disparar (y apuntar arrastrando desde el botón), agacharse, cuchillo, marcador y pausa. Cliente real en jsdom. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
w.matchMedia = q => ({ matches: !q.includes('any-pointer: fine') && !q.includes('reduce'), addListener() {} });   // sin ratón
w.ontouchstart = null;   // y con pantalla táctil
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => { lockAsked++; }; w.fetch = () => Promise.reject(new Error('sin servidor'));
let lockAsked = 0;
w.eval(fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'));
w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));
let c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'); const i = c.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
c = c.slice(0, i) + 'window.__T = { TOUCH, touchMove, keys, get player() { return player; }, get state() { return state; }, get mouseL() { return mouseL; }, get mouseR() { return mouseR; }, get slot() { return slot; }, get fallback() { return fallback; } };\n' + c.slice(i);
w.eval(c);
const $ = s => w.document.querySelector(s);
const touch = (type, target, pts) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'changedTouches', { value: pts.map(p => Object.assign({ target }, p)) }); target.dispatchEvent(e); return e; };

(async () => {
  try {
    await sleep(200); const T = w.__T;
    ok(T.TOUCH && w.document.body.classList.contains('touch') && !!$('#touchUI'), 'se detecta la pantalla táctil y aparecen los controles');
    ok($('#touchWarn').hidden && !$('#play').disabled, 'ya no sale «ábrelo desde un ordenador» y se puede jugar');
    $('#play').click(); await sleep(50); const eq = $('#eqPlay'); if (eq) eq.click(); await sleep(100);
    ok(T.state === 'playing' && T.fallback && lockAsked === 0, 'la partida empieza sin pedir el bloqueo del ratón');
    const mz = $('#touchUI .tz-move'), lz = $('#touchUI .tz-look');
    const e0 = touch('touchstart', mz, [{ identifier: 1, clientX: 100, clientY: 300 }]);
    touch('touchmove', mz, [{ identifier: 1, clientX: 100, clientY: 240 }]);
    ok(e0.defaultPrevented && T.touchMove.y < -0.9 && Math.abs(T.touchMove.x) < 0.01 && !$('#touchUI .tjoy').hidden, 'el joystick aparece donde pones el dedo y arrastrar hacia arriba es andar hacia delante');
    touch('touchmove', mz, [{ identifier: 1, clientX: 105, clientY: 296 }]);
    ok(T.touchMove.x === 0 && T.touchMove.y === 0, 'con un movimiento pequeño no anda (zona muerta)');
    const yaw0 = T.player.yaw, pitch0 = T.player.pitch;
    touch('touchstart', lz, [{ identifier: 2, clientX: 600, clientY: 200 }]); touch('touchmove', lz, [{ identifier: 2, clientX: 660, clientY: 180 }]);
    ok(T.player.yaw < yaw0 && T.player.pitch > pitch0, 'arrastrar a la derecha con el otro dedo gira la cámara (a la vez que el joystick)');
    touch('touchend', lz, [{ identifier: 2 }]); touch('touchend', mz, [{ identifier: 1 }]);
    ok(T.touchMove.x === 0 && T.touchMove.y === 0 && $('#touchUI .tjoy').hidden, 'al soltar, el joystick se esconde y se para');
    const fire = $('#tFire'); touch('touchstart', fire, [{ identifier: 3, clientX: 700, clientY: 250 }]);
    const y1 = T.player.yaw; touch('touchmove', fire, [{ identifier: 3, clientX: 720, clientY: 250 }]);
    ok(T.mouseL && T.player.yaw < y1, 'mantener DISPARAR dispara, y arrastrando desde el botón se apunta a la vez');
    touch('touchend', fire, [{ identifier: 3 }]); ok(!T.mouseL, 'al soltar deja de disparar');
    touch('touchstart', $('#tAim'), [{ identifier: 4, clientX: 0, clientY: 0 }]); touch('touchend', $('#tAim'), [{ identifier: 4 }]);
    ok(T.mouseR, 'APUNTAR se queda activado (se pulsa una vez para apuntar y otra para dejar de apuntar)');
    touch('touchstart', $('#tCrouch'), [{ identifier: 5, clientX: 0, clientY: 0 }]); ok(T.keys.ShiftLeft === true, 'AGACHAR agacha mientras se mantiene');
    touch('touchend', $('#tCrouch'), [{ identifier: 5 }]); ok(!T.keys.ShiftLeft, 'y al soltar se levanta');
    touch('touchstart', $('#tKnife'), [{ identifier: 6, clientX: 0, clientY: 0 }]); touch('touchend', $('#tKnife'), [{ identifier: 6 }]);
    ok(T.slot === 1, 'CUCHILLO saca el cuchillo');
    touch('touchstart', $('#tBoard'), [{ identifier: 7, clientX: 0, clientY: 0 }]); ok(!$('#board').hidden, 'TAB enseña el marcador mientras se mantiene');
    touch('touchend', $('#tBoard'), [{ identifier: 7 }]); ok($('#board').hidden, 'y lo esconde al soltar');
    touch('touchstart', $('#tPause'), [{ identifier: 8, clientX: 0, clientY: 0 }]); ok(T.state === 'paused' && !$('#pause').hidden, 'el botón de pausa abre la pausa');
    $('#resume').click(); ok(T.state === 'playing' && lockAsked === 0, 'y «Reanudar» vuelve a la partida sin pedir el ratón');
    ok(!errors.length, 'sin errores en el cliente' + (errors.length ? ': ' + errors[0] : ''));
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
