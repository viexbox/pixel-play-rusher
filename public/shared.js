/* Krunxa · código compartido entre el navegador y el servidor.
   Contiene armas, mapas, física y trazado de rayos. */
(function (root) {
'use strict';
const TAU = Math.PI * 2;
/* [AJUSTE estilo Krunker] Más velocidad, salto más seco y gravedad mayor (menos tiempo en el aire). El servidor vigila la velocidad con MOVE.MAX_H (15,5 m/s): el bunny hop llega a ~11 m/s, el deslizamiento a ~12,4 y un slide hop a ~14,9. */
const CONST = { WALK: 7.4, SPRINT: 8.8, CROUCH: 4.2, JUMP: 8.6, GRAV: 27, STEP: 0.55, MATCH_TIME: 480, KILL_LIMIT: 40, RESPAWN: 3, SHOP_START_CASH: 800, SHOP_KILL_CASH: 350 };   // [NUEVO] economía de la tienda de armas

/* [ARMAS KRUNKER] Daño, cadencia, cargador, recarga y velocidad al estilo de Krunker (los nombres son nuestros) */
const WEAPONS = [
  { id: 'asalto', name: 'Asalto', type: 'Fusil de asalto', desc: 'Equilibrado y fiable a cualquier distancia.', dmg: 23, interval: 0.11, mag: 30, reload: 1.5, spread: 0.011, pellets: 1, range: 130, kick: 0.006, fall: null, aimFov: 0.78, speed: 1, stats: [3, 4, 4], col: '#ff5a5f', size: [0.07, 0.1, 0.5], look: { mag: [0.05, 0.16, 0.08, -0.3], barrel: 0.5 }, optics: ['punto', 'hierro'] },
  { id: 'rafaga', name: 'Ráfaga', type: 'Subfusil', desc: 'Cadencia altísima para el cuerpo a cuerpo.', dmg: 18, interval: 0.07, mag: 24, reload: 1.2, spread: 0.026, pellets: 1, range: 70, kick: 0.004, fall: [15, 45, 0.5], aimFov: 0.85, speed: 1.04, stats: [2, 5, 2], col: '#3ddc97', size: [0.07, 0.1, 0.34], look: { mag: [0.04, 0.2, 0.06, -0.2], barrel: 0.35 }, optics: ['punto', 'hierro'] },
  { id: 'torrente', name: 'Torrente', type: 'Ametralladora ligera', desc: 'Cargador de 60 balas, pero te ralentiza.', dmg: 20, interval: 0.09, mag: 60, reload: 3.375, spread: 0.03, pellets: 1, range: 110, kick: 0.005, fall: null, aimFov: 0.85, speed: 0.8, stats: [3, 5, 3], col: '#ff9f5a', size: [0.1, 0.12, 0.55], look: { mag: [0.12, 0.13, 0.14, -0.28], barrel: 0.5 }, optics: ['punto', 'hierro'] },
  { id: 'lince', name: 'Lince', type: 'Francotirador', desc: 'Un disparo elimina. Mira de precisión.', dmg: 100, head: 150, interval: 0.9, mag: 3, reload: 1.875, spread: 0.05, scopedSpread: 0.0015, pellets: 1, range: 300, kick: 0.03, fall: null, aimFov: 0.3333, scope: true, speed: 0.95, stats: [5, 1, 5], col: '#7ea6ff', size: [0.06, 0.08, 0.8], look: { scope: 0.28, barrel: 0.3 }, optics: ['scope3', 'scope6'] },
  { id: 'trueno', name: 'Trueno', type: 'Escopeta', desc: 'Devastadora a corta distancia.', dmg: 12, interval: 0.4, mag: 2, reload: 1.25, spread: 0.06, pellets: 8, range: 50, kick: 0.035, fall: [6, 22, 0.15], aimFov: 0.9, speed: 1, stats: [5, 2, 1], col: '#ffc857', size: [0.09, 0.12, 0.46], look: { barrel: 0.3, pump: true }, optics: ['punto', 'hierro'] },
  { id: 'sheriff', name: 'Sheriff', type: 'Revólver', desc: 'Dos disparos al cuerpo bastan.', dmg: 66, head: 120, interval: 0.39, mag: 6, reload: 1.125, spread: 0.005, pellets: 1, range: 110, kick: 0.028, fall: null, aimFov: 0.8, speed: 1.02, stats: [4, 2, 4], col: '#d9a441', size: [0.055, 0.09, 0.22], look: { drum: true, barrel: 0.6 }, optics: ['punto', 'hierro'] },
  { id: 'precision', name: 'Precisión', type: 'Semiautomático', desc: 'Disparos rápidos y certeros con mira óptica.', dmg: 34, head: 68, interval: 0.12, mag: 8, reload: 1.8, spread: 0.004, pellets: 1, range: 200, kick: 0.014, fall: null, aimFov: 0.5, speed: 1, stats: [4, 3, 5], col: '#a58bd6', size: [0.06, 0.09, 0.6], look: { scope: 0.16, barrel: 0.35 } },
  { id: 'duo', name: 'Dúo', type: 'Pistolas dobles', desc: 'Una en cada mano: cadencia alta, poco alcance.', dmg: 18, interval: 0.06, mag: 36, reload: 1.5, spread: 0.022, pellets: 1, range: 55, kick: 0.004, fall: [15, 40, 0.5], aimFov: 0.9, speed: 1.06, dual: true, stats: [2, 5, 2], col: '#5fd0e6', size: [0.05, 0.08, 0.2], look: { barrel: 0.3 } },
  { id: 'ak', name: 'AK', type: 'Fusil AK', desc: 'Daño alto y retroceso marcado. Elige tu mira: hierro, punto rojo, holográfica o ACOG.', dmg: 27, interval: 0.115, mag: 30, reload: 2.0, spread: 0.014, pellets: 1, range: 140, kick: 0.011, fall: [60, 140, 0.7], aimFov: 0.82, speed: 0.98, stats: [4, 3, 3], col: '#ffb020', size: [0.07, 0.1, 0.56], look: { mag: [0.05, 0.2, 0.08, -0.3], barrel: 0.5 }, optics: ['hierro', 'punto', 'holo', 'acog'] },
  /* [NUEVO] Armas añadidas al final para no cambiar los números de clase existentes */
  { id: 'vortice', name: 'Vórtice', type: 'Subfusil táctico', desc: 'Cadencia y control: a media distancia supera a los subfusiles clásicos.', dmg: 15, interval: 0.07, mag: 32, reload: 1.6, spread: 0.017, pellets: 1, range: 90, kick: 0.005, fall: [25, 60, 0.6], aimFov: 0.84, speed: 1.04, stats: [3, 5, 3], col: '#c77dff', size: [0.07, 0.1, 0.4], look: { mag: [0.04, 0.18, 0.07, -0.25], barrel: 0.4 }, optics: ['punto', 'hierro'] },
  { id: 'centinela', name: 'Centinela', type: 'Fusil de batalla', desc: 'Tres disparos al cuerpo o dos a la cabeza. Preciso y contundente.', dmg: 48, head: 96, interval: 0.36, mag: 12, reload: 2.2, spread: 0.006, pellets: 1, range: 220, kick: 0.02, fall: null, aimFov: 0.55, speed: 0.96, stats: [5, 2, 5], col: '#2dd4bf', size: [0.07, 0.1, 0.62], look: { scope: 0.18, barrel: 0.4 } },
  /* [ARMAS KRUNKER] Las que faltaban de la lista de Krunker (van al final: no cambian los números de clase).
     burst = balas por ráfaga y burstCd = pausa entre ráfagas · proj = proyectil (v m/s, g gravedad, splash radio de la explosión, life s) */
  { id: 'triada', name: 'Tríada', type: 'Fusil de ráfaga', desc: 'Ráfagas de tres balas: letal a media distancia si aciertas las tres.', dmg: 28, interval: 0.07, burst: 3, burstCd: 0.38, mag: 30, reload: 1.5, spread: 0.009, pellets: 1, range: 150, kick: 0.007, fall: [70, 150, 0.7], aimFov: 0.78, speed: 1, stats: [4, 3, 4], col: '#8fd14f', size: [0.07, 0.1, 0.46], look: { mag: [0.05, 0.16, 0.08, 0.02], barrel: 0.3 }, optics: ['punto', 'hierro'] },
  { id: 'cometa', name: 'Cometa', type: 'Lanzacohetes', desc: 'Cohetes que explotan al chocar: daño en área, aunque falles por poco.', dmg: 127, interval: 1, mag: 1, reload: 2, spread: 0.003, pellets: 1, range: 200, kick: 0.045, fall: null, aimFov: 0.8, speed: 0.88, proj: { v: 45, g: 0, splash: 5, life: 4.5 }, stats: [5, 1, 3], col: '#ff6b35', size: [0.1, 0.08, 0.7], look: { tube: true }, optics: ['hierro'] },
  { id: 'arpon', name: 'Arpón', type: 'Ballesta', desc: 'Virotes silenciosos que caen con la distancia: un tiro a la cabeza elimina.', dmg: 90, head: 150, interval: 0.5, mag: 1, reload: 1.25, spread: 0.003, pellets: 1, range: 250, kick: 0.02, fall: null, aimFov: 0.7, speed: 1, proj: { v: 85, g: 9, life: 3 }, stats: [5, 1, 4], col: '#b07a3f', size: [0.08, 0.1, 0.62], look: { bow: true }, optics: ['hierro', 'punto'] }
];
/* Miras: `fov` es el factor de campo de visión al apuntar (menor = más zoom); `h` la altura de la línea de mira sobre el arma. */
/* [AJUSTE estilo Krunker] Recargas un 20 % más cortas: menos tiempo indefenso, más ritmo de combate. El servidor usa los mismos valores. */
WEAPONS.forEach(w => { w.reload = +(w.reload * 0.8).toFixed(2); });

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
    addBox(cx, y0, cz, w, h, d, color, solid = true, tag) {
      if (onBox) onBox(cx, y0, cz, w, h, d, color, solid, tag);
      if (solid) cols.push({ minX: cx - w / 2, maxX: cx + w / 2, minY: y0, maxY: y0 + h, minZ: cz - d / 2, maxZ: cz + d / 2 });
    },
    /* Caja por RANGOS (x0..x1, z0..z1, y0..y1). tag = textura explícita ('glass', 'helipad', 'crate'…); solid = false → decoración sin colisión. */
    box(x0, x1, z0, z1, y0, y1, color, tag, solid = true) { b.addBox((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color, solid, tag); },
    /* Escalera recta que SUBE hacia dir ('N' = −z, 'S' = +z, 'E' = +x, 'W' = −x). a = coordenada donde arranca el primer peldaño (la del eje de marcha), c = centro en el otro eje,
       w = ancho, n peldaños de 1 m que suben `rise` cada uno; y0 = altura del suelo DE ARRANQUE (0 en el suelo, 1,8 en la plaza…): el último peldaño queda a y0 + n·rise. Cada peldaño es una columna maciza desde `base`. */
    run(dir, a, c, w, n, y0, rise, color, tag, base = 0) {
      const sg = dir === 'N' || dir === 'W' ? -1 : 1, alongX = dir === 'E' || dir === 'W';
      for (let k = 0; k < n; k++) {
        const p = a + sg * (k + 0.5), top = y0 + (k + 1) * rise;
        if (alongX) b.addBox(p, base, c, 1, top - base, w, color, true, tag); else b.addBox(c, base, p, w, top - base, 1, color, true, tag);
      }
    },
    /* [RAMPAS] Rampa lisa que SUBE hacia dir ('N' = −z, 'S' = +z, 'E' = +x, 'W' = −x) de y0 a y1 por el rango x0..x1 × z0..z1.
       Para la física son escalones finos de 0,25 m (se suben solos con CONST.STEP, así que balas, bots y antitrampas no cambian);
       cada escalón lleva rp = [bajada x, bajada z, pendiente] para el impulso del deslizamiento. Se dibuja como una cuña (etiqueta «ramp:dir:y0»). */
    ramp(xa, xb, za, zb, y0, y1, dir, color, texTag) {
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
      const alongX = dir === 'E' || dir === 'W', a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1, len = a1 - a0, up = dir === 'E' || dir === 'S' ? 1 : -1;
      const n = Math.max(1, Math.ceil(len / 0.25)), slope = (y1 - y0) / len, rp = [alongX ? -up : 0, alongX ? 0 : -up, slope];
      for (let k = 0; k < n; k++) {
        const s0 = a0 + k * len / n, s1 = a0 + (k + 1) * len / n, t = ((s0 + s1) / 2 - a0) / len, h = y0 + (up > 0 ? t : 1 - t) * (y1 - y0);   // altura en el centro del escalón
        cols.push(alongX ? { minX: s0, maxX: s1, minY: 0, maxY: h, minZ: z0, maxZ: z1, rp } : { minX: x0, maxX: x1, minY: 0, maxY: h, minZ: s0, maxZ: s1, rp });
      }
      if (onBox) onBox((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, y1, z1 - z0, color, false, 'ramp:' + dir + ':' + y0 + (texTag ? ':' + texTag : ''));
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
  /* [MAPA ÚNICO] Solo queda Tormenta de Arena: Castillo Real, Barrio Arcoíris y Puerto Industrial se quitaron (ahora es el mapa 0) */
  /* ================= [MAPAS KRUNKER 2] TORMENTA DE ARENA (inspirado en «Sandstorm» de Krunker) =================
     88 × 88 m pero NO es un cuadrado: el borde lo forman edificios de pisos de distintas alturas (open() dice qué suelo se pisa).
     Simétrico de oeste (ROJO) a este (AZUL). Plaza central con la torre (planta baja con cuatro puertas y terraza a 3,2 m);
     al norte, el «largo» norte: un pasillo largo con balcón y nido de francotirador; al sur, la meseta a 2,4 m con el túnel
     por debajo (el paso subterráneo del largo sur, con salida al centro); callejones entre medias y un carril central estrecho. */
  {
    name: 'Tormenta de Arena', half: 44,
    desc: 'Barrio del desierto: pasillos largos entre edificios de pisos, torre con terraza en la plaza, balcón con nido de francotirador y un túnel bajo la meseta.',
    sky: ['#f0a95a', '#fbe3b8'], fog: '#f6ddb0', floor: ['#e2c08a', '#d7b37b'], out: '#d9b47c', pal: ['#e3c08d', '#c98158', '#6fb3c9', '#efe3cc', '#6aa84f'],
    look: { floor: 'pave', outFloor: 'sand', wall: 'sand', block: 'sand', crate: 'crate', plat: 'sand', sun: '#ffe2b0', decor: 'desert', pixel: 16, wallH: 12, trimBase: '#b08650', trimTop: '#f4e6c8' },
    /* Suelo transitable (mitad este; el oeste es su espejo): base, plaza, carril central, largo norte, meseta sur y callejones */
    open(x, z) {
      const ax = Math.abs(x), R = [[30, 42, -10, 10], [0, 14, -12, 12], [14, 30, -4, 4], [0, 34, -30, -20], [30, 34, -20, -10], [4, 10, -20, -12], [16, 22, -36, -30], [0, 30, 20, 34], [26, 32, 10, 20], [0, 6, 12, 20]];
      return R.some(r => ax >= r[0] && ax <= r[1] && z >= r[2] && z <= r[3]);
    },
    spawns: {
      1: [[-38, -8], [-39, -4], [-38, 0], [-39, 4], [-38, 8], [-35, -6], [-35, 6]],
      0: [[38, -8], [39, -4], [38, 0], [39, 4], [38, 8], [35, -6], [35, 6]]
    },
    zones: [{ n: 'Torre', x: 0, z: 0, y: 3.2 }, { n: 'Largo norte', x: 0, z: -24, y: 0 }, { n: 'Meseta', x: 0, z: 32, y: 2.4 }],
    bomb: [{ n: 'A', x: 0, z: -24, y: 0 }, { n: 'B', x: 0, z: 32, y: 2.4 }],   // [BOMBA] largo norte y meseta
    areas: [
      { n: 'Terraza de la torre', x0: -4, x1: 4, z0: -4, z1: 4, y0: 2.8, y1: 8 }, { n: 'Torre', x0: -4, x1: 4, z0: -4, z1: 4, y0: -1, y1: 2.8 },
      { n: 'Nido', x0: -22, x1: -16, z0: -36, z1: -28, y0: 2.4, y1: 8 }, { n: 'Nido', x0: 16, x1: 22, z0: -36, z1: -28, y0: 2.4, y1: 8 },
      { n: 'Balcón', x0: -16, x1: 16, z0: -30, z1: -28, y0: 2.4, y1: 8 },
      { n: 'Túnel', x0: -30, x1: 30, z0: 22, z1: 30, y0: -1, y1: 1.9 },
      { n: 'Meseta', x0: -30, x1: 30, z0: 20, z1: 34, y0: 2, y1: 8 },
      { n: 'Base roja', x0: -44, x1: -30, z0: -10, z1: 10, y0: -1, y1: 3 }, { n: 'Base azul', x0: 30, x1: 44, z0: -10, z1: 10, y0: -1, y1: 3 },
      { n: 'Largo norte', x0: -34, x1: 34, z0: -36, z1: -20, y0: -1, y1: 4 },
      { n: 'Callejón', x0: -34, x1: 34, z0: -20, z1: -12, y0: -1, y1: 4 }, { n: 'Callejón', x0: -34, x1: 34, z0: 10, z1: 22, y0: -1, y1: 4 },
      { n: 'Carril central', x0: -30, x1: 30, z0: -4, z1: 4, y0: -1, y1: 4 },
      { n: 'Plaza', x0: -14, x1: 14, z0: -12, z1: 12, y0: -1, y1: 4 }
    ],
    build(b) {
      const SA = '#e3c08d', TN = '#d6a86e', TC = '#c98158', WH = '#efe3cc', WD = '#a8753f', BL = '#3f8fb0';
      const P = (x0, x1, z0, z1, y0, y1, c, t) => b.box(Math.min(x0, x1), Math.max(x0, x1), z0, z1, y0, y1, c, t);
      const crate = (x, z, s = 2, h = 2, y = 0) => P(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y, y + h, WD, 'crate');
      const bags = (x0, x1, z0, z1) => P(x0, x1, z0, z1, 0, 1.1, '#b89a64', 'sand');   // sacos terreros
      b.perimeter(44, 12, TN);
      /* ---------- edificios del borde: rellenan todo lo que no es suelo, en rectángulos (filas de 2 m fundidas) ----------
         altura por manzanas de 8 m: los que dan a la calle entre 6 y 9 m, los de detrás más altos (10-13 m), y cuatro colores de fachada */
      const open = this.open, C = 2, N = 44, hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
      const near = (cx, cz, r) => { for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (open(cx + dx * C, cz + dz * C)) return true; return false; };
      const cellH = (cx, cz) => { if (open(cx, cz)) return 0; const bi = Math.floor(Math.abs(cx) / 8), bj = Math.floor((cz + 44) / 8), hv = hash(bi, bj); return near(cx, cz, 1) ? 6 + Math.floor(hv * 4) : near(cx, cz, 3) ? 10 + Math.floor(hv * 3) : 12; };
      const COLS = [SA, TN, WH, TC], colOf = (x0, z0) => COLS[Math.floor(hash(Math.floor(Math.abs(x0) / 8) + 7, Math.floor((z0 + 44) / 8)) * 4)];
      const rects = [];   // filas de celdas iguales seguidas → un rectángulo; si la fila siguiente repite el tramo, se alarga
      for (let z = -N; z < N; z += C) {
        let cur = null; const row = [];
        for (let x = -N; x <= N; x += C) {
          const h = x < N ? cellH(x + C / 2, z + C / 2) : 0, c = h ? colOf(x + C / 2, z + C / 2) : '';
          if (cur && (h !== cur.h || c !== cur.c)) { row.push(cur); cur = null; }
          if (!cur && h) cur = { x0: x, x1: x + C, h, c }; else if (cur) cur.x1 = x + C;
        }
        for (const r of row) { const q = rects.find(q => q.z1 === z && q.x0 === r.x0 && q.x1 === r.x1 && q.h === r.h && q.c === r.c); if (q) q.z1 = z + C; else rects.push(Object.assign(r, { z0: z, z1: z + C })); }
      }
      for (const r of rects) P(r.x0, r.x1, r.z0, r.z1, 0, r.h, r.c, 'adobe');
      /* ---------- plaza: torre central (planta baja hueca con 4 puertas, terraza a 3,2 m con pretil) ---------- */
      const T = 0.5, TH = 2.8;
      for (const s of [-1, 1]) {
        P(-4, -1, s * 4 - (s > 0 ? T : 0), s * 4 + (s < 0 ? T : 0), 0, TH, WH, 'adobe'); P(1, 4, s * 4 - (s > 0 ? T : 0), s * 4 + (s < 0 ? T : 0), 0, TH, WH, 'adobe'); P(-1, 1, s * 4 - (s > 0 ? T : 0), s * 4 + (s < 0 ? T : 0), 2.2, TH, WH, 'adobe');   // norte / sur con puerta
        P(s * 4 - (s > 0 ? T : 0), s * 4 + (s < 0 ? T : 0), -4 + T, -1, 0, TH, WH, 'adobe'); P(s * 4 - (s > 0 ? T : 0), s * 4 + (s < 0 ? T : 0), 1, 4 - T, 0, TH, WH, 'adobe'); P(s * 4 - (s > 0 ? T : 0), s * 4 + (s < 0 ? T : 0), -1, 1, 2.2, TH, WH, 'adobe');
      }
      P(-4.4, 4.4, -4.4, 4.4, TH, TH + 0.4, TN, 'sand');                                                                                             // terraza (arriba a 3,2 m)
      for (const s of [-1, 1]) { P(-4.4, 4.4, s * 4.4 - (s > 0 ? 0.4 : 0), s * 4.4 + (s < 0 ? 0.4 : 0), TH + 0.4, TH + 1.4, WH, 'adobe'); P(s * 4.4 - (s > 0 ? 0.4 : 0), s * 4.4 + (s < 0 ? 0.4 : 0), -4, -1.2, TH + 0.4, TH + 1.4, WH, 'adobe'); P(s * 4.4 - (s > 0 ? 0.4 : 0), s * 4.4 + (s < 0 ? 0.4 : 0), 1.2, 4, TH + 0.4, TH + 1.4, WH, 'adobe'); }   // pretil con hueco donde llegan las escaleras
      b.ramp(4.4, 12.4, -1.2, 1.2, 0, 3.2, 'W', '#cfa66e', 'sand'); b.ramp(-12.4, -4.4, -1.2, 1.2, 0, 3.2, 'E', '#cfa66e', 'sand');   // rampas de 8 m a la terraza (se baja deslizándose hacia el carril central)
      for (const cx of [-4, 4]) for (const cz of [-4, 4]) P(cx - 0.4, cx + 0.4, cz - 0.4, cz + 0.4, TH + 0.4, TH + 3, WH, 'adobe');   // pilares de las esquinas (con cúpula de adorno en el cliente)
      crate(-2.6, -2.6, 1.4, 1.4); crate(2.6, 2.6, 1.4, 1.4);
      for (const sx of [-1, 1]) {
        const X = (a, c) => [sx * a, sx * c];
        /* plaza: muretes, cajas y palmeras */
        P(...X(8, 11), -9.6, -9, 0, 1.2, SA, 'adobe'); P(...X(8, 11), 9, 9.6, 0, 1.2, SA, 'adobe'); crate(sx * 11, -6); crate(sx * 7, 7.5, 1.6, 1.6);
        /* ---------- carril central (estrecho, directo de la base a la plaza) ---------- */
        bags(...X(20, 20.8), -3, 0.4); crate(sx * 25, 2.6, 1.6, 1.6); P(...X(14, 16), -4, -2.6, 0, 4.4, SA, 'adobe'); P(...X(14, 16), 2.6, 4, 0, 4.4, SA, 'adobe');   // arco de entrada a la plaza: pilares de 2 m (alto: se pasa saltando al bajar deslizándose de la torre)
        P(...X(14, 16), -2.6, 2.6, 3.8, 4.4, SA, 'adobe');
        /* ---------- base: patio con arco hacia el carril ---------- */
        crate(sx * 36, -4); crate(sx * 36, 4); crate(sx * 33, 8.4, 1.4, 1.2); bags(...X(32, 32.8), -8.5, -6);
        /* ---------- largo norte: pasillo de 10 m entre edificios, balcón corrido a 2,8 m y nido a los lados ---------- */
        P(...X(0, 16), -30, -28, 0, 2.8, TN, 'sand');                                                                                               // balcón (la mitad de cada lado)
        P(...X(16, 22), -36, -28, 0, 2.8, TN, 'sand'); P(...X(16, 22), -28.4, -28, 2.8, 3.8, WH, 'adobe');                                             // nido con pretil
        b.ramp(...X(22, 30), -30, -28, 0, 2.8, sx > 0 ? 'W' : 'E', '#cfa66e', 'sand');                                                             // rampa de 8 m al nido desde el extremo del largo
        crate(sx * 8, -23, 1.8, 1.8); crate(sx * 26, -25); bags(...X(14, 17), -21.4, -20.6); crate(sx * 32, -16, 1.6, 1.6);
        /* callejón plaza ↔ largo norte */
        crate(sx * 6, -16, 1.6, 1.6);
        /* ---------- meseta sur (2,4 m) con el túnel por debajo (2 m de alto) de punta a punta y salida al centro ---------- */
        P(...X(2, 26), 22, 26, 0, 2.4, TN, 'sand'); P(...X(0, 26), 30, 34, 0, 2.4, TN, 'sand'); P(...X(0, 26), 26, 30, 2.0, 2.4, TN, 'sand');      // techo del túnel
        P(...X(0, 2), 22, 26, 2.0, 2.4, TN, 'sand');                                                                                                  // puente sobre la salida al centro
        b.run(sx > 0 ? 'W' : 'E', sx * 30, 24, 2, 6, 0, 0.4, TN, 'sand');                                                                             // escalera a la meseta desde el callejón sur
        b.run('S', 16, sx * 5, 2, 6, 0, 0.4, TN, 'sand');                                                                                             // escalera a la meseta desde la plaza
        P(...X(8, 12), 22, 22.5, 2.4, 3.4, SA, 'adobe'); P(...X(16, 22), 22, 22.5, 2.4, 3.4, SA, 'adobe'); crate(sx * 14, 32, 1.6, 1.6, 2.4); crate(sx * 22, 27, 1.4, 1.2, 2.4);   // pretil y cajas arriba
        crate(sx * 12, 16, 1.6, 1.6); crate(sx * 29, 14); bags(...X(22, 25), 18.6, 19.4);
      }
    }
  },
  /* ================= [MAPAS KRUNKER 3] BASE GLACIAR (inspirado en «Subzero» de Krunker) =================
     88 × 88 m y NO es un cuadrado: el borde son riscos nevados de distintas alturas (open() dice qué suelo se pisa).
     Simétrico de oeste (ROJO) a este (AZUL). En el centro, el lago helado con la plataforma del radar; al norte, el bosque
     de pinos con la cresta (a 2,4 m, con rampas) y dos torres de vigilancia; al sur, el depósito: hangar con entreplanta,
     tanques de combustible y contenedores; bases con cabañas de troncos. */
  {
    name: 'Base Glaciar', half: 44,
    desc: 'Base militar en la nieve: lago helado con el radar en el centro, bosque de pinos con torres de vigilancia y una cresta con rampas, y un hangar con entreplanta.',
    sky: ['#86b3e2', '#e9f3fc'], fog: '#dfe9f3', floor: ['#bfcbd8', '#b4c1cf'], out: '#c9d4e0', pal: ['#8d96a3', '#c0392b', '#2f7fbf', '#e9eef4', '#3f6b4a'],
    look: { floor: 'snow', outFloor: 'snow', wall: 'rock', block: 'rock', crate: 'crate', plat: 'concrete', sun: '#fff6e8', decor: 'snow', pixel: 16, wallH: 12, trimBase: '#6d7682', trimTop: '#f4f8fc' },
    open(x, z) {
      const ax = Math.abs(x), R = [[30, 42, -10, 10], [0, 16, -12, 12], [16, 30, -4, 4], [0, 34, -34, -18], [30, 34, -18, -10], [6, 12, -18, -12], [0, 26, 18, 36], [26, 34, 10, 24], [10, 16, 12, 18], [0, 4, 12, 18]];
      return R.some(r => ax >= r[0] && ax <= r[1] && z >= r[2] && z <= r[3]);
    },
    spawns: {
      1: [[-36, -6], [-37, -2], [-36, 2], [-37, 6], [-34, -4], [-34, 4], [-39, 0]],
      0: [[36, -6], [37, -2], [36, 2], [37, 6], [34, -4], [34, 4], [39, 0]]
    },
    zones: [{ n: 'Radar', x: 0, z: 1.8, y: 2.8 }, { n: 'Bosque', x: 0, z: -24, y: 0 }, { n: 'Hangar', x: 0, z: 29, y: 0 }],
    bomb: [{ n: 'A', x: 0, z: -24, y: 0 }, { n: 'B', x: 0, z: 29, y: 0 }],
    areas: [
      { n: 'Radar', x0: -3, x1: 3, z0: -3, z1: 3, y0: 1, y1: 8 },
      { n: 'Torre de vigilancia', x0: -22, x1: -18, z0: -31, z1: -22, y0: 3.5, y1: 9 }, { n: 'Torre de vigilancia', x0: 18, x1: 22, z0: -31, z1: -22, y0: 3.5, y1: 9 },
      { n: 'Cresta', x0: -34, x1: 34, z0: -34, z1: -23, y0: 1.5, y1: 8 },
      { n: 'Entreplanta', x0: -12, x1: 12, z0: 32, z1: 36, y0: 2, y1: 5 }, { n: 'Hangar', x0: -12, x1: 12, z0: 24, z1: 36, y0: -1, y1: 5 },
      { n: 'Base roja', x0: -44, x1: -30, z0: -10, z1: 10, y0: -1, y1: 4 }, { n: 'Base azul', x0: 30, x1: 44, z0: -10, z1: 10, y0: -1, y1: 4 },
      { n: 'Bosque', x0: -34, x1: 34, z0: -36, z1: -12, y0: -1, y1: 4 },
      { n: 'Depósito', x0: -34, x1: 34, z0: 12, z1: 38, y0: -1, y1: 4 },
      { n: 'Carril central', x0: -30, x1: 30, z0: -4, z1: 4, y0: -1, y1: 4 },
      { n: 'Lago helado', x0: -16, x1: 16, z0: -12, z1: 12, y0: -1, y1: 4 }
    ],
    build(b) {
      const RK = '#8d96a3', CN = '#9aa2ab', DK = '#5d6570', LG = '#7a4f2e', RD = '#c0392b', BL = '#2f7fbf', IC = '#a9dcf0', SN = '#eef3f8', WD = '#a8753f';
      const P = (x0, x1, z0, z1, y0, y1, c, t) => b.box(Math.min(x0, x1), Math.max(x0, x1), z0, z1, y0, y1, c, t);
      const F = (x0, x1, z0, z1, c) => b.box(Math.min(x0, x1), Math.max(x0, x1), z0, z1, 0, 0.03, c, null, false);
      const crate = (x, z, s = 2, h = 2, y = 0) => P(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y, y + h, WD, 'crate');
      b.perimeter(44, 12, RK);
      /* ---------- riscos del borde (filas de 2 m fundidas en rectángulos); los que dan al suelo, más bajos ---------- */
      const open = this.open, C = 2, N = 44, hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
      const near = (cx, cz, r) => { for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (open(cx + dx * C, cz + dz * C)) return true; return false; };
      const cellH = (cx, cz) => { if (open(cx, cz)) return 0; const hv = hash(Math.floor(Math.abs(cx) / 6), Math.floor((cz + 44) / 6)); return near(cx, cz, 1) ? 5 + Math.floor(hv * 4) : near(cx, cz, 3) ? 9 + Math.floor(hv * 3) : 12; };
      const COLS = ['#8d96a3', '#7c8591', '#9aa3ae'], colOf = (x, z) => near(x, z, 3) ? COLS[Math.floor(hash(Math.floor(Math.abs(x) / 6) + 5, Math.floor((z + 44) / 6) + 3) * 3)] : COLS[0];   // los de detrás, de un solo color (menos cajas)
      const rects = [];
      for (let z = -N; z < N; z += C) {
        let cur = null; const row = [];
        for (let x = -N; x <= N; x += C) {
          const h = x < N ? cellH(x + C / 2, z + C / 2) : 0, c = h ? colOf(x + C / 2, z + C / 2) : '';
          if (cur && (h !== cur.h || c !== cur.c)) { row.push(cur); cur = null; }
          if (!cur && h) cur = { x0: x, x1: x + C, h, c }; else if (cur) cur.x1 = x + C;
        }
        for (const r of row) { const q = rects.find(q => q.z1 === z && q.x0 === r.x0 && q.x1 === r.x1 && q.h === r.h && q.c === r.c); if (q) q.z1 = z + C; else rects.push(Object.assign(r, { z0: z, z1: z + C })); }
      }
      for (const r of rects) P(r.x0, r.x1, r.z0, r.z1, 0, r.h, r.c, 'rock');
      /* ---------- centro: lago helado y plataforma del radar (2,8 m) ---------- */
      F(-13, 13, -10, 10, IC);
      P(-3, 3, -3, 3, 0, 2.8, CN, 'concrete'); P(-0.35, 0.35, -0.35, 0.35, 2.8, 7.4, DK, 'metal');                                       // plataforma (2,8 m) y mástil del radar
      b.ramp(3, 11, -1, 1, 0, 2.8, 'W', '#9aa2ab', 'concrete'); b.ramp(-11, -3, -1, 1, 0, 2.8, 'E', '#9aa2ab', 'concrete');              // rampas de 8 m este y oeste (se baja deslizándose hacia el carril central)
      for (const sx of [-1, 1]) {
        const X = (a, c) => [sx * a, sx * c];
        /* lago: bloques de hielo y bancos de nieve para cubrirse */
        P(...X(7, 9), -6, -4.6, 0, 1.4, IC, 'ice'); P(...X(4, 5.4), 6, 8, 0, 1.4, IC, 'ice'); P(...X(10, 11.2), 2, 3.6, 0, 1.8, IC, 'ice');
        P(...X(12, 14.5), -10.5, -9.5, 0, 1, SN, 'snow'); P(...X(12, 14.5), 9.5, 10.5, 0, 1, SN, 'snow');
        /* ---------- carril central: barreras de hormigón y garita ---------- */
        P(...X(20, 20.6), -1, 2.4, 0, 1.1, CN, 'concrete'); P(...X(25, 25.6), -3.4, 0, 0, 1.1, CN, 'concrete');
        P(...X(16, 17.2), 2.6, 4, 0, 2.6, DK, 'metal'); P(...X(16, 17.2), -4, -2.6, 0, 2.6, DK, 'metal');                                       // postes de la barrera de entrada
        /* ---------- base: dos cabañas de troncos macizas y cajas ---------- */
        P(...X(38.5, 42), -10, -5.5, 0, 3, LG, 'logs'); P(...X(38.5, 42), 5.5, 10, 0, 3, LG, 'logs');
        crate(sx * 33, -8.2, 1.6, 1.6); crate(sx * 33, 8.2, 1.6, 1.6); crate(sx * 31.5, 0, 1.4, 1.2);
        /* ---------- bosque norte: cresta a 2,4 m con rampas, torres de vigilancia y pinos ---------- */
        P(...X(0, 26), -34, -31, 0, 2.4, RK, 'rock');                                                                                       // cresta (mitad de cada lado)
        b.ramp(...X(13, 16), -31, -23, 0, 2.4, 'N', '#9aa2ab', 'rock');                                                                       // rampa de 8 m de la cresta al bosque
        b.run('S', -31, sx * 20, 2, 5, 2.4, 0.4, WD, 'wood');                                                                                 // escalera de la cresta a la torre (4,4 m)
        P(...X(18, 22), -26, -22, 4, 4.4, WD, 'wood');                                                                                         // plataforma de la torre
        for (const [a, c] of [[18.2, -22.2], [21.8, -22.2], [18.2, -25.8], [21.8, -25.8]]) P(sx * a - 0.2, sx * a + 0.2, c - 0.2, c + 0.2, 0, 4, LG, 'wood');   // patas
        P(...X(18, 22), -22.3, -22, 4.4, 5.3, WD, 'wood'); P(...X(21.7, 22), -26, -22.3, 4.4, 5.3, WD, 'wood'); P(...X(18, 18.3), -26, -22.3, 4.4, 5.3, WD, 'wood');   // barandilla (abierta al norte, donde llega la escalera)
        for (const [x, z] of [[5, -21], [9, -26.5], [15.5, -19.5], [24, -21.5], [29.5, -26.5], [31.5, -20], [3, -28.5]]) P(sx * x - 0.3, sx * x + 0.3, z - 0.3, z + 0.3, 0, 2.2, '#5e4630', 'bark');   // troncos de los pinos (la copa es decoración)
        P(...X(10.5, 12.1), -21.2, -19.6, 0, 1.3, RK, 'rock'); P(...X(26, 28), -30, -28.6, 0, 1.2, RK, 'rock');                                  // rocas para cubrirse
        crate(sx * 32, -14, 1.6, 1.6); crate(sx * 8, -15.5, 1.4, 1.2);
        /* ---------- depósito sur: hangar (hueco, portón al norte y puertas laterales, entreplanta a 2,8 m) ---------- */
        P(...X(4, 12), 24, 24.6, 0, 5, CN, 'metal'); P(...X(0, 4), 24, 24.6, 4, 5, CN, 'metal');                                                 // fachada con el portón (8 m) en medio
        P(...X(11.4, 12), 24.6, 27, 0, 5, CN, 'metal'); P(...X(11.4, 12), 30, 36, 0, 5, CN, 'metal'); P(...X(11.4, 12), 27, 30, 3, 5, CN, 'metal');   // pared lateral con puerta
        P(...X(0, 12), 35.4, 36, 0, 5, CN, 'metal');
        P(...X(0, 12.2), 23.8, 36, 5, 5.4, DK, 'metal');                                                                                       // tejado
        P(...X(0, 11.4), 32.6, 35.4, 0, 2.8, DK, 'metal');                                                                                     // entreplanta (maciza por debajo)
        b.run('S', 26.6, sx * 9.5, 2, 6, 0, 0.4, DK, 'metal');                                                                                 // escalera a la entreplanta (6 peldaños → 2,4 m; luego 0,4)
        P(...X(2, 4.6), 27, 29.4, 0, 2.6, sx < 0 ? RD : BL, 'metal'); P(...X(5.5, 8.1), 28.6, 31, 0, 2.6, '#e0a43a', 'metal');               // contenedores dentro
        /* fuera: tanques de combustible, contenedores y cajas */
        P(...X(18, 21), 29, 32, 0, 3.6, '#d8dde2', 'metal'); P(...X(22, 25), 29, 32, 0, 3.6, '#d8dde2', 'metal');
        P(...X(16, 18.6), 19, 25, 0, 2.6, sx < 0 ? RD : BL, 'metal'); crate(sx * 22, 22, 1.8, 1.8); crate(sx * 29, 14); crate(sx * 13, 15, 1.6, 1.6);
      }
    }
  },
  /* ================= [MAPAS KRUNKER 4] CIUDAD NOCTURNA (de noche, con neones) =================
     128 × 128 m (más grande que los otros, como los mapas de Krunker) y NO es un cuadrado: el borde son edificios de ladrillo,
     hormigón y cristal (open() dice qué suelo se pisa). Simétrico de oeste (ROJO) a este (AZUL).
     Plaza central con el puente elevado (3,2 m, rampas de 8 m); al norte, la avenida de neón (larga, para francotiradores,
     con coches y la terraza del cine a 2,8 m) y las OFICINAS: edificio de dos plantas en el que se entra (puertas, escalera
     y ventanas para disparar desde dentro); al sur, la calle con la azotea (3,2 m, rampas), el patio y la gasolinera.
     Los neones, ventanas encendidas y carteles son decoración del cliente. */
  {
    name: 'Ciudad Nocturna', half: 64,
    desc: 'Ciudad de noche llena de neones: puente elevado sobre la plaza, avenida larga con coches y la terraza del cine, oficinas de dos plantas en las que se entra y una azotea con rampas.',
    sky: ['#070a1c', '#2a2150'], fog: '#1a1836', floor: ['#3b3f4c', '#353946'], out: '#2c2f3a', pal: ['#4e5668', '#ff2bd6', '#22e6ff', '#7d4b43', '#ffd23f'],
    look: { floor: 'asphalt', outFloor: 'asphalt', wall: 'concrete', block: 'concrete', crate: 'crate', plat: 'concrete', sun: '#b9c8ff', decor: 'neon', night: true, pixel: 16, wallH: 12, trimBase: '#2b2f3a', trimTop: '#8a91a3' },
    open(x, z) {
      const ax = Math.abs(x), R = [[48, 62, -12, 12], [0, 16, -14, 14], [16, 48, -4, 4], [0, 52, -50, -34], [48, 52, -34, -12], [6, 12, -34, -14], [12, 40, -34, -10],
        [0, 44, 20, 36], [44, 52, 12, 36], [0, 4, 14, 20], [12, 16, 14, 20], [0, 44, 36, 50], [20, 40, 8, 20]];
      return R.some(r => ax >= r[0] && ax <= r[1] && z >= r[2] && z <= r[3]);
    },
    spawns: {
      1: [[-56, -8], [-57, -4], [-56, 0], [-57, 4], [-56, 8], [-53, -5], [-53, 5]],
      0: [[56, -8], [57, -4], [56, 0], [57, 4], [56, 8], [53, -5], [53, 5]]
    },
    zones: [{ n: 'Puente', x: 0, z: 0, y: 3.2 }, { n: 'Avenida', x: 0, z: -41, y: 0 }, { n: 'Azotea', x: 0, z: 43, y: 3.2 }],
    bomb: [{ n: 'A', x: 0, z: -41, y: 0 }, { n: 'B', x: 0, z: 43, y: 3.2 }],   // [BOMBA] avenida y azotea
    areas: [
      { n: 'Puente', x0: -10, x1: 10, z0: -2, z1: 2, y0: 2.5, y1: 8 },
      { n: 'Tejados', x0: -34.5, x1: 34.5, z0: -34.5, z1: -13.5, y0: 7, y1: 14 },
      { n: 'Edificio central (1.ª planta)', x0: -6, x1: 6, z0: -34, z1: -14, y0: 3.4, y1: 7.2 }, { n: 'Edificio central', x0: -6, x1: 6, z0: -34, z1: -14, y0: -1, y1: 3.4 },
      { n: 'Mercado', x0: -22, x1: 22, z0: 36, z1: 50, y0: -1, y1: 2.6 }, { n: 'Casa', x0: -44, x1: -34, z0: 41, z1: 50, y0: -1, y1: 3.4 }, { n: 'Casa', x0: 34, x1: 44, z0: 41, z1: 50, y0: -1, y1: 3.4 }, { n: 'Marquesina', x0: -36.5, x1: -23.5, z0: 11, z1: 17, y0: 3.8, y1: 9 }, { n: 'Marquesina', x0: 23.5, x1: 36.5, z0: 11, z1: 17, y0: 3.8, y1: 9 },
      { n: 'Oficinas (1.ª planta)', x0: -34, x1: -20, z0: -28, z1: -14, y0: 3.4, y1: 8 }, { n: 'Oficinas (1.ª planta)', x0: 20, x1: 34, z0: -28, z1: -14, y0: 3.4, y1: 8 },
      { n: 'Oficinas', x0: -34, x1: -20, z0: -28, z1: -14, y0: -1, y1: 3.4 }, { n: 'Oficinas', x0: 20, x1: 34, z0: -28, z1: -14, y0: -1, y1: 3.4 },
      { n: 'Terraza del cine', x0: -24, x1: 24, z0: -50, z1: -46.5, y0: 2.2, y1: 8 },
      { n: 'Azotea', x0: -22, x1: 22, z0: 36, z1: 50, y0: 2.5, y1: 8 },
      { n: 'Base roja', x0: -64, x1: -48, z0: -12, z1: 12, y0: -1, y1: 4 }, { n: 'Base azul', x0: 48, x1: 64, z0: -12, z1: 12, y0: -1, y1: 4 },
      { n: 'Avenida', x0: -52, x1: 52, z0: -52, z1: -34, y0: -1, y1: 4 },
      { n: 'Gasolinera', x0: -40, x1: -20, z0: 8, z1: 20, y0: -1, y1: 4 }, { n: 'Gasolinera', x0: 20, x1: 40, z0: 8, z1: 20, y0: -1, y1: 4 },
      { n: 'Patio', x0: -44, x1: -22, z0: 36, z1: 50, y0: -1, y1: 4 }, { n: 'Patio', x0: 22, x1: 44, z0: 36, z1: 50, y0: -1, y1: 4 },
      { n: 'Callejón', x0: -52, x1: 52, z0: -34, z1: -4, y0: -1, y1: 4 }, { n: 'Calle sur', x0: -52, x1: 52, z0: 14, z1: 36, y0: -1, y1: 4 },
      { n: 'Carril central', x0: -48, x1: 48, z0: -4, z1: 4, y0: -1, y1: 4 },
      { n: 'Plaza', x0: -16, x1: 16, z0: -14, z1: 14, y0: -1, y1: 4 }
    ],
    build(b) {
      const CN = '#6f7482', DK = '#3a3f4b', ST = '#6c7180', WD = '#8a6a42', OF = '#8a5e50', FL = '#4a4f5c';
      const P = (x0, x1, z0, z1, y0, y1, c, t) => b.box(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), y0, y1, c, t);
      const crate = (x, z, s = 2, h = 2, y = 0) => P(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y, y + h, WD, 'crate');
      const bus = (x0, x1, z0, z1, col) => P(x0, x1, z0, z1, 0, 3, col, 'metal');   // autobús aparcado (9 × 2,6 × 3 m): tapa las líneas de tiro largas; ventanas y ruedas en el cliente
      const car = (x, z, alongX, col) => alongX ? P(x - 2, x + 2, z - 0.95, z + 0.95, 0, 1.4, col, 'metal') : P(x - 0.95, x + 0.95, z - 2, z + 2, 0, 1.4, col, 'metal');   // coche aparcado (las ruedas y cristales, en el cliente)
      b.perimeter(64, 12, DK);
      /* ---------- edificios del borde (filas de 2 m fundidas en rectángulos): los que dan a la calle entre 8 y 11 m y de colores; los de detrás, 12 m y de un solo color ---------- */
      const open = this.open, C = 2, N = 64, hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
      const near = (cx, cz) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (open(cx + dx * C, cz + dz * C)) return true; return false; };
      const blk = (cx, cz) => hash(Math.floor(Math.abs(cx) / 10), Math.floor((cz + 64) / 10));
      const mid = (cx, cz) => Math.abs(cx) < 6 && cz > -34 && cz < -14;   // bloque central del norte: edificio de dos plantas (tejado a 7,6 m, al que llegan las pasarelas)
      const cellH = (cx, cz) => open(cx, cz) || mid(cx, cz) ? 0 : near(cx, cz) ? 8 + Math.floor(blk(cx, cz) * 4) : 12;   // el bloque central es un edificio hueco (se construye aparte)
      const COLS = ['#7d4b43', '#6f7482', '#4e5668', '#8b7766'], TEXOF = { '#7d4b43': 'brick', '#6f7482': 'concrete', '#4e5668': 'glass', '#8b7766': 'brick', '#3e4454': 'concrete' };
      const colOf = (x, z) => mid(x, z) ? '#6f7482' : near(x, z) ? COLS[Math.floor(hash(Math.floor(Math.abs(x) / 10) + 7, Math.floor((z + 64) / 10)) * 4)] : '#3e4454';
      /* rectángulos grandes (voraz: se alarga en x y luego en z mientras la altura y el color coincidan): menos cajas que fila a fila */
      const M = N * 2 / C, key = [], used = new Uint8Array(M * M);
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { const cx = -N + i * C + C / 2, cz = -N + j * C + C / 2, h = cellH(cx, cz); key.push(h ? h + colOf(cx, cz) : ''); }
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        const k = key[j * M + i]; if (!k || used[j * M + i]) continue;
        let w = 1; while (i + w < M && key[j * M + i + w] === k && !used[j * M + i + w]) w++;
        let d = 1; while (j + d < M) { let ok = true; for (let q = 0; q < w && ok; q++) ok = key[(j + d) * M + i + q] === k && !used[(j + d) * M + i + q]; if (!ok) break; d++; }
        for (let a = 0; a < d; a++) for (let q = 0; q < w; q++) used[(j + a) * M + i + q] = 1;
        const cx = -N + i * C + C / 2, cz = -N + j * C + C / 2, c = colOf(cx, cz);
        P(-N + i * C, -N + (i + w) * C, -N + j * C, -N + (j + d) * C, 0, cellH(cx, cz), c, TEXOF[c]);
      }
      /* ---------- plaza: puente elevado (tablero de 2,8 a 3,2 m, se pasa por debajo) con rampas de 8 m al carril central ---------- */
      P(-10, 10, -2, 2, 2.8, 3.2, ST, 'concrete');
      b.ramp(10, 18, -1.2, 1.2, 0, 3.2, 'W', ST, 'concrete'); b.ramp(-18, -10, -1.2, 1.2, 0, 3.2, 'E', ST, 'concrete');
      for (const x of [-7, 0, 7]) for (const z of [-1.7, 1.7]) P(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0, 2.8, DK, 'metal');   // pilares
      for (const s of [-1, 1]) P(-8.5, 8.5, s * 2 - (s > 0 ? 0.2 : 0), s * 2 + (s < 0 ? 0.2 : 0), 3.2, 4.1, DK, 'metal');   // barandillas (abiertas en los extremos, donde llegan las rampas)
      /* muro con huecos (puertas y ventanas): along = 'x' (va a lo largo de x, en z = f) o 'z' (a lo largo de z, en x = f);
         holes = [[u0, u1, [[v0, v1], …]], …] en coordenadas del lado este; sx = −1 lo refleja al oeste */
      const mkWall = sx => (along, f, a0, a1, y0, y1, holes, c, t) => {
        const seg = (u0, u1, v0, v1) => { if (u1 - u0 < 0.01 || v1 - v0 < 0.01) return; if (along === 'x') P(sx * u0, sx * u1, f - 0.2, f + 0.2, v0, v1, c, t); else P(sx * (f - 0.2), sx * (f + 0.2), u0, u1, v0, v1, c, t); };
        let u = a0; for (const [h0, h1, vs] of holes) { seg(u, h0, y0, y1); let v = y0; for (const [v0, v1] of vs) { seg(h0, h1, v, v0); v = v1; } seg(h0, h1, v, y1); u = h1; } seg(u, a1, y0, y1);
      };
      const G2 = [[1.1, 2.3], [4.8, 6.2]], D2 = [[0, 2.5], [4.8, 6.2]], U2 = [[4.8, 6.2]];   // ventana abajo y arriba / puerta y ventana arriba / solo arriba
      /* ---------- EDIFICIO CENTRAL (norte): dos plantas, puertas a los cuatro lados, escalera abajo (este) y escalera al tejado (oeste) ---------- */
      {
        const W = mkWall(1), CB = '#6b6f86';
        W('x', -14, -6, 6, 0, 7.2, [[-4.5, -2.5, G2], [-1, 1, D2], [4.4, 5.4, U2]], CB, 'brick');                                      // fachada sur (a la plaza)
        W('x', -34, -6, 6, 0, 7.2, [[-4.5, -2.5, G2], [-1, 1, D2], [2.5, 4.5, G2]], CB, 'brick');                                       // fachada norte (a la avenida)
        for (const f of [-6, 6]) W('z', f, -33.8, -14.2, 0, 7.2, [[-31, -29, G2], [-27.5, -26.5, U2], [-22.5, -20.5, U2], [-19, -17, D2]], CB, 'brick');   // fachadas a los callejones
        b.run('N', -15, 3.2, 2, 10, 0, 0.38, DK, 'metal');                                                                                // escalera a la 1.ª planta (3,8 m)
        P(-5.8, 2.2, -33.8, -14.2, 3.4, 3.8, FL, 'concrete'); P(4.2, 5.8, -33.8, -14.2, 3.4, 3.8, FL, 'concrete'); P(2.2, 4.2, -33.8, -25, 3.4, 3.8, FL, 'concrete');   // suelo de arriba (hueco sobre la escalera)
        b.run('S', -33.4, -3.2, 2, 10, 3.8, 0.38, DK, 'metal', 3.8);                                                                      // escalera al tejado (7,6 m)
        P(-6.2, -4.2, -34.2, -13.8, 7.2, 7.6, DK, 'concrete'); P(-2.2, 6.2, -34.2, -13.8, 7.2, 7.6, DK, 'concrete'); P(-4.2, -2.2, -23.4, -13.8, 7.2, 7.6, DK, 'concrete'); P(-4.2, -2.2, -34.2, -33.4, 7.2, 7.6, DK, 'concrete');   // tejado con hueco
        P(-4.5, -1.5, -29.5, -28.7, 0, 1.1, WD, 'wood'); P(-0.5, 1.5, -20, -18, 0, 1.2, WD, 'crate'); P(0.5, 3, -30.5, -29.5, 3.8, 4.7, WD, 'wood'); P(-1.5, 0.5, -19, -18, 3.8, 4.7, WD, 'wood');   // mostrador, caja y mesas
        P(1, 3, -31, -29, 7.6, 8.8, '#9aa0ab', 'metal');                                                                                // aparato de aire en el tejado
      }
      for (const sx of [-1, 1]) {
        const X = (a, c) => [sx * a, sx * c], wall = mkWall(sx);
        /* ---------- plaza: quioscos, jardineras y coches ---------- */
        P(...X(12, 14), -11, -9, 0, 2.4, '#3f6f8f', 'metal'); P(...X(12, 14), 9, 11, 0, 2.4, '#8f3f6f', 'metal');
        P(...X(3, 6.5), 7.5, 8.5, 0, 0.9, CN, 'concrete'); P(...X(3, 6.5), -8.5, -7.5, 0, 0.9, CN, 'concrete');
        car(sx * 8, -12.3, true, sx < 0 ? '#c8c9cf' : '#2d2f36'); crate(sx * 14.8, 12.8, 1.4, 1.2);
        /* ---------- carril central (30 m): bolardos, contenedor, barreras y cajas ---------- */
        P(...X(22, 22.8), -1, 2.2, 0, 1.1, CN, 'concrete'); P(...X(28, 29.8), -3.8, -2.2, 0, 1.6, '#2f6b4a', 'metal'); crate(sx * 26, 2.6, 1.4, 1.2);
        P(...X(40, 40.6), -3.6, -0.6, 0, 1.1, CN, 'concrete'); crate(sx * 45, -2.6, 1.6, 1.6);
        bus(...X(31, 40), 1, 3.6, sx < 0 ? '#c0392b' : '#2f7fbf');                                                                      // autobús en el carril central
        P(...X(47, 47.8), -7, -3, 0, 1.2, CN, 'concrete'); P(...X(47, 47.8), 3, 7, 0, 1.2, CN, 'concrete');                                // barricadas a la salida de la base
        /* ---------- base: marquesinas de metro (macizas) y cajas ---------- */
        P(...X(57, 62), -12, -8, 0, 3, DK, 'metal'); P(...X(57, 62), 8, 12, 0, 3, DK, 'metal');
        crate(sx * 51, -10, 1.6, 1.6); crate(sx * 51, 10, 1.6, 1.6); crate(sx * 50, 0, 1.4, 1.2);
        /* ---------- avenida norte (104 m de punta a punta): coches, parada de autobús y la terraza del cine (2,8 m) con rampa ---------- */
        P(...X(0, 24), -50, -46.5, 0, 2.8, CN, 'concrete'); P(...X(0, 22), -46.8, -46.5, 2.8, 3.7, DK, 'metal');                        // terraza y pretil
        b.ramp(...X(24, 32), -50, -47, 0, 2.8, sx > 0 ? 'W' : 'E', ST, 'concrete');                                                     // rampa de 8 m desde la avenida
        car(sx * 8, -37.2, true, sx < 0 ? '#b8323a' : '#2d6fb8'); car(sx * 18, -43, true, '#d9d9df'); car(sx * 40, -41, false, '#e8c21a'); car(sx * 30, -36.8, true, '#6a3fa0');
        P(...X(42, 45), -35.4, -34.8, 0, 2.4, DK, 'metal'); bus(...X(27, 36), -46.4, -43.8, '#e0a43a');                                                                             // parada de autobús (pared de atrás)
        crate(sx * 46, -46, 1.8, 1.8); crate(sx * 50, -30, 1.6, 1.6); crate(sx * 9, -24, 1.4, 1.2); P(...X(10.6, 11.6), -31, -28.6, 0, 1.3, '#2f6b4a', 'metal');   // callejón: contenedor
        /* ---------- OFICINAS: dos plantas (suelo de arriba a 3,8 m), puertas, ventanas y escalera por dentro ---------- */
        const G = G2, D = D2, U = U2;
        wall('x', -28, 20, 34, 0, 7.2, [[21.5, 23.5, G], [26, 28, D], [30.5, 32.5, G]], OF, 'brick');                                  // fachada norte (a la avenida)
        wall('x', -14, 20, 34, 0, 7.2, [[21.5, 23.5, G], [25, 27, D], [29, 31, G]], OF, 'brick');                                      // fachada sur (al carril)
        wall('z', 20, -27.8, -14.2, 0, 7.2, [[-26, -24, G], [-22, -20, D], [-18, -16, G]], OF, 'brick');                                // fachada oeste (a la plaza)
        wall('z', 34, -27.8, -14.2, 0, 7.2, [[-26.5, -24.5, U], [-21, -19, U]], OF, 'brick');                                          // fachada este (la escalera va por dentro)
        P(...X(20.2, 31.8), -27.8, -14.2, 3.4, 3.8, FL, 'concrete'); P(...X(31.8, 33.8), -27.8, -24.6, 3.4, 3.8, FL, 'concrete');          // suelo de arriba (hueco sobre la escalera)
        P(...X(31.6, 31.8), -24.6, -16, 3.8, 4.8, DK, 'metal');                                                                           // barandilla del hueco
        b.run('N', -14.6, sx * 32.8, 2, 10, 0, 0.38, DK, 'metal');                                                                       // escalera: de la puerta sur a la planta de arriba (10 peldaños → 3,8 m)
        b.run(sx > 0 ? 'E' : 'W', sx * 21.5, -21, 2, 10, 3.8, 0.38, DK, 'metal', 3.8);                                             // segunda escalera, en medio de la planta de arriba: sube al tejado (7,6 m)
        P(...X(19.8, 34.2), -28.2, -22, 7.2, 7.6, DK, 'concrete'); P(...X(19.8, 34.2), -20, -13.8, 7.2, 7.6, DK, 'concrete');            // tejado (con hueco sobre la escalera)
        P(...X(19.8, 21.5), -22, -20, 7.2, 7.6, DK, 'concrete'); P(...X(31.5, 34.2), -22, -20, 7.2, 7.6, DK, 'concrete');
        P(...X(19.8, 34.2), -28.2, -27.8, 7.6, 8.5, DK, 'metal'); P(...X(19.8, 34.2), -14.2, -13.8, 7.6, 8.5, DK, 'metal');             // pretil del tejado (abierto al oeste, donde llega la pasarela)
        P(...X(33.8, 34.2), -27.8, -14.2, 7.6, 8.5, DK, 'metal'); P(...X(19.8, 20.2), -22, -14.2, 7.6, 8.5, DK, 'metal');
        P(...X(24, 26.4), -17, -15.4, 7.6, 8.8, '#9aa0ab', 'metal');                                                                     // aparato de aire en el tejado (para cubrirse)
        /* pasarela alta (7,2-7,6 m) del tejado del bloque central al de las oficinas, por encima del callejón */
        P(...X(6, 19.8), -26, -24, 7.2, 7.6, ST, 'metal'); P(...X(6, 19.8), -26.2, -26, 7.6, 8.5, DK, 'metal'); P(...X(6, 19.8), -24, -23.8, 7.6, 8.5, DK, 'metal');
        P(...X(22, 24), -20, -19, 0, 1.1, WD, 'wood'); P(...X(27, 29.5), -25, -24, 0, 1.1, WD, 'wood');                                  // mostradores abajo
        P(...X(22.5, 25), -26, -25, 3.8, 4.7, WD, 'wood'); P(...X(26, 28.5), -17.5, -16.5, 3.8, 4.7, WD, 'wood');                        // mesas arriba
        crate(sx * 4.6, -17, 1.4, 1.2, 7.6);                                                                                            // caja en el tejado del edificio central
        crate(sx * 37.5, -12, 1.6, 1.6); crate(sx * 17.8, -31.5, 1.4, 1.2); P(...X(37, 38.6), -31.5, -29.5, 0, 1.3, '#2f6b4a', 'metal');
        /* ---------- gasolinera (junto a la calle sur): surtidores y coche ---------- */
        for (const x of [26, 30, 34]) P(...X(x - 0.5, x + 0.5), 13.6, 14.4, 0, 1.6, '#d9d9df', 'metal');
        for (const x of [24.2, 35.8]) for (const z of [11.8, 16.2]) P(...X(x - 0.2, x + 0.2), z - 0.2, z + 0.2, 0, 3.9, '#2a2e36', 'metal');   // postes de la marquesina
        P(...X(23.8, 36.2), 11.4, 16.6, 3.9, 4.25, DK, 'metal');                                                                          // marquesina: se puede subir encima
        crate(sx * 37, 19.2, 1.6, 1.1); crate(sx * 37, 17.6, 1.6, 2.2); crate(sx * 37, 16, 1.6, 3.3);                             // cajas en escalera para subir a la marquesina
        car(sx * 30, 17.3, true, '#b8323a'); crate(sx * 22, 10, 1.6, 1.6);
        /* ---------- sur: azotea a 3,2 m (rampa desde la calle y escalera desde el patio) ---------- */
        /* MERCADO: la azotea es el techo (2,8-3,2 m) de un mercado en el que se entra por la calle (puerta ancha en el centro) y por el patio */
        P(...X(0, 22.2), 36, 50, 2.8, 3.2, '#5c6170', 'concrete');
        wall('x', 36, 0, 22.2, 0, 2.8, [[0, 2, [[0, 2.4]]], [4.5, 6.5, [[1, 2]]], [13, 15.5, [[1, 2]]]], '#5c6170', 'concrete');
        wall('z', 22, 36.2, 50, 0, 2.8, [[38, 40, [[0, 2.4]]], [45, 47, [[1, 2]]]], '#5c6170', 'concrete');
        P(...X(4, 7), 41, 42, 0, 1.1, WD, 'wood'); P(...X(12, 15), 44.5, 45.5, 0, 1.1, WD, 'wood'); P(...X(17, 19.5), 39.5, 40.5, 0, 1.1, WD, 'wood'); crate(sx * 9, 48, 1.6, 1.6);   // puestos del mercado
        b.ramp(...X(8, 11), 28, 36, 0, 3.2, 'S', ST, 'concrete');                                                                      // rampa de 8 m de la calle a la azotea
        b.run(sx > 0 ? 'W' : 'E', sx * 30, 43, 2, 8, 0, 0.4, CN, 'concrete');                                                            // escalera desde el patio (8 peldaños → 3,2 m)
        P(...X(14, 20), 36, 36.3, 3.2, 4.1, DK, 'metal');                                                                                // pretil (el centro, abierto: se ve la azotea desde la calle)
        P(...X(6, 8.4), 45, 47.5, 3.2, 4.4, '#9aa0ab', 'metal'); P(...X(15, 16.6), 44, 47, 3.2, 4.8, '#9aa0ab', 'metal');               // aparatos de aire acondicionado
        car(sx * 20, 23, true, '#6a3fa0'); car(sx * 36, 30, false, '#d9d9df'); bus(...X(24, 33), 26.4, 29, '#2f8f6a');
        P(...X(3.6, 5.6), 24, 25.8, 0, 2.4, '#8f3f6f', 'metal'); P(...X(15, 17.5), 21.5, 22.3, 0, 1.2, CN, 'concrete');                // quiosco y murete en la calle sur
        P(...X(24, 27), 46.5, 49, 0, 2.6, '#8a5e50', 'metal'); P(...X(6.5, 9.5), 4.2, 5, 0, 1.1, CN, 'concrete'); P(...X(6.5, 9.5), -5, -4.2, 0, 1.1, CN, 'concrete');   // contenedor en el patio y muretes en la plaza crate(sx * 3, 17, 1.6, 1.6); crate(sx * 14, 16, 1.4, 1.2); crate(sx * 42, 22.5);
        P(...X(26, 28.6), 38.5, 40.5, 0, 2.4, sx < 0 ? '#c0392b' : '#2f7fbf', 'metal'); crate(sx * 41.5, 47.5, 1.4, 1.2); crate(sx * 41, 38.8, 1.6, 1.6);   // patio
        /* CASA DEL PATIO: una planta, puerta y ventanas (la parte de atrás son los edificios del borde) */
        wall('z', 34, 41.2, 50, 0, 3.4, [[44, 46, [[0, 2.5]]], [47.5, 49, [[1.1, 2.3]]]], '#8b7766', 'brick');
        wall('x', 41, 34, 44, 0, 3.4, [[35.5, 37, [[1.1, 2.3]]], [38.5, 40.5, [[0, 2.5]]], [41.5, 43, [[1.1, 2.3]]]], '#8b7766', 'brick');
        P(...X(33.8, 44), 40.8, 50, 3.4, 3.8, '#6b4a3a', 'roof');
        P(...X(37, 39.5), 46.5, 48, 0, 0.9, WD, 'wood');                                                                                  // mesa
      }
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
  const STEP = CONST.STEP, GRAV = CONST.GRAV, wasGround = e.onGround;
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
      let top = -Infinity, rp = null;
      for (const c of cols) if (e.pos.x + e.hw > c.minX && e.pos.x - e.hw < c.maxX && e.pos.z + e.hw > c.minZ && e.pos.z - e.hw < c.maxZ && ny + e.h > c.minY && ny < c.maxY && c.maxY >= top) { if (c.maxY > top) rp = null; top = c.maxY; if (c.rp) rp = c.rp; }
      e.pos.y = top; e.onGround = true; e.ramp = rp;
    } else {
      let bot = Infinity;
      for (const c of cols) if (e.pos.x + e.hw > c.minX && e.pos.x - e.hw < c.maxX && e.pos.z + e.hw > c.minZ && e.pos.z - e.hw < c.maxZ && ny + e.h > c.minY && ny < c.maxY) bot = Math.min(bot, c.minY);
      e.pos.y = bot - e.h - 0.001;
    }
    e.vel.y = 0;
  }
  /* [RAMPAS] bajando por una rampa no se «despega» en cada escalón: si justo debajo (≤ 0,3 m) hay rampa, se pega a ella (así se puede saltar al final con toda la velocidad) */
  if (!e.onGround && wasGround && e.vel.y <= 0 && !e.jumping) {
    let top = -Infinity, rp = null;
    for (const c of cols) if (c.rp && e.pos.x + e.hw > c.minX && e.pos.x - e.hw < c.maxX && e.pos.z + e.hw > c.minZ && e.pos.z - e.hw < c.maxZ && c.maxY <= e.pos.y + 1e-6 && c.maxY > top) { top = c.maxY; rp = c.rp; }
    if (top > e.pos.y - 0.3 && !overlapAt(cols, e.pos.x, top, e.pos.z, e.hw, e.h)) { e.pos.y = top; e.vel.y = 0; e.onGround = true; e.ramp = rp; }
  }
  if (!e.onGround) e.ramp = null;
  if (e.pos.y <= 0) { e.pos.y = 0; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; e.ramp = null; }
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
/* [NUEVO] Antitrampas de paredes (las usa el servidor; están aquí para poder probarlas sin servidor).
   Un jugador legítimo que rodea la esquina de una caja produce dos posiciones válidas cuya línea recta roza la esquina; eso NO es atravesar un muro.
   Por eso el cruce se comprueba contra las cajas encogidas `m` metros por cada lado: solo cuenta si la trayectoria entra CLARAMENTE en el muro. */
function insetColliders(cols, m) {
  const out = []; for (const c of cols) if (c.maxX - c.minX > 2 * m + 0.05 && c.maxZ - c.minZ > 2 * m + 0.05) out.push({ minX: c.minX + m, maxX: c.maxX - m, minZ: c.minZ + m, maxZ: c.maxZ - m, minY: c.minY, maxY: c.maxY }); return out;
}
/* p = posición anterior aceptada; (x, y, z) = la nueva; h = altura. Devuelve 'dentro' (acaba dentro de un muro), 'muro' (lo atraviesa) o null. */
function wallViolation(cols, inset, p, x, y, z, h) {
  /* el cliente usa 0,35 de ancho y manda la posición redondeada a 3 decimales: de pie sobre un escalón de 0,5333 m llega y = 0,533, 0,3 mm «dentro». Por eso 0,28 de ancho y 6 cm de tolerancia vertical. */
  if (overlapAt(cols, x, y + 0.06, z, 0.28, Math.max(1, h - 0.21))) return 'dentro';
  const dx = x - p.x, dy = y - p.y, dz = z - p.z, len = Math.hypot(dx, dy, dz);
  if (len > 0.3 && rayWorld(inset, { x: p.x, y: p.y + 0.9, z: p.z }, { x: dx / len, y: dy / len, z: dz / len }, len) < len) return 'muro';
  return null;
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

/* Nombre de la zona del mapa donde está alguien (x, y = altura de los pies, z), o '' si no está en ninguna. Usa m.areas: el primero que encaje gana. */
function areaAt(mapIdx, x, y, z) {
  const a = MAPS[mapIdx] && MAPS[mapIdx].areas; if (!a) return '';
  for (let i = 0; i < a.length; i++) { const r = a[i]; if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y >= r.y0 && y <= r.y1) return r.n; }
  return '';
}

/* ---------- Navegación de los bots (sube escaleras: cada columna guarda TODAS sus alturas pisables) ----------
   [PR3] Antes la rejilla solo sabía si una columna (x, z) era pisable a ras de suelo (y = 0): un bot que iba a una
   zona en una azotea se quedaba empujando la pared de la escalera, sin poder subir. Ahora cada columna guarda la
   lista de alturas por las que se puede pisar ahí (igual que ya calcula S.overlapAt para el jugador), y el camino
   solo pasa de una altura a la vecina si la diferencia es ≤ CONST.STEP (0,55 m): el mismo límite que ya usa la
   física para subir un escalón sin saltar. Con un solo nivel por columna, el comportamiento es idéntico al de antes.
   Antes los bots caminaban en línea recta hacia un punto y, si chocaban, elegían otro: en un recinto con calles, puertas y túneles se quedaban pegados a las paredes. */
const NAV8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function buildNav(cols, half) {
  const n = Math.floor(half * 2), layers = new Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -half + i + 0.5, z = -half + j + 0.5, hs = new Set([0]);
    for (const c of cols) if (x + 0.5 > c.minX && x - 0.5 < c.maxX && z + 0.5 > c.minZ && z - 0.5 < c.maxZ) hs.add(c.maxY);   // techos y bordes que tocan esta columna
    layers[i * n + j] = [...hs].filter(h => h < 8 && !overlapAt(cols, x, h, z, 0.5, 1.8)).sort((a, b) => a - b);   // solo las alturas donde de verdad cabe un cuerpo
  }
  return { n, half, layers, cache: new Map() };
}
/* Índice (dentro de nav.layers[i*n+j]) de la altura pisable más cercana a y; -1 si esa columna no tiene ninguna. y == null → la más baja (suelo). */
function navLayer(nav, i, j, y) {
  const hs = nav.layers[i * nav.n + j]; if (!hs || !hs.length) return -1;
  if (y == null) return 0;
  let best = 0, bd = Infinity; for (let k = 0; k < hs.length; k++) { const d = Math.abs(hs[k] - y); if (d < bd) { bd = d; best = k; } }
  return best;
}
/* Campo de distancias hasta (tx, tz, ty) por todas las alturas conectadas subiendo escaleras (≤ CONST.STEP entre vecinas). ty = null → el suelo, como antes.
   [PR3 v2] Además del campo de distancias, guarda el PADRE real de cada celda visitada durante el propio BFS (qué vecino la descubrió): así navDir no tiene
   que adivinar cuál es «el mejor vecino» cada vez que pregunta —con distancias empatadas entre una salida buena y una que lleva a un callejón sin salida,
   esa suposición fallaba— sino que sigue la cadena exacta de pasos que el BFS ya demostró que es subible, escalón a escalón. */
function navField(nav, tx, tz, ty) {
  const n = nav.n, ci = Math.max(0, Math.min(n - 1, Math.floor(tx + nav.half))), cj = Math.max(0, Math.min(n - 1, Math.floor(tz + nav.half)));
  let i0 = ci, j0 = cj, k0 = navLayer(nav, ci, cj, ty);
  if (k0 < 0) {   // destino ocupado (o columna vacía): la celda con alguna superficie más cercana
    search: for (let r = 0; r <= 3; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const k = navLayer(nav, i, j, ty); if (k >= 0) { i0 = i; j0 = j; k0 = k; break search; }
    }
    if (k0 < 0) return null;
  }
  const key = (i0 * n + j0) + ':' + k0, hit = nav.cache.get(key); if (hit) return hit;
  const dist = new Array(n * n), parent = new Array(n * n);
  const layerArr = (arr, i, j) => arr[i * n + j] || (arr[i * n + j] = new Array(nav.layers[i * n + j].length).fill(-1));
  layerArr(dist, i0, j0)[k0] = 0;
  const q = [[i0, j0, k0]];
  for (let qi = 0; qi < q.length; qi++) {
    const [i, j, k] = q[qi], h = nav.layers[i * n + j][k], d = layerArr(dist, i, j)[k];
    for (const [di, dj] of NAV8) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      if (di && dj && (!nav.layers[(i + di) * n + j].some(v => Math.abs(v - h) <= CONST.STEP) || !nav.layers[i * n + (j + dj)].some(v => Math.abs(v - h) <= CONST.STEP))) continue;   // sin cortar esquinas: [BOTS] las dos casillas de los lados tienen que ser pisables a esta misma altura (antes bastaba con que tuvieran algo, y el bot intentaba colarse en diagonal entre un murete y una caja)
      const hs = nav.layers[ni * n + nj], nd = layerArr(dist, ni, nj), np = layerArr(parent, ni, nj);
      for (let nk = 0; nk < hs.length; nk++) { if (Math.abs(hs[nk] - h) > CONST.STEP || nd[nk] >= 0) continue; nd[nk] = d + (di && dj ? 1.4142 : 1); np[nk] = [i, j, k]; q.push([ni, nj, nk]); }
    }
  }
  const result = { dist, parent };
  nav.cache.set(key, result); return result;
}
/* Dirección unitaria [dx, dz] hacia el destino: un solo paso, el mismo que usó el BFS para llegar hasta aquí, así siempre es un escalón subible de verdad
   (en vez de adivinar «el vecino con menor distancia», que a veces apuntaba a un sitio inalcanzable en un solo paso desde donde se estaba).
   y = altura actual del que pregunta (null → la más baja de su columna), para saber en qué planta está parado. */
