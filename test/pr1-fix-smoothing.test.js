'use strict';
/* PR 1 — corrección suave de 'fix': la posición real se corrige al instante (para física y red), pero la CÁMARA
   se desliza en ~100-150 ms en vez de saltar; el jugador sigue siendo controlable mientras tanto. Snap duro si el
   desajuste supera 3 unidades. Con el cliente real en jsdom, sin servidor. */
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
c = c.slice(0, i) + "window.__T = { get state() { return state; }, get player() { return player; }, camera, keys, step, netHandle };\n" + c.slice(i);
w.eval(c);

(async () => {
  await sleep(200);
  const T = w.__T;
  T.__proto__ && 0; // (nada)
  const $ = s => w.document.querySelector(s);
  $('#play').click(); $('#eqPlay').click(); ok(T.state === 'playing', 'arranca una partida de entrenamiento');
  for (let f = 0; f < 30; f++) T.step(1 / 60);   // asienta la cámara antes de medir

  /* ---------- A) desajuste PEQUEÑO (1,2 unidades): corrección suave, sin salto ---------- */
  {
    const p0 = { x: T.player.pos.x, y: T.player.pos.y, z: T.player.pos.z };
    const camBefore = { x: T.camera.position.x, y: T.camera.position.y, z: T.camera.position.z };
    const target = { x: p0.x + 1.2, y: p0.y, z: p0.z };   // 1,2 unidades: por debajo del umbral de snap duro (3)
    T.netHandle({ t: 'fix', ep: 1, x: target.x, y: target.y, z: target.z });

    ok(Math.abs(T.player.pos.x - target.x) < 1e-9, 'la posición REAL se corrige al instante, sin esperar (necesario para física y red)');
    ok(Math.abs(T.camera.position.x - camBefore.x) < 1e-9, 'pero la CÁMARA, en el mismo instante, todavía no ha saltado (sigue donde estaba)');

    /* controlable durante la corrección: pulsar W debe mover al jugador aunque la cámara siga corrigiendo */
    T.keys.KeyW = true; const px1 = T.player.pos.x, pz1 = T.player.pos.z;
    for (let f = 0; f < 6; f++) T.step(1 / 60);
    const moved = Math.hypot(T.player.pos.x - px1, T.player.pos.z - pz1);
    T.keys.KeyW = false;
    ok(moved > 0.1, 'el jugador SIGUE siendo controlable mientras la cámara corrige (se movió ' + moved.toFixed(2) + ' unidades en 6 fotogramas)');

    /* se disuelve en la ventana de 100-150 ms sin dar un salto de golpe en un solo fotograma */
    let maxFrameJump = 0, camDist = Infinity;
    for (let f = 0; f < 12; f++) {   // 12 fotogramas a 60 fps ≈ 200 ms: de sobra para ver que se disuelve dentro de la ventana pedida
      const before = { x: T.camera.position.x, z: T.camera.position.z };
      T.step(1 / 60);
      maxFrameJump = Math.max(maxFrameJump, Math.hypot(T.camera.position.x - before.x, T.camera.position.z - before.z));
      if (f === 8) camDist = Math.hypot(T.camera.position.x - (T.player.pos.x), T.camera.position.z - (T.player.pos.z));   // a los ~150 ms (30 + 6 + 8 fotogramas ya pasados desde el fix)
    }
    ok(maxFrameJump < 0.35, 'nunca da un salto de más de 0,35 unidades en un solo fotograma (máximo visto: ' + maxFrameJump.toFixed(3) + ')');
    const finalGap = Math.hypot(T.camera.position.x - T.player.pos.x, T.camera.position.z - T.player.pos.z);
    ok(finalGap < 0.05, 'a los ~150 ms la cámara ya está prácticamente en su sitio (desfase restante: ' + finalGap.toFixed(4) + ')');
  }

  /* ---------- B) desajuste GRANDE (10 unidades): snap duro, sin desfase que disolver ---------- */
  {
    for (let f = 0; f < 20; f++) T.step(1 / 60);   // que no quede ni rastro del desfase anterior
    const p0 = { x: T.player.pos.x, y: T.player.pos.y, z: T.player.pos.z };
    T.player.vel.set(3, 0, 2);   // simula que llevaba velocidad
    const target = { x: p0.x + 10, y: p0.y, z: p0.z };
    T.netHandle({ t: 'fix', ep: 2, x: target.x, y: target.y, z: target.z });
    ok(Math.abs(T.player.pos.x - target.x) < 1e-9, 'un desajuste grande (10 unidades) también corrige la posición real al instante');
    ok(T.player.vel.x === 0 && T.player.vel.z === 0, 'y ESTA VEZ sí para en seco (la velocidad se pone a cero, como antes para los desajustes grandes)');
    T.step(1 / 60);
    const gap = Math.hypot(T.camera.position.x - T.player.pos.x, T.camera.position.z - T.player.pos.z);
    ok(gap < 0.05, 'y la cámara salta con la posición en el mismo fotograma (snap duro): sin desfase que disolver (' + gap.toFixed(3) + ')');
  }

  ok(errors.length === 0, 'sin errores de JavaScript (' + errors.length + ')');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
