'use strict';
/* La tienda solo se abre con clave + dirección pública + secreto del webhook; el estado se ve en /api/status y en el registro del servidor. */
const { spawn } = require('child_process'); const path = require('path');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
async function run(port, extra) {
  const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: '/tmp/ppr_gate_' + port, ADMIN_PASSWORD: 'Gate-Admin-2026xy', DATABASE_URL: '', STRIPE_SECRET_KEY: '', PUBLIC_URL: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_PAYMENT_METHODS: '' }, extra), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; }); procs.push(p); await sleep(1500);
  const st = await (await fetch('http://127.0.0.1:' + port + '/api/status')).json(), store = await (await fetch('http://127.0.0.1:' + port + '/api/store')).json();
  p.kill(); await sleep(300); return { st, store, out };
}
(async () => {
  try {
    let r = await run(3260, {});
    ok(r.st.store === false && r.store.enabled === false && /desactivada \(sin configurar Stripe\)/.test(r.out), 'sin nada configurado: tienda desactivada');
    r = await run(3261, { STRIPE_SECRET_KEY: 'sk_test_x', PUBLIC_URL: 'https://juego.example' });
    ok(r.st.store === false && r.store.enabled === false && /Faltan las variables: STRIPE_WEBHOOK_SECRET/.test(r.out), 'con clave y URL pero SIN secreto del webhook la tienda NO se abre (evita cobrar sin poder dar los PX) y el registro dice qué falta');
    r = await run(3262, { STRIPE_SECRET_KEY: 'sk_test_x', PUBLIC_URL: 'https://juego.example', STRIPE_WEBHOOK_SECRET: 'whsec_x' });
    ok(r.st.store === true && r.store.enabled === true && JSON.stringify(r.store.methods) === '["card","paypal"]' && /ACTIVADA \(métodos: card, paypal\)/.test(r.out), 'con las tres variables: activada, solo con tarjeta y PayPal, y así lo dicen /api/status y el registro');
    r = await run(3263, { STRIPE_SECRET_KEY: 'sk_test_x', PUBLIC_URL: 'https://juego.example', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PAYMENT_METHODS: 'auto' });
    ok(r.store.enabled === true && r.store.methods.length === 0 && /los del panel de Stripe/.test(r.out), 'con STRIPE_PAYMENT_METHODS=auto decide el panel de Stripe');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
