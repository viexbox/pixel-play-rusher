'use strict';
/* Mapa en lotes (menos draw calls): el mapa se fusiona en ~10 mallas por material y sombra, con la MISMA geometría y color que caja a caja.
   Antes de este cambio cada caja era su propia THREE.Mesh: 1.771 mallas en los 6 mapas (204, 314, 304, 416, 270 y 263), hasta 99 materiales en un mapa. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} }); const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('x'));
w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; }; w.eval(shared);
const i = client.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
w.eval(client.slice(0, i) + 'window.__M = { buildMap, mapGroup, MAPS, mergeGeometries, colorOf };\n' + client.slice(i));
const M = w.__M, THREE = w.THREE;
/* Cuenta cuántas BoxGeometry se crean y cuántos dispose() se llaman durante cada buildMap */
let boxes = 0, disposed = 0; const BG = THREE.BoxGeometry; THREE.BoxGeometry = function (...a) { boxes++; return new BG(...a); }; THREE.BoxGeometry.prototype = BG.prototype;
const disp = THREE.BufferGeometry.prototype.dispose; THREE.BufferGeometry.prototype.dispose = function () { disposed++; return disp.call(this); };
/* Nexus Outpost no tiene «antes»: se construyó ya en lotes. Los umbrales son absolutos y se comparan con el número de cajas (sin lotes cada caja sería una malla). */
const stats = () => { const meshes = []; M.mapGroup.traverse(o => { if (o.isMesh) meshes.push(o); }); return meshes; };
const cell = v => Math.floor(v * 100), ckey = (a, b, c) => a + ',' + b + ',' + c;   // casillas de 1 cm; se busca también en las vecinas (Float32 puede cruzar el borde de una casilla)

console.log('=== Mallas, materiales y sombras por mapa ===');
let totalMeshes = 0;
for (let m = 0; m < M.MAPS.length; m++) {
  boxes = 0; M.buildMap(m); const meshes = stats(), floor = meshes.filter(o => o.userData.own), batches = meshes.filter(o => !o.userData.own); totalMeshes += meshes.length;
  const mats = new Set(meshes.map(o => o.material.uuid)), tris = batches.reduce((s, o) => s + o.geometry.index.count / 3, 0), verts = batches.reduce((s, o) => s + o.geometry.attributes.position.count, 0);
  ok(meshes.length <= 24 && meshes.length < boxes / 10, M.MAPS[m].name + ': ' + boxes + ' cajas → ' + meshes.length + ' mallas (1 es el suelo, ' + batches.length + ' lotes)');
  ok(mats.size <= 14 && mats.size < boxes / 20, M.MAPS[m].name + ': ' + mats.size + ' materiales para ' + boxes + ' cajas (uno por textura y por tipo de decoración; el color de cada caja va en los vértices)');
  ok(tris === boxes * 12 && verts === boxes * 24, M.MAPS[m].name + ': ' + boxes + ' cajas = ' + tris + ' triángulos y ' + verts + ' vértices, ni uno más ni uno menos');
  ok(batches.every(o => o.geometry.index.array instanceof w.Uint16Array && o.geometry.attributes.position.count <= 65535 && o.material.vertexColors && !o.matrixAutoUpdate && o.geometry.boundingSphere && o.geometry.boundingSphere.radius > 0), M.MAPS[m].name + ': índices de 16 bits, color por vértice, matriz fija y volumen de recorte calculado');
  const cast = batches.filter(o => o.castShadow), recv = batches.filter(o => o.receiveShadow);
  ok(cast.length >= 1 && cast.length <= 12 && recv.length >= 1 && batches.every(o => o.receiveShadow === false || o.castShadow), M.MAPS[m].name + ': proyectan sombra ' + cast.length + ' lotes (sin lotes serían cientos de mallas en el pase de sombras)');
}
ok(totalMeshes <= 24, 'el mapa entero se dibuja con ' + totalMeshes + ' mallas');

