'use strict';
/* Cuenta segura: correo vinculado y verificado, cambio de correo, recuperación y cambio de contraseña, eliminación con plazo, términos, páginas legales y limpieza en cascada. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const net = require('net');
const S = require('../public/shared.js');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test', APASS = 'Sec-Admin-2026xyz', SMTP = 2601;
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill('SIGKILL'); } catch (e) { /* nada */ } });
let ipn = 10; const ip = () => '10.8.1.' + (ipn++);
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
const codeOf = m => (/^\s{4}(\d{6})\s*$/m.exec(decode(m.body)) || [])[1];
const subj = m => { const s = /^Subject: (.+)$/m.exec(m.body); return s ? decode(s[1]) : ''; };
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
const mailsTo = a => inbox.filter(m => m.to.includes(a));
async function boot(port, dir, env, dbUrl) {
  fs.rmSync(dir, { recursive: true, force: true });
  const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, DATABASE_URL: dbUrl || '', MAX_CONN_PER_IP: 60, ACCOUNTS_REG_MAX: 60, TRADE_LOCK_HOURS: 0, REQUIRE_TERMS: '1' }, env), stdio: 'ignore' }); procs.push(p); await sleep(dbUrl ? 2800 : 1700);
  const B = 'http://127.0.0.1:' + port;
  const call = async (m, pth, b, tk) => { const r = await fetch(B + pth, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null), text: null }; };
  const AD = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  return { p, B, call, AD, adm: (m, pth, b) => call(m, '/api/admin' + pth, b, AD), stop: () => { p.kill('SIGKILL'); } };
}
const PW = 'Clave-Segura-77', PW2 = 'Otra-Clave-Nueva-88';
const reg = (X, u, e, terms) => X.call('POST', '/api/auth/register', Object.assign({ username: u, email: e, password: PW }, terms === false ? {} : { terms: true }));
const login = (X, id, pw) => X.call('POST', '/api/auth/login', { identifier: id, password: pw || PW });

