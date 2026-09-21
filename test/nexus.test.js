'use strict';
/* Nexus Outpost, el único mapa: contenido y zonas nombradas, geometría, apariciones y zonas, alcanzabilidad caminando (sin saltar) y sin trampas,
   servidor real por WebSocket (apariciones por equipo, zonas con altura, limpieza de la clasificación) y cliente (texturas, lotes, configuración antigua). */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
const PORT = 3341, D = '/tmp/ppr_nexus', B = 'http://127.0.0.1:' + PORT;
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }

/* ---------- 1. Un único mapa, con todo lo pedido ---------- */
console.log('=== 1. Un único mapa: Nexus Outpost ===');
const m = S.MAPS[0], world = S.buildWorld(0), cols = world.colliders, boxes = [];
S.buildWorld(0, (cx, y0, cz, w, h, d, color, solid, tag) => boxes.push({ cx, y0, cz, w, h, d, color, solid, tag }));
ok(S.MAPS.length === 1 && m.name === 'Nexus Outpost' && m.half === 50, 'solo hay un mapa: «' + m.name + '» de ' + m.half * 2 + ' × ' + m.half * 2 + ' m');
ok(!JSON.stringify(S.MAPS.map(x => x.name)).match(/Almenas|Dunas|Contenedores|Bosque|Fábrica|Cañón/), 'ningún mapa antiguo (Almenas, Dunas, Contenedores, Bosque, Fábrica, Cañón) sigue en la lista');
const need = ['Spawn Red', 'Spawn Blue', 'South Alley', 'Tunnel Passage', 'Main Plaza', 'Sniper Perch', 'Office Block', 'Central Courtyard', 'Lower Plaza', 'Reactor Complex', 'East Roof', 'Rooftop Network', 'West Tower Roof', 'Helipad A', 'Helipad B', 'Tech Hub', 'Armory', 'Capture Point'];
/* un punto DENTRO de cada zona (x, altura de los pies, z) */
const probe = { 'Spawn Red': [-40, 0, 8], 'Spawn Blue': [43, 0, 6], 'South Alley': [-30, 0, 42], 'Tunnel Passage': [0, 0, 43], 'Main Plaza': [-24, 1.8, -14], 'Sniper Perch': [-44, 5.4, -17], 'Office Block': [-40, 1.8, -27], 'Central Courtyard': [-6, 0, 28],
  'Lower Plaza': [25, 0, 24], 'Reactor Complex': [10, 3.6, -1], 'East Roof': [-30, 5.4, -42], 'Rooftop Network': [-17, 5.4, -42], 'West Tower Roof': [21, 5.4, -38], 'Helipad A': [-39, 5.46, -43], 'Helipad B': [-4, 5.46, -43], 'Tech Hub': [40, 5.4, -40],
  'Armory': [40, 0, 28], 'Capture Point': [40, 4.05, -13] };
const names = new Set(m.areas.map(a => a.n)), wrong = need.filter(n => S.areaAt(0, ...probe[n]) !== n);
ok(need.every(n => names.has(n)) && need.length === 18, 'están las 18 zonas del encargo, con su nombre exacto');
ok(wrong.length === 0, 'y S.areaAt() reconoce cada una desde un punto dentro de ella' + (wrong.length ? ' (fallan: ' + wrong.join(', ') + ')' : ''));
ok(S.areaAt(0, 0, 0, 0) === '' && S.areaAt(0, 999, 0, 999) === '' && S.areaAt(5, 0, 0, 0) === '', 'fuera de toda zona devuelve texto vacío, sin fallar (' + JSON.stringify(S.areaAt(0, 0, 0, 0)) + ')');
ok(S.areaAt(0, -39, 5.46, -43) === 'Helipad A' && S.areaAt(0, -39, 0, -43) !== 'Helipad A' && S.areaAt(0, -39, 0, -43) !== 'East Roof', 'la altura importa: en el mismo punto del plano, a 5,46 m es «' + S.areaAt(0, -39, 5.46, -43) + '» y a ras de suelo no lo es («' + S.areaAt(0, -39, 0, -43) + '»)');

