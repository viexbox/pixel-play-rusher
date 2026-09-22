'use strict';
/* Novedades de jugabilidad (cliente real en jsdom): punto rojo en las armas, cuchillo con animación fluida y agacharse/deslizarse al estilo Krunker. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
function boot() {
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = () => Promise.reject(new Error('sin servidor'));
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared);
  const i = client.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  w.eval(client.slice(0, i) + 'window.__T = { get state() { return state; }, get player() { return player; }, get fighters() { return fighters; }, cfg, keys, step, camera, gun, knifeG, sightH, get knifeT() { return knifeT; }, get slideK() { return slideK; }, setMouse(v) { mouseL = v; }, setMouseR(v) { mouseR = v; }, fast() { updateHudFast(); }, endMatch, damage, TEAMS, tkNow, nameHtml, get curMap() { return curMap; } };\n' + client.slice(i));
  return { w, T: w.__T, errors, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)], key: (code, type) => w.document.dispatchEvent(new w.KeyboardEvent(type || 'keydown', { code, bubbles: true })) };
}
const settle = (T, n) => { for (let f = 0; f < n; f++) T.step(1 / 60); T.fast(); };
const hasRedGlass = g => { let f = false; g.traverse(o => { if (o.material && o.material.color && o.material.color.getHexString && o.material.color.getHexString() === 'ff5a5a') f = true; }); return f; };
/* Punto abierto (sin obstáculos delante) y su dirección: el punto de aparición es aleatorio y a veces hay una pared pegada */
const openSpot = T => { const world = S.buildWorld(T.curMap); let spot = null, best = 0;
  for (let x = -30; x <= 30; x += 5) for (let z = -30; z <= 30; z += 5) for (let k = 0; k < 8; k++) { const yaw = k * Math.PI / 4, d = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }; if (S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue; const t = Math.min(S.rayWorld(world.colliders, { x, y: 0.9, z }, d, 60), 60); if (t > best) { best = t; spot = { x, z, yaw, best }; } }
  return spot; };
