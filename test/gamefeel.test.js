'use strict';
/* Game Feel (cliente real en jsdom): retroceso visual de la cámara con suavizado slerp/lerp y FOV dinámico por velocidad. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
function boot(reduceMotion) {
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer') || (!!reduceMotion && q.includes('prefers-reduced-motion')), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = () => Promise.reject(new Error('sin servidor'));
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  const i = client.lastIndexOf('})();');
  w.eval(client.slice(0, i) + 'window.__T = { get state() { return state; }, get player() { return player; }, get fighters() { return fighters; }, cfg, keys, step, camera, GF, recoilQ, recoilT, get recoilBack() { return recoilBack; }, get recoilBackT() { return recoilBackT; }, get fovBoost() { return fovBoost; }, dynFovTarget, addCameraRecoil, aimDirOf, WEAPONS, get slideK() { return slideK; }, setMouse(v) { mouseL = v; }, setMouseR(v) { mouseR = v; }, get curMap() { return curMap; }, damage };\n' + client.slice(i));
  return { w, THREE: w.THREE, T: w.__T, errors, $$: s => [...w.document.querySelectorAll(s)], $: s => w.document.querySelector(s), key: (code, type) => w.document.dispatchEvent(new w.KeyboardEvent(type || 'keydown', { code, bubbles: true })) };
}
const openSpot = T => { const world = S.buildWorld(T.curMap); let spot = null, best = 0;
  for (let x = -30; x <= 30; x += 5) for (let z = -30; z <= 30; z += 5) for (let k = 0; k < 8; k++) { const yaw = k * Math.PI / 4, d = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }; if (S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; const t = Math.min(S.rayWorld(world.colliders, { x, y: 0.9, z }, d, 60), 60); if (t > best) { best = t; spot = { x, z, yaw, best }; } } return spot; };
async function start(reduceMotion) {
  const B = boot(reduceMotion); await sleep(250); B.$$('#classes .cls')[0].click(); B.$('#play').click(); const T = B.T; for (let f = 0; f < 90; f++) T.step(1 / 60);
  const p = T.player; p.protect = 1e9; T.cfg.shake = 0; T.cfg.recoilCam = 100; T.cfg.fovSpeed = 8; const spot = openSpot(T);
  for (const f of T.fighters) if (!f.isPlayer) { f.ai.react = 99; f.protect = 1e9; f.pos.set(f.pos.x + 200, 0, f.pos.z + 200); }   // los bots lejos y quietos: aquí se prueba la cámara
  B.reset = () => { T.setMouse(false); T.setMouseR(false); for (const k of Object.keys(T.keys)) T.keys[k] = false; p.pos.set(spot.x, 0, spot.z); p.yaw = spot.yaw; p.pitch = 0; p.vel.set(0, 0, 0); p.slide = 0; p.slideCd = 0; p.slideGrace = 0; p.slideHop = false; p.hop = 1; p.onGround = true; p.aim = 0; p.ammo = 30; p.fireCd = 0; p.reload = 0; p.hp = 100; p.alive = true; for (let f = 0; f < 240; f++) T.step(1 / 60); };
  B.spot = spot; return B;
}
/* Desviación de la cámara respecto a hacia donde apunta el jugador: arriba (x), lado (y), ladeo (z), en radianes, y el tirón hacia atrás en metros */
function offset(B) {
  const { THREE, T } = B, p = T.player, qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ')), rel = qa.clone().invert().multiply(T.camera.quaternion), e = new THREE.Euler().setFromQuaternion(rel, 'YXZ');
  const eye = new THREE.Vector3(p.pos.x, p.pos.y + p.eye, p.pos.z), back = -T.camera.position.clone().sub(eye).dot(T.aimDirOf(p));
  return { up: e.x, side: e.y, roll: e.z, back, ang: 2 * Math.acos(Math.min(1, Math.abs(rel.w))) };
}
const shootOnce = (T, dt) => { T.setMouse(true); T.step(dt); T.setMouse(false); };

