'use strict';
/* [MAPAS KRUNKER] Los mapas (Castillo Real, Barrio Arcoíris y Puerto Industrial): lista, geometría, apariciones y zonas, alcanzabilidad caminando
   (sin saltar) y sin trampas, navegación de los bots, servidor real (apariciones por equipo, zonas con altura, limpieza de la
   clasificación) y cliente (texturas, lotes, configuración antigua). Sustituye a nexus.test.js, del mapa que ya no existe. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
const PORT = 3341, D = '/tmp/ppr_maps', B = 'http://127.0.0.1:' + PORT;
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }

console.log('=== 1. Lista de mapas ===');
ok(S.MAPS.length === 3 && S.MAPS[0].name === 'Castillo Real' && S.MAPS[1].name === 'Barrio Arcoíris' && S.MAPS[2].name === 'Puerto Industrial', 'tres mapas: ' + S.MAPS.map(m => m.name).join(', '));
ok(!JSON.stringify(S.MAPS.map(x => x.name)).match(/Nexus|Duna|Piscina|Almenas|Contenedores|Bosque|Fábrica|Cañón/), 'ningún mapa viejo (Nexus Outpost, Pueblo Duna, Villa Piscina…) sigue en la lista');
ok(S.MAPS.every(m => m.look.pixel > 0), 'todos usan texturas pixeladas estilo Krunker (look.pixel)');

/* destinos que se tienen que poder alcanzar CAMINANDO (x, altura de los pies, z) y puntos que caen en cada zona con nombre */
const CFG = [
  { targets: { 'Keep Roof': [0, 4.8, 0], 'Keep': [0, 0, 0], 'Ramparts (oeste)': [-24.3, 3.6, 0], 'Ramparts (este)': [24, 3.6, 0], 'Market Street': [0, 0, -24], 'Stables': [11, 0, 34], 'Courtyard': [12, 0, 0], 'Spawn Red': [-35, 0, 0], 'Spawn Blue': [35, 0, 0] },
    probe: { 'Tejado de la torre': [0, 4.8, 2], 'Torre': [0, 0, 2], 'Murallas': [24, 3.6, 0], 'Tejados': [14, 3.6, -32], 'Base roja': [-35, 0, 0], 'Base azul': [35, 0, 0], 'Calle del mercado': [0, 0, -24], 'Establos': [11, 0, 34], 'Patio': [12, 0, 0] } },
  { targets: { 'Rooftops (base roja)': [-26, 4.0, -26], 'Rooftops (base azul)': [26, 4.0, 26], 'Puente central': [0, 4.0, -26], 'Casa (interior)': [14, 0, -26], 'Casa sur (interior)': [-26, 0, 26], 'Fountain Plaza': [0, 0, -8], 'Back Street': [0, 0, -36], 'Spawn Red': [-37, 0, 0], 'Spawn Blue': [37, 0, 0] },
    probe: { 'Tejados': [-14, 4.0, -26], 'Casa': [14, 0, -26], 'Base roja': [-37, 0, 0], 'Base azul': [37, 0, 0], 'Callejón': [0, 0, -36], 'Plaza de la fuente': [0, 0, -8] } },
  /* [MAPA 3] Puerto Industrial */
  { targets: { 'Contenedores (rojo)': [-15, 2.6, -26], 'Contenedores (azul)': [15, 2.6, -26], 'Pasarela': [0, 2.6, -25.8], 'Tejado de las oficinas (azul)': [19, 4.0, 22], 'Puente de las oficinas': [0, 4.0, 25],
      'Nave': [0, 0, 1.8], 'Oficina (interior)': [-19, 0, 27], 'Muelle norte': [0, 0, -31], 'Muelle sur': [0, 0, 17], 'Base roja': [-35, 0, 0], 'Base azul': [35, 0, 0] },
    probe: { 'Tejado de las oficinas': [19, 4.0, 22], 'Contenedores': [15, 2.6, -26], 'Oficinas': [-19, 0, 27], 'Nave': [0, 0, 3], 'Base roja': [-35, 0, 0], 'Base azul': [35, 0, 0], 'Muelle norte': [0, 0, -31], 'Muelle sur': [0, 0, 17], 'Patio de carga': [20, 0, 0] } }
];
const allTags = new Set();
for (let mi = 0; mi < S.MAPS.length; mi++) {
  const m = S.MAPS[mi], world = S.buildWorld(mi), cols = world.colliders, boxes = [], cfg = CFG[mi];
  S.buildWorld(mi, (cx, y0, cz, w, h, d, color, solid, tag) => boxes.push({ cx, y0, cz, w, h, d, color, solid, tag }));
  boxes.forEach(b => { if (b.tag) allTags.add(b.tag.startsWith('ramp:') ? b.tag.split(':')[3] || 'concrete' : b.tag); });   // las rampas llevan su textura al final: «ramp:dir:y0:textura»
  console.log('\n=== ' + m.name + ' ===');
  const wrong = Object.entries(cfg.probe).filter(([n, p]) => S.areaAt(mi, ...p) !== n);
  ok(wrong.length === 0, 'S.areaAt() reconoce cada zona con nombre (' + Object.keys(cfg.probe).join(', ') + ')' + (wrong.length ? ' — fallan: ' + wrong.map(([n, p]) => n + '→«' + S.areaAt(mi, ...p) + '»').join(', ') : ''));
  const finite = boxes.every(b => [b.cx, b.y0, b.cz, b.w, b.h, b.d].every(Number.isFinite) && b.w > 0 && b.h > 0 && b.d > 0);
  ok(finite && cols.length >= 150 && cols.length <= 500, cols.length + ' cajas macizas, todas con medidas válidas');
  const lim = m.half + 2.01; ok(cols.every(c => c.minX >= -lim && c.maxX <= lim && c.minZ >= -lim && c.maxZ <= lim && c.maxY <= 12), 'todo cabe dentro del recinto (' + m.half * 2 + ' × ' + m.half * 2 + ' m) y por debajo de 12 m');
  ok(world.waypoints.length >= 200 && world.waypoints.every(([x, z]) => !S.overlapAt(cols, x, 0, z, 0.6, 1.8)), world.waypoints.length + ' puntos de paso para los bots, todos libres');
  /* apariciones y zonas */
  const sp = world.spawns, free = (x, y, z) => !S.overlapAt(cols, x, y, z, 0.6, 1.8);
  ok(sp[1].length >= 6 && sp[0].length >= 6 && sp[1].every(([x, z]) => free(x, 0, z)) && sp[0].every(([x, z]) => free(x, 0, z)), 'cada equipo tiene ' + sp[1].length + ' puntos de aparición libres');
  ok(sp[1].every(([x, z]) => S.areaAt(mi, x, 0, z) === 'Base roja') && sp[0].every(([x, z]) => S.areaAt(mi, x, 0, z) === 'Base azul'), 'el equipo rojo aparece en Spawn Red y el azul en Spawn Blue');
  const cen = l => [l.reduce((a, p) => a + p[0], 0) / l.length, l.reduce((a, p) => a + p[1], 0) / l.length]; const [rx, rz] = cen(sp[1]), [bx, bz] = cen(sp[0]);
  ok(Math.hypot(rx - bx, rz - bz) > 60, 'las dos bases están lejos: ' + Math.hypot(rx - bx, rz - bz).toFixed(0) + ' m en línea recta');
  const zs = m.zones; ok(zs.length >= 3 && zs.every(z => free(z.x, z.y + 0.01, z.z) && (z.y === 0 || S.overlapAt(cols, z.x, z.y - 0.1, z.z, 0.3, 0.2))), zs.length + ' zonas de captura, cada una sobre suelo firme y libre a su altura (' + zs.map(z => z.n + ' ' + z.y + ' m').join(', ') + ')'.replace(/ 0 m/g, ''));
  ok(zs.some(z => z.y === 0), 'hay zonas a ras de suelo (para las salas con bots)');
  /* alcanzabilidad caminando */
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

  const [r0, b0] = [sp[1][0], sp[0][0]], R = bfs(r0[0], r0[1]), Bl = bfs(b0[0], b0[1]), targets = cfg.targets;
  const lost = { R: [], B: [] }; for (const [n, [x, y, z]] of Object.entries(targets)) { if (reach(R, x, y, z) === null) lost.R.push(n); if (reach(Bl, x, y, z) === null) lost.B.push(n); }
  ok(lost.R.length === 0, 'desde Spawn Red se llega caminando a los ' + Object.keys(targets).length + ' destinos, también a los altos' + (lost.R.length ? ' (NO: ' + lost.R.join(', ') + ')' : ''));
  ok(lost.B.length === 0, 'desde Spawn Blue también' + (lost.B.length ? ' (NO: ' + lost.B.join(', ') + ')' : ''));
  const rev = new Map(); for (const [i, j, k] of R.q) for (const [ni, nj, kk] of neighbours(i, j, k)) { const n = id(ni, nj, kk); if (!rev.has(n)) rev.set(n, []); rev.get(n).push(id(i, j, k)); }
  const back = new Set([R.start]), bq = [R.start]; for (let qi = 0; qi < bq.length; qi++) for (const p of rev.get(bq[qi]) || []) if (!back.has(p)) { back.add(p); bq.push(p); }
  const traps = R.q.filter(([i, j, k]) => !back.has(id(i, j, k)));
  ok(traps.length === 0, R.q.length + ' superficies alcanzables y de todas se puede VOLVER a la base: ' + traps.length + ' trampas' + (traps.length ? ' (p. ej. x ' + ctr(traps[0][0]) + ', z ' + ctr(traps[0][1]) + ')' : ''));
  /* navegación de los bots con física real */
  { const nav = world.nav, C = S.CONST;
  const walk = (from, to, useNav) => { const e = { pos: { x: from[0], y: 0, z: from[1] }, vel: { x: 0, y: 0, z: 0 }, hw: 0.35, h: 1.8, onGround: true }, field = S.navField(nav, to[0], to[1], to[2]), dt = 1 / 20, sp = C.WALK * 0.8;
    let stuckD = null, stuckT = 0;   // [PR3] misma salida de emergencia que botThink en server.js: si no se acerca en 1,2 s, salta y desvía un poco (rompe la oscilación en el borde de una escalera)
    for (let t = 0; t < 120; t += dt) {
      let dx = to[0] - e.pos.x, dz = to[1] - e.pos.z; if (Math.hypot(dx, dz) < 3 && Math.abs(e.pos.y - (to[2] || 0)) < 1) return t;
      if (useNav) {
        const d = S.navDir(nav, field, e.pos.x, e.pos.z, e.pos.y); if (d) { dx = d[0]; dz = d[1]; }
        const d2 = Math.hypot(to[0] - e.pos.x, to[1] - e.pos.z) + Math.abs((to[2] || 0) - e.pos.y) * 2;
        if (stuckD == null || d2 < stuckD - 0.3) { stuckD = d2; stuckT = t; }
        else if (t - stuckT > 1.2) { stuckT = t; stuckD = d2; if (e.onGround) e.vel.y = C.JUMP * 0.9; const a = (Math.random() - 0.5) * 2.4, ca = Math.cos(a), sa = Math.sin(a); const ndx = dx * ca - dz * sa, ndz = dx * sa + dz * ca; dx = ndx; dz = ndz; }
      }
      const l = Math.hypot(dx, dz) || 1; e.vel.x = dx / l * sp; e.vel.z = dz / l * sp; S.moveEntity(cols, e, dt);
    }
    return null; };
  const trips = []; for (const a of sp[1].slice(0, 4)) for (const b of sp[0].slice(0, 2)) trips.push([a, b]);
    const withNav = trips.map(([a, b]) => walk(a, b, true)); ok(withNav.every(t => t !== null && t < 40), 'un bot que sigue la navegación llega de Spawn Red a Spawn Blue en ' + Math.min(...withNav.map(t => t === null ? 999 : t)).toFixed(0) + '–' + Math.max(...withNav.map(t => t === null ? 999 : t)).toFixed(0) + ' s en los ' + trips.length + ' trayectos');
    const backT = trips.map(([a, b]) => walk(b, a, true)); ok(backT.every(t => t !== null && t < 40), 'y de Spawn Blue a Spawn Red');
    const toZones = zs.map(z => walk(sp[1][0], [z.x, z.z, z.y], true));
    ok(toZones.every(t => t !== null && t < 90), 'y llega a todas las zonas de Capturar Zona (' + zs.map((z, i) => z.n + ' ' + (toZones[i] === null ? 'NO LLEGÓ' : toZones[i].toFixed(0) + 's')).join(', ') + ')');
  }
}

