'use strict';
/* Viewmodel (arma en 1ª persona): vaivén senoidal según la velocidad y lerp de apuntado (ADS) con la mira alineada al centro de la pantalla.
   Parte 1: módulo puro (S.createViewmodel / S.viewmodelSight). Parte 2: cliente real en jsdom con todas las armas. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js'); const THREE_N = require('../public/vendor/three.min.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const V = S.VIEWMODEL, HIP = { x: 0.2, y: -0.2, z: -0.35 }, SIGHT = { x: 0, y: 0.06, z: 0 };
const mk = p => S.createViewmodel(Object.assign({ IDLE_Y: 0 }, p));
/* Simula `secs` segundos a `fps` con esa entrada y devuelve la serie de poses */
function run(vm, secs, fps, inp) { const out = [], n = Math.round(secs * fps), dt = 1 / fps; for (let i = 0; i < n; i++) { const p = vm.update(dt, inp); out.push({ px: p.px, py: p.py, pz: p.pz, rx: p.rx, rz: p.rz, ads: p.ads }); } return out; }
const stats = (a, key, base) => { const v = a.map(x => x[key] - (base || 0)), mean = v.reduce((s, x) => s + x, 0) / v.length; return { amp: (Math.max(...v) - Math.min(...v)) / 2, mean, v }; };
/* frecuencia por cruces por cero y qué tan senoidal es (ajuste por mínimos cuadrados de a·sin+b·cos; residuo relativo) */
function wave(a, key, fps, base, fExp) {   // ajuste por mínimos cuadrados de A·sin + B·cos + C (con constante: con ciclos incompletos la media no es 0) alrededor de la frecuencia esperada
  const { v } = stats(a, key, base), n = v.length; let best = { res: Infinity, f: fExp };
  const solve = (M, y) => { const d = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]); const c = (k) => { const T = M.map((r, i) => r.map((x, j) => (j === k ? y[i] : x))); return (T[0][0] * (T[1][1] * T[2][2] - T[1][2] * T[2][1]) - T[0][1] * (T[1][0] * T[2][2] - T[1][2] * T[2][0]) + T[0][2] * (T[1][0] * T[2][1] - T[1][1] * T[2][0])) / d; }; return [c(0), c(1), c(2)]; };
  let ev = 0; for (const y of v) ev += y * y;
  for (let f = fExp * 0.93; f <= fExp * 1.07; f += fExp * 0.0004) {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], y = [0, 0, 0];
    for (let i = 0; i < n; i++) { const t = i / fps, b = [Math.sin(2 * Math.PI * f * t), Math.cos(2 * Math.PI * f * t), 1]; for (let r = 0; r < 3; r++) { y[r] += v[i] * b[r]; for (let c = 0; c < 3; c++) M[r][c] += b[r] * b[c]; } }
    const [A, B, C] = solve(M, y); let res = 0; for (let i = 0; i < n; i++) { const t = i / fps; res += (v[i] - (A * Math.sin(2 * Math.PI * f * t) + B * Math.cos(2 * Math.PI * f * t) + C)) ** 2; }
    if (res < best.res) best = { res, f };
  }
  const mean = v.reduce((s, x) => s + x, 0) / n; let vv = 0; for (const x of v) vv += (x - mean) ** 2;
  return { f: best.f, resid: Math.sqrt(best.res / vv) };
}
const walk = (v, extra) => Object.assign({ speed: v, onGround: true, adsTarget: false, hip: HIP, sight: SIGHT }, extra);
const fy = v => 2 * V.BOB_STRIDE * v / (2 * Math.PI);

