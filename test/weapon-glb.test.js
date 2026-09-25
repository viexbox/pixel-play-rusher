'use strict';
/* Integración de los modelos .glb reales (PR de esta sesión): cuando GUN_GLTF[id] ya está cargado, gunModel()
   debe usarlo en vez de las cajas — quitando sus miras propias (las pone el sistema de miras de siempre) y
   pintando cada pieza con el color de la skin. AK y Lince deben seguir con cajas siempre, aunque se les
   «cuele» un modelo cargado (tienen geometría propia que no se toca en esta sesión). Con el cliente real en jsdom,
   simulando el modelo ya cargado (sin red ni temporización: así la prueba es determinista). */
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
w.THREE.GLTFLoader = function () { this.load = () => {}; };   // [NUEVO] en la prueba no hace falta red de verdad: GUN_GLTF se rellena a mano, como si ya hubiera cargado
w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));
let c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'); const i = c.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
c = c.slice(0, i) + "window.__T = { buildGun, get gun() { return gun; }, GUN_GLTF, gunPartColor, GUN_GLB_IDS };\n" + c.slice(i);
w.eval(c);

/* Construye un modelo de mentira con la MISMA forma que exporta scripts/generate_weapons.py: un nodo raíz con
   piezas con nombre (algunas dentro de «body», como body_rail en el modelo real) y un par de miras «sight_*». */
function fakeModel(w2) {
  const THREE = w2.THREE, root = new THREE.Group();
  const mesh = (name) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#999999' })); m.name = name; return m; };
  const body = mesh('body'); body.add(mesh('body_rail'));
  ['magazine', 'barrel', 'muzzle', 'grip', 'stock', 'sight_front', 'sight_rear'].forEach(n => root.add(mesh(n)));
  root.add(body);
  return root;
}

(async () => {
  await sleep(200);
  const T = w.__T;
  const $ = s => w.document.querySelector(s);
  $('#play').click();
  await sleep(50);

  console.log('=== 1. El modelo real sustituye a las cajas cuando ya está cargado ===');
  const asalto = S.WEAPONS.find(x => x.id === 'asalto');
  T.GUN_GLTF.asalto = fakeModel(w);
  T.buildGun(asalto);
  const names = []; T.gun.traverse(o => { if (o.isMesh) names.push(o.name); });
  ok(names.includes('body') && names.includes('magazine') && names.includes('body_rail'), 'las piezas del modelo real aparecen en el arma en pantalla (' + names.filter(n => n).join(', ') + ')');
  ok(!names.includes('sight_front') && !names.includes('sight_rear'), 'las miras propias del modelo se han quitado (las pone el sistema de miras de siempre, no el modelo)');

  console.log('\n=== 2. Cada pieza se pinta con el color que le toca ===');
  const findByName = name => { let found = null; T.gun.traverse(o => { if (o.name === name) found = o; }); return found; };
  const wcol = asalto.col, acc = '#ffffff', dark = '#2a1b3d';   // sin skin puesta: los colores por defecto del arma
  ok(findByName('body').material.color.getHexString() === new w.THREE.Color(wcol).getHexString(), 'el cuerpo lleva el color del arma (o de la skin si hay una puesta)');
  ok(findByName('magazine').material.color.getHexString() === new w.THREE.Color(dark).getHexString(), 'el cargador lleva el color oscuro de siempre');

  console.log('\n=== 3. Con una skin puesta, el color de cada pieza cambia con ella ===');
  w.PPR_BP.equipped['weapon:asalto'] = 'asalto_carbono';
  T.GUN_GLTF.asalto = fakeModel(w);   // un modelo «recién cargado» de nuevo: buildGun() se llama muchas veces en una partida real
  T.buildGun(asalto);
  const sk = S.WEAPON_SKINS.find(k => k.id === 'asalto_carbono');
  ok(findByName('body').material.color.getHexString() === new w.THREE.Color(sk.body).getHexString(), 'el cuerpo lleva el color de la skin puesta (' + sk.body + ')');
  ok(findByName('body').material.map != null, 'y el patrón de la skin (textura) se aplica de verdad al cuerpo del modelo real, no solo a las cajas');
  delete w.PPR_BP.equipped['weapon:asalto'];

  console.log('\n=== 4. AK y Lince: cajas siempre, aunque «haya» un modelo cargado ===');
  for (const id of ['ak', 'lince']) {
    T.GUN_GLTF[id] = fakeModel(w);   // simular que también cargó (no debería pasar en el juego real: no están en GUN_GLB_IDS, pero si pasara, tampoco debe usarse)
    const weapon = S.WEAPONS.find(x => x.id === id);
    T.buildGun(weapon);
    const ns = []; T.gun.traverse(o => { if (o.isMesh) ns.push(o.name); });
    ok(!ns.includes('body'), id + ' NO usa el modelo aunque esté «cargado»: sigue con las cajas de siempre (geometría propia, no tocada esta sesión)');
  }
  ok(!S.WEAPONS.filter(x => ['ak', 'lince'].includes(x.id)).some(x => T.GUN_GLB_IDS.includes(x.id)), 'AK y Lince ni siquiera están en la lista de armas que se precargan');

  console.log('\n=== 5. Sin modelo cargado: cajas de siempre, sin romper nada ===');
  delete T.GUN_GLTF.asalto;
  T.buildGun(asalto);
  const ns2 = []; T.gun.traverse(o => { if (o.isMesh) ns2.push(o.name); });
  ok(ns2.length > 0 && ns2.every(n => !n), 'sin el modelo cargado, el arma se construye con cajas (piezas sin nombre), como siempre');

  ok(errors.length === 0, 'sin errores de JavaScript (' + errors.length + ')');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
