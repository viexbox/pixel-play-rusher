'use strict';
/* Cuenta de administrador por defecto: contraseña inicial visible, cambio obligatorio en el primer acceso (desde el propio juego y desde /admin)
   y, mientras no se cambie, ningún poder de administrador. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom'); const { pathToFileURL } = require('url');
const PORT = 3175, PORT2 = 3176, ORIGIN = 'http://127.0.0.1:' + PORT, D1 = '/tmp/ppr_default_a', D2 = '/tmp/ppr_default_b', DEF = 'Viexbox-2026', NEW1 = 'Mi-Clave-Definitiva-2026', NEW2 = 'Otra-Clave-Nueva-9988';
for (const d of [D1, D2]) fs.rmSync(d, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(20); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
function start(port, dir) { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir }), stdio: ['ignore', 'pipe', 'pipe'] }); p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; }); procs.push(p); return p; }
let n = 30; const ip = () => '10.6.6.' + (n++);
async function call(port, method, p, body, token, xip) { const r = await fetch('http://127.0.0.1:' + port + '/api/admin' + p, { method, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': xip || ip() }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; }
function joinGame(port, extra) { return new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: { 'X-Forwarded-For': ip() } }); ws.on('open', () => ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, n: 'Viexbox', map: 0, c: 0 }, extra)))); ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'welcome' || m.t === 'err') { res(m); ws.close(); } }); ws.on('error', () => res(null)); }); }

(async () => {
  const s1 = start(PORT, D1); await sleep(1300);
  try {
    /* ---------- Servidor: cuenta inicial y cambio obligatorio ---------- */
    ok(/Contraseña inicial:\s+Viexbox-2026/.test(s1.out) && /Usuario:\s+Viexbox/.test(s1.out), 'al arrancar, la consola muestra el usuario (Viexbox) y la contraseña inicial (' + DEF + ')');
    ok(!fs.readFileSync(path.join(D1, 'admin.json'), 'utf8').includes(DEF) && JSON.parse(fs.readFileSync(path.join(D1, 'admin.json'), 'utf8')).mustChange === true, 'aun así en disco solo hay hash, con la marca «debe cambiarla»');
    let r = await call(PORT, 'POST', '/login', { user: 'Viexbox', password: DEF }); const T = r.j.token;
    ok(r.status === 200 && r.j.mustChange === true && T, 'con la contraseña inicial se entra, pero marcado como «debe cambiarla»');
    for (const [m, p] of [['GET', '/overview'], ['GET', '/players'], ['POST', '/announce'], ['GET', '/backup'], ['GET', '/audit'], ['POST', '/kickall']]) { r = await call(PORT, m, p, m === 'POST' ? { text: 'x' } : null, T); if (r.status !== 403 || !r.j.mustChange) ok(false, 'bloqueado ' + p + ' → ' + r.status); }
    ok((await call(PORT, 'GET', '/overview', null, T)).status === 403, 'mientras no se cambie: el panel entero devuelve 403 (solo se puede cambiar la contraseña)');
    r = await call(PORT, 'GET', '/me', null, T); ok(r.status === 200 && r.j.mustChange === true, 'la sesión inicial solo puede consultar quién es…');
    const g1 = await joinGame(PORT, { adm: T }); ok(g1.t === 'err' && /reservado/.test(g1.m), '…y no vale para entrar al juego como administrador (el nombre sigue reservado)');
    const wsRes = await new Promise(res => { const w = new WebSocket('ws://127.0.0.1:' + PORT + '/admin-ws', { headers: { 'X-Forwarded-For': ip() } }); let got = false; w.on('message', () => { got = true; }); w.on('open', () => w.send(JSON.stringify({ t: 'auth', token: T }))); w.on('close', () => res(!got)); setTimeout(() => res(false), 3000); });
    ok(wsRes, 'ni para el chat en directo del panel');
    r = await call(PORT, 'POST', '/password', { current: 'mala', next: NEW1 }, T); ok(r.status === 401, 'cambiar la contraseña exige la inicial');
    r = await call(PORT, 'POST', '/password', { current: DEF, next: DEF }, T); ok(r.status === 400 && /distinta/.test(r.j.error), 'la nueva no puede ser la inicial');
    r = await call(PORT, 'POST', '/password', { current: DEF, next: 'corta1' }, T); ok(r.status === 400, 'ni ser débil');
    r = await call(PORT, 'POST', '/password', { current: DEF, next: NEW1 }, T); ok(r.status === 200, 'con una definitiva válida se cambia');
    ok((await call(PORT, 'GET', '/overview', null, T)).status === 200, 'y esa misma sesión ya tiene acceso de administrador');
    const g2 = await joinGame(PORT, { adm: T }); ok(g2.t === 'welcome' && g2.rl === 'admin' && g2.n === 'Viexbox', 'y entra al juego como administrador (nombre Viexbox)');
    ok((await call(PORT, 'POST', '/login', { user: 'Viexbox', password: DEF })).status === 401 && (await call(PORT, 'POST', '/login', { user: 'Viexbox', password: NEW1 })).j.mustChange === false, 'la contraseña inicial deja de funcionar y la nueva entra sin volver a pedir el cambio');
    ok(JSON.parse(fs.readFileSync(path.join(D1, 'admin.json'), 'utf8')).mustChange === false, 'la marca «debe cambiarla» desaparece');
    s1.kill('SIGTERM'); await sleep(500); const s1b = start(PORT, D1); await sleep(1300);
    ok(!/CUENTA DE ADMINISTRADOR CREADA/.test(s1b.out) && (await call(PORT, 'POST', '/login', { user: 'Viexbox', password: DEF })).status === 401 && (await call(PORT, 'POST', '/login', { user: 'Viexbox', password: NEW1 })).status === 200, 'tras reiniciar no vuelve a crearse la cuenta inicial: sigue valiendo la contraseña elegida');

    /* ---------- Desde el propio juego (pantalla de acceso real) ---------- */
    globalThis.__PPR_MANUAL_BOOT__ = true;
    const imp = rel => import(pathToFileURL(path.join(__dirname, '..', 'public', 'src', rel)).href);
    const M = await imp('main.js'), AD = await imp('api/adminService.js');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
    const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
    const calls = []; const spy = (u, o) => { calls.push(u); return fetch(u, Object.assign({}, o, { headers: Object.assign({ 'X-Forwarded-For': ip() }, o && o.headers) })); };
    const boot = (stores, port) => { const w = new JSDOM(html, { pretendToBeVisual: true, url: 'http://127.0.0.1:' + port + '/' }).window; const app = M.bootstrap({ document: w.document, storages: stores, config: { auth: true }, admin: AD.createAdminClient({ fetchFn: spy, base: 'http://127.0.0.1:' + port + '/' }) }); return { w, app, $: s => w.document.querySelector(s) }; };
    const type = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const submit = (w, f) => f.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));

    const s2 = start(PORT2, D2); await sleep(1300); const st = { local: mem(), session: mem() };
    let U = boot(st, PORT2);
    ok(!U.$('#auth').hidden, 'sin sesión: aparece la pantalla de acceso del juego');
    type(U.w, U.$('#loginForm [name=identifier]'), 'Pepe'); type(U.w, U.$('#loginForm [name=password]'), 'lo-que-sea-123'); calls.length = 0; submit(U.w, U.$('#loginForm')); await sleep(300);
    ok(!calls.some(c => /api\/admin\/login/.test(String(c))) && /incorrectos/.test(U.$('#loginForm [data-msg]').textContent), 'un usuario normal nunca envía su contraseña al servidor de administración (solo se comprueba localmente)');
    type(U.w, U.$('#loginForm [name=identifier]'), 'Viexbox'); type(U.w, U.$('#loginForm [name=password]'), 'no-es-la-clave'); submit(U.w, U.$('#loginForm'));
    ok(await until(() => /incorrectos/.test(U.$('#loginForm [data-msg]').textContent)) && !st.local.getItem('ppr.admtoken'), 'Viexbox con una contraseña equivocada: «Usuario o contraseña incorrectos» y ningún acceso');
    type(U.w, U.$('#loginForm [name=identifier]'), 'Viexbox'); type(U.w, U.$('#loginForm [name=password]'), DEF); submit(U.w, U.$('#loginForm'));
    ok(await until(() => !U.$('#adminForm').hidden), 'Viexbox + contraseña inicial: el juego pide elegir la contraseña definitiva');
    ok(U.$('#loginForm').hidden && U.$('#registerForm').hidden && U.$('.auth-tabs').hidden && !U.$('#auth').hidden && !st.local.getItem('ppr.admtoken') && U.$('#menu').hasAttribute('inert'), 'sin cambiarla no se entra (formulario aparte, sin pestañas y sin sesión)');
    type(U.w, U.$('#adminForm [name=next]'), 'corta1'); type(U.w, U.$('#adminForm [name=next2]'), 'corta1'); submit(U.w, U.$('#adminForm')); await sleep(100);
    ok(/12 caracteres/.test(U.$('#adminForm [data-err=next]').textContent), 'una contraseña débil se rechaza allí mismo');
    type(U.w, U.$('#adminForm [name=next]'), NEW1); type(U.w, U.$('#adminForm [name=next2]'), NEW1 + 'x'); submit(U.w, U.$('#adminForm')); await sleep(100);
    ok(/no coinciden/.test(U.$('#adminForm [data-err=next2]').textContent), 'y si no coinciden');
    type(U.w, U.$('#adminForm [name=next]'), DEF); type(U.w, U.$('#adminForm [name=next2]'), DEF); submit(U.w, U.$('#adminForm'));
    ok(await until(() => /distinta/.test(U.$('#adminForm [data-msg]').textContent)), 'el servidor rechaza reutilizar la inicial y el juego muestra el motivo');
    type(U.w, U.$('#adminForm [name=next]'), NEW1); type(U.w, U.$('#adminForm [name=next2]'), NEW1); submit(U.w, U.$('#adminForm'));
    ok(await until(() => U.$('#auth').hidden), 'con una definitiva válida se entra al juego');
    ok(U.$('#name').value === 'Viexbox' && U.$('#name').readOnly && /Cuenta · Viexbox/.test(U.$('#sessName').textContent), 'como «Viexbox» (nombre fijo de la cuenta)');
    const tok = st.local.getItem('ppr.admtoken'); ok(/^[0-9a-f]{64}$/.test(tok) && (await call(PORT2, 'GET', '/overview', null, tok)).status === 200, 'y el juego guarda el token de administrador: el servidor lo acepta');
    const g3 = await joinGame(PORT2, { adm: tok }); ok(g3.t === 'welcome' && g3.rl === 'admin', 'con ese token entra a las partidas online con nombre dorado y tic (rol de administrador)');
    const U2 = boot(st, PORT2); ok((!U2.$('#auth') || U2.$('#auth').hidden) && U2.$('#name').value === 'Viexbox', 'al recargar la página sigue dentro (sesión del administrador)');
    U2.$('#logoutBtn').click(); ok(!st.local.getItem('ppr.admtoken') && !U2.$('#auth').hidden, 'cerrar sesión borra también el token de administrador');
    type(U2.w, U2.$('#loginForm [name=identifier]'), 'viexbox'); type(U2.w, U2.$('#loginForm [name=password]'), NEW1); submit(U2.w, U2.$('#loginForm'));
    ok(await until(() => U2.$('#auth').hidden) && U2.$('#adminForm').hidden && !!st.local.getItem('ppr.admtoken'), 'volver a entrar con la contraseña nueva es directo (ya no pide cambiarla)');

    /* ---------- Cancelar el cambio ---------- */
    s1b.kill('SIGTERM'); await sleep(600); fs.rmSync(D1, { recursive: true, force: true }); // primero se apaga (al cerrar guarda sus datos) y luego se borran
    const s3 = start(PORT, D1); await sleep(1300); const st3 = { local: mem(), session: mem() }; const V = boot(st3, PORT);
    type(V.w, V.$('#loginForm [name=identifier]'), 'Viexbox'); type(V.w, V.$('#loginForm [name=password]'), DEF); submit(V.w, V.$('#loginForm')); await until(() => !V.$('#adminForm').hidden);
    V.$('#adminCancel').click(); ok(V.$('#adminForm').hidden && !V.$('#loginForm').hidden && !V.$('.auth-tabs').hidden && !st3.local.getItem('ppr.admtoken') && !V.$('#auth').hidden, 'cancelar vuelve a la pantalla de acceso sin entrar');
    ok((await call(PORT, 'POST', '/login', { user: 'Viexbox', password: DEF })).j.mustChange === true, 'y la contraseña inicial sigue pendiente de cambiar');

    /* ---------- Panel /admin ---------- */
    const panelHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, ''), js = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
    const pw = new JSDOM(panelHtml, { runScripts: 'outside-only', url: ORIGIN + '/admin' }).window; pw.fetch = (u, o) => fetch(new URL(u, ORIGIN + '/').href, Object.assign({}, o, { headers: Object.assign({ 'X-Forwarded-For': ip() }, o && o.headers) })); pw.WebSocket = function () { this.close = () => {}; }; pw.eval(js);
    const P = s => pw.document.querySelector(s); P('#lPass').value = DEF; P('#loginForm').dispatchEvent(new pw.Event('submit', { cancelable: true }));
    ok(await until(() => !P('#modal').hidden && /contraseña definitiva/.test(P('#mTitle').textContent)) && !P('#loginView').hidden === true && P('#app').hidden, 'en /admin también: con la contraseña inicial aparece la ventana para elegir la definitiva y no se entra al panel');
    const inputs = pw.document.querySelectorAll('#mBody input'); inputs[0].value = NEW2; inputs[1].value = NEW2; P('#modalForm').dispatchEvent(new pw.Event('submit', { cancelable: true }));
    ok(await until(() => !P('#app').hidden), 'al elegirla, entra al panel'); ok((await call(PORT, 'POST', '/login', { user: 'Viexbox', password: NEW2 })).j.mustChange === false, 'y queda como contraseña definitiva');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
