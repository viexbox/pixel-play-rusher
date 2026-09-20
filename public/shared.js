/* Pixel Play Rusher · código compartido entre el navegador y el servidor.
   Contiene armas, mapas, física y trazado de rayos. */
(function (root) {
'use strict';
const TAU = Math.PI * 2;
const CONST = { WALK: 6, SPRINT: 8.2, CROUCH: 3, JUMP: 8.2, GRAV: 24, STEP: 0.55, MATCH_TIME: 180, KILL_LIMIT: 25, RESPAWN: 3 };

const WEAPONS = [
  { id: 'asalto', name: 'Asalto', type: 'Fusil de asalto', desc: 'Equilibrado y fiable a cualquier distancia.', dmg: 20, interval: 0.1, mag: 30, reload: 1.7, spread: 0.011, pellets: 1, range: 130, kick: 0.006, fall: null, aimFov: 0.78, speed: 1, stats: [3, 4, 4], col: '#ff5a5f', size: [0.07, 0.1, 0.5], look: { mag: [0.05, 0.16, 0.08, -0.3], barrel: 0.5 }, optics: ['punto', 'hierro'] },
  { id: 'rafaga', name: 'Ráfaga', type: 'Subfusil', desc: 'Cadencia altísima para el cuerpo a cuerpo.', dmg: 13, interval: 0.055, mag: 40, reload: 1.5, spread: 0.026, pellets: 1, range: 70, kick: 0.004, fall: [15, 45, 0.5], aimFov: 0.85, speed: 1.08, stats: [2, 5, 2], col: '#3ddc97', size: [0.07, 0.1, 0.34], look: { mag: [0.04, 0.2, 0.06, -0.2], barrel: 0.35 }, optics: ['punto', 'hierro'] },
  { id: 'torrente', name: 'Torrente', type: 'Ametralladora ligera', desc: 'Cargador enorme, pero te ralentiza.', dmg: 16, interval: 0.08, mag: 100, reload: 3.4, spread: 0.03, pellets: 1, range: 110, kick: 0.005, fall: null, aimFov: 0.85, speed: 0.88, stats: [3, 5, 3], col: '#ff9f5a', size: [0.1, 0.12, 0.55], look: { mag: [0.12, 0.13, 0.14, -0.28], barrel: 0.5 }, optics: ['punto', 'hierro'] },
  { id: 'lince', name: 'Lince', type: 'Francotirador', desc: 'Un disparo a la cabeza elimina. Mira de precisión.', dmg: 80, head: 150, interval: 0.95, mag: 5, reload: 2.2, spread: 0.05, scopedSpread: 0.0015, pellets: 1, range: 300, kick: 0.03, fall: null, aimFov: 0.3333, scope: true, speed: 0.95, stats: [5, 1, 5], col: '#7ea6ff', size: [0.06, 0.08, 0.8], look: { scope: 0.28, barrel: 0.3 }, optics: ['scope3', 'scope6'] },
  { id: 'trueno', name: 'Trueno', type: 'Escopeta', desc: 'Devastadora a corta distancia.', dmg: 12, interval: 0.75, mag: 6, reload: 2.1, spread: 0.06, pellets: 8, range: 50, kick: 0.035, fall: [6, 22, 0.15], aimFov: 0.9, speed: 1, stats: [5, 2, 1], col: '#ffc857', size: [0.09, 0.12, 0.46], look: { barrel: 0.3, pump: true }, optics: ['punto', 'hierro'] },
  { id: 'sheriff', name: 'Sheriff', type: 'Revólver', desc: 'Dos disparos al cuerpo bastan.', dmg: 55, head: 110, interval: 0.5, mag: 6, reload: 2, spread: 0.005, pellets: 1, range: 110, kick: 0.028, fall: null, aimFov: 0.8, speed: 1.02, stats: [4, 2, 4], col: '#d9a441', size: [0.055, 0.09, 0.22], look: { drum: true, barrel: 0.6 }, optics: ['punto', 'hierro'] },
  { id: 'precision', name: 'Precisión', type: 'Semiautomático', desc: 'Disparos rápidos y certeros con mira óptica.', dmg: 36, head: 72, interval: 0.24, mag: 10, reload: 1.9, spread: 0.004, pellets: 1, range: 200, kick: 0.014, fall: null, aimFov: 0.5, speed: 1, stats: [4, 3, 5], col: '#a58bd6', size: [0.06, 0.09, 0.6], look: { scope: 0.16, barrel: 0.35 } },
  { id: 'duo', name: 'Dúo', type: 'Pistolas dobles', desc: 'Una en cada mano: cadencia alta, poco alcance.', dmg: 11, interval: 0.075, mag: 30, reload: 1.6, spread: 0.022, pellets: 1, range: 55, kick: 0.004, fall: [15, 40, 0.5], aimFov: 0.9, speed: 1.06, dual: true, stats: [2, 5, 2], col: '#5fd0e6', size: [0.05, 0.08, 0.2], look: { barrel: 0.3 } },
  { id: 'ak', name: 'AK', type: 'Fusil AK', desc: 'Daño alto y retroceso marcado. Elige tu mira: hierro, punto rojo, holográfica o ACOG.', dmg: 27, interval: 0.115, mag: 30, reload: 2.0, spread: 0.014, pellets: 1, range: 140, kick: 0.011, fall: [60, 140, 0.7], aimFov: 0.82, speed: 0.98, stats: [4, 3, 3], col: '#ffb020', size: [0.07, 0.1, 0.56], look: { mag: [0.05, 0.2, 0.08, -0.3], barrel: 0.5 }, optics: ['hierro', 'punto', 'holo', 'acog'] }
];
/* Miras: `fov` es el factor de campo de visión al apuntar (menor = más zoom); `h` la altura de la línea de mira sobre el arma. */
const OPTICS = {
  hierro: { name: 'Mira de hierro', kind: 'iron', fov: 0.86, h: 0.093 },
  punto: { name: 'Punto rojo', kind: 'dot', fov: 0.78, h: 0.095 },
  holo: { name: 'Holográfica', kind: 'holo', fov: 0.74, h: 0.104 },
  acog: { name: 'ACOG', kind: 'acog', fov: 0.4, h: 0.1 },
  scope3: { name: 'Mira ×3', kind: 'scope', fov: 0.3333, h: 0.105 },
  scope6: { name: 'Mira ×6', kind: 'scope', fov: 0.17, h: 0.105 }
};
/* Constructor de mapas: el navegador dibuja cada caja; el servidor solo guarda las colisiones. */
function makeBuilder(onBox, cols) {
  const b = {
    addBox(cx, y0, cz, w, h, d, color, solid = true) {
      if (onBox) onBox(cx, y0, cz, w, h, d, color, solid);
      if (solid) cols.push({ minX: cx - w / 2, maxX: cx + w / 2, minY: y0, maxY: y0 + h, minZ: cz - d / 2, maxZ: cz + d / 2 });
    },
    perimeter(half, h, color) {
      const s = half * 2 + 4;
      b.addBox(0, 0, -half - 1, s, h, 2, color); b.addBox(0, 0, half + 1, s, h, 2, color);
      b.addBox(-half - 1, 0, 0, 2, h, s, color); b.addBox(half + 1, 0, 0, 2, h, s, color);
    },
    /* El primer peldaño (k=0) está lejos; el último queda pegado a la plataforma. */
    stairs(sx, sz, dx, dz, n, top, w, color) {
      for (let k = 0; k < n; k++) {
        const cx = sx + dx * (k + 0.5), cz = sz + dz * (k + 0.5), h = (k + 1) * top / n;
        b.addBox(cx, 0, cz, dx !== 0 ? 1 : w, h, dz !== 0 ? 1 : w, color);
      }
    },
    mirror4(fn) { [1, -1].forEach(sx => [1, -1].forEach(sz => fn(sx, sz))); },
    horizon(count, rmin, rmax, hmin, hmax, wmin, wmax, colors) {
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + rnd() * 0.2, r = rmin + rnd() * (rmax - rmin), h = hmin + rnd() * (hmax - hmin), w = wmin + rnd() * (wmax - wmin);
        b.addBox(Math.cos(a) * r, 0, Math.sin(a) * r, w, h, w, colors[i % colors.length], false);
      }
    }
  };
  return b;
}

const MAPS = [
  {
    name: 'Almenas', half: 40, desc: 'Fortaleza con pirámide central y torres de esquina con escaleras. Mucho juego en vertical.',
    sky: ['#1f6dff', '#bfe4ff'], fog: '#bfe4ff', floor: ['#a7b6ff', '#8f9dff'], out: '#8f7bff', pal: ['#2f80ff', '#ffd23f', '#ff4d6d', '#2ec4b6', '#8b5cf6'],
    look: { floor: 'tile', wall: 'brick', block: 'stone', plat: 'stone', sun: '#fff1c9', decor: 'castle', wallH: 10 },
    build(b) {
      const P = { sky: '#4cc9f0', coral: '#ff4d6d', mint: '#2ec4b6', lilac: '#8b5cf6', sun: '#ff9f1c', sand: '#ffd23f', ink: '#5b3cc4' };
      b.perimeter(40, 10, P.lilac);
      b.addBox(0, 0, 0, 14, 1.2, 14, P.sand); b.addBox(0, 1.2, 0, 10, 1.2, 10, P.sun); b.addBox(0, 2.4, 0, 6, 1.2, 6, P.coral);
      b.mirror4((sx, sz) => {
        b.addBox(sx * 28, 0, sz * 28, 8, 5, 8, P.mint);
        b.stairs(sx * 15, sz * 28, sx, 0, 9, 4.5, 3, P.sun);
        b.addBox(sx * 14, 0, sz * 8, 3, 2.4, 8, P.coral);
        b.addBox(sx * 8, 0, sz * 20, 8, 2.4, 3, P.sky);
        b.addBox(sx * 24, 0, sz * 8, 4, 1.2, 4, P.lilac);
        b.addBox(sx * 30, 0, sz * 14, 2, 3, 10, P.sand);
        b.addBox(sx * 10, 0, sz * 10, 2, 1.2, 2, P.ink);
      });
      [1, -1].forEach(s => { b.addBox(0, 0, s * 22, 10, 3.6, 2, P.sky); b.addBox(s * 22, 0, 0, 2, 2.4, 10, P.mint); });
      b.horizon(26, 80, 125, 14, 54, 8, 20, ['#6d5bd0', '#ff7aa2', '#6d5bd0']);
    }
  },
  {
    name: 'Dunas', half: 44, desc: 'Ruinas del desierto: plaza amurallada, puestos de mercado y torres de vigilancia.',
    sky: ['#1183ff', '#ffd58a'], fog: '#ffd58a', floor: ['#f5bd66', '#e8a94a'], out: '#f2b45a', pal: ['#ffd58a', '#ffdc94', '#f0a55a', '#12c2b3', '#d9773a'],
    look: { floor: 'sandfloor', wall: 'sand', block: 'sand', hill: 'sandfloor', awning: 'awning', sun: '#ffe9b0', decor: 'desert', wallH: 9 },
    build(b) {
      const W = '#f0a55a', D = '#d9773a', T = '#12c2b3', L = '#ffe0a0';
      b.perimeter(44, 9, '#e08e45');
      // Plaza central con cuatro accesos
      [-10, 10].forEach(z => { b.addBox(-6.5, 0, z, 7, 4, 2, W); b.addBox(6.5, 0, z, 7, 4, 2, W); });
      [-10, 10].forEach(x => { b.addBox(x, 0, -6.5, 2, 4, 7, W); b.addBox(x, 0, 6.5, 2, 4, 7, W); });
      b.addBox(0, 0, 0, 4, 1.2, 4, D);
      // Torres de vigilancia
      b.addBox(0, 0, -36, 10, 4, 6, D); b.stairs(13, -36, -1, 0, 8, 4, 3, L);
      b.addBox(0, 0, 36, 10, 4, 6, D); b.stairs(-13, 36, 1, 0, 8, 4, 3, L);
      // Puestos de mercado
      const stall = (x, z) => {
        b.addBox(x, 0, z, 5, 1.1, 1.6, D); b.addBox(x - 2.4, 0, z - 1.1, 0.5, 3, 0.5, W); b.addBox(x + 2.4, 0, z - 1.1, 0.5, 3, 0.5, W);
        b.addBox(x, 3, z - 0.3, 6, 0.3, 3.2, T);
      };
      [-32, -20, 20, 32].forEach(x => [-24, 24].forEach(z => stall(x, z)));
      // Dunas escalonadas
      [-30, 30].forEach(x => { b.addBox(x, 0, 0, 14, 0.5, 14, L); b.addBox(x, 0.5, 0, 10, 0.5, 10, L); b.addBox(x, 1, 0, 6, 0.5, 6, L); b.addBox(x, 1.5, 0, 3, 0.5, 3, W); });
      b.mirror4((sx, sz) => { b.addBox(sx * 16, 0, sz * 16, 3, 1.2, 3, D); b.addBox(sx * 38, 0, sz * 14, 2, 3, 8, W); b.addBox(sx * 16, 0, sz * 32, 6, 2, 2, D); });
      b.horizon(22, 85, 130, 12, 30, 22, 38, ['#f2b45a', '#e8954a']);
    }
  },
  {
    name: 'Contenedores', half: 42, desc: 'Puerto industrial: pasillos de contenedores apilados, plataforma central y tejados accesibles.',
    sky: ['#2472ff', '#d6e6ff'], fog: '#cfdcf2', floor: ['#8f9bb3', '#7d8aa3'], out: '#7f8aa0', pal: ['#d6e6ff', '#b2bccd', '#e63946', '#1d6cf2', '#ffbe0b'],
    look: { floor: 'concfloor', wall: 'concrete', block: 'concrete', metal: 'metal', crate: 'crate', plat: 'concrete', sun: '#fff6e0', decor: 'port', wallH: 9 },
    build(b) {
      const C = ['#e63946', '#1d6cf2', '#ffbe0b', '#2ecc71', '#ff7b00', '#8e44ff']; let ci = 0; const col = () => C[(ci++) % C.length];
      b.perimeter(42, 9, '#8a96b0');
      const row = (z, xs) => xs.forEach(x => b.addBox(x, 0, z, 12, 2.6, 2.8, col()));
      row(-26, [-24, 0, 24]); row(-9, [-36, -12, 12, 36]); row(9, [-36, -12, 12, 36]); row(26, [-24, 0, 24]);
      // Segundo piso accesible por escaleras
      b.addBox(24, 2.6, -26, 12, 2.6, 2.8, col()); b.stairs(24, -13.6, 0, -1, 11, 5.2, 3, '#c9d1e0');
      b.addBox(-24, 2.6, 26, 12, 2.6, 2.8, col()); b.stairs(-24, 13.6, 0, 1, 11, 5.2, 3, '#c9d1e0');
      b.addBox(-12, 2.6, -9, 12, 2.6, 2.8, col()); b.addBox(12, 2.6, 9, 12, 2.6, 2.8, col());
      // Plataforma central
      b.addBox(0, 0, 0, 10, 2.5, 10, '#c9d1e0'); b.stairs(-10, 0, 1, 0, 5, 2.5, 3, '#9aa6be'); b.stairs(10, 0, -1, 0, 5, 2.5, 3, '#9aa6be');
      b.addBox(0, 2.5, 0, 3, 1.2, 3, col());
      b.mirror4((sx, sz) => { b.addBox(sx * 20, 0, sz * 17.5, 2.5, 1.2, 2.5, col()); b.addBox(sx * 3, 0, sz * 17, 1.6, 1.6, 1.6, '#5f6b85'); });
      b.horizon(24, 80, 125, 20, 58, 8, 14, ['#7f95c4', '#6d84b8']);
    }
  },
  {
    name: 'Bosque', half: 42, desc: 'Cabaña central, colinas escalonadas, troncos y árboles para cubrirte.',
    sky: ['#2a8cff', '#c9f2a8'], fog: '#c9f2a8', floor: ['#3fc24c', '#2fae3e'], out: '#38b04a', pal: ['#c9f2a8', '#5ad15f', '#1f9d55', '#9a5b2e', '#f0a860'],
    look: { floor: 'grass', wall: 'leaf', block: 'wood', trunk: 'bark', leaf: 'leaf', roof: 'roof', hill: 'grass', rock: 'stone', sun: '#fff3c9', decor: 'forest', wallH: 10 },
    build(b) {
      const G = '#4cd964', DG = '#1f9d55', BR = '#9a5b2e', ST = '#a3adc4', WD = '#f0a860';
      b.perimeter(42, 10, DG);
      // Cabaña
      b.addBox(0, 0, 0, 16, 0.5, 16, WD);
      [-7.5, 7.5].forEach(z => { b.addBox(-5.5, 0.5, z, 5, 3.5, 1, BR); b.addBox(5.5, 0.5, z, 5, 3.5, 1, BR); });
      [-7.5, 7.5].forEach(x => { b.addBox(x, 0.5, -5.5, 1, 3.5, 5, BR); b.addBox(x, 0.5, 5.5, 1, 3.5, 5, BR); });
      b.addBox(0, 4, 0, 18, 0.4, 18, '#e5484d'); b.addBox(0, 0.5, 0, 3, 1, 3, BR);
      // Colinas escalonadas
      b.mirror4((sx, sz) => { b.addBox(sx * 26, 0, sz * 26, 18, 0.5, 18, G); b.addBox(sx * 26, 0.5, sz * 26, 12, 0.5, 12, G); b.addBox(sx * 26, 1, sz * 26, 6, 0.5, 6, DG); });
      // Árboles
      [[-30, -10], [-10, -22], [12, -30], [32, 6], [-34, 2], [-16, 12], [16, -12], [8, -18], [-8, 20], [24, -2], [-24, -4], [0, -34], [0, 34], [-38, -30], [38, -12], [-38, 14], [30, 38]].forEach(([x, z]) => {
        b.addBox(x, 0, z, 1.4, 7, 1.4, BR); b.addBox(x, 6, z, 6, 2, 6, G); b.addBox(x, 8, z, 3.6, 1.6, 3.6, DG);
      });
      // Troncos y rocas
      b.addBox(-20, 0, 0, 8, 1.1, 1.6, BR); b.addBox(20, 0, 2, 1.6, 1.1, 8, BR);
      b.mirror4((sx, sz) => b.addBox(sx * 14, 0, sz * 20, 3, 1.6, 3, ST));
      b.horizon(26, 80, 125, 22, 46, 8, 14, ['#3fbf5a', '#2a9d4b']);
    }
  }
];
/* Colisiones */
function overlapAt(cols, x, y, z, hw, h) {
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (x + hw > c.minX && x - hw < c.maxX && z + hw > c.minZ && z - hw < c.maxZ && y + h > c.minY && y < c.maxY) return c;
  }
  return null;
}
function moveEntity(cols, e, dt) {
  const STEP = CONST.STEP, GRAV = CONST.GRAV;
  let hitWall = false;
  const nx = e.pos.x + e.vel.x * dt;
  if (!overlapAt(cols, nx, e.pos.y, e.pos.z, e.hw, e.h)) e.pos.x = nx;
  else if (e.onGround && !overlapAt(cols, nx, e.pos.y + STEP, e.pos.z, e.hw, e.h)) { e.pos.x = nx; e.pos.y += STEP; }
  else { e.vel.x = 0; hitWall = true; }
  const nz = e.pos.z + e.vel.z * dt;
  if (!overlapAt(cols, e.pos.x, e.pos.y, nz, e.hw, e.h)) e.pos.z = nz;
  else if (e.onGround && !overlapAt(cols, e.pos.x, e.pos.y + STEP, nz, e.hw, e.h)) { e.pos.z = nz; e.pos.y += STEP; }
  else { e.vel.z = 0; hitWall = true; }
  e.vel.y -= GRAV * dt;
  const ny = e.pos.y + e.vel.y * dt;
  e.onGround = false;
  if (!overlapAt(cols, e.pos.x, ny, e.pos.z, e.hw, e.h)) e.pos.y = ny;
  else {
    if (e.vel.y <= 0) {
      let top = -Infinity;
      for (const c of cols) if (e.pos.x + e.hw > c.minX && e.pos.x - e.hw < c.maxX && e.pos.z + e.hw > c.minZ && e.pos.z - e.hw < c.maxZ && ny + e.h > c.minY && ny < c.maxY) top = Math.max(top, c.maxY);
      e.pos.y = top; e.onGround = true;
    } else {
      let bot = Infinity;
      for (const c of cols) if (e.pos.x + e.hw > c.minX && e.pos.x - e.hw < c.maxX && e.pos.z + e.hw > c.minZ && e.pos.z - e.hw < c.maxZ && ny + e.h > c.minY && ny < c.maxY) bot = Math.min(bot, c.minY);
      e.pos.y = bot - e.h - 0.001;
    }
    e.vel.y = 0;
  }
  if (e.pos.y <= 0) { e.pos.y = 0; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
  return hitWall;
}

/* Rayos */
function rayBox(ox, oy, oz, dx, dy, dz, c) {
  let t0 = 0, t1 = Infinity;
  const axes = [[ox, dx, c.minX, c.maxX], [oy, dy, c.minY, c.maxY], [oz, dz, c.minZ, c.maxZ]];
  for (let i = 0; i < 3; i++) {
    const o = axes[i][0], d = axes[i][1], lo = axes[i][2], hi = axes[i][3];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; }
    else {
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}
function rayWorld(cols, o, d, maxT) {
  let best = maxT;
  for (let i = 0; i < cols.length; i++) { const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, cols[i]); if (t < best) best = t; }
  if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < best) best = t; }
  return best;
}
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc; if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc); return t >= 0 ? t : (-b + Math.sqrt(disc) >= 0 ? 0 : Infinity);
}
function rayCyl(o, d, cx, cz, r, y0, y1) {
  const a = d.x * d.x + d.z * d.z; if (a < 1e-9) return Infinity;
  const ox = o.x - cx, oz = o.z - cz;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c; if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  let t = (-b - s) / (2 * a); if (t < 0) t = (-b + s) / (2 * a); if (t < 0) return Infinity;
  const y = o.y + d.y * t; return (y >= y0 && y <= y1) ? t : Infinity;
}