/* ---------- 2. Geometría ---------- */
console.log('\n=== 2. Geometría ===');
const finite = boxes.every(b => [b.cx, b.y0, b.cz, b.w, b.h, b.d].every(Number.isFinite) && b.w > 0 && b.h > 0 && b.d > 0);
ok(finite && cols.length >= 200 && cols.length <= 400, cols.length + ' cajas macizas, todas con medidas válidas (ninguna vacía ni NaN)');
const inside = cols.filter(c => c.minX >= -52.01 && c.maxX <= 52.01 && c.minZ >= -52.01 && c.maxZ <= 52.01 && c.maxY <= 12).length;
ok(inside === cols.length, 'todo cabe dentro del recinto (100 × 100 m más 2 m de muro por lado) y por debajo de 12 m');
const top = (x, z) => { let t = 0; for (const c of cols) if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.maxY > t && c.maxY < 8) t = c.maxY; return t; };
const near = (a, b) => Math.abs(a - b) < 0.02;
ok(near(top(-24, -14), 1.8) && near(top(10, -1), 3.6) && near(top(-30, -42), 5.4) && near(top(21, -38), 5.4) && near(top(34, -25), 3.6) && near(top(40, 24), 3.6) && top(-6, 28) === 0,
  'los cuatro niveles: patio 0 m · Main Plaza 1,8 m · reactor y azoteas de la torre este y la armería 3,6 m · tejados 5,4 m');
ok(near(top(-44, -17), 5.4) && near(top(-39, -43), 5.46) && near(top(-4, -43), 5.46), 'la torre de francotiradores está a 5,4 m y los dos helipuertos sobre el tejado (5,46 m)');
const tags = new Set(boxes.filter(b => b.tag).map(b => b.tag)), helis = boxes.filter(b => b.tag === 'helipad');
ok(['glass', 'helipad', 'crate', 'metal', 'concrete', 'concfloor', 'stone', 'wood'].every(t => tags.has(t)), 'usa texturas por etiqueta: ' + [...tags].sort().join(', '));
ok(helis.length === 2 && helis.every(h => h.w === 9 && h.d === 9 && h.h < 0.1), 'dos helipuertos de 9 × 9 m (Helipad A y B)');
const crates = boxes.filter(b => b.tag === 'crate').length, conts = boxes.filter(b => b.tag === 'metal' && b.solid && Math.max(b.w, b.d) === 6 && b.h === 2.6).length;
ok(crates >= 20 && conts >= 6, 'coberturas de cajas (' + crates + ') y contenedores (' + conts + ') en los patios y callejones');
const glass = boxes.filter(b => b.tag === 'glass').length; ok(glass >= 6, 'fachadas de cristal en las oficinas, la torre este, el Tech Hub y la cabina del francotirador (' + glass + ')');
ok(world.waypoints.length >= 200 && world.waypoints.every(([x, z]) => !S.overlapAt(cols, x, 0, z, 0.6, 1.8)), world.waypoints.length + ' puntos de paso para los bots, todos libres');