console.log('=== Weapon bobbing: ondas senoidales según la velocidad ===');
{
  let vm = S.createViewmodel(), r = run(vm, 3, 60, walk(0)); const sp = stats(r, 'py', HIP.y); ok(sp.amp <= V.IDLE_Y * 1.01 && r.every(x => x.px === HIP.x && x.rx === 0 && x.rz === 0), 'parado: solo una respiración de ' + (sp.amp * 1000).toFixed(2) + ' mm, sin vaivén lateral ni giros');
  vm = mk(); run(vm, 0.5, 240, walk(7.4)); r = run(vm, 3, 240, walk(7.4)); let y = stats(r, 'py', HIP.y), wy = wave(r, 'py', 240, HIP.y, fy(7.4)), wx = wave(r, 'px', 240, HIP.x, fy(7.4) / 2);
  ok(Math.abs(wy.f / fy(7.4) - 1) < 0.04, 'a 7,4 m/s el vaivén vertical oscila a ' + wy.f.toFixed(2) + ' Hz (esperado ' + fy(7.4).toFixed(2) + ' Hz = 2·zancada·velocidad/2π)');
  ok(Math.abs(y.amp / V.BOB_Y - 1) < 0.05, 'con amplitud ' + (y.amp * 1000).toFixed(2) + ' mm (BOB_Y = ' + V.BOB_Y * 1000 + ' mm)');
  ok(wy.resid < 0.03 && wx.resid < 0.03, 'y es una SENOIDE: la onda vertical y la lateral se ajustan a un seno con un residuo del ' + (wy.resid * 100).toFixed(1) + ' % y ' + (wx.resid * 100).toFixed(1) + ' %');
  ok(Math.abs(wx.f / (wy.f / 2) - 1) < 0.05 && Math.abs(stats(r, 'px', HIP.x).amp / V.BOB_X - 1) < 0.05, 'el balanceo lateral va a la mitad de frecuencia (' + wx.f.toFixed(2) + ' Hz, un paso a cada lado) con ' + (stats(r, 'px', HIP.x).amp * 1000).toFixed(1) + ' mm; el ladeo y el cabeceo acompañan (' + (stats(r, 'rz').amp * 57.3).toFixed(2) + '° / ' + (stats(r, 'rx').amp * 57.3).toFixed(2) + '°)');
  const half = mk(); run(half, 0.6, 240, walk(3.7)); const rh = run(half, 3, 240, walk(3.7)), fast = mk(); run(fast, 0.6, 240, walk(12)); const rf = run(fast, 3, 240, walk(12));
  const wh = wave(rh, 'py', 240, HIP.y, fy(3.7)), wf = wave(rf, 'py', 240, HIP.y, fy(12));
  ok(Math.abs(wh.f / wy.f - 0.5) < 0.03 && Math.abs(wf.f / wy.f - 12 / 7.4) < 0.05, 'la FRECUENCIA sigue a la velocidad: 3,7 m/s → ' + wh.f.toFixed(2) + ' Hz (la mitad), 12 m/s → ' + wf.f.toFixed(2) + ' Hz (×' + (wf.f / wy.f).toFixed(2) + ')');
  ok(Math.abs(stats(rh, 'py', HIP.y).amp / V.BOB_Y - 3.7 / V.BOB_SPEED_REF) < 0.05 && Math.abs(stats(rf, 'py', HIP.y).amp / V.BOB_Y - 1) < 0.05, 'y la AMPLITUD crece con ella hasta un tope: 3,7 m/s → ' + (stats(rh, 'py', HIP.y).amp / V.BOB_Y * 100).toFixed(0) + ' % · 12 m/s → ' + (stats(rf, 'py', HIP.y).amp / V.BOB_Y * 100).toFixed(0) + ' %');
}
{
  const vm = mk(); run(vm, 1, 60, walk(7.4)); const ph = vm.state.phase; const air = run(vm, 0.6, 60, walk(7.4, { onGround: false })); const late = stats(air.slice(-6), 'py', HIP.y);
  ok(vm.state.phase === ph && Math.abs(late.mean) < V.BOB_Y * 0.06, 'en el aire la fase se congela y el vaivén se apaga (queda un ' + Math.abs(late.mean / V.BOB_Y * 100).toFixed(1) + ' %)');
  const st = mk(); run(st, 1, 60, walk(7.4)); const stop = run(st, 0.8, 60, walk(0)); let maxStep = 0; for (let i = 1; i < stop.length; i++) maxStep = Math.max(maxStep, Math.abs(stop[i].py - stop[i - 1].py));
  ok(maxStep < 0.0009 && Math.abs(stats(stop.slice(-6), 'py', HIP.y).amp) < V.BOB_Y * 0.1, 'al parar el vaivén se desvanece con suavidad (cambio máximo por fotograma ' + (maxStep * 1000).toFixed(2) + ' mm)');
  const ph2 = fps => { const v = mk(); run(v, 1, fps, walk(7.4)); return v.state.phase; }, a30 = ph2(30), a60 = ph2(60), a144 = ph2(144);
  ok(Math.abs(a30 / a60 - 1) < 0.005 && Math.abs(a144 / a60 - 1) < 0.005, 'la fase depende de la distancia, no del framerate: 30, 60 y 144 fps dan ' + [a30, a60, a144].map(x => x.toFixed(3)).join(' · ') + ' rad');
  const am = fps => { const v = mk(); run(v, 0.3, fps, walk(7.4)); return v.state.amp; }; ok(Math.abs(am(30) / am(144) - 1) < 0.02, 'y la amplitud también aparece igual de rápido a cualquier framerate');
  const ads = mk(); run(ads, 1, 60, walk(7.4, { adsTarget: true })); const ra = run(ads, 2, 240, walk(7.4, { adsTarget: true })); const aa = stats(ra, 'py', ra[0].py - (ra[0].py - (-SIGHT.y))).amp;
  ok(Math.abs(stats(ra, 'py').amp / V.BOB_Y - V.BOB_ADS) < 0.02, 'al apuntar el vaivén baja al ' + Math.round(stats(ra, 'py').amp / V.BOB_Y * 100) + ' % (' + V.BOB_ADS * 100 + ' %): la mira no baila');
}
console.log('\n=== ADS: lerp suave y mira alineada con el centro de la pantalla ===');
{
  const vm = mk(), r = run(vm, 1, 240, { speed: 0, onGround: true, adsTarget: true, hip: HIP, sight: SIGHT }), t90 = r.findIndex(x => x.ads >= 0.9) / 240;
  let mono = true; for (let i = 1; i < r.length; i++) if (r[i].ads < r[i - 1].ads - 1e-12 || r[i].px > r[i - 1].px + 1e-12 || r[i].py < r[i - 1].py - 1e-12) mono = false;
  ok(Math.abs(t90 - Math.log(10) / V.ADS_RATE) < 0.02 && mono, 'el factor ADS sube con un lerp exponencial: 90 % a los ' + (t90 * 1000).toFixed(0) + ' ms (' + (Math.log(10) / V.ADS_RATE * 1000).toFixed(0) + ' ms teóricos) y el arma se mueve siempre en el mismo sentido (hacia el centro: X baja, Y sube)');
  const f = ms => { const v = mk(); run(v, ms / 1000, ms < 0 ? 60 : 30, { speed: 0, onGround: true, adsTarget: true, hip: HIP, sight: SIGHT }); return v.state.ads; };
  const g = fps => { const v = mk(); run(v, 0.1, fps, { speed: 0, onGround: true, adsTarget: true, hip: HIP, sight: SIGHT }); return v.state.ads; }; ok(Math.abs(g(30) / g(60) - 1) < 0.015 && Math.abs(g(144) / g(60) - 1) < 0.015, 'la transición dura lo mismo a 30, 60 y 144 fps (' + [g(30), g(60), g(144)].map(x => x.toFixed(3)).join(' · ') + ' a los 100 ms)');
  const end = r[r.length - 1]; ok(end.px === 0 && Math.abs(end.py + SIGHT.y) < 1e-12 && end.pz === HIP.z && end.ads === 1, 'al llegar, el arma está EXACTAMENTE en x = 0, y = −altura de la mira (' + end.py.toFixed(3) + ') y a la profundidad de la cadera');
  let maxJ = 0; for (let i = 1; i < r.length; i++) maxJ = Math.max(maxJ, Math.hypot(r[i].py - r[i - 1].py, r[i].px - r[i - 1].px)); const travel = Math.hypot(HIP.x - end.px, HIP.y - end.py); ok(maxJ < travel * 0.09, 'sin saltos: recorre ' + (travel * 1000).toFixed(0) + ' mm y el mayor avance por fotograma a 240 fps es de ' + (maxJ * 1000).toFixed(1) + ' mm (' + (maxJ / travel * 100).toFixed(1) + ' %; un salto de golpe sería el 100 %)');
}
{
  const sights = [{ x: 0, y: 0.058 }, { x: 0, y: 0.075 }, { x: 0.012, y: 0.04 }, { x: -0.02, y: 0.09 }]; let maxErr = 0, dz = 0, monoAll = true;
  for (const sg of sights) {
    const vm = mk(), inp = { speed: 0, onGround: true, adsTarget: true, hip: HIP, sight: { x: sg.x, y: sg.y, z: 0 } }; let prev = Infinity;
    for (let i = 0; i < 300; i++) { const p = vm.update(1 / 120, inp), q = S.viewmodelSight(p, inp.sight), d = Math.hypot(q.x, q.y); if (d > prev + 1e-12) monoAll = false; prev = d; if (i === 299) { maxErr = Math.max(maxErr, d); dz = Math.max(dz, Math.abs(q.z - HIP.z)); } }
  }
  ok(maxErr < 1e-9 && dz < 1e-12, 'CUALQUIER punto de mira (4 modelos, también descentrados) termina en el centro exacto de la pantalla (error ' + maxErr.toExponential(1) + ' m) a la profundidad de la cadera');
  ok(monoAll, 'y durante la transición la mira se ACERCA al centro sin pasarse (distancia siempre decreciente)');
  const mv = mk(), inp = { speed: 7.4, onGround: true, adsTarget: true, hip: HIP, sight: SIGHT }; run(mv, 1, 60, inp); let worst = 0; for (const p of run(mv, 3, 240, inp)) { const q = S.viewmodelSight({ px: p.px, py: p.py, pz: p.pz, rx: p.rx, ry: 0, rz: p.rz }, SIGHT); worst = Math.max(worst, Math.hypot(q.x, q.y)); }
  ok(worst < 0.0015, 'apuntando y corriendo la mira se desvía como mucho ' + (worst * 1000).toFixed(2) + ' mm del centro (vaivén reducido)');
  const back = mk(), b = { speed: 0, onGround: true, hip: HIP, sight: SIGHT }; run(back, 1, 60, Object.assign({ adsTarget: true }, b)); const rel = run(back, 1, 60, Object.assign({ adsTarget: false }, b)), e = rel[rel.length - 1]; ok(e.px === HIP.x && e.py === HIP.y && e.ads === 0, 'al soltar el botón vuelve exactamente a la posición de cadera');
}
console.log('\n=== Otros casos ===');
{
  const vm = mk(), inp = { speed: 0, onGround: true, adsTarget: true, hip: HIP, sight: null }, r = run(vm, 1, 240, inp), e = r[r.length - 1]; let maxJ = 0; for (let i = 1; i < r.length; i++) maxJ = Math.max(maxJ, Math.abs(r[i].py - r[i - 1].py));
  ok(e.px === 0 && Math.abs(e.py - (HIP.y + V.ADS_FALLBACK_LIFT)) < 1e-12 && maxJ < 0.005, 'sin punto de mira (arma sin óptica): se centra en X y sube ' + V.ADS_FALLBACK_LIFT * 1000 + ' mm, con transición suave (antes daba un salto de golpe)');
  const c = mk(), pc = c.update(1 / 60, { speed: 0, onGround: true, adsTarget: true, hip: HIP, ads: { x: 0.01, y: -0.1, z: -0.3 } }); for (let i = 0; i < 300; i++) c.update(1 / 60, { speed: 0, onGround: true, adsTarget: true, hip: HIP, ads: { x: 0.01, y: -0.1, z: -0.3 } }); const q = c.pose; ok(Math.abs(q.px - 0.01) < 1e-9 && Math.abs(q.py + 0.1) < 1e-9 && Math.abs(q.pz + 0.3) < 1e-9, 'se puede dar la posición ADS a mano (`ads`)');
  const d = mk(); ok(d.update(1 / 60, { speed: 0, onGround: true, adsFactor: 0.5, hip: HIP, sight: SIGHT }).ads === 0.5 && d.state.ads === 0.5, 'o dirigir el factor desde el motor (`adsFactor`) sin suavizado propio');
  const x = mk(), px = x.update(1 / 60, { speed: 0, onGround: true, hip: HIP, sight: SIGHT, extra: { py: -0.1, pz: 0.05, rx: -0.4, ry: 0.2, rz: 0.1 } }); ok(Math.abs(px.py - (HIP.y - 0.1)) < 1e-12 && Math.abs(px.pz - (HIP.z + 0.05)) < 1e-12 && px.rx === -0.4 && px.ry === 0.2 && px.rz === 0.1, '`extra` suma retroceso, recarga o cambio de arma a la pose');
  const n = S.createViewmodel({ BOB_Y: 0, BOB_X: 0, BOB_ROLL: 0, BOB_PITCH: 0, IDLE_Y: 0 }); const rn = run(n, 1, 60, walk(7.4)); ok(rn.every(z => z.py === HIP.y && z.px === HIP.x), 'los parámetros se pueden cambiar (BOB_* = 0 desactiva el vaivén)');
  const rs = mk(); run(rs, 1, 60, walk(7.4, { adsTarget: true })); rs.reset(); ok(rs.state.ads === 0 && rs.state.phase === 0 && rs.state.amp === 0, 'reset() limpia el estado');
  let maxD = 0; for (let k = 0; k < 200; k++) { const pose = { px: Math.random() - 0.5, py: Math.random() - 0.5, pz: -Math.random(), rx: (Math.random() - 0.5) * 2, ry: (Math.random() - 0.5) * 2, rz: (Math.random() - 0.5) * 2 }, sg = { x: Math.random() * 0.1 - 0.05, y: Math.random() * 0.1, z: Math.random() * 0.2 - 0.1 };
    const o = new THREE_N.Object3D(); o.position.set(pose.px, pose.py, pose.pz); o.rotation.set(pose.rx, pose.ry, pose.rz); o.updateMatrix(); const t = new THREE_N.Vector3(sg.x, sg.y, sg.z).applyMatrix4(o.matrix), m = S.viewmodelSight(pose, sg); maxD = Math.max(maxD, Math.hypot(t.x - m.x, t.y - m.y, t.z - m.z)); }
  ok(maxD < 1e-9, 'viewmodelSight coincide con Three.js (Object3D, Euler XYZ) en 200 poses al azar: diferencia máxima ' + maxD.toExponential(1) + ' m');
}