/* [BOTS] Rescate: la rejilla de navegación comprueba si cabe un bloque de 1 m, pero un bot mide 70 cm y puede colarse en casillas que
   la rejilla no da por transitables (pegado a una pared, bajo una escalera) o estar en el aire a mitad de salto. Antes, ahí se quedaba
   «sin dirección» y chocaba contra la pared para siempre. Ahora se le lleva a la casilla conocida más cercana, a una altura a la que
   puede llegar y con camino hasta el destino; desde ahí sigue su ruta normal. */
/* [BOTS] Camino que le queda de verdad hasta el destino (en casillas), o null si no se sabe. Sirve para saber si un bot avanza: medirlo
   en línea recta hacía que un rodeo correcto (subir una escalera que se aleja un poco del destino) pareciera un atasco. */
function navRemain(nav, field, x, z, y) {
  if (!field) return null; const n = nav.n, ci = Math.max(0, Math.min(n - 1, Math.floor(x + nav.half))), cj = Math.max(0, Math.min(n - 1, Math.floor(z + nav.half)));
  const k = navLayer(nav, ci, cj, y), D = k >= 0 ? field.dist[ci * n + cj] : null; return D && D[k] >= 0 ? D[k] : null;
}
function navRescue(nav, field, ci, cj, x, z, y) {
  const n = nav.n, yy = y == null ? 0 : y; let best = null, bs = Infinity;
  /* 1) En el aire (a mitad de salto) sobre una casilla conocida: la superficie sobre la que va a caer, en su misma casilla, y su ruta normal */
  { const L = nav.layers[ci * n + cj], D = field.dist[ci * n + cj], P = field.parent[ci * n + cj]; let kk = -1;
    if (L && D) for (let k = 0; k < L.length; k++) if (L[k] <= yy + 0.6 && D[k] >= 0 && (kk < 0 || L[k] > L[kk])) kk = k;
    if (kk >= 0) { if (D[kk] === 0) return null; const p = P && P[kk]; if (p) { const px = -nav.half + p[0] + 0.5, pz = -nav.half + p[1] + 0.5, dx = px - x, dz = pz - z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; } } }
  /* 2) Casilla que la rejilla no conoce (colado pegado a una pared o bajo una escalera): la casilla conocida alcanzable más cercana */
  for (let r = 1; r <= 3; r++) {
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      if (i < 0 || j < 0 || i >= n || j >= n || (Math.abs(i - ci) !== r && Math.abs(j - cj) !== r)) continue;
      const L = nav.layers[i * n + j], D = field.dist[i * n + j]; if (!L || !D) continue;
      for (let k = 0; k < L.length; k++) {
        if (D[k] === undefined || D[k] < 0 || L[k] > yy + 0.6 || L[k] < yy - 1.5) continue;   // alcanzable: como mucho un escalón por encima, o bajando
        const cx = -nav.half + i + 0.5, cz = -nav.half + j + 0.5, sc = D[k] + Math.hypot(cx - x, cz - z) * 2;
        if (sc < bs) { bs = sc; best = [cx, cz]; }
      }
    }
    if (best) break;
  }
  if (!best) return null;
  const dx = best[0] - x, dz = best[1] - z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
}
function navDir(nav, field, x, z, y) {
  if (!field) return null;
  const n = nav.n, ci = Math.max(0, Math.min(n - 1, Math.floor(x + nav.half))), cj = Math.max(0, Math.min(n - 1, Math.floor(z + nav.half)));
  const ck = navLayer(nav, ci, cj, y);
  const cell = ck >= 0 ? field.dist[ci * n + cj] : null;
  if (cell && cell[ck] === 0) return null;   // ya está en el destino
  if (ck < 0 || !cell || cell[ck] === undefined || cell[ck] < 0) return navRescue(nav, field, ci, cj, x, z, y);   // [BOTS] casilla que la rejilla no conoce
  const pcell = field.parent[ci * n + cj], p = pcell && pcell[ck]; if (!p) return navRescue(nav, field, ci, cj, x, z, y);
  const px = -nav.half + p[0] + 0.5, pz = -nav.half + p[1] + 0.5, dx = px - x, dz = pz - z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
}