const start = async cls => { const B = boot(); await sleep(250); B.$$('#classes .cls')[cls].click(); B.$('#play').click(); settle(B.T, 90); return B; };
(async () => {
  /* ---------- Punto rojo en las armas ---------- */
  const dotIds = ['asalto', 'rafaga', 'torrente', 'trueno', 'sheriff'];
  ok(dotIds.every(id => { const wp = S.WEAPONS.find(x => x.id === id); return wp.optics && wp.optics[0] === 'punto' && wp.optics[1] === 'hierro'; }), 'Asalto, Ráfaga, Torrente, Trueno y Sheriff llevan punto rojo (por defecto) y mira de hierro');
  ok(!S.WEAPONS.find(x => x.id === 'duo').optics && S.WEAPONS.find(x => x.id === 'lince').optics.length === 2, 'el Dúo no tiene mira opcional y el Lince conserva sus zooms');
  for (const id of dotIds) {
    const idx = S.WEAPONS.findIndex(x => x.id === id), wp = S.WEAPONS[idx];
    const { T, $, $$, key, errors } = await start(idx);
    ok(T.state === 'playing' && hasRedGlass(T.gun), id + ': el modelo lleva el visor de punto rojo montado');
    T.setMouseR(true); settle(T, 40);
    ok($('#optic').dataset.k === 'dot' && !$('#optic').hidden, id + ': al apuntar aparece el punto rojo en pantalla');
    const want = wp.size[1] / 2 + 0.012 + 0.033; ok(Math.abs(-T.gun.position.y - want) < 0.006, id + ': la línea de mira queda centrada al apuntar (' + (-T.gun.position.y).toFixed(3) + ' ≈ ' + want.toFixed(3) + ')');
    T.setMouseR(false); settle(T, 30); key('KeyB'); settle(T, 5);
    ok(!hasRedGlass(T.gun) && T.cfg.optics[id] === 'hierro', id + ': con B cambia a la mira de hierro (sin visor rojo)');
    ok(errors.length === 0, id + ': sin errores de JavaScript ' + JSON.stringify(errors));
  }

  /* ---------- Cuchillo: cambio rápido con animación fluida ---------- */
  { const { T, $, key, errors } = await start(0); T.setMouse(false);
    const bot = T.fighters.find(f => !f.isPlayer); const p = T.player; p.protect = 1e9; bot.team = 1 - p.team;   // el cuchillo solo hiere a rivales
    { const sp = openSpot(T); p.pos.set(sp.x, 0, sp.z); p.yaw = sp.yaw; p.vel.set(0, 0, 0); }
    const place = () => { const yaw = p.yaw; bot.pos.set(p.pos.x - Math.sin(yaw) * 1.6, p.pos.y, p.pos.z - Math.cos(yaw) * 1.6); bot.vel.set(0, 0, 0); bot.alive = true; bot.protect = 0; };
    place(); bot.hp = 100; const rest = T.gun.position.y; const ys = []; let visibleMid = false, hpAt = {};
    key('KeyV'); ok(T.knifeT > 0, 'V saca el cuchillo al instante');
    for (let f = 0; f < 45; f++) { place(); T.step(1 / 60); ys.push(T.gun.position.y); if (f === 6) hpAt.early = bot.hp; if (f === 14) visibleMid = T.knifeG.visible; if (f === 25) hpAt.late = bot.hp; }
    const drop = rest - Math.min(...ys); let maxJump = 0; for (let i = 1; i < ys.length; i++) maxJump = Math.max(maxJump, Math.abs(ys[i] - ys[i - 1]));
    ok(drop > 0.3 && visibleMid, 'el arma baja (' + drop.toFixed(2) + ' m) y el cuchillo aparece a mitad de la animación');
    ok(maxJump < 0.06, 'la animación es fluida: el mayor salto entre fotogramas es ' + maxJump.toFixed(3) + ' m');
    ok(hpAt.early === 100 && hpAt.late <= 40, 'el golpe llega cuando el cuchillo ya está en mano (a los 0,1 s sin daño; a los 0,42 s, −60: vida ' + hpAt.late + ')');
    for (let f = 0; f < 30; f++) { place(); T.step(1 / 60); }
    ok(T.knifeT === 0 && !T.knifeG.visible && Math.abs(T.gun.position.y - rest) < 0.02, 'al terminar el cuchillo se guarda y el arma vuelve a su sitio');
    // no se puede disparar mientras dura la animación y no se encadenan golpes
    const ammo = p.ammo; key('KeyV'); T.setMouse(true); for (let f = 0; f < 20; f++) T.step(1 / 60); const during = p.ammo; T.setMouse(false); key('KeyV'); const t1 = T.knifeT;
    ok(during === ammo && t1 > 0, 'durante el cuchillo no se dispara y otro V seguido no reinicia el golpe');
    ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors)); }

  /* ---------- Agacharse y deslizarse (estilo Krunker) ---------- */
  { const { T, key, errors } = await start(0); const p = T.player, spd = () => Math.hypot(p.vel.x, p.vel.z);
    // pasillo libre de obstáculos para correr sin chocar con nada
    const spot = openSpot(T), best = spot.best;
    const reset = () => { p.pos.set(spot.x, 0, spot.z); p.yaw = spot.yaw; p.vel.set(0, 0, 0); p.slide = 0; p.slideCd = 0; p.onGround = true; p.hp = 100; p.alive = true; p.protect = 1e9; };   // los bots no deben matar al jugador durante la prueba
    ok(best >= 30, 'hay un pasillo libre de ' + best.toFixed(0) + ' m para probar la carrera'); reset();
    // agacharse quieto: más lento y más bajo
    T.keys.KeyW = true; T.keys.ShiftLeft = true; settle(T, 60); ok(spd() < S.CONST.WALK * 0.6 && Math.abs(p.h - 1.2) < 0.01 && p.slide <= 0, 'agachado y caminando: velocidad reducida (' + spd().toFixed(1) + ' m/s), cuerpo bajo (1,2 m) y sin deslizar');   // [CONTROLES] Mayús es ahora la tecla de agachar/deslizar
    T.keys.ShiftLeft = false; settle(T, 40); ok(Math.abs(p.h - 1.8) < 0.01, 'al soltar Mayús se levanta');
    // correr y deslizarse
    reset(); settle(T, 60); const run = spd(); ok(run > 7, 'corriendo (' + run.toFixed(1) + ' m/s, sin tecla: ya no hay un botón de correr aparte)');   // [CONTROLES] Mayús ya no es «correr»: se corre siempre
    const eye0 = p.eye; T.keys.ShiftLeft = true; key('ShiftLeft'); T.step(1 / 60);
    ok(p.slide > 0.5 && spd() >= 10.2 && spd() <= 12.5, 'Mayús corriendo = deslizamiento con impulso (' + spd().toFixed(1) + ' m/s)');
    for (let f = 0; f < 20; f++) T.step(1 / 60);
    ok(p.eye < eye0 - 0.3 && T.slideK > 0.5 && T.camera.fov > T.cfg.fov, 'la cámara baja (' + (eye0 - p.eye).toFixed(2) + ' m) y el campo de visión se abre (' + T.camera.fov.toFixed(1) + '° > ' + T.cfg.fov + '°)');
    const s1 = spd(); for (let f = 0; f < 20; f++) T.step(1 / 60); ok(spd() < s1 && spd() > 4, 'la velocidad se va perdiendo poco a poco, no de golpe (' + s1.toFixed(1) + ' → ' + spd().toFixed(1) + ')');
    for (let f = 0; f < 60; f++) T.step(1 / 60); ok(p.slide <= 0, 'el deslizamiento acaba solo (slide=' + p.slide + ', v=' + spd().toFixed(1) + ', pos=' + p.pos.x.toFixed(1) + ',' + p.pos.z.toFixed(1) + ')');
    // enfriamiento: no se puede encadenar deslizamientos
    reset(); T.keys.ShiftLeft = false; key('ShiftLeft', 'keyup'); settle(T, 60); const run3 = spd();
    T.keys.ShiftLeft = true; key('ShiftLeft'); T.step(1 / 60); const first = p.slide > 0, cd0 = p.slideCd; for (let f = 0; f < 18; f++) T.step(1 / 60); const cdMid = p.slideCd; T.keys.ShiftLeft = false; key('ShiftLeft', 'keyup');   // suelta Mayús a los 0,3 s
    for (let f = 0; f < 45; f++) T.step(1 / 60);                                                                                  // ~1,05 s desde el inicio: el enfriamiento (0,9 s desde el ajuste estilo Krunker) ya pasó
    const fast = spd() > 5.5; T.keys.ShiftLeft = true; key('ShiftLeft'); T.step(1 / 60); const later = p.slide > 0; T.keys.ShiftLeft = false; key('ShiftLeft', 'keyup');
    ok(run3 > 7 && first && cd0 > 0.85 && cd0 <= 0.9 && cdMid > 0.5 && cdMid < 0.7 && p.slideCd > 0 && fast && later, 'run3=' + run3.toFixed(1) + ' hay enfriamiento de 0,9 s: al empezar ' + cd0.toFixed(2) + ' s, a los 0,3 s quedan ' + cdMid.toFixed(2) + ' s, y pasado el enfriamiento se vuelve a deslizar (' + later + ')');
    // salto desde el deslizamiento
    reset(); settle(T, 60); T.keys.ShiftLeft = true; key('ShiftLeft'); T.step(1 / 60); const before = spd(); T.keys.Space = true; key('Space'); T.step(1 / 60);   // [CONTROLES] salto de pulsación única: hace falta el keydown de Espacio, no solo mantener la tecla
    ok(p.slide <= 0 && p.vel.y > 6 && spd() >= before * 0.99, 'saltar durante el deslizamiento conserva la velocidad (' + before.toFixed(1) + ' → ' + spd().toFixed(1) + ' m/s)');
    ok(spd() <= S.MOVE.MAX_H && spd() > before * 1.1, 'gana impulso (slide hop) sin superar nunca el tope que vigila el servidor (' + spd().toFixed(1) + ' ≤ ' + S.MOVE.MAX_H + ' m/s)');
    ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors)); }

  /* ---------- Cartel de equipo y vistas previas de mapa ---------- */
  { const { T, $, $$ } = await start(0); const b = $('#teamBanner'), tm = T.player.team;
    ok(b.classList.contains('on') && b.classList.contains('t' + tm) && new RegExp('EQUIPO ' + (tm === 0 ? 'AZUL' : 'ROJO')).test(b.textContent), 'al empezar sale el cartel grande con tu equipo (' + b.textContent.replace(/\s+/g, ' ').slice(0, 40) + ')');
    ok($$('#maps .mapc .sw').length === S.MAPS.length && $$('#maps .mapc .sw').every((e, i) => e.getAttribute('style').includes('maps/map' + i + '.jpg')), 'las tarjetas de mapa usan su imagen de vista previa');
    ok(S.MAPS.map((_, i) => i).every(i => fs.existsSync(path.join(PUB, 'maps', 'map' + i + '.jpg')) && fs.statSync(path.join(PUB, 'maps', 'map' + i + '.jpg')).size > 10000), 'las ' + S.MAPS.length + ' imágenes de mapa existen en public/maps');
    T.endMatch(); ok($$('#endMapBtns .emap').every((e, i) => e.getAttribute('style').includes('maps/map' + i + '.jpg')), 'y el voto de fin de partida también las muestra'); }

  /* ---------- Selección de mapa al terminar (entrenamiento) ---------- */
  { const { T, $, $$ } = await start(0); const cur = T.curMap; T.endMatch();
    ok(!$('#end').hidden && $('#endMaps').hidden && S.MAPS.length === 1, 'al terminar no aparece el selector de mapa: con un solo mapa no hay nada que elegir');
    ok(T.cfg.map === 0 && cur === 0, 'el único mapa es el guardado para la siguiente partida');
    $('#again').click(); settle(T, 5); ok(T.state === 'playing' && T.curMap === 0, '«Jugar otra vez» empieza directamente en ' + S.MAPS[0].name + ' (' + T.state + ')'); }
  /* ---------- Equipos azul y rojo (entrenamiento) ---------- */
  { const mine = []; let first = null;
    for (let r = 0; r < 12; r++) {
      const B = await start(0); const { T, $, $$ } = B; mine.push(T.player.team);
      if (r === 0) first = B;
    }
    ok(mine.includes(0) && mine.includes(1), 'tu equipo se reparte al azar al entrar (' + mine.filter(x => x === 0).length + ' de 12 partidas en azul)');
    const { T, $, $$ } = first, p = T.player, bots = T.fighters.filter(f => !f.isPlayer);
    ok(T.fighters.length === 8 && T.fighters.filter(f => f.team === 0).length === 4 && T.fighters.filter(f => f.team === 1).length === 4, 'los 8 luchadores se reparten 4 contra 4');
    ok(bots.every(b => b.color === T.TEAMS[b.team].c) && T.TEAMS[0].c !== T.TEAMS[1].c && /^#2f7bff$/i.test(T.TEAMS[0].c) && /^#ff3b48$/i.test(T.TEAMS[1].c), 'los bots llevan la camiseta de su equipo (azul y rojo)');
    T.fast(); ok(/EQUIPO (AZUL|ROJO)/.test($('#hsTeam').textContent) && $('#hsTeam').classList.contains('t' + p.team), 'el HUD muestra tu equipo (' + $('#hsTeam').textContent + ')');
    ok($$('#leadName .tsb').length === 2 && /Tu equipo/.test($('#leadPts').textContent), 'y el marcador de equipos (azul – rojo)');
    ok($$('#liveRows li').every(li => li.classList.contains('t0') || li.classList.contains('t1')) && $$('#liveRows .tdot').length > 0, 'la clasificación en vivo marca el equipo de cada uno');
    const mate = bots.find(b => b.team === p.team), foe = bots.find(b => b.team !== p.team); p.protect = 1e9; mate.protect = 0; foe.protect = 0; mate.hp = 100; foe.hp = 100;
    T.damage(mate, 60, p, false, 'Prueba'); T.damage(foe, 60, p, false, 'Prueba'); ok(mate.hp === 100 && foe.hp === 40, 'sin fuego amigo: un compañero no recibe daño (' + mate.hp + ') y un rival sí (' + foe.hp + ')');
    for (let f = 0; f < 900; f++) { p.hp = 100; T.step(1 / 30); }
    ok(T.fighters.every(f => !f.lastAttacker || f.lastAttacker.team !== f.team), 'en 30 s de partida, ningún bot ha herido a un compañero');
    // resultado por equipos
    const finish = async (setup) => { const B = await start(0); const t = B.T.player.team; setup(B.T, t); B.T.endMatch(); return { title: B.$('#endTitle').textContent, sub: B.$('#endSub').textContent, rows: B.$$('#endRows tr'), t }; };
    let r1 = await finish((T2, t) => { T2.fighters.find(f => !f.isPlayer && f.team !== t).kills = 7; });
    ok(/^Gana el equipo (AZUL|ROJO)$/.test(r1.title) && r1.title.includes(r1.t ? 'AZUL' : 'ROJO'), 'si gana el rival: «' + r1.title + '»');
    let r2 = await finish((T2, t) => { T2.fighters.find(f => !f.isPlayer && f.team === t).kills = 7; });
    ok(/^¡Victoria del equipo (AZUL|ROJO)!$/.test(r2.title) && r2.title.includes(r2.t ? 'ROJO' : 'AZUL'), 'si gana tu equipo: «' + r2.title + '»');
    let r3 = await finish(() => {}); ok(r3.title === 'Empate' && /Azul 0 – 0 Rojo/.test(r3.sub) && r3.rows.every(tr => tr.classList.contains('t0') || tr.classList.contains('t1')), 'sin bajas: «Empate», con el marcador Azul 0 – 0 Rojo y las filas coloreadas por equipo'); }

  /* ---------- Nombres: verificados dorados y brillantes, resto azules sin brillo ---------- */
  { const { T, w } = await start(0), doc = w.document; const mk = h => { const d = doc.createElement('div'); d.innerHTML = h; doc.body.appendChild(d); return d; };
    const norm = mk(T.nameHtml('Pepe', 0)), adm = mk(T.nameHtml('Viexbox', 'admin')), inf = mk(T.nameHtml('ProGamer', 'inf'));
    const cs = (d, sel) => w.getComputedStyle(d.querySelector(sel));
    const rule = sel => { for (const sh of doc.styleSheets) for (const r of sh.cssRules) if (r.selectorText === sel) return r.style; return null; };   // jsdom no calcula text-shadow: se mira la regla CSS
    ok(norm.querySelector('.pn') && !norm.querySelector('svg') && cs(norm, '.pn').color === 'rgb(90, 169, 255)' && rule('.pn').getPropertyValue('text-shadow') === 'none', 'jugador normal: nombre azul, sin brillo y sin tic');
    ok(adm.querySelector('.rl-admin') && adm.querySelector('svg.vt') && cs(adm, '.rl-admin').color === 'rgb(255, 213, 74)' && /#ffb400|rgb\(255, 180, 0\)/.test(rule('.rl-admin').getPropertyValue('text-shadow')) && /goldn/.test(rule('.rl-admin').getPropertyValue('animation')), 'administrador: nombre dorado brillante y tic azul de verificado');
    ok(inf.querySelector('.rl-admin') && inf.querySelector('svg.vt') && cs(inf, '.rl-admin').color === 'rgb(255, 213, 74)', 'influencer verificado: exactamente igual (dorado brillante + tic azul), lo ve todo el mundo'); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