console.log('\n=== La geometría fusionada es la misma caja a caja ===');
for (const m of [0]) {   // Nexus Outpost
  M.buildMap(m); const pos = new Map(); for (const o of stats().filter(o => !o.userData.own)) { const P = o.geometry.attributes.position, C = o.geometry.attributes.color; for (let v = 0; v < P.count; v++) { const x = P.getX(v), y = P.getY(v), z = P.getZ(v), k = ckey(cell(x), cell(y), cell(z)); (pos.get(k) || pos.set(k, []).get(k)).push({ x, y, z, c: [C.getX(v), C.getY(v), C.getZ(v)] }); } }
  const list = []; S.buildWorld(m, (cx, y0, cz, bw, bh, bd, color, solid) => list.push({ cx, y0, cz, bw, bh, bd, color, solid }));
  let missing = 0, badColor = 0, checked = 0;
  for (const b of list) {
    const c = M.colorOf(b.color), corners = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const top of [0, 1]) { const x = b.cx + sx * b.bw / 2, y = b.y0 + top * b.bh, z = b.cz + sz * b.bd / 2, arr = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) for (const q of pos.get(ckey(cell(x) + i, cell(y) + j, cell(z) + l)) || []) if (Math.hypot(q.x - x, q.y - y, q.z - z) < 2e-4) arr.push(q.c); if (!arr.length) { missing++; if (process.env.DBG && missing <= 3) console.log('   falta esquina', x, y, z, 'de caja', JSON.stringify(b)); continue; } if (top && b.solid) { checked++; if (!arr.some(v => (Math.abs(v[0] - c.r) < 1e-5 && Math.abs(v[1] - c.g) < 1e-5 && Math.abs(v[2] - c.b) < 1e-5) || (Math.abs(v[0] - 1) < 1e-5 && Math.abs(v[1] - 1) < 1e-5 && Math.abs(v[2] - 1) < 1e-5))) badColor++; } }
  }
  ok(list.length > 50 && missing === 0, M.MAPS[m].name + ': las ' + list.length + ' cajas del mapa (' + list.length * 8 + ' esquinas) están todas en su sitio en las mallas fusionadas (faltan ' + missing + ')');
  ok(checked > 100 && badColor === 0, M.MAPS[m].name + ': y su color por vértice coincide con el color de la caja (o blanco en los toldos, cuya textura lleva el color): ' + checked + ' comprobados, ' + badColor + ' mal');
}

console.log('\n=== mergeGeometries ===');
{
  const a = new THREE.BoxGeometry(1, 1, 1), b = new THREE.BoxGeometry(2, 2, 2); b.translate(5, 0, 0); const g = M.mergeGeometries([a, b]);
  ok(g.attributes.position.count === 48 && g.index.count === 72 && g.index.array[36] === 24 + a.index.array[0] && Math.max(...g.index.array) === 47, 'une posiciones e índices desplazando los del segundo (48 vértices, 72 índices, máximo 47)');
  ok(g.attributes.normal.count === 48 && g.attributes.uv.count === 48 && g.boundingBox.max.x > 5.9 && g.boundingBox.min.x < -0.4, 'conserva normales y UV y calcula el volumen de recorte');
}

console.log('\n=== Cambiar de mapa sin fugas ===');
{
  M.buildMap(0); const n3 = stats().length; disposed = 0; M.buildMap(0); const n0 = stats().length;
  ok(disposed >= n3 && M.mapGroup.children.length === n0, 'al cambiar de mapa se liberan las geometrías del anterior (' + disposed + ' dispose() ≥ ' + n3 + ' mallas) y no quedan restos');
  const counts = []; for (let k = 0; k < 6; k++) { M.buildMap(0); counts.push(stats().length); } ok(counts[0] === counts[2] && counts[2] === counts[4] && counts[1] === counts[3] && counts[3] === counts[5], 'reconstruir el mismo mapa da siempre el mismo número de mallas (' + counts.join(', ') + ')');
}
ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors));
console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