/* Construye el mundo de un mapa: colisiones y puntos de paso/aparición. */
function buildWorld(i, onBox) {
  const m = MAPS[i], colliders = [], b = makeBuilder(onBox, colliders);
  m.build(b);
  let waypoints = [];
  for (const st of [4, 2]) {   // [MAPAS KRUNKER 2] un mapa de calles estrechas (poco suelo libre) usa una rejilla de 2 m para tener puntos de sobra
    waypoints = [];
    for (let x = -(m.half - 4); x <= m.half - 4; x += st) for (let z = -(m.half - 4); z <= m.half - 4; z += st) if (!overlapAt(colliders, x, 0, z, 0.6, 1.8)) waypoints.push([x, z]);
    if (waypoints.length >= 200) break;
  }
  return { colliders, waypoints, half: m.half, map: m, spawns: m.spawns || null, zones: m.zones || null, areas: m.areas || [], nav: buildNav(colliders, m.half) };
}

/* Economía (PX) y progreso: se comparten con el servidor, que es quien reparte y cobra en las cuentas online. */
const COLOR_COSTS = [0, 0, 0, 0, 150, 150, 300, 300, 500, 500, null, null, null, null, null];   // [RANGOS] null = exclusivo de rango: no se compra ni se vende ni se intercambia
/* [NUEVO] Los colores de pago (coste > 0) se pueden comerciar en el mercado; su rareza depende del coste. */
const COLOR_NAMES = ['Naranja', 'Coral', 'Azul', 'Turquesa', 'Amarillo', 'Violeta', 'Cian', 'Lima', 'Carbón', 'Blanco', 'Plata', 'Oro', 'Platino', 'Diamante', 'Maestro'];
const COLOR_HEX = ['#ff7b00', '#ff4d6d', '#3a86ff', '#2ec4b6', '#ffbe0b', '#b388ff', '#00c2ff', '#8ae234', '#3b4058', '#f2f5ff', '#c9d1e4', '#ffd54a', '#63e6ff', '#7aa2ff', '#ff4dd8'];
const colorRarity = i => (COLOR_COSTS[i] === null ? 'leyenda' : COLOR_COSTS[i] >= 500 ? 'epico' : COLOR_COSTS[i] >= 300 ? 'raro' : 'poco');
const RANKS = [
  { n: 'Bronce', pts: 0, col: '#cd7f32', kr: 50 },
  { n: 'Plata', pts: 1500, col: '#c9d1e4', kr: 150, color: 10 },   // [RANGOS] cada rango da un color exclusivo con su tono (antes eran colores
  { n: 'Oro', pts: 5000, col: '#ffd54a', kr: 400, color: 11 },       // que también se vendían en la tienda por 150-500 PX, y Plata no daba ninguno)
  { n: 'Platino', pts: 12000, col: '#63e6ff', kr: 800, color: 12 },
  { n: 'Diamante', pts: 25000, col: '#7aa2ff', kr: 1500, color: 13 },
  { n: 'Maestro', pts: 50000, col: '#ff4dd8', kr: 3000, color: 14 }
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
/* Skins de armas: body = color del cajón, acc = franja y detalles, dark = cargador y piezas oscuras.
   [NUEVO] rough/metal: acabado del material (0-1; solo tienen efecto donde el renderizador use un material con PBR
   — ver nota de integración). glow: color de brillo emisivo en los detalles (null = sin brillo). pattern: nombre de
   un patrón de TEX en client.js (null = liso). Las skins antiguas se dejan sin estos campos: la falta de rough/metal/
   glow/pattern se trata como "acabado normal, sin patrón ni brillo", así que sus armas se ven exactamente igual que antes. */
const WEAPON_SKINS = [
  { id: 'asalto_carbono', w: 'asalto', n: 'Carbono', r: 'comun', body: '#3a3f4b', acc: '#8b93a6', dark: '#1a1d24', rough: 0.35, metal: 0.1, pattern: 'carbono' },
  { id: 'rafaga_menta', w: 'rafaga', n: 'Menta', r: 'poco', body: '#5ee6b8', acc: '#eafff7', dark: '#1d5a49', rough: 0.5, metal: 0.05 },
  { id: 'torrente_bronce', w: 'torrente', n: 'Bronce', r: 'poco', body: '#b8763a', acc: '#ffd9a8', dark: '#4a2a12', rough: 0.3, metal: 0.75 },
  { id: 'sheriff_cobre', w: 'sheriff', n: 'Cobre viejo', r: 'raro', body: '#c8683c', acc: '#5ad1b0', dark: '#3a2418', rough: 0.55, metal: 0.6 },
  { id: 'lince_glaciar', w: 'lince', n: 'Glaciar', r: 'epico', body: '#9fe8ff', acc: '#ffffff', dark: '#1f4e66', rough: 0.15, metal: 0.2, glow: '#bdf4ff' },
  { id: 'rafaga_lava', w: 'rafaga', n: 'Lava', r: 'raro', body: '#2b1a1a', acc: '#ff5a1f', dark: '#5a1d0a', rough: 0.6, metal: 0.1, glow: '#ff5a1f', pattern: 'camuflaje' },
  { id: 'ak_jade', w: 'ak', n: 'Jade', r: 'raro', body: '#3fbf7f', acc: '#e9fff2', dark: '#134a30', rough: 0.25, metal: 0.35 },
  { id: 'torrente_hielo', w: 'torrente', n: 'Escarcha', r: 'raro', body: '#7fc8ff', acc: '#ffffff', dark: '#1c3f66', rough: 0.2, metal: 0.15, glow: '#bdeeff' },
  { id: 'sheriff_bandido', w: 'sheriff', n: 'Bandido', r: 'poco', body: '#5a3b26', acc: '#e0c07a', dark: '#26170d', rough: 0.65, metal: 0.2 },
  { id: 'asalto_neon', w: 'asalto', n: 'Neón', r: 'epico', body: '#1a1030', acc: '#ff2bd6', dark: '#0d0820', rough: 0.3, metal: 0.4, glow: '#ff2bd6' },
  { id: 'trueno_tormenta', w: 'trueno', n: 'Tormenta', r: 'epico', body: '#39457a', acc: '#ffe14a', dark: '#161c3a', rough: 0.4, metal: 0.3, glow: '#ffe14a', pattern: 'rayas' },
  { id: 'precision_eclipse', w: 'precision', n: 'Eclipse', r: 'epico', body: '#15121f', acc: '#ffb43a', dark: '#07060c', rough: 0.25, metal: 0.5, glow: '#ffb43a' },
  { id: 'lince_fantasma', w: 'lince', n: 'Fantasma', r: 'leyenda', body: '#e9edf5', acc: '#7dffea', dark: '#5b6a80', rough: 0.1, metal: 0.25, glow: '#7dffea', pattern: 'carbono' },
  { id: 'duo_oro', w: 'duo', n: 'Oro macizo', r: 'leyenda', body: '#ffcf3a', acc: '#fff4b8', dark: '#8a5f00', rough: 0.15, metal: 0.9, glow: '#fff4b8' },
  { id: 'ak_dragon', w: 'ak', n: 'Dragón', r: 'leyenda', body: '#c4161f', acc: '#ffd23a', dark: '#3a0a0e', rough: 0.3, metal: 0.35, glow: '#ff8a1f', pattern: 'camuflaje' },
  /* [NUEVO] Centinela y Vórtice no tenían ninguna skin hasta ahora */
  { id: 'centinela_acero', w: 'centinela', n: 'Acero pulido', r: 'comun', body: '#3d4452', acc: '#a7b0c2', dark: '#181c24', rough: 0.3, metal: 0.55 },
  { id: 'centinela_ocaso', w: 'centinela', n: 'Ocaso', r: 'raro', body: '#7a3a2a', acc: '#ffb066', dark: '#2a1410', rough: 0.4, metal: 0.2, glow: '#ff8c4a', pattern: 'rayas' },
  { id: 'centinela_imperial', w: 'centinela', n: 'Imperial', r: 'leyenda', body: '#1c1028', acc: '#d4af37', dark: '#0a0714', rough: 0.2, metal: 0.7, glow: '#d4af37', pattern: 'carbono' },
  { id: 'vortice_onix', w: 'vortice', n: 'Ónix', r: 'comun', body: '#232733', acc: '#6c7486', dark: '#101319', rough: 0.35, metal: 0.15 },
  { id: 'vortice_toxico', w: 'vortice', n: 'Tóxico', r: 'epico', body: '#1c2b1a', acc: '#8dff5a', dark: '#0a120a', rough: 0.45, metal: 0.1, glow: '#8dff5a', pattern: 'camuflaje' },
  /* [ARMAS KRUNKER] una skin para cada arma nueva (se consiguen como las de Centinela y Vórtice: regalo del admin o mercado) */
  { id: 'triada_selva', w: 'triada', n: 'Selva', r: 'poco', body: '#4a6b3a', acc: '#d8e8b0', dark: '#1e2c16', rough: 0.55, metal: 0.1, pattern: 'camuflaje' },
  { id: 'cometa_llamarada', w: 'cometa', n: 'Llamarada', r: 'raro', body: '#3a1a12', acc: '#ff7a1a', dark: '#1a0906', rough: 0.4, metal: 0.25, glow: '#ff7a1a', pattern: 'rayas' },
  { id: 'arpon_marfil', w: 'arpon', n: 'Marfil', r: 'epico', body: '#ece4d0', acc: '#3dd6ff', dark: '#4a3a2a', rough: 0.3, metal: 0.2, glow: '#3dd6ff' },
  /* [NEÓN] skins de la vía VIP del pase: un dibujo que emite luz propia sobre el cuerpo (neon.pat, en client.js) */
  { id: 'rafaga_circuito', w: 'rafaga', n: 'Circuito', r: 'epico', body: '#10141f', acc: '#22e6ff', dark: '#05070c', rough: 0.35, metal: 0.3, glow: '#22e6ff', neon: { pat: 'n_circuito', col: '#22e6ff' } },
  { id: 'vortice_radiacion', w: 'vortice', n: 'Radiación', r: 'epico', body: '#101a0d', acc: '#8dff3a', dark: '#050a04', rough: 0.35, metal: 0.3, glow: '#8dff3a', neon: { pat: 'n_hex', col: '#8dff3a' } },
  { id: 'sheriff_brasas', w: 'sheriff', n: 'Brasas', r: 'epico', body: '#1a1414', acc: '#ff7a1a', dark: '#0a0606', rough: 0.35, metal: 0.3, glow: '#ff7a1a', neon: { pat: 'n_grietas', col: '#ff7a1a' } },
  { id: 'duo_sintonia', w: 'duo', n: 'Sintonía', r: 'epico', body: '#1a0d24', acc: '#ff3df0', dark: '#0a0510', rough: 0.35, metal: 0.3, glow: '#ff3df0', neon: { pat: 'n_rayas', col: '#ff3df0' } },
  { id: 'precision_aurora', w: 'precision', n: 'Aurora', r: 'epico', body: '#0b1424', acc: '#3dffc4', dark: '#04080f', rough: 0.35, metal: 0.3, glow: '#3dffc4', neon: { pat: 'n_rayas', col: '#3dffc4' } },
  { id: 'trueno_voltio', w: 'trueno', n: 'Voltio', r: 'epico', body: '#0d1330', acc: '#ffe23a', dark: '#050816', rough: 0.35, metal: 0.3, glow: '#ffe23a', neon: { pat: 'n_grietas', col: '#ffe23a' } },
  { id: 'torrente_magma', w: 'torrente', n: 'Magma', r: 'leyenda', body: '#140c0a', acc: '#ff4a1a', dark: '#070403', rough: 0.35, metal: 0.3, glow: '#ff4a1a', neon: { pat: 'n_grietas', col: '#ff4a1a' } },
  { id: 'centinela_hielo_negro', w: 'centinela', n: 'Hielo negro', r: 'leyenda', body: '#0a0e16', acc: '#7fe8ff', dark: '#04060a', rough: 0.35, metal: 0.3, glow: '#7fe8ff', neon: { pat: 'n_circuito', col: '#7fe8ff' } },
  { id: 'asalto_osario', w: 'asalto', n: 'Osario', r: 'leyenda', body: '#e9e2d0', acc: '#ff2a3a', dark: '#2a1414', rough: 0.35, metal: 0.3, glow: '#ff2a3a', neon: { pat: 'n_grietas', col: '#ff2a3a' } },
  { id: 'lince_espectro', w: 'lince', n: 'Espectro', r: 'leyenda', body: '#120c1c', acc: '#b25cff', dark: '#06040c', rough: 0.35, metal: 0.3, glow: '#b25cff', neon: { pat: 'n_hex', col: '#b25cff' } },
  { id: 'ak_nucleo', w: 'ak', n: 'Núcleo', r: 'leyenda', body: '#12080c', acc: '#ff2d6f', dark: '#070306', rough: 0.35, metal: 0.3, glow: '#ff2d6f', neon: { pat: 'n_circuito', col: '#ff2d6f' } }
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
  { id: 'k_vacio', n: 'Vacío', r: 'leyenda', blade: '#2a1f45', edge: '#b56cff', guard: '#7a3cff', handle: '#0d0820' },
  /* [CUCHILLOS] Cuchillos de la ruleta (ru: 1): cada «kind» es un modelo distinto y los que llevan «fx» tienen luces
     que recorren la hoja (fx.pat: 'ola' franjas que suben, 'pulso' brillo que late, 'rayo' zigzag eléctrico) */
  { id: 'k_machete', kind: 'machete', n: 'Machete', r: 'poco', ru: 1, blade: '#c7ced8', edge: '#f4f7fb', guard: '#2b2b30', handle: '#5a3a1e' },
  { id: 'k_bayoneta', kind: 'bayonet', n: 'Bayoneta', r: 'poco', ru: 1, blade: '#b9c2cf', edge: '#ffffff', guard: '#3a3f4b', handle: '#23272f' },
  { id: 'k_daga', kind: 'dagger', n: 'Daga', r: 'raro', ru: 1, blade: '#dfe6f2', edge: '#ffffff', guard: '#c9973a', handle: '#3a1a14' },
  { id: 'k_mariposa', kind: 'butterfly', n: 'Mariposa', r: 'raro', ru: 1, blade: '#d8e0ec', edge: '#ffffff', guard: '#8a93a8', handle: '#2a3148' },
  { id: 'k_karambit', kind: 'karambit', n: 'Karambit', r: 'raro', ru: 1, blade: '#cfd6e2', edge: '#ffffff', guard: '#1c1f28', handle: '#1f6b4a' },
  { id: 'k_machete_brasas', kind: 'machete', n: 'Machete Brasas', r: 'epico', ru: 1, blade: '#2a1510', edge: '#ffb070', guard: '#1a0d0a', handle: '#3a140c', fx: { col: '#ff5a1a', pat: 'pulso' } },
  { id: 'k_bayoneta_rayo', kind: 'bayonet', n: 'Bayoneta Rayo', r: 'epico', ru: 1, blade: '#141a2e', edge: '#fff4a8', guard: '#0b0f1c', handle: '#1b2340', fx: { col: '#ffe23a', pat: 'rayo' } },
  { id: 'k_daga_sombra', kind: 'dagger', n: 'Daga Sombra', r: 'epico', ru: 1, blade: '#1a1028', edge: '#e2c4ff', guard: '#3a1f5c', handle: '#0d0818', fx: { col: '#b25cff', pat: 'ola' } },
  { id: 'k_mariposa_aurora', kind: 'butterfly', n: 'Mariposa Aurora', r: 'leyenda', ru: 1, blade: '#0c1a24', edge: '#c8fff0', guard: '#1a3a4a', handle: '#08131c', fx: { col: '#3dffc4', pat: 'ola' } },
  { id: 'k_karambit_plasma', kind: 'karambit', n: 'Karambit Plasma', r: 'leyenda', ru: 1, blade: '#1c0a22', edge: '#ffc4f6', guard: '#12061a', handle: '#2a0d33', fx: { col: '#ff3df0', pat: 'pulso' } }
];
/* [RULETA] Evento de la ruleta de cuchillos: cada tirada cuesta PX y SIEMPRE da un cuchillo que aún no tienes (nunca repetidos,
   así que con 10 tiradas tienes todos). Probabilidad por rareza; dentro de una rareza, todos igual. Si ya tienes todos los de una
   rareza, su parte se reparte entre las demás. Las probabilidades se enseñan en la tienda. */
const KNIFE_ROULETTE = { px: 2500, weights: { poco: 40, raro: 30, epico: 20, leyenda: 10 } };
const OUTFIT_ROULETTE = { px: 4500, weights: { epico: 60, leyenda: 40 } };   // [RULETA TRAJES] misma regla: nunca repetidos
const rouletteDef = kind => (kind === 'outfit' ? { R: OUTFIT_ROULETTE, list: () => OUTFITS, t: 'outfit' } : { R: KNIFE_ROULETTE, list: () => KNIFE_SKINS, t: 'kskin' });
function rouletteOdds(owned, kind) {   // owned: Set o lista de ids que ya tiene → [{ id, p }] con p en 0..1 (suma 1), o [] si ya los tiene todos
  const D = rouletteDef(kind), has = new Set(owned || []), pool = D.list().filter(k => k.ru && !has.has(k.id)), byR = {};
  for (const k of pool) (byR[k.r] = byR[k.r] || []).push(k);
  const tot = Object.keys(byR).reduce((a, r) => a + (D.R.weights[r] || 0), 0); if (!tot) return [];
  return pool.map(k => ({ id: k.id, p: (D.R.weights[k.r] || 0) / tot / byR[k.r].length }));
}
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
/* [NEÓN] 11 skins de neón, una por arma, en niveles de la vía VIP que antes daban PX (quien ya reclamó ese nivel recibe la skin: ver battlepass.js) */
Object.assign(BP_VIP, { 5: bpItem('wskin', 'rafaga_circuito'), 8: bpItem('wskin', 'vortice_radiacion'), 11: bpItem('wskin', 'sheriff_brasas'), 15: bpItem('wskin', 'duo_sintonia'), 18: bpItem('wskin', 'precision_aurora'), 21: bpItem('wskin', 'trueno_voltio'), 25: bpItem('wskin', 'torrente_magma'), 30: bpItem('wskin', 'centinela_hielo_negro'), 35: bpItem('wskin', 'asalto_osario'), 40: bpItem('wskin', 'lince_espectro'), 45: bpItem('wskin', 'ak_nucleo') });
const BP_TIERS = Array.from({ length: BP_LEVELS }, (_, i) => { const l = i + 1; return { level: l, free: BP_FREE[l] || bpPx(8 + Math.floor(l / 16) * 4), vip: BP_VIP[l] || bpPx(10 + Math.floor(l / 12) * 5) }; });
/* [NUEVO] Mascotas: te siguen en la partida y los demás jugadores las ven. Solo se consiguen comprándolas con PX en la
   tienda (el servidor cobra y comprueba que la tienes antes de dejarte equiparla). kind = forma del modelo en client.js. */
const PETS = [
  { id: 'pet_cubi', n: 'Cubi', r: 'comun', px: 600, kind: 'cube', body: '#ffd23a', acc: '#ffffff', eye: '#1b2038' },
  { id: 'pet_rayito', n: 'Rayito', r: 'poco', px: 900, kind: 'cube', body: '#5ad1ff', acc: '#e9fbff', eye: '#0b1c33' },
  { id: 'pet_dron', n: 'Dron Z-3', r: 'raro', px: 1500, kind: 'drone', body: '#39414f', acc: '#ff5a1f', eye: '#8dff5a' },
  { id: 'pet_fantasmin', n: 'Fantasmín', r: 'epico', px: 2500, kind: 'ghost', body: '#e9edf5', acc: '#7dffea', eye: '#1b2038' },
  { id: 'pet_zorro', n: 'Zorro Píxel', r: 'epico', px: 2800, kind: 'fox', body: '#ff8a1f', acc: '#ffffff', eye: '#1b2038' },
  { id: 'pet_dragon', n: 'Dragoncito', r: 'leyenda', px: 5000, kind: 'dragon', body: '#c4161f', acc: '#ffd23a', eye: '#fff4b8' },
  /* [MASCOTAS 2] bolas con ojos (varios colores), pájaro y platillo volador (la más cara) */
  { id: 'pet_bola_roja', n: 'Bola Roja', r: 'comun', px: 500, kind: 'ball', body: '#ff4d6d', acc: '#ffc2cd', eye: '#1b2038' },
  { id: 'pet_bola_verde', n: 'Bola Verde', r: 'comun', px: 500, kind: 'ball', body: '#3fd15a', acc: '#c8f7d0', eye: '#1b2038' },
  { id: 'pet_bola_azul', n: 'Bola Azul', r: 'comun', px: 500, kind: 'ball', body: '#3a86ff', acc: '#cfe0ff', eye: '#1b2038' },
  { id: 'pet_bola_morada', n: 'Bola Morada', r: 'poco', px: 800, kind: 'ball', body: '#9b5cff', acc: '#e3d2ff', eye: '#1b2038' },
  { id: 'pet_bola_dorada', n: 'Bola Dorada', r: 'raro', px: 1400, kind: 'ball', body: '#ffcf3a', acc: '#fff4b8', eye: '#3a2a08' },
  { id: 'pet_pajaro', n: 'Pico Azul', r: 'raro', px: 1800, kind: 'bird', body: '#3aa0ff', acc: '#ffb020', eye: '#1b2038' },
  { id: 'pet_platillo', n: 'Platillo Volador', r: 'leyenda', px: 7500, kind: 'ufo', body: '#c9d1e4', acc: '#8dff5a', eye: '#3dff9a' }
];
/* [TRAJES] Trajes de personaje: cambian el muñeco entero (casco, chaleco, cara…) y lo ven todos. Solo se compran con PX en la
   tienda (ni pase ni mercado); el servidor comprueba que lo tienes antes de dejarte ponerlo. kind = forma en client.js.
   El color del equipo se sigue viendo en hombreras y brazaletes. */
const OUTFITS = [
  { id: 'of_mil_azul', n: 'Militar Azul', r: 'poco', px: 1200, kind: 'soldier', main: '#2f5bb0', dark: '#1b3368', acc: '#9fc2ff', pants: '#233a6b', helm: '#27457f' },
  { id: 'of_mil_rojo', n: 'Militar Rojo', r: 'poco', px: 1200, kind: 'soldier', main: '#b0322f', dark: '#661b1a', acc: '#ffb0a8', pants: '#6b2523', helm: '#7f2927' },
  { id: 'of_camuflaje', n: 'Camuflaje', r: 'raro', px: 1800, kind: 'soldier', camo: true, main: '#5b6b3a', dark: '#39432a', acc: '#c9c28a', pants: '#4a5530', helm: '#4e5a33' },
  { id: 'of_bombero', n: 'Bombero', r: 'epico', px: 2600, kind: 'firefighter', main: '#c9a45a', dark: '#6b5530', acc: '#e8ff4a', pants: '#b8944f', helm: '#d6282b' },
  { id: 'of_antibombas', n: 'Antibombas', r: 'epico', px: 3200, kind: 'eod', main: '#5d6b45', dark: '#343c27', acc: '#ffcf3a', pants: '#56633f', helm: '#4f5b3a' },
  { id: 'of_alien', n: 'Alienígena', r: 'leyenda', px: 9000, kind: 'alien', main: '#c9d1e4', dark: '#6b7390', acc: '#6dff4a', pants: '#a9b2c9', helm: '#7bdc5a' },
  { id: 'of_lobo', n: 'Hombre Lobo', r: 'leyenda', px: 9000, kind: 'wolf', main: '#6b5a4a', dark: '#3a2f27', acc: '#ffd23a', pants: '#3b4a6b', helm: '#7a6856' },
  /* [RULETA TRAJES] Trajes con efectos (ru: 1): solo salen en la ruleta de trajes, no se venden sueltos */
  { id: 'of_neon', n: 'Neón', r: 'epico', ru: 1, kind: 'neon', main: '#16181f', dark: '#0e1016', acc: '#ff2bd6', acc2: '#2ee6ff', pants: '#101218', helm: '#1b1d25' },
  { id: 'of_yakuza', n: 'Oro Yakuza', r: 'epico', ru: 1, kind: 'yakuza', main: '#151515', dark: '#0b0b0b', acc: '#d9a43a', acc2: '#e0342a', pants: '#121212', helm: '#1a1a1a' },
  { id: 'of_dragon', n: 'Dragón Imperial', r: 'leyenda', ru: 1, kind: 'dragon', main: '#c42f14', dark: '#8a1f0e', acc: '#e8b43a', acc2: '#ffcf5a', pants: '#7a1c10', helm: '#a3290f' },
  { id: 'of_espectro', n: 'Espectro Ártico', r: 'leyenda', ru: 1, kind: 'spectre', main: '#5a6f7c', dark: '#3f515c', acc: '#d8f4ff', acc2: '#9fe8ff', pants: '#51656f', helm: '#62757f' }
];
const bpFind = r => (r.t === 'wskin' ? WEAPON_SKINS : r.t === 'kskin' ? KNIFE_SKINS : r.t === 'banner' ? BANNERS : r.t === 'pet' ? PETS : r.t === 'outfit' ? OUTFITS : r.t === 'avatar' ? (typeof AVATARS !== 'undefined' ? AVATARS : []) : []).find(x => x.id === r.id) || null;
/* Nombre y rareza de cualquier recompensa (los PX se clasifican por cantidad) */
const bpInfo = r => {
  if (r.t === 'px') return { n: r.n + ' PX', r: r.n >= 400 ? 'epico' : r.n >= 200 ? 'raro' : r.n >= 100 ? 'poco' : 'comun' };
  const it = bpFind(r); return it ? { n: it.n, r: it.r } : { n: '?', r: 'comun' };
};

/* ---------- [NUEVO] Segunda moneda y mercado ----------
   PX = moneda premium (se compra con dinero real en la tienda; sirve para el pase, colores y rangos).
   Créditos (CR) = moneda que solo se gana jugando y vendiendo en el mercado; es la ÚNICA moneda del mercado, así no se compra ni se vende nada por dinero real entre jugadores. */
const crFor = (points, won) => Math.min(400, Math.round(Math.max(0, points) / 8) + (won ? 40 : 0));   // CR por partida online
const MARKET = { FEE: 0.10, MAX_LISTINGS: 8, MAX_PRICE: 1000000, MIN_PRICE: { comun: 20, poco: 60, raro: 150, epico: 400, leyenda: 1000 } };   // comisión del 10 %, precio mínimo por rareza

/* ---------- [NUEVO] Modos de juego, clasificatorio y ligas ----------
   Todos los modos son por equipos (azul / rojo, sin fuego amigo). «duelo» es el modo de siempre. */
/* [NUEVO] Tienda de armas de la pantalla de reaparición: 8 armas con precio en Cash (dinero de partida que se reinicia cada ronda; se gana matando).
   wi = índice en WEAPONS; price = precio en Cash. Se usan armas ya existentes del juego (no se añaden modelos nuevos). */
const SHOP = ['asalto', 'centinela', 'lince', 'trueno', 'rafaga', 'vortice', 'precision', 'sheriff', 'torrente', 'duo', 'ak', 'triada', 'arpon', 'cometa'].map((id, i) => ({
  wi: WEAPONS.findIndex(w => w.id === id), price: [1200, 1450, 2100, 950, 1100, 1300, 400, 650, 1350, 350, 1250, 1400, 1800, 2400][i]
  // [ARMAS KRUNKER] Tríada 1400 · Arpón 1800 · Cometa 2400 (la más cara: daño en área)
  // [PR2] torrente 1350 (cargador de 100, ametralladora): justo por encima de Vórtice (1300) y por debajo de Centinela (1450)
  // [PR2] duo 350 (pistolas dobles, alcance corto): la más barata, un peldaño por debajo de Precisión (400)
  // [PR2] ak 1250 (más daño que Asalto): justo por encima de Asalto (1200) y por debajo de Vórtice (1300)
}));
/* Estadísticas de la tarjeta de la tienda (DMG · RPM · RNG · ACC), derivadas de los números reales del arma. */
function shopStats(w) {
  const rpm = Math.round(60 / (w.burst ? ((w.burst - 1) * w.interval + w.burstCd) / w.burst : w.interval)),   // [ARMAS KRUNKER] en ráfaga cuenta la pausa entre ráfagas
    acc = Math.max(40, Math.min(97, Math.round(100 - (w.scopedSpread != null ? w.scopedSpread : w.spread) * 1000)));
  const rng = Math.max(1, Math.min(99, Math.round(w.range / 2)));
  return { dmg: w.dmg, rpm, acc, rng };
}

const MODES = {
  duelo:     { id: 'duelo',     name: 'Duelo por equipos', short: 'DUELO',    desc: 'El clásico: gana el equipo que llegue antes al límite de bajas.', guns: true },
  zona:      { id: 'zona',      name: 'Capturar zona',     short: 'ZONA',     desc: 'Una zona cambia de sitio cada 50 s. Suma puntos el equipo que la controla en solitario.', guns: true },
  cuchillos: { id: 'cuchillos', name: 'Solo cuchillos',    short: 'CUCHILLOS', desc: 'Sin armas de fuego: cuchillo en mano y a moverse rápido.', guns: false },
  carrera:   { id: 'carrera',   name: 'Carrera de armas',  short: 'CARRERA',  desc: 'Cada baja te da un arma nueva. Al llegar al cuchillo, una baja más y tu equipo gana. Si te matan a cuchillo, bajas de nivel.', guns: true },
  bomba:     { id: 'bomba',     name: 'Desactivar bomba',  short: 'BOMBA',    desc: 'Por rondas y sin reaparecer: un equipo planta la bomba en A o B y el otro la desactiva. Los papeles cambian cada ronda; gana el primero en llegar a 4.', guns: true },   // [BOMBA]
  navidad:   { id: 'navidad',   name: 'Navidad',           short: 'NAVIDAD',  desc: 'Evento: caza duendes y recoge los regalos que sueltan. Gana el equipo con más regalos en 10 minutos.', guns: true, event: true }   // [NAVIDAD]
};
const GUN_LADDER = [8, 0, 9, 1, 7, 2, 10, 4, 6, 5, 3];   // armas por nivel (AK → … → Lince); tras la última viene el cuchillo (nivel 12)
const ZONE = { R: 5.5, MOVE_SECS: 50, LIMIT: 250 };   // [PARTIDAS] 160 → 250 con partidas de 8 min
/* [BOMBA] Desactivar bomba: rondas ganadas para vencer, duración de la ronda, mecha, segundos para plantar/desactivar, radio de cada
   punto de plantado (A/B, en el mapa: bomb), distancia para desactivar y pausa entre rondas */
const BOMB = { WIN: 4, ROUND: 80, FUSE: 35, PLANT: 3, DEFUSE: 5, R: 3.5, DEF_R: 2.2, PAUSE: 4 };  // radio de la zona, cada cuánto cambia de sitio y puntos para ganar
const LEAGUES = [
  { n: 'Hierro',   min: 0,    col: '#8a8f9e', cr: 0,    px: 0 },
  { n: 'Bronce',   min: 900,  col: '#cd7f32', cr: 150,  px: 0 },
  { n: 'Plata',    min: 1100, col: '#c9d1e4', cr: 300,  px: 50 },
  { n: 'Oro',      min: 1300, col: '#ffd54a', cr: 600,  px: 100 },
  { n: 'Platino',  min: 1500, col: '#63e6ff', cr: 1000, px: 200 },
  { n: 'Diamante', min: 1700, col: '#7aa2ff', cr: 1600, px: 350 },
  { n: 'Élite',    min: 1900, col: '#ff4dd8', cr: 2500, px: 600 }
];
const leagueIdx = mmr => { let i = 0; LEAGUES.forEach((l, k) => { if (mmr >= l.min) i = k; }); return i; };
const RANKED = { START: 1000, MIN_GAMES: 5, K: 24, K_PLACE: 32, PLACEMENT: 10, LEAVE_PENALTY: 15, MIN_TEAM: 1 };   // partidas mínimas para premio, K de Elo, penalización por abandonar

/* =========================================================================================================
   [NUEVO] MOVIMIENTO: deslizamiento y slide hop al estilo Krunker (+ «coyote time» y buffer de salto).
   Toda la lógica de velocidad, deslizamiento y salto vive aquí, en funciones puras que usan el cliente, las pruebas y el servidor (para el tope de velocidad).
   - FRICCIÓN: en suelo, sin deslizar, la velocidad se ajusta a la deseada a GROUND_ACCEL (95 m/s²: casi instantáneo, es decir, MUCHA fricción). Al deslizarse
     la fricción baja unas 15 veces (≈ 6 m/s² a 12 m/s): solo un rozamiento suave (SLIDE_DRAG, exponencial), y no se puede corregir el rumbo.
   - SLIDE HOP: saltar durante el deslizamiento, o hasta SLIDE_GRACE s después de que acabe (aunque el suelo ya no lo frene), MANTIENE el vector de velocidad horizontal
     y lo multiplica por SLIDE_JUMP (impulso), con tope MAX_H. En el aire de ese salto apenas hay rozamiento (AIR_DRAG) y se puede girar sin perder velocidad (AIR_TURN).
   - COYOTE: se puede saltar hasta COYOTE s después de salir de un borde; el buffer guarda la pulsación JUMP_BUF s antes de aterrizar.
   MAX_H es también el tope que usa el servidor para vigilar la velocidad (movimiento imposible). ========================================================================================================= */
const MOVE = {
  GROUND_ACCEL: 95, AIR_ACCEL: 24,                          // aceleración de suelo (mucha fricción) y de aire
  SLIDE_MIN: 5, SLIDE_BOOST: 1.35, SLIDE_V0: 11, SLIDE_V1: 12.4, SLIDE_TIME: 0.95, SLIDE_CD: 0.9, SLIDE_END: 3.2,   // entrada al deslizamiento
  SLIDE_DRAG: 0.6,                                          // rozamiento del deslizamiento (1/s): ×0,57 en 0,95 s
  SLIDE_GRACE: 0.22, SLIDE_JUMP: 1.2, MAX_H: 15.5,          // salto al final del deslizamiento, multiplicador de impulso y tope de velocidad horizontal
  AIR_DRAG: 0.08, AIR_TURN: 2.6,                            // aire tras un slide hop: rozamiento (1/s) y giro máximo (rad/s)
  COYOTE: 0.1, JUMP_BUF: 0.12,                              // «coyote time» y buffer de salto (s)
  HOP_MAX: 1.25, HOP_STEP: 0.05, HOP_DECAY: 0.8,            // bunny hop normal
  RAMP_ACC: 40                                              // [RAMPAS] aceleración al deslizarse por una rampa (× pendiente): cuesta abajo gana velocidad, cuesta arriba la pierde
};
/* Empieza un deslizamiento si se puede (en suelo, corriendo y sin espera). No reduce nunca la velocidad que ya llevas. Devuelve true si empezó. */
function startSlide(p) {
  const M = MOVE, s = Math.hypot(p.vel.x, p.vel.z);
  if (!p.onGround || (p.slideCd || 0) > 0 || p.slide > 0 || s <= M.SLIDE_MIN) return false;
  const v = Math.min(M.MAX_H, Math.max(s, Math.min(M.SLIDE_V1, Math.max(s * M.SLIDE_BOOST, M.SLIDE_V0))));
  p.vel.x *= v / s; p.vel.z *= v / s; p.slide = M.SLIDE_TIME; p.slideCd = M.SLIDE_CD; p.slideGrace = 0; p.slideSpeed = v; p.slideHop = false;
  return true;
}
/* Un paso de velocidad, deslizamiento y salto. p: { vel, onGround, slide, slideCd, slideGrace, slideSpeed, slideHop, jumpBuf, coyote, groundT, hop, jumping }
   inp: { wx, wz (dirección deseada normalizada), fwd, str (−1..1), speed (velocidad objetivo ya con modificadores), jump (Espacio pulsado) }
   No mueve la posición (eso lo hace moveEntity). Devuelve { jumped, slideJump }. */
function moveStep(p, inp, dt) {
  const M = MOVE, out = { jumped: false, slideJump: false }, hs = () => Math.hypot(p.vel.x, p.vel.z);
  p.slideCd = Math.max(0, (p.slideCd || 0) - dt); p.slideGrace = Math.max(0, (p.slideGrace || 0) - dt);
  if (p.onGround && p.slide <= 0 && !(p.slideGrace > 0)) p.slideHop = false;   // al aterrizar se acaba el impulso de aire
  if (p.slide > 0) {   // deslizándose: poco rozamiento y sin control del rumbo
    const k = Math.exp(-M.SLIDE_DRAG * dt); p.vel.x *= k; p.vel.z *= k; p.slide -= dt;
    if (p.ramp && p.onGround) {   // [RAMPAS] la pendiente empuja: cuesta abajo acelera (hasta MAX_H) y el deslizamiento no se acaba mientras baje
      const [dx, dz, sl] = p.ramp, a = M.RAMP_ACC * sl * dt; p.vel.x += dx * a; p.vel.z += dz * a;
      const sp0 = hs(); if (sp0 > M.MAX_H) { p.vel.x *= M.MAX_H / sp0; p.vel.z *= M.MAX_H / sp0; }
      if (p.vel.x * dx + p.vel.z * dz > 1) p.slide = Math.max(p.slide, 0.12);
    }
    const sp = hs(); p.slideSpeed = sp;
    if (!p.onGround) { p.slide = 0; if (sp > M.SLIDE_END) { p.slideGrace = M.SLIDE_GRACE; p.slideHop = true; } }   // se sale por un borde: conserva el impulso en el aire
    else if (sp < M.SLIDE_END) p.slide = 0;                                                                        // ya casi parado
    else if (p.slide <= 0) { p.slide = 0; p.slideGrace = M.SLIDE_GRACE; }                                         // fin del deslizamiento: margen para saltar con impulso
  } else if (p.slideGrace > 0 && p.onGround) {   // margen final: el suelo sigue sin frenar del todo
    const k = Math.exp(-M.SLIDE_DRAG * dt); p.vel.x *= k; p.vel.z *= k;
  } else if (!p.onGround && p.slideHop) {        // aire de un slide hop: mantiene el vector de velocidad y solo permite girarlo
    const k = Math.exp(-M.AIR_DRAG * dt); p.vel.x *= k; p.vel.z *= k;
    const sp = hs();
    if ((inp.wx || inp.wz) && sp > 0.01) {
      const a = Math.atan2(p.vel.z, p.vel.x), b = Math.atan2(inp.wz, inp.wx); let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const t = Math.max(-M.AIR_TURN * dt, Math.min(M.AIR_TURN * dt, d)); p.vel.x = Math.cos(a + t) * sp; p.vel.z = Math.sin(a + t) * sp;
    }
  } else {               // movimiento normal: la velocidad se ajusta a la deseada (en suelo casi al instante = mucha fricción)
    const acc = p.onGround ? M.GROUND_ACCEL : M.AIR_ACCEL, lim = acc * dt;
    p.vel.x += Math.max(-lim, Math.min(lim, inp.wx * inp.speed - p.vel.x)); p.vel.z += Math.max(-lim, Math.min(lim, inp.wz * inp.speed - p.vel.z));
  }
  /* Salto: buffer, coyote time, slide hop y bunny hop */
  p.jumpBuf = inp.jump ? M.JUMP_BUF : Math.max(0, (p.jumpBuf || 0) - dt);
  if (p.onGround) { p.coyote = M.COYOTE; p.groundT = (p.groundT || 0) + dt; } else { p.coyote = Math.max(0, (p.coyote || 0) - dt); p.groundT = 0; }
  if (p.onGround && p.groundT > 0.3) p.hop = Math.max(1, (p.hop || 1) - dt * M.HOP_DECAY);
  if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0) && p.vel.y <= 0.5 && !p.jumping) {
    const sp = hs();
    if (p.slide > 0 || p.slideGrace > 0) {
      const base = p.slide > 0 ? sp : Math.max(sp, p.slideSpeed || 0);       // en el margen final cuenta la velocidad que llevaba al acabar
      if (sp > 0.3) { const k = Math.min(M.MAX_H, Math.max(base, base * M.SLIDE_JUMP)) / sp; p.vel.x *= k; p.vel.z *= k; }   // MISMA dirección, más velocidad
      p.slideHop = true; out.slideJump = true;
    } else if (p.onGround && p.groundT < 0.2 && (inp.fwd !== 0 || inp.str !== 0)) p.hop = Math.min(M.HOP_MAX, (p.hop || 1) + M.HOP_STEP);   // bunny hop
    p.vel.y = CONST.JUMP; p.onGround = false; p.slide = 0; p.slideGrace = 0; p.jumpBuf = 0; p.coyote = 0; p.jumping = true; out.jumped = true;
  }
  if (p.onGround && p.vel.y <= 0) p.jumping = false;
  return out;
}

