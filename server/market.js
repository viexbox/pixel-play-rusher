'use strict';
/* PixelPlayRusher · Mercado de cosméticos y intercambios entre jugadores.
   - Se comercia con Créditos (la moneda que solo se gana jugando y vendiendo), nunca con PX: así no se venden objetos por dinero real entre jugadores.
   - Se pueden vender las skins, cuchillos y banners del pase y los colores de pago (no los 4 colores gratuitos).
   - Al anunciar, el objeto sale del inventario (y de lo equipado) y queda en depósito en el anuncio; al retirarlo vuelve, al venderse pasa al comprador.
   - Bloqueo: un objeto recién conseguido (pase, regalo, compra o intercambio) no se puede vender ni intercambiar hasta pasadas TRADE_LOCK_HOURS (24 por defecto).
     Frena a quien abre cuentas solo para vender lo que reclama gratis. Retirar un anuncio no reinicia el bloqueo.
   - Comisión del 10 % (se destruye: es un sumidero de Créditos), precio mínimo por rareza, máximo 8 anuncios por jugador.
   - Precios de referencia: media, último, mínimo y máximo de las ventas de los últimos 30 días de cada objeto.
   - Intercambio directo entre AMIGOS, objeto por objeto (solo skins/cuchillos/banners): propuesta, aceptar/rechazar/cancelar, caduca a las 48 h y se hace en una única
     transacción (o cambian los dos o no cambia nada).
   - Cada operación se hace bajo el candado de los jugadores implicados (siempre en el mismo orden, sin bloqueos) y con devolución si algo falla.
   Rutas: GET /api/market · GET /api/market/price · POST /api/market/{list,cancel,buy} · GET /api/trades · GET /api/trades/items · POST /api/trades/{offer,accept,decline,cancel}
   Panel: GET /api/admin/market, POST /api/admin/market/remove */

const path = require('path');
const { Store } = require('./admin.js');
const TYPES = ['wskin', 'kskin', 'banner', 'color'], PASS_TYPES = ['wskin', 'kskin', 'banner'];

