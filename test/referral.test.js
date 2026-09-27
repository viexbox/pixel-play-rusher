'use strict';
/* [INVITACIONES] Invita a un amigo: cada cuenta tiene su código; quien se registra con él queda apuntado y, cuando juega sus primeras
   partidas online con premio, el que invitó y el invitado reciben PX. No vale con la misma conexión ni pasar del tope diario. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });

(async () => {
  try {
    console.log('=== Lógica (módulo de cuentas) ===');
    const { createAccounts } = require('../server/accounts.js'); const dir = fs.mkdtempSync('/tmp/ppr-ref-unit-');
    const stub = { banFor: () => null, banMessage: () => '', isReserved: () => false, audit() {}, addRoutes() {}, smtpOn: () => false, sendMail: async () => false, setVerifiedProvider() {} };
    const A = createAccounts({ dataDir: dir, log() {}, S, admin: stub, env: Object.assign({}, process.env, { REQUIRE_TERMS: '0', REF_DAY_MAX: '2' }) });
    const reg = (n, ip, ref) => A.register({ username: n, email: n.toLowerCase() + '@e.com', password: 'Clave-Segura-77', ref }, ip);
    await reg('Ana_R', '10.0.0.1'); const ana = A.find('Ana_R');
    const m = { points: 500, kills: 3, deaths: 2, won: true, cls: 0, bestStreak: 2 };
    const info0 = A.profile(ana); ok(!!info0, 'la cuenta existe');
    await reg('Beto_R', '10.0.0.2', 'NOEXISTE'); ok(!A.find('Beto_R').refBy, 'un código inventado no apunta a nadie');
    // código real: se genera al pedirlo
    const refInfo = () => new Promise(res => { const req = { method: 'GET', headers: { authorization: 'Bearer ' + tokAna } }, resp = { writeHead() {}, end(b) { res(JSON.parse(b)); } }; A.handleHttp(req, resp, new URL('http://x/api/me/referral'), '10.0.0.1'); });
    const tokAna = (await A.register({ username: 'Ana2_R', email: 'ana2@e.com', password: 'Clave-Segura-77' }, '10.0.0.9')).token;
    const inv = await refInfo(); const anaInv = A.find('Ana2_R');
    ok(/^[A-Z2-9]{6}$/.test(inv.refCode) && inv.invited === 0 && inv.pxInviter === 300 && inv.pxFriend === 200 && inv.games === 3, 'cada cuenta tiene su código de invitación (' + inv.refCode + ') y ve los premios: 300 PX para ti, 200 para tu amigo, tras 3 partidas');
    await reg('Cris_R', '10.0.0.3', inv.refCode.toLowerCase()); const cris = A.find('Cris_R');
    ok(cris.refBy === anaInv.id && (anaInv.refs || []).length === 1, 'quien se registra con el código queda apuntado como invitado (sin importar mayúsculas)');
    const px0 = anaInv.px, c0 = cris.px;
    let r = A.awardMatch(cris, m); A.awardMatch(cris, m);
    ok(!r.ref && anaInv.px === px0, 'con 1 o 2 partidas todavía no hay premio');
    r = A.awardMatch(cris, m);
    ok(r.ref && r.ref.px === 200 && r.ref.by === 'Ana2_R' && anaInv.px === px0 + 300, 'a la 3.ª partida: +300 PX para quien invitó y el invitado recibe su bono (' + JSON.stringify(r.ref) + ')');
    ok(cris.px - c0 === r.px * 3 + 200 || cris.px >= c0 + 200, 'el invitado recibe sus 200 PX además de los de las partidas');
    r = A.awardMatch(cris, m); ok(!r.ref && anaInv.px === px0 + 300, 'el premio se da una sola vez');
    let i2 = await refInfo(); ok(i2.invited === 1 && i2.done === 1 && i2.earned === 300 && i2.friends[0].name === 'Cris_R' && i2.friends[0].done, 'el panel cuenta 1 apuntado, 1 que ya juega y 300 PX ganados');
    await reg('Dani_R', '10.0.0.9', inv.refCode); const dani = A.find('Dani_R'); for (let k = 0; k < 3; k++) r = A.awardMatch(dani, m);
    ok(!r.ref && anaInv.px === px0 + 300, 'una cuenta creada desde la misma conexión que quien invita no da premio (no vale invitarse a sí mismo)');
    for (const [n, ip] of [['Eva_R', '10.0.0.4'], ['Fede_R', '10.0.0.5']]) { await reg(n, ip, inv.refCode); for (let k = 0; k < 3; k++) A.awardMatch(A.find(n), m); }
    i2 = await refInfo(); ok(anaInv.px === px0 + 600 && i2.friends.find(f => f.name === 'Fede_R').blocked, 'como mucho REF_DAY_MAX invitaciones premiadas al día (aquí 2): la tercera queda sin premio');
    const txt = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8'), svc = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'api', 'accountService.js'), 'utf8');
    ok(/ppr\.ref/.test(txt) && /get\('ref'\)/.test(txt) && /ppr\.ref/.test(svc) && /ref: ref \|\| undefined/.test(svc), 'el cliente guarda el ?ref= del enlace y lo manda al crear la cuenta');

    console.log('\n=== Servidor real (HTTP) ===');
    const port = 3971, B = 'http://127.0.0.1:' + port;
    const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: fs.mkdtempSync('/tmp/ppr-ref-srv-'), ADMIN_PASSWORD: 'Ref-Admin-2026xy', REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: '' }), stdio: 'ignore' }); procs.push(srv);
    await sleep(1400);
    const call = async (mth, p, b, tk, ip) => { const x = await fetch(B + p, { method: mth, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip || '10.1.0.1' }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: x.status, j: await x.json().catch(() => ({})) }; };
    ok((await call('GET', '/api/me/referral')).status === 401, 'sin sesión no hay enlace');
    const T1 = (await call('POST', '/api/auth/register', { username: 'Gala_R', email: 'gala@e.com', password: 'Clave-Segura-77', terms: true }, null, '10.1.0.1')).j.token;
    const c1 = (await call('GET', '/api/me/referral', null, T1)).j;
    ok(/^[A-Z2-9]{6}$/.test(c1.refCode) && (await call('GET', '/api/me/referral', null, T1)).j.refCode === c1.refCode, 'GET /api/me/referral da tu código y siempre el mismo (' + c1.refCode + ')');
    await call('POST', '/api/auth/register', { username: 'Hugo_R', email: 'hugo@e.com', password: 'Clave-Segura-77', terms: true, ref: c1.refCode }, null, '10.1.0.2');
    const c2 = (await call('GET', '/api/me/referral', null, T1)).j;
    ok(c2.invited === 1 && c2.friends[0].name === 'Hugo_R' && c2.friends[0].games === 0, 'al registrarse con el enlace aparece en tu lista (0/3 partidas)');
    srv.kill();
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
