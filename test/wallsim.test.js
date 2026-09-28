'use strict';
/* Antitrampas de paredes, sin servidor: (1) jugadores legítimos con la física real en los 6 mapas NO reciben ninguna corrección (positions cada 50, 100 y 150 ms, redondeadas a 3 decimales como el cliente),
   (2) las trampas (atravesar un muro grueso, meterse dentro) SÍ se detectan. */
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const rnd = seed => { let s = seed >>> 0; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; };
console.log('=== Jugadores legítimos ===');
let allBad = 0, allN = 0; const per = [];
for (let m = 0; m < S.MAPS.length; m++) {
  const w = S.buildWorld(m), cols = w.colliders, wps = w.waypoints, inset = S.insetColliders(cols, 0.3); let bad = 0, n = 0;
  for (const every of [3, 6, 9]) for (let k = 0; k < 48; k++) {
    const r = rnd(1000 * m + 10 * every + k), e = { pos: { x: wps[0][0], y: 0, z: wps[0][1] }, vel: { x: 0, y: 0, z: 0 }, hw: 0.35, h: 1.8, onGround: true };
    let tx = e.pos.x, tz = e.pos.z, t = 0, prev = { x: e.pos.x, y: 0, z: e.pos.z };
    for (let f = 1; f <= 60 * 90; f++) {
      t -= 1 / 60; if (t <= 0) { const q = wps[Math.floor(r() * wps.length)]; tx = q[0]; tz = q[1]; t = 1.5 + r() * 3; }
      const d = Math.hypot(tx - e.pos.x, tz - e.pos.z) || 1, sp = r() < 0.004 ? 12 : 7.4; e.vel.x = (tx - e.pos.x) / d * sp; e.vel.z = (tz - e.pos.z) / d * sp;
      if (e.onGround && r() < 0.02) e.vel.y = S.CONST.JUMP; S.moveEntity(cols, e, 1 / 60);
      if (f % every === 0) { const x = +e.pos.x.toFixed(3), y = +e.pos.y.toFixed(3), z = +e.pos.z.toFixed(3); n++; if (S.wallViolation(cols, inset, prev, x, y, z, 1.8)) bad++; prev = { x, y, z }; }
    }
  }
  let nHigh = 0, badHigh = 0;
  /* también se simulan jugadores que EMPIEZAN en las zonas altas (azoteas, adarves, tejados, puentes): escaleras, bordes y caídas */
  const HIGH = [[[0, 4.8, -2], [24, 3.6, 0], [-24, 3.6, 12], [14, 3.6, -32], [-14, 3.6, 36]],   // Castillo Real: azotea de la torre, adarves, tejado de la casa y de los establos
    [[-14, 4.0, -26], [0, 4.0, 26], [26, 4.0, 26], [-26, 4.0, -26]],   // Barrio Arcoíris: tejados y puentes
    [[-15, 2.6, -26], [0, 2.6, -25.8], [15, 2.6, -26], [19, 4.0, 22], [0, 4.0, 25], [-19, 4.0, 28]]][m] || [];   // [MAPA 3] Puerto Industrial: contenedores, pasarela, tejados de las oficinas y puente
  for (const [sx, sy, sz] of HIGH) for (const every of [3, 6, 9]) for (let k = 0; k < 4; k++) {
    const r = rnd(7000 + Math.round(sx * 10 + sz) + every * 31 + k), e = { pos: { x: sx, y: sy, z: sz }, vel: { x: 0, y: 0, z: 0 }, hw: 0.35, h: 1.8, onGround: true };
    let tx = sx, tz = sz, t = 0, prev = { x: sx, y: sy, z: sz };
    for (let f = 1; f <= 60 * 60; f++) {
      t -= 1 / 60; if (t <= 0) { tx = sx + (r() - 0.5) * 26; tz = sz + (r() - 0.5) * 26; t = 1.5 + r() * 3; }
      const d = Math.hypot(tx - e.pos.x, tz - e.pos.z) || 1, sp = r() < 0.004 ? 12 : 7.4; e.vel.x = (tx - e.pos.x) / d * sp; e.vel.z = (tz - e.pos.z) / d * sp;
      if (e.onGround && r() < 0.02) e.vel.y = S.CONST.JUMP; S.moveEntity(cols, e, 1 / 60);
      if (f % every === 0) { const x = +e.pos.x.toFixed(3), y = +e.pos.y.toFixed(3), z = +e.pos.z.toFixed(3); nHigh++; if (S.wallViolation(cols, inset, prev, x, y, z, 1.8)) badHigh++; prev = { x, y, z }; }
    }
  }
  ok(badHigh === 0 && nHigh > 2000 * HIGH.length, S.MAPS[m].name + ': desde las zonas altas (' + HIGH.length + ' puntos de partida a distintas alturas): ' + nHigh + ' posiciones y ' + badHigh + ' correcciones falsas');
  per.push(S.MAPS[m].name + ' ' + bad); allBad += bad; allN += n;
  ok(bad === 0, S.MAPS[m].name + ': ' + n + ' posiciones de jugadores legítimos (saltos, escaleras, esquinas y choques), ' + bad + ' correcciones');
}
ok(allBad === 0 && allN > 150000, 'total: ' + allBad + ' correcciones en ' + allN + ' posiciones');
console.log('\n=== Casos concretos ===');
const F = S.buildWorld(0), Fi = S.insetColliders(F.colliders, 0.3), P0 = { x: 22.6, y: 0, z: 18 };   // muralla este de Castillo Real (x 23–25)
ok(S.wallViolation(F.colliders, Fi, P0, 25.4, 0, 18, 1.8) === 'muro', 'saltar al otro lado de un muro de 2 m se detecta («muro»)');
ok(S.wallViolation(F.colliders, Fi, P0, 24, 0, 18, 1.8) === 'dentro', 'acabar dentro del muro se detecta («dentro»)');
ok(S.wallViolation(F.colliders, Fi, P0, 22.62, 0, 18.4, 1.8) === null, 'pegarse a la pared y avanzar por ella es legítimo');
const step = { minX: 0, maxX: 3, minZ: 0, maxZ: 3, minY: 0, maxY: 0.5333333333 };
ok(S.wallViolation([step], S.insetColliders([step], 0.3), { x: 1, y: 0.533, z: -1 }, 1, 0.533, 1.2, 1.8) === null, 'de pie sobre un escalón de 0,5333 m con la posición redondeada (0,533) NO es «dentro»');
ok(S.wallViolation([step], S.insetColliders([step], 0.3), { x: 1, y: 0.533, z: -1 }, 1, 0.2, 1.2, 1.8) === 'dentro', 'pero meterse en el escalón sí');
let tot = 0, det = 0;
for (let m = 0; m < S.MAPS.length; m++) {
  const cols = S.buildWorld(m).colliders, ins = S.insetColliders(cols, 0.3);
  for (const c of cols) { const tx = c.maxX - c.minX, tz = c.maxZ - c.minZ; if (tx < 1.2 || tz < 1.2 || c.maxY - c.minY < 1.6 || c.minY > 0.3 || tx > 20) continue;
    const zc = (c.minZ + c.maxZ) / 2, a = { x: c.minX - 0.5, y: 0, z: zc }, b = { x: c.maxX + 0.5, y: 0, z: zc };
    if (S.overlapAt(cols, a.x, 0, a.z, 0.4, 1.8) || S.overlapAt(cols, b.x, 0, b.z, 0.4, 1.8)) continue; tot++; if (S.wallViolation(cols, ins, a, b.x, 0, b.z, 1.8) === 'muro') det++; }
}
ok(tot > 30 && det === tot, 'atravesar de golpe CUALQUIER muro macizo (grosor ≥ 1,2 m) del mapa se detecta: ' + det + ' de ' + tot);
console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
