'use strict';
/* [REGALOS ADMIN] El administrador regala o quita objetos (cuchillos de la ruleta y del pase, trajes, mascotas, skins, banners) a una cuenta
   desde el panel: queda en el inventario, en la auditoría, y al quitarlo también se desequipa. Contra archivos y, si hay, PostgreSQL. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const S = require('../public/shared.js');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
const APASS = 'Gifts-Admin-2026xy';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 20; const ip = () => '10.9.8.' + (ipn++);

async function scenario(label, port, dir, dbUrl) {
  console.log('\n=== Almacén: ' + label + ' ===');
  const B = 'http://127.0.0.1:' + port;
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: APASS, REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: dbUrl || '' }), stdio: 'ignore' }); procs.push(srv);
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  await sleep(dbUrl ? 2200 : 1400);
  const T = (await call('POST', '/api/auth/register', { username: 'Regalo_7', email: 'regalo@e.com', password: 'Clave-Segura-77', terms: true })).j.token;
  const A = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
  const adm = (m, p, b) => call(m, '/api/admin' + p, b, A), inv = async () => (await call('GET', '/api/bp', null, T)).j.state;
  const K = S.KNIFE_SKINS.find(k => k.id === 'k_karambit_plasma'), O = S.OUTFITS[0], P = S.PETS[0];

  ok((await call('POST', '/api/admin/bp/give', { username: 'Regalo_7', t: 'kskin', id: K.id })).status === 401, 'sin sesión de administrador no se regala nada');
  const cat = (await adm('GET', '/bp/items')).j.groups || [];
  const all = cat.flatMap(g => g.items);
  ok(cat.some(g => /ruleta/.test(g.n) && g.items.length === S.KNIFE_SKINS.filter(k => k.ru).length) && all.some(x => x.t === 'outfit') && all.some(x => x.t === 'pet') && all.some(x => x.t === 'wskin') && !all.some(x => x.id === 'k_clasico'),
    'el catálogo del panel trae cuchillos de la ruleta, trajes, mascotas y skins (' + cat.map(g => g.n + ' ' + g.items.length).join(', ') + ')');
  let r = await adm('POST', '/bp/give', { username: 'Regalo_7', t: 'kskin', id: K.id, reason: 'sorteo Discord' });
  ok(r.status === 200 && (await inv()).inventory.some(i => i.t === 'kskin' && i.id === K.id), 'regalar el ' + K.n + ': aparece en su inventario');
  ok((await adm('POST', '/bp/give', { username: 'Regalo_7', t: 'kskin', id: K.id })).status === 409, 'regalarlo otra vez avisa de que ya lo tiene');
  for (const [t, d] of [['outfit', O], ['pet', P]]) { r = await adm('POST', '/bp/give', { username: 'regalo_7', t, id: d.id }); ok(r.status === 200, 'también se regalan ' + (t === 'pet' ? 'mascotas' : 'trajes') + ' (' + d.n + ')'); }
  ok((await adm('POST', '/bp/give', { username: 'Regalo_7', t: 'kskin', id: 'k_clasico' })).status === 400 && (await adm('POST', '/bp/give', { username: 'Regalo_7', t: 'kskin', id: 'nada' })).status === 400 && (await adm('POST', '/bp/give', { username: 'Regalo_7', t: 'px', id: '500' })).status === 400, 'objetos inventados, el cuchillo básico o tipos raros se rechazan');
  ok((await adm('POST', '/bp/give', { username: 'NoExiste_1', t: 'kskin', id: K.id })).status === 404, 'una cuenta que no existe da error');
  ok((await call('POST', '/api/bp/equip', { slot: 'knife', item: K.id }, T)).status === 200, 'el jugador puede equiparse el cuchillo regalado');
  r = await adm('POST', '/bp/take', { username: 'Regalo_7', t: 'kskin', id: K.id, reason: 'error' });
  const st = await inv();
  ok(r.status === 200 && !st.inventory.some(i => i.id === K.id) && st.equipped.knife !== K.id, 'quitarlo lo borra del inventario y se lo desequipa');
  ok((await adm('POST', '/bp/take', { username: 'Regalo_7', t: 'kskin', id: K.id })).status === 409, 'quitar algo que no tiene avisa');
  const au = JSON.stringify((await adm('GET', '/audit')).j);
  ok(au.includes('objeto-regalado') && au.includes('objeto-quitado') && au.includes('sorteo Discord'), 'regalos y retiradas quedan en la auditoría con el motivo');
  srv.kill(); await sleep(300);
}

(async () => {
  try {
    const base = fs.mkdtempSync('/tmp/ppr-gifts-');
    await scenario('archivos', 3961, path.join(base, 'files'), '');
    let pgOk = false; try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('\n(sin PostgreSQL accesible: ' + e.message + ' — solo se prueba con archivos)'); }
    if (pgOk) await scenario('PostgreSQL', 3962, path.join(base, 'pg'), PG_URL);
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
