'use strict';
/* [RAMPAS] Rampas para deslizarse (slide hop estilo Krunker): en cada rampa de los dos mapas se sube andando, al deslizarse cuesta
   abajo se gana velocidad (sin pasar del tope del servidor) y se sigue pegado a la rampa, al saltar al final se conserva el impulso,
   cuesta arriba se frena, el antitrampas no ve nada raro, los bots llegan arriba y el cliente la dibuja como una cuña. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const DT = 1 / 60, M = S.MOVE;
const hs = e => Math.hypot(e.vel.x, e.vel.z);
const ent = (x, y, z) => ({ pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, hw: 0.35, h: 1.8, onGround: true });
const UP = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
function ramps(mi) { const out = []; S.buildWorld(mi, (cx, y0, cz, w, h, d, color, solid, tag) => { if (tag && tag.startsWith('ramp:')) { const [, dir, low] = tag.split(':'); out.push({ cx, cz, w, h, d, dir, low: +low, top: h }); } }); return out; }
/* avanza con la física real; jumpAt(e) decide cuándo saltar; devuelve registro de estados */
function run(cols, e, dir, frames, opts) {
  opts = opts || {}; const log = []; let slid = false;
  for (let f = 0; f < frames; f++) {
    if (opts.slide && !slid && e.onGround && (e.ramp || opts.flat)) slid = S.startSlide(e);
    const o = S.moveStep(e, { wx: dir[0], wz: dir[1], fwd: 1, str: 0, speed: S.CONST.SPRINT, jump: !!(opts.jumpAt && opts.jumpAt(e)) }, DT);
    S.moveEntity(cols, e, DT); log.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, v: hs(e), g: e.onGround, r: !!e.ramp, j: o.jumped });
  }
  return log;
}