/* ---------- 3. Apariciones y zonas del modo captura ---------- */
console.log('\n=== 3. Apariciones y zonas ===');
const sp = world.spawns, free = (x, y, z) => !S.overlapAt(cols, x, y, z, 0.6, 1.8);
ok(sp[1].length >= 6 && sp[0].length >= 6 && sp[1].every(([x, z]) => free(x, 0, z)) && sp[0].every(([x, z]) => free(x, 0, z)), 'cada equipo tiene ' + sp[1].length + ' puntos de aparición libres');
ok(sp[1].every(([x, z]) => S.areaAt(0, x, 0, z) === 'Spawn Red') && sp[0].every(([x, z]) => S.areaAt(0, x, 0, z) === 'Spawn Blue'), 'el equipo rojo aparece en Spawn Red y el azul en Spawn Blue');
const cen = l => [l.reduce((a, p) => a + p[0], 0) / l.length, l.reduce((a, p) => a + p[1], 0) / l.length]; const [rx, rz] = cen(sp[1]), [bx, bz] = cen(sp[0]);
ok(Math.hypot(rx - bx, rz - bz) > 70, 'las dos bases están lejos: ' + Math.hypot(rx - bx, rz - bz).toFixed(0) + ' m en línea recta');
const zs = m.zones;
ok(zs.length === 5 && zs.map(z => z.n).join() === 'Central Courtyard,Main Plaza,Lower Plaza,Reactor Complex,Capture Point', 'cinco zonas de captura: ' + zs.map(z => z.n).join(', '));
ok(zs.every(z => free(z.x, top(z.x, z.z), z.z) && Math.abs(top(z.x, z.z) - z.y) <= 0.5), 'cada zona está sobre un suelo libre y a su altura (el Capture Point, en la azotea; el podio queda 0,45 m más arriba)');
ok(zs.every(z => S.areaAt(0, z.x, z.y + (z.n === 'Capture Point' ? 0.45 : 0), z.z) === z.n), 'y cada zona cae dentro del área que lleva su nombre');
ok(zs.some(z => z.y === 0) && zs.some(z => z.y > 0), 'hay zonas a ras de suelo (para las salas con bots) y elevadas');

/* ---------- 4. Alcanzabilidad caminando (sin saltar) y sin trampas ---------- */
console.log('\n=== 4. Alcanzabilidad caminando (peldaño máximo 0,55 m, sin saltar) ===');
const STEP = 0.55, RES = 0.5, HALF = 50, N = 200, cell = v => Math.floor((v + HALF) / RES), ctr = i => -HALF + (i + 0.5) * RES;
const surf = new Array(N * N);
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const x = ctr(i), z = ctr(j), hs = new Set([0]); for (const c of cols) if (x + 0.35 > c.minX && x - 0.35 < c.maxX && z + 0.35 > c.minZ && z - 0.35 < c.maxZ) hs.add(c.maxY);
  surf[i * N + j] = [...hs].filter(h => h < 8 && !S.overlapAt(cols, x, h, z, 0.35, 1.8)).sort((a, b) => b - a);
}
const id = (i, j, k) => (i * N + j) * 8 + k, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function neighbours(i, j, k) {
  const out = [], h = surf[i * N + j][k];
  for (const [di, dj] of DIRS) {
    const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue; const x2 = ctr(ni), z2 = ctr(nj), hn = surf[ni * N + nj];
    if (di && dj && (!surf[(i + di) * N + j].length || !surf[i * N + j + dj].length)) continue;
    for (let kk = 0; kk < hn.length; kk++) { if (hn[kk] > h + STEP) continue; if (S.overlapAt(cols, x2, Math.max(h, hn[kk]), z2, 0.35, 1.8)) continue; out.push([ni, nj, kk, di && dj ? 1.414 : 1]); break; }
  }
  return out;
}
function bfs(sx, sz) {
  const i0 = cell(sx), j0 = cell(sz), k0 = surf[i0 * N + j0].indexOf(0), dist = new Map([[id(i0, j0, k0), 0]]), q = [[i0, j0, k0]];
  for (let qi = 0; qi < q.length; qi++) { const [i, j, k] = q[qi], d = dist.get(id(i, j, k)); for (const [ni, nj, kk, c] of neighbours(i, j, k)) { const n = id(ni, nj, kk); if (!dist.has(n)) { dist.set(n, d + c * RES); q.push([ni, nj, kk]); } } }
  return { dist, q, start: id(i0, j0, k0) };
}
const reach = (r, x, y, z) => { const i = cell(x), j = cell(z); let best = null; surf[i * N + j].forEach((h, k) => { if (Math.abs(h - y) < 0.06) { const d = r.dist.get(id(i, j, k)); if (d !== undefined) best = d; } }); return best; };
const R = bfs(-40, 8), Bl = bfs(43, 6);
const targets = { 'Main Plaza': [-24, 1.8, -14], 'Sniper Perch': [-44, 5.4, -17], 'East Roof': [-30, 5.4, -42], 'Helipad A': [-39, 5.46, -43], 'Rooftop Network (oeste)': [-17, 5.4, -42], 'Helipad B': [-4, 5.46, -43], 'Rooftop Network (este)': [13, 5.4, -42],
  'West Tower Roof': [21, 5.4, -38], 'Tech Hub': [40, 5.4, -40], 'Reactor Complex (cubierta)': [10, 3.6, -1], 'Reactor Complex (pasarela)': [6, 6.3, -17.5], 'Pasarela norte': [5, 3.6, -28], 'Capture Point (podio)': [40, 4.05, -13], 'Capture Point (azotea)': [33, 3.6, -24],
  'Armory (azotea)': [40, 3.6, 24], 'Armory (interior)': [38, 0, 28], 'Lower Plaza': [25, 0, 24], 'Central Courtyard': [-6, 0, 28], 'Tunnel Passage': [0, 0, 43], 'South Alley (oeste)': [-30, 0, 42], 'South Alley (este)': [30, 0, 42], 'Spawn Red': [-40, 0, 8], 'Spawn Blue': [43, 0, 6] };