function createMarket({ S, accounts, bp, admin, dataDir, log, env }) {
  env = env || process.env;
  const store = bp.store, err = (code, error) => ({ code, error }), M = S.MARKET;
  const LOCK_MS = (env.TRADE_LOCK_HOURS !== undefined && env.TRADE_LOCK_HOURS !== '' ? +env.TRADE_LOCK_HOURS : 24) * 3600000;
  const TRADE_TTL = (+env.TRADE_TTL_HOURS || 48) * 3600000, MAX_OUT = 10, MAX_IN = 20, PRICE_DAYS = 30;
  const trades = new Store(path.join(dataDir, 'trades.json'), { seq: 0, offers: [] }, log);   // ofertas de intercambio (con PostgreSQL viven en la base de datos)
  const rarName = r => S.RARITY[r].n, hrs = ms => { const h = Math.ceil(ms / 3600000); return h >= 1 ? h + ' h' : Math.max(1, Math.ceil(ms / 60000)) + ' min'; };
  const lockBoth = (a, b, fn) => { const ids = [...new Set([a, b])].sort(); return ids.length === 1 ? bp.lock(ids[0], fn) : bp.lock(ids[0], () => bp.lock(ids[1], fn)); };

  /* Definición de un objeto comerciable: nombre, rareza y (si es del pase) su arma */
  function defOf(t, id) {
    if (t === 'color') { const i = +id; return Number.isInteger(i) && S.COLOR_COSTS[i] > 0 ? { n: 'Color ' + S.COLOR_NAMES[i], r: S.colorRarity(i), hex: S.COLOR_HEX[i] } : null; }
    const d = S.bpFind({ t, id }); return d && !d.base ? d : null;
  }
  const lockLeft = (obtained, now) => (LOCK_MS && obtained && now - obtained < LOCK_MS ? obtained + LOCK_MS - now : 0);
  const colorObtained = (u, i) => (u.colorTs && u.colorTs[i]) || 0;

  /* Precios de referencia: ventas de los últimos 30 días agrupadas por objeto */
  async function priceIndex() {
    const since = Date.now() - PRICE_DAYS * 86400000, idx = new Map();
    for (const s of (await store.marketRecent(2000)).filter(x => x.ts >= since)) {
      const k = s.t + ':' + s.item, e = idx.get(k) || { n: 0, sum: 0, last: s.price, lastTs: s.ts, min: s.price, max: s.price };
      e.n++; e.sum += s.price; e.min = Math.min(e.min, s.price); e.max = Math.max(e.max, s.price); if (s.ts >= e.lastTs) { e.last = s.price; e.lastTs = s.ts; } idx.set(k, e);
    }
    for (const e of idx.values()) e.avg = Math.round(e.sum / e.n);
    return idx;
  }
  const refOf = (idx, t, id) => { const e = idx.get(t + ':' + id); return e ? { n: e.n, avg: e.avg, last: e.last, min: e.min, max: e.max } : null; };

  const describe = (l, me, idx) => {
    const def = defOf(l.t, l.item); if (!def) return null; const seller = accounts.findById(l.seller);
    return { id: l.id, t: l.t, item: l.item, name: def.n, rarity: def.r, weapon: def.w || '', hex: def.hex || '', price: l.price, net: l.price - Math.floor(l.price * M.FEE), seller: seller ? seller.username : '¿?', mine: !!me && l.seller === me.id, ts: l.ts, ref: idx ? refOf(idx, l.t, l.item) : null };
  };

  async function browse(u, q) {
    const idx = await priceIndex();
    let list = (await store.marketListings()).map(l => describe(l, u, idx)).filter(Boolean);
    if (q.mine === '1') list = list.filter(x => x.mine);
    if (TYPES.includes(q.t)) list = list.filter(x => x.t === q.t);
    if (S.RARITY[q.r]) list = list.filter(x => x.rarity === q.r);
    const text = String(q.q || '').trim().toLowerCase(); if (text) list = list.filter(x => x.name.toLowerCase().includes(text) || x.seller.toLowerCase().includes(text));
    const by = { low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, rarity: (a, b) => S.RARITY[b.rarity].ord - S.RARITY[a.rarity].ord || a.price - b.price, new: (a, b) => b.ts - a.ts }[q.sort] || ((a, b) => b.ts - a.ts);
    return { total: list.length, listings: list.sort(by).slice(0, 200) };
  }

  /* ---------------- Mercado ---------------- */
  const ops = {
    async list(u, b) {
      const t = String(b.t || ''), id = String(b.item || ''), price = Math.trunc(+b.price);
      if (!TYPES.includes(t)) return err(400, 'Tipo de objeto no válido.');
      const def = defOf(t, id); if (!def) return err(400, t === 'color' ? (S.COLOR_COSTS[+id] === null ? 'Los colores de rango son exclusivos: no se venden ni se intercambian.' : 'Ese color no se puede vender (los 4 colores gratuitos no se comercian).') : 'Objeto no válido.');
      const min = M.MIN_PRICE[def.r]; if (!Number.isFinite(price) || price < min) return err(400, 'El precio mínimo de un objeto ' + rarName(def.r).toLowerCase() + ' es ' + min + ' CR.');
      if (price > M.MAX_PRICE) return err(400, 'El precio máximo es ' + M.MAX_PRICE + ' CR.');
      let r;
      if (t === 'color') {   // los colores viven en la cuenta: se anuncia primero y luego se quita de la cuenta (si algo falla, no se pierde)
        const i = +id; if (!u.unlocked.includes(i)) return err(404, 'No tienes ese color.');
        const ob = colorObtained(u, i), left = lockLeft(ob, Date.now()); if (left) return err(403, 'Ese color es nuevo: podrás venderlo dentro de ' + hrs(left) + '.');
        r = await store.marketList(u.id, t, id, price, M.MAX_LISTINGS, { noInv: true, obtained: ob || 1 });
        if (!r.error) accounts.takeColor(u, i);
      } else r = await store.marketList(u.id, t, id, price, M.MAX_LISTINGS, { lockMs: LOCK_MS });
      if (r.error === 'no-item') return err(404, 'No tienes ese objeto.'); if (r.error === 'limit') return err(400, 'Solo puedes tener ' + M.MAX_LISTINGS + ' anuncios a la vez.');
      if (r.error === 'locked') return err(403, 'Ese objeto es nuevo: podrás venderlo dentro de ' + hrs(r.until - Date.now()) + '.');
      return { ok: true, id: r.id, net: price - Math.floor(price * M.FEE), state: await bp.view(u) };
    },
    async cancel(u, b) {
      const r = await store.marketCancel(u.id, Math.trunc(+b.id)); if (r.error) return err(404, 'Ese anuncio ya no existe.');
      if (r.t === 'color') accounts.giveColor(u, +r.item, r.obtained || 1);   // vuelve con su fecha original: retirar no reinicia el bloqueo
      return { ok: true, state: await bp.view(u) };
    },
    async buy(u, b) {
      const id = Math.trunc(+b.id), l = (await store.marketListings()).find(x => x.id === id); if (!l) return err(404, 'Ese anuncio ya no está disponible.');
      const def = defOf(l.t, l.item), seller = accounts.findById(l.seller), name = def ? def.n : l.item;
      return lockBoth(u.id, l.seller, async () => {
        if (l.t === 'color' && u.unlocked.includes(+l.item)) return err(400, 'Ya tienes ese color.');
        if (!accounts.spendCr(u, l.price, 'Mercado: compra de ' + name)) return err(402, 'Te faltan ' + (l.price - u.credits) + ' CR.');
        let r; try { r = await store.marketBuy(u.id, id, M.FEE); } catch (e) { accounts.grantCr(u, l.price, 'reembolso mercado'); log('Mercado: ' + e.message); return err(500, 'No se pudo completar la compra. No se ha cobrado nada.'); }
        if (r.error) { accounts.grantCr(u, l.price, 'reembolso mercado'); return err(r.error === 'gone' ? 404 : 400, { gone: 'Ese anuncio ya no está disponible.', self: 'No puedes comprar tu propio anuncio.', owned: 'Ya tienes ese objeto.' }[r.error]); }
        if (r.listing.t === 'color') accounts.giveColor(u, +r.listing.item, Date.now());   // el color comprado queda bloqueado 24 h como cualquier objeto nuevo
        if (seller) accounts.grantCr(seller, r.listing.price - r.fee, 'Mercado: venta de ' + name);   // el vendedor cobra el precio menos la comisión
        return { ok: true, name, price: l.price, credits: u.credits, state: await bp.view(u) };
      });
    }
  };

  /* ---------------- Intercambios directos entre amigos ---------------- */
  const T = trades.data, other = name => accounts.find(String(name || ''));
  const live = () => { const t = Date.now(); for (const o of T.offers) if (o.status === 'open' && t > o.expires) o.status = 'expired'; if (T.offers.length > 400) T.offers = T.offers.filter(o => o.status === 'open').concat(T.offers.filter(o => o.status !== 'open').slice(-100)); };
  const offerView = (o, me) => {
    const a = accounts.findById(o.from), b = accounts.findById(o.to), dg = defOf(o.give.t, o.give.id), dw = defOf(o.want.t, o.want.id);
    return { id: o.id, status: o.status, from: a ? a.username : '¿?', to: b ? b.username : '¿?', mine: o.from === me.id, give: { t: o.give.t, id: o.give.id, name: dg ? dg.n : o.give.id, rarity: dg ? dg.r : 'comun' }, want: { t: o.want.t, id: o.want.id, name: dw ? dw.n : o.want.id, rarity: dw ? dw.r : 'comun' }, ts: o.ts, expires: o.expires };
  };
  const mine = u => { live(); return T.offers.filter(o => o.from === u.id || o.to === u.id); };
  /* Objetos del pase de un jugador que se pueden intercambiar (todo lo que tiene salvo el cuchillo base), con el tiempo de bloqueo que les queda */
  async function tradable(u) {
    const st = await bp.view(u), now = Date.now();
    return st.inventory.filter(i => PASS_TYPES.includes(i.t) && defOf(i.t, i.id)).map(i => { const d = defOf(i.t, i.id); return { t: i.t, id: i.id, name: d.n, rarity: d.r, lock: lockLeft(i.ts, now) }; });
  }
  const isFriend = (u, t) => u.friends.includes(t.id) && t.friends.includes(u.id);
  const tops = {
    async offer(u, b) {
      const t = other(b.to); if (!t) return err(404, 'No existe ningún jugador con ese nombre.'); if (t.id === u.id) return err(400, 'No puedes intercambiar contigo mismo.');
      if (u.blocked.includes(t.id) || t.blocked.includes(u.id)) return err(400, 'No se puede proponer el intercambio a este jugador.');
      if (!isFriend(u, t)) return err(403, 'Solo puedes intercambiar con tus amigos.');
      const give = { t: String(b.giveT || ''), id: String(b.giveId || '') }, want = { t: String(b.wantT || ''), id: String(b.wantId || '') };
      if (!PASS_TYPES.includes(give.t) || !PASS_TYPES.includes(want.t) || !defOf(give.t, give.id) || !defOf(want.t, want.id)) return err(400, 'Objeto no válido. Los intercambios son de skins, cuchillos y banners.');
      live(); if (T.offers.filter(o => o.status === 'open' && o.from === u.id).length >= MAX_OUT) return err(400, 'Ya tienes ' + MAX_OUT + ' propuestas abiertas. Cancela alguna.');
      if (T.offers.filter(o => o.status === 'open' && o.to === t.id).length >= MAX_IN) return err(400, 'Ese jugador tiene demasiadas propuestas pendientes.');
      if (T.offers.some(o => o.status === 'open' && o.from === u.id && o.to === t.id && o.give.t === give.t && o.give.id === give.id && o.want.t === want.t && o.want.id === want.id)) return err(400, 'Ya le propusiste exactamente ese intercambio.');
      const mi = await tradable(u), ti = await tradable(t), mineI = mi.find(i => i.t === give.t && i.id === give.id), theirs = ti.find(i => i.t === want.t && i.id === want.id);
      if (!mineI) return err(404, 'No tienes el objeto que ofreces.'); if (mineI.lock) return err(403, 'Tu objeto es nuevo: podrás intercambiarlo dentro de ' + hrs(mineI.lock) + '.');
      if (!theirs) return err(404, 'Ese jugador no tiene el objeto que pides.');
      if (mi.some(i => i.t === want.t && i.id === want.id)) return err(400, 'Ya tienes el objeto que pides.'); if (ti.some(i => i.t === give.t && i.id === give.id)) return err(400, 'Ese jugador ya tiene el objeto que ofreces.');
      const o = { id: ++T.seq, from: u.id, to: t.id, give, want, status: 'open', ts: Date.now(), expires: Date.now() + TRADE_TTL }; T.offers.push(o); trades.save(); return { ok: true, offer: offerView(o, u) };
    },
    async accept(u, b) {
      live(); const o = T.offers.find(x => x.id === Math.trunc(+b.id)); if (!o || o.to !== u.id) return err(404, 'No existe esa propuesta.'); if (o.status !== 'open') return err(400, o.status === 'expired' ? 'Esa propuesta ha caducado.' : 'Esa propuesta ya no está abierta.');
      const from = accounts.findById(o.from); if (!from || !isFriend(u, from)) return err(400, 'Ya no sois amigos.');
      return lockBoth(u.id, from.id, async () => {
        if (o.status !== 'open') return err(400, 'Esa propuesta ya no está abierta.');
        const r = await store.tradeSwap(from.id, o.give.t, o.give.id, u.id, o.want.t, o.want.id, LOCK_MS);
        if (r.error) {
          const msg = { 'gone-a': from.username + ' ya no tiene el objeto que ofrecía.', 'gone-b': 'Ya no tienes el objeto que te piden.', 'locked-a': 'El objeto de ' + from.username + ' es nuevo y sigue bloqueado.', 'locked-b': 'Tu objeto es nuevo: podrás intercambiarlo dentro de ' + hrs((r.until || 0) - Date.now()) + '.', 'owned-a': from.username + ' ya tiene el objeto que le darías.', 'owned-b': 'Ya tienes el objeto que te ofrecen.' }[r.error] || 'No se pudo completar el intercambio.';
          if (/gone|owned/.test(r.error)) { o.status = 'void'; trades.save(); } return err(400, msg);
        }
        o.status = 'done'; o.doneAt = Date.now();
        for (const x of T.offers) if (x.status === 'open' && x !== o) { const keys = [[x.from, x.give], [x.to, x.want]]; if (keys.some(([uid, it]) => (uid === from.id && it.t === o.give.t && it.id === o.give.id) || (uid === u.id && it.t === o.want.t && it.id === o.want.id))) x.status = 'void'; }   // las demás propuestas con esos objetos dejan de valer
        trades.save(); return { ok: true, gave: defOf(o.want.t, o.want.id).n, got: defOf(o.give.t, o.give.id).n, state: await bp.view(u) };
      });
    },
    async decline(u, b) { live(); const o = T.offers.find(x => x.id === Math.trunc(+b.id)); if (!o || o.to !== u.id || o.status !== 'open') return err(404, 'No existe esa propuesta abierta.'); o.status = 'declined'; trades.save(); return { ok: true }; },
    async cancel(u, b) { live(); const o = T.offers.find(x => x.id === Math.trunc(+b.id)); if (!o || o.from !== u.id || o.status !== 'open') return err(404, 'No existe esa propuesta abierta.'); o.status = 'cancelled'; trades.save(); return { ok: true }; }
  };

  const handles = p => p === '/api/market' || p.startsWith('/api/market/') || p === '/api/trades' || p.startsWith('/api/trades/');
  async function handleHttp(req, res, url) {
    const { send, readJson } = accounts.http;
    if (req.method === 'OPTIONS') { send(req, res, 204, null); return true; }
    try {
      const h = String(req.headers.authorization || ''), u = accounts.fromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
      if (!u) { send(req, res, 401, { error: 'Inicia sesión con una cuenta online.' }); return true; }
      let out; const p = url.pathname;
      if (req.method === 'GET' && p === '/api/market') { const q = Object.fromEntries(url.searchParams); out = Object.assign({ ok: true, credits: u.credits, fee: M.FEE, min: M.MIN_PRICE, max: M.MAX_LISTINGS, lock: LOCK_MS }, await browse(u, q)); }
      else if (req.method === 'GET' && p === '/api/market/price') {   // precio de referencia de un objeto: media, último, mínimo y máximo de las ventas de los últimos 30 días (sin nombres)
        const t = String(url.searchParams.get('t') || ''), id = String(url.searchParams.get('item') || ''), def = TYPES.includes(t) ? defOf(t, id) : null;
        out = def ? { ok: true, name: def.n, min: M.MIN_PRICE[def.r], ref: refOf(await priceIndex(), t, id), recent: (await store.marketRecent(2000)).filter(x => x.t === t && x.item === id).slice(0, 8).map(x => ({ price: x.price, ts: x.ts })) } : err(400, 'Objeto no válido.');
      }
      else if (req.method === 'GET' && p === '/api/trades') { const c = mine(u); out = { ok: true, lock: LOCK_MS, incoming: c.filter(o => o.to === u.id && o.status === 'open').map(o => offerView(o, u)), outgoing: c.filter(o => o.from === u.id && o.status === 'open').map(o => offerView(o, u)), recent: c.filter(o => o.status !== 'open').slice(-10).reverse().map(o => offerView(o, u)) }; }
      else if (req.method === 'GET' && p === '/api/trades/items') {   // lo que tú puedes ofrecer y lo que puede ofrecer un amigo
        const name = url.searchParams.get('name'), t = name ? other(name) : u;
        if (!t || (t.id !== u.id && !isFriend(u, t))) out = err(403, 'Solo puedes ver los objetos de tus amigos.'); else out = { ok: true, lock: LOCK_MS, items: await tradable(t) };
      }
      else if (req.method === 'POST') {
        const b = await readJson(req);
        if (p === '/api/market/buy') out = await ops.buy(u, b);                                       // la compra toma sus propios candados (comprador y vendedor)
        else if (p === '/api/market/list') out = await bp.lock(u.id, () => ops.list(u, b));
        else if (p === '/api/market/cancel') out = await bp.lock(u.id, () => ops.cancel(u, b));
        else if (p === '/api/trades/offer') out = await tops.offer(u, b);
        else if (p === '/api/trades/accept') out = await tops.accept(u, b);                            // el intercambio toma los candados de los dos
        else if (p === '/api/trades/decline') out = await tops.decline(u, b);
        else if (p === '/api/trades/cancel') out = await tops.cancel(u, b);
        else out = err(404, 'No encontrado.');
      } else out = err(404, 'No encontrado.');
      send(req, res, out.code || 200, out.error ? { error: out.error } : out);
    } catch (e) { log('Mercado: ' + e.message); send(req, res, 400, { error: 'Petición no válida.' }); }
    return true;
  }

  /* Panel: ver anuncios y retirar uno (el objeto vuelve a su dueño) */
  admin.addRoutes({
    'GET /market': async () => ({ listings: (await store.marketListings()).map(l => describe(l, null)).filter(Boolean).slice(0, 200), sales: await store.marketSalesCount() }),
    'POST /market/remove': async ({ b, s }) => {
      const l = (await store.marketListings()).find(x => x.id === Math.trunc(+b.id)); if (!l) return err(404, 'Ese anuncio no existe.');
      const r = await store.marketCancel(l.seller, l.id); if (r.error) return err(404, 'Ese anuncio no existe.');
      if (r.t === 'color') { const u = accounts.findById(l.seller); if (u) accounts.giveColor(u, +r.item, r.obtained || 1); }
      admin.audit(s.user, 'mercado-retirar', 'anuncio ' + l.id + ' (' + l.item + ')'); return { ok: true };
    }
  });
  /* Datos para las métricas del panel */
  const stats = async () => { live(); const d7 = Date.now() - 7 * 86400000; return { listings: (await store.marketListings()).length, offersOpen: T.offers.filter(o => o.status === 'open').length, tradesDone7d: T.offers.filter(o => o.status === 'done' && (o.doneAt || 0) >= d7).length, tradesDone: T.offers.filter(o => o.status === 'done').length }; };
  /* Al eliminar una cuenta: sus propuestas de intercambio dejan de valer */
  const removeUser = u => { for (const o of T.offers) if (o.status === 'open' && (o.from === u.id || o.to === u.id)) o.status = 'void'; trades.save(); };
  return { handles, handleHttp, stats, removeUser };
}

module.exports = { createMarket };