for (let mi = 0; mi < S.MAPS.length; mi++) {
  const m = S.MAPS[mi], w = S.buildWorld(mi), cols = w.colliders, inset = S.insetColliders(cols, 0.3), rs = ramps(mi);
  console.log('\n=== ' + m.name + ' ===');
  ok(rs.length >= 4 && cols.filter(c => c.rp).length >= 4 * 30, rs.length + ' rampas (' + cols.filter(c => c.rp).length + ' escalones finos de 0,25 m para la física)');
  let upOk = 0, downOk = 0, hopOk = 0, brake = 0, bad = 0, over = 0, stuck = 0, navOk = 0; const vmax = [], vflat = [];
  for (const r of rs) {
    const u = UP[r.dir], len = u[0] ? r.w : r.d, lowX = r.cx - u[0] * len / 2, lowZ = r.cz - u[1] * len / 2, hiX = r.cx + u[0] * len / 2, hiZ = r.cz + u[1] * len / 2;
    /* subir andando desde el pie */
    const a = ent(lowX - u[0] * 2, 0, lowZ - u[1] * 2); a.vel.x = u[0] * 7; a.vel.z = u[1] * 7;
    const la = run(cols, a, u, 180); if (la.some(s => Math.abs(s.x - (hiX - u[0] * 0.6)) + Math.abs(s.z - (hiZ - u[1] * 0.6)) < 0.8 && Math.abs(s.y - r.top) < 0.3)) upOk++;
    /* bajar deslizándose desde arriba y saltar al final */
    const b = ent(hiX + u[0] * 0.6, r.top, hiZ + u[1] * 0.6); b.vel.x = -u[0] * 8.8; b.vel.z = -u[1] * 8.8;
    const lb = run(cols, b, [-u[0], -u[1]], 110, { slide: true, jumpAt: e => e.onGround && e.ramp && Math.hypot(e.pos.x - lowX, e.pos.z - lowZ) < 1.4 });
    const onRamp = lb.filter(s => Math.hypot(s.x - r.cx, s.z - r.cz) < len / 2 - 0.8 && Math.abs(s.y - 0) > 0.05);
    const mx = Math.max(...lb.map(s => s.v)); vmax.push(mx); if (mx > M.MAX_H + 1e-6) over++;
    if (onRamp.length > 10 && onRamp.filter(s => !s.g).length <= 3) downOk++; else stuck++;
    const ji = lb.findIndex(s => s.j); if (ji >= 0 && lb[ji].v >= 14.5 && lb.slice(ji, ji + 15).every(s => s.v >= 14)) hopOk++;
    for (let k = 3; k < lb.length; k += 3) if (S.wallViolation(cols, inset, lb[k - 3], +lb[k].x.toFixed(3), +lb[k].y.toFixed(3), +lb[k].z.toFixed(3), 1.8)) bad++;
    /* el mismo deslizamiento en llano, para comparar */
    const f = ent(0, 0, 0); f.vel.x = 8.8; const lf = run([], f, [1, 0], 60, { slide: true, flat: true }); vflat.push(Math.max(...lf.map(s => s.v)));
    /* cuesta arriba deslizándose: frena más que en llano */
    const c = ent(lowX - u[0] * 1.5, 0, lowZ - u[1] * 1.5); c.vel.x = u[0] * 12; c.vel.z = u[1] * 12; c.slide = M.SLIDE_TIME; c.slideSpeed = 12;
    const lc = run(cols, c, u, 30); const cflat = ent(0, 0, 0); cflat.vel.x = 12; cflat.slide = M.SLIDE_TIME; cflat.slideSpeed = 12; const lcf = run([], cflat, [1, 0], 30);
    if (lc[lc.length - 1].v < lcf[lcf.length - 1].v - 1) brake++;
    /* bots: la navegación lleva de abajo arriba */
    const nav = w.nav, field = S.navField(nav, hiX - u[0] * 0.8, hiZ - u[1] * 0.8, r.top); if (S.navDir(nav, field, lowX - u[0] * 2, lowZ - u[1] * 2, 0)) navOk++;
  }
  const n = rs.length;
  ok(upOk === n, 'en las ' + n + ' rampas se sube andando hasta arriba, sin saltar (' + upOk + '/' + n + ')');
  ok(downOk === n, 'bajando deslizándose se va pegado a la rampa, sin despegarse en cada escalón (' + downOk + '/' + n + ')');
  ok(Math.min(...vmax) >= 14.5 && Math.min(...vmax) > Math.max(...vflat) + 2, 'cuesta abajo se gana velocidad: hasta ' + Math.min(...vmax).toFixed(1) + '–' + Math.max(...vmax).toFixed(1) + ' m/s (en llano el deslizamiento llega a ' + Math.max(...vflat).toFixed(1) + ')');
  ok(over === 0, 'y nunca pasa del tope del servidor (MAX_H = ' + M.MAX_H + ' m/s), así que el antitrampas de velocidad no corrige a nadie');
  ok(hopOk === n, 'saltar al final de la rampa conserva el impulso en el aire (slide hop): ' + hopOk + '/' + n);
  ok(brake === n, 'deslizarse cuesta arriba frena más que en llano (' + brake + '/' + n + ')');
  ok(bad === 0, 'el antitrampas de paredes no ve nada raro en ninguna bajada (' + bad + ' avisos)');
  ok(navOk === n, 'la navegación de los bots lleva de abajo a lo alto de cada rampa (' + navOk + '/' + n + ')');
}

console.log('\n=== Cliente: la rampa se dibuja como una cuña ===');
{
  const PUB = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} }); const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('x'));
  w.eval(fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8')); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8')); const c = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8'), i = c.lastIndexOf('})();'), errors = []; w.addEventListener('error', e => errors.push(e.message));
  w.eval(c.slice(0, i) + 'window.__T = { rampGeo, buildMap };\n' + c.slice(i));
  const g = w.__T.rampGeo(3, 3.6, 9, 'N', 0), P = g.attributes.position; let lowTop = 0, highTop = 0;
  for (let k = 0; k < P.count; k++) { const y = P.getY(k) + 1.8; if (y > 3.5) { if (P.getZ(k) < 0) highTop++; } else if (y < 0.1 && P.getZ(k) > 0 && P.getY(k) > -1.79) lowTop++; }
  ok(highTop >= 2 && lowTop >= 2 && g.index.count === 36, 'la cara de arriba sube de 0 m (extremo bajo, +z) a 3,6 m (extremo alto, −z) al subir hacia el norte, con los mismos 12 triángulos de una caja');
  let slope = 0; const N = g.attributes.normal; for (let k = 0; k < N.count; k++) if (N.getY(k) > 0.5 && N.getY(k) < 0.99 && N.getZ(k) > 0.1) slope++;
  ok(slope >= 3, 'y la cara inclinada mira hacia arriba y hacia el lado bajo (sombreado correcto)');
  for (let mi = 0; mi < S.MAPS.length; mi++) w.__T.buildMap(mi);
  ok(errors.length === 0, 'los dos mapas se construyen con sus rampas sin errores de JavaScript');
  w.close();
}
console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