const lost = { R: [], B: [] }; for (const [n, [x, y, z]] of Object.entries(targets)) { if (reach(R, x, y, z) === null) lost.R.push(n); if (reach(Bl, x, y, z) === null) lost.B.push(n); }
ok(lost.R.length === 0, 'desde Spawn Red se llega caminando a los ' + Object.keys(targets).length + ' destinos' + (lost.R.length ? ' (NO: ' + lost.R.join(', ') + ')' : ''));
ok(lost.B.length === 0, 'desde Spawn Blue también' + (lost.B.length ? ' (NO: ' + lost.B.join(', ') + ')' : ''));
const dR = reach(R, -30, 5.4, -42), dB = reach(Bl, -30, 5.4, -42); ok(dR > 30 && dR < 140 && dB > 30 && dB < 160, 'los tejados cuestan caminar: East Roof a ' + dR.toFixed(0) + ' m desde Red y ' + dB.toFixed(0) + ' m desde Blue');
const cap = [reach(R, 40, 4.05, -13), reach(Bl, 40, 4.05, -13)]; ok(cap[0] > 40 && cap[1] > 40, 'el Capture Point exige un recorrido de ' + cap.map(v => v.toFixed(0)).join(' y ') + ' m desde cada base (Red y Blue)');
/* trampas: alcanzable desde Red pero sin camino de vuelta */
const rev = new Map(); for (const [i, j, k] of R.q) for (const [ni, nj, kk] of neighbours(i, j, k)) { const n = id(ni, nj, kk); if (!rev.has(n)) rev.set(n, []); rev.get(n).push(id(i, j, k)); }
const back = new Set([R.start]), bq = [R.start]; for (let qi = 0; qi < bq.length; qi++) for (const p of rev.get(bq[qi]) || []) if (!back.has(p)) { back.add(p); bq.push(p); }
const traps = R.q.filter(([i, j, k]) => !back.has(id(i, j, k)));
ok(traps.length === 0, R.q.length + ' superficies alcanzables y de todas se puede VOLVER a la base: ' + traps.length + ' trampas' + (traps.length ? ' (p. ej. x ' + ctr(traps[0][0]) + ', z ' + ctr(traps[0][1]) + ')' : ''));
let stuckOk = 0; for (const [n, [x, y, z]] of Object.entries(targets)) if (reach(Bl, x, y, z) !== null && reach(R, x, y, z) !== null) stuckOk++; ok(stuckOk === Object.keys(targets).length, 'ambos equipos alcanzan exactamente los mismos destinos');

