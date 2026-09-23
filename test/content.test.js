'use strict';
/* Contenido nuevo: armas, mapas y escalera de la Carrera de armas. */
const fs = require('fs'); const path = require('path');
const S = require('../public/shared.js'); const { sniffImage } = require('../server/social.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const W = S.WEAPONS, isHex = h => /^#[0-9a-f]{6}$/i.test(h);

console.log('=== Armas ===');
ok(W.length === 11 && new Set(W.map(w => w.id)).size === 11, '11 armas con identificadores únicos');
ok(W.slice(0, 9).map(w => w.id).join() === 'asalto,rafaga,torrente,lince,trueno,sheriff,precision,duo,ak', 'las 9 de siempre conservan su número de clase (no se rompen las guardadas ni los eventos por arma)');
const need = ['id', 'name', 'type', 'desc', 'dmg', 'interval', 'mag', 'reload', 'spread', 'pellets', 'range', 'kick', 'aimFov', 'speed', 'stats', 'col', 'size', 'look'];
ok(W.every(w => need.every(k => w[k] !== undefined) && isHex(w.col) && w.size.length === 3 && w.stats.length === 3 && w.stats.every(x => x >= 1 && x <= 5) && w.dmg > 0 && w.interval > 0 && w.mag > 0 && w.reload > 0), 'todas tienen los campos que necesitan el servidor y el modelo 3D');
const [vo, ce] = [W[9], W[10]];
ok(vo.id === 'vortice' && ce.id === 'centinela' && vo.name === 'Vórtice' && ce.name === 'Centinela', 'las nuevas son el Vórtice (subfusil táctico) y el Centinela (fusil de batalla)');
/* equilibrio: daño por segundo y tiempo para matar frente a las armas de fuego automáticas y semiautomáticas de siempre */
const dps = w => w.dmg * w.pellets / w.interval, ttk = w => (Math.ceil(100 / (w.dmg * w.pellets)) - 1) * w.interval;
const ref = W.slice(0, 9).filter(w => !['lince', 'trueno'].includes(w.id)), dpsRef = ref.map(dps).sort((a, b) => a - b);
ok(dps(vo) >= dpsRef[0] * 0.9 && dps(vo) <= dpsRef[dpsRef.length - 1] * 1.05, 'Vórtice: ' + dps(vo).toFixed(0) + ' de daño/s, dentro del rango de las armas automáticas (' + dpsRef[0].toFixed(0) + '–' + dpsRef[dpsRef.length - 1].toFixed(0) + ')');
ok(ttk(vo) > ttk(W.find(w => w.id === 'rafaga')) - 0.001 || vo.spread < W.find(w => w.id === 'rafaga').spread, 'y no mata más rápido que la Ráfaga salvo que compense con más precisión (' + ttk(vo).toFixed(2) + ' s frente a ' + ttk(W.find(w => w.id === 'rafaga')).toFixed(2) + ' s)');
ok(Math.ceil(100 / ce.dmg) === 3 && Math.ceil(100 / ce.head) === 2 && ce.head < 100, 'Centinela: 3 disparos al cuerpo o 2 a la cabeza (ni mata de un tiro ni se queda corto)');
ok(dps(ce) < dps(W.find(w => w.id === 'ak')) && ce.range > W.find(w => w.id === 'ak').range && ce.speed < 1, 'y paga su alcance con menos daño por segundo que un AK y algo más de lentitud');
ok(ttk(ce) > ttk(W.find(w => w.id === 'sheriff')), 'sin superar al Sheriff en velocidad de eliminación (' + ttk(ce).toFixed(2) + ' s frente a ' + ttk(W.find(w => w.id === 'sheriff')).toFixed(2) + ' s)');
ok(W.every(w => w.reload <= 3.4 * 0.8 + 0.001), 'las recargas nuevas también llevan el ajuste estilo Krunker (−20 %)');
ok(vo.optics && vo.optics.every(o => S.OPTICS[o]) && !ce.optics, 'el Vórtice acepta mira de hierro y punto rojo; el Centinela lleva su mira de serie');
console.log('\n=== Carrera de armas ===');
const L = S.GUN_LADDER;
ok(L.length === 11 && new Set(L).size === 11 && L.every(i => W[i]) && L.includes(9) && L.includes(10), 'la escalera tiene 11 niveles sin repetir e incluye las dos armas nuevas');
ok(W[L[0]].id === 'ak' && W[L[L.length - 1]].id === 'lince', 'empieza en el AK y acaba en el Lince, antes del cuchillo');
ok(L.slice(0, 2).join() === '8,0', 'los dos primeros niveles no cambian (las pruebas y los jugadores conocen ese comienzo)');

console.log('\n=== Mapas ===');
const M = S.MAPS; ok(M.length === 1 && M[0].name === 'Nexus Outpost', 'un único mapa: Nexus Outpost (los seis anteriores se eliminaron)');

ok(Object.entries(M[0].look).every(([k, v]) => typeof v === 'string' || typeof v === 'number') && M[0].look.decor === 'nexus' && M[0].look.outFloor === 'grass', 'el mapa declara su aspecto: decorado «nexus», suelo exterior de hierba y texturas por tipo de superficie');
ok(M.every(m => m.name && m.desc.length > 30 && m.sky.length === 2 && m.pal.length === 5 && m.floor.length === 2 && isHex(m.fog) && isHex(m.out) && m.half >= 36), 'nombre, descripción, cielo, niebla, suelo y paleta completos');
const STEP = S.CONST.STEP;
for (const i of [0]) {
  const w = S.buildWorld(i), m = M[i], cols = w.colliders, half = m.half;
  ok(w.waypoints.length >= 200 && w.waypoints.every(([x, z]) => Math.abs(x) < half && Math.abs(z) < half && !S.overlapAt(cols, x, 0, z, 0.6, 1.8)), m.name + ': ' + w.waypoints.length + ' puntos de paso (aparición de jugadores y bots), todos dentro del mapa y libres');
  /* conectividad: desde el centro se puede llegar a TODOS los puntos de paso andando por el suelo (los escalones bajos se salvan; las paredes no) */
  const blocked = (x, z) => cols.some(c => x + 0.4 > c.minX && x - 0.4 < c.maxX && z + 0.4 > c.minZ && z - 0.4 < c.maxZ && c.maxY > STEP && c.minY < 1.8);
  const G = 1, N = Math.floor(half / G), seen = new Set(), q = []; const key = (a, b) => a + ',' + b;
  const start = w.waypoints.slice().sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))[0]; q.push([Math.round(start[0] / G), Math.round(start[1] / G)]); seen.add(key(q[0][0], q[0][1]));
  while (q.length) { const [a, b] = q.pop(); for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db; if (Math.abs(na) > N - 1 || Math.abs(nb) > N - 1 || seen.has(key(na, nb)) || blocked(na * G, nb * G)) continue; seen.add(key(na, nb)); q.push([na, nb]); } }
  const lost = w.waypoints.filter(([x, z]) => !seen.has(key(Math.round(x / G), Math.round(z / G))));
  ok(lost.length === 0, m.name + ': todos los puntos de aparición son alcanzables desde el centro (aislados: ' + lost.length + ')');
  let free = 0, reach = 0; for (let a = -N + 1; a < N; a++) for (let b = -N + 1; b < N; b++) if (!blocked(a * G, b * G)) { free++; if (seen.has(key(a, b))) reach++; }
  ok(reach / free > 0.97, m.name + ': ' + Math.round(reach / free * 100) + ' % del suelo libre es accesible (sin bolsas selladas)');
  const cover = cols.filter(c => c.maxY - c.minY >= 1 && c.maxX - c.minX < 30 && c.maxZ - c.minZ < 30).length; ok(cover >= 16, m.name + ': ' + cover + ' elementos de cobertura');
  /* Nexus Outpost NO es simétrico a propósito (dos bases distintas, azoteas, pasajes): la igualdad de oportunidades se comprueba en nexus.test.js con las distancias caminando desde cada base. */
}
console.log('\n=== Imágenes de selección de mapa ===');
for (let i = 0; i < M.length; i++) { const f = path.join(__dirname, '..', 'public', 'maps', 'map' + i + '.jpg'), buf = fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0), im = sniffImage(buf); ok(im && im.mime === 'image/jpeg' && im.w === 512 && im.h === 288, 'maps/map' + i + '.jpg existe (512×288)'); }
console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