/* Construye el mundo de un mapa: colisiones y puntos de paso/aparición. */
function buildWorld(i, onBox) {
  const m = MAPS[i], colliders = [], b = makeBuilder(onBox, colliders);
  m.build(b);
  const waypoints = [];
  for (let x = -(m.half - 4); x <= m.half - 4; x += 4) for (let z = -(m.half - 4); z <= m.half - 4; z += 4) if (!overlapAt(colliders, x, 0, z, 0.6, 1.8)) waypoints.push([x, z]);
  return { colliders, waypoints, half: m.half, map: m };
}

/* Economía (PX) y progreso: se comparten con el servidor, que es quien reparte y cobra en las cuentas online. */
const COLOR_COSTS = [0, 0, 0, 0, 150, 150, 300, 300, 500, 500];
const RANKS = [
  { n: 'Bronce', pts: 0, col: '#cd7f32', kr: 50 },
  { n: 'Plata', pts: 1500, col: '#c9d1e4', kr: 150 },
  { n: 'Oro', pts: 5000, col: '#ffd54a', kr: 400, color: 5 },
  { n: 'Platino', pts: 12000, col: '#63e6ff', kr: 800, color: 6 },
  { n: 'Diamante', pts: 25000, col: '#7aa2ff', kr: 1500, color: 8 },
  { n: 'Maestro', pts: 50000, col: '#ff4dd8', kr: 3000, color: 9 }
];
const EVENTS = [
  { name: 'Fin de semana', desc: 'Doble PX en todas las partidas.', mult: 2 },
  { name: 'Lunes de francotiradores', desc: '+50 % de PX jugando con el Lince.', mult: 1.5, cls: [3] },
  { name: 'Martes de escopetas', desc: '+50 % de PX jugando con el Trueno.', mult: 1.5, cls: [4] },
  { name: 'Miércoles de ráfagas', desc: '+50 % de PX con Ráfaga o Torrente.', mult: 1.5, cls: [1, 2] },
  { name: 'Jueves de pistoleros', desc: '+50 % de PX con Sheriff o Dúo.', mult: 1.5, cls: [5, 7] },
  { name: 'Viernes de bajas', desc: '+25 % de PX en todas las partidas.', mult: 1.25 },
  { name: 'Fin de semana', desc: 'Doble PX en todas las partidas.', mult: 2 }
];
const todayEvent = d => EVENTS[(d || new Date()).getDay()];
const eventMult = (ev, cls) => (!ev.cls || ev.cls.includes(cls)) ? ev.mult : 1;
const pxFor = (points, won, cls, d) => Math.round((points / 10 + (won ? 50 : 0)) * eventMult(todayEvent(d), cls));