console.log('\n=== Servidor real por WebSocket ===');
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
  /* la clasificación guardada trae entradas de mapas que no existen (97 y 99, además del 0): al arrancar solo debe quedar la del mapa 0 */
  fs.writeFileSync(path.join(D, 'leaderboard.json'), JSON.stringify({ v: 2, entries: [{ m: 0, n: 'Ana', p: 900, k: 9, d: 1, h: 2, c: 'Ráfaga', df: -1, t: 1 }, { m: 97, n: 'Berta', p: 800, k: 8, d: 2, h: 1, c: 'Ráfaga', df: -1, t: 1 }, { m: 99, n: 'Carla', p: 700, k: 7, d: 3, h: 0, c: 'Ráfaga', df: -1, t: 1 }] }));
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: D, WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '0', ZONE_MOVE_SECS: '1', ADMIN_PASSWORD: 'Nexus-Admin-2026xyz' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  try {
    let up = false; for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(B + '/healthz')).ok; } catch (e) { await sleep(100); } }
    ok(up, 'el servidor arranca');
    const lbj = await (await fetch(B + '/api/leaderboard')).json(), lb3 = await (await fetch(B + '/api/leaderboard?map=97')).json();
    ok(lbj.entries.length === 1 && lbj.entries[0].n === 'Ana' && lb3.entries.length === 1, 'la clasificación descarta las entradas de los mapas eliminados (quedan ' + lbj.entries.length + ' de 3; el aviso está en el registro: ' + /descartaron 2/.test(out) + ')');
    const zs = S.MAPS[0].zones;
    const a = new Bot('Rojo1', { mode: 'zona' }), b = new Bot('Azul1', { mode: 'zona' }); await a.connect(0); await b.connect(0);
    await until(() => a.pos && b.pos, 5000);
    const T = { [a.welcome.tm]: a, [b.welcome.tm]: b };
    ok(a.welcome.tm !== b.welcome.tm && T[0] && T[1], 'el servidor reparte los dos jugadores en equipos distintos (' + a.welcome.tm + ' y ' + b.welcome.tm + ')');
    ok(T[1] && T[1].pos && S.areaAt(0, T[1].pos.x, 0, T[1].pos.z) === 'Base roja' && T[0] && T[0].pos && S.areaAt(0, T[0].pos.x, 0, T[0].pos.z) === 'Base azul',
      'cada uno aparece en su base: el rojo en Spawn Red (' + (T[1].pos.x | 0) + ', ' + (T[1].pos.z | 0) + ') y el azul en Spawn Blue (' + (T[0].pos.x | 0) + ', ' + (T[0].pos.z | 0) + ')');
    const z0 = a.welcome.zone; ok(z0 && z0.n === zs[0].n && z0.y === zs[0].y && z0.x === zs[0].x && z0.z === zs[0].z, 'la primera zona es ' + zs[0].n + ', con nombre y altura en el mensaje (' + JSON.stringify(z0 && { n: z0.n, y: z0.y }) + ')');
    await until(() => new Set(a.all('zone').map(x => x.z && x.z.n)).size >= 3, 20000);
    const seen = new Map(); for (const x of a.all('zone')) if (x.z) seen.set(x.z.n, x.z);
    ok(seen.size >= 2 && [...seen.values()].every(z => { const d = zs.find(q => q.n === z.n); return d && d.x === z.x && d.z === z.z && d.y === z.y; }), 'la zona rota entre las definidas del mapa (' + [...seen.keys()].join(', ') + '), siempre con su altura');
    a.send({ t: 'vote', m: 5 }); b.send({ t: 'vote', m: -1 }); await sleep(300); ok(!a.msgs.some(x => x.t === 'err'), 'votar un mapa que no existe se ignora sin error');
    a.close(); b.close();
  } catch (e) { ok(false, 'error en la prueba del servidor: ' + e.message); } finally { srv.kill(); }

  console.log('\n=== Cliente (JSDOM) ===');
  const PUB = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
  const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.localStorage.setItem('voltarena.v1.cfg', JSON.stringify({ name: 'Vieja', map: 4, cls: 0 }));   // configuración guardada cuando había 5 mapas
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} }); const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {}; w.fetch = () => Promise.reject(new Error('x'));
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; }; w.eval(shared);
  const i = client.lastIndexOf('})();'), errors = []; w.addEventListener('error', e => errors.push(e.message));
  w.eval(client.slice(0, i) + 'window.__M = { buildMap, mapGroup, MAPS, TEX, get cfg() { return cfg; }, get curMap() { return curMap; }, get mapHalf() { return mapHalf; } };\n' + client.slice(i));
  const M = w.__M;
  ok(M.cfg.map === 0 && errors.length === 0, 'una configuración guardada con un mapa que ya no existe («map: 4») se corrige a 0 y el juego arranca sin errores (' + errors.length + ')');
  ok(M.curMap === 0 && M.mapHalf === 40 && M.MAPS[0].name === 'Castillo Real', 'el cliente construye Castillo Real al arrancar');
  ok([...allTags].every(t => M.TEX[t]), 'todas las etiquetas de textura que usan los mapas (' + [...allTags].sort().join(', ') + ') existen en el cliente');
  for (let mi = 0; mi < M.MAPS.length; mi++) {
    M.buildMap(mi); const meshes = []; M.mapGroup.traverse(o => { if (o.isMesh) meshes.push(o); });
    const tris = meshes.filter(o => !o.userData.own).reduce((s, o) => s + o.geometry.index.count / 3, 0);
    ok(meshes.length <= 24 && tris > 3000, M.MAPS[mi].name + ': se dibuja en ' + meshes.length + ' mallas (' + Math.round(tris) + ' triángulos), en lotes');
  }
  ok(errors.length === 0, 'sin errores de JavaScript al construir los mapas');
  w.close();
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
