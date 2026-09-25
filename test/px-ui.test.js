'use strict';
const SH = require('../public/shared.js');
/* Cuentas online, PX, tienda y voto de mapa DENTRO del juego (pantalla de acceso + lobby + partida reales en jsdom, contra el servidor real). */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const http = require('http'); const crypto = require('crypto'); const { pathToFileURL } = require('url'); const { JSDOM } = require('jsdom');
const PORT = 3184, STRIPE = 4246, ORIGIN = 'http://127.0.0.1:' + PORT, DIR = '/tmp/ppr_pxui', APASS = 'PxUi-Admin-2026xy', WH = 'whsec_ui';
fs.rmSync(DIR, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let n = 30; const xip = () => '10.9.2.' + (n++);
const wf = (u, o) => fetch(new URL(u, ORIGIN + '/').href, Object.assign({}, o, { headers: Object.assign({ 'X-Forwarded-For': xip() }, o && o.headers) }));
const api = async (m, p, b, tk) => { const r = await wf('/api' + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
const stripeCalls = []; const stripe = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { stripeCalls.push(Object.fromEntries(new URLSearchParams(b))); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'cs_ui_' + stripeCalls.length, url: 'https://checkout.stripe.test/pay/cs_ui_' + stripeCalls.length })); }); });
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
const three = fs.readFileSync(path.join(PUB, 'vendor', 'three.min.js'), 'utf8'), shared = fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8'), client = fs.readFileSync(path.join(PUB, 'client.js'), 'utf8');
let M, AD, AC;
function boot(seed) {
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: ORIGIN + '/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = wf; w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared); const nav = []; w.__pprNav = u => nav.push(u);
  const i = client.lastIndexOf('})();'); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  w.eval(client.slice(0, i) + 'window.__T = { get state() { return state; }, get remote() { return remote; }, get curMap() { return curMap; }, syncRemote, showTab, krTotal, net, cfg, step };\n' + client.slice(i));
  if (seed) for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, v);   // simula recargar la página con lo que ya había guardado
  const stores2 = { local: w.localStorage, session: w.sessionStorage };
  const app = M.bootstrap({ document: w.document, storages: stores2, config: { auth: true }, admin: AD.createAdminClient({ fetchFn: wf, base: ORIGIN + '/' }), accounts: AC.createAccountClient({ fetchFn: wf, base: ORIGIN + '/', storage: stores2.local }) });
  return { w, app, T: w.__T, nav, errors, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] };
}
const type = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const submit = (w, f) => f.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
const sign = raw => { const ts = Math.floor(Date.now() / 1000); return 't=' + ts + ',v1=' + crypto.createHmac('sha256', WH).update(ts + '.' + raw).digest('hex'); };
async function register(U, name, email, pw) { U.$('#tabRegister').click(); U.$('#registerForm [name=terms]').checked = true;   // hay que aceptar los términos
   type(U.w, U.$('#registerForm [name=username]'), name); type(U.w, U.$('#registerForm [name=email]'), email); type(U.w, U.$('#registerForm [name=password]'), pw); type(U.w, U.$('#registerForm [name=password2]'), pw); submit(U.w, U.$('#registerForm')); }
