'use strict';
/* Movimiento estilo Krunker (S.moveStep / S.startSlide / S.MOVE): fricción del deslizamiento, slide hop con impulso, momentum en el aire, coyote time y buffer de salto.
   Todo en proceso, con la física real (S.moveEntity), sin servidor ni navegador. */
const S = require('../public/shared.js'); const M = S.MOVE, C = S.CONST;
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const DT = 1 / 60, hs = p => Math.hypot(p.vel.x, p.vel.z), dirDot = (a, b) => (a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z));
const mk = (x, y, z) => ({ pos: { x: x || 0, y: y || 0, z: z || 0 }, vel: { x: 0, y: 0, z: 0 }, hw: 0.35, h: 1.8, onGround: true, slide: 0, slideCd: 0, slideGrace: 0, hop: 1, jumping: false });
/* Un fotograma como el del cliente: entrada → wish → moveStep → moveEntity. Teclas: { fwd, str, sprint, jump } (yaw 0: adelante = −z, derecha = +x) */
function frame(p, cols, k, dt) {
  k = k || {}; dt = dt || DT; const fwd = k.fwd || 0, str = k.str || 0; let wx = str, wz = -fwd; const wl = Math.hypot(wx, wz); if (wl) { wx /= wl; wz /= wl; }
  const speed = k.crouch ? C.CROUCH : k.sprint ? C.SPRINT : C.WALK; const out = S.moveStep(p, { wx, wz, fwd, str, speed, jump: !!k.jump }, dt); S.moveEntity(cols, p, dt); return out;
}
const run = (p, cols, k, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) frame(p, cols, k); };
const sprintUp = () => { const p = mk(); run(p, [], { fwd: 1, sprint: true }, 0.5); return p; };   // corriendo a 8,8 m/s hacia −z

