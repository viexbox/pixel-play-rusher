'use strict';
/* Pago manual por PayPal: el jugador pide un paquete, ve el correo de PayPal, el código de pedido y el Discord;
   el administrador entrega los PX (o cancela) desde el panel. Sin PAYPAL_EMAIL no aparece. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
const PASS = 'Paypal-Admin-2026xy';
function start(port, extra) {
  const dir = '/tmp/ppr_paypal_' + port; fs.rmSync(dir, { recursive: true, force: true });
  const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: PASS, DATABASE_URL: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', PUBLIC_URL: '', REQUIRE_TERMS: '0', PAYPAL_EMAIL: '', PAYPAL_ME: '', DISCORD_TICKET_URL: '' }, extra), stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; }); procs.push(p); return p;
}
const call = async (port, method, p, body, token) => {
  const r = await fetch('http://127.0.0.1:' + port + p, { method, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': '10.3.3.' + (1 + Math.floor(Math.random() * 200)) }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};

(async () => {
  try {
    /* Sin configurar */
    let srv = start(3281, {}); await sleep(1500);
    let r = await call(3281, 'GET', '/api/store'); ok(r.j.paypal === null, 'sin PAYPAL_EMAIL la tienda no ofrece PayPal');
    let T = (await call(3281, 'POST', '/api/auth/register', { username: 'Comprador_0', email: 'c0@b.com', password: 'Clave-Segura-77' })).j.token;
    r = await call(3281, 'POST', '/api/store/paypal', { pack: 'px500' }, T); ok(r.status === 503, 'y pedir por PayPal da 503');
    srv.kill(); await sleep(300);

    /* Configurado */
    const P = 3282; srv = start(P, { PAYPAL_EMAIL: 'pagos@krunxa.com', PAYPAL_ME: 'Krunxa', DISCORD_TICKET_URL: 'https://discord.gg/ticketsKX' }); await sleep(1500);
    r = await call(P, 'GET', '/api/store');
    ok(r.j.enabled === false && r.j.paypal && r.j.paypal.email === 'pagos@krunxa.com' && r.j.paypal.me === 'Krunxa' && r.j.paypal.discord === 'https://discord.gg/ticketsKX', 'con PAYPAL_EMAIL la tienda ofrece PayPal (correo, PayPal.me y Discord) aunque Stripe esté apagado');
    r = await call(P, 'POST', '/api/store/paypal', { pack: 'px500' }); ok(r.status === 401, 'hace falta una cuenta online');
    T = (await call(P, 'POST', '/api/auth/register', { username: 'Comprador_1', email: 'c1@b.com', password: 'Clave-Segura-77' })).j.token;
    const px0 = (await call(P, 'GET', '/api/me', null, T)).j.profile.px;
    r = await call(P, 'POST', '/api/store/paypal', { pack: 'nada' }, T); ok(r.status === 400, 'un paquete inventado se rechaza');
    r = await call(P, 'POST', '/api/store/paypal', { pack: 'px500' }, T); const o = r.j.order || {};
    ok(r.status === 200 && /^KX-[0-9A-F]{6}$/.test(o.code) && o.px === 500 && o.amount === 99 && o.email === 'pagos@krunxa.com', 'el pedido da un código KX-XXXXXX, los PX, el importe y el correo (' + o.code + ')');
    r = await call(P, 'POST', '/api/store/paypal', { pack: 'px500' }, T); ok(r.j.order && r.j.order.code === o.code, 'pedir otra vez el mismo paquete devuelve el mismo código (no se acumulan pedidos)');
    const o2 = (await call(P, 'POST', '/api/store/paypal', { pack: 'px1300' }, T)).j.order;
    await call(P, 'POST', '/api/store/paypal', { pack: 'px3500' }, T);
    r = await call(P, 'POST', '/api/store/paypal', { pack: 'px8000' }, T); ok(r.status === 429, 'como mucho 3 pedidos de PayPal pendientes por cuenta');
    ok(/Pedido PayPal KX-[0-9A-F]{6}: Comprador_1 · 500 PX · 0\.99 EUR/.test(srv.out), 'cada pedido queda en el registro del servidor');
    ok((await call(P, 'GET', '/api/me', null, T)).j.profile.px === px0, 'pedir NO da PX: solo los entrega el administrador');

    /* Panel de administración */
    const A = (await call(P, 'POST', '/api/admin/login', { user: 'Viexbox', password: PASS })).j.token; ok(!!A, 'el administrador entra al panel');
    r = await call(P, 'GET', '/api/admin/sales', null, A);
    const row = (r.j.orders_list || []).find(x => x.id === o.code);
    ok(row && row.status === 'paypal' && row.user === 'Comprador_1' && r.j.orders.pending === 3 && r.j.revenue.all && !Object.keys(r.j.revenue.all).length, 'el panel lista el pedido como PayPal pendiente y no lo cuenta como ingreso');
    r = await call(P, 'POST', '/api/admin/orders/deliver', { id: o.code }); ok(r.status === 401, 'entregar exige sesión de administrador');
    r = await call(P, 'POST', '/api/admin/orders/deliver', { id: o.code }, A); ok(r.status === 200 && r.j.order.status === 'manual', 'el administrador entrega los PX');
    ok((await call(P, 'GET', '/api/me', null, T)).j.profile.px === px0 + 500, 'la cuenta recibe exactamente los PX del paquete');
    r = await call(P, 'POST', '/api/admin/orders/deliver', { id: o.code }, A); ok(r.status === 400, 'no se puede entregar dos veces el mismo pedido');
    ok((await call(P, 'GET', '/api/me', null, T)).j.profile.px === px0 + 500, 'y el saldo no cambia');
    r = await call(P, 'POST', '/api/admin/orders/cancel', { id: o2.code }, A); ok(r.status === 200, 'el administrador cancela otro pedido');
    r = await call(P, 'POST', '/api/admin/orders/deliver', { id: o2.code }, A); ok(r.status === 400, 'un pedido cancelado ya no se puede entregar');
    r = await call(P, 'GET', '/api/admin/sales', null, A);
    ok(r.j.orders.manual === 1 && r.j.orders.pending === 1 && r.j.revenue.all.eur === 99, 'tras entregar cuenta como venta (0,99 €) y quedan 1 pendiente');
    r = await call(P, 'GET', '/api/admin/audit', null, A);
    ok(JSON.stringify(r.j).includes('paypal-entregado'), 'la entrega queda en la auditoría');
    srv.kill();
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
