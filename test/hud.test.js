'use strict';
/* HUD estilo arcade + mira del francotirador (Lince), con el cliente real en jsdom. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://ejemplo.test/' });
const w = dom.window;
w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
w.fetch = () => Promise.reject(new Error('sin servidor'));
w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'vendor', 'three.min.js'), 'utf8'));
w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'shared.js'), 'utf8'));
let c = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8'); const i = c.lastIndexOf('})();');
c = c.slice(0, i) + 'window.__T = { get state() { return state; }, get player() { return player; }, get fighters() { return fighters; }, cfg, keys, step, setMouse(v) { mouseL = v; }, setMouseR(v) { mouseR = v; }, fast() { updateHudFast(); }, slow() { updateHudSlow(); } };\n' + c.slice(i);
const errors = []; w.addEventListener('error', e => errors.push(e.message));
w.eval(c);
const world = S.buildWorld(0);
(async () => {
  const T = w.__T, $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  await sleep(300);
  const lince = S.WEAPONS.findIndex(x => x.id === 'lince'); T.cfg.cls = lince;
  $('#play').click(); $('#eqPlay').click(); ok(T.state === 'playing', 'partida de entrenamiento con el francotirador (Lince)');
  for (let f = 0; f < 90; f++) T.step(1 / 60); T.fast(); T.slow();

  // --- HUD ---
  ok($('#wname').textContent === 'Lince' && /Francotirador/i.test($('#wtype').textContent), 'la caja de arma muestra nombre y tipo (Lince · Francotirador)');
  ok($('#wicon svg') && $('#wicon svg').innerHTML.length > 100, 'icono de arma dibujado (' + ($('#wicon svg') ? $('#wicon svg').innerHTML.length : 0) + ' bytes de SVG)');
  ok($$('#pips i').length === 5 && $$('#pips i.on').length === 5, 'indicador de cargador con 5 balas encendidas');
  ok($('#mag').textContent === '5' && $('#magmax').textContent === '/ 5', 'munición 5 / 5');
  ok($('#hpnum').textContent === '100' && $('#hpbar').style.width === '100%', 'barra de vida al 100 %');
  ok(/^\d:\d\d$/.test($('#timer').textContent), 'reloj de partida (' + $('#timer').textContent + ')');
  ok($$('#liveRows li').length >= 5 && $$('#liveRows li.me').length >= 1, 'clasificación lateral con ' + $$('#liveRows li').length + ' filas y tu fila resaltada');
  ok(/Nexus Outpost/i.test($('#modeName').textContent), 'la barra superior indica el mapa (' + $('#modeName').textContent + ')');
  ok($('#leadName').textContent.length > 0 && $('#myKD').textContent.includes('K'), 'panel de líder y de tus puntos');
  ok($('#hpProt').hidden === false, 'etiqueta «PROTEGIDO» tras aparecer');
  await sleep(600);
  ok(/FPS/.test($('#fps').textContent) && /\d+ FPS/.test($('#fps').textContent), 'contador de FPS activo (' + $('#fps').textContent + ')');

  // --- Mira telescópica ---
  ok($('#scope').hidden === true, 'la mira telescópica está oculta al empezar');
  T.setMouseR(true); for (let f = 0; f < 40; f++) T.step(1 / 60);
  ok($('#scope').hidden === false, 'clic derecho abre la mira telescópica');
  ok(/^×\d/.test($('#scZoom').textContent), 'la mira indica el zoom (' + $('#scZoom').textContent + ')');
  ok($('#crosshair').style.opacity === '0', 'la mira normal se oculta con el zoom');
  ok(T.player.aim > 0.85, 'el jugador apunta (aim ' + T.player.aim.toFixed(2) + ')');
  T.player.protect = 1e9;   // esta parte prueba el HUD, no el combate: los bots reaparecen y atacan, y con el jugador muerto fallaban las comprobaciones de vida y de bajas al azar

  // Colocar un bot delante, con línea de visión
  const bot = T.fighters.find(f => !f.isPlayer && f.alive); bot.team = 1 - T.player.team;   // ahora hay equipos: se dispara a un rival
  const eye = () => ({ x: T.player.pos.x, y: T.player.pos.y + T.player.eye, z: T.player.pos.z });
  let placed = false;
  for (let k = 0; k < 96 * 4 && !placed; k++) {   // 96 direcciones y, si no hay 22 m despejados desde donde aparece el jugador, 20, 18 y 16 m
    const a = (k % 96) / 96 * Math.PI * 2, R = [22, 20, 18, 16][Math.floor(k / 96)], x = T.player.pos.x + Math.cos(a) * R, z = T.player.pos.z + Math.sin(a) * R;
    if (Math.abs(x) > 36 || Math.abs(z) > 36 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8)) continue;
    const o = eye(); const clear = ty => { const t = { x, y: ty, z }, d = { x: t.x - o.x, y: t.y - o.y, z: t.z - o.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o, d, l) >= l - 0.05; };
    if ([0.4, 1.1, 1.7].every(clear)) { bot.pos.set(x, 0, z); placed = true; }   // línea de tiro libre a tres alturas (piernas, pecho y cabeza): un obstáculo bajo a medio camino podía tapar el cuerpo
  }
  ok(placed, 'bot colocado a ~22 m con línea de visión');
  /* los demás bots se mueven al azar: se dejan inofensivos y detrás del jugador (fuera de la línea de tiro) para que ninguno se cruce en el disparo */
  { const dx = bot.pos.x - T.player.pos.x, dz = bot.pos.z - T.player.pos.z, l = Math.hypot(dx, dz) || 1; let i = 0;
    for (const f of T.fighters) if (!f.isPlayer && f !== bot) { f.team = bot.team; f.ai.react = 99; f.protect = 1e9;   // del mismo equipo que el objetivo: no le disparan (no hay fuego amigo) y no le roban la baja
      f.pos.set(T.player.pos.x - dx / l * (4 + i * 1.5) + (i % 2 ? 2 : -2), 0, T.player.pos.z - dz / l * (4 + i * 1.5)); f.vel.set(0, 0, 0); i++; } }
  const aim = () => { const o = eye(), dx = bot.pos.x - o.x, dz = bot.pos.z - o.z, dy = bot.pos.y + 1.1 - o.y; T.player.yaw = Math.atan2(-dx, -dz); T.player.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
  bot.protect = 0; bot.ai.react = 99; // el bot no reacciona: así probamos el HUD sin ruido
  let enemySeen = false;
  for (let f = 0; f < 12; f++) { aim(); T.step(1 / 60); if ($('#crosshair').classList.contains('enemy')) enemySeen = true; }
  ok(enemySeen, 'la mira se pone roja al apuntar a un rival');
  ok(/^\d+ m$/.test($('#scRange').textContent), 'telémetro de la mira: ' + $('#scRange').textContent);

  // --- Disparo y recompensas ---
  /* el jugador se desplaza un poco durante el calentamiento: se vuelve a comprobar la línea de tiro (a tres alturas) con su posición ACTUAL y, si algo tapa al bot, se recoloca */
  { const o0 = eye(), clear = (x, z) => [0.4, 1.1, 1.7].every(ty => { const d = { x: x - o0.x, y: ty - o0.y, z: z - o0.z }, l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l; return S.rayWorld(world.colliders, o0, d, l) >= l - 0.05; });
    if (!clear(bot.pos.x, bot.pos.z)) { for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2, x = T.player.pos.x + Math.cos(a) * 22, z = T.player.pos.z + Math.sin(a) * 22; if (Math.abs(x) > 36 || Math.abs(z) > 36 || S.overlapAt(world.colliders, x, 0, z, 0.4, 1.8) || !clear(x, z)) continue; bot.pos.set(x, 0, z); break; } }
    aim(); for (let f = 0; f < 6; f++) { aim(); T.step(1 / 60); } }
  const hp0 = bot.hp; let kills0 = T.player.kills, sawNum = false, sawFeed = false, sawKill = false;
  T.setMouse(true);
  const pin = { x: bot.pos.x, z: bot.pos.z };
  const shots = []; let prevAmmo = T.player.ammo;
  for (let f = 0; f < 60 * 5 && T.player.kills === kills0; f++) {
    { const o = eye(), dx = bot.pos.x - o.x, dy = bot.pos.y + 1.1 - o.y, dz = bot.pos.z - o.z, l = Math.hypot(dx, dy, dz), d = { x: dx / l, y: dy / l, z: dz / l }, wd = S.rayWorld(world.colliders, o, d, l);
      if (wd < l - 0.2) { const t = Math.max(4, wd - 1.5); bot.pos.set(o.x + d.x * t, 0, o.z + d.z * t); pin.x = bot.pos.x; pin.z = bot.pos.z; } }   // si algo tapa al bot en este momento, se le acerca por la línea de tiro hasta que quede a la vista
    bot.pos.set(pin.x, 0, pin.z); bot.vel.set(0, 0, 0); aim(); const ya = T.player.yaw, pa = T.player.pitch, hpB = bot.hp; T.step(1 / 60);
    if (process.env.DBG && T.player.ammo < prevAmmo) { const o = eye(), dv = { x: -Math.sin(ya) * Math.cos(pa), y: Math.sin(pa), z: -Math.cos(ya) * Math.cos(pa) }; const tb = { x: bot.pos.x - o.x, y: bot.pos.y + 1.1 - o.y, z: bot.pos.z - o.z }, along = tb.x * dv.x + tb.y * dv.y + tb.z * dv.z, miss = Math.hypot(tb.x - dv.x * along, tb.y - dv.y * along, tb.z - dv.z * along); const wd = S.rayWorld(world.colliders, o, dv, 400);
      shots.push({ f, miss: +miss.toFixed(2), along: +along.toFixed(1), mundoA: +wd.toFixed(1), botMovio: +Math.hypot(bot.pos.x - pin.x, bot.pos.z - pin.z).toFixed(2), botHp: hpB + '→' + bot.hp, cerca: T.fighters.filter(x => x !== T.player && x !== bot && x.alive).map(x => { const q = { x: x.pos.x - o.x, y: x.pos.y + 1 - o.y, z: x.pos.z - o.z }, al = q.x * dv.x + q.y * dv.y + q.z * dv.z; return [x.team, +al.toFixed(1), +Math.hypot(q.x - dv.x * al, q.y - dv.y * al, q.z - dv.z * al).toFixed(2)]; }).filter(c => c[1] > 0 && c[2] < 1.5) }); }
    prevAmmo = T.player.ammo;
  }
  if (process.env.DBG) globalThis.__shots = shots;
  T.setMouse(false); await sleep(50);
  if (process.env.DBG && bot.hp >= hp0) console.log('DBG DISPAROS', JSON.stringify(globalThis.__shots));
  if (process.env.DBG) console.log('DBG disparo', JSON.stringify({ botAlive: bot.alive, botHp: bot.hp, hp0, jugAlive: T.player.alive, jugHp: T.player.hp, estado: T.state, arma: T.player.wi, munic: T.player.ammo, recarga: T.player.reload, kills: T.player.kills, aim: +T.player.aim.toFixed(2), slot: T.slot, dist: +Math.hypot(bot.pos.x - T.player.pos.x, bot.pos.z - T.player.pos.z).toFixed(1) }));
  sawNum = $$('#dmgnums span').length > 0; sawFeed = $$('#feed li svg').length > 0; sawKill = /ELIMINASTE/.test($('#killcard').textContent);
  ok(bot.hp < hp0 || T.player.kills > kills0, 'el francotirador hiere/elimina al bot');
  ok(T.player.kills > kills0, 'eliminación conseguida (' + T.player.kills + ' baja)');
  ok(sawNum, 'aparecen números de daño flotantes');
  ok(sawKill && /\+\d+/.test($('#killcard').textContent), 'tarjeta de eliminación: «' + $('#killcard').textContent.replace(/\s+/g, ' ') + '»');
  ok(sawFeed && $('#feed li.mine'), 'el registro de bajas muestra el icono del arma');
  T.slow();
  ok(T.player.points >= 100 && $('#myPts').textContent === String(T.player.points), 'los puntos suben en la barra superior (' + $('#myPts').textContent + ')');
  ok($$('#hpStreak i.on').length === 1, 'la racha se enciende (1 baja)');

  // --- Vida baja, recarga ---
  T.setMouseR(false); for (let f = 0; f < 30; f++) T.step(1 / 60);
  ok($('#scope').hidden === true, 'soltar el clic derecho cierra la mira');
  T.player.hp = 20; T.fast();
  if (process.env.DBG) console.log('DBG vida', JSON.stringify({ jugAlive: T.player.alive, estado: T.state, hp: T.player.hp, lowhp: $('#lowhp').className, hpbar: $('#hpbar').className }));
  ok($('#lowhp').classList.contains('on') && $('#hpbar').className === 'low', 'vida baja: pantalla roja y barra en rojo');
  T.player.ammo = 0; T.fast();
  ok(/PULSA R/.test($('#reloadmsg').textContent) && $('#mag').classList.contains('low'), 'sin munición: aviso «PULSA R»');
  ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors));
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
