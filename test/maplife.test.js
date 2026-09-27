'use strict';
/* Vida de los mapas nuevos (solo decoración del navegador): gallinas que pasean y huyen, que se pueden abatir de un disparo y
   reaparecen; balón que se chuta al pasar por encima y rebota en las paredes; piscina con agua y flotadores; y al volver a
   Nexus Outpost no queda nada. Cliente real en jsdom. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
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
c = c.slice(0, i) + "window.__T = { buildMap, life, mapLife, animMap, shootLife, get fighters() { return fighters; }, set fighters(v) { fighters = v; } };\n" + c.slice(i);
w.eval(c);
const T = w.__T, THREE = w.THREE;
const run = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) T.animMap(dt); };
const fake = (x, z) => ({ alive: true, pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), isPlayer: true, name: 'P' });

console.log('=== Pueblo Duna ===');
T.buildMap(1); T.fighters = [];
ok(T.life.chickens.length >= 5 && T.life.ball && T.life.weeds.length === 3 && T.life.dust, 'hay ' + T.life.chickens.length + ' gallinas, un balón, 3 rodadoras y polvo en el aire');
const c0 = T.life.chickens[0], start = c0.pos.clone(); run(8);
ok(T.life.chickens.some(ch => ch.pos.distanceTo(start) > 0.5) && T.life.chickens.every(ch => Math.abs(ch.pos.x) < S.MAPS[1].half && Math.abs(ch.pos.z) < S.MAPS[1].half), 'las gallinas pasean y no se salen del pueblo');
const ch = T.life.chickens[1], me = fake(ch.pos.x + 1.5, ch.pos.z); T.fighters = [me]; const d0 = ch.pos.distanceTo(me.pos); run(1);
ok(ch.state === 'flee' || ch.pos.distanceTo(me.pos) > d0 + 0.8, 'una gallina huye cuando se le acerca un jugador (de ' + d0.toFixed(1) + ' m a ' + ch.pos.distanceTo(me.pos).toFixed(1) + ' m)');
T.fighters = [];
const target = T.life.chickens[2], o = new THREE.Vector3(target.pos.x - 6, target.pos.y + 0.42, target.pos.z), dir = new THREE.Vector3(1, 0, 0);
T.shootLife(o, dir, 50); ok(!target.alive && !target.mesh.visible, 'un disparo abate a la gallina (desaparece en una nube de plumas)');
run(35); ok(target.alive && target.mesh.visible, 'y al rato vuelve a aparecer');
const ball = T.life.ball, b0 = ball.e.pos.clone(), kicker = fake(b0.x - 0.6, b0.z); kicker.vel.set(6, 0, 0); T.fighters = [kicker]; run(0.1); T.fighters = []; run(1.5);
ok(ball.e.pos.x > b0.x + 2, 'pasar por encima del balón lo chuta en la dirección de la carrera (' + (ball.e.pos.x - b0.x).toFixed(1) + ' m)');
ball.e.pos.set(0, 0, 6); ball.e.vel.set(0, 0, 0); T.shootLife(new THREE.Vector3(-5, 0.33, 6), new THREE.Vector3(1, 0, 0), 50); run(1);
ok(ball.e.pos.x > 1, 'un disparo también empuja el balón');
ball.e.pos.set(0, 0, 6); ball.e.vel.set(0, 0, -25); run(3);
ok(Math.abs(ball.e.pos.z) < S.MAPS[1].half && ball.e.pos.y > -1 && Number.isFinite(ball.e.pos.x), 'lanzado contra el pozo rebota y se queda dentro del mapa');

console.log('\n=== Villa Piscina ===');
T.buildMap(2); T.fighters = [];
ok(T.life.water && T.life.floats.length === 2 && T.life.chickens.length === 0 && !T.life.ball, 'piscina con agua y dos flotadores (sin gallinas ni balón)');
const W = S.MAPS[2].look.water, f0 = T.life.floats[0]; run(20);
ok(T.life.floats.every(f => f.x > W.x0 && f.x < W.x1 && f.z > W.z0 && f.z < W.z1), 'los flotadores se mecen sin salirse de la piscina');
ok(S.MAPS[2].build && !S.overlapAt(S.buildWorld(2).colliders, 0, 0, 0, 0.35, 1.8), 'dentro de la piscina se puede estar de pie (el agua no es una pared)');

console.log('\n=== Volver a Nexus Outpost ===');
T.buildMap(0); ok(T.mapLife.children.length === 0 && T.life.chickens.length === 0 && !T.life.water, 'al cambiar de mapa no queda ni una gallina ni el agua');
ok(errors.length === 0, 'sin errores de JavaScript (' + errors.length + (errors[0] ? ': ' + errors[0] : '') + ')');
console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
