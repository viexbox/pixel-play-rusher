'use strict';
/* Armas detalladas (buildDetailedGun): las 11 armas se construyen con piezas biseladas fundidas por color, con su contorno,
   los colores del arma o de la skin, la boca del cañón delante del cajón y sin pedir ningún .glb. Cliente real en jsdom. */
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
let glbRequests = 0; w.THREE.GLTFLoader = function () { this.load = () => { glbRequests++; }; };
w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'));
let c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'); const i = c.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
c = c.slice(0, i) + "window.__T = { buildGun, get gun() { return gun; }, GUN_BUILDERS, gunModel };\n" + c.slice(i);
w.eval(c);

(async () => {
  await sleep(200);
  const T = w.__T, THREE = w.THREE;
  w.document.querySelector('#play').click(); await sleep(50);
  const meshesOf = root => { const l = []; root.traverse(o => { if (o.isMesh) l.push(o); }); return l; };
  const byName = (root, n) => meshesOf(root).find(m => m.name === n);

  console.log('=== 1. Las 11 armas usan el modelo detallado ===');
  ok(S.WEAPONS.every(x => typeof T.GUN_BUILDERS[x.id] === 'function'), 'todas las armas tienen constructor detallado (' + Object.keys(T.GUN_BUILDERS).length + ')');
  for (const weapon of S.WEAPONS) {
    const g = T.gunModel(weapon, 0, null, '');
    const ms = meshesOf(g), roles = ms.map(m => m.name).filter(Boolean);
    const outline = ms.filter(m => m.material.side === THREE.BackSide);
    let verts = 0; ms.forEach(m => { verts += m.geometry.attributes.position.count; });
    const bb = byName(g, 'body').geometry.boundingBox;
    ok(roles.includes('body') && roles.includes('dark') && roles.includes('metal') && outline.length >= 1 && ms.length <= 22 && Number.isFinite(g.userData.tipZ) && g.userData.tipZ < -weapon.size[2] * 0.9,
      weapon.id + ': piezas fundidas por color (' + [...new Set(roles)].join(', ') + '), ' + ms.length + ' mallas, ' + verts + ' vértices, contorno y boca del cañón en z=' + g.userData.tipZ.toFixed(2));
    ok(bb.max.y <= weapon.size[1] / 2 + 0.03, weapon.id + ': el cuerpo no sobresale por encima del cajón (ahí van las miras)');
  }

  console.log('\n=== 2. Colores: los del arma, y los de la skin si hay una ===');
  const asalto = S.WEAPONS.find(x => x.id === 'asalto');
  T.buildGun(asalto);
  ok(byName(T.gun, 'body').material.color.getHexString() === new THREE.Color(asalto.col).getHexString(), 'el cuerpo lleva el color del arma');
  ok(byName(T.gun, 'dark').material.color.getHexString() === new THREE.Color('#2a1b3d').getHexString(), 'las piezas oscuras llevan el oscuro de siempre');
  const sk = S.WEAPON_SKINS.find(k => k.id === 'asalto_carbono');
  w.PPR_BP.equipped['weapon:asalto'] = sk.id; T.buildGun(asalto);
  ok(byName(T.gun, 'body').material.color.getHexString() === new THREE.Color(sk.body).getHexString() && byName(T.gun, 'body').material.map != null, 'con la skin Carbono, el cuerpo toma su color y su patrón');
  ok(byName(T.gun, 'dark').material.color.getHexString() === new THREE.Color(sk.dark).getHexString(), 'y las piezas oscuras, el oscuro de la skin');
  delete w.PPR_BP.equipped['weapon:asalto'];
  const ak = S.WEAPONS.find(x => x.id === 'ak'); T.buildGun(ak);
  ok(byName(T.gun, 'wood') && byName(T.gun, 'wood').material.color.getHexString() === new THREE.Color('#9a5522').getHexString(), 'la AK conserva su madera');
  const trueno = T.gunModel(S.WEAPONS.find(x => x.id === 'trueno'), 0, null, '');
  ok(!!byName(trueno, 'shell') && !!byName(trueno, 'brass'), 'la escopeta lleva cartuchos de repuesto (rojo y latón)');
  const lince = T.gunModel(S.WEAPONS.find(x => x.id === 'lince'), 0, null, '');
  ok(byName(lince, 'lens') && byName(lince, 'lens').material.type === 'MeshBasicMaterial', 'la mira del francotirador lleva lentes que brillan');

  console.log('\n=== 3. Miras y armas dobles ===');
  T.buildGun(asalto);
  ok(meshesOf(T.gun).some(m => !m.name && m.material.transparent), 'la mira elegida (cristal del punto rojo) se sigue montando encima');
  const duo = S.WEAPONS.find(x => x.id === 'duo'); T.buildGun(duo);
  ok(T.gun.children.length === 2, 'Dúo sigue llevando dos pistolas');
  ok(glbRequests === 0, 'no se descarga ningún modelo .glb');
  ok(errors.length === 0, 'sin errores de JavaScript (' + errors.length + (errors[0] ? ': ' + errors[0] : '') + ')');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
