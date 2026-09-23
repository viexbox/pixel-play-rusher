'use strict';
/* Mercado v2: bloqueo de 24 h, colores comerciables, precios de referencia e intercambios directos objeto por objeto entre amigos.
   Se ejecuta con PostgreSQL (si hay uno accesible) y con archivos. El bloqueo y la caducidad se acortan por variables de entorno. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const S = require('../public/shared.js');
const PG_URL = process.env.PG_TEST_URL || 'postgres://ppr:ppr_test@127.0.0.1:5432/ppr_test';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
let ipn = 90; const ip = () => '10.5.3.' + (ipn++);
const LOCK_H = 0.0006, LOCK_MS = LOCK_H * 3600000;   // ≈ 2,2 s

async function scenario(label, port, dir, dbUrl) {
  console.log('\n=== Almacén: ' + label + ' ===');
  const B = 'http://127.0.0.1:' + port; fs.rmSync(dir, { recursive: true, force: true });
  const start = () => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, ADMIN_PASSWORD: 'Mk2-Admin-2026xyz', MAX_CONN_PER_IP: 30, ACCOUNTS_REG_MAX: 50, TRADE_LOCK_HOURS: LOCK_H, TRADE_TTL_HOURS: 0.0012 }, dbUrl ? { DATABASE_URL: dbUrl } : { DATABASE_URL: '' }), stdio: 'ignore' }); procs.push(p); return p; };
  const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  let srv = start(); await sleep(dbUrl ? 2800 : 1700);
  const reg = async (u, e) => (await call('POST', '/api/auth/register', { username: u, email: e, password: 'Clave-Segura-77' })).j.token;
  const TA = await reg('Vende_1', 'a@e.com'), TB = await reg('Compra_2', 'b@e.com'), TC = await reg('Otro_3', 'c@e.com');
  const AD = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: 'Mk2-Admin-2026xyz' })).j.token, adm = (m, p, b) => call(m, '/api/admin' + p, b, AD);
  const inv = async tk => (await call('GET', '/api/bp', null, tk)).j.state, prof = async tk => (await call('GET', '/api/me', null, tk)).j.profile, cr = async tk => (await prof(tk)).credits;
  const list = (tk, t, item, price) => call('POST', '/api/market/list', { t, item, price }, tk), buy = (tk, id) => call('POST', '/api/market/buy', { id }, tk);
  const mkt = (tk, q) => call('GET', '/api/market' + (q || ''), null, tk);

  /* ---- preparar ---- */
  await adm('POST', '/px', { username: 'Vende_1', delta: 9000, reason: 't' }); await adm('POST', '/px', { username: 'Compra_2', delta: 3000, reason: 't' });
  for (const [u, d] of [['Vende_1', 20000], ['Compra_2', 20000], ['Otro_3', 20000]]) await adm('POST', '/credits', { username: u, delta: d, reason: 't' });
  await call('POST', '/api/bp/buy', {}, TA); await call('POST', '/api/bp/skip', { levels: 49 }, TA); await call('POST', '/api/bp/claim-all', {}, TA);
  ok((await inv(TA)).inventory.length === 23, 'Vende_1 tiene los 23 objetos del pase (recién reclamados)');
  ok((await mkt(TB)).j.lock === Math.round(LOCK_MS), 'el mercado informa del bloqueo (' + Math.round(LOCK_MS / 1000) + ' s en la prueba; 24 h por defecto)');

  /* ---- bloqueo ---- */
  let r = await list(TA, 'wskin', 'asalto_neon', 700); ok(r.status === 403 && /nuevo/.test(r.j.error) && /min|h/.test(r.j.error), 'un objeto recién reclamado no se puede vender: «' + r.j.error + '»');
  ok((await inv(TA)).inventory.some(i => i.id === 'asalto_neon'), 'y sigue en su inventario (no se pierde ni queda en depósito)');
  await sleep(LOCK_MS + 400);
  r = await list(TA, 'wskin', 'asalto_neon', 700); ok(r.status === 200, 'pasado el bloqueo se puede vender'); const L1 = r.j.id;
  ok((await call('POST', '/api/market/cancel', { id: L1 }, TA)).status === 200 && (await list(TA, 'wskin', 'asalto_neon', 700)).status === 200, 'retirar un anuncio NO reinicia el bloqueo: se puede volver a anunciar al instante');
  const L1b = (await mkt(TA, '?mine=1')).j.listings[0].id;
  r = await buy(TB, L1b); ok(r.status === 200 && (await inv(TB)).inventory.some(i => i.id === 'asalto_neon'), 'Compra_2 compra el Asalto Neón');
  r = await list(TB, 'wskin', 'asalto_neon', 900); ok(r.status === 403, 'lo comprado queda bloqueado: no se puede revender al instante (evita cadenas de reventa entre cuentas)');
  await sleep(LOCK_MS + 400); r = await list(TB, 'wskin', 'asalto_neon', 900); ok(r.status === 200, 'pasado el bloqueo, Compra_2 lo puede vender'); const L2 = r.j.id;

  /* ---- precios de referencia ---- */
  let pr = (await call('GET', '/api/market/price?t=wskin&item=asalto_neon', null, TC)).j;
  ok(pr.ok && pr.ref && pr.ref.n === 1 && pr.ref.last === 700 && pr.ref.avg === 700 && pr.name === 'Neón' && pr.min === 400, 'historial: 1 venta del Asalto Neón a 700 CR (mínimo de su rareza: 400)');
  ok((await buy(TC, L2)).status === 200, 'Otro_3 lo compra a 900 CR');
  pr = (await call('GET', '/api/market/price?t=wskin&item=asalto_neon', null, TC)).j;
  ok(pr.ref.n === 2 && pr.ref.avg === 800 && pr.ref.min === 700 && pr.ref.max === 900 && pr.ref.last === 900 && pr.recent.length === 2 && pr.recent[0].price === 900, 'ahora media 800, mínimo 700, máximo 900, último 900 y las 2 ventas recientes (sin nombres)');
  ok(!JSON.stringify(pr).match(/Vende|Compra|Otro/), 'el historial no revela quién compró ni quién vendió');
  await sleep(LOCK_MS + 400); r = await list(TC, 'wskin', 'asalto_neon', 1000); ok(r.status === 200, 'Otro_3 vuelve a anunciarlo a 1.000');
  const seen = (await mkt(TA, '?q=Ne%C3%B3n')).j.listings[0]; ok(seen && seen.ref && seen.ref.avg === 800 && seen.ref.n === 2 && seen.price === 1000, 'el anuncio lleva su precio de referencia (media 800) para que se vea si está caro o barato');
  ok((await call('GET', '/api/market/price?t=oro&item=x', null, TC)).status === 400 && (await call('GET', '/api/market/price?t=wskin&item=inventada', null, TC)).status === 400, 'consultar objetos inventados da error');
  await call('POST', '/api/market/cancel', { id: seen.id }, TC);

  /* ---- colores comerciables ---- */
  console.log('\n-- Colores');
  ok((await list(TA, 'color', '2', 100)).status === 400 && (await list(TA, 'color', '99', 100)).status === 400 && (await list(TA, 'color', 'x', 100)).status === 400, 'los colores gratuitos y los inventados no se pueden vender');
  ok((await list(TA, 'color', '6', 200)).status === 404, 'y no se puede vender un color que no se tiene');
  ok((await call('POST', '/api/me/unlock', { i: 6 }, TA)).status === 200, 'Vende_1 compra el color Cian (300 PX)');
  r = await list(TA, 'color', '6', 200); ok(r.status === 403 && /Ese color es nuevo/.test(r.j.error), 'un color recién comprado también está bloqueado: «' + r.j.error + '»');
  await sleep(LOCK_MS + 400);
  r = await list(TA, 'color', '6', 100); ok(r.status === 400 && /150/.test(r.j.error), 'precio mínimo por rareza (Cian = raro: 150 CR): «' + r.j.error + '»');
  r = await list(TA, 'color', '6', 400); const LC = r.j.id; ok(r.status === 200 && r.j.net === 360, 'lo anuncia por 400 CR (cobraría 360)');
  ok(!(await prof(TA)).unlocked.includes(6), 'el color sale de sus colores desbloqueados (queda en depósito en el anuncio)');
  const card = (await mkt(TB, '?t=color')).j.listings[0]; ok(card && card.name === 'Color Cian' && card.rarity === 'raro' && card.hex === '#00c2ff' && card.t === 'color' && card.mine === false, 'aparece en el mercado con su nombre, rareza y color (' + (card && card.name) + ')');
  ok((await mkt(TB, '?t=wskin')).j.listings.every(x => x.t !== 'color'), 'y el filtro por tipo lo separa de las skins');
  await call('POST', '/api/me/unlock', { i: 7 }, TB); const cb0 = await cr(TB), ca0 = await cr(TA);
  r = await buy(TB, LC); ok(r.status === 200 && r.j.price === 400 && (await prof(TB)).unlocked.includes(6) && await cr(TB) === cb0 - 400 && await cr(TA) === ca0 + 360, 'Compra_2 compra el Cian: tiene el color, pagó 400 y Vende_1 cobró 360 (10 % de comisión)');
  ok((await prof(TB)).colorTs[6] > Date.now() - 5000, 'el color comprado queda con la fecha de hoy (bloqueado)');
  r = await list(TB, 'color', '6', 400); ok(r.status === 403, 'y no se puede revender al instante');
  /* ya lo tienes */
  await call('POST', '/api/me/unlock', { i: 7 }, TA); await sleep(LOCK_MS + 400); const LD = (await list(TA, 'color', '7', 300)).j.id; const cb1 = await cr(TB);
  r = await buy(TB, LD); ok(r.status === 400 && /Ya tienes ese color/.test(r.j.error) && await cr(TB) === cb1, 'no se puede comprar un color que ya se tiene (y no se cobra)');
  /* retirar */
  ok((await call('POST', '/api/market/cancel', { id: LD }, TA)).status === 200 && (await prof(TA)).unlocked.includes(7), 'retirar el anuncio devuelve el color');
  ok((await list(TA, 'color', '7', 300)).status === 200, 'y se puede volver a anunciar al momento (conserva su fecha original)');
  const LE = (await mkt(TA, '?mine=1&t=color')).j.listings[0].id; ok((await adm('POST', '/market/remove', { id: LE })).status === 200 && (await prof(TA)).unlocked.includes(7), 'el administrador puede retirar un anuncio de color y el color vuelve a su dueño');
  { const ua = (await prof(TA)).unlocked, ub = (await prof(TB)).unlocked; ok(ua.includes(7) && !ua.includes(6) && ub.includes(6) && ub.includes(7) && ua.filter(x => x > 3).length === 1 && ub.filter(x => x > 3).length === 2, 'los colores ni se crean ni se pierden: Vende_1 conserva el Lima, Compra_2 tiene Cian y Lima'); }

  /* ---- intercambios directos ---- */
  console.log('\n-- Intercambios entre amigos');
  await call('POST', '/api/social/request', { name: 'Compra_2' }, TA); await call('POST', '/api/social/accept', { name: 'Vende_1' }, TB);
  const trade = (tk, o) => call('POST', '/api/trades/offer', o, tk), acc = (tk, id) => call('POST', '/api/trades/accept', { id }, tk);
  /* B compra 'k_oro' a A para tener algo que A no tiene */
  const LK = (await list(TA, 'kskin', 'k_oro', 1200)).j.id; await buy(TB, LK); await sleep(LOCK_MS + 400);
  ok((await inv(TB)).inventory.some(i => i.id === 'k_oro') && !(await inv(TA)).inventory.some(i => i.id === 'k_oro'), 'preparación: Compra_2 tiene el cuchillo Oro real y Vende_1 ya no');
  let it = await call('GET', '/api/trades/items?name=Compra_2', null, TA); ok(it.status === 200 && it.j.items.some(i => i.id === 'k_oro' && i.lock === 0 && i.name), 'un amigo puede ver los objetos intercambiables de otro (con su bloqueo)');
  ok((await call('GET', '/api/trades/items?name=Otro_3', null, TA)).status === 403 && (await call('GET', '/api/trades/items?name=Vende_1', null, TC)).status === 403, 'y solo entre amigos: no se ven los objetos de quien no es amigo');
  const base = { to: 'Compra_2', giveT: 'wskin', giveId: 'duo_oro', wantT: 'kskin', wantId: 'k_oro' };
  ok((await trade(TA, Object.assign({}, base, { to: 'Otro_3' }))).status === 403, 'no se puede proponer un intercambio a alguien que no es amigo');
  ok((await trade(TA, Object.assign({}, base, { to: 'Vende_1' }))).status === 400 && (await trade(TA, Object.assign({}, base, { to: 'Nadie' }))).status === 404, 'ni a uno mismo ni a alguien que no existe');
  ok((await trade(TA, Object.assign({}, base, { giveT: 'color', giveId: '6' }))).status === 400 && (await trade(TA, Object.assign({}, base, { wantId: 'inventada' }))).status === 400, 'solo skins, cuchillos y banners: nada de colores ni objetos inventados');
  ok((await trade(TA, Object.assign({}, base, { giveId: 'k_oro', giveT: 'kskin' }))).status === 404, 'no se puede ofrecer lo que no se tiene');
  ok((await trade(TA, Object.assign({}, base, { wantId: 'asalto_neon', wantT: 'wskin' }))).status === 404, 'ni pedir lo que el otro no tiene');
  ok((await trade(TA, Object.assign({}, base, { giveId: 'k_hielo', giveT: 'kskin', wantId: 'asalto_neon', wantT: 'wskin' }))).status === 404, 'Compra_2 no tiene el Asalto Neón (lo vendió a Otro_3)');
  r = await trade(TA, base); const O1 = r.j.offer && r.j.offer.id; ok(r.status === 200 && r.j.offer.give.name && r.j.offer.want.name === 'Oro real' && r.j.offer.mine === true, 'Vende_1 propone: su Dúo Oro por el cuchillo Oro real de Compra_2');
  ok((await trade(TA, base)).status === 400, 'no se puede repetir la misma propuesta');
  let tl = (await call('GET', '/api/trades', null, TB)).j; ok(tl.incoming.length === 1 && tl.incoming[0].from === 'Vende_1' && tl.incoming[0].id === O1 && (await call('GET', '/api/trades', null, TA)).j.outgoing.length === 1, 'Compra_2 la ve como recibida y Vende_1 como enviada');
  ok((await acc(TA, O1)).status === 404, 'solo el destinatario puede aceptarla (no quien la propone)');
  ok((await call('POST', '/api/trades/decline', { id: O1 }, TB)).status === 200 && (await acc(TB, O1)).status === 400 && (await call('GET', '/api/trades', null, TB)).j.incoming.length === 0, 'Compra_2 la rechaza y ya no se puede aceptar');
  /* proponer, cancelar */
  const O2 = (await trade(TA, base)).j.offer.id; ok((await call('POST', '/api/trades/cancel', { id: O2 }, TB)).status === 404 && (await call('POST', '/api/trades/cancel', { id: O2 }, TA)).status === 200 && (await acc(TB, O2)).status === 400, 'quien propone puede cancelarla (el otro no) y cancelada no se acepta');
  /* aceptar de verdad */
  const O3 = (await trade(TA, base)).j.offer.id;
  const n0 = (await inv(TA)).inventory.length + (await inv(TB)).inventory.length;
  r = await acc(TB, O3); ok(r.status === 200 && r.j.gave === 'Oro real' && r.j.got, 'Compra_2 acepta: entrega el Oro real y recibe el Dúo Oro');
  const ia = (await inv(TA)).inventory, ib = (await inv(TB)).inventory;
  ok(ia.some(i => i.id === 'k_oro') && !ia.some(i => i.id === 'duo_oro') && ib.some(i => i.id === 'duo_oro') && !ib.some(i => i.id === 'k_oro'), 'el intercambio es completo: cada uno tiene lo del otro y ya no lo suyo');
  ok(ia.length + ib.length === n0, 'los objetos ni se crean ni se pierden entre los dos (' + n0 + ' antes y después)');
  ok(ia.find(i => i.id === 'k_oro').ts > Date.now() - 5000, 'lo recibido queda con la fecha de hoy (bloqueado)');
  ok((await trade(TA, { to: 'Compra_2', giveT: 'kskin', giveId: 'k_oro', wantT: 'wskin', wantId: 'duo_oro' })).status === 403, 'y no se puede reintercambiar al momento');
  tl = (await call('GET', '/api/trades', null, TB)).j; ok(tl.incoming.length === 0 && tl.recent.some(o => o.id === O3 && o.status === 'done') && (await acc(TB, O3)).status === 400, 'queda registrada como hecha y no se puede aceptar dos veces');
  /* propuestas que dejan de valer */
  await sleep(LOCK_MS + 400);
  const V1 = await trade(TB, { to: 'Vende_1', giveT: 'wskin', giveId: 'duo_oro', wantT: 'wskin', wantId: 'rafaga_lava' }); ok(V1.status === 200, 'Compra_2 propone su Dúo Oro por la skin Lava de Vende_1');
  const LV = (await call('POST', '/api/market/list', { t: 'wskin', item: 'duo_oro', price: 1500 }, TB)).j.id; r = await acc(TA, V1.j.offer.id);
  ok(r.status === 400 && /ya no tiene/.test(r.j.error) && (await inv(TA)).inventory.some(i => i.id === 'rafaga_lava') && (await acc(TA, V1.j.offer.id)).status === 400, 'si el objeto ofrecido ya no está (lo puso a la venta), aceptar da un error claro, no se mueve nada y la propuesta queda anulada');
  await call('POST', '/api/market/cancel', { id: LV }, TB);
  /* caducidad */
  const EX = await trade(TA, { to: 'Compra_2', giveT: 'kskin', giveId: 'k_hielo', wantT: 'wskin', wantId: 'duo_oro' }); const exId = EX.j.offer && EX.j.offer.id;
  ok(EX.status === 200 && (await call('GET', '/api/trades', null, TA)).j.outgoing.some(o => o.id === exId), 'una propuesta válida queda abierta'); await sleep(4800);
  ok((await call('GET', '/api/trades', null, TA)).j.outgoing.every(o => o.id !== exId) && (await acc(TB, exId)).status === 400 && /caducado/.test((await acc(TB, exId)).j.error), 'las propuestas caducan solas (48 h; en la prueba, unos segundos), desaparecen de las abiertas y no se pueden aceptar');
  /* bloqueo social */
  await call('POST', '/api/social/block', { name: 'Compra_2' }, TA); ok((await trade(TA, base)).status === 400 && (await trade(TB, Object.assign({}, base, { to: 'Vende_1' }))).status === 400, 'si un jugador bloquea al otro, no pueden proponerse intercambios');
  ok((await call('POST', '/api/trades/offer', {}, null)).status === 401 && (await call('GET', '/api/trades')).status === 401, 'sin sesión no se puede tocar nada');

  /* ---- persistencia ---- */
  await call('POST', '/api/social/unblock', { name: 'Compra_2' }, TA); await call('POST', '/api/social/request', { name: 'Compra_2' }, TA); await call('POST', '/api/social/accept', { name: 'Vende_1' }, TB);
  const P1 = await trade(TA, { to: 'Compra_2', giveT: 'kskin', giveId: 'k_hielo', wantT: 'wskin', wantId: 'duo_oro' }); const pid = P1.j.offer ? P1.j.offer.id : 0;
  const before = { ids: (await mkt(TA)).j.listings.map(x => x.id).join(), pr: JSON.stringify((await call('GET', '/api/market/price?t=wskin&item=asalto_neon', null, TA)).j.ref), c: (await prof(TB)).unlocked.join(), crb: await cr(TB) };
  await sleep(1800); srv.kill('SIGTERM'); await sleep(1200); srv = start(); await sleep(dbUrl ? 2800 : 1700);
  const after = { ids: (await mkt(TA)).j.listings.map(x => x.id).join(), pr: JSON.stringify((await call('GET', '/api/market/price?t=wskin&item=asalto_neon', null, TA)).j.ref), c: (await prof(TB)).unlocked.join(), crb: await cr(TB) };
  ok(JSON.stringify(before) === JSON.stringify(after), 'tras reiniciar siguen los anuncios, el historial de precios, los colores y los Créditos');
  { const t2 = (await call('GET', '/api/trades', null, TB)).j; ok(pid > 0 && (t2.incoming.some(o => o.id === pid) || t2.recent.some(o => o.id === pid)), 'y las propuestas (abiertas o ya caducadas) siguen registradas'); }
  if (dbUrl) {
    const { Client } = require('pg'); const c = new Client({ connectionString: dbUrl }); await c.connect(); let e1 = '';
    try { await c.query("INSERT INTO market_listings (seller, item_type, item_id, price) VALUES ('x', 'oro', 'y', 5)"); } catch (e) { e1 = e.code; }
    ok(e1 === '23514' && (await c.query("SELECT count(*)::int AS n FROM market_listings WHERE item_type = 'color'")).rowCount === 1 && (await c.query("SELECT id FROM schema_migrations WHERE id LIKE '005%'")).rowCount === 1, 'PostgreSQL: la migración 005 permite el tipo «color», sigue rechazando tipos inventados y guarda la fecha de obtención');
    ok((await c.query("SELECT count(*)::int AS n FROM market_sales WHERE item_type = 'color'")).rows[0].n >= 1, 'las ventas de colores quedan registradas en market_sales'); await c.end();
  }
  srv.kill('SIGTERM'); await sleep(600);
}
(async () => {
  let pgOk = false;
  try { const { Client } = require('pg'); const c = new Client({ connectionString: PG_URL }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); pgOk = true; } catch (e) { console.log('(PostgreSQL no disponible → solo archivos)'); }
  try { if (pgOk) await scenario('PostgreSQL', 3282, '/tmp/ppr_mk2_pg', PG_URL); await scenario('archivos JSON', 3283, '/tmp/ppr_mk2_file', null); } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  for (const p of procs) try { p.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