/* =========================================================================================================
   [NUEVO] VIEWMODEL (el arma en primera persona): vaivén según la velocidad y transición suave al apuntar (ADS).
   Módulo puro (sin THREE): calcula la POSICIÓN y la ROTACIÓN del arma respecto a la cámara; el motor solo las aplica (gun.position.set / gun.rotation.set).
   - WEAPON BOBBING con ondas senoidales que dependen de la velocidad: la FASE avanza con la distancia recorrida (phase += BOB_STRIDE · velocidad · dt), así que
     la frecuencia sube y baja con la velocidad del jugador; la AMPLITUD crece con la velocidad (hasta BOB_SPEED_REF m/s) y se suaviza al parar o al saltar.
     Vertical = sin(2·fase) (dos pasos por ciclo), lateral = sin(fase), con un poco de ladeo y cabeceo. En el aire la fase se congela y la amplitud se apaga.
     Al apuntar el vaivén se reduce a BOB_ADS (15 %) para que la mira no baile. Parado: una respiración muy suave.
   - ADS: el factor `ads` (0..1) se acerca a su objetivo con un lerp exponencial independiente del framerate (ADS_RATE) y la posición del arma es
     lerp(cadera, ADS, suavizado(ads)). La posición ADS se DERIVA del punto de mira del modelo (`sight`, en coordenadas del arma): el arma se desplaza justo lo
     necesario para que ese punto caiga en el centro de la pantalla (0, 0 en el espacio de la cámara), a la profundidad de la cadera. Sin `sight` (armas sin mira)
     sube ADS_FALLBACK_LIFT y se centra en X. Se puede pasar la posición ADS a mano (`ads`) o dirigir el factor desde fuera (`adsFactor`).
   - `extra` suma desplazamientos y giros de otras animaciones (retroceso del arma, recarga, cambio de arma, deslizamiento…).
   - viewmodelSight(pose, sight) da dónde está el punto de mira en el espacio de la cámara (en ADS y sin `extra` es (0, 0, z): sirve para comprobar la alineación).
   Convenciones de Three.js: la cámara mira hacia −Z; y arriba; los giros son Euler 'XYZ' (Object3D por defecto). ========================================================================================================= */
