'use strict';
/* Pixel Play Rusher · Mercado de cosméticos entre jugadores.
   - Se comercia con Créditos (la moneda que solo se gana jugando y vendiendo), nunca con PX: así no se venden objetos por dinero real entre jugadores.
   - Al anunciar, el objeto sale del inventario (y de lo equipado) y queda en depósito en el anuncio; al retirarlo vuelve, al venderse pasa al comprador.
   - Comisión del 10 % (se destruye: es un sumidero de Créditos), precio mínimo por rareza, máximo 8 anuncios por jugador.
   - Cada compra se hace bajo el candado de los dos jugadores (siempre en el mismo orden, sin bloqueos) y con devolución si algo falla.
   Rutas: GET /api/market · POST /api/market/{list,cancel,buy} · panel: GET /api/admin/market, POST /api/admin/market/remove. */

const TYPES = ['wskin', 'kskin', 'banner'];

function createMarket({ S, accounts, bp, admin, log }) {
  const store = bp.store, err = (code, error) => ({ code, error }), M = S.MARKET;
  const rarName = r => S.RARITY[r].n;

  /* Dos jugadores a la vez, siempre en el mismo orden para no bloquearse entre sí */
  const lockBoth = (a, b, fn) => { const ids = [...new Set([a, b])].sort(); return ids.length === 1 ? bp.lock(ids[0], fn) : bp.lock(ids[0], () => bp.lock(ids[1], fn)); };

  const describe = (l, me) => {
    const def = S.bpFind({ t: l.t, id: l.item }); if (!def) return null; const seller = accounts.findById(l.seller);
    return { id: l.id, t: l.t, item: l.item, name: def.n, rarity: def.r, weapon: def.w || '', price: l.price, net: l.price - Math.floor(l.price * M.FEE), seller: seller ? seller.username : '¿?', mine: !!me && l.seller === me.id, ts: l.ts };
  };

  async function browse(u, q) {
    let list = (await store.marketListings()).map(l => describe(l, u)).filter(Boolean);
    if (q.mine === '1') list = list.filter(x => x.mine);
    if (TYPES.includes(q.t)) list = list.filter(x => x.t === q.t);
    if (S.RARITY[q.r]) list = list.filter(x => x.rarity === q.r);
    const text = String(q.q || '').trim().toLowerCase(); if (text) list = list.filter(x => x.name.toLowerCase().includes(text) || x.seller.toLowerCase().includes(text));
    const by = { low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, rarity: (a, b) => S.RARITY[b.rarity].ord - S.RARITY[a.rarity].ord || a.price - b.price, new: (a, b) => b.ts - a.ts }[q.sort] || ((a, b) => b.ts - a.ts);
    return { total: list.length, listings: list.sort(by).slice(0, 200) };
  }

  const ops = {
    async list(u, b) {
      const t = String(b.t || ''), id = String(b.item || ''), price = Math.trunc(+b.price);
      if (!TYPES.includes(t)) return err(400, 'Tipo de objeto no válido.');
      const def = S.bpFind({ t, id }); if (!def) return err(400, 'Objeto no válido.'); if (def.base) return err(400, 'Ese objeto no se puede vender.');
      const min = M.MIN_PRICE[def.r]; if (!Number.isFinite(price) || price < min) return err(400, 'El precio mínimo de un objeto ' + rarName(def.r).toLowerCase() + ' es ' + min + ' CR.');
      if (price > M.MAX_PRICE) return err(400, 'El precio máximo es ' + M.MAX_PRICE + ' CR.');
      const r = await store.marketList(u.id, t, id, price, M.MAX_LISTINGS);
      if (r.error === 'no-item') return err(404, 'No tienes ese objeto.'); if (r.error === 'limit') return err(400, 'Solo puedes tener ' + M.MAX_LISTINGS + ' anuncios a la vez.');
      return { ok: true, id: r.id, net: price - Math.floor(price * M.FEE), state: await bp.view(u) };
    },
    async cancel(u, b) {
      const r = await store.marketCancel(u.id, Math.trunc(+b.id)); if (r.error) return err(404, 'Ese anuncio ya no existe.');
      return { ok: true, state: await bp.view(u) };
    },
    async buy(u, b) {
      const id = Math.trunc(+b.id), l = (await store.marketListings()).find(x => x.id === id); if (!l) return err(404, 'Ese anuncio ya no está disponible.');
      const def = S.bpFind({ t: l.t, id: l.item }); const seller = accounts.findById(l.seller);
      return lockBoth(u.id, l.seller, async () => {
        if (!accounts.spendCr(u, l.price, 'Mercado: compra de ' + (def ? def.n : l.item))) return err(402, 'Te faltan ' + (l.price - u.credits) + ' CR.');
        let r; try { r = await store.marketBuy(u.id, id, M.FEE); } catch (e) { accounts.grantCr(u, l.price, 'reembolso mercado'); log('Mercado: ' + e.message); return err(500, 'No se pudo completar la compra. No se ha cobrado nada.'); }
        if (r.error) { accounts.grantCr(u, l.price, 'reembolso mercado'); return err(r.error === 'gone' ? 404 : 400, { gone: 'Ese anuncio ya no está disponible.', self: 'No puedes comprar tu propio anuncio.', owned: 'Ya tienes ese objeto.' }[r.error]); }
        if (seller) accounts.grantCr(seller, r.listing.price - r.fee, 'Mercado: venta de ' + (def ? def.n : l.item));   // el vendedor cobra el precio menos la comisión
        return { ok: true, name: def ? def.n : l.item, price: l.price, credits: u.credits, state: await bp.view(u) };
      });
    }
  };

  const handles = p => p === '/api/market' || p.startsWith('/api/market/');
  async function handleHttp(req, res, url) {
    const { send, readJson } = accounts.http;
    if (req.method === 'OPTIONS') { send(req, res, 204, null); return true; }
    try {
      const h = String(req.headers.authorization || ''), u = accounts.fromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
      if (!u) { send(req, res, 401, { error: 'Inicia sesión con una cuenta online.' }); return true; }
      let out;
      if (req.method === 'GET' && url.pathname === '/api/market') { const q = Object.fromEntries(url.searchParams); out = Object.assign({ ok: true, credits: u.credits, fee: M.FEE, min: M.MIN_PRICE, max: M.MAX_LISTINGS }, await browse(u, q)); }
      else if (req.method === 'POST') {
        const b = await readJson(req), p = url.pathname;
        if (p === '/api/market/buy') out = await ops.buy(u, b);                                       // la compra toma sus propios candados (comprador y vendedor)
        else if (p === '/api/market/list') out = await bp.lock(u.id, () => ops.list(u, b));
        else if (p === '/api/market/cancel') out = await bp.lock(u.id, () => ops.cancel(u, b));
        else out = err(404, 'No encontrado.');
      }
      else out = err(404, 'No encontrado.');
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
      admin.audit(s.user, 'mercado-retirar', 'anuncio ' + l.id + ' (' + l.item + ')'); return { ok: true };
    }
  });
  return { handles, handleHttp };
}

module.exports = { createMarket };