(async () => {
  console.log('=== Retroceso visual de la cámara ===');
  const B = await start(false), T = B.T, p = T.player; B.reset();
  let o = offset(B); ok(o.ang < 1e-4 && Math.abs(o.back) < 1e-4, 'en reposo la cámara mira exactamente hacia donde apunta el jugador (desviación ' + o.ang.toExponential(1) + ' rad)');
  const series = []; shootOnce(T, 1 / 60); series.push(offset(B)); for (let i = 1; i < 60; i++) { T.step(1 / 60); series.push(offset(B)); }
  const ups = series.map(s => s.up), peak = Math.max(...ups), pk = ups.indexOf(peak);
  ok(peak > 0.015 && peak < 0.06, 'un disparo del Asalto inclina la cámara HACIA ARRIBA ' + (peak * 57.3).toFixed(2) + '° (ligero: entre 0,9° y 3,4°)');
  ok(pk <= 6, 'sube rápido: el máximo llega en ' + pk + ' fotogramas (' + Math.round(pk * 16.7) + ' ms)');
  let mono = true; for (let i = pk + 1; i < ups.length; i++) if (ups[i] > ups[i - 1] + 1e-6) mono = false; ok(mono, 'y después vuelve SIN rebotes ni oscilaciones (retorno monótono)');
  ok(ups[pk + 15] < peak * 0.35 && ups[pk + 15] > 0, 'retorno suave: a los 0,25 s queda el ' + Math.round(ups[pk + 15] / peak * 100) + ' % del máximo');
  ok(ups[59] < 0.003 && series[59].ang < 0.004, 'y a los 1,0 s ha vuelto a la puntería (' + (series[59].ang * 57.3).toFixed(2) + '°)');
  const backs = series.map(s => s.back), bp = Math.max(...backs); ok(bp > 0.01 && bp <= T.GF.BACK_MAX && backs[59] < 0.002, 'la cámara da un tirón hacia ATRÁS de ' + (bp * 100).toFixed(1) + ' cm y vuelve a su sitio');
  ok(series.some(s => Math.abs(s.side) > 1e-4) && series.some(s => Math.abs(s.roll) > 1e-4), 'con un poco de desvío lateral (' + (Math.max(...series.map(s => Math.abs(s.side))) * 57.3).toFixed(2) + '°) y ladeo (' + (Math.max(...series.map(s => Math.abs(s.roll))) * 57.3).toFixed(2) + '°) aleatorios');

  console.log('\n=== Suavizado independiente del framerate ===');
  const at = async (fps, secs) => { B.reset(); const dt = 1 / fps; shootOnce(T, dt); const n = Math.round(secs * fps); for (let i = 1; i < n; i++) T.step(dt); return offset(B).up; };
  const u30 = await at(30, 0.25), u60 = await at(60, 0.25), u144 = await at(144, 0.25);
  ok(Math.abs(u30 - u60) / u60 < 0.25 && Math.abs(u144 - u60) / u60 < 0.25, 'a los 0,25 s el retroceso es parecido a 30, 60 y 144 fps (' + [u30, u60, u144].map(x => (x * 57.3).toFixed(2) + '°').join(' · ') + ')');

  console.log('\n=== Es solo visual: no desvía la puntería ===');
  const world = S.buildWorld(T.curMap), sp = B.spot, bot = T.fighters.find(f => !f.isPlayer && f.alive); bot.team = 1 - p.team;
  const dist = Math.min(20, sp.best - 3), bx = sp.x - Math.sin(sp.yaw) * dist, bz = sp.z - Math.cos(sp.yaw) * dist;
  const burst = recoil => { T.cfg.recoilCam = recoil; B.reset(); let dmg = 0, maxOff = 0; T.setMouse(true);
    for (let f = 0; f < 90; f++) { bot.pos.set(bx, 0, bz); bot.vel.set(0, 0, 0); bot.hp = 100; bot.protect = 0; const dx = bx - p.pos.x, dz = bz - p.pos.z, dy = 1.1 - (p.pos.y + p.eye); p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); T.step(1 / 60); dmg += 100 - bot.hp; maxOff = Math.max(maxOff, offset(B).ang); }
    T.setMouse(false); return { hits: Math.round(dmg / 20), maxOff }; };
  const on = [burst(100), burst(100), burst(100)], off = [burst(0), burst(0), burst(0)], avg = a => a.reduce((s, x) => s + x.hits, 0) / a.length;
  ok(on.every(x => x.maxOff > 0.02) && off.every(x => x.maxOff < 1e-4), 'durante una ráfaga la cámara SÍ se mueve con el retroceso activado (hasta ' + (Math.max(...on.map(x => x.maxOff)) * 57.3).toFixed(1) + '°) y con él a 0 % no');
  ok(avg(on) > 8 && Math.abs(avg(on) - avg(off)) <= 2.5, 'pero acierta lo mismo: ' + avg(on).toFixed(1) + ' impactos con retroceso y ' + avg(off).toFixed(1) + ' sin él, de unos 15 disparos (las balas salen de la puntería, no de la cámara)');

  console.log('\n=== Ajustes y límites ===');
  const peakOf = (recoil, ads) => { T.cfg.recoilCam = recoil; B.reset(); if (ads) { T.setMouseR(true); for (let i = 0; i < 40; i++) T.step(1 / 60); } shootOnce(T, 1 / 60); let m = 0; for (let i = 0; i < 12; i++) { m = Math.max(m, offset(B).up); T.step(1 / 60); } return m; };
  const p100 = peakOf(100), p50 = peakOf(50), p0 = peakOf(0), pads = peakOf(100, true);
  ok(p0 < 1e-6 && Math.abs(p50 / p100 - 0.5) < 0.03, '«Retroceso de cámara» al 50 % da la mitad (' + (p50 / p100).toFixed(2) + ') y al 0 % nada');
  ok(pads > 0 && Math.abs(pads / p100 - 0.6) < 0.06, 'al apuntar (ADS) el retroceso baja un 40 % (' + (pads / p100).toFixed(2) + ' del normal)');
  T.cfg.recoilCam = 100; B.reset(); for (let i = 0; i < 60; i++) T.addCameraRecoil(T.WEAPONS[3], p); ok(2 * Math.acos(Math.min(1, Math.abs(T.recoilT.w))) <= T.GF.RECOIL_MAX + 1e-6 && T.recoilBackT <= T.GF.BACK_MAX + 1e-9, 'acumular disparos tiene tope: ' + (T.GF.RECOIL_MAX * 57.3).toFixed(1) + '° y ' + (T.GF.BACK_MAX * 100).toFixed(0) + ' cm');
  B.reset(); for (let i = 0; i < 40; i++) { T.addCameraRecoil(T.WEAPONS[0], p); } for (let i = 0; i < 8; i++) T.step(1 / 60); const capped = offset(B); ok(capped.ang <= T.GF.RECOIL_MAX + 0.01, 'y la cámara nunca pasa de ese tope (' + (capped.ang * 57.3).toFixed(1) + '°)');
  ok(B.$('#recoilCam') && B.$('#fovSpeed') && B.$('#recoilCamO') && B.$('#fovSpeedO') && B.$('#recoilCam').value === '100' && B.$('#fovSpeed').value === '8', 'Ajustes tiene «Retroceso de cámara» (100 %) y «FOV dinámico» (+8°) con sus valores por defecto');
  B.$('#fovSpeed').value = '10'; B.$('#fovSpeed').dispatchEvent(new B.w.Event('input', { bubbles: true })); ok(T.cfg.fovSpeed === 10 && /\+10/.test(B.$('#fovSpeedO').textContent), 'el deslizante cambia el ajuste y su etiqueta («' + B.$('#fovSpeedO').textContent + '»)'); T.cfg.fovSpeed = 8;

  console.log('\n=== FOV dinámico ===');
  const f = T.dynFovTarget;
  ok(f(0) === 0 && f(8.8) === 0 && f(T.GF.FOV_SPEED_MIN) === 0, 'por debajo del umbral (' + T.GF.FOV_SPEED_MIN + ' m/s) no cambia: ni andando ni corriendo a 8,8 m/s');
  ok(f(11.2) >= 5 && f(11.2) <= 8 && Math.abs(f(T.GF.FOV_SPEED_FULL) - 8) < 1e-9 && f(30) === 8, 'lo supera: a 11,2 m/s ya +' + f(11.2).toFixed(1) + '° y a ' + T.GF.FOV_SPEED_FULL + ' m/s o más el máximo (+8°)');
  let inc = true; for (let s = 8; s < 16; s += 0.1) if (f(s + 0.1) < f(s) - 1e-12) inc = false; ok(inc, 'crece de forma continua y creciente con la velocidad (sin saltos)');
  T.cfg.fovSpeed = 10; ok(f(20) === 10, 'con el ajuste al máximo llega a +10°'); T.cfg.fovSpeed = 0; ok(f(20) === 0, 'y con el ajuste a 0 está desactivado'); T.cfg.fovSpeed = 8;
  const base = T.cfg.fov; B.reset(); ok(Math.abs(T.camera.fov - base) < 0.05, 'en reposo el FOV es el de Ajustes (' + T.camera.fov.toFixed(1) + '°)');
  B.reset(); T.keys.KeyW = true; for (let i = 0; i < 90; i++) T.step(1 / 60); const sprintV = Math.hypot(p.vel.x, p.vel.z); ok(sprintV > 8 && Math.abs(T.camera.fov - base) < 0.05, 'corriendo a ' + sprintV.toFixed(1) + ' m/s (bajo el umbral) el FOV no se mueve');
  /* slide hop: velocidad alta en el aire, sin el ensanchado del deslizamiento */
  let maxFov = base, maxBoost = 0, maxStep = 0, prevFov = T.camera.fov, fastFrames = 0; T.keys.ShiftLeft = true; B.key('ShiftLeft'); T.step(1 / 60); T.keys.ShiftLeft = false; B.key('ShiftLeft', 'keyup'); T.keys.Space = true; B.key('Space'); T.step(1 / 60); T.keys.Space = false; prevFov = T.camera.fov;
  for (let i = 0; i < 40; i++) { T.step(1 / 60); const s = Math.hypot(p.vel.x, p.vel.z); if (s > 13) fastFrames++; maxFov = Math.max(maxFov, T.camera.fov); maxBoost = Math.max(maxBoost, T.fovBoost); maxStep = Math.max(maxStep, Math.abs(T.camera.fov - prevFov)); prevFov = T.camera.fov; }
  ok(fastFrames > 15 && maxBoost > 5, 'en un slide hop (>13 m/s) el FOV dinámico sube a +' + maxBoost.toFixed(1) + '° (5–10°)');
  ok(maxFov - base <= T.GF.FOV_EXTRA_MAX + 0.05 && maxFov - base > 5, 'sumado al del deslizamiento el FOV nunca pasa de +' + T.GF.FOV_EXTRA_MAX + '° (máximo visto +' + (maxFov - base).toFixed(1) + '°)');
  ok(maxStep < 1.6, 'y cambia con suavidad: como mucho ' + maxStep.toFixed(2) + '° por fotograma');
  T.keys.KeyW = false; T.keys.ShiftLeft = false; for (let i = 0; i < 120; i++) T.step(1 / 60); ok(Math.abs(T.camera.fov - base) < 0.3 && T.fovBoost < 0.1, 'al parar vuelve al FOV de Ajustes en menos de 2 s (' + T.camera.fov.toFixed(1) + '°)');
  B.reset(); T.setMouseR(true); T.keys.KeyW = true; T.keys.ShiftLeft = false; for (let i = 0; i < 40; i++) T.step(1 / 60); T.fovBoost; p.vel.x = 0; p.vel.z = 0;
  { const Bq = T; let m = 0; B.reset(); Bq.setMouseR(true); for (let i = 0; i < 40; i++) Bq.step(1 / 60); Bq.player.vel.set(0, 0, 0); const aimFov = Bq.camera.fov; ok(aimFov <= base + 0.05, 'apuntando (ADS) no se aplica el FOV extra (' + aimFov.toFixed(1) + '° ≤ ' + base + '°)'); }
  T.setMouseR(false);

  console.log('\n=== Limpieza, accesibilidad y errores ===');
  B.reset(); shootOnce(T, 1 / 60); T.step(1 / 60); ok(offset(B).ang > 0.005, 'preparación: hay retroceso en curso'); p.alive = false; T.step(1 / 60); T.step(1 / 60); ok(T.recoilQ.w === 1 && T.recoilBack === 0 && T.fovBoost === 0, 'al morir se borra el retroceso y el FOV extra (no se arrastran al reaparecer)'); p.alive = true;
  const R = await start(true), RT = R.T; R.reset(); RT.cfg.recoilCam = 100; RT.cfg.fovSpeed = 8; shootOnce(RT, 1 / 60); for (let i = 0; i < 6; i++) RT.step(1 / 60);
  ok(offset(R).ang < 1e-6 && RT.dynFovTarget(15) === 0, 'con «reducir movimiento» del sistema activado: no hay retroceso de cámara ni FOV dinámico');
  ok(B.errors.length === 0 && R.errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(B.errors.concat(R.errors)));
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
