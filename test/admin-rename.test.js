'use strict';
/* Cambiar el nombre de la cuenta de administrador (ADMIN_USER) y su contraseña con variables de entorno, también desde el acceso del propio juego. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom'); const { pathToFileURL } = require('url');
const PORT = 3179, ORIGIN = 'http://127.0.0.1:' + PORT, D = '/tmp/ppr_rename', USER = 'login-admin', PW = 'CVrcE8XA6K4vMzuJ';
fs.rmSync(D, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(20); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
function start(env) { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: D }, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; }); procs.push(p); return p; }
async function stop(p) { p.kill('SIGTERM'); await sleep(700); }
let n = 40; const ip = () => '10.7.7.' + (n++);
async function call(method, p, body, token) { const r = await fetch(ORIGIN + '/api/admin' + p, { method, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; }
const join = extra => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } }); ws.on('open', () => ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, map: 0, c: 0 }, extra)))); ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'welcome' || m.t === 'err') { res(m); ws.close(); } }); ws.on('error', () => res(null)); });

(async () => {
  try {
    ok(PW.length >= 12 && /[A-Za-z]/.test(PW) && /\d/.test(PW) && PW !== 'Viexbox-2026', 'la contraseña generada cumple la regla (12+ caracteres, letras y números)');
    /* Primero, como en tu Render: la cuenta ya existe con el nombre por defecto */
    let s = start({}); await sleep(1300);
    ok((await call('POST', '/login', { user: 'Viexbox', password: 'Viexbox-2026' })).j.mustChange === true, 'punto de partida: cuenta Viexbox con la contraseña inicial');
    await stop(s);
    /* Ahora se define ADMIN_USER y ADMIN_PASSWORD y se reinicia (redespliegue) */
    s = start({ ADMIN_USER: USER, ADMIN_PASSWORD: PW }); await sleep(1300);
    const st = await fetch(ORIGIN + '/api/status').then(r => r.json()); ok(st.admin === USER, 'el estado público indica el nombre de la cuenta de administrador («' + st.admin + '»)');
    let r = await call('POST', '/login', { user: USER, password: PW }); const T = r.j && r.j.token;
    ok(r.status === 200 && r.j.user === USER && r.j.mustChange === false, 'entra con login-admin y la contraseña nueva, sin pedir cambiarla (la eliges tú con la variable)');
    ok((await call('POST', '/login', { user: 'Viexbox', password: 'Viexbox-2026' })).status === 401 && (await call('POST', '/login', { user: 'Viexbox', password: PW })).status === 401, 'Viexbox deja de ser administrador y la contraseña inicial ya no vale');
    ok((await call('GET', '/overview', null, T)).status === 200, 'y el panel funciona con esa sesión');
    const g = await join({ adm: T }); ok(g.t === 'welcome' && g.rl === 'admin' && g.n === USER, 'en las partidas online sale como administrador con el nombre «' + USER + '»');
    ok((await join({ n: USER })).t === 'err' && (await join({ n: 'Login_Admin_2' })).t === 'err' && (await join({ n: 'xLoginAdminx' })).t === 'err', 'el nombre y sus variantes quedan reservados');
    ok((await join({ n: 'Viexbox' })).t === 'welcome', 'y «Viexbox» vuelve a ser un nombre libre');
    await stop(s); s = start({ ADMIN_USER: USER, ADMIN_PASSWORD: PW }); await sleep(1300);
    ok((await call('POST', '/login', { user: USER, password: PW })).status === 200 && !/CUENTA DE ADMINISTRADOR CREADA/.test(s.out), 'al redesplegar con las mismas variables sigue todo igual');

    /* Acceso desde el propio juego */
    globalThis.__PPR_MANUAL_BOOT__ = true;
    const imp = rel => import(pathToFileURL(path.join(__dirname, '..', 'public', 'src', rel)).href);
    const M = await imp('main.js'), AD = await imp('api/adminService.js');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
    const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
    const calls = []; const spy = (u, o) => { calls.push(String(u)); return fetch(u, Object.assign({}, o, { headers: Object.assign({ 'X-Forwarded-For': ip() }, o && o.headers) })); };
    const w = new JSDOM(html, { pretendToBeVisual: true, url: ORIGIN + '/' }).window; const st1 = { local: mem(), session: mem() };
    M.bootstrap({ document: w.document, storages: st1, config: { auth: true }, admin: AD.createAdminClient({ fetchFn: spy, base: ORIGIN + '/' }) });
    const $ = q => w.document.querySelector(q), type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); }, submit = f => f.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    type($('#loginForm [name=identifier]'), 'Pepe'); type($('#loginForm [name=password]'), 'lo-que-sea-123'); calls.length = 0; submit($('#loginForm')); await sleep(400);
    ok(!calls.some(c => /api\/admin\/login/.test(c)), 'un usuario normal no envía su contraseña al servidor de administración');
    type($('#loginForm [name=identifier]'), USER); type($('#loginForm [name=password]'), 'no-es-la-clave'); submit($('#loginForm'));
    ok(await until(() => /incorrectos/.test($('#loginForm [data-msg]').textContent)) && !st1.local.getItem('ppr.admtoken'), 'con una contraseña equivocada no entra');
    type($('#loginForm [name=identifier]'), 'Login-Admin'); type($('#loginForm [name=password]'), PW); submit($('#loginForm'));
    ok(await until(() => $('#auth').hidden), 'desde el acceso del juego: «login-admin» y la contraseña generada entran (sin distinguir mayúsculas en el usuario)');
    const tok = st1.local.getItem('ppr.admtoken'); const gj = await join({ adm: tok }); ok(/^[0-9a-f]{64}$/.test(tok) && gj.rl === 'admin' && gj.n === USER, 'y el juego guarda el acceso: en línea sale como administrador');
    /* Panel */
    const panelHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, ''), js = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
    const pw = new JSDOM(panelHtml, { runScripts: 'outside-only', url: ORIGIN + '/admin' }).window; pw.fetch = (u, o) => fetch(new URL(u, ORIGIN + '/').href, Object.assign({}, o, { headers: Object.assign({ 'X-Forwarded-For': ip() }, o && o.headers) })); pw.WebSocket = function () { this.close = () => {}; }; pw.eval(js);
    ok(await until(() => pw.document.querySelector('#lUser').value === USER), 'el panel /admin ya propone «login-admin» como usuario');
    pw.document.querySelector('#lPass').value = PW; pw.document.querySelector('#loginForm').dispatchEvent(new pw.Event('submit', { cancelable: true }));
    ok(await until(() => !pw.document.querySelector('#app').hidden) && pw.document.querySelector('#whoName').textContent === USER, 'y entra al panel con esa contraseña');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