console.log('\n=== En el juego (cliente real): todas las armas ===');
(async () => {
  const PUB = path.join(__dirname, '..', 'public'), sleep = ms => new Promise(r => setTimeout(r, ms));
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
  const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} }); const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('x'));
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; }; w.eval(shared);
  const errors = []; w.addEventListener('error', e => errors.push(e.message)); const i = client.lastIndexOf('})();');
  w.eval(client.slice(0, i) + 'window.__T = { get player() { return player; }, get fighters() { return fighters; }, cfg, keys, step, gun, sightH, opticOf, viewmodel, WEAPONS, setMouseR(v) { mouseR = v; }, setMouse(v) { mouseL = v; }, get curMap() { return curMap; } };\n' + client.slice(i));
  const T = w.__T; await sleep(250); w.document.querySelectorAll('#classes .cls')[0].click(); w.document.querySelector('#play').click(); w.document.querySelector('#eqPlay').click(); for (let f = 0; f < 90; f++) T.step(1 / 60);
  const p = T.player; p.protect = 1e9; T.cfg.shake = 0; T.cfg.recoilCam = 0; for (const f of T.fighters) if (!f.isPlayer) { f.ai.react = 99; f.protect = 1e9; f.pos.set(f.pos.x + 200, 0, f.pos.z + 200); }
  T.viewmodel.params.IDLE_Y = 0;
  const sp = (() => { const world = S.buildWorld(T.curMap); let best = null, bt = 0; for (let x = -30; x <= 30; x += 5) for (let z = -30; z <= 30; z += 5) for (let k = 0; k < 8; k++) { const yaw = k * Math.PI / 4, d = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }; if (S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; const t = Math.min(S.rayWorld(world.colliders, { x, y: 0.9, z }, d, 60), 60); if (t > bt) { bt = t; best = { x, z, yaw }; } } return best; })();
  const reset = () => { T.setMouseR(false); T.setMouse(false); for (const k of Object.keys(T.keys)) T.keys[k] = false; p.pos.set(sp.x, 0, sp.z); p.yaw = sp.yaw; p.pitch = 0; p.vel.set(0, 0, 0); p.slide = 0; p.onGround = true; p.hp = 100; p.alive = true; p.aim = 0; p.reload = 0; p.ammo = 99; p.fireCd = 0; T.viewmodel.reset(); for (let f = 0; f < 180; f++) T.step(1 / 60); };
  const sightOf = () => S.viewmodelSight({ px: T.gun.position.x, py: T.gun.position.y, pz: T.gun.position.z, rx: T.gun.rotation.x, ry: T.gun.rotation.y, rz: T.gun.rotation.z }, { x: 0, y: T.sightH(T.WEAPONS[p.wi], T.opticOf(T.WEAPONS[p.wi])), z: 0 });
  let withSight = 0, aligned = 0, worstE = 0, without = 0, lifted = 0;
  for (let k = 0; k < T.WEAPONS.length; k++) {
    const wp = T.WEAPONS[k], opt = T.opticOf(wp); reset(); p.wi = k; p.ammo = wp.mag; for (let f = 0; f < 30; f++) T.step(1 / 60); T.setMouseR(true); for (let f = 0; f < 60; f++) T.step(1 / 60);
    if (opt) { withSight++; const q = sightOf(); worstE = Math.max(worstE, Math.hypot(q.x, q.y)); if (Math.hypot(q.x, q.y) < 0.0015) aligned++; } else { without++; if (Math.abs(T.gun.position.x) < 1e-6 && Math.abs(T.gun.position.y - (-0.2 + 0.03)) < 1e-3) lifted++; }
  }
  ok(withSight >= 6 && aligned === withSight, 'las ' + withSight + ' armas con mira quedan con su punto de mira en el centro de la pantalla al apuntar (peor error ' + (worstE * 1000).toFixed(2) + ' mm)');
  ok(lifted === without, 'y las ' + without + ' sin mira se centran y suben 3 cm (' + lifted + '/' + without + ')');
  reset(); p.wi = 0; p.ammo = 99; const ys = []; T.setMouseR(true); for (let f = 0; f < 30; f++) { T.step(1 / 60); ys.push(T.gun.position.y); }
  let mono = true, maxStep = 0; for (let j = 1; j < ys.length; j++) { if (ys[j] < ys[j - 1] - 1e-9) mono = false; maxStep = Math.max(maxStep, ys[j] - ys[j - 1]); } const trav = ys[29] - ys[0]; ok(mono && trav > 0.05 && maxStep < trav * 0.75, 'la transición al apuntar en el juego sube el arma hacia el centro de forma continua (' + (trav * 1000).toFixed(0) + ' mm en 0,5 s, sin volver atrás; el primer fotograma a 60 fps avanza el ' + (maxStep / trav * 100).toFixed(0) + ' %)');
  reset(); T.keys.KeyW = true; T.keys.ShiftLeft = true; for (let f = 0; f < 60; f++) T.step(1 / 60); const pyv = [], pxv = []; for (let f = 0; f < 90; f++) { T.step(1 / 60); pyv.push(T.gun.position.y); pxv.push(T.gun.position.x); }
  const p2p = a => Math.max(...a) - Math.min(...a); ok(p2p(pyv) > 0.008 && p2p(pyv) < 0.02 && p2p(pxv) > 0.006, 'corriendo en el juego el arma oscila ' + (p2p(pyv) * 1000).toFixed(1) + ' mm en vertical y ' + (p2p(pxv) * 1000).toFixed(1) + ' mm en lateral');
  reset(); for (let f = 0; f < 60; f++) T.step(1 / 60); const q = []; for (let f = 0; f < 90; f++) { T.step(1 / 60); q.push(T.gun.position.y); } ok(p2p(q) < 0.0005, 'y parado no se mueve (' + (p2p(q) * 1000).toFixed(2) + ' mm)');
  reset(); T.setMouseR(true); T.keys.KeyW = true; T.keys.ShiftLeft = true; for (let f = 0; f < 60; f++) T.step(1 / 60); let worst = 0; for (let f = 0; f < 90; f++) { T.step(1 / 60); const s2 = sightOf(); worst = Math.max(worst, Math.hypot(s2.x, s2.y)); } ok(worst < 0.0025, 'apuntando y corriendo la mira sigue a ' + (worst * 1000).toFixed(2) + ' mm del centro (< 2,5 mm)');
  ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors));
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