/* ---------- Pase de batalla · Temporada 1 (catálogo compartido: el servidor concede, el cliente dibuja) ---------- */
const RARITY = {
  comun: { n: 'Común', c: '#9aa4b8', ord: 0 }, poco: { n: 'Poco común', c: '#4ade80', ord: 1 }, raro: { n: 'Raro', c: '#4aa8ff', ord: 2 },
  epico: { n: 'Épico', c: '#b56cff', ord: 3 }, leyenda: { n: 'Legendario', c: '#ffb020', ord: 4 }
};
/* Skins de armas: body = color del cajón, acc = franja y detalles, dark = cargador y piezas oscuras */
const WEAPON_SKINS = [
  { id: 'asalto_carbono', w: 'asalto', n: 'Carbono', r: 'comun', body: '#3a3f4b', acc: '#8b93a6', dark: '#1a1d24' },
  { id: 'rafaga_menta', w: 'rafaga', n: 'Menta', r: 'poco', body: '#5ee6b8', acc: '#eafff7', dark: '#1d5a49' },
  { id: 'torrente_bronce', w: 'torrente', n: 'Bronce', r: 'poco', body: '#b8763a', acc: '#ffd9a8', dark: '#4a2a12' },
  { id: 'sheriff_cobre', w: 'sheriff', n: 'Cobre viejo', r: 'raro', body: '#c8683c', acc: '#5ad1b0', dark: '#3a2418' },
  { id: 'lince_glaciar', w: 'lince', n: 'Glaciar', r: 'epico', body: '#9fe8ff', acc: '#ffffff', dark: '#1f4e66' },
  { id: 'rafaga_lava', w: 'rafaga', n: 'Lava', r: 'raro', body: '#2b1a1a', acc: '#ff5a1f', dark: '#5a1d0a' },
  { id: 'ak_jade', w: 'ak', n: 'Jade', r: 'raro', body: '#3fbf7f', acc: '#e9fff2', dark: '#134a30' },
  { id: 'torrente_hielo', w: 'torrente', n: 'Escarcha', r: 'raro', body: '#7fc8ff', acc: '#ffffff', dark: '#1c3f66' },
  { id: 'sheriff_bandido', w: 'sheriff', n: 'Bandido', r: 'poco', body: '#5a3b26', acc: '#e0c07a', dark: '#26170d' },
  { id: 'asalto_neon', w: 'asalto', n: 'Neón', r: 'epico', body: '#1a1030', acc: '#ff2bd6', dark: '#0d0820' },
  { id: 'trueno_tormenta', w: 'trueno', n: 'Tormenta', r: 'epico', body: '#39457a', acc: '#ffe14a', dark: '#161c3a' },
  { id: 'precision_eclipse', w: 'precision', n: 'Eclipse', r: 'epico', body: '#15121f', acc: '#ffb43a', dark: '#07060c' },
  { id: 'lince_fantasma', w: 'lince', n: 'Fantasma', r: 'leyenda', body: '#e9edf5', acc: '#7dffea', dark: '#5b6a80' },
  { id: 'duo_oro', w: 'duo', n: 'Oro macizo', r: 'leyenda', body: '#ffcf3a', acc: '#fff4b8', dark: '#8a5f00' },
  { id: 'ak_dragon', w: 'ak', n: 'Dragón', r: 'leyenda', body: '#c4161f', acc: '#ffd23a', dark: '#3a0a0e' }
];
/* Skins de cuchillo: hoja, filo, guarda y mango */
const KNIFE_SKINS = [
  { id: 'k_clasico', n: 'Acero clásico', r: 'comun', blade: '#dfe8f7', edge: '#ffffff', guard: '#c9973a', handle: '#4a2f18', base: true },
  { id: 'k_oxido', n: 'Óxido', r: 'comun', blade: '#a4643a', edge: '#d99a6c', guard: '#5a5f6b', handle: '#2b2b30' },
  { id: 'k_bosque', n: 'Bosque', r: 'poco', blade: '#8fb98a', edge: '#e2ffd8', guard: '#4b3a22', handle: '#2f5a2b' },
  { id: 'k_hielo', n: 'Hielo', r: 'raro', blade: '#a8e6ff', edge: '#ffffff', guard: '#5b8fb0', handle: '#27506b' },
  { id: 'k_lava', n: 'Lava', r: 'epico', blade: '#ff6a1a', edge: '#ffe08a', guard: '#2b1a1a', handle: '#4a1a10' },
  { id: 'k_neon', n: 'Neón', r: 'epico', blade: '#39ffd9', edge: '#e9fffb', guard: '#ff2bd6', handle: '#1a1030' },
  { id: 'k_oro', n: 'Oro real', r: 'leyenda', blade: '#ffd23a', edge: '#fff6c8', guard: '#c4161f', handle: '#3a2a08' },
  { id: 'k_vacio', n: 'Vacío', r: 'leyenda', blade: '#2a1f45', edge: '#b56cff', guard: '#7a3cff', handle: '#0d0820' }
];
const BANNERS = [{ id: 's1', n: 'Temporada 1', r: 'leyenda', c1: '#ffb020', c2: '#ff3b48', c3: '#1a1030', tag: 'S1' }];
const BP_LEVELS = 50;
const bpXpToNext = l => 250 + 20 * (l - 1);                                              // XP para pasar del nivel l al l+1
const bpTotalXp = l => { let t = 0; for (let i = 1; i < Math.min(l, BP_LEVELS); i++) t += bpXpToNext(i); return t; };   // XP acumulada para ALCANZAR el nivel l
const bpLevelOf = xp => { let l = 1; while (l < BP_LEVELS && xp >= bpTotalXp(l + 1)) l++; return { level: l, into: l >= BP_LEVELS ? 0 : xp - bpTotalXp(l), need: l >= BP_LEVELS ? 0 : bpXpToNext(l) }; };
const bpXpFor = (points, won) => Math.min(600, 40 + Math.round(Math.max(0, points) * 0.25) + (won ? 60 : 0));   // XP por partida online
const BP_PRICES = { vip: 1500, skipPerLevel: 120 };                                        // en PX
const bpPx = n => ({ t: 'px', n });
const bpItem = (t, id) => ({ t, id });
/* Recompensas por nivel (gratis y vip). Los niveles sin hito llevan PX, pocos: el VIP devuelve bastante menos PX de los que cuesta, para que comprarlo no sea rentable. */
const BP_FREE = { 5: bpItem('kskin', 'k_oxido'), 10: bpItem('wskin', 'asalto_carbono'), 15: bpItem('kskin', 'k_bosque'), 20: bpItem('wskin', 'rafaga_menta'), 26: bpItem('wskin', 'torrente_bronce'),
  30: bpItem('kskin', 'k_hielo'), 36: bpItem('wskin', 'sheriff_cobre'), 44: bpItem('wskin', 'lince_glaciar'), 50: bpPx(300) };
