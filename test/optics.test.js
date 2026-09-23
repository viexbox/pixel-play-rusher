'use strict';
/* AK con miras variadas, francotirador con dos zooms y chat que se puede ocultar (cliente real en jsdom). */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
function boot() {
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = () => Promise.reject(new Error('sin servidor'));
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared);
  const i = client.lastIndexOf('})();');
  const errors = []; w.addEventListener('error', e => errors.push(e.message));
  w.eval(client.slice(0, i) + 'window.__T = { get state() { return state; }, get player() { return player; }, cfg, keys, step, camera, gun, setMouse(v) { mouseL = v; }, setMouseR(v) { mouseR = v; }, fast() { updateHudFast(); } };\n' + client.slice(i));
  return { w, T: w.__T, errors, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)], key: (code, type) => w.document.dispatchEvent(new w.KeyboardEvent(type || 'keydown', { code, bubbles: true })) };
}
const settle = (T, n) => { for (let f = 0; f < n; f++) T.step(1 / 60); T.fast(); };
(async () => {
  const ak = S.WEAPONS.findIndex(x => x.id === 'ak'), lince = S.WEAPONS.findIndex(x => x.id === 'lince');
  ok(ak === 8 && S.WEAPONS[ak].optics.length === 4, 'la AK es la clase 9 y tiene 4 miras (' + S.WEAPONS[ak].optics.join(', ') + ')');

  /* ---------- AK ---------- */
  { const { T, $, $$, key, errors } = boot(); await sleep(250);
    $$('#classes .cls')[ak].click();
    ok(!$('#opticSect').hidden && $$('#optics .opt').length === 4, 'lobby: aparece el selector «Mira» con 4 opciones para la AK');
    $$('#optics .opt')[2].click();
    ok(T.cfg.optics.ak === 'holo' && $$('#optics .opt')[2].getAttribute('aria-pressed') === 'true', 'lobby: elegir «Holográfica» se guarda');
    $$('#classes .cls')[7].click(); ok($('#opticSect').hidden, 'lobby: las clases sin miras opcionales (Dúo) ocultan el selector'); $$('#classes .cls')[0].click(); ok(!$('#opticSect').hidden && $$('#optics .opt').length === 2 && /Punto rojo/.test($('#optics .opt').textContent), 'y las armas con punto rojo ofrecen elegir entre punto rojo y mira de hierro');
    $$('#classes .cls')[ak].click(); $$('#optics .opt')[0].click();
    $('#play').click(); ok(T.state === 'playing', 'partida con la AK'); settle(T, 90);
    ok($('#wname').textContent === 'AK' && $$('#pips i').length === 30 && $('#mag').textContent === '30', 'HUD: AK con cargador de 30');
    ok(/Mira de hierro/.test($('#wtype').textContent) && !$('#optHint').hidden, 'el HUD indica la mira activa y la tecla B');
    const seen = {};
    for (const id of ['hierro', 'punto', 'holo', 'acog']) {
      T.cfg.optics.ak = id; key('KeyB', 'keyup'); T.cfg.optics.ak = id; // (se fija la mira de forma determinista)
      T.setMouseR(true); settle(T, 60);
      seen[id] = { optic: $('#optic').hidden ? '' : $('#optic').dataset.k, scope: $('#scope').hidden ? '' : $('#scope').dataset.k, cross: $('#crosshair').style.opacity, gunY: T.gun.position.y, fov: T.camera.fov, vis: T.gun.visible, zoom: $('#scZoom').textContent };
      T.setMouseR(false); settle(T, 40);
    }
    ok(seen.hierro.optic === '' && seen.hierro.scope === '' && seen.hierro.vis && Number(seen.hierro.cross) === 0, 'mira de hierro: sin retícula superpuesta, el arma se ve y la mira normal se desvanece');
    ok(seen.punto.optic === 'dot' && seen.punto.scope === '' && seen.punto.vis, 'punto rojo: aparece el punto luminoso y el arma sigue visible');
    ok(seen.holo.optic === 'holo' && seen.holo.scope === '', 'holográfica: aparece el anillo con punto');
    ok(seen.acog.scope === 'acog' && !seen.acog.vis && seen.acog.optic === '', 'ACOG: mira con retícula y bordes oscuros (el arma se oculta)');
    ok(Math.abs(seen.acog.fov - 90 * S.OPTICS.acog.fov) < 1, 'ACOG: FOV ' + seen.acog.fov.toFixed(1) + '° (zoom ' + seen.acog.zoom + ')');
    ok(seen.acog.fov < seen.holo.fov && seen.holo.fov < seen.punto.fov && seen.punto.fov < seen.hierro.fov, 'zoom creciente: hierro < punto rojo < holográfica < ACOG (' + ['hierro', 'punto', 'holo', 'acog'].map(k => seen[k].fov.toFixed(0) + '°').join(' · ') + ')');
    ok(Math.abs(seen.hierro.gunY + S.OPTICS.hierro.h) < 0.01 && Math.abs(seen.holo.gunY + S.OPTICS.holo.h) < 0.01, 'al apuntar, el arma sube para alinear la línea de mira con el centro (' + seen.hierro.gunY.toFixed(3) + ' / ' + seen.holo.gunY.toFixed(3) + ')');
    T.player.alive = true; T.player.hp = 100; T.player.protect = 1e9; T.player.aim = 0; T.player.reload = 0;   // que los bots no interfieran con la prueba
    T.cfg.optics.ak = 'hierro'; $('#optHint'); key('KeyB'); key('KeyB', 'keyup');
    ok(T.cfg.optics.ak === 'punto' && /Punto rojo/.test($('#wtype').textContent), 'la tecla B cambia de mira en partida → ' + T.cfg.optics.ak);
    key('KeyB'); key('KeyB', 'keyup'); ok(T.cfg.optics.ak === 'holo' && /Holográfica/.test($('#wtype').textContent), 'B otra vez → holográfica');
    ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors)); }

  /* ---------- Francotirador ---------- */
  { const { T, $, key, errors } = boot(); await sleep(250);
    T.cfg.cls = lince; $('#play').click(); settle(T, 90);
    ok(/Mira ×3/.test($('#wtype').textContent), 'Lince: mira ×3 por defecto');
    T.setMouseR(true); settle(T, 60);
    const a = { scope: $('#scope').dataset.k, hidden: $('#scope').hidden, zoom: $('#scZoom').textContent, vis: T.gun.visible, cross: $('#crosshair').style.opacity, fov: T.camera.fov };
    ok(!a.hidden && a.scope === 'scope' && !a.vis && a.cross === '0' && /^×3/.test(a.zoom), 'Lince ×3: mira telescópica a pantalla completa (' + a.zoom + ')');
    T.setMouseR(false); settle(T, 40); key('KeyB'); key('KeyB', 'keyup');
    ok(/Mira ×6/.test($('#wtype').textContent) && T.cfg.optics.lince === 'scope6', 'B cambia a mira ×6');
    T.setMouseR(true); settle(T, 60);
    ok(/^×5\.\d/.test($('#scZoom').textContent) && T.camera.fov < a.fov * 0.6, 'Lince ×6: más zoom (' + $('#scZoom').textContent + ', FOV ' + T.camera.fov.toFixed(1) + '° frente a ' + a.fov.toFixed(1) + '°)');
    T.setMouseR(false); settle(T, 60); key('KeyB'); key('KeyB', 'keyup'); ok(T.cfg.optics.lince === 'scope3', 'B vuelve a ×3');
    ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors)); }

  /* ---------- Chat ---------- */
  { const { T, w, $, key, errors } = boot(); await sleep(250);
    ok(/#chatLog\{pointer-events:none/.test(html), 'la zona de mensajes del chat ya no intercepta los clics (solo la cabecera y la línea de escribir)');
    ok(!$('#chat').classList.contains('off') && $('#chatTab').hidden, 'el chat empieza visible');
    $('#chatX').click();
    ok($('#chat').classList.contains('off') && !$('#chatTab').hidden && T.cfg.chatHidden === true, '«Ocultar ✕» retira el chat y deja solo una pestaña pequeña');
    $('#play').click(); settle(T, 30);
    key('Enter'); ok(w.document.body.classList.contains('chat-peek'), 'en partida, Enter muestra el chat un momento aunque esté oculto');
    $('#chatIn').value = 'hola'; $('#chatIn').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ok(!w.document.body.classList.contains('chat-peek') && $('#chat').classList.contains('off'), 'al enviar, el chat vuelve a ocultarse solo');
    $('#chatTab').click(); ok(!$('#chat').classList.contains('off') && $('#chatTab').hidden && T.cfg.chatHidden === false, 'la pestaña vuelve a mostrar el chat');
    ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors)); }

  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