(async () => {
  await new Promise(r => stripe.listen(STRIPE, '127.0.0.1', r));
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: DIR, ADMIN_PASSWORD: APASS, MATCH_TIME: 120, KILL_LIMIT: 99, BREAK_SECS: 3, TRUST_PROXY: 1, STRIPE_SECRET_KEY: 'sk_test_ui', STRIPE_WEBHOOK_SECRET: WH, STRIPE_API_BASE: 'http://127.0.0.1:' + STRIPE, PUBLIC_URL: 'https://mijuego.example' }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } });
  await sleep(1400);
  globalThis.__PPR_MANUAL_BOOT__ = true; const imp = rel => import(pathToFileURL(path.join(PUB, 'src', rel)).href);
  M = await imp('main.js'); AD = await imp('api/adminService.js'); AC = await imp('api/accountService.js');
  try {
    const AT = (await api('POST', '/admin/login', { user: 'Viexbox', password: APASS })).j.token; const adm = (m, p, b) => api(m, '/admin' + p, b, AT);
    /* ---------- Registro dentro del juego ---------- */
    let A = boot(); await sleep(300); ok(!A.$('#auth').hidden, 'sin sesión: pantalla de acceso');
    await register(A, 'Zoe_7', 'zoe@ejemplo.com', 'Clave-Segura-77');
    ok(await until(() => A.$('#auth').hidden), 'el registro contra el servidor entra en el lobby');
    const tok = A.w.localStorage.getItem('ppr.acct'); ok(!!tok && tok.length === 64, 'la sesión de la cuenta se guarda en el navegador');
    ok(A.$('#name').value === 'Zoe_7' && A.$('#name').readOnly && /Cuenta online · Zoe_7/.test(A.$('#sessName').textContent), 'el nombre de la cuenta queda fijo en el lobby («Cuenta online · Zoe_7»)');
    ok(await until(() => A.T.remote && A.T.remote.username === 'Zoe_7') && A.$('#krTotal').textContent === '0', 'el juego carga el perfil del servidor: 0 PX');
    ok(/solo cuentan en cuentas locales/.test(A.$('#daily').textContent), 'los desafíos diarios avisan de que solo valen en cuentas locales');
    /* nombre único: otro navegador no puede registrar el mismo nombre */
    let B = boot(); await sleep(300); await register(B, 'zoe-7', 'otra@ejemplo.com', 'Clave-Segura-77');
    ok(await until(() => /ya está en uso/.test(B.$('#registerForm [data-err=username]').textContent)) && !B.$('#auth').hidden && !B.w.localStorage.getItem('ppr.acct'), 'otro jugador no puede registrar «zoe-7» (ya está en uso): error bajo el campo y sin entrar');
    /* ---------- PX: saldo, colores y rangos del servidor ---------- */
    await adm('POST', '/px', { username: 'Zoe_7', delta: 500, reason: 'prueba UI' }); await A.T.syncRemote();
    ok(A.$('#krTotal').textContent === '500' && A.T.krTotal() === 500, 'el saldo del panel de admin llega al juego (500 PX)');
    A.T.showTab('maps'); const locked = A.$$('#swColors .cs.locked'); ok(locked.length === 6 && /150 PX/.test(locked[0].dataset.cost), 'los colores bloqueados muestran su precio en PX');
    locked[0].click(); ok(await until(() => A.$('#krTotal').textContent === '350'), 'comprar un color lo cobra en el servidor (500 → 350 PX)');
    const me = (await api('GET', '/me', null, tok)).j.profile; ok(me.px === 350 && me.unlocked.includes(4) && /Desbloqueado/.test(A.$('#custMsg').textContent), 'y el servidor guarda el color desbloqueado');
    A.T.showTab('ranks'); const claim = A.$('[data-claim="0"]'); ok(!!claim, 'el rango Bronce se puede reclamar'); claim.click();
    ok(await until(() => A.$('#krTotal').textContent === '400') && !A.$('[data-claim="0"]'), 'reclamarlo suma sus 50 PX (350 → 400) y ya no se puede repetir');
    /* ---------- Tienda ---------- */
    A.T.showTab('store'); ok(await until(() => A.$$('#storeBox .pack').length === 4), 'la pestaña Tienda muestra los 4 paquetes de PX');
    const packs = A.$$('#storeBox .pack'); ok(/0,99/.test(packs[0].textContent) && /500/.test(packs[0].textContent) && A.$$('#storeBox [data-pack]').every(b => !b.disabled), 'con sesión y pagos activados, los botones de compra están activos (500 PX · 0,99 €)');
    A.$('#storeBox [data-pack="px1300"]').click(); ok(await until(() => A.nav.length === 1), 'comprar abre la página de pago de Stripe');
    ok(/checkout\.stripe\.test\/pay\/cs_ui_1/.test(A.nav[0]) && stripeCalls[0]['line_items[0][price_data][unit_amount]'] === '199' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(stripeCalls[0].client_reference_id)   /* la cuenta se identifica por su UUID */, 'el importe (199 céntimos) lo fija el servidor');
    ok(A.T.krTotal() === 400, 'sin pagar, el saldo no cambia');
    const evt = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_ui_1', payment_status: 'paid', amount_total: 199, currency: 'eur' } } });
    const wr = await wf('/api/store/webhook', { method: 'POST', headers: { 'Stripe-Signature': sign(evt), 'Content-Type': 'application/json' }, body: evt }); ok(wr.status === 200, 'Stripe avisa del pago con firma válida');
    await A.T.syncRemote(); ok(A.T.krTotal() === 1700 && A.$('#krTotal').textContent === '1700', 'al volver al juego aparecen los 1.300 PX (saldo 1.700)');
    /* ---------- Partida online con cuenta + voto de mapa ---------- */
    ok(await until(() => !A.$('#playOnline').disabled), 'el cliente detecta el servidor'); A.$('#playOnline').click(); A.$('#eqPlay').click(); ok(await until(() => A.T.state === 'playing' && A.T.net.id != null), 'la cuenta entra a jugar online');
    const pl = (await adm('GET', '/players')).j.players.find(p => p.name === 'Zoe_7'); ok(!!pl, 'y en la sala aparece con el nombre de la cuenta (Zoe_7)');
    await adm('POST', '/rooms/action', { id: pl.room, action: 'end' });
    ok(await until(() => !A.$('#end').hidden && A.$('#endMaps').hidden), 'al acabar la ronda aparece la pantalla final y, con un solo mapa, no hay selector para votar');
    const cur = A.T.curMap;
    ok(await until(() => A.T.curMap === 0 && cur === 0, 3000), 'el jugador sigue en Nexus Outpost, el único mapa');
    ok(await until(() => A.$('#end').hidden, 8000), 'al acabar el descanso la nueva ronda empieza en el mismo mapa');
    ok(A.T.curMap === 0 && A.$('#end').hidden, 'y la ronda nueva empieza: la pantalla final se cierra y el mapa sigue siendo Nexus Outpost');
    /* ---------- Cerrar sesión ---------- */
    A.$('#logoutBtn').click(); await sleep(400);
    ok(!A.w.localStorage.getItem('ppr.acct') && A.T.remote === null && (await api('GET', '/me', null, tok)).status === 401, 'cerrar sesión borra el token del navegador y lo invalida en el servidor');
    ok(A.errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(A.errors));
    /* ---------- Invitado: la tienda pide cuenta ---------- */
    const G = boot(); await sleep(300); G.$('#guestBtn').click(); await sleep(300); G.T.showTab('store');
    ok(await until(() => G.$$('#storeBox .pack').length === 4) && /cuenta online/i.test(G.$('#storeBox .note.warn').textContent) && G.$$('#storeBox [data-pack]').every(b => b.disabled), 'un invitado ve los paquetes pero necesita una cuenta online para comprar (botones desactivados)');
    /* ---------- Reentrar ---------- */
    const R = boot(); await sleep(300); type(R.w, R.$('#loginForm [name=identifier]'), 'ZOE_7'); type(R.w, R.$('#loginForm [name=password]'), 'Clave-Segura-77'); submit(R.w, R.$('#loginForm'));
    ok(await until(() => R.$('#auth').hidden && R.T.remote && R.T.remote.px === 1700), 'volver a entrar con la contraseña recupera la cuenta y su saldo (1.700 PX)');
    const saved = {}; for (let i = 0; i < R.w.localStorage.length; i++) { const k = R.w.localStorage.key(i); saved[k] = R.w.localStorage.getItem(k); }
    const R2 = boot(saved); await sleep(300); ok((!R2.$('#auth') || R2.$('#auth').hidden) && R2.$('#name').value === 'Zoe_7' && await until(() => R2.T.remote && R2.T.remote.px === 1700), 'y la sesión se recuerda al recargar la página (sin volver a pedir contraseña)');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  srv.kill(); stripe.close(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
