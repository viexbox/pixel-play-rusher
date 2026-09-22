'use strict';
/* Controles y sensaciones de combate (cliente real en jsdom, modo entrenamiento sin servidor):
   cambio de arma/cuchillo con la rueda, teclas 1/2/Q, cuchillo en mano, HUD nuevo, sacudida de pantalla y efectos de daño. */
const path = require('path'); const fs = require('fs'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://127.0.0.1/' }).window;
w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
w.fetch = () => Promise.reject(new Error('sin servidor'));
w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
w.eval(shared); const errors = []; w.addEventListener('error', e => errors.push(e.message));
const i = client.lastIndexOf('})();');
w.eval(client.slice(0, i) + `window.__T = { get state() { return state; }, get player() { return player; }, get slot() { return slot; }, get slotK() { return slotK; }, get trauma() { return trauma; }, set trauma(v) { trauma = v; },
  gun, knifeG, camera, cfg, step, updateHudFast, keysRef: keys, adaptQuality, set jumpQueued(v) { jumpQueued = v; }, get jumpQueued() { return jumpQueued; }, get ratio() { return curRatio; }, get shadowsOff() { return qShadowsOff; }, setMouse(v) { mouseL = v; }, setMouseR(v) { mouseR = v; }, keys, addShake, playerHurtFx, hitmark, get fallback() { return fallback; }, set fallback(v) { fallback = v; }, el };\n` + client.slice(i));
const T = w.__T, $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
const wheel = dy => { const e = new w.WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }); w.document.dispatchEvent(e); return e; };
const key = code => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code, bubbles: true }));
const frames = (n, dt = 0.05) => { for (let k = 0; k < n; k++) T.step(dt); };