/* ---------- 4b. Navegación de los bots ---------- */
console.log('\n=== 4b. Navegación de los bots (rejilla de 1 m + campo de distancias) ===');
{
  const nav = world.nav, C = S.CONST, cells = nav.free.reduce((a, b) => a + b, 0);
  ok(nav && nav.n === 100 && cells > 4000 && cells < 8000, 'el mundo trae su rejilla de navegación: ' + cells + ' de ' + nav.n * nav.n + ' celdas libres para un cuerpo');
  const f = S.navField(nav, 43, 6); ok(S.navField(nav, 43.3, 6.2) === f, 'el campo hacia un destino se calcula una sola vez y queda en caché');
  const reachable = [...f].filter(v => v >= 0).length; ok(reachable === cells, 'desde cualquier celda libre se puede llegar a Spawn Blue caminando por el suelo (' + reachable + ' de ' + cells + ')');
  const cellAt = (i, j) => (i < 0 || j < 0 || i >= nav.n || j >= nav.n ? -1 : f[i * nav.n + j]);   // un punto de paso cae en el borde de 4 celdas: basta con que una sea alcanzable
  const wpOk = world.waypoints.filter(([x, z]) => [0, -1].some(di => [0, -1].some(dj => cellAt(Math.floor(x + nav.half) + di, Math.floor(z + nav.half) + dj) >= 0))).length; ok(wpOk === world.waypoints.length, 'y desde todos los ' + world.waypoints.length + ' puntos de paso de los bots');
  ok(S.navDir(nav, f, 43, 6) === null && S.navDir(nav, f, -40, 8) !== null && Math.abs(Math.hypot(...S.navDir(nav, f, -40, 8)) - 1) < 1e-9, 'navDir da una dirección unitaria fuera del destino y null al llegar');
  const inWall = S.navField(nav, 0, 0); ok(inWall.some(v => v >= 0), 'un destino ocupado (dentro de una caja) se desplaza a la celda libre más cercana');
  /* física real: bot que sigue el campo frente a bot en línea recta, de la base roja a la azul */
  const walk = (from, to, useNav) => { const e = { pos: { x: from[0], y: 0, z: from[1] }, vel: { x: 0, y: 0, z: 0 }, hw: 0.35, h: 1.8, onGround: true }, field = S.navField(nav, to[0], to[1]), dt = 1 / 20, sp = C.WALK * 0.8;
    for (let t = 0; t < 120; t += dt) { let dx = to[0] - e.pos.x, dz = to[1] - e.pos.z; if (Math.hypot(dx, dz) < 3) return t; if (useNav) { const d = S.navDir(nav, field, e.pos.x, e.pos.z); if (d) { dx = d[0]; dz = d[1]; } } const l = Math.hypot(dx, dz) || 1; e.vel.x = dx / l * sp; e.vel.z = dz / l * sp; S.moveEntity(cols, e, dt); }
    return null; };
  const trips = []; for (const a of sp[1]) for (const b of sp[0].slice(0, 3)) trips.push([a, b]);
  const withNav = trips.map(([a, b]) => walk(a, b, true)), straight = trips.map(([a, b]) => walk(a, b, false));
  ok(withNav.every(t => t !== null && t < 30), 'un bot que sigue la navegación llega de Spawn Red a Spawn Blue en ' + Math.min(...withNav).toFixed(0) + '–' + Math.max(...withNav).toFixed(0) + ' s en los ' + trips.length + ' trayectos');
  ok(straight.filter(t => t !== null).length <= 2, 'mientras que en línea recta llegan ' + straight.filter(t => t !== null).length + ' de ' + trips.length + ' (se atascan contra las paredes): por eso los bots necesitan navegación');
  const back = trips.map(([a, b]) => walk(b, a, true)); ok(back.every(t => t !== null && t < 30), 'y también de Spawn Blue a Spawn Red (' + Math.min(...back).toFixed(0) + '–' + Math.max(...back).toFixed(0) + ' s)');
}

