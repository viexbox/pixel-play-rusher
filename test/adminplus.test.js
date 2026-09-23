'use strict';
/* Panel de administración: verificados por nombre (sin código) con beneficios, monedas (PX y Créditos), ventas con dinero real, cuentas y «antes de lanzar». */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
const S = require('../public/shared.js');
const PORT = 3410, D = '/tmp/ppr_adminplus', B = 'http://127.0.0.1:' + PORT, APASS = 'Plus-Admin-2026xyz';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(25); } return false; }
let ipn = 10; const ip = () => '10.7.7.' + (ipn++);
const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
class Bot {
  constructor(name, extra) { this.name = name; this.extra = extra || {}; this.msgs = []; this.pos = null; this.ep = 0; this.id = null; this.others = new Map(); this.spawnAt = 0; }
  connect(map) { return new Promise(res => { this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } }); this.ws.on('open', () => this.send(Object.assign({ t: 'hello', v: 1, n: this.name, map: map || 0, c: 0 }, this.extra))); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'welcome') { this.id = m.id; this.welcome = m; for (const p of m.players || []) this.others.set(p.id, { x: p.x, z: p.z }); res(m); } if (m.t === 'err') res(m); if (m.t === 'spawn') { if (m.id === this.id) { this.pos = { x: m.x, y: 0, z: m.z }; this.ep = m.ep; this.spawnAt = Date.now(); } else this.others.set(m.id, { x: m.x, z: m.z, at: Date.now() }); } if (m.t === 'kill' && m.v === this.id) this.spawnAt = Date.now() + 1e9; /* muerto: no se puede atacar hasta que reaparezca */ if (m.t === 'fix') { this.pos = { x: m.x, y: m.y, z: m.z }; this.ep = m.ep; } }); this.ws.on('error', () => {}); this.ws.on('close', () => { this.closed = true; res({ t: 'err', m: 'cerrado' }); }); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(t, f) { return this.msgs.some(m => m.t === t && (!f || f(m))); } last(t) { return [...this.msgs].reverse().find(m => m.t === t); } all(t) { return this.msgs.filter(m => m.t === t); }
  async walkTo(x, z) { while (Math.hypot(x - this.pos.x, z - this.pos.z) > 0.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 9 * 0.05); this.pos.x += dx / d * st; this.pos.z += dz / d * st; this.send({ t: 'st', ep: this.ep, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: 0, pitch: 0, h: 1.8 }); await sleep(50); } }
  close() { try { this.ws.close(); } catch (e) { /* cerrado */ } }
}