const BP_VIP = { 1: bpItem('banner', 's1'), 3: bpItem('wskin', 'rafaga_lava'), 6: bpItem('kskin', 'k_lava'), 9: bpItem('wskin', 'ak_jade'), 13: bpItem('wskin', 'torrente_hielo'), 16: bpItem('wskin', 'sheriff_bandido'),
  19: bpItem('kskin', 'k_neon'), 22: bpItem('wskin', 'asalto_neon'), 25: bpPx(250), 28: bpItem('wskin', 'trueno_tormenta'), 33: bpItem('kskin', 'k_oro'), 38: bpItem('wskin', 'precision_eclipse'),
  42: bpItem('wskin', 'lince_fantasma'), 46: bpItem('kskin', 'k_vacio'), 48: bpItem('wskin', 'duo_oro'), 50: bpItem('wskin', 'ak_dragon') };
const BP_TIERS = Array.from({ length: BP_LEVELS }, (_, i) => { const l = i + 1; return { level: l, free: BP_FREE[l] || bpPx(8 + Math.floor(l / 16) * 4), vip: BP_VIP[l] || bpPx(10 + Math.floor(l / 12) * 5) }; });
const bpFind = r => (r.t === 'wskin' ? WEAPON_SKINS : r.t === 'kskin' ? KNIFE_SKINS : r.t === 'banner' ? BANNERS : []).find(x => x.id === r.id) || null;
/* Nombre y rareza de cualquier recompensa (los PX se clasifican por cantidad) */
const bpInfo = r => {
  if (r.t === 'px') return { n: r.n + ' PX', r: r.n >= 400 ? 'epico' : r.n >= 200 ? 'raro' : r.n >= 100 ? 'poco' : 'comun' };
  const it = bpFind(r); return it ? { n: it.n, r: it.r } : { n: '?', r: 'comun' };
};

const api = { CONST, WEAPONS, OPTICS, MAPS, RARITY, WEAPON_SKINS, KNIFE_SKINS, BANNERS, BP_LEVELS, BP_TIERS, BP_PRICES, bpXpToNext, bpTotalXp, bpLevelOf, bpXpFor, bpFind, bpInfo, COLOR_COSTS, RANKS, EVENTS, todayEvent, eventMult, pxFor, buildWorld, overlapAt, moveEntity, rayBox, rayWorld, raySphere, rayCyl };
root.VoltShared = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