/* ---------- 5. Servidor real ---------- */
console.log('\n=== 5. Servidor real por WebSocket ===');
class Bot {
  constructor(name, extra) { this.name = name; this.extra = extra || {}; this.msgs = []; this.pos = null; this.id = null; }
  connect(map) { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': '10.7.3.' + (++Bot.n) } }); this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: map || 0, c: 0 }, this.extra)));
    this.ws.on('message', d => { const x = JSON.parse(d); this.msgs.push(x); if (x.t === 'welcome') { this.id = x.id; this.welcome = x; res(x); } if (x.t === 'err') res(x); if (x.t === 'spawn' && x.id === this.id) this.pos = { x: x.x, y: x.y, z: x.z }; });
    this.ws.on('error', () => {}); this.ws.on('close', () => res({ t: 'err', m: 'cerrado' })); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); } all(t) { return this.msgs.filter(x => x.t === t); } close() { try { this.ws.close(); } catch (e) { /* ya cerrado */ } }
}
Bot.n = 20;
(async () => {
  fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
  /* la clasificación guardada trae entradas de los mapas antiguos (0, 3 y 5): al arrancar solo debe quedar la del mapa 0 */
  fs.writeFileSync(path.join(D, 'leaderboard.json'), JSON.stringify({ entries: [{ m: 0, n: 'Ana', p: 900, k: 9, d: 1, h: 2, c: 'Ráfaga', df: -1, t: 1 }, { m: 3, n: 'Berta', p: 800, k: 8, d: 2, h: 1, c: 'Ráfaga', df: -1, t: 1 }, { m: 5, n: 'Carla', p: 700, k: 7, d: 3, h: 0, c: 'Ráfaga', df: -1, t: 1 }] }));
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: D, WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '0', ZONE_MOVE_SECS: '1', ADMIN_PASSWORD: 'Nexus-Admin-2026xyz' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  try {
    let up = false; for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(B + '/healthz')).ok; } catch (e) { await sleep(100); } }
    ok(up, 'el servidor arranca con el mapa único');
    const lbj = await (await fetch(B + '/api/leaderboard')).json(), lb3 = await (await fetch(B + '/api/leaderboard?map=3')).json();
    ok(lbj.entries.length === 1 && lbj.entries[0].n === 'Ana' && lb3.entries.length === 1, 'la clasificación descarta las entradas de los mapas eliminados (quedan ' + lbj.entries.length + ' de 3; el aviso está en el registro: ' + /descartaron 2/.test(out) + ')');
    /* dos jugadores en el modo zona: uno de cada equipo */
    const a = new Bot('Rojo1', { mode: 'zona' }), b = new Bot('Azul1', { mode: 'zona' }); await a.connect(0); await b.connect(0);
    await until(() => a.pos && b.pos, 5000);
    const T = { [a.welcome.tm]: a, [b.welcome.tm]: b };
    ok(a.welcome.tm !== b.welcome.tm && T[0] && T[1], 'el servidor reparte los dos jugadores en equipos distintos (' + a.welcome.tm + ' y ' + b.welcome.tm + ')');
    ok(T[1] && T[1].pos && S.areaAt(0, T[1].pos.x, 0, T[1].pos.z) === 'Spawn Red' && T[0] && T[0].pos && S.areaAt(0, T[0].pos.x, 0, T[0].pos.z) === 'Spawn Blue',
      'cada uno aparece en su base: el rojo en Spawn Red (' + (T[1].pos.x | 0) + ', ' + (T[1].pos.z | 0) + ') y el azul en Spawn Blue (' + (T[0].pos.x | 0) + ', ' + (T[0].pos.z | 0) + ')');
    const z0 = a.welcome.zone; ok(z0 && z0.n === 'Central Courtyard' && z0.y === 0 && z0.x === zs[0].x && z0.z === zs[0].z, 'la primera zona es el Central Courtyard, con nombre y altura en el mensaje (' + JSON.stringify(z0 && { n: z0.n, y: z0.y }) + ')');
    await until(() => new Set(a.all('zone').map(x => x.z && x.z.n)).size >= 3, 12000);
    const seen = new Map(); for (const x of a.all('zone')) if (x.z) seen.set(x.z.n, x.z);
    ok(seen.size >= 3 && [...seen.values()].every(z => { const d = zs.find(q => q.n === z.n); return d && d.x === z.x && d.z === z.z && d.y === z.y; }), 'la zona rota entre las definidas del mapa (' + [...seen.keys()].join(', ') + '), siempre con su altura');
    ok([...seen.values()].every(z => z.y === 0 || z.y === 1.8 || z.y === 3.6), 'y las de azotea llegan con su altura (y = ' + [...new Set([...seen.values()].map(z => z.y))].join(', ') + ')');
    a.send({ t: 'vote', m: 1 }); b.send({ t: 'vote', m: -1 }); await sleep(300); ok(!a.msgs.some(x => x.t === 'err'), 'votar un mapa que no existe se ignora sin error');

    a.close(); b.close();
  } catch (e) { ok(false, 'error en la prueba del servidor: ' + e.message); } finally { srv.kill(); }

  /* ---------- 6. Cliente ---------- */
  console.log('\n=== 6. Cliente (JSDOM) ===');
  const PUB = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
  const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.localStorage.setItem('voltarena.v1.cfg', JSON.stringify({ name: 'Vieja', map: 5, cls: 0 }));   // configuración guardada por una versión con 6 mapas
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} }); const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('x'));
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; }; w.eval(shared);
  const i = client.lastIndexOf('})();'), errors = []; w.addEventListener('error', e => errors.push(e.message));
  w.eval(client.slice(0, i) + 'window.__M = { buildMap, mapGroup, MAPS, TEX, get cfg() { return cfg; }, get curMap() { return curMap; }, get mapHalf() { return mapHalf; } };\n' + client.slice(i));
  const M = w.__M;
  ok(M.cfg.map === 0 && errors.length === 0, 'una configuración guardada con «map: 5» (de cuando había 6 mapas) se corrige a 0 y el juego arranca sin errores (' + errors.length + ')');
  ok(M.curMap === 0 && M.mapHalf === 50 && M.MAPS.length === 1, 'el cliente construye Nexus Outpost al arrancar');
  ok(M.TEX.glass && M.TEX.helipad && M.TEX.helipad.raw === true && !M.TEX.glass.raw, 'existen las texturas «glass» (se tiñe) y «helipad» (colores propios, sin teñir)');
  ok([...tags].every(t => M.TEX[t]), 'todas las etiquetas de textura que usa el mapa (' + [...tags].join(', ') + ') existen en el cliente');
  const meshes = []; M.mapGroup.traverse(o => { if (o.isMesh) meshes.push(o); });
  const tris = meshes.filter(o => !o.userData.own).reduce((s, o) => s + o.geometry.index.count / 3, 0);
  ok(meshes.length <= 24 && tris > 6000, 'el mapa se dibuja en ' + meshes.length + ' mallas (' + Math.round(tris) + ' triángulos): sigue en lotes');
  const batches = meshes.filter(o => !o.userData.own), texMats = new Set(batches.map(o => o.material.uuid)); ok(batches.every(o => o.material.vertexColors) && texMats.size >= 6 && texMats.size <= 14, 'los lotes usan un material por textura (' + texMats.size + '), con el color de cada caja en los vértices');
  ok(errors.length === 0, 'sin errores de JavaScript al construir el mapa');
  w.close();
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
