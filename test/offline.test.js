'use strict';
/* Modo sin servidor: la misma página debe seguir funcionando contra bots. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/juego/' });
const w = dom.window;
w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
w.fetch = () => Promise.reject(new Error('sin servidor'));
w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'vendor', 'three.min.js'), 'utf8'));
w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'shared.js'), 'utf8'));
let c = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8'); const i = c.lastIndexOf('})();');
c = c.slice(0, i) + 'window.__T = { get state() { return state; }, get player() { return player; }, get fighters() { return fighters; }, keys, step, setMouse(v) { mouseL = v; } };\n' + c.slice(i);
w.eval(c);
(async () => {
  const T = w.__T, $ = s => w.document.querySelector(s);
  await sleep(400);
  ok($('#playOnline').disabled, 'sin servidor, «Jugar online» queda desactivado');
  ok(/no está disponible/.test($('#onlineInfo').textContent), 'se explica que el modo online no está disponible');
  ok($('#lbScope').value === 'local', 'la clasificación cae a «Mis partidas»');
  ok(!$('#play').disabled, '«Entrenar con bots» sigue disponible');
  $('#play').click(); $('#eqPlay').click(); ok(T.state === 'playing', 'el entrenamiento contra bots arranca');
  let kills = 0;
  for (let f = 0; f < 60 * (require('../public/shared.js').CONST.MATCH_TIME + 20) && T.state === 'playing'; f++) { if (f % 50 === 0) { T.keys.KeyW = true; T.player.yaw += 0.4; } T.setMouse(f % 200 < 100); T.step(1 / 60); }
  kills = T.fighters.reduce((a, x) => a + x.kills, 0);
  ok(kills > 10, 'los bots juegan la partida (' + kills + ' bajas)');
  ok(T.state === 'ended', 'la partida termina');
  ok(JSON.parse(w.localStorage.getItem('voltarena.v1.scores') || '[]').length === 1, 'el resultado se guarda en «Mis partidas»');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
