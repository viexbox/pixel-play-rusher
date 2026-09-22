'use strict';
/* Controles (estándar Krunker): salto de una sola pulsación, Mayús = agachar/deslizar (sin tecla de correr aparte),
   Q saca el cuchillo o golpea si ya lo tienes, E vuelve al arma principal. Con el cliente real en jsdom, sin servidor. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('sin servidor'));
w.eval(fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'));
w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));
let c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'); const i = c.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
c = c.slice(0, i) + "window.__T = { get state() { return state; }, get player() { return player; }, get slot() { return slot; }, keys, step };\n" + c.slice(i);
w.eval(c);

const key = (code, type) => w.document.dispatchEvent(new w.KeyboardEvent(type, { code, bubbles: true }));
const press = code => { key(code, 'keydown'); key(code, 'keyup'); };

(async () => {
  await sleep(200);
  const T = w.__T, $ = s => w.document.querySelector(s);
  $('#play').click(); ok(T.state === 'playing', 'arranca una partida de entrenamiento');
  for (let f = 0; f < 20; f++) T.step(1 / 60);

  /* ---------- Salto de pulsación única ---------- */
  {
    const y0 = T.player.pos.y;
    key('Space', 'keydown');   // pulsar (sin soltar)
    T.step(1 / 60);
    ok(T.player.vel.y > 0, 'al pulsar Espacio (keydown) despega: sube (vel.y = ' + T.player.vel.y.toFixed(2) + ')');
    const vAfterFirst = T.player.vel.y;
    for (let f = 0; f < 6; f++) T.step(1 / 60);   // sigue en el aire, con Espacio TODAVÍA pulsada (sin soltar)
    /* que siga en el aire sin haber vuelto a saltar es la prueba real: fuerzo un aterrizaje y compruebo que NO vuelve a saltar solo */
    T.player.pos.y = 0; T.player.vel.y = 0; T.player.onGround = true;
    T.step(1 / 60);
    ok(T.player.vel.y <= 0.01, 'con Espacio todavía pulsada (sin soltar), al tocar el suelo NO vuelve a saltar solo (vel.y = ' + T.player.vel.y.toFixed(3) + ')');
    key('Space', 'keyup');   // ahora sí se suelta
    key('Space', 'keydown'); T.step(1 / 60);   // y se vuelve a pulsar
    ok(T.player.vel.y > 0, 'soltar Espacio y volver a pulsarla SÍ salta de nuevo (vel.y = ' + T.player.vel.y.toFixed(2) + ')');
    key('Space', 'keyup');
  }

  /* ---------- Mayús = agacharse/deslizar; ya no hay una tecla de «correr» aparte ---------- */
  {
    T.player.pos.set(-6, 0, 28); T.player.vel.set(0, 0, 0); T.player.onGround = true; T.player.slide = 0; T.player.yaw = 0;   // Central Courtyard, mirando hacia -z: unos metros de sitio despejado antes de la fuente
    T.keys.KeyW = true; for (let f = 0; f < 8; f++) T.step(1 / 60);   // 8 fotogramas de sobra para llegar a la velocidad máxima (aceleración en suelo: 95 m/s²), sin alcanzar ningún obstáculo del patio
    const speedRun = Math.hypot(T.player.vel.x, T.player.vel.z);
    ok(Math.abs(speedRun - S.CONST.SPRINT) < 0.3, 'sin pulsar nada más, se corre siempre a la velocidad que antes era la de «sprint» (' + speedRun.toFixed(2) + ' ≈ ' + S.CONST.SPRINT + ')');

    key('ShiftLeft', 'keydown'); T.keys.ShiftLeft = true;
    ok(T.player.slide > 0, 'Mayús, en marcha (ya a toda velocidad), dispara el deslizamiento (S.startSlide) — antes lo hacía la tecla C, y conserva el impulso en vez de frenar en seco');
    T.keys.KeyW = false; T.keys.ShiftLeft = false; key('ShiftLeft', 'keyup');

    /* la velocidad de agachado (sin deslizar) se comprueba aparte: Mayús PRIMERO, de pie y quieto, y solo entonces W — así no hay impulso previo que dispare un deslizamiento */
    T.player.pos.set(-6, 0, 28); T.player.vel.set(0, 0, 0); T.player.onGround = true; T.player.slide = 0; T.player.slideCd = 0;
    key('ShiftLeft', 'keydown'); T.keys.ShiftLeft = true; T.keys.KeyW = true;
    for (let f = 0; f < 8; f++) T.step(1 / 60);
    const speedCrouch = Math.hypot(T.player.vel.x, T.player.vel.z);
    T.keys.ShiftLeft = false; key('ShiftLeft', 'keyup'); T.keys.KeyW = false;
    ok(T.player.slide === 0 && speedCrouch < speedRun, 'de pie y quieto, Mayús + W (sin deslizar, porque no había impulso previo) da la velocidad de agachado, más baja (' + speedCrouch.toFixed(2) + ' < ' + speedRun.toFixed(2) + ')');
  }

  /* ---------- Q: saca el cuchillo si no lo tienes; si ya lo tienes, golpea (no vuelve al arma) ---------- */
  {
    ok(T.slot === 0, 'se empieza con el arma principal en la mano (slot 0)');
    press('KeyQ');
    ok(T.slot === 1, 'la primera Q saca el cuchillo (slot 1)');
    press('KeyQ');
    ok(T.slot === 1, 'una segunda Q con el cuchillo ya en la mano NO vuelve al arma (sigue en slot 1): ahora golpea en vez de alternar');
  }

  /* ---------- E: vuelve al arma principal ---------- */
  {
    press('KeyE');
    ok(T.slot === 0, 'E vuelve al arma principal (slot 0) desde el cuchillo');
  }

  ok(errors.length === 0, 'sin errores de JavaScript (' + errors.length + ')');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
