'use strict';
/* Interfaz de «Mi cuenta» y «¿Has olvidado tu contraseña?» con un cliente real (jsdom), un servidor real y un SMTP simulado. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const net = require('net'); const { JSDOM } = require('jsdom');
const PORT = 3395, SMTP = 2602, ORIGIN = 'http://127.0.0.1:' + PORT, DIR = '/tmp/ppr_acui', APASS = 'AcUi-Admin-2026xy';
fs.rmSync(DIR, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 7000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
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
const lastCode = a => { const l = inbox.filter(m => m.to.includes(a)); return l.length ? codeOf(l[l.length - 1]) : null; };
const wf = (u, o) => fetch(new URL(u, ORIGIN + '/').href, o);
const api = async (m, p, b, tk) => { const r = await wf('/api' + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
const rd = f => fs.readFileSync(path.join(PUB, f), 'utf8'), three = rd('vendor/three.min.js'), shared = rd('shared.js'), client = rd('client.js'), bpjs = rd('bp.js'), sojs = rd('social.js'), mdjs = rd('modes.js'), acjs = rd('account.js');
function boot(token) {
  const w = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: ORIGIN + '/' }).window;
  w.matchMedia = q => ({ matches: q.includes('any-pointer'), addListener() {} });
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx; w.HTMLCanvasElement.prototype.requestPointerLock = () => {};
  w.fetch = wf; w.confirm = () => true; w.open = () => null; if (token) w.localStorage.setItem('ppr.acct', token);
  w.eval(three); w.THREE.WebGLRenderer = function () { this.capabilities = { getMaxAnisotropy: () => 1 }; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
  w.eval(shared); const errors = []; w.addEventListener('error', e => errors.push(e.message));
  const i = client.lastIndexOf('})();'); w.eval(client.slice(0, i) + 'window.__T = { get remote() { return remote; } };\n' + client.slice(i)); w.eval(bpjs); w.eval(sojs); w.eval(mdjs); w.eval(acjs);
  return { w, T: w.__T, errors, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] };
}
const btn = (C, text) => C.$$('#acBox button').find(b => b.textContent.trim() === text);
const type = (C, id, v) => { const e = C.$('#' + id); e.value = v; e.dispatchEvent(new C.w.Event('input', { bubbles: true })); };
const PW = 'Clave-Segura-77', PW2 = 'Otra-Clave-Nueva-88';

(async () => {
  await new Promise(r => smtp.listen(SMTP, '127.0.0.1', r));
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: DIR, ADMIN_PASSWORD: APASS, DATABASE_URL: '', SMTP_HOST: '127.0.0.1', SMTP_PORT: SMTP, SMTP_INSECURE: '1', MAIL_GAP_MS: 1000, ACCOUNT_DELETE_DAYS: 7, ACCOUNTS_REG_MAX: 50, MAX_CONN_PER_IP: 60, REQUIRE_TERMS: '1' }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill('SIGKILL'); } catch (e) { /* nada */ } }); await sleep(1700);
  try {
    const AD = (await api('POST', '/admin/login', { user: 'Viexbox', password: APASS })).j.token;
    const reg = async (u, e) => (await api('POST', '/auth/register', { username: u, email: e, password: PW, terms: true })).j.token;
    const TA = await reg('Ana_1', 'ana@ejemplo.com'); await sleep(1200);

    console.log('=== Mi cuenta ===');
    const A = boot(TA); ok(await until(() => A.T.remote && A.T.remote.username === 'Ana_1'), 'el cliente entra con la cuenta de Ana');
    ok(await until(() => !A.$('#accountRow').hidden), 'en Ajustes aparece «Mi cuenta» (solo con sesión)');
    ok(await until(() => !A.$('#mailBanner').hidden && /Verifica tu correo/.test(A.$('#mailBanner').textContent)), 'y en el menú un aviso: «Verifica tu correo para poder recuperar tu cuenta»');
    A.$('#mailBanner [data-a=account]').click(); ok(await until(() => !A.$('#acModal').hidden && /Mi cuenta · Ana_1/.test(A.$('#acBox').textContent) && /sin verificar/.test(A.$('#acBox').textContent) && /a\*\*@ejemplo\.com/.test(A.$('#acBox').textContent)), 'el aviso abre «Mi cuenta»: correo enmascarado y «sin verificar»');
    ok(!A.$('#acBox').textContent.includes('ana@ejemplo.com'), 'el correo entero no se enseña nunca');
    btn(A, 'Verificar').click(); ok(await until(() => A.$('#acCode')), 'Verificar: pide el código de 6 cifras');
    type(A, 'acCode', '000000'); btn(A, 'Verificar').click(); ok(await until(() => /Código incorrecto/.test(A.$('#acErr').textContent)), 'un código malo se explica en la propia ventana («' + A.$('#acErr').textContent + '»)');
    type(A, 'acCode', lastCode('ana@ejemplo.com')); btn(A, 'Verificar').click(); ok(await until(() => /✔ verificado/.test(A.$('#acBox').textContent)), 'con el bueno queda «✔ verificado»');
    ok(await until(() => A.$('#mailBanner').hidden), 'y el aviso del menú desaparece');
    ok((await api('GET', '/me', null, TA)).j.profile.emailVerified === true, 'el servidor lo confirma');
    btn(A, 'Cambiar', ).click(); await sleep(50);
    /* hay dos botones «Cambiar» (correo y contraseña): el primero es el del correo */
    ok(await until(() => A.$('#acNew') && A.$('#acPw')), 'Cambiar correo: pide el correo nuevo y la contraseña');
    type(A, 'acNew', 'ana.nueva@ejemplo.com'); type(A, 'acPw', 'mala-Clave-1'); btn(A, 'Enviar código').click(); ok(await until(() => /contraseña no es correcta/.test(A.$('#acErr').textContent)), 'con la contraseña mal, no se envía nada');
    type(A, 'acPw', PW); btn(A, 'Enviar código').click(); ok(await until(() => /Confirmar el correo nuevo/.test(A.$('#acBox').textContent) && /a\*\*\*\*\*\*@ejemplo\.com|a\*+@ejemplo\.com/.test(A.$('#acBox').textContent)), 'con la contraseña bien pasa a pedir el código enviado al correo NUEVO');
    ok(await until(() => lastCode('ana.nueva@ejemplo.com')), 'que llega de verdad a ese correo'); type(A, 'acCode', lastCode('ana.nueva@ejemplo.com')); btn(A, 'Confirmar').click();
    ok(await until(() => /Mi cuenta · Ana_1/.test(A.$('#acBox').textContent) && /a\*+@ejemplo\.com/.test(A.$('#acBox').textContent) && /✔ verificado/.test(A.$('#acBox').textContent)), 'el correo cambia y queda verificado');
    ok((await api('POST', '/auth/login', { identifier: 'ana.nueva@ejemplo.com', password: PW })).status === 200, 'y ya se entra con el correo nuevo');
    A.$$('#acBox [data-a=pw]')[0].click(); ok(await until(() => A.$('#acOld')), 'Cambiar contraseña: actual, nueva y repetir');
    type(A, 'acOld', PW); type(A, 'acPw', PW2); type(A, 'acPw2', 'distinta-99A'); btn(A, 'Cambiar').click(); ok(await until(() => /no coinciden/.test(A.$('#acErr').textContent)), 'si no coinciden lo avisa sin llamar al servidor');
    type(A, 'acPw2', PW2); btn(A, 'Cambiar').click(); ok(await until(() => /Mi cuenta · Ana_1/.test(A.$('#acBox').textContent) && /Contraseña cambiada/.test(A.$('#toast').textContent)), 'con todo bien se cambia («' + A.$('#toast').textContent + '»)');
    ok((await api('POST', '/auth/login', { identifier: 'Ana_1', password: PW })).status === 401 && (await api('POST', '/auth/login', { identifier: 'Ana_1', password: PW2 })).status === 200, 'y la contraseña vieja ya no entra');
    ok((await api('GET', '/me', null, TA)).status === 200, 'la sesión de este dispositivo sigue abierta');
    A.$$('#acBox [data-a=del]')[0].click(); ok(await until(() => A.$('#acConf') && /7 días/.test(A.$('#acBox').textContent)), 'Eliminar: explica que se borra todo y que hay 7 días para arrepentirse');
    type(A, 'acPw', PW2); type(A, 'acConf', 'otra'); btn(A, 'Eliminar mi cuenta').click(); ok(await until(() => /nombre de usuario exacto/.test(A.$('#acErr').textContent)), 'si no escribes tu nombre exacto, no se elimina');
    type(A, 'acConf', 'Ana_1'); btn(A, 'Eliminar mi cuenta').click(); ok(await until(() => /Tu cuenta se eliminará el/.test(A.$('#acBox').textContent) && A.$('#acBox [data-a=undel]')), 'con la contraseña y el nombre queda programada, con su fecha y la opción de cancelar');
    ok(await until(() => !A.$('#mailBanner').hidden && /se eliminará el/.test(A.$('#mailBanner').textContent)), 'en el menú sale un aviso rojo con la fecha');
    A.$('#acBox [data-a=undel]').click(); ok(await until(() => !/Tu cuenta se eliminará/.test(A.$('#acBox').textContent) && A.$('#acBox [data-a=del]')), 'Cancelar eliminación: la cuenta sigue como siempre');
    ok(await until(() => A.$('#mailBanner').hidden) && (await api('GET', '/me', null, TA)).j.profile.deleteAt === 0, 'el aviso se quita y el servidor lo confirma');

    console.log('\n=== ¿Has olvidado tu contraseña? (sin sesión) ===');
    await reg('Cami_3', 'cami@ejemplo.com'); await api('POST', '/admin/accounts/verify-email', { username: 'Cami_3' }, AD); await sleep(1200);
    const C = boot(null); await sleep(600); C.w.PPR_BP.openForgot('cami@ejemplo.com');
    ok(await until(() => !C.$('#acModal').hidden && /Recuperar tu cuenta/.test(C.$('#acBox').textContent) && C.$('#acEmail').value === 'cami@ejemplo.com'), 'se abre «Recuperar tu cuenta» con el correo ya escrito');
    btn(C, 'Enviar código').click(); ok(await until(() => /Nueva contraseña/.test(C.$('#acBox').textContent) && /Si existe una cuenta/.test(C.$('#acBox').textContent)), 'al enviar, la respuesta es la genérica («Si existe una cuenta…») y pasa al siguiente paso');
    ok(await until(() => lastCode('cami@ejemplo.com')), 'el código llega al correo'); type(C, 'acCode', lastCode('cami@ejemplo.com')); type(C, 'acPw', PW2); type(C, 'acPw2', 'no-coincide1'); btn(C, 'Cambiar contraseña').click();
    ok(await until(() => /no coinciden/.test(C.$('#acErr').textContent)), 'las contraseñas deben coincidir'); type(C, 'acPw2', PW2); btn(C, 'Cambiar contraseña').click();
    ok(await until(() => /¡Listo!/.test(C.$('#acBox').textContent) && /Cami_3/.test(C.$('#acBox').textContent)), 'con el código y la contraseña nueva: «¡Listo!» y dice con qué nombre entrar');
    ok((await api('POST', '/auth/login', { identifier: 'Cami_3', password: PW2 })).status === 200 && (await api('POST', '/auth/login', { identifier: 'Cami_3', password: PW })).status === 401, 'y la contraseña nueva funciona');
    ok(A.errors.length === 0 && C.errors.length === 0, 'sin errores de JavaScript ' + JSON.stringify(A.errors.concat(C.errors)));
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  smtp.close(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
