'use strict';
/* Sistema de skins ampliado (WEAPON_SKINS): rough/metal/glow/pattern deben tener un efecto REAL sobre el material
   del arma en primera persona (gunModel/gunMat), no ser solo datos en shared.js. Con el cliente real en jsdom. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('=== 1. Datos: WEAPON_SKINS ===');
ok(S.WEAPONS.every(w => S.WEAPON_SKINS.some(k => k.w === w.id)), 'las 11 armas tienen al menos una skin (antes Centinela y Vórtice no tenían ninguna)');
ok(new Set(S.WEAPON_SKINS.map(k => k.id)).size === S.WEAPON_SKINS.length, 'ningún id de skin se repite');
ok(S.WEAPON_SKINS.every(k => S.RARITY[k.r]), 'todas las skins tienen una rareza válida');
const conPatron = S.WEAPON_SKINS.filter(k => k.pattern);
ok(conPatron.length > 0 && conPatron.every(k => ['carbono', 'camuflaje', 'rayas'].includes(k.pattern)), 'las skins con patrón apuntan a uno de los 3 patrones que existen de verdad en TEX (' + conPatron.map(k => k.pattern).join(', ') + ')');
const conBrillo = S.WEAPON_SKINS.filter(k => k.glow);
ok(conBrillo.length > 0 && conBrillo.every(k => /^#[0-9a-f]{6}$/i.test(k.glow)), 'las skins con brillo llevan un color hexadecimal válido');

console.log('\n=== 2. El cliente real: rough/metal/glow/pattern cambian el material de verdad ===');
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
c = c.slice(0, i) + "window.__T = { buildGun, get gun() { return gun; }, cfg };\n" + c.slice(i);
w.eval(c);

(async () => {
  await sleep(200);
  const T = w.__T;
  const $ = s => w.document.querySelector(s);
  $('#play').click();
  await sleep(50);

  const asaltoIdx = S.WEAPONS.findIndex(x => x.id === 'asalto'), asalto = S.WEAPONS[asaltoIdx];
  const findMats = () => { const ms = []; T.gun.traverse(o => { if (o.isMesh) ms.push(o.material); }); return ms; };

  /* sin skin: material de siempre (MeshLambertMaterial, sin brillo ni patrón) */
  T.buildGun(asalto);
  const before = findMats();
  ok(before.length > 0 && !before.some(m => m.type === 'MeshStandardMaterial'), 'sin skin, ninguna pieza usa el material con acabado (rugosidad/metal): siguen con el material de siempre');

  /* skin con patrón y acabado (sin brillo): asalto_carbono */
  w.PPR_BP.equipped['weapon:asalto'] = 'asalto_carbono';
  T.buildGun(asalto);
  const carbono = findMats(), sk1 = S.WEAPON_SKINS.find(k => k.id === 'asalto_carbono');
  const bodyMat1 = carbono.find(m => m.type === 'MeshStandardMaterial' && m.map);
  ok(!!bodyMat1, 'con la skin Carbono, el cuerpo del arma lleva un MeshStandardMaterial con textura de patrón (no el material plano)');
  ok(bodyMat1 && Math.abs(bodyMat1.roughness - sk1.rough) < 1e-6 && Math.abs(bodyMat1.metalness - sk1.metal) < 1e-6, 'y su rugosidad/metal son exactamente los de la skin (' + sk1.rough + ' / ' + sk1.metal + ')');
  ok(!carbono.some(m => m.emissive && !m.emissive.equals(new w.THREE.Color(0, 0, 0))), 'la skin Carbono no lleva brillo (no lo pedía) y ninguna pieza brilla de verdad (el color emisivo sigue en negro)');
  ok(carbono.some(m => m.type === 'MeshBasicMaterial' || m.type === 'MeshLambertMaterial'), 'las piezas que NO son del color de la skin (miras, rieles) se quedan con su material de siempre, sin verse afectadas');

  /* skin con brillo (emissive): asalto_neon */
  w.PPR_BP.equipped['weapon:asalto'] = 'asalto_neon';
  T.buildGun(asalto);
  const neon = findMats(), sk2 = S.WEAPON_SKINS.find(k => k.id === 'asalto_neon');
  const glowMat = neon.find(m => m.emissive && !m.emissive.equals(new w.THREE.Color(0, 0, 0)));
  ok(!!glowMat, 'con la skin Neón, alguna pieza (el detalle) tiene brillo emisivo de verdad (color emisivo distinto de negro)');
  ok(glowMat && '#' + glowMat.emissive.getHexString() === sk2.glow, 'y el color del brillo es exactamente el de la skin (' + sk2.glow + ')');

  /* quitar la skin: vuelve a lo de siempre */
  delete w.PPR_BP.equipped['weapon:asalto'];
  T.buildGun(asalto);
  const after = findMats();
  ok(!after.some(m => m.type === 'MeshStandardMaterial'), 'quitar la skin devuelve el arma al material de siempre (ninguna pieza se queda con el acabado especial)');

  /* las 20 skins construyen el arma sin reventar, una a una */
  let builtOk = 0;
  for (const sk of S.WEAPON_SKINS) {
    const wi = S.WEAPONS.findIndex(x => x.id === sk.w);
    w.PPR_BP.equipped['weapon:' + sk.w] = sk.id;
    try { T.buildGun(S.WEAPONS[wi]); builtOk++; } catch (e) { console.log('  (fallo construyendo', sk.id, ':', e.message, ')'); }
    delete w.PPR_BP.equipped['weapon:' + sk.w];
  }
  ok(builtOk === S.WEAPON_SKINS.length, 'las 20 skins construyen el arma correspondiente sin errores (' + builtOk + '/' + S.WEAPON_SKINS.length + ')');

  ok(errors.length === 0, 'sin errores de JavaScript (' + errors.length + ')');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
