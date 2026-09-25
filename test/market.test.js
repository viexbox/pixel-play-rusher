'use strict';
/* Mercado de cosméticos con Créditos: anunciar, retirar, comprar, comisión, límites, carreras entre compradores, panel y persistencia.
   Se ejecuta con PostgreSQL (si hay uno accesible en PG_TEST_URL) y con archivos. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const S = require('../public/shared.js');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 40; const ip = () => '10.7.9.' + (ipn++);

async function scenario(label, port, dir, dbUrl) {
  console.log('\n=== Almacén: ' + label + ' ===');
  const B = 'http://127.0.0.1:' + port; fs.rmSync(dir, { recursive: true, force: true });
  const start = () => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: 'Mkt-Admin-2026xyz', MAX_CONN_PER_IP: 30, ACCOUNTS_REG_MAX: 50, TRADE_LOCK_HOURS: 0 }, dbUrl ? { DATABASE_URL: dbUrl } : { DATABASE_URL: '' }), stdio: 'ignore' }); procs.push(p); return p; };
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  let srv = start(); await sleep(dbUrl ? 2600 : 1600);
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77' })).j.token;
  const TA = await reg('Vende_1', 'a@e.com'), TB = await reg('Compra_2', 'b@e.com'), TC = await reg('Otro_3', 'c@e.com');
  const AD = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: 'Mkt-Admin-2026xyz' })).j.token, adm = (m, p, b) => call(m, '/api/admin' + p, b, AD);
  const cr = async tk => (await call('GET', '/api/me', null, tk)).j.profile.credits, inv = async tk => (await call('GET', '/api/bp', null, tk)).j.state;
  const cred = (u, d) => adm('POST', '/credits', { username: u, delta: d, reason: 'prueba' });

  /* ---- preparar: Vende_1 tiene todo el pase; Compra_2 y Otro_3 tienen Créditos ---- */
  await adm('POST', '/px', { username: 'Vende_1', delta: 8000, reason: 'prueba' }); await adm('POST', '/px', { username: 'Compra_2', delta: 8000, reason: 'prueba' });
  await call('POST', '/api/bp/buy', {}, TA); await call('POST', '/api/bp/skip', { levels: 49 }, TA); await call('POST', '/api/bp/claim-all', {}, TA);
  await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'ak_dragon' }, TA); await call('POST', '/api/bp/equip', { slot: 'banner', item: 's1' }, TA);
  ok((await inv(TA)).inventory.length === 23, 'Vende_1 parte con los 23 objetos del pase');
  r0 = await cred('Compra_2', 6000); ok(r0.status === 200 && r0.j.credits === 6000 && await cr(TB) === 6000, 'el panel ajusta Créditos (Compra_2: 6.000 CR)'); await cred('Otro_3', 6000); await cred('Vende_1', 10000);
  ok((await cred('Otro_3', -99999)).j.credits === 0 && (await cred('Otro_3', 6000)).j.credits === 6000, 'restar más de lo que hay deja el saldo en 0, nunca negativo');
  ok((await call('GET', '/api/me', null, TA)).j.profile.px === (await call('GET', '/api/me', null, TA)).j.profile.px && typeof (await call('GET', '/api/me', null, TA)).j.profile.credits === 'number', 'el perfil lleva dos monedas: PX y Créditos');

  /* ---- reglas al anunciar ---- */
  ok((await call('GET', '/api/market')).status === 401 && (await call('POST', '/api/market/list', {})).status === 401, 'sin sesión no se puede ver ni tocar el mercado');
  let r = await call('GET', '/api/market', null, TB); ok(r.status === 200 && r.j.total === 0 && r.j.fee === 0.1 && r.j.credits === 6000, 'mercado vacío al empezar; enseña la comisión (10 %) y tu saldo');
  ok((await call('POST', '/api/market/list', { t: 'oro', item: 'x', price: 100 }, TA)).status === 400 && (await call('POST', '/api/market/list', { t: 'kskin', item: 'k_clasico', price: 100 }, TA)).status === 400 && (await call('POST', '/api/market/list', { t: 'wskin', item: 'inventada', price: 100 }, TA)).status === 400, 'tipos, objetos inventados y el cuchillo base se rechazan');
  ok((await call('POST', '/api/market/list', { t: 'wskin', item: 'ak_dragon', price: 5000 }, TB)).status === 404, 'no se puede anunciar lo que no se tiene');
  r = await call('POST', '/api/market/list', { t: 'wskin', item: 'ak_dragon', price: 500 }, TA); ok(r.status === 400 && /1000/.test(r.j.error), 'un legendario tiene precio mínimo (1000 CR): ' + r.j.error);
  ok((await call('POST', '/api/market/list', { t: 'wskin', item: 'ak_dragon', price: 2000000 }, TA)).status === 400 && (await call('POST', '/api/market/list', { t: 'wskin', item: 'ak_dragon', price: -5 }, TA)).status === 400, 'y hay un tope de precio; los negativos se rechazan');
  r = await call('POST', '/api/market/list', { t: 'wskin', item: 'ak_dragon', price: 5000 }, TA); const L1 = r.j.id;
  ok(r.status === 200 && L1 > 0 && r.j.net === 4500, 'Vende_1 anuncia la AK Dragón a 5.000 CR (cobraría 4.500 tras la comisión)');
  let sa = await inv(TA); ok(!sa.inventory.some(i => i.id === 'ak_dragon') && !sa.equipped['weapon:ak'] && sa.inventory.length === 22, 'el objeto sale del inventario y deja de estar equipado (queda en depósito en el anuncio)');
  ok((await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'ak_dragon' }, TA)).status === 403, 'y mientras está a la venta no se puede equipar');
  ok((await call('POST', '/api/market/list', { t: 'wskin', item: 'ak_dragon', price: 5000 }, TA)).status === 404, 'ni anunciar dos veces');

  /* ---- límite de anuncios y búsqueda ---- */
  const more = [['wskin', 'duo_oro', 1500], ['wskin', 'lince_fantasma', 1200], ['kskin', 'k_oro', 1100], ['kskin', 'k_vacio', 1300], ['wskin', 'asalto_neon', 500], ['wskin', 'precision_eclipse', 450], ['wskin', 'trueno_tormenta', 420]];
  for (const [t, item, price] of more) await call('POST', '/api/market/list', { t, item, price }, TA);
  ok((await call('GET', '/api/market?mine=1', null, TA)).j.total === 8, 'Vende_1 llega a 8 anuncios');
  r = await call('POST', '/api/market/list', { t: 'kskin', item: 'k_lava', price: 500 }, TA); ok(r.status === 400 && /8/.test(r.j.error), 'el noveno se rechaza (máximo 8 anuncios): ' + r.j.error);
  r = await call('GET', '/api/market', null, TB); const d = r.j.listings.find(x => x.item === 'ak_dragon');
  ok(r.j.total === 8 && d && d.name === 'Dragón' && d.rarity === 'leyenda' && d.price === 5000 && d.net === 4500 && d.seller === 'Vende_1' && d.mine === false && d.weapon === 'ak', 'Compra_2 ve los anuncios con nombre, rareza, precio, lo que cobra el vendedor y quién vende');
  ok((await call('GET', '/api/market', null, TA)).j.listings.every(x => x.mine), 'y para Vende_1 todos son suyos');
  ok((await call('GET', '/api/market?t=kskin', null, TB)).j.listings.every(x => x.t === 'kskin') && (await call('GET', '/api/market?t=kskin', null, TB)).j.total === 2, 'filtro por tipo');
  ok((await call('GET', '/api/market?r=epico', null, TB)).j.listings.every(x => x.rarity === 'epico') && (await call('GET', '/api/market?q=drag', null, TB)).j.total === 1, 'filtro por rareza y búsqueda por nombre');
  const lo = (await call('GET', '/api/market?sort=low', null, TB)).j.listings.map(x => x.price), hi = (await call('GET', '/api/market?sort=high', null, TB)).j.listings.map(x => x.price);
  ok(lo.every((v, i) => !i || lo[i - 1] <= v) && hi.every((v, i) => !i || hi[i - 1] >= v), 'orden por precio ascendente y descendente');

  /* ---- comprar ---- */
  await cred('Compra_2', -6000); await cred('Compra_2', 100);
  r = await call('POST', '/api/market/buy', { id: L1 }, TB); ok(r.status === 402 && await cr(TB) === 100, 'sin Créditos suficientes no se compra y no se cobra nada');
  const crA0 = await cr(TA); r = await call('POST', '/api/market/buy', { id: L1 }, TA); ok(r.status === 400 && await cr(TA) === crA0, 'no se puede comprar el propio anuncio (y se devuelve lo cobrado)');
  ok((await call('POST', '/api/market/buy', { id: 999999 }, TB)).status === 404 && (await call('POST', '/api/market/buy', { id: 'x' }, TB)).status === 404, 'un anuncio inexistente da 404');
  await cred('Compra_2', 4900);   // 5.000 en total
  const total0 = (await cr(TA)) + (await cr(TB)) + (await cr(TC));
  r = await call('POST', '/api/market/buy', { id: L1 }, TB);
  ok(r.status === 200 && r.j.name === 'Dragón' && r.j.price === 5000 && await cr(TB) === 0, 'Compra_2 compra la AK Dragón por 5.000 CR');
  ok(await cr(TA) === crA0 + 4500, 'Vende_1 cobra 4.500 CR (5.000 menos el 10 % de comisión)');
  ok((await cr(TA)) + (await cr(TB)) + (await cr(TC)) === total0 - 500, 'la comisión (500 CR) desaparece de la economía: es un sumidero');
  ok((await inv(TB)).inventory.some(i => i.id === 'ak_dragon') && !(await inv(TA)).inventory.some(i => i.id === 'ak_dragon'), 'el objeto pasa al inventario del comprador y ya no está en el del vendedor');
  ok((await call('POST', '/api/bp/equip', { slot: 'weapon:ak', item: 'ak_dragon' }, TB)).j.state.equipped['weapon:ak'] === 'ak_dragon', 'y el comprador puede equiparlo');
  ok((await call('POST', '/api/market/buy', { id: L1 }, TC)).status === 404 && (await call('GET', '/api/market', null, TC)).j.total === 7, 'el anuncio vendido desaparece del mercado');

  /* ---- carrera: dos compradores a la vez por el mismo anuncio ---- */
  const dup = (await call('GET', '/api/market?q=fantasma', null, TB)).j.listings[0]; await cred('Compra_2', 1200); await cred('Otro_3', -6000 + 1200); const bBefore = await cr(TB), cBefore = await cr(TC);
  const [x1, x2] = await Promise.all([call('POST', '/api/market/buy', { id: dup.id }, TB), call('POST', '/api/market/buy', { id: dup.id }, TC)]);
  const wins = [x1, x2].filter(x => x.status === 200).length, loser = x1.status === 200 ? TC : TB;
  ok(wins === 1 && [x1, x2].some(x => x.status === 404), 'dos compradores a la vez: solo uno se lo lleva y el otro recibe «ya no está disponible»');
  ok(await cr(loser) === (loser === TB ? bBefore : cBefore) && (await cr(TB)) + (await cr(TC)) === bBefore + cBefore - 1200, 'al que pierde la carrera no se le cobra nada y el que gana paga una sola vez');
  /* ---- ya tienes ese objeto ---- */
  const ownedL = await call('POST', '/api/market/list', { t: 'wskin', item: 'asalto_neon', price: 500 }, TA); await call('POST', '/api/bp/claim-all', {}, TB);   // Compra_2 no tiene VIP: no lo tiene
  await cred('Otro_3', 1000); const o1 = await call('POST', '/api/market/buy', { id: (await call('GET', '/api/market?q=neón', null, TC)).j.listings.find(x => x.item === 'asalto_neon').id }, TC);
  const cAfter = await cr(TC); const again = await call('POST', '/api/market/list', { t: 'wskin', item: 'asalto_neon', price: 500 }, TC); const dupBuy = await call('POST', '/api/market/buy', { id: again.j.id }, TC);
  ok(o1.status === 200 && again.status === 200 && dupBuy.status === 400 && /propio|Ya tienes/.test(dupBuy.j.error), 'no se puede comprar algo que ya se tiene ni el propio anuncio (' + dupBuy.j.error + ')');

  /* ---- retirar ---- */
  const mine = (await call('GET', '/api/market?mine=1', null, TA)).j.listings; const lc = mine.find(x => x.item === 'duo_oro');
  ok((await call('POST', '/api/market/cancel', { id: lc.id }, TB)).status === 404 && (await call('GET', '/api/market', null, TA)).j.listings.some(x => x.id === lc.id), 'otro jugador no puede retirar tu anuncio');
  r = await call('POST', '/api/market/cancel', { id: lc.id }, TA); ok(r.status === 200 && r.j.state.inventory.some(i => i.id === 'duo_oro'), 'Vende_1 retira su anuncio y el objeto vuelve a su inventario');
  ok((await call('POST', '/api/market/cancel', { id: lc.id }, TA)).status === 404, 'y no se puede retirar dos veces');
  /* ---- conservación de objetos ---- */
  const nList = (await call('GET', '/api/market?mine=1', null, TA)).j.total, nInv = (await inv(TA)).inventory.length; ok(nList + nInv === 23 - 3, 'los objetos ni se crean ni se pierden: inventario (' + nInv + ') + anuncios (' + nList + ') = 20 (23 menos las 3 ventas)');

  /* ---- panel ---- */
  const pl = (await adm('GET', '/market')).j; ok(pl.listings.length >= 1 && pl.sales >= 2, 'el panel ve los anuncios y cuenta las ventas (' + pl.sales + ')');
  const tgt = pl.listings.find(x => x.item === 'k_oro'); const before = (await inv(TA)).inventory.length; r = await adm('POST', '/market/remove', { id: tgt.id }); ok(r.status === 200 && (await inv(TA)).inventory.length === before + 1, 'el administrador retira un anuncio y el objeto vuelve a su dueño');
  ok((await adm('GET', '/audit')).j.audit.some(a => a.action === 'mercado-retirar') && (await call('POST', '/api/admin/market/remove', { id: 1 })).status === 401, 'queda en la auditoría y exige sesión de administrador');

  /* ---- persistencia ---- */
  const snap = { a: await cr(TA), b: await cr(TB), l: (await call('GET', '/api/market', null, TA)).j.listings.map(x => x.id).join(), i: (await inv(TA)).inventory.length };
  await sleep(1800); srv.kill('SIGTERM'); await sleep(1200); srv = start(); await sleep(dbUrl ? 2600 : 1600);
  ok(await cr(TA) === snap.a && await cr(TB) === snap.b && (await call('GET', '/api/market', null, TA)).j.listings.map(x => x.id).join() === snap.l && (await inv(TA)).inventory.length === snap.i, 'tras reiniciar el servidor siguen los Créditos, los anuncios y los inventarios');
  if (dbUrl) {
    const { Client } = require('pg'); const c = new Client({ connectionString: dbUrl }); await c.connect();
    let e1 = '', e2 = ''; try { await c.query("INSERT INTO market_listings (seller, item_type, item_id, price) VALUES ('x', 'wskin', 'y', 0)"); } catch (e) { e1 = e.code; } try { await c.query("INSERT INTO market_listings (seller, item_type, item_id, price) VALUES ('x', 'oro', 'y', 5)"); } catch (e) { e2 = e.code; }
    ok(e1 === '23514' && e2 === '23514', 'la base de datos rechaza precios 0 y tipos inventados (restricciones CHECK)');
    ok((await c.query('SELECT count(*)::int AS n FROM market_sales')).rows[0].n >= 2 && (await c.query("SELECT id FROM schema_migrations WHERE id LIKE '003%'")).rowCount === 1, 'las ventas quedan registradas en market_sales y la migración 003 aplicada');
    await c.end();
  }
  srv.kill('SIGTERM'); await sleep(600);
}
let r0;
(async () => {
  let pgOk = false;
  try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('(PostgreSQL no disponible → solo archivos)'); }
  try { if (pgOk) await scenario('PostgreSQL', 3280, '/tmp/ppr_mk_pg', PG_URL); await scenario('archivos JSON', 3281, '/tmp/ppr_mk_file', null); } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
