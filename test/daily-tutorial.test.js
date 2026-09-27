'use strict';
/* [DIARIO] Premio por entrar cada día (racha de 7 días, se reinicia si faltas) y [TUTORIAL] primera partida guiada (cliente real en jsdom). */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const day = off => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);

(async () => {
  try {
    console.log('=== Premio diario ===');
    const { createAccounts } = require('../server/accounts.js'); const dir = fs.mkdtempSync('/tmp/ppr-daily-');
    const stub = { banFor: () => null, banMessage: () => '', isReserved: () => false, audit() {}, addRoutes() {}, smtpOn: () => false, sendMail: async () => false, setVerifiedProvider() {} };
    const A = createAccounts({ dataDir: dir, log() {}, S, admin: stub, env: Object.assign({}, process.env, { REQUIRE_TERMS: '0' }) });
    const tk = (await A.register({ username: 'Dia_1', email: 'd1@e.com', password: 'Clave-Segura-77' }, '10.2.0.1')).token, u = A.find('Dia_1');
    const call = (method, p) => new Promise(res => { const req = { method, headers: { authorization: 'Bearer ' + tk }, on(ev, f) { if (ev === 'data') {} if (ev === 'end') setImmediate(f); return this; } }; const resp = { code: 0, writeHead(c) { this.code = c; }, end(b) { res({ status: this.code, j: b ? JSON.parse(b) : {} }); } }; A.handleHttp(req, resp, new URL('http://x' + p), '10.2.0.1'); });
    let me = (await call('GET', '/api/me')).j.profile;
    ok(me.daily && !me.daily.claimed && me.daily.day === 1 && me.daily.px === 50 && me.daily.rewards.length === 7, 'una cuenta nueva ve el premio del día 1 (50 PX) y los 7 días de la racha');
    const px0 = u.px; let r = (await call('POST', '/api/me/daily'));
    ok(r.status === 200 && r.j.px === 50 && u.px === px0 + 50 && r.j.daily.claimed && r.j.daily.streak === 1, 'recogerlo da 50 PX y marca la racha en 1');
    r = await call('POST', '/api/me/daily'); ok(r.status === 409 && u.px === px0 + 50, 'el mismo día no se puede recoger dos veces');
    u.daily = { last: day(-1), streak: 1 }; r = await call('POST', '/api/me/daily');
    ok(r.status === 200 && r.j.px === 75 && r.j.daily.streak === 2, 'al día siguiente: día 2 de la racha (75 PX)');
    u.daily = { last: day(-1), streak: 6 }; r = await call('POST', '/api/me/daily'); ok(r.j.px === 400 && r.j.daily.day === 7, 'el día 7 es el premio gordo (400 PX)');
    u.daily = { last: day(-1), streak: 7 }; r = await call('POST', '/api/me/daily'); ok(r.j.px === 50 && r.j.daily.streak === 8 && r.j.daily.day === 1, 'después del día 7 la racha sigue y los premios vuelven a empezar');
    u.daily = { last: day(-3), streak: 5 }; me = (await call('GET', '/api/me')).j.profile; r = await call('POST', '/api/me/daily');
    ok(me.daily.day === 1 && r.j.px === 50 && r.j.daily.streak === 1, 'si faltas un día, la racha vuelve a 1');

    console.log('\n=== Tutorial (cliente) ===');
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
    c = c.slice(0, i) + 'window.__T = { TUT, cfg, get player() { return player; }, playerShoot, setSlot, get slot() { return slot; } };\n' + c.slice(i);
    w.eval(c); await sleep(200);
    const T = w.__T, $ = s => w.document.querySelector(s), box = () => $('#tutBox'), txt = () => (box() && !box().hidden ? box().textContent : '');
    $('#play').click(); await sleep(50); const eq = $('#eqPlay'); if (eq) eq.click(); await sleep(300);
    ok(/paso 1 de 6/.test(txt()) && /W A S D/.test(txt()), 'en la primera partida sale el tutorial: paso 1, moverse (' + txt() + ')');
    T.player.pos.x += 6; await sleep(200);
    ok(/paso 2 de 6/.test(txt()) && /ratón/.test(txt()), 'al moverse pasa al paso 2: mirar');
    for (let k = 0; k < 10; k++) { T.player.yaw += 0.2; await sleep(40); }
    ok(/paso 3 de 6/.test(txt()) && /Dispara/.test(txt()), 'al mirar alrededor pasa al paso 3: disparar');
    for (let k = 0; k < 3; k++) { T.player.fireCd = 0; T.player.reload = 0; T.playerShoot(); }
    await sleep(200); ok(/paso 4 de 6/.test(txt()) && /Salta/.test(txt()), 'tras 3 disparos, paso 4: saltar');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyT' })); await sleep(50);
    ok(!txt() && T.cfg.tutDone === true, 'con T se salta el tutorial y queda guardado que ya se vio');
    ok(!!$('#tutAgain'), 'en Ajustes hay un botón para repetirlo');
    ok(!errors.length, 'sin errores en el cliente' + (errors.length ? ': ' + errors[0] : ''));
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