(async () => {
  console.log('=== Bono de los verificados (en proceso) ===');
  try {
    const { createAccounts } = require('../server/accounts.js'); fs.rmSync('/tmp/ppr_ap_unit', { recursive: true, force: true }); fs.mkdirSync('/tmp/ppr_ap_unit', { recursive: true }); let prov = null;
    const stub = { banFor: () => null, banMessage: () => '', isReserved: () => false, audit() {}, addRoutes() {}, smtpOn: () => false, sendMail: async () => false, setVerifiedProvider: p => { prov = p; } };
    const A = createAccounts({ dataDir: '/tmp/ppr_ap_unit', log() {}, S, admin: stub, env: Object.assign({}, process.env, { REQUIRE_TERMS: '0' }) });
    await A.register({ username: 'Fama_U', email: 'f@u.com', password: 'Clave-Segura-77' }, '1.1.1.1'); await A.register({ username: 'Norm_U', email: 'n@u.com', password: 'Clave-Segura-77' }, '1.1.1.2');
    const f = A.find('Fama_U'), n = A.find('Norm_U'); f.verified = true; const m = { points: 1000, kills: 5, deaths: 2, won: true, cls: 0, bestStreak: 3 };
    let rf = A.awardMatch(f, m), rn = A.awardMatch(n, m);
    ok(rn.px === 150 && rf.px === 180, 'con el bono por defecto (+20 %) un verificado gana 180 PX donde otro gana 150 (' + rf.px + ' vs ' + rn.px + ')');
    ok(rf.cr > rn.cr && rf.cr === Math.round(rn.cr * 1.2) || rf.cr === rn.cr + Math.round(rn.cr * 0.2), 'y sus Créditos también suben +20 % (' + rf.cr + ' vs ' + rn.cr + ')');
    ok(rf.ev.some(x => /Verificado \+20 %/.test(x)) && !rn.ev.some(x => /Verificado/.test(x)), 'el resumen de la partida lo muestra («Verificado +20 %»)');
    A.setVcfg({ bonusPx: 50, bonusCr: 0 }); const f2 = A.find('Fama_U'); f2.day = { d: new Date().toISOString().slice(0, 10), px: 0 }; const before = f2.px; rf = A.awardMatch(f2, m); ok(rf.px === 225 && f2.px - before === 225, 'con el bono al 50 %: 225 PX');
    A.setVcfg({ bonusPx: 999, bonusCr: -5, giftPx: 'x', giftCr: 1e9 }); const c = A.vcfg(); ok(c.bonusPx === 200 && c.bonusCr === 0 && c.giftPx === 0 && c.giftCr === 100000, 'los beneficios se limitan a valores razonables (máx. 200 %, sin negativos ni texto)');
    ok(prov && prov.has('fama_u') === true && prov.has('Fama_U') === true && prov.has('norm_u') === false && prov.has('nadie') === false, 'el servidor sabe quién está verificado por su nombre');
    A.setVcfg({ bonusPx: 0, bonusCr: 0 }); const f3 = A.find('Fama_U'); f3.day = { d: new Date().toISOString().slice(0, 10), px: 0 }; ok(A.awardMatch(f3, m).px === 150, 'con el bono a 0 cobra igual que los demás');
  } catch (e) { console.log('EXCEPCIÓN (unidad)', e); failed++; }

  const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill('SIGKILL'); } catch (e) { /* nada */ } });
  fs.rmSync(D, { recursive: true, force: true });
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: D, ADMIN_PASSWORD: APASS, DATABASE_URL: '', MAX_CONN_PER_IP: 80, ACCOUNTS_REG_MAX: 60, REQUIRE_TERMS: '0', FILL_BOTS: '0', WALL_CHECK: '0', HELLO_TIMEOUT_MS: 20000 }), stdio: 'ignore' }); procs.push(srv); await sleep(1800);
  try {
    const AT = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token, adm = (m, p, b) => call(m, '/api/admin' + p, b, AT);
    const reg = async n => (await call('POST', '/api/auth/register', { username: n, email: n.toLowerCase() + '@e.com', password: 'Clave-Segura-77' })).j.token;
    const TF = await reg('Fama_1'), TN = await reg('Norm_2'), TZ = await reg('Fresca_3');

    console.log('\n=== Verificar por nombre (sin códigos) ===');
    let r = await adm('POST', '/verified/set', { username: 'NoExiste', note: 'x' }); ok(r.status === 404 && /registrado antes/.test(r.j.error), 'una cuenta que no existe da un aviso claro («tiene que haberse registrado antes»)');
    ok((await call('POST', '/api/admin/verified/set', { username: 'Fama_1' })).status === 401 && (await call('POST', '/api/admin/verified/set', { username: 'Fama_1' }, TF)).status === 401, 'solo un administrador puede verificar (sin sesión o con una cuenta de jugador: 401)');
    r = await adm('POST', '/verified/set', { username: 'fama_1', note: 'canal de pruebas' }); ok(r.status === 200 && r.j.verified && r.j.username === 'Fama_1' && !r.j.already, 'se escribe el nombre (da igual mayúsculas) y queda verificado');
    ok((await adm('POST', '/verified/set', { username: 'Fama_1' })).j.already === true, 'verificar otra vez avisa de que ya lo estaba');
    let v = (await adm('GET', '/verified')).j; ok(v.accounts.length === 1 && v.accounts[0].username === 'Fama_1' && v.accounts[0].note === 'canal de pruebas' && v.accounts[0].by === 'Viexbox' && v.accounts[0].since > 0, 'aparece en la lista con su nota, quién lo verificó y desde cuándo');
    ok((await call('GET', '/api/profile?name=Fama_1', null, TN)).j.profile.verified === 'acc', 'su perfil público muestra el tic azul');
    ok(JSON.stringify(v).indexOf('@') < 0, 'la lista de verificados no enseña correos');
    const fa = new Bot('Fama_1', { acct: TF }), nb = new Bot('Norm_2', { acct: TN }); const wf = await fa.connect(0), wn = await nb.connect(0);
    ok(wf.rl === 'inf' && wf.n === 'Fama_1' && wn.rl === 0, 'al entrar en una partida ya sale con el tic azul, SIN pegar ningún código; otra cuenta no');
    ok((await adm('GET', '/audit')).j.audit.some(a => a.action === 'verificar-cuenta' && /Fama_1/.test(a.detail || a.target || JSON.stringify(a))), 'queda en la auditoría');

    console.log('\n=== Efecto inmediato y beneficios ===');
    r = await adm('POST', '/verified/set', { username: 'Norm_2' }); await sleep(300);
    const roleOf = async n => ((await adm('GET', '/players')).j.players.find(p => p.name === n) || {}).role;
    ok(await roleOf('Norm_2') === 'inf', 'verificar a alguien que YA está jugando le cambia el rol al instante, sin volver a entrar');
    await adm('POST', '/verified/set', { username: 'Norm_2', verified: false }); await sleep(300); ok(await roleOf('Norm_2') === 0, 'y al quitárselo lo pierde al instante');
    await adm('POST', '/settings', { chatLocked: true }); await sleep(200); fa.send({ t: 'chat', m: 'hola desde el verificado' }); nb.send({ t: 'chat', m: 'hola desde uno normal' });
    ok(await until(() => nb.has('chat', m => /desde el verificado/.test(m.m)), 3000), 'con el chat bloqueado por la moderación, el verificado SÍ puede escribir');
    await sleep(500); ok(!fa.has('chat', m => /desde uno normal/.test(m.m)), 'y el jugador normal no');
    await adm('POST', '/verified/benefits', { chat: false, bonusPx: 20, bonusCr: 20, giftPx: 0, giftCr: 0 }); fa.send({ t: 'chat', m: 'segundo intento' }); await sleep(600);
    ok(!nb.has('chat', m => /segundo intento/.test(m.m)), 'si desactivas ese beneficio en el panel, el verificado también queda bloqueado'); await adm('POST', '/settings', { chatLocked: false }); await adm('POST', '/verified/benefits', { chat: true, bonusPx: 20, bonusCr: 20, giftPx: 500, giftCr: 50 });
    const b0 = (await call('GET', '/api/me', null, TZ)).j.profile; await adm('POST', '/verified/set', { username: 'Fresca_3' }); const b1 = (await call('GET', '/api/me', null, TZ)).j.profile;
    ok(b1.px === b0.px + 500 && b1.credits === b0.credits + 50, 'el regalo al verificar (500 PX y 50 Créditos) llega a la cuenta al instante');
    await adm('POST', '/verified/set', { username: 'Fresca_3', verified: false }); await adm('POST', '/verified/set', { username: 'Fresca_3' }); ok((await call('GET', '/api/me', null, TZ)).j.profile.px === b1.px, 'y solo se da UNA vez por cuenta (quitar y volver a poner no lo repite)');
    r = await adm('POST', '/verified/benefits', { bonusPx: 9999, bonusCr: -3, giftPx: 'abc' }); ok(r.j.cfg.bonusPx === 200 && r.j.cfg.bonusCr === 0 && r.j.cfg.giftPx === 0, 'los valores absurdos se corrigen solos');
    await adm('POST', '/verified/benefits', { chat: true, bonusPx: 20, bonusCr: 20, giftPx: 0, giftCr: 0 });
    fa.close(); nb.close();

    console.log('\n=== Monedas: PX y Créditos ===');
    r = await adm('POST', '/px', { username: 'Norm_2', delta: 1000, reason: 'prueba' }); ok(r.status === 200 && r.j.balance === 1000, 'dar 1000 PX');
    r = await adm('POST', '/credits', { username: 'Norm_2', delta: 300, reason: 'prueba' }); ok(r.j.credits === 300, 'dar 300 Créditos (la otra moneda, ahora también desde el panel)');
    r = await adm('POST', '/px', { username: 'Norm_2', delta: -400, reason: 'prueba' }); ok(r.j.balance === 600, 'quitar 400 PX');
    r = await adm('POST', '/credits', { username: 'Norm_2', delta: -5000 }); ok(r.j.applied === -300 && r.j.credits === 0, 'quitar más de lo que tiene deja el saldo en 0, nunca negativo');
    r = await adm('POST', '/coins/set', { username: 'Norm_2', currency: 'px', value: 250, reason: 'ajuste' }); ok(r.j.balance === 250 && r.j.applied === -350, 'fijar el saldo de PX a un valor exacto (250)');
    r = await adm('POST', '/coins/set', { username: 'Norm_2', currency: 'cr', value: 40 }); ok(r.j.balance === 40, 'fijar los Créditos a 40');
    ok((await adm('POST', '/coins/set', { username: 'Norm_2', currency: 'px', value: -3 })).status === 400 && (await adm('POST', '/coins/set', { username: 'Nadie', currency: 'px', value: 3 })).status === 404, 'no se acepta un saldo negativo ni una cuenta inexistente');
    const lg = (await adm('GET', '/coins/log')).j.log; ok(lg.some(l => l.cur === 'PX' && l.user === 'Norm_2' && l.delta === -350) && lg.some(l => l.cur === 'CR' && l.delta === 300), 'el registro de movimientos junta PX y Créditos, con quién y por qué');
    ok((await adm('GET', '/audit')).j.audit.some(a => /fijar-px/.test(a.action)), 'y todo queda en la auditoría');

    console.log('\n=== Ventas con dinero real ===');
    let sa = (await adm('GET', '/sales')).j; ok(sa.revenue.all.eur === undefined && sa.orders.paid === 0 && sa.storeOn === false && sa.byDay.length === 30, 'sin ventas: ingresos vacíos, tienda de pago sin activar, gráfico de 30 días');
    r = await adm('POST', '/orders/manual', { username: 'Norm_2', px: 500, amount: '4,99', note: 'Bizum' }); ok(r.status === 200 && r.j.order.status === 'manual' && r.j.order.amount === 499, 'registrar una venta manual (Bizum, 4,99 €) entrega los PX y guarda el importe en céntimos');
    ok((await call('GET', '/api/me', null, TN)).j.profile.px === 750, 'los 500 PX están en la cuenta (250 + 500)');
    await adm('POST', '/orders/manual', { username: 'Fama_1', px: 1200, amount: 9.99 }); sa = (await adm('GET', '/sales')).j;
    ok(sa.revenue.today.eur === 1498 && sa.revenue.all.eur === 1498 && sa.orders.manual === 2 && sa.pxSold === 1700 && sa.average === 749, 'los ingresos suman (14,98 €), cuenta 2 pedidos, 1700 PX vendidos y compra media de 7,49 €');
    ok(sa.byDay[29].amount === 1498 && sa.top[0].user === 'Fama_1' && sa.top[0].amount === 999, 'el gráfico marca el día de hoy y el mejor comprador es Fama_1');
    ok((await adm('POST', '/orders/manual', { username: 'Nadie', px: 5, amount: 1 })).status === 404 && (await adm('POST', '/orders/manual', { username: 'Norm_2', px: 0, amount: 1 })).status === 400 && (await adm('POST', '/orders/manual', { username: 'Norm_2', px: 5, amount: -2 })).status === 400, 'cuenta inexistente, 0 PX o importe negativo: se rechazan');
    const oid = sa.orders_list.find(o => o.user === 'Norm_2').id; await adm('POST', '/px', { username: 'Norm_2', delta: -700 });
    r = await adm('POST', '/orders/refund', { id: oid }); ok(r.status === 200 && r.j.removed === 50, 'reembolsar retira los PX que aún conserve (solo 50 de 500: ya se había gastado el resto)');
    sa = (await adm('GET', '/sales')).j; ok(sa.revenue.all.eur === 999 && sa.orders.refunded === 1, 'y el pedido reembolsado deja de contar en los ingresos (queda 9,99 €)');
    ok((await adm('POST', '/orders/refund', { id: oid })).status === 400 && (await adm('POST', '/orders/refund', { id: 'nada' })).status === 404, 'no se puede reembolsar dos veces ni un pedido que no existe');
    ok((await adm('GET', '/sales')).j.circulation.accounts === 3, 'el resumen cuenta las 3 cuentas y sus monedas en circulación');
    ok((await call('GET', '/api/admin/sales', null, TN)).status === 401, 'las ventas solo las ve un administrador');

    console.log('\n=== Cuentas y antes de lanzar ===');
    const list = (await adm('GET', '/accounts?q=norm')).j; const a1 = list.accounts[0]; ok(list.accounts.length === 1 && a1.credits === 40 && a1.verified === false && a1.emailOk === false && a1.email2 === 'norm_2@e.com', 'la lista de cuentas enseña Créditos, verificado, si el correo está verificado y el correo completo');
    r = await adm('POST', '/accounts/delete', { username: 'Norm_2', mode: 'schedule' }); ok(r.status === 200 && r.j.deleteAt > Date.now(), 'programar la eliminación de una cuenta');
    ok((await adm('GET', '/accounts?q=norm')).j.accounts[0].deleteAt > 0 && (await adm('POST', '/accounts/delete', { username: 'Norm_2', mode: 'cancel' })).status === 200 && (await adm('GET', '/accounts?q=norm')).j.accounts[0].deleteAt === 0, 'aparece marcada y se puede cancelar');
    ok((await adm('POST', '/accounts/delete', { username: 'Norm_2', mode: 'now', confirm: 'otra' })).status === 400, 'eliminar AHORA exige escribir el nombre exacto');
    ok((await adm('POST', '/accounts/delete', { username: 'Norm_2', mode: 'now', confirm: 'norm_2' })).j.removed === true && (await call('POST', '/api/auth/login', { identifier: 'Norm_2', password: 'Clave-Segura-77' })).status === 401, 'con el nombre exacto se elimina y ya no puede entrar');
    const L = (await adm('GET', '/launch')).j; const item = id => L.items.find(i => i.id === id);
    ok(L.items.length >= 8 && L.ready === false && item('mail').ok === false && /SMTP_HOST/.test(item('mail').detail) && item('legal').ok === false && item('terms').ok === false && item('walls').ok === false, '«Antes de lanzar»: sin correo ni datos legales NO está listo y dice qué variable configurar (aquí también sale desactivado lo que la prueba apaga: términos y paredes)');
    ok(item('storage').ok === true && item('bots').ok === false && ['must', 'should', 'info'].includes(item('https').level), 'y marca lo que sí está bien (almacenamiento) y los niveles (imprescindible, recomendado, información)');
    ok((await call('GET', '/api/admin/launch', null, TN)).status === 401, 'solo para administradores');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  procs.pop().kill('SIGKILL'); await sleep(500);

  console.log('\n=== El panel en pantalla ===');
  try {
    fs.rmSync(D, { recursive: true, force: true });
    const srv2 = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: D, ADMIN_PASSWORD: APASS, DATABASE_URL: '', MAX_CONN_PER_IP: 80, ACCOUNTS_REG_MAX: 60, REQUIRE_TERMS: '0', FILL_BOTS: '0' }), stdio: 'ignore' }); procs.push(srv2); await sleep(1800);
    const reg = async n => (await call('POST', '/api/auth/register', { username: n, email: n.toLowerCase() + '@e.com', password: 'Clave-Segura-77' })).j.token; const TJ = await reg('Juana_1'); await reg('Pablo_2');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, ''), js = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
    const w = new JSDOM(html, { runScripts: 'outside-only', url: B + '/admin' }).window; w.fetch = (u, o) => fetch(new URL(u, B + '/').href, Object.assign({}, o, { headers: Object.assign({ 'X-Forwarded-For': ip() }, o && o.headers) })); w.WebSocket = function () { this.close = () => {}; }; w.confirm = () => true; w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; w.eval(js);
    const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)], click = e => e.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })), setv = (e, v) => { e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const tab = async t => { click($('[data-tab=' + t + ']')); await sleep(60); return until(() => $('#view') && $('#view').textContent.length > 20 || $('main') && $('main').textContent.length > 40, 4000); };
    const btn = t => $$('button').find(b => b.textContent.trim() === t), txt = () => ($('#view') || $('main') || w.document.body).textContent;
    $('#lUser').value = 'Viexbox'; $('#lPass').value = APASS; $('#loginForm').dispatchEvent(new w.Event('submit', { cancelable: true })); ok(await until(() => !$('#app').hidden), 'se entra al panel');
    ok(['accounts', 'influencers', 'economy', 'launch'].every(t => $('[data-tab=' + t + ']')) && /Verificados/.test($('[data-tab=influencers]').textContent) && /Monedas y ventas/.test($('[data-tab=economy]').textContent), 'hay pestañas nuevas: Cuentas, Verificados ✔, Monedas y ventas y Antes de lanzar');
    await tab('influencers'); ok(await until(() => /Verificar ahora/.test(txt()) && /Qué recibe una cuenta verificada/.test(txt()) && /No hay ningún código/.test(txt())), 'Verificados: «Verificar ahora» y los beneficios, y dice que no hay ningún código');
    setv($('#vName'), 'Juana_1'); setv($('#vNote'), 'streamer'); click(btn('✔ Verificar ahora'));
    ok(await until(() => /Cuentas verificadas \(1\)/.test(txt()) && /Juana_1/.test(txt()) && /streamer/.test(txt())), 'escribir el nombre y pulsar el botón la verifica: sale en la lista con su nota');
    ok((await call('GET', '/api/profile?name=Juana_1', null, TJ)).j.profile.verified === 'acc', 'y en el servidor ya tiene el tic azul');
    setv($('#vName'), 'NadieAqui'); click(btn('✔ Verificar ahora')); ok(await until(() => $('#toast').classList.contains('bad') && /No existe ninguna cuenta/.test($('#toast').textContent)), 'un nombre que no existe da un aviso en rojo');
    setv($('#vBpx'), '35'); click(btn('Guardar beneficios')); ok(await until(() => $('#toast').textContent === 'Beneficios guardados') && (await call('GET', '/api/admin/verified', null, (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token)).j.cfg.bonusPx === 35, 'los beneficios se editan y se guardan (bono de PX al 35 %)');
    await tab('economy'); ok(await until(() => /Dar o quitar monedas/.test(txt()) && /Registrar una venta con dinero real/.test(txt()) && /Ingresos hoy/.test(txt()) && /Movimientos de monedas/.test(txt())), 'Monedas y ventas: ingresos, dar/quitar, venta con dinero real y movimientos');
    ok($('#cCur').textContent.includes('PX') && $('#cCur').textContent.includes('Créditos') && btn('＋ Dar') && btn('− Quitar') && btn('= Fijar saldo'), 'se puede elegir PX o Créditos y dar, quitar o fijar el saldo');
    setv($('#cName'), 'Pablo_2'); setv($('#cAmt'), '250'); setv($('#cWhy'), 'premio'); click(btn('＋ Dar')); ok(await until(() => /Pablo_2: \+250 PX → ahora 250/.test($('#toast').textContent)), 'dar 250 PX a Pablo_2: «' + $('#toast').textContent + '»');
    $('#cCur').value = 'cr'; setv($('#cName'), 'Pablo_2'); setv($('#cAmt'), '90'); click(btn('＋ Dar')); ok(await until(() => /\+90 Créditos → ahora 90/.test($('#toast').textContent)), 'y 90 Créditos: «' + $('#toast').textContent + '»');
    $('#cCur').value = 'cr'; setv($('#cName'), 'Pablo_2'); setv($('#cAmt'), '500'); click(btn('− Quitar'));   // la pantalla se repinta y el selector vuelve a PX: se elige otra vez ok(await until(() => /-90 Créditos → ahora 0/.test($('#toast').textContent)), 'quitar más de lo que tiene lo deja en 0 (nunca negativo)');
    setv($('#mName'), 'Pablo_2'); setv($('#mPx'), '800'); setv($('#mAmt'), '5.99'); setv($('#mNote'), 'PayPal'); click(btn('Registrar venta y entregar PX')); ok(await until(() => /Venta registrada: Pablo_2 recibe 800 PX/.test($('#toast').textContent)), 'registrar una venta de 5,99 € entrega los 800 PX');
    ok(await until(() => /5,99/.test(txt()) && /Venta manual/.test(txt()) && /Reembolsar/.test(txt()) && /Descargar CSV/.test(txt())), 'aparece en Pedidos (con «Reembolsar» y «Descargar CSV») y en los ingresos');
    click(btn('Reembolsar')); ok(await until(() => /Reembolsado/.test($('#toast').textContent) || /Reembolsado/.test(txt())), 'reembolsar desde el panel'); ok((await call('GET', '/api/me', null, (await call('POST', '/api/auth/login', { identifier: 'Pablo_2', password: 'Clave-Segura-77' })).j.token)).j.profile.px === 250, 'y le quita los 800 PX (vuelve a 250)');
    await tab('accounts'); ok(await until(() => /Cuentas \(2\)/.test(txt()) && /Juana_1/.test(txt()) && /Pablo_2/.test(txt()) && btn('Monedas') && /verificado|sin verificar/.test(txt())), 'Cuentas: lista con correo, saldos y botones');
    click($$('button').find(b => b.textContent.trim() === '✔ Verificar')); ok(await until(() => /verificado/.test($('#toast').textContent)), 'verificar desde la lista de cuentas con un clic');
    await tab('launch'); ok(await until(() => /Antes de lanzar/.test(txt()) && /Falta algo imprescindible/.test(txt()) && /Correo \(SMTP\)/.test(txt()) && /IMPRESCINDIBLE/.test(txt())), 'Antes de lanzar: dice qué falta (correo, almacenamiento, datos legales…)');
    ok(!$$('script').some(s => /error/i.test(s.textContent)), 'sin errores');
  } catch (e) { console.log('EXCEPCIÓN (panel)', e); failed++; }
  for (const p of procs) try { p.kill('SIGKILL'); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