const VIEWMODEL = {
  BOB_STRIDE: 0.75,       // rad de fase por metro recorrido (a 7,4 m/s el vaivén vertical va a ~11 rad/s)
  BOB_SPEED_REF: 5,       // m/s a partir de los cuales el vaivén ya tiene toda su amplitud
  BOB_Y: 0.006, BOB_X: 0.005, BOB_ROLL: 0.012, BOB_PITCH: 0.006,   // amplitudes: metros (Y, X) y radianes (ladeo, cabeceo)
  BOB_FADE: 8,            // 1/s: con qué rapidez aparece y desaparece la amplitud al empezar o dejar de moverse
  BOB_ADS: 0.15,          // fracción del vaivén que queda al apuntar del todo
  IDLE_Y: 0.0015, IDLE_HZ: 0.18,   // respiración parado (metros y Hz)
  ADS_RATE: 22,           // 1/s: velocidad del lerp hacia/desde el apuntado (≈ 0,1 s al 90 %)
  ADS_FALLBACK_LIFT: 0.03 // armas sin mira: cuánto sube el arma al apuntar
};
const _vmLerp = (a, b, t) => a + (b - a) * t;
function createViewmodel(params) {
  const P = Object.assign({}, VIEWMODEL, params), st = { ads: 0, phase: 0, amp: 0, idleT: 0 }, pose = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, ads: 0 };
  /* dt en s. inp: { speed (m/s horizontal), onGround, adsTarget (bool) | adsFactor (0..1, lo dirige el motor), hip {x,y,z}, sight {x,y,z}|null, ads {x,y,z}?, extra {px,py,pz,rx,ry,rz}? }
     Devuelve (y reutiliza) el objeto `pose`: { px, py, pz, rx, ry, rz, ads } */
  function update(dt, inp) {
    const hip = inp.hip || { x: 0.2, y: -0.2, z: -0.35 }, ex = inp.extra || {}, target = inp.adsTarget ? 1 : 0;
    if (inp.adsFactor != null) st.ads = Math.max(0, Math.min(1, inp.adsFactor));
    else { st.ads += (target - st.ads) * (1 - Math.exp(-P.ADS_RATE * dt)); if (Math.abs(st.ads - target) < 1e-4) st.ads = target; }
    const e = st.ads * st.ads * (3 - 2 * st.ads);                               // suavizado: arranca y llega despacio
    const s = inp.sight, adsP = inp.ads || (s ? { x: -s.x, y: -s.y, z: hip.z } : { x: 0, y: hip.y + P.ADS_FALLBACK_LIFT, z: hip.z });
    const speed = inp.onGround === false ? 0 : Math.max(0, +inp.speed || 0);
    st.amp += (Math.min(1, speed / P.BOB_SPEED_REF) - st.amp) * (1 - Math.exp(-P.BOB_FADE * dt));
    st.phase += P.BOB_STRIDE * speed * dt; st.idleT += dt;
    const k = 1 - (1 - P.BOB_ADS) * e, a = st.amp * k, w1 = Math.sin(st.phase), w2 = Math.sin(2 * st.phase);
    const idle = Math.sin(st.idleT * 2 * Math.PI * P.IDLE_HZ) * P.IDLE_Y * (1 - st.amp) * k;
    pose.px = _vmLerp(hip.x, adsP.x, e) + w1 * P.BOB_X * a + (ex.px || 0);
    pose.py = _vmLerp(hip.y, adsP.y, e) + w2 * P.BOB_Y * a + idle + (ex.py || 0);
    pose.pz = _vmLerp(hip.z, adsP.z, e) + (ex.pz || 0);
    pose.rx = Math.cos(2 * st.phase) * P.BOB_PITCH * a + (ex.rx || 0); pose.ry = ex.ry || 0; pose.rz = w1 * P.BOB_ROLL * a + (ex.rz || 0);
    pose.ads = st.ads; return pose;
  }
  return { params: P, state: st, pose, update, reset() { st.ads = st.phase = st.amp = st.idleT = 0; } };
}
/* Dónde queda el punto de mira `sight` (coordenadas del arma) en el espacio de la cámara con esa pose. En ADS y sin `extra` es (0, 0, z): el centro de la pantalla. */
function viewmodelSight(pose, sight) {
  let x = sight.x, y = sight.y, z = sight.z || 0, t;
  const cz = Math.cos(pose.rz), sz = Math.sin(pose.rz); t = x * cz - y * sz; y = x * sz + y * cz; x = t;   // Rz
  const cy = Math.cos(pose.ry), sy = Math.sin(pose.ry); t = x * cy + z * sy; z = -x * sy + z * cy; x = t;   // Ry
  const cx = Math.cos(pose.rx), sx = Math.sin(pose.rx); t = y * cx - z * sx; z = y * sx + z * cx; y = t;   // Rx
  return { x: x + pose.px, y: y + pose.py, z: z + pose.pz };
}

const api = { KNIFE_ROULETTE, OUTFIT_ROULETTE, rouletteDef, rouletteOdds, PETS, OUTFITS, areaAt, buildNav, navField, navRemain, navDir, SHOP, shopStats, MOVE, startSlide, moveStep, VIEWMODEL, createViewmodel, viewmodelSight, COLOR_NAMES, COLOR_HEX, colorRarity, CONST, WEAPONS, crFor, MARKET, MODES, GUN_LADDER, ZONE, BOMB, LEAGUES, leagueIdx, RANKED, OPTICS, MAPS, RARITY, WEAPON_SKINS, KNIFE_SKINS, BANNERS, BP_LEVELS, BP_TIERS, BP_PRICES, bpXpToNext, bpTotalXp, bpLevelOf, bpXpFor, bpFind, bpInfo, COLOR_COSTS, RANKS, EVENTS, todayEvent, eventMult, pxFor, buildWorld, overlapAt, moveEntity, rayBox, rayWorld, insetColliders, wallViolation, raySphere, rayCyl };
root.VoltShared = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