console.log('=== Fricción: suelo normal frente a deslizamiento ===');
{
  const p = sprintUp(); ok(Math.abs(hs(p) - C.SPRINT) < 0.05, 'corriendo: ' + hs(p).toFixed(2) + ' m/s (sprint)');
  run(p, [], {}, 0.12); ok(hs(p) < 0.5, 'soltar las teclas en suelo normal: se para en 0,12 s (' + hs(p).toFixed(2) + ' m/s): mucha fricción (' + M.GROUND_ACCEL + ' m/s²)');
  const q = sprintUp(); ok(S.startSlide(q) && q.slide > 0, 'agacharse corriendo empieza el deslizamiento'); const s0 = hs(q); ok(s0 >= 11 && s0 <= M.SLIDE_V1 + 0.01, 'con impulso de entrada: ' + s0.toFixed(2) + ' m/s (entre 11 y 12,4)');
  run(q, [], {}, 0.5); const s1 = hs(q), decel = (s0 - s1) / 0.5, normal = M.GROUND_ACCEL;
  ok(s1 > s0 * 0.7, 'sin tocar nada, a los 0,5 s sigue al ' + Math.round(s1 / s0 * 100) + ' % de la velocidad (' + s1.toFixed(1) + ' m/s)');
  ok(normal / decel > 10, 'la fricción baja más de 10 veces: se frena a ' + decel.toFixed(1) + ' m/s² en vez de ' + normal + ' m/s² (' + Math.round(normal / decel) + '× menos)');
  const d0 = { x: q.vel.x, z: q.vel.z }; run(q, [], { str: 1 }, 0.2); ok(dirDot(d0, q.vel) > 0.999, 'y no se puede corregir el rumbo mientras se desliza (giro ' + (Math.acos(Math.min(1, dirDot(d0, q.vel))) * 57.3).toFixed(2) + '°)');
  const r = sprintUp(); S.startSlide(r); run(r, [], {}, M.SLIDE_TIME + 0.02); ok(r.slide <= 0 && r.slideGrace > 0 && hs(r) > M.SLIDE_END, 'a los ' + M.SLIDE_TIME + ' s el deslizamiento termina y deja un margen para saltar con impulso (' + hs(r).toFixed(1) + ' m/s)');
}
console.log('\n=== Cuándo se puede deslizar ===');
{
  const w = mk(); run(w, [], { fwd: 1, crouch: true }, 0.5); ok(!S.startSlide(w) && hs(w) <= C.CROUCH + 0.05, 'agachado y caminando despacio (' + hs(w).toFixed(1) + ' m/s ≤ 5): no hay deslizamiento');
  const a = sprintUp(); a.onGround = false; ok(!S.startSlide(a), 'en el aire no');
  const b = sprintUp(); S.startSlide(b); ok(!S.startSlide(b), 'con uno en marcha no se reinicia');
  b.slide = 0; ok(!S.startSlide(b) && b.slideCd > 0, 'y hay un enfriamiento de ' + M.SLIDE_CD + ' s (quedan ' + b.slideCd.toFixed(2) + ' s)');
  run(b, [], { fwd: 1, sprint: true }, M.SLIDE_CD); ok(S.startSlide(b), 'pasado el enfriamiento se puede otra vez');
  const f = mk(); f.vel.x = 14; f.vel.z = 0; S.startSlide(f); ok(hs(f) >= 14, 'nunca te frena al entrar: ya a 14 m/s te quedas en ' + hs(f).toFixed(1));
}
console.log('\n=== Slide hop: saltar durante el deslizamiento ===');
let takeoff;
{
  const p = sprintUp(); S.startSlide(p); run(p, [], {}, 0.15); const before = hs(p), dir = { x: p.vel.x, z: p.vel.z }; const o = frame(p, [], { jump: true }); const after = hs(p);
  takeoff = after;
  ok(o.jumped && o.slideJump && p.vel.y > C.JUMP - 1 && p.vel.y <= C.JUMP && p.slide <= 0, 'saltar en pleno deslizamiento: salta hacia arriba (' + p.vel.y.toFixed(1) + ' m/s; el salto es de ' + C.JUMP + ' y la gravedad ya actúa) y termina el deslizamiento');
  ok(dirDot(dir, p.vel) > 0.99999, 'el vector de velocidad horizontal MANTIENE su dirección (desviación ' + (Math.acos(Math.min(1, dirDot(dir, p.vel))) * 57.3).toFixed(3) + '°)');
  ok(after >= before * 1.17 && after <= Math.min(M.MAX_H, before * 1.21) + 0.01, 'y se multiplica por el impulso ×' + M.SLIDE_JUMP + ': ' + before.toFixed(1) + ' → ' + after.toFixed(1) + ' m/s');
  const t0 = hs(p); run(p, [], {}, 0.5); ok(!p.onGround && hs(p) >= t0 * 0.95, 'en el aire, sin pulsar nada, conserva el ' + Math.round(hs(p) / t0 * 100) + ' % de la velocidad tras 0,5 s (casi sin rozamiento)');
  const n = sprintUp(); frame(n, [], { fwd: 1, sprint: true, jump: true }); run(n, [], {}, 0.4); ok(hs(n) < 1, 'un salto normal sin teclas sí pierde la velocidad en el aire (' + hs(n).toFixed(1) + ' m/s): el impulso es solo del slide hop');
}
{
  const p = sprintUp(); S.startSlide(p); frame(p, [], { jump: true }); const t0 = hs(p), h0 = Math.atan2(p.vel.z, p.vel.x); run(p, [], { str: 1 }, 0.45); const h1 = Math.atan2(p.vel.z, p.vel.x);
  let dh = h1 - h0; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  ok(Math.abs(dh) > 0.6 && hs(p) >= t0 * 0.9, 'en el aire se puede girar el rumbo (' + (Math.abs(dh) * 57.3).toFixed(0) + '°) sin perder velocidad (' + Math.round(hs(p) / t0 * 100) + ' %)');
}
console.log('\n=== Saltar al FINAL del deslizamiento ===');
{
  const p = sprintUp(); S.startSlide(p); run(p, [], {}, M.SLIDE_TIME + 0.02); ok(p.slide <= 0 && p.slideGrace > 0, 'el deslizamiento ya ha acabado'); run(p, [], {}, 0.08); const ended = p.slideSpeed, s = hs(p), grace = p.slideGrace;
  const o = frame(p, [], { jump: true }); ok(grace > 0.1 && o.slideJump && hs(p) >= Math.max(s, ended) * 1.17, 'saltar 0,10 s después de acabar (aún en el margen de ' + M.SLIDE_GRACE + ' s) TAMBIÉN da impulso: ' + s.toFixed(1) + ' → ' + hs(p).toFixed(1) + ' m/s');
  const q = sprintUp(); S.startSlide(q); run(q, [], {}, M.SLIDE_TIME + 0.02 + M.SLIDE_GRACE + 0.1); const o2 = frame(q, [], { jump: true }); ok(o2.jumped && !o2.slideJump && hs(q) < 1, 'fuera del margen (0,32 s después) es un salto normal, sin impulso (' + hs(q).toFixed(1) + ' m/s)');
  const r = sprintUp(); S.startSlide(r); run(r, [], {}, M.SLIDE_TIME + 0.02 + 0.15); ok(hs(r) > 5, 'y durante el margen el suelo no te frena de golpe (' + hs(r).toFixed(1) + ' m/s a los 0,15 s del final)');
}
console.log('\n=== Tope de velocidad (lo que vigila el servidor) ===');
{
  const p = mk(); p.vel.x = 14.9; p.vel.z = 0; S.startSlide(p); frame(p, [], { jump: true }); ok(hs(p) <= M.MAX_H + 0.001 && hs(p) >= M.MAX_H - 0.3, 'saliendo a 14,9 m/s el impulso se recorta al tope: ' + hs(p).toFixed(2) + ' ≤ ' + M.MAX_H + ' m/s');
  let mx = 0; const q = mk(); q.pos.z = 0; for (let cycle = 0; cycle < 12; cycle++) { run(q, [], { fwd: 1, sprint: true }, 0.4); S.startSlide(q); frame(q, [], { jump: true }); for (let i = 0; i < 90; i++) { frame(q, [], { fwd: 1, sprint: true }); mx = Math.max(mx, hs(q)); } }
  ok(mx <= M.MAX_H + 0.001 && mx > 12, 'encadenando slide hops sin parar la velocidad máxima es ' + mx.toFixed(2) + ' m/s (tope ' + M.MAX_H + ')');
  ok(M.MAX_H > M.SLIDE_V1 && M.MAX_H < 18, 'el tope es coherente: mayor que el deslizamiento (' + M.SLIDE_V1 + ') y razonable');
}
console.log('\n=== Coyote time y buffer de salto ===');
{
  const ledge = [{ minX: -20, maxX: 0, minZ: -20, maxZ: 20, minY: 0, maxY: 2 }];
  const off = jumpAt => {   // camina hacia el borde y pulsa Espacio `jumpAt` s después de dejar de pisar; cuenta solo el salto hecho EN EL AIRE (coyote), no el del buffer al aterrizar
    const p = mk(-1, 2, 0); p.onGround = true; let left = -1, t = 0, jumped = false;
    for (let i = 0; i < 240; i++) { const air = !p.onGround; if (air && left < 0) left = t; const o = frame(p, ledge, { str: 1, jump: left >= 0 && t - left >= jumpAt && t - left < jumpAt + DT * 1.5 }); if (o.jumped && air) jumped = true; t += DT; if (p.onGround && left >= 0) break; }
    return { jumped, vy: p.vel.y, left };
  };
  ok(M.COYOTE >= 0.05 && M.COYOTE <= 0.15, 'el coyote time es leve: ' + M.COYOTE * 1000 + ' ms');
  const a = off(0.03), b = off(0.08), c = off(0.16), d = off(0.3); ok(a.left >= 0 && a.jumped && b.jumped, 'pulsar 30 ms y 80 ms después de salir del borde SÍ salta');
  ok(!c.jumped && !d.jumped, 'pulsar 160 ms o 300 ms después ya no (estás cayendo)');
  const p = mk(-1, 2, 0); let jumps = 0, flew = false; for (let i = 0; i < 120; i++) { const air = !p.onGround; if (air) flew = true; const o = frame(p, ledge, { str: 1, jump: air }); if (o.jumped && air) jumps++; if (flew && p.onGround && i > 20) break; }
  ok(jumps === 1, 'aunque mantengas Espacio en el aire solo hay UN salto por el coyote (no hay doble salto): ' + jumps);
  const land = ahead => {   // se deja caer desde 2 m y toca Espacio `ahead` s antes de aterrizar
    const p = mk(0, 2, 0); p.onGround = false; let t = 0, tl = null, jumped = false; const g = (() => { const q = mk(0, 2, 0); q.onGround = false; let tt = 0; while (!q.onGround && tt < 3) { frame(q, [], {}); tt += DT; } return tt; })();
    for (let i = 0; i < 200; i++) { const o = frame(p, [], { jump: t >= g - ahead - DT && t < g - ahead }); if (o.jumped) jumped = true; t += DT; if (t > g + 0.3) break; } return { jumped };
  };
  ok(M.JUMP_BUF >= 0.08 && M.JUMP_BUF <= 0.2, 'el buffer de salto guarda la pulsación ' + M.JUMP_BUF * 1000 + ' ms'); ok(land(0.07).jumped && !land(0.3).jumped, 'un toque de Espacio 70 ms antes de aterrizar salta al tocar el suelo; 300 ms antes se olvida');
}
console.log('\n=== Salir por un borde deslizándose ===');
{
  const ledge = [{ minX: -20, maxX: 0, minZ: -20, maxZ: 20, minY: 0, maxY: 2 }], p = mk(-6, 2, 0); p.onGround = true; run(p, ledge, { str: 1, sprint: true }, 0.4); ok(S.startSlide(p), 'deslizándose sobre una plataforma…');
  let t = 0; while (p.onGround && t < 2) { frame(p, ledge, {}); t += DT; } frame(p, ledge, {}); const v0 = hs(p);   // un fotograma más: el paso siguiente a salir del borde es el que lo detecta ok(!p.onGround && p.slideHop, '…al salir por el borde conserva el impulso en el aire'); run(p, ledge, {}, 0.3); ok(hs(p) >= v0 * 0.95 && p.vel.y < 0, 'y sigue a ' + Math.round(hs(p) / v0 * 100) + ' % de la velocidad mientras cae (' + hs(p).toFixed(1) + ' m/s)');
  for (let i = 0; i < 120 && !p.onGround; i++) frame(p, ledge, {}); run(p, ledge, {}, 0.15); ok(p.onGround && !p.slideHop && hs(p) < 1, 'al aterrizar se acaba el impulso y la fricción normal vuelve (' + hs(p).toFixed(1) + ' m/s)');
}
console.log('\n=== Recorridos aleatorios en Nexus Outpost (paredes y tope del servidor) ===');
{
  const rnd = seed => { let s = seed >>> 0; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; };
  let n = 0, walls = 0, fast = 0, slow = 0, nan = 0, slides = 0, slideJumps = 0, maxV = 0;
  for (let m = 0; m < S.MAPS.length; m++) {
    const w = S.buildWorld(m), cols = w.colliders, inset = S.insetColliders(cols, 0.3), wps = w.waypoints;
    for (let k = 0; k < 320; k++) {
      const r = rnd(500 + m * 10 + k), p = mk(wps[0][0], 0, wps[0][1]); let tx = p.pos.x, tz = p.pos.z, tt = 0, keys = {}, kt = 0, prev = { x: p.pos.x, y: 0, z: p.pos.z };
      for (let f = 1; f <= 60 * 60; f++) {
        tt -= DT; if (tt <= 0) { const q = wps[Math.floor(r() * wps.length)]; tx = q[0]; tz = q[1]; tt = 1.5 + r() * 3; }
        kt -= DT; if (kt <= 0) { keys = { sprint: r() < 0.7, jump: r() < 0.3 }; kt = 0.3 + r() * 0.9; }
        const dx = tx - p.pos.x, dz = tz - p.pos.z, dl = Math.hypot(dx, dz) || 1, yaw = Math.atan2(-dx, -dz);   // el jugador «mira» al destino: adelante = hacia él
        const fwd = 1, sinY = Math.sin(yaw), cosY = Math.cos(yaw); let wx = -sinY * fwd, wz = -cosY * fwd; const speed = keys.sprint ? C.SPRINT : C.WALK;
        if (r() < 0.012) { if (S.startSlide(p)) slides++; }
        const o = S.moveStep(p, { wx, wz, fwd, str: 0, speed, jump: keys.jump }, DT); if (o.slideJump) slideJumps++; S.moveEntity(cols, p, DT);
        maxV = Math.max(maxV, hs(p)); if (!Number.isFinite(p.pos.x + p.pos.z + p.vel.x + p.vel.z)) nan++;
        if (f % 3 === 0) { const x = +p.pos.x.toFixed(3), y = +p.pos.y.toFixed(3), z = +p.pos.z.toFixed(3); n++;
          if (S.wallViolation(cols, inset, prev, x, y, z, 1.8)) walls++; if (Math.hypot(x - prev.x, z - prev.z) > (M.MAX_H + 0.5) * 0.05 + 2) fast++; prev = { x, y, z }; }
      }
    }
  }
  ok(slides > 100 && slideJumps > 30, 'recorridos con deslizamientos (' + slides + ') y slide hops (' + slideJumps + ') al azar');
  ok(nan === 0 && maxV <= M.MAX_H + 0.001, 'velocidad máxima alcanzada ' + maxV.toFixed(2) + ' m/s ≤ ' + M.MAX_H + ' (sin valores raros)');
  ok(walls === 0, 'el antitrampas de paredes no da NINGUNA corrección a esos movimientos legítimos (' + walls + ' de ' + n + ' posiciones)');
  ok(fast === 0, 'y el vigilante de velocidad del servidor (' + (M.MAX_H + 0.5) + '·dt + 2) los acepta todos (' + fast + ' rechazos)');
}
console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