(async () => {
  await new Promise(r => smtp.listen(SMTP, '127.0.0.1', r));
  const MAILENV = { SMTP_HOST: '127.0.0.1', SMTP_PORT: SMTP, SMTP_INSECURE: '1', MAIL_GAP_MS: 1200, MAIL_CODE_TTL_MS: 4000, ACCOUNT_DELETE_DAYS: 0.00003, PURGE_CHECK_MS: 400 };
  try {
    console.log('=== Registro, términos y verificación ===');
    let X = await boot(3390, '/tmp/ppr_sec_a', MAILENV);
    let r = await reg(X, 'Ana_1', 'ana@ejemplo.com', false); ok(r.status === 400 && /Términos/.test(r.j.error), 'sin aceptar los términos y la privacidad no se crea la cuenta');
    r = await reg(X, 'Ana_1', 'ana@ejemplo.com'); ok(r.status === 200 && !!r.j.token, 'aceptándolos se crea la cuenta'); let TA = r.j.token;
    ok(r.j.profile.emailVerified === false && r.j.profile.email === 'a**@ejemplo.com' && !JSON.stringify(r.j.profile).includes('ana@ejemplo.com'), 'el perfil enseña el correo enmascarado (a**@ejemplo.com) y que no está verificado; nunca el correo entero');
    ok(await until(() => mailsTo('ana@ejemplo.com').length === 1), 'al registrarse llega solo un correo con el código de verificación'); const m1 = mailsTo('ana@ejemplo.com')[0], c1 = codeOf(m1);
    ok(/^\d{6}$/.test(c1) && /verificaci/i.test(subj(m1) + decode(m1.body)), 'con un código de 6 cifras (' + c1 + ')');
    ok((await X.call('POST', '/api/auth/verify/send', {}, TA)).status === 429, 'pedir otro código enseguida se frena (un envío cada poco)');
    let bad = null; for (let i = 0; i < 4; i++) bad = await X.call('POST', '/api/auth/verify/confirm', { code: '00000' + i }, TA); ok(bad.status === 400 && /Te quedan 1 intento/.test(bad.j.error), 'un código incorrecto avisa de los intentos que quedan («' + bad.j.error + '»)');
    bad = await X.call('POST', '/api/auth/verify/confirm', { code: '999999' }, TA); ok(/nuevo/.test(bad.j.error), 'al quinto fallo el código se invalida');
    ok((await X.call('POST', '/api/auth/verify/confirm', { code: c1 }, TA)).status === 400, 'y ya no sirve ni siquiera el correcto');
    await sleep(1400); ok((await X.call('POST', '/api/auth/verify/send', {}, TA)).status === 200 && await until(() => mailsTo('ana@ejemplo.com').length === 2), 'pasada la espera se puede pedir otro código y llega');
    const c2 = codeOf(mailsTo('ana@ejemplo.com')[1]); await sleep(4300);
    ok((await X.call('POST', '/api/auth/verify/confirm', { code: c2 }, TA)).status === 400, 'un código caducado (4 s en la prueba, 15 min normalmente) no vale');
    await sleep(1300); await X.call('POST', '/api/auth/verify/send', {}, TA); await until(() => mailsTo('ana@ejemplo.com').length === 3); const c3 = codeOf(mailsTo('ana@ejemplo.com')[2]);
    r = await X.call('POST', '/api/auth/verify/confirm', { code: c3 }, TA); ok(r.status === 200 && r.j.verified, 'con el código bueno y a tiempo, el correo queda verificado');
    ok((await X.call('GET', '/api/me', null, TA)).j.profile.emailVerified === true && (await X.call('POST', '/api/auth/verify/send', {}, TA)).status === 400, 'consta en el perfil y no se puede volver a verificar');
    ok((await X.call('POST', '/api/auth/verify/confirm', { code: c3 }, null)).status === 401, 'sin sesión no se verifica nada');

    console.log('\n=== Cambiar de correo ===');
    await reg(X, 'Beto_2', 'beto@ejemplo.com'); 
    r = await X.call('POST', '/api/me/email', { email: 'nuevo@ejemplo.com', password: 'mala-Clave-1' }, TA); ok(r.status === 403, 'cambiar el correo exige la contraseña');
    r = await X.call('POST', '/api/me/email', { email: 'beto@ejemplo.com', password: PW }, TA); ok(r.status === 409, 'no se puede usar un correo que ya tiene otra cuenta');
    r = await X.call('POST', '/api/me/email', { email: 'nuevo@ejemplo.com', password: PW }, TA); ok(r.status === 200 && r.j.sentTo === 'n****@ejemplo.com', 'con la contraseña se pide el cambio: el código va al correo NUEVO');
    ok(await until(() => mailsTo('nuevo@ejemplo.com').length === 1) && mailsTo('ana@ejemplo.com').length === 3, 'y no al antiguo');
    ok((await X.call('GET', '/api/me', null, TA)).j.profile.email === 'a**@ejemplo.com', 'mientras no se confirma, el correo sigue siendo el de antes');
    r = await X.call('POST', '/api/me/email/confirm', { code: '123456' }, TA); ok(r.status === 400, 'un código erróneo no cambia nada');
    r = await X.call('POST', '/api/me/email/confirm', { code: codeOf(mailsTo('nuevo@ejemplo.com')[0]) }, TA); ok(r.status === 200 && r.j.email === 'n****@ejemplo.com', 'con el código del correo nuevo se cambia');
    ok(await until(() => mailsTo('ana@ejemplo.com').length === 4) && /Se ha cambiado el correo/i.test(subj(mailsTo('ana@ejemplo.com')[3]) + decode(mailsTo('ana@ejemplo.com')[3].body)), 'y se avisa al correo antiguo del cambio (por si no lo hizo el dueño)');
    ok((await login(X, 'nuevo@ejemplo.com')).status === 200 && (await login(X, 'ana@ejemplo.com')).status === 401, 'ahora se entra con el correo nuevo y el antiguo ya no vale'); ok((await X.call('GET', '/api/me', null, TA)).j.profile.emailVerified === true, 'el correo nuevo ya queda verificado');

    console.log('\n=== Recuperar la contraseña ===');
    const before = inbox.length; r = await X.call('POST', '/api/auth/forgot', { email: 'nadie@ejemplo.com' }); const generic = r.j.message;
    ok(r.status === 200 && /Si existe una cuenta/.test(generic), 'pedir recuperación de un correo sin cuenta responde igual que si existiera (no se puede averiguar quién tiene cuenta)');
    await sleep(500); ok(inbox.length === before, 'y no se envía ningún correo');
    r = await X.call('POST', '/api/auth/forgot', { email: 'beto@ejemplo.com' }); ok(r.status === 200 && r.j.message === generic, 'con una cuenta cuyo correo NO está verificado: misma respuesta…'); await sleep(500); ok(inbox.length === before, '…y tampoco se envía nada (así nadie recupera una cuenta con un correo que no confirmó)');
    const oldTok = TA; r = await X.call('POST', '/api/auth/forgot', { email: 'NUEVO@ejemplo.com' }); ok(r.status === 200 && r.j.message === generic, 'con el correo verificado (mayúsculas incluidas): misma respuesta');
    ok(await until(() => mailsTo('nuevo@ejemplo.com').length === 2), 'y esta vez sí llega el código'); const rc = codeOf(mailsTo('nuevo@ejemplo.com')[1]);
    r = await X.call('POST', '/api/auth/reset', { email: 'nuevo@ejemplo.com', code: '000000', password: PW2 }); ok(r.status === 400, 'un código equivocado no restablece nada');
    r = await X.call('POST', '/api/auth/reset', { email: 'nuevo@ejemplo.com', code: rc, password: 'corta' }); ok(r.status === 400 && /8 caracteres/.test(r.j.error), 'la contraseña nueva debe cumplir las mismas reglas (8 o más, letras y números)');
    r = await X.call('POST', '/api/auth/reset', { email: 'otro@ejemplo.com', code: rc, password: PW2 }); ok(r.status === 400, 'el código no sirve para otro correo');
    r = await X.call('POST', '/api/auth/reset', { email: 'nuevo@ejemplo.com', code: rc, password: PW2 }); ok(r.status === 200 && r.j.username === 'Ana_1', 'con el código bueno se restablece');
    ok((await login(X, 'Ana_1', PW)).status === 401 && (await login(X, 'Ana_1', PW2)).status === 200, 'la contraseña vieja ya no entra y la nueva sí');
    ok((await X.call('GET', '/api/me', null, oldTok)).status === 401, 'las sesiones abiertas se cierran todas (quien tuviera la cuenta ya no está dentro)');
    ok(await until(() => mailsTo('nuevo@ejemplo.com').length === 3), 'y llega un aviso de que la contraseña cambió');
    r = await X.call('POST', '/api/auth/reset', { email: 'nuevo@ejemplo.com', code: rc, password: 'Otra-Mas-Nueva-99' }); ok(r.status === 400, 'el código es de un solo uso');
    let last = null; for (let i = 0; i < 4; i++) last = await X.call('POST', '/api/auth/forgot', { email: 'nuevo@ejemplo.com' }); ok(last.status === 429, 'pedir recuperación muchas veces en una hora se frena (429)');

    console.log('\n=== Cambiar la contraseña dentro del juego ===');
    TA = (await login(X, 'Ana_1', PW2)).j.token; const TA2 = (await login(X, 'Ana_1', PW2)).j.token;
    r = await X.call('POST', '/api/me/password', { old: 'mala-vieja-1', password: 'Nueva-Clave-55' }, TA); ok(r.status === 403, 'exige la contraseña actual');
    r = await X.call('POST', '/api/me/password', { old: PW2, password: PW2 }, TA); ok(r.status === 400, 'y que la nueva sea distinta');
    r = await X.call('POST', '/api/me/password', { old: PW2, password: 'Nueva-Clave-55' }, TA); ok(r.status === 200, 'con la actual se cambia');
    ok((await X.call('GET', '/api/me', null, TA)).status === 200 && (await X.call('GET', '/api/me', null, TA2)).status === 401, 'la sesión desde la que se cambia sigue; las demás se cierran');

    console.log('\n=== Eliminar la cuenta con plazo ===');
    TA = (await login(X, 'Ana_1', 'Nueva-Clave-55')).j.token;
    await X.call('POST', '/api/social/request', { name: 'Beto_2' }, TA); const TB = (await login(X, 'Beto_2')).j.token; await X.call('POST', '/api/social/accept', { name: 'Ana_1' }, TB);
    await X.adm('POST', '/px', { username: 'Ana_1', delta: 9000, reason: 't' }); await X.call('POST', '/api/me/unlock', { i: 6 }, TA); await X.call('POST', '/api/bp/buy', {}, TA); await X.call('POST', '/api/bp/skip', { levels: 49 }, TA); await X.call('POST', '/api/bp/claim-all', {}, TA);
    const invA = (await X.call('GET', '/api/bp', null, TA)).j.state.inventory.length; ok(invA > 3, 'preparación: Ana tiene pase, objetos y un amigo (' + invA + ' objetos)');
    ok((await X.call('POST', '/api/social/avatar', { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC' }, TA)).status >= 200, 'y una foto de perfil');
    r = await X.call('POST', '/api/me/delete', { password: 'mala-Clave-9', confirm: 'Ana_1' }, TA); ok(r.status === 403, 'eliminar pide la contraseña');
    r = await X.call('POST', '/api/me/delete', { password: 'Nueva-Clave-55', confirm: 'otro' }, TA); ok(r.status === 400, 'y escribir tu nombre exacto (para no borrarla sin querer)');
    r = await X.call('POST', '/api/me/delete/cancel', {}, TA); ok(r.status === 400, 'cancelar sin haber pedido nada da error');
    r = await X.call('POST', '/api/me/delete', { password: 'Nueva-Clave-55', confirm: 'ana_1' }, TA); ok(r.status === 200 && r.j.deleteAt > Date.now(), 'se programa la eliminación (con plazo)');
    ok((await X.call('GET', '/api/me', null, TA)).j.profile.deleteAt > 0 && (await login(X, 'Ana_1', 'Nueva-Clave-55')).status === 200, 'durante el plazo la cuenta sigue viva: se entra y el perfil avisa de la fecha');
    ok((await X.call('POST', '/api/me/delete/cancel', {}, TA)).status === 200 && (await X.call('GET', '/api/me', null, TA)).j.profile.deleteAt === 0, 'y se puede cancelar');
    await sleep(2300); ok((await login(X, 'Ana_1', 'Nueva-Clave-55')).status === 200, 'una cuenta cancelada no se borra al pasar el tiempo');
    await X.call('POST', '/api/me/delete', { password: 'Nueva-Clave-55', confirm: 'Ana_1' }, TA); await sleep(4200);   // el plazo de la prueba son ~2,6 s y la purga comprueba cada 0,4 s
    ok((await login(X, 'Ana_1', 'Nueva-Clave-55')).status === 401 && (await login(X, 'nuevo@ejemplo.com', 'Nueva-Clave-55')).status === 401, 'pasado el plazo la cuenta ya no existe (ni por nombre ni por correo)');
    ok((await X.call('GET', '/api/social', null, TB)).j.friends.length === 0, 'desaparece de las listas de amigos de los demás');
    ok((await X.call('GET', '/api/profile?name=Ana_1')).status === 404, 'y su perfil público');
    const TA3 = (await reg(X, 'Ana_1', 'ana@ejemplo.com')).j.token; ok(!!TA3 && (await X.call('GET', '/api/bp', null, TA3)).j.state.inventory.length < invA, 'el nombre y el correo quedan libres y la cuenta nueva empieza limpia (sin el pase ni los objetos de la anterior)');
    ok((await fetch(X.B + '/api/avatar?u=Ana_1', { headers: { 'X-Forwarded-For': ip() } })).status === 404, 'y la foto de la cuenta anterior ya no existe');
    X.stop();

    console.log('\n=== Sin correo configurado: soporte del administrador ===');
    X = await boot(3391, '/tmp/ppr_sec_b', {});
    ok((await X.call('GET', '/api/status')).j.mail === false, '/api/status dice que no hay correo (el juego lo usa para no enseñar opciones que no funcionan)');
    let TC = (await reg(X, 'Cami_3', 'cami@ejemplo.com')).j.token; ok(!!TC && (await X.call('POST', '/api/auth/verify/send', {}, TC)).status === 503, 'sin correo, verificar da un aviso claro (503) en vez de fallar en silencio');
    ok((await X.call('POST', '/api/auth/forgot', { email: 'cami@ejemplo.com' })).status === 503, '…igual que recuperar la contraseña por correo');
    ok((await X.call('POST', '/api/admin/accounts/reset-code', { username: 'Cami_3' })).status === 401 && (await X.call('POST', '/api/admin/accounts/reset-code', { username: 'Cami_3' }, TC)).status === 401, 'el código de soporte solo lo pide un administrador');
    r = await X.adm('POST', '/accounts/reset-code', { username: 'Cami_3' }); ok(r.status === 200 && /^\d{6}$/.test(r.j.code) && r.j.minutes === 30, 'el administrador genera un código de recuperación (' + r.j.code + ') para el jugador que perdió el acceso');
    ok((await X.adm('POST', '/accounts/reset-code', { username: 'Nadie_9' })).status === 404, 'una cuenta inexistente da 404');
    r = await X.call('POST', '/api/auth/reset', { email: 'cami@ejemplo.com', code: r.j.code, password: PW2 }); ok(r.status === 200 && (await login(X, 'Cami_3', PW2)).status === 200, 'el jugador entra con su correo, ese código y una contraseña nueva, aunque el correo no estuviera verificado');
    ok((await X.adm('GET', '/audit')).j.audit.some(a => a.action === 'cuenta-codigo-recuperacion'), 'queda en la auditoría del panel');
    ok((await X.adm('POST', '/accounts/verify-email', { username: 'Cami_3' })).j.verified === true, 'el administrador también puede marcar un correo como verificado');
    console.log('\n=== Páginas legales y salud ===');
    const t = await (await fetch(X.B + '/terminos')).text(), pv = await (await fetch(X.B + '/privacidad')).text(), h = await fetch(X.B + '/healthz');
    ok(/Términos de uso/.test(t) && /Política de privacidad/.test(pv) && /Ajustes → Mi cuenta/.test(pv) && (await h.text()) === 'ok', 'los términos, la privacidad y /healthz responden');
    ok(/el titular de este servidor/.test(t), 'sin LEGAL_OWNER dicen «el titular de este servidor»'); X.stop();
    X = await boot(3392, '/tmp/ppr_sec_c', { LEGAL_OWNER: 'Estudio <Prueba>', LEGAL_EMAIL: 'hola@estudio.com' }); const t2 = await (await fetch(X.B + '/privacidad')).text();
    ok(/Estudio &lt;Prueba&gt;/.test(t2) && /mailto:hola@estudio.com/.test(t2) && !/<Prueba>/.test(t2), 'con LEGAL_OWNER y LEGAL_EMAIL se rellenan (y se escapan: no se cuela HTML)'); X.stop();

    /* ---------- PostgreSQL: el borrado limpia todas las tablas ---------- */
    let pgOk = false; const { Client } = require('pg'); try { const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('\n(PostgreSQL no disponible → se omite esa parte)'); }
    if (pgOk) {
      console.log('\n=== PostgreSQL: borrado en cascada ===');
      X = await boot(3393, '/tmp/ppr_sec_d', { ACCOUNT_DELETE_DAYS: 0.00003, PURGE_CHECK_MS: 400 }, PG_URL);
      const T = (await reg(X, 'Pgdel_1', 'pg@ejemplo.com')).j.token; const uid = (await X.call('GET', '/api/profile?name=Pgdel_1')).j.profile && null;
      await X.adm('POST', '/px', { username: 'Pgdel_1', delta: 9000, reason: 't' }); await X.call('POST', '/api/me/unlock', { i: 6 }, T); await X.call('POST', '/api/bp/buy', {}, T); await X.call('POST', '/api/bp/skip', { levels: 49 }, T); await X.call('POST', '/api/bp/claim-all', {}, T);
      await X.call('POST', '/api/social/avatar', { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC' }, T);
      const c = new Client({ connectionString: PG_URL }); await c.connect(); const id = Object.values((await c.query("SELECT data FROM app_docs WHERE name = 'accounts.json'")).rows[0].data.users).find(u => u.username === 'Pgdel_1').id;
      const count = async () => { const q = t => c.query('SELECT count(*)::int AS n FROM ' + t + ' WHERE user_id = $1', [id]).then(x => x.rows[0].n); return { inv: await q('bp_inventory'), prog: await q('bp_progress'), claims: await q('bp_claims'), av: await q('user_avatars') }; };
      const b0 = await count(); ok(b0.inv > 3 && b0.prog === 1 && b0.claims > 3, 'preparación (PostgreSQL): la cuenta tiene ' + b0.inv + ' objetos, progreso del pase, ' + b0.claims + ' recompensas reclamadas y foto (' + b0.av + ')');
      await X.call('POST', '/api/me/delete', { password: PW, confirm: 'Pgdel_1' }, T); await sleep(4200);
      const b1 = await count(); ok(b1.inv === 0 && b1.prog === 0 && b1.claims === 0 && b1.av === 0, 'tras el plazo no queda NADA suyo en las tablas del pase, los objetos ni las fotos');
      ok(!Object.values((await c.query("SELECT data FROM app_docs WHERE name = 'accounts.json'")).rows[0].data.users).some(u => u.username === 'Pgdel_1') && (await login(X, 'Pgdel_1')).status === 401, 'ni en el documento de cuentas: no puede entrar'); await c.end(); X.stop();
    }
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  smtp.close(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
