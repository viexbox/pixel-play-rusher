/* PixelPlayRusher · código compartido entre el navegador y el servidor.
   Contiene armas, mapas, física y trazado de rayos. */
(function (root) {
'use strict';
const TAU = Math.PI * 2;
/* [AJUSTE estilo Krunker] Más velocidad, salto más seco y gravedad mayor (menos tiempo en el aire). El servidor vigila la velocidad con MOVE.MAX_H (15,5 m/s): el bunny hop llega a ~11 m/s, el deslizamiento a ~12,4 y un slide hop a ~14,9. */
const CONST = { WALK: 7.4, SPRINT: 8.8, CROUCH: 4.2, JUMP: 8.6, GRAV: 27, STEP: 0.55, MATCH_TIME: 300, KILL_LIMIT: 40, RESPAWN: 3, SHOP_START_CASH: 800, SHOP_KILL_CASH: 350 };   // [NUEVO] economía de la tienda de armas

const WEAPONS = [
  { id: 'asalto', name: 'Asalto', type: 'Fusil de asalto', desc: 'Equilibrado y fiable a cualquier distancia.', dmg: 20, interval: 0.1, mag: 30, reload: 1.7, spread: 0.011, pellets: 1, range: 130, kick: 0.006, fall: null, aimFov: 0.78, speed: 1, stats: [3, 4, 4], col: '#ff5a5f', size: [0.07, 0.1, 0.5], look: { mag: [0.05, 0.16, 0.08, -0.3], barrel: 0.5 }, optics: ['punto', 'hierro'] },
  { id: 'rafaga', name: 'Ráfaga', type: 'Subfusil', desc: 'Cadencia altísima para el cuerpo a cuerpo.', dmg: 13, interval: 0.055, mag: 40, reload: 1.5, spread: 0.026, pellets: 1, range: 70, kick: 0.004, fall: [15, 45, 0.5], aimFov: 0.85, speed: 1.08, stats: [2, 5, 2], col: '#3ddc97', size: [0.07, 0.1, 0.34], look: { mag: [0.04, 0.2, 0.06, -0.2], barrel: 0.35 }, optics: ['punto', 'hierro'] },
  { id: 'torrente', name: 'Torrente', type: 'Ametralladora ligera', desc: 'Cargador enorme, pero te ralentiza.', dmg: 16, interval: 0.08, mag: 100, reload: 3.4, spread: 0.03, pellets: 1, range: 110, kick: 0.005, fall: null, aimFov: 0.85, speed: 0.88, stats: [3, 5, 3], col: '#ff9f5a', size: [0.1, 0.12, 0.55], look: { mag: [0.12, 0.13, 0.14, -0.28], barrel: 0.5 }, optics: ['punto', 'hierro'] },
  { id: 'lince', name: 'Lince', type: 'Francotirador', desc: 'Un disparo a la cabeza elimina. Mira de precisión.', dmg: 80, head: 150, interval: 0.95, mag: 5, reload: 2.2, spread: 0.05, scopedSpread: 0.0015, pellets: 1, range: 300, kick: 0.03, fall: null, aimFov: 0.3333, scope: true, speed: 0.95, stats: [5, 1, 5], col: '#7ea6ff', size: [0.06, 0.08, 0.8], look: { scope: 0.28, barrel: 0.3 }, optics: ['scope3', 'scope6'] },
  { id: 'trueno', name: 'Trueno', type: 'Escopeta', desc: 'Devastadora a corta distancia.', dmg: 12, interval: 0.75, mag: 6, reload: 2.1, spread: 0.06, pellets: 8, range: 50, kick: 0.035, fall: [6, 22, 0.15], aimFov: 0.9, speed: 1, stats: [5, 2, 1], col: '#ffc857', size: [0.09, 0.12, 0.46], look: { barrel: 0.3, pump: true }, optics: ['punto', 'hierro'] },
  { id: 'sheriff', name: 'Sheriff', type: 'Revólver', desc: 'Dos disparos al cuerpo bastan.', dmg: 55, head: 110, interval: 0.5, mag: 6, reload: 2, spread: 0.005, pellets: 1, range: 110, kick: 0.028, fall: null, aimFov: 0.8, speed: 1.02, stats: [4, 2, 4], col: '#d9a441', size: [0.055, 0.09, 0.22], look: { drum: true, barrel: 0.6 }, optics: ['punto', 'hierro'] },
  { id: 'precision', name: 'Precisión', type: 'Semiautomático', desc: 'Disparos rápidos y certeros con mira óptica.', dmg: 36, head: 72, interval: 0.24, mag: 10, reload: 1.9, spread: 0.004, pellets: 1, range: 200, kick: 0.014, fall: null, aimFov: 0.5, speed: 1, stats: [4, 3, 5], col: '#a58bd6', size: [0.06, 0.09, 0.6], look: { scope: 0.16, barrel: 0.35 } },
  { id: 'duo', name: 'Dúo', type: 'Pistolas dobles', desc: 'Una en cada mano: cadencia alta, poco alcance.', dmg: 11, interval: 0.075, mag: 30, reload: 1.6, spread: 0.022, pellets: 1, range: 55, kick: 0.004, fall: [15, 40, 0.5], aimFov: 0.9, speed: 1.06, dual: true, stats: [2, 5, 2], col: '#5fd0e6', size: [0.05, 0.08, 0.2], look: { barrel: 0.3 } },
  { id: 'ak', name: 'AK', type: 'Fusil AK', desc: 'Daño alto y retroceso marcado. Elige tu mira: hierro, punto rojo, holográfica o ACOG.', dmg: 27, interval: 0.115, mag: 30, reload: 2.0, spread: 0.014, pellets: 1, range: 140, kick: 0.011, fall: [60, 140, 0.7], aimFov: 0.82, speed: 0.98, stats: [4, 3, 3], col: '#ffb020', size: [0.07, 0.1, 0.56], look: { mag: [0.05, 0.2, 0.08, -0.3], barrel: 0.5 }, optics: ['hierro', 'punto', 'holo', 'acog'] },
  /* [NUEVO] Armas añadidas al final para no cambiar los números de clase existentes */
  { id: 'vortice', name: 'Vórtice', type: 'Subfusil táctico', desc: 'Cadencia y control: a media distancia supera a los subfusiles clásicos.', dmg: 15, interval: 0.07, mag: 32, reload: 1.6, spread: 0.017, pellets: 1, range: 90, kick: 0.005, fall: [25, 60, 0.6], aimFov: 0.84, speed: 1.04, stats: [3, 5, 3], col: '#c77dff', size: [0.07, 0.1, 0.4], look: { mag: [0.04, 0.18, 0.07, -0.25], barrel: 0.4 }, optics: ['punto', 'hierro'] },
  { id: 'centinela', name: 'Centinela', type: 'Fusil de batalla', desc: 'Tres disparos al cuerpo o dos a la cabeza. Preciso y contundente.', dmg: 48, head: 96, interval: 0.36, mag: 12, reload: 2.2, spread: 0.006, pellets: 1, range: 220, kick: 0.02, fall: null, aimFov: 0.55, speed: 0.96, stats: [5, 2, 5], col: '#2dd4bf', size: [0.07, 0.1, 0.62], look: { scope: 0.18, barrel: 0.4 } }
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
    name: 'Nexus Outpost', half: 58,   // [MAPA] antes 50: 116 × 116 m, con un anillo exterior de casetas en las que se puede entrar
    desc: 'Complejo táctico amurallado de 4 niveles: plaza elevada con torre de francotiradores, patio central, reactor en alto, red de tejados con helipuertos, centro tecnológico, armería y un punto de captura en la azotea.',
    sky: ['#2a86ff', '#cfe6ff'], fog: '#cfe6ff', floor: ['#7f8898', '#6f7888'], out: '#62c94a', pal: ['#aab2be', '#ff8a1f', '#3fd15a', '#3a9bff', '#ffd23f'],
    look: { floor: 'concfloor', outFloor: 'grass', wall: 'concrete', block: 'concrete', metal: 'metal', crate: 'crate', plat: 'concfloor', sun: '#fff4d6', decor: 'nexus', wallH: 8.5 },
    /* Apariciones por equipo (equipo 1 = ROJO, equipo 0 = AZUL): [x, z] */
    spawns: {
      1: [[-44, 4], [-40, 7], [-44, 10], [-38, 13], [-44, 16], [-36, 18], [-41, 21]],
      0: [[41, 3], [45, 5], [40, 7], [44, 9], [41, 11], [46, 2], [38, 5]]
    },
    /* Zonas del modo «Capturar zona» (y = altura del suelo de la zona): la captura solo cuenta a quien está a esa altura (±2,6 m) */
    zones: [
      { n: 'Central Courtyard', x: -6, z: 28, y: 0 }, { n: 'Main Plaza', x: -24, z: -14, y: 1.8 }, { n: 'Lower Plaza', x: 25, z: 24, y: 0 },
      { n: 'Reactor Complex', x: 10, z: -1, y: 3.6 }, { n: 'Capture Point', x: 40, z: -13, y: 3.6 }
    ],
    /* Nombres de las zonas del mapa (para el rótulo «estás en…»): el primero que encaje gana. y = altura de los pies. */
    areas: [
      { n: 'Hut', x0: 51, x1: 56, z0: -28, z1: -22, y0: 0, y1: 3 }, { n: 'Hut', x0: 51, x1: 56, z0: 14, z1: 20, y0: 0, y1: 3 }, { n: 'Hut', x0: -56, x1: -51, z0: -28, z1: -22, y0: 0, y1: 3 }, { n: 'Hut', x0: -56, x1: -51, z0: 14, z1: 20, y0: 0, y1: 3 }, { n: 'Hut', x0: -14, x1: -8, z0: 51, z1: 56, y0: 0, y1: 3 }, { n: 'Hut', x0: 20, x1: 26, z0: 51, z1: 56, y0: 0, y1: 3 }, { n: 'Hut', x0: -14, x1: -8, z0: -56, z1: -51, y0: 0, y1: 3 }, { n: 'Hut', x0: 20, x1: 26, z0: -56, z1: -51, y0: 0, y1: 3 },    // [MAPA] casetas del anillo exterior
      
      { n: 'Helipad A', x0: -44, x1: -35, z0: -47.5, z1: -38.5, y0: 4.5, y1: 9 }, { n: 'Helipad B', x0: -9, x1: 0, z0: -47.5, z1: -38.5, y0: 4.5, y1: 9 },
      { n: 'Tech Hub', x0: 32, x1: 48, z0: -48, z1: -30, y0: 4.5, y1: 9 }, { n: 'West Tower Roof', x0: 16, x1: 26, z0: -48, z1: -34, y0: 4.5, y1: 9 },
      { n: 'East Roof', x0: -46, x1: -22, z0: -48, z1: -30, y0: 4.5, y1: 9 },
      { n: 'Reactor Complex', x0: -2, x1: 18, z0: -34, z1: 2, y0: 2.5, y1: 10 },
      { n: 'Sniper Perch', x0: -48, x1: -33, z0: -22, z1: -8, y0: 2.2, y1: 10 },
      { n: 'Rooftop Network', x0: -50, x1: 50, z0: -50, z1: -22, y0: 4.5, y1: 9 },
      { n: 'Capture Point', x0: 30, x1: 48, z0: -30, z1: 0, y0: 2.5, y1: 8 },
      { n: 'Armory', x0: 32, x1: 47, z0: 12, z1: 36, y0: -1, y1: 5 }, { n: 'Armory', x0: 24, x1: 32, z0: 29, z1: 35, y0: -1, y1: 5 }, { n: 'Tunnel Passage', x0: -8, x1: 8, z0: 40, z1: 46, y0: -1, y1: 4 },
      { n: 'Office Block', x0: -46, x1: -22, z0: -36, z1: -24, y0: -1, y1: 4 }, { n: 'Main Plaza', x0: -41, x1: -4, z0: -30, z1: -4, y0: 1, y1: 4 },
      { n: 'Spawn Red', x0: -50, x1: -30, z0: -4, z1: 24, y0: -1, y1: 2.5 }, { n: 'Spawn Blue', x0: 36, x1: 50, z0: -2, z1: 12, y0: -1, y1: 2.5 },
      { n: 'South Alley', x0: -50, x1: 50, z0: 36, z1: 50, y0: -1, y1: 4 }, { n: 'Lower Plaza', x0: 17, x1: 32, z0: 2, z1: 36, y0: -1, y1: 3 },
      { n: 'Central Courtyard', x0: -34, x1: 17, z0: 4, z1: 36, y0: -1, y1: 3 }
    ],
    build(b) {
      const H1 = 1.8, H2 = 3.6, R = 5.4, ST = 0.45;
      const GR = '#8f98a8', GD = '#6f7889', GL = '#b9c0cb', PL = '#9aa3b1', OR = '#ff8a1f', GN = '#3fd15a', BL = '#3a9bff', YL = '#ffd23f', RD = '#ff3b48', WD = '#d89a52', WT = '#5fd0ff', DK = '#39435a';
      const P = (x0, x1, z0, z1, y0, y1, c, t) => b.box(x0, x1, z0, z1, y0, y1, c, t);          // caja maciza por rangos
      const F = (x0, x1, z0, z1, c) => b.box(x0, x1, z0, z1, 0, 0.03, c, null, false);          // marca pintada en el suelo (sin colisión)
      const crate = (x, z, s = 2, h = 2, y = 0) => P(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y, y + h, WD, 'crate');
      const cont = (x, z, alongX, c) => (alongX ? P(x - 3, x + 3, z - 1.2, z + 1.2, 0, 2.6, c, 'metal') : P(x - 1.2, x + 1.2, z - 3, z + 3, 0, 2.6, c, 'metal'));
      const bar = (x, z, alongX) => (alongX ? P(x - 1.6, x + 1.6, z - 0.25, z + 0.25, 0, 1.1, WD, 'wood') : P(x - 0.25, x + 0.25, z - 1.6, z + 1.6, 0, 1.1, WD, 'wood'));   // barricada baja de madera
      const rail = (x0, x1, z0, z1, y, c = GD) => P(x0, x1, z0, z1, y, y + 0.9, c, 'concrete');   // parapeto bajo

      b.perimeter(58, 8.5, '#8d96a6');   // [MAPA] el muro exterior pasa de 50 a 58 m: todo lo de dentro queda igual

      /* ================= [MAPA] ANILLO EXTERIOR · casetas de madera en las que se puede entrar =================
         6 × 5 m, paredes de 3 m, puerta de 2 m mirando al centro del mapa (alineada con la rejilla de 1 m de la
         navegación, para que los bots también entren y salgan), ventana en un lateral para asomarse, una caja dentro
         para cubrirse y techo encima. */
      const HT = 0.3, HH = 3.0, HD = 2.4, HCOL = '#b07a45', HROOF = '#5a3f2a';
      const hut = (x0, x1, z0, z1, door, win) => {
        const side = (sd, open) => {
          const alongZ = sd === 'xmin' || sd === 'xmax', a0 = alongZ ? z0 : x0, a1 = alongZ ? z1 : x1, c = (a0 + a1) / 2;
          const bx = (b0, b1, y0, y1) => alongZ
            ? P(sd === 'xmin' ? x0 : x1 - HT, sd === 'xmin' ? x0 + HT : x1, b0, b1, y0, y1, HCOL, 'wood')
            : P(b0, b1, sd === 'zmin' ? z0 : z1 - HT, sd === 'zmin' ? z0 + HT : z1, y0, y1, HCOL, 'wood');
          if (!open) { bx(a0, a1, 0, HH); return; }
          const g0 = c - open.w / 2, g1 = c + open.w / 2;
          bx(a0, g0, 0, HH); bx(g1, a1, 0, HH); if (open.y0 > 0) bx(g0, g1, 0, open.y0); bx(g0, g1, open.y1, HH);
        };
        for (const sd of ['xmin', 'xmax', 'zmin', 'zmax']) side(sd, sd === door ? { w: 2, y0: 0, y1: HD } : sd === win ? { w: 1.4, y0: 1.1, y1: 2.0 } : null);
        P(x0 - 0.2, x1 + 0.2, z0 - 0.2, z1 + 0.2, HH, HH + 0.3, HROOF, 'wood');                                   // techo
        const bxX = door === 'xmin' ? x1 - 1.1 : door === 'xmax' ? x0 + 1.1 : (x0 + x1) / 2 + 1.6;               // caja al fondo, lejos de la puerta
        const bxZ = door === 'zmin' ? z1 - 1.1 : door === 'zmax' ? z0 + 1.1 : (z0 + z1) / 2 + 1.6;
        crate(bxX, bxZ, 1.2, 1.1);
      };
      hut(51, 56, -28, -22, 'xmin', 'zmin'); hut(51, 56, 14, 20, 'xmin', 'zmax');         // este
      hut(-56, -51, -28, -22, 'xmax', 'zmin'); hut(-56, -51, 14, 20, 'xmax', 'zmax');     // oeste
      hut(-14, -8, 51, 56, 'zmin', 'xmin'); hut(20, 26, 51, 56, 'zmin', 'xmax');         // sur
      hut(-14, -8, -56, -51, 'zmax', 'xmin'); hut(20, 26, -56, -51, 'zmax', 'xmax');     // norte
      crate(53.5, -4, 2, 1.6); crate(-53.5, 34, 2, 1.6); crate(2, 53.5, 2, 1.6); crate(-30, -53.5, 2, 1.6);   // algo de cobertura por el anillo

      b.horizon(28, 78, 122, 14, 46, 8, 18, ['#8f99ad', '#a4adbf', '#7f8aa0']);   // los edificios de la ciudad al otro lado del muro

      /* ================= SPAWN RED · torre de francotiradores · Main Plaza ================= */
      F(-48, -30, 0, 20, RD); F(-48, -30, 0, 0.5, '#ffffff'); F(-48, -30, 19.5, 20, '#ffffff');
      P(-47, -43, 24, 24.6, 0, 1.2, GD, 'concrete'); P(-33, -29, 22, 22.6, 0, 1.2, GD, 'concrete'); P(-47, -46.4, 4, 9, 0, 1.2, GD, 'concrete');
      b.run('N', 0, -33, 6, 4, 0, ST, GL, 'stone');                                     // Spawn Red → Main Plaza
      P(-41, -6, -30, -4, 0, H1, PL, 'concfloor');                                      // Main Plaza (1,8 m)
      // Sniper Perch
      P(-48, -41, -22, -8, 0, R - 0.5, GR, 'concrete'); P(-48, -41, -22, -8, R - 0.5, R, OR, 'concrete');
      P(-48, -41, -22, -21.6, R, R + 1.2, GD, 'concrete'); P(-48, -41, -8.4, -8, R, R + 1.2, GD, 'concrete'); P(-48, -47.6, -21.6, -8.4, R, R + 1.2, GD, 'concrete');
      P(-41.4, -41, -21.6, -18, R, R + 1.2, GD, 'concrete'); P(-41.4, -41, -14, -8.4, R, R + 1.2, GD, 'concrete');
      [[-48, -22], [-42.5, -22], [-48, -14.5], [-42.5, -14.5]].forEach(([x, z]) => P(x, x + 0.5, z, z + 0.5, R, R + 3, OR, 'metal'));
      P(-48, -41.5, -22, -14, R + 3, R + 3.4, OR, 'concrete'); P(-47.9, -42, -21.9, -21.7, R + 1.2, R + 3, BL, 'glass');
      b.run('W', -33, -16, 4, 8, H1, ST, GL, 'stone', H1);                              // Main Plaza → Sniper Perch
      // props de la plaza
      P(-40, -37, -29, -25, H1, H1 + 0.7, GD, 'stone'); P(-39.7, -37.3, -28.7, -25.3, H1 + 0.7, H1 + 1.4, GN, 'stone');
      P(-30, -25, -20, -19.4, H1, H1 + 1.2, GD, 'concrete'); P(-16, -11, -24, -23.4, H1, H1 + 1.2, GD, 'concrete'); P(-28, -27.4, -12, -7, H1, H1 + 1.2, GD, 'concrete');
      crate(-21, -9, 2, 2, H1); crate(-18.8, -9.2, 1.8, 1.8, H1); crate(-20, -9, 1.6, 1.6, H1 + 2); P(-12, -10.4, -28, -26, H1, H1 + 2.2, BL, 'metal'); P(-8.4, -6.8, -12, -9, H1, H1 + 1.4, GD, 'metal');
      /* ================= OFFICE BLOCK (East Roof · Helipad A) ================= */
      P(-46, -38, -48, -30, 0, R, GR, 'concrete'); P(-30, -22, -48, -30, 0, R, GR, 'concrete'); P(-38, -30, -48, -38, 0, R, GR, 'concrete');
      P(-38, -36, -38, -30, 0, R, GR, 'concrete'); P(-32, -30, -38, -30, 0, R, GR, 'concrete');
      b.run('N', -30, -34, 4, 8, H1, ST, GL, 'stone');                                  // Main Plaza → tejado de las oficinas
      P(-45, -39, -30, -29.8, 2.6, 4.8, BL, 'glass'); P(-30, -23, -30, -29.8, 2.6, 4.8, BL, 'glass'); P(-46, -36, -30, -29.7, 4.9, R, OR, 'concrete'); P(-32, -22, -30, -29.7, 4.9, R, OR, 'concrete');
      P(-44, -35, -47.5, -38.5, R, R + 0.06, '#ffffff', 'helipad');                     // Helipad A (9 × 9 m)
      rail(-46, -22, -48, -47.6, R); rail(-46, -45.6, -47.6, -30, R); rail(-22.4, -22, -47.6, -44, R); rail(-22.4, -22, -40, -30, R); rail(-46, -36, -30.4, -30, R); rail(-32, -22, -30.4, -30, R);
      P(-30, -27, -46, -43, R, R + 1.3, GD, 'metal'); P(-27, -24, -37, -34, R, R + 1.3, GD, 'metal');
      b.run('S', -34, -17, 6, 4, 0, ST, GL, 'stone');                                   // Main Plaza → pasaje norte
      /* ================= REACTOR COMPLEX (cubierta central a 3,6 m) ================= */
      P(-2, 18, -24, 2, 0, H2, PL, 'concfloor');
      b.run('E', -6, -14, 8, 4, H1, ST, GL, 'stone');                                   // Main Plaza → Reactor
      b.run('N', 10, 8, 4, 8, 0, ST, GL, 'stone');                                       // Reactor → Central Courtyard
      P(2, 10, -16, -8, H2, 9, GD, 'metal');                                            // núcleo del reactor
      [[-1, -19, 13, -16], [-1, -8, 13, -5], [-1, -16, 2, -8], [10, -16, 13, -8]].forEach(([x0, z0, x1, z1]) => P(x0, x1, z0 < z1 ? z0 : z1, z0 < z1 ? z1 : z0, 6, 6.3, YL, 'metal'));
      [[-1, -19], [12.4, -19], [-1, -5.6], [12.4, -5.6]].forEach(([x, z]) => P(x, x + 0.6, z, z + 0.6, H2, 9.2, YL, 'metal'));
      P(-1, 13, -19, -18.7, 6.3, 7.2, YL, 'metal'); P(-1, -0.7, -18.7, -5, 6.3, 7.2, YL, 'metal'); P(12.7, 13, -18.7, -5, 6.3, 7.2, YL, 'metal'); P(-1, 3, -5.3, -5, 6.3, 7.2, YL, 'metal'); P(7, 13, -5.3, -5, 6.3, 7.2, YL, 'metal');
      b.run('N', 1, 5, 4, 6, H2, ST, YL, 'metal', H2);                                  // cubierta → pasarela del reactor
      crate(14, -20, 2, 2, H2); crate(15.5, -18.5, 1.6, 1.6, H2); P(14, 16, 0, 0.6, H2, H2 + 1.1, GD, 'concrete'); P(-1.6, -1, -6, 0, H2, H2 + 1, GD, 'concrete');
      // pasarela norte hacia el Helipad B
      P(2, 8, -34, -24, 3.2, H2, GD, 'concfloor'); rail(2, 2.4, -34, -24, H2); rail(7.6, 8, -34, -24, H2);
      b.run('N', -34, 5, 6, 4, H2, ST, GL, 'stone');                                    // pasarela → tejado del Helipad B
      /* ================= HELIPAD B · WEST TOWER ROOF · red de tejados ================= */
      P(-12, 10, -48, -38, 0, R, GR, 'concrete'); P(-12, 2, -38, -34, 0, R, GR, 'concrete'); P(8, 10, -38, -34, 0, R, GR, 'concrete');
      P(-9, 0, -47.5, -38.5, R, R + 0.06, '#ffffff', 'helipad');                         // Helipad B (9 × 9 m)
      rail(-12, 10, -48, -47.6, R); rail(-12, -11.6, -47.6, -44, R); rail(-12, -11.6, -40, -34, R); rail(9.6, 10, -47.6, -44, R); rail(9.6, 10, -40, -34, R); rail(-12, 2, -34.4, -34, R); rail(8, 10, -34.4, -34, R);
      P(4, 7, -46, -43, R, R + 1.3, GD, 'metal'); P(-12, 2, -34.6, -34, R - 0.5, R, OR, 'concrete'); P(8, 10, -34.6, -34, R - 0.5, R, OR, 'concrete');   // (la franja no cruza el hueco de la escalera: x 2–8)
      P(16, 26, -48, -34, 0, R, GR, 'concrete'); P(16, 26, -34.6, -34, R - 0.5, R, OR, 'concrete'); P(19, 24, -46, -41, R, R + 2.4, GR, 'concrete'); P(19.2, 23.8, -41, -40.8, R + 0.6, R + 2, BL, 'glass');
      rail(16, 26, -48, -47.6, R); rail(16, 16.4, -47.6, -44, R); rail(16, 16.4, -40, -34, R); rail(25.6, 26, -47.6, -44, R); rail(25.6, 26, -40, -34, R); rail(16, 26, -34.4, -34, R);
      P(-22, -12, -44, -40, R - 0.4, R, GD, 'concfloor'); P(10, 16, -44, -40, R - 0.4, R, GD, 'concfloor'); P(26, 32, -44, -40, R - 0.4, R, GD, 'concfloor');   // pasarelas entre tejados
      [[-22, -12], [10, 16], [26, 32]].forEach(([x0, x1]) => { rail(x0, x1, -44, -43.6, R); rail(x0, x1, -40.4, -40, R); });
      /* ================= TECH HUB (NE) ================= */
      P(32, 48, -48, -34, 0, R, GR, 'concrete'); P(32, 38, -34, -30, 0, R, GR, 'concrete'); P(44, 48, -34, -30, 0, R, GR, 'concrete');
      P(32, 38, -34.6, -34, R - 0.5, R, GN, 'concrete'); P(44, 48, -34.6, -34, R - 0.5, R, GN, 'concrete'); P(31.8, 32, -46, -36, 2.4, 5, BL, 'glass'); P(32, 48, -48, -47.5, R - 0.7, R, GN, 'concrete');
      [[45, -47], [46.6, -47]].forEach(([x, z]) => P(x, x + 0.4, z, z + 0.4, R, R + 6, DK, 'metal')); P(35, 38.5, -46, -43, R, R + 1.4, GD, 'metal'); P(41, 44, -45, -42, R, R + 1.4, GD, 'metal');
      rail(32, 48, -48, -47.6, R); rail(47.6, 48, -47.6, -34, R); rail(32, 32.4, -47.6, -44, R); rail(32, 32.4, -40, -34, R); rail(32, 48, -34.4, -34, R);
      b.run('N', -30, 41, 6, 4, H2, ST, GL, 'stone');                                   // azotea del Capture Point → Tech Hub
      /* ================= CAPTURE POINT (azotea de la torre este) ================= */
      P(30, 48, -30, -2, 0, H2, GD, 'concrete');
      P(33, 45, -2, -1.8, 0.8, 3.2, BL, 'glass'); P(30, 48, -2, -1.7, 3.3, H2, GN, 'concrete');
      P(35, 45, -20, -10, H2, H2 + 0.45, GR, 'concfloor'); P(39.8, 40.2, -15.2, -14.8, H2 + 0.45, H2 + 6, DK, 'metal'); b.box(40.2, 42.6, -15.1, -14.9, H2 + 4.5, H2 + 5.9, RD, null, false);
      rail(47.6, 48, -30, -2, H2); rail(30, 47.6, -2.4, -2, H2, GD); rail(30, 30.4, -30, -14, H2); rail(30, 30.4, -8, -2, H2);
      P(18, 30, -14, -8, 3.2, H2, GD, 'concfloor'); P(23.3, 24.7, -13.7, -12.3, 0, 3.2, GD, 'concrete'); P(23.3, 24.7, -9.7, -8.3, 0, 3.2, GD, 'concrete');   // «autopista» elevada
      rail(18, 30, -14, -13.6, H2); rail(18, 30, -8.4, -8, H2);
      b.run('N', 6, 34, 4, 8, 0, ST, GL, 'stone');                                       // Lower Plaza → azotea del Capture Point
      P(37, 41, -26, -23, H2, H2 + 1.2, GD, 'metal');
      /* ================= ARMORY (SE) ================= */
      P(32, 47, 12, 19, 0, H2, GD, 'concrete');                                         // franja norte (maciza)
      P(32, 33, 19, 21, 0, 3.2, GD, 'concrete'); P(32, 33, 25, 36, 0, 3.2, GD, 'concrete');   // muro oeste con puerta (z 21–25)
      P(46, 47, 19, 36, 0, 3.2, GD, 'concrete'); P(33, 38, 35, 36, 0, 3.2, GD, 'concrete'); P(42, 46, 35, 36, 0, 3.2, GD, 'concrete');   // muro este y sur con puerta (x 38–42)
      P(32, 47, 19, 36, 3.2, H2, GR, 'concfloor');                                      // techo
      P(32, 47, 12, 12.4, H2, H2 + 0.9, OR, 'concrete'); P(32, 47, 35.6, 36, H2, H2 + 0.9, OR, 'concrete'); rail(46.6, 47, 12.4, 35.6, H2, OR); rail(32, 32.4, 12.4, 30, H2, OR);
      P(35, 44, 25, 25.8, 0, 1.3, DK, 'metal'); P(35, 44, 31, 31.8, 0, 1.3, DK, 'metal'); crate(36, 28, 1.8, 1.8); crate(44, 28, 2, 2); crate(41, 33, 1.6, 1.6); P(38, 42, 20, 20.6, 0, 1, GD, 'concrete');
      b.run('E', 24, 32, 4, 8, 0, ST, GL, 'stone');                                      // Lower Plaza → azotea de la Armory
      P(24, 25, 34.6, 36, 0, 1.4, GD, 'metal');
      /* ================= PATIO CENTRAL · LOWER PLAZA · calles ================= */
      P(-6.5, -1.5, 19.5, 24.5, 0, 0.8, GL, 'stone'); P(-5.7, -2.3, 20.3, 23.7, 0.8, 1.0, WT, 'glass'); P(-4.4, -3.6, 21.6, 22.4, 1.0, 2.6, GL, 'stone');   // fuente
      crate(-13, 26, 2, 2); crate(-11, 26.4, 2, 2); crate(-12, 26.2, 1.8, 1.8, 2); crate(-13, 16, 2, 2); crate(9, 22, 2, 2); crate(11, 22.6, 2, 2); crate(10, 22.3, 1.6, 1.6, 2); crate(2, 30, 2, 2); crate(-20, 20, 2, 2); crate(-18, 20.4, 1.8, 1.8);
      [[-16, 14, 1], [-8, 12.5, 1], [4, 14, 1], [-16, 30, 1], [0, 26, 1], [-8, 32, 1], [12, 30, 0], [-24, 12, 0], [14, 14, 0]].forEach(([x, z, a]) => bar(x, z, !!a));
      cont(-30, 16, false, BL); cont(-30, 28, false, OR); cont(-24.6, 4.6, true, GN);                                                    // Patio oeste
      cont(22, 10, true, OR); cont(28, 14, false, BL); cont(21, 26, false, GN); cont(28, 30, true, RD); crate(24, 18, 2, 2); crate(26, 19.4, 2, 2); crate(25, 18.7, 1.6, 1.6, 2); bar(20, 22, false); bar(29, 22, true);
      P(-8, 8, 34, 40, 0, R, GR, 'concrete'); P(-8, 8, 46, 50, 0, R, GR, 'concrete'); P(-8, 8, 40, 46, 3.6, R, GR, 'concrete');       // Tunnel Passage (pasaje cubierto)
      P(-8, 8, 33.4, 34, R - 0.5, R, OR, 'concrete'); F(-50, -8, 43.8, 44.2, YL); F(8, 50, 43.8, 44.2, YL); F(-8, 8, 43.8, 44.2, YL);
      crate(-30, 44, 2, 2); crate(-28, 45.4, 1.8, 1.8); cont(-40, 41, true, GN); crate(-20, 47, 2, 2); crate(20, 42, 2, 2); cont(34, 42, true, BL); crate(28, 47, 2, 2); crate(26, 45.8, 1.6, 1.6);
      // Spawn Blue
      F(38, 48, 2, 12, '#2f7bff'); P(46, 46.6, 3, 8, 0, 1.2, GD, 'concrete'); P(38, 42, 13, 13.6, 0, 1.2, GD, 'concrete');
      // pasaje norte y patio norte
      crate(-19, -42, 2, 2); crate(-15.6, -45, 2, 2); cont(-17, -36, true, BL); cont(13, -45, false, OR); crate(13, -38, 2, 2); crate(20, -30, 2, 2); crate(6, -30, 2, 2); bar(-4, -28, true); bar(24, -26, true);
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
      if (di && dj && (!nav.layers[(i + di) * n + j].length || !nav.layers[i * n + (j + dj)].length)) continue;   // sin cortar esquinas
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
function navDir(nav, field, x, z, y) {
  if (!field) return null;
  const n = nav.n, ci = Math.max(0, Math.min(n - 1, Math.floor(x + nav.half))), cj = Math.max(0, Math.min(n - 1, Math.floor(z + nav.half)));
  const ck = navLayer(nav, ci, cj, y); if (ck < 0) return null;
  const cell = field.dist[ci * n + cj]; if (!cell || cell[ck] === undefined || cell[ck] < 0 || cell[ck] === 0) return null;
  const pcell = field.parent[ci * n + cj], p = pcell && pcell[ck]; if (!p) return null;
  const px = -nav.half + p[0] + 0.5, pz = -nav.half + p[1] + 0.5, dx = px - x, dz = pz - z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
}

/* Construye el mundo de un mapa: colisiones y puntos de paso/aparición. */
function buildWorld(i, onBox) {
  const m = MAPS[i], colliders = [], b = makeBuilder(onBox, colliders);
  m.build(b);
  const waypoints = [];
  for (let x = -(m.half - 4); x <= m.half - 4; x += 4) for (let z = -(m.half - 4); z <= m.half - 4; z += 4) if (!overlapAt(colliders, x, 0, z, 0.6, 1.8)) waypoints.push([x, z]);
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
  { id: 'vortice_toxico', w: 'vortice', n: 'Tóxico', r: 'epico', body: '#1c2b1a', acc: '#8dff5a', dark: '#0a120a', rough: 0.45, metal: 0.1, glow: '#8dff5a', pattern: 'camuflaje' }
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
/* [NUEVO] Mascotas: te siguen en la partida y los demás jugadores las ven. Solo se consiguen comprándolas con PX en la
   tienda (el servidor cobra y comprueba que la tienes antes de dejarte equiparla). kind = forma del modelo en client.js. */
const PETS = [
  { id: 'pet_cubi', n: 'Cubi', r: 'comun', px: 600, kind: 'cube', body: '#ffd23a', acc: '#ffffff', eye: '#1b2038' },
  { id: 'pet_rayito', n: 'Rayito', r: 'poco', px: 900, kind: 'cube', body: '#5ad1ff', acc: '#e9fbff', eye: '#0b1c33' },
  { id: 'pet_dron', n: 'Dron Z-3', r: 'raro', px: 1500, kind: 'drone', body: '#39414f', acc: '#ff5a1f', eye: '#8dff5a' },
  { id: 'pet_fantasmin', n: 'Fantasmín', r: 'epico', px: 2500, kind: 'ghost', body: '#e9edf5', acc: '#7dffea', eye: '#1b2038' },
  { id: 'pet_zorro', n: 'Zorro Píxel', r: 'epico', px: 2800, kind: 'fox', body: '#ff8a1f', acc: '#ffffff', eye: '#1b2038' },
  { id: 'pet_dragon', n: 'Dragoncito', r: 'leyenda', px: 5000, kind: 'dragon', body: '#c4161f', acc: '#ffd23a', eye: '#fff4b8' }
];
const bpFind = r => (r.t === 'wskin' ? WEAPON_SKINS : r.t === 'kskin' ? KNIFE_SKINS : r.t === 'banner' ? BANNERS : r.t === 'pet' ? PETS : r.t === 'avatar' ? (typeof AVATARS !== 'undefined' ? AVATARS : []) : []).find(x => x.id === r.id) || null;
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
const SHOP = ['asalto', 'centinela', 'lince', 'trueno', 'rafaga', 'vortice', 'precision', 'sheriff', 'torrente', 'duo', 'ak'].map((id, i) => ({
  wi: WEAPONS.findIndex(w => w.id === id), price: [1200, 1450, 2100, 950, 1100, 1300, 400, 650, 1350, 350, 1250][i]
  // [PR2] torrente 1350 (cargador de 100, ametralladora): justo por encima de Vórtice (1300) y por debajo de Centinela (1450)
  // [PR2] duo 350 (pistolas dobles, alcance corto): la más barata, un peldaño por debajo de Precisión (400)
  // [PR2] ak 1250 (más daño que Asalto): justo por encima de Asalto (1200) y por debajo de Vórtice (1300)
}));
/* Estadísticas de la tarjeta de la tienda (DMG · RPM · RNG · ACC), derivadas de los números reales del arma. */
function shopStats(w) {
  const rpm = Math.round(60 / w.interval), acc = Math.max(40, Math.min(97, Math.round(100 - (w.scopedSpread != null ? w.scopedSpread : w.spread) * 1000)));
  const rng = Math.max(1, Math.min(99, Math.round(w.range / 2)));
  return { dmg: w.dmg, rpm, acc, rng };
}

const MODES = {
  duelo:     { id: 'duelo',     name: 'Duelo por equipos', short: 'DUELO',    desc: 'El clásico: gana el equipo que llegue antes al límite de bajas.', guns: true },
  zona:      { id: 'zona',      name: 'Capturar zona',     short: 'ZONA',     desc: 'Una zona cambia de sitio cada 50 s. Suma puntos el equipo que la controla en solitario.', guns: true },
  cuchillos: { id: 'cuchillos', name: 'Solo cuchillos',    short: 'CUCHILLOS', desc: 'Sin armas de fuego: cuchillo en mano y a moverse rápido.', guns: false },
  carrera:   { id: 'carrera',   name: 'Carrera de armas',  short: 'CARRERA',  desc: 'Cada baja te da un arma nueva. Al llegar al cuchillo, una baja más y tu equipo gana. Si te matan a cuchillo, bajas de nivel.', guns: true }
};
const GUN_LADDER = [8, 0, 9, 1, 7, 2, 10, 4, 6, 5, 3];   // armas por nivel (AK → … → Lince); tras la última viene el cuchillo (nivel 12)
const ZONE = { R: 5.5, MOVE_SECS: 50, LIMIT: 160 };  // radio de la zona, cada cuánto cambia de sitio y puntos para ganar
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
  HOP_MAX: 1.25, HOP_STEP: 0.05, HOP_DECAY: 0.8             // bunny hop normal
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

const api = { PETS, areaAt, buildNav, navField, navDir, SHOP, shopStats, MOVE, startSlide, moveStep, VIEWMODEL, createViewmodel, viewmodelSight, COLOR_NAMES, COLOR_HEX, colorRarity, CONST, WEAPONS, crFor, MARKET, MODES, GUN_LADDER, ZONE, LEAGUES, leagueIdx, RANKED, OPTICS, MAPS, RARITY, WEAPON_SKINS, KNIFE_SKINS, BANNERS, BP_LEVELS, BP_TIERS, BP_PRICES, bpXpToNext, bpTotalXp, bpLevelOf, bpXpFor, bpFind, bpInfo, COLOR_COSTS, RANKS, EVENTS, todayEvent, eventMult, pxFor, buildWorld, overlapAt, moveEntity, rayBox, rayWorld, insetColliders, wallViolation, raySphere, rayCyl };
root.VoltShared = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
