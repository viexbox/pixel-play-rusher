'use strict';
/* Correo del administrador y «contraseña olvidada»: enlace de un solo uso por correo (SMTP simulado), caducidad, límites y pantalla del panel. */
const { spawn, spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs'); const net = require('net'); const { JSDOM } = require('jsdom');
const MAIL = 'alejandrolopezgarcia395@gmail.com', PASS = 'Clave-Original-2026x', NEW1 = 'Clave-Nueva-Segura-77', NEW2 = 'Otra-Clave-Distinta-88';
const P1 = 3172, P2 = 3173, P3 = 3174, SMTP = 2599, D1 = '/tmp/ppr_reset_a', D2 = '/tmp/ppr_reset_b', D3 = '/tmp/ppr_reset_c';
for (const d of [D1, D2, D3]) fs.rmSync(d, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
function start(port, dir, env) { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir }, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; }); procs.push(p); return p; }
/* SMTP falso: guarda destinatario y cuerpo de cada correo recibido */
const inbox = [];
const smtp = net.createServer(sock => {
  let buf = '', data = false, cur = { to: [], body: '' }; sock.write('220 falso ESMTP\r\n');
  sock.on('data', d => {
    buf += d.toString();
    for (;;) {
      if (data) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; cur.body = buf.slice(0, i); buf = buf.slice(i + 5); data = false; inbox.push(cur); cur = { to: [], body: '' }; sock.write('250 OK\r\n'); continue; }
      const i = buf.indexOf('\r\n'); if (i < 0) return; const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^EHLO|^HELO/i.test(line)) sock.write('250-falso\r\n250 8BITMIME\r\n'); else if (/^MAIL FROM/i.test(line)) sock.write('250 OK\r\n');
      else if (/^RCPT TO:/i.test(line)) { cur.to.push(/<([^>]+)>/.exec(line)[1]); sock.write('250 OK\r\n'); } else if (/^DATA/i.test(line)) { data = true; sock.write('354 sigue\r\n'); }
      else if (/^QUIT/i.test(line)) { sock.write('221 adios\r\n'); sock.end(); } else sock.write('250 OK\r\n');
    }
  });
  sock.on('error', () => {});
});
const decode = b => b.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
const tokenOf = mail => (/reset=([0-9a-f]{64})/.exec(decode(mail.body)) || /([0-9a-f]{64})/.exec(decode(mail.body)) || [])[1];
const url = p => 'http://127.0.0.1:' + p;
async function call(port, method, p, body, token, ip) { const r = await fetch(url(port) + '/api/admin' + p, { method, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip || '10.0.0.1' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; }
let ipn = 20; const ip = () => '10.4.4.' + (ipn++);

(async () => {
  await new Promise(r => smtp.listen(SMTP, '127.0.0.1', r));
  const s1 = start(P1, D1, { ADMIN_PASSWORD: PASS, ADMIN_EMAIL: MAIL.toUpperCase(), SMTP_HOST: '127.0.0.1', SMTP_PORT: SMTP, SMTP_INSECURE: '1', PUBLIC_URL: 'https://mijuego.example/', ADMIN_RESET_TTL_MS: 3000, ADMIN_FORGOT_GLOBAL: 200 });
  await sleep(1300);
  try {
    /* ---------- El correo es la cuenta del administrador ---------- */
    let r = await call(P1, 'POST', '/login', { user: MAIL, password: PASS }, null, ip()); const T0 = r.j && r.j.token;
    ok(r.status === 200 && r.j.user === 'Viexbox', 'el administrador puede entrar con su correo (' + MAIL + ') además de con «Viexbox»');
    r = await call(P1, 'POST', '/login', { user: 'otro@correo.com', password: PASS }, null, ip()); ok(r.status === 401, 'otro correo no entra aunque acierte la contraseña');
    r = await call(P1, 'GET', '/me', null, T0); ok(r.j.email === 'al***@gmail.com' && r.j.smtp === true, 'el panel muestra el correo enmascarado (' + r.j.email + ') y que el envío está configurado');
    ok(JSON.parse(fs.readFileSync(path.join(D1, 'admin.json'), 'utf8')).email === MAIL, 'el correo se guarda normalizado en minúsculas');

    /* ---------- Solicitar el enlace ---------- */
    const ipA = ip(); const bad = await call(P1, 'POST', '/forgot', { email: 'intruso@ejemplo.com' }, null, ipA); await sleep(900);
    ok(bad.status === 200 && bad.j.ok && inbox.length === 0, 'con un correo que no es el del administrador: misma respuesta y no se envía nada');
    const good = await call(P1, 'POST', '/forgot', { email: '  ' + MAIL.toUpperCase() + ' ' }, null, ipA);
    ok(good.status === 200 && good.j.message === bad.j.message, 'con el correo correcto la respuesta es idéntica (no revela si existe)');
    ok(await until(() => inbox.length === 1), 'llega un correo al SMTP'); const mail1 = inbox[0]; const tok1 = tokenOf(mail1);
    ok(mail1.to[0] === MAIL && /^[0-9a-f]{64}$/.test(tok1) && decode(mail1.body).includes('https://mijuego.example/admin#reset=' + tok1), 'va a tu correo y trae el enlace (con PUBLIC_URL) y el código');
    ok(!/Host:|localhost:3172/.test(decode(mail1.body)), 'el enlace se construye con PUBLIC_URL, no con la cabecera Host (evita enlaces envenenados)');
    ok(!(await call(P1, 'GET', '/logs', null, T0)).j.logs.join('\n').includes(tok1), 'el código no aparece en el registro del panel');

    /* ---------- Usar el enlace ---------- */
    r = await call(P1, 'POST', '/reset', { token: 'a'.repeat(64), password: NEW1 }, null, ip()); ok(r.status === 400 && /no es válido|caducado/.test(r.j.error), 'un código falso se rechaza');
    r = await call(P1, 'POST', '/reset', { token: tok1, password: 'corta1' }, null, ip()); ok(r.status === 400 && /12 caracteres/.test(r.j.error), 'contraseña débil rechazada…');
    r = await call(P1, 'POST', '/reset', { token: tok1, password: NEW1 }, null, ip()); ok(r.status === 200, '…y el enlace sigue valiendo tras ese error: se cambia la contraseña con uno válido');
    ok((await call(P1, 'POST', '/login', { user: 'Viexbox', password: PASS }, null, ip())).status === 401 && (await call(P1, 'POST', '/login', { user: MAIL, password: NEW1 }, null, ip())).status === 200, 'la contraseña anterior deja de valer y la nueva entra');
    ok((await call(P1, 'GET', '/me', null, T0)).status === 401, 'las sesiones abiertas se cierran');
    r = await call(P1, 'POST', '/reset', { token: tok1, password: NEW2 }, null, ip()); ok(r.status === 400, 'el enlace es de un solo uso');
    ok(await until(() => inbox.length === 2 && /ha cambiado|restablece/.test(decode(inbox[1].body))), 'se envía un aviso de que la contraseña ha cambiado');
    ok(!fs.readFileSync(path.join(D1, 'admin.json'), 'utf8').includes(NEW1) && !s1.out.includes(NEW1), 'la contraseña nueva no queda escrita en claro en ningún sitio');

    /* ---------- Caducidad y límites ---------- */
    const ipB = ip(); await call(P1, 'POST', '/forgot', { email: MAIL }, null, ipB); await until(() => inbox.length === 3); const tok2 = tokenOf(inbox[2]); await sleep(3400);
    r = await call(P1, 'POST', '/reset', { token: tok2, password: NEW2 }, null, ip()); ok(r.status === 400, 'el enlace caduca (aquí a los 3 s; por defecto a los 30 min)');
    await call(P1, 'POST', '/forgot', { email: MAIL }, null, ip()); await until(() => inbox.length === 4); const tok3 = tokenOf(inbox[3]);
    await call(P1, 'POST', '/forgot', { email: MAIL }, null, ip()); await until(() => inbox.length === 5); const tok4 = tokenOf(inbox[4]);
    ok((await call(P1, 'POST', '/reset', { token: tok3, password: NEW2 }, null, ip())).status === 400 && (await call(P1, 'POST', '/reset', { token: tok4, password: NEW2 }, null, ip())).status === 200, 'pedir otro enlace anula el anterior: solo el último vale');
    const ipC = ip(); for (let i = 0; i < 3; i++) await call(P1, 'POST', '/forgot', { email: 'x@y.com' }, null, ipC);
    r = await call(P1, 'POST', '/forgot', { email: 'x@y.com' }, null, ipC); ok(r.status === 429, 'límite: máximo 3 solicitudes por hora desde la misma IP');
    const ipD = ip(); let last; for (let i = 0; i < 9; i++) last = await call(P1, 'POST', '/reset', { token: 'b'.repeat(64), password: NEW1 }, null, ipD); ok(last.status === 429, 'límite: tras 8 códigos falsos la IP queda bloqueada un rato');

    /* ---------- Cambiar el correo desde el panel ---------- */
    const T1 = (await call(P1, 'POST', '/login', { user: 'Viexbox', password: NEW2 }, null, ip())).j.token;
    r = await call(P1, 'POST', '/email', { email: 'nuevo@ejemplo.com', current: 'mal' }, T1); ok(r.status === 401, 'cambiar el correo exige la contraseña actual');
    r = await call(P1, 'POST', '/email', { email: 'esto-no-es-un-correo', current: NEW2 }, T1); ok(r.status === 400, 'y un correo válido');
    r = await call(P1, 'POST', '/email', { email: 'Nuevo@Ejemplo.com', current: NEW2 }, T1); ok(r.status === 200 && r.j.email === 'Nu***@ejemplo.com'.replace('Nu', 'nu'), 'correo cambiado (' + r.j.email + ')');
    const n0 = inbox.length; await call(P1, 'POST', '/forgot', { email: MAIL }, null, ip()); await sleep(700); ok(inbox.length === n0, 'el correo antiguo ya no recibe enlaces');
    await call(P1, 'POST', '/forgot', { email: 'nuevo@ejemplo.com' }, null, ip()); ok(await until(() => inbox.length === n0 + 1) && inbox[n0].to[0] === 'nuevo@ejemplo.com', 'el nuevo correo sí');
    ok((await call(P1, 'GET', '/audit', null, T1)).j.audit.map(a => a.action).some(a => a === 'contraseña-restablecida') && (await call(P1, 'GET', '/audit', null, T1)).j.audit.some(a => a.action === 'restablecer-correo-desconocido'), 'la auditoría anota los restablecimientos y los intentos con correos desconocidos');

    /* ---------- Pantalla del panel (jsdom) ---------- */
    await call(P1, 'POST', '/email', { email: MAIL, current: NEW2 }, T1); const nUi = inbox.length; await call(P1, 'POST', '/forgot', { email: MAIL }, null, ip()); await until(() => inbox.length === nUi + 1); const tokUi = tokenOf(inbox[nUi]);
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, ''), js = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
    const open = hash => { const w = new JSDOM(html, { runScripts: 'outside-only', url: url(P1) + '/admin' + hash }).window; w.fetch = (u, o) => fetch(new URL(u, url(P1) + '/').href, Object.assign({}, o, { headers: Object.assign({ 'X-Forwarded-For': ip() }, o && o.headers) })); w.WebSocket = function () { this.close = () => {}; }; w.eval(js); return { w, $: s => w.document.querySelector(s) }; };
    let U = open('');
    ok(!U.$('#loginForm').hidden && U.$('#forgotForm').hidden && U.$('#forgotLink').textContent.includes('olvidado'), 'el acceso muestra «¿Has olvidado la contraseña?»');
    U.$('#forgotLink').click(); ok(!U.$('#forgotForm').hidden && U.$('#loginForm').hidden, 'al pulsarlo aparece el formulario de recuperación');
    U.$('#fEmail').value = MAIL; U.$('#forgotForm').dispatchEvent(new U.w.Event('submit', { cancelable: true })); ok(await until(() => /recibirás un enlace/.test(U.$('#forgotMsg').textContent)) && U.$('#forgotMsg').classList.contains('okmsg'), 'envía la petición y muestra el mensaje neutro');
    ok(await until(() => inbox.length === nUi + 2), 'y el correo sale');
    const tokUi2 = tokenOf(inbox[nUi + 1]); // el último correo anula al anterior
    U = open('#reset=' + tokUi2); ok(!U.$('#resetForm').hidden && U.$('#rCode').value === tokUi2 && U.w.location.hash === '', 'al abrir el enlace del correo se muestra el formulario con el código ya puesto (y se borra de la barra de direcciones)');
    U.$('#rPass').value = NEW1; U.$('#rPass2').value = 'no-coincide-123'; U.$('#resetForm').dispatchEvent(new U.w.Event('submit', { cancelable: true })); ok(/no coinciden/.test(U.$('#resetMsg').textContent), 'avisa si las contraseñas no coinciden');
    U.$('#rPass2').value = NEW1; U.$('#resetForm').dispatchEvent(new U.w.Event('submit', { cancelable: true }));
    ok(await until(() => !U.$('#loginForm').hidden && /Contraseña cambiada/.test(U.$('#loginErr').textContent)), 'con las contraseñas iguales la cambia y vuelve al acceso con un mensaje de éxito');
    ok((await call(P1, 'POST', '/login', { user: MAIL, password: NEW1 }, null, ip())).status === 200, 'y la nueva contraseña funciona');

    /* ---------- Sin SMTP: el enlace sale por la consola del servidor ---------- */
    const s2 = start(P2, D2, { ADMIN_PASSWORD: PASS, ADMIN_EMAIL: MAIL }); await sleep(1300);
    r = await call(P2, 'POST', '/forgot', { email: MAIL }, null, ip()); ok(/consola/.test(r.j.message), 'sin SMTP el propio mensaje avisa de que el enlace saldrá en la consola');
    ok(await until(() => /RESTABLECER CONTRASEÑA/.test(s2.out))); const code = (/Código: ([0-9a-f]{64})/.exec(s2.out) || [])[1];
    const TT = (await call(P2, 'POST', '/login', { user: 'Viexbox', password: PASS }, null, ip())).j.token;
    ok(!!code && !(await call(P2, 'GET', '/logs', null, TT)).j.logs.join('\n').includes(code), 'el código está en la consola del servidor, pero no en el registro visible desde el panel');
    ok((await call(P2, 'POST', '/reset', { token: code, password: NEW1 }, null, ip())).status === 200 && (await call(P2, 'POST', '/login', { user: 'Viexbox', password: NEW1 }, null, ip())).status === 200, 'y con ese código se restablece igualmente');

    /* ---------- Script de línea de comandos: --email ---------- */
    const cli = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'admin-password.js'), '--data', D3, '--email', MAIL, '--password', 'Clave-CLI-Larga-2026'], { encoding: 'utf8' });
    ok(cli.status === 0 && JSON.parse(fs.readFileSync(path.join(D3, 'admin.json'), 'utf8')).email === MAIL, 'scripts/admin-password.js --email guarda el correo y la contraseña');
    const bad2 = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'admin-password.js'), '--data', D3, '--email', 'no-es-correo'], { encoding: 'utf8' }); ok(bad2.status !== 0, 'y rechaza un correo mal escrito');
    start(P3, D3, {}); await sleep(1300); ok((await call(P3, 'POST', '/login', { user: MAIL, password: 'Clave-CLI-Larga-2026' }, null, ip())).status === 200, 'un servidor nuevo con esos datos deja entrar con el correo');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } smtp.close();
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