(async () => {
  try {
    await sleep(300);
    /* ---------- Ajustes y textos ---------- */
    ok(T.cfg.wheelSwap === true && T.cfg.shake === 100 && $('#wheelSwap').checked && $('#shake').value === '100', 'ajustes: la rueda viene activada y la sacudida al 100 %');
    $('#shake').value = '40'; $('#shake').dispatchEvent(new w.Event('input', { bubbles: true })); ok(T.cfg.shake === 40 && /40/.test($('#shakeO').textContent), 'el deslizador de sacudida se guarda'); $('#shake').value = '100'; $('#shake').dispatchEvent(new w.Event('input', { bubbles: true }));
    ok(/Rueda/.test($('#tab-controls').textContent) && /Q/.test($('#tab-controls').textContent), 'la pestaña Controles explica la rueda y las teclas 1, 2 y Q');
    ok($('#renameBtn') && $('#renameBtn').hidden && $('#renameRow').hidden, 'el botón «Cambiar nombre» solo aparece con una cuenta online');

    /* ---------- Empezar una partida (AK) ---------- */
    $$('#classes .cls')[8].click(); $('#play').click(); ok(await until(() => T.state === 'playing'), 'empieza el entrenamiento con la AK');
    Object.defineProperty(w.document, 'pointerLockElement', { configurable: true, get: () => w.document.querySelector('canvas') }); w.document.dispatchEvent(new w.Event('pointerlockchange'));
    await until(() => T.player && T.player.alive); frames(4);
    ok(T.slot === 0 && $('#slot0').classList.contains('on') && !$('#slot1').classList.contains('on') && !$('#ammobox').classList.contains('knife'), 'HUD: la ranura 1 (arma) está activa al empezar');
    ok(/AK/i.test($('#wname').textContent) && $('#wicon svg') && $('#slot1 svg') && /CUCHILLO/i.test($('#slot1').textContent), 'HUD: se ve el arma actual con su icono y la ranura del cuchillo');

    /* ---------- Rueda del ratón ---------- */
    let e = wheel(100); ok(T.slot === 1 && e.defaultPrevented, 'una vuelta de rueda cambia al cuchillo AL INSTANTE (sin esperas) y no hace scroll de la página');
    ok($('#slot1').classList.contains('on') && !$('#slot0').classList.contains('on') && $('#ammobox').classList.contains('knife'), 'el HUD marca el cuchillo como ranura activa y atenúa la munición');
    frames(4, 0.05); ok(T.slotK === 1 && T.gun.visible === false && T.knifeG.visible === true, 'la transición termina en ~0,11 s: arma guardada, cuchillo en mano');
    wheel(100); ok(T.slot === 1, 'un segundo giro casi a la vez se ignora (evita rebotes)');
    await sleep(200); wheel(-100); ok(T.slot === 0, 'pasado el enfriamiento (0,14 s), la rueda hacia el otro lado vuelve al arma'); frames(4); ok(T.gun.visible === true && T.knifeG.visible === false, 'y el arma vuelve a verse');
    await sleep(200); for (let k = 0; k < 10; k++) wheel(3); ok(T.slot === 1, 'un trackpad (muchos giros pequeños que suman) cambia una sola vez'); await sleep(200);
    for (let k = 0; k < 10; k++) wheel(100); ok(T.slot === 0, 'un giro rapidísimo de 10 pasos cuenta como un único cambio'); await sleep(200);
    T.cfg.wheelSwap = false; e = wheel(100); ok(T.slot === 0 && e.defaultPrevented, 'con la opción desactivada la rueda no cambia de arma (y sigue sin hacer scroll)'); T.cfg.wheelSwap = true; await sleep(200);
    Object.defineProperty(w.document, 'pointerLockElement', { configurable: true, get: () => null }); T.fallback = true; w.document.dispatchEvent(new w.Event('pointerlockchange'));   // sin bloqueo de puntero (modo de reserva)
    e = wheel(100); ok(T.slot === 1 && T.state === 'playing', 'también funciona en el modo sin bloqueo de puntero (navegadores o iframes que no lo permiten)'); await sleep(200); wheel(100); await sleep(200);
    Object.defineProperty(w.document, 'pointerLockElement', { configurable: true, get: () => w.document.querySelector('canvas') }); w.document.dispatchEvent(new w.Event('pointerlockchange')); ok(T.slot === 0 && T.state === 'playing', 'y se vuelve al arma con el puntero bloqueado otra vez');

    /* ---------- Teclas ---------- */
    T.player.reload = 0.8; key('Digit2'); ok(T.slot === 1 && T.player.reload === 0, 'la tecla 2 saca el cuchillo y cancela una recarga en curso');
    key('Digit1'); ok(T.slot === 0, 'la tecla 1 vuelve al arma'); key('KeyQ'); ok(T.slot === 1, 'Q saca el cuchillo'); key('KeyQ'); ok(T.slot === 1, 'una segunda Q ya no vuelve al arma: golpea, con el cuchillo todavía en la mano'); key('KeyE'); ok(T.slot === 0, 'y E es ahora el camino de vuelta al arma principal');

    /* ---------- Cuchillo en mano ---------- */
    key('Digit2'); frames(4); T.player.fireCd = 0; const ammo0 = T.player.ammo; T.setMouseR(true); frames(6); ok(T.player.aim < 0.01, 'con el cuchillo en mano no se puede apuntar');
    key('KeyR'); ok(T.player.reload === 0, 'ni recargar'); T.player.meleeCd = 0; T.setMouse(true); frames(1);
    ok(T.player.ammo === ammo0 && T.player.meleeCd > 0.5 && T.player.meleeCd <= 0.55, 'el clic golpea en vez de disparar: no gasta munición y el golpe tiene 0,55 s de enfriamiento (el servidor pide ≥ 0,48 s)');
    frames(3, 0.05); ok(T.knifeG.visible, 'durante el golpe el cuchillo se ve moverse'); T.setMouse(false); T.setMouseR(false); frames(10);
    key('Digit1'); frames(4); T.player.fireCd = 0; T.setMouse(true); frames(2); T.setMouse(false); ok(T.player.ammo < ammo0, 'y con el arma en mano el clic vuelve a disparar');

    /* ---------- Muerte: se suelta el cuchillo ---------- */
    key('Digit2'); ok(T.slot === 1, 'con el cuchillo…'); T.player.alive = false; frames(2); ok(T.slot === 0 && T.slotK === 0, '…al morir se vuelve al arma principal');
    T.player.alive = true; T.player.hp = 100;

    /* ---------- HUD de vida ---------- */
    frames(2); T.player.hp = 100; frames(2); T.updateHudFast(); ok(!$('#hpbox').classList.contains('low') && $('#hpnum').textContent === '100' && $('#hpbar').style.width === '100%', 'HUD de vida: 100 y barra llena');
    T.player.hp = 20; frames(2); T.updateHudFast(); { const hp = T.player.hp; ok(hp < 30 && $('#hpnum').textContent === String(Math.ceil(hp)) && $('#hpbar').style.width === hp + '%' && $('#hpghost').style.width === hp + '%' && $('#hpbox').classList.contains('low') && $('#hpbar').className === 'low', 'con ~20 de vida (regenera un poco al avanzar): el número y la barra coinciden, hay rastro de daño y la tarjeta entra en alerta roja'); }
    T.player.hp = 100;

    /* ---------- Sacudida y daño ---------- */
    T.trauma = 0; T.cfg.shake = 0; T.addShake(1); ok(T.trauma === 0, 'con la sacudida al 0 % no hay sacudida (accesibilidad)');
    T.cfg.shake = 100; T.addShake(0.3); ok(T.trauma > 0.29 && T.trauma < 0.31, 'con el 100 % un golpe suma trauma'); T.trauma = 0;
    T.cfg.shake = 50; T.addShake(0.4); ok(Math.abs(T.trauma - 0.2) < 0.001, 'al 50 % la sacudida es la mitad'); T.trauma = 0; T.cfg.shake = 100;
    T.playerHurtFx(60, T.player.pos.x + 5, T.player.pos.z); ok(T.trauma > 0.5 && $('#dmgvig').classList.contains('on') && +$('#dmgvig').style.getPropertyValue('--k') > 0.9 && $('#dmgdir').classList.contains('on'), 'recibir 60 de daño: sacudida fuerte, viñeta roja casi al máximo y aro de dirección del atacante');
    T.trauma = 0; T.playerHurtFx(5, null, null); ok(T.trauma < 0.3 && +$('#dmgvig').style.getPropertyValue('--k') < 0.6, 'un rasguño de 5: sacudida y viñeta suaves (proporcional al daño)');
    T.trauma = 0.8; T.step(0.05); ok(Math.abs(T.camera.rotation.z) > 0 || Math.abs(T.camera.rotation.x - T.player.pitch) > 0, 'la cámara se mueve mientras hay sacudida');
    frames(40, 0.05); ok(T.trauma === 0 && Math.abs(T.camera.rotation.z) < 1e-9, 'y se apaga sola en ~1 s (la cámara vuelve a quedar quieta)');

    /* ---------- Marcador de impacto ---------- */
    T.hitmark('hit'); ok($('#hitmark').className === 'on', 'impacto normal: marcador blanco');
    T.hitmark('head'); ok($('#hitmark').className === 'on head', 'a la cabeza: marcador dorado');
    T.hitmark('kill'); ok($('#hitmark').className === 'on kill', 'baja: marcador rojo con aro'); await sleep(350); ok($('#hitmark').className === '', 'y desaparece solo');
    /* ---------- Movimiento estilo Krunker ---------- */
    { const P = T.player, K = T.keysRef; const speedNow = () => Math.hypot(P.vel.x, P.vel.z);
      P.slide = 0; P.vel.x = P.vel.z = 0; P.hop = 1; P.yaw = 0; frames(6); K.KeyW = true; frames(5, 0.02);
      ok(speedNow() > S.CONST.WALK * 0.95, 'aceleración casi instantánea: en 0,1 s ya va a ' + speedNow().toFixed(1) + ' m/s (de ' + S.CONST.WALK + ')');
      ok(S.CONST.WALK >= 7 && S.CONST.SPRINT > S.CONST.WALK && S.CONST.GRAV >= 26, 'velocidades y gravedad al estilo rápido (andar ' + S.CONST.WALK + ', correr ' + S.CONST.SPRINT + ', gravedad ' + S.CONST.GRAV + ')');
      K.KeyW = false; frames(20);
      /* buffer de salto: pulsar Espacio un poco antes de tocar el suelo salta al aterrizar */
      P.pos.y = 0.4; P.vel.y = -4; P.onGround = false; T.jumpQueued = true; frames(1, 0.016); T.jumpQueued = false; let up = false; for (let k = 0; k < 12 && !up; k++) { frames(1, 0.016); up = P.vel.y > 3; }
      ok(up, 'buffer de salto: si pulsas Espacio justo antes de aterrizar, saltas en cuanto tocas el suelo'); frames(60, 0.02);   // [CONTROLES] con el salto de pulsación única, se simula UNA pulsación real (jumpQueued), no mantener la tecla
      /* coyote: saltar justo al salir de un borde */
      frames(3); P.onGround = true; frames(1, 0.016); P.onGround = false; P.vel.y = 0; T.jumpQueued = true; frames(1, 0.016); T.jumpQueued = false;
      ok(P.vel.y > 5, 'coyote: se puede saltar hasta 0,08 s después de salir de un borde'); frames(60, 0.02);
      /* bunny hop: mantener Espacio + avanzar encadena saltos y acumula impulso, con tope */
      /* [CONTROLES] con el salto de pulsación única ya NO vale mantener Espacio: se simula un jugador que la pulsa de nuevo cada vez que aterriza (encadenar saltos a ritmo, no mantenerla) */
      P.hop = 1; K.KeyW = true; let maxHop = 1, maxSp = 0, jumps = 0, was = false, wasGround = false; for (let k = 0; k < 400; k++) { if (P.onGround && !wasGround) T.jumpQueued = true; wasGround = P.onGround; T.step(0.02); T.jumpQueued = false; if (P.vel.y > 5 && !was) jumps++; was = P.vel.y > 5; maxHop = Math.max(maxHop, P.hop || 1); maxSp = Math.max(maxSp, speedNow()); }
      K.KeyW = false; ok(jumps >= 4, 'pulsar Espacio cada vez que aterrizas encadena saltos (bunny hop): ' + jumps + ' saltos seguidos en 8 s');
      ok(maxHop > 1.1 && maxHop <= 1.25 + 1e-9, 'y suma impulso hasta un tope de ×1,25 (llegó a ×' + maxHop.toFixed(2) + ')');
      ok(maxSp <= 13, 'sin pasar nunca de 13 m/s, el límite que tolera el servidor (máx. ' + maxSp.toFixed(1) + ' m/s)');
      frames(80, 0.02); ok((P.hop || 1) < maxHop, 'el impulso se pierde poco a poco al pisar suelo'); }
    /* recargas más cortas */
    ok(S.WEAPONS.every(w => w.reload <= 3.4 * 0.8 + 0.001) && S.WEAPONS.find(w => w.id === 'asalto').reload === 1.36, 'las recargas son un 20 % más cortas (Asalto 1,7 s → 1,36 s)');

    /* ---------- Calidad adaptativa ---------- */
    ok(T.ratio === 1, 'calidad: parte de la resolución del dispositivo (×1 en esta prueba)');
    for (let k = 0; k < 40; k++) T.adaptQuality(0.02); ok(T.ratio === 1 && !T.shadowsOff, 'a 50 FPS no se toca nada');
    for (let k = 0; k < 40; k++) T.adaptQuality(0.05); ok(T.ratio === 1, 'una sola medición baja (2 s a 20 FPS) no basta: se evitan reacciones a un tirón puntual');
    for (let k = 0; k < 40; k++) T.adaptQuality(0.05); ok(T.ratio === 0.75, 'dos mediciones seguidas por debajo de 40 FPS bajan la resolución un escalón (×1 → ×0,75)');
    for (let k = 0; k < 80; k++) T.adaptQuality(0.05); ok(T.shadowsOff === true && T.cfg.shadows === true, 'sin más resolución que bajar, apaga las sombras, sin tocar el ajuste guardado');
    T.cfg.autoQuality = false; for (let k = 0; k < 100; k++) T.adaptQuality(0.05); T.cfg.autoQuality = true;
    ok(errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(errors));
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
