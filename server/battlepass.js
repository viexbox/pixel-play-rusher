'use strict';
/* PixelPlayRusher · Pase de batalla (Temporada 1).
   - Niveles 1–50 con XP, dos filas de recompensas (gratis y VIP), skins de armas y cuchillos y el banner S1.
   - Se paga con PX (los PX ya se pueden comprar con dinero real en la tienda). El servidor decide todo: nivel, XP, quién es VIP y qué está reclamado.
   - Persistencia: PostgreSQL (tablas bp_*, ver migrations/) si hay DATABASE_URL; si no, un archivo JSON en DATA_DIR.
   Rutas: GET /api/bp · POST /api/bp/{claim,claim-all,buy,gift,skip,equip} · en el panel: /api/admin/bp/{user,grant}. */

const path = require('path');
const { Store } = require('./admin.js');

const SEASON = 1;
const SLOT_RE = /^(weapon:[a-z0-9_]{2,20}|knife|banner|pet|avatar)$/;

/* ================= Almacén PostgreSQL ================= */
function pgStore(pool, S) {
  const tx = async fn => { const c = await pool.connect(); try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); } };
  return {
    kind: 'postgres',
    async state(uid) {
      const [p, c, i, e] = await Promise.all([
        pool.query('SELECT xp, level, vip, vip_since, gifted_by FROM bp_progress WHERE user_id = $1 AND season = $2', [uid, SEASON]),
        pool.query('SELECT level, track, item_type, item_id FROM bp_claims WHERE user_id = $1 AND season = $2 ORDER BY level', [uid, SEASON]),
        pool.query('SELECT item_type, item_id, obtained_at FROM bp_inventory WHERE user_id = $1', [uid]),
        pool.query('SELECT slot, item_id FROM bp_equipped WHERE user_id = $1', [uid])]);
      const r = p.rows[0] || { xp: 0, level: 1, vip: false, vip_since: null, gifted_by: null };
      return { xp: r.xp, level: r.level, vip: r.vip, vipSince: r.vip_since ? +new Date(r.vip_since) : 0, giftedBy: r.gifted_by || '', claims: c.rows.map(x => ({ level: x.level, track: x.track, t: x.item_type, id: x.item_id })),
        inventory: i.rows.map(x => ({ t: x.item_type, id: x.item_id, ts: +new Date(x.obtained_at) })), equipped: Object.fromEntries(e.rows.map(x => [x.slot, x.item_id])) };
    },
    /* Suma XP (con tope diario opcional). Devuelve la XP realmente sumada, la total y el nivel. */
    addXp(uid, amount, { cap = 0, day = '' } = {}) {
      return tx(async c => {
        await c.query('INSERT INTO bp_progress (user_id, season, xp_day) VALUES ($1, $2, $3) ON CONFLICT (user_id, season) DO NOTHING', [uid, SEASON, day || null]);
        const r = (await c.query('SELECT xp, xp_day::text AS d, xp_today FROM bp_progress WHERE user_id = $1 AND season = $2 FOR UPDATE', [uid, SEASON])).rows[0];
        const today = cap && r.d === day ? r.xp_today : 0, maxXp = S.bpTotalXp(S.BP_LEVELS);
        let add = Math.max(0, Math.trunc(amount)); if (cap) add = Math.min(add, Math.max(0, cap - today)); add = Math.min(add, maxXp - r.xp);
        const xp = r.xp + add, level = S.bpLevelOf(xp).level;
        await c.query('UPDATE bp_progress SET xp = $3, level = $4, xp_day = COALESCE($5::date, xp_day), xp_today = CASE WHEN $6 THEN $7 ELSE xp_today END, updated_at = now() WHERE user_id = $1 AND season = $2',
          [uid, SEASON, xp, level, day || null, !!cap, today + add]);
        return { added: add, xp, level };
      });
    },
    /* Marca un nivel/fila como reclamado y, si es un objeto, lo mete en el inventario. false si ya estaba reclamado. */
    claim(uid, level, track, r) {
      return tx(async c => {
        const ins = await c.query('INSERT INTO bp_claims (user_id, season, level, track, item_type, item_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING', [uid, SEASON, level, track, r.t, r.t === 'px' ? String(r.n) : r.id]);
        if (!ins.rowCount) return false;
        if (r.t !== 'px') await c.query('INSERT INTO bp_inventory (user_id, item_type, item_id, source) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [uid, r.t, r.id, 'pase-s' + SEASON + '-' + track + '-' + level]);
        return true;
      });
    },
    /* [NEÓN] Un nivel reclamado cuando daba PX y que ahora da un objeto: se apunta el objeto en el MISMO registro y se entrega.
       Solo si la fila sigue siendo de PX (WHERE item_type = 'px'), así pasa una única vez aunque luego vendas el objeto. */
    upgradeClaim(uid, level, track, r) {
      return tx(async c => {
        const up = await c.query("UPDATE bp_claims SET item_type = $5, item_id = $6 WHERE user_id = $1 AND season = $2 AND level = $3 AND track = $4 AND item_type = 'px'", [uid, SEASON, level, track, r.t, r.id]);
        if (!up.rowCount) return false;
        await c.query('INSERT INTO bp_inventory (user_id, item_type, item_id, source) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [uid, r.t, r.id, 'pase-s' + SEASON + '-' + track + '-' + level]);
        return true;
      });
    },
    async grantVip(uid, giftedBy) {
      const r = await pool.query('INSERT INTO bp_progress (user_id, season, vip, vip_since, gifted_by) VALUES ($1, $2, TRUE, now(), $3) ON CONFLICT (user_id, season) DO UPDATE SET vip = TRUE, vip_since = now(), gifted_by = $3, updated_at = now() WHERE bp_progress.vip = FALSE',
        [uid, SEASON, giftedBy || null]);
      return r.rowCount > 0;
    },
    async logGift(from, to) { await pool.query('INSERT INTO bp_gifts (from_user, to_user, season) VALUES ($1, $2, $3)', [from, to, SEASON]); },
    /* [NUEVO] Borrar todo lo de una cuenta (al eliminarla): pase, objetos, regalos, anuncios y foto; las ventas antiguas se anonimizan para no romper el historial de precios */
    async deleteUser(uid) {
      await tx(async c => {
        for (const t of ['bp_progress', 'bp_claims', 'bp_inventory', 'bp_equipped']) await c.query('DELETE FROM ' + t + ' WHERE user_id = $1', [uid]);
        await c.query('DELETE FROM bp_gifts WHERE from_user::text = $1 OR to_user::text = $1', [uid]); await c.query('DELETE FROM market_listings WHERE seller = $1', [uid]); await c.query('DELETE FROM user_avatars WHERE user_id = $1', [uid]);
        await c.query("UPDATE market_sales SET seller = 'eliminado' WHERE seller = $1", [uid]); await c.query("UPDATE market_sales SET buyer = 'eliminado' WHERE buyer = $1", [uid]);
      });
    },
    /* [NUEVO] Reasigna las filas de cuentas antiguas (id numérico) a su UUID. Idempotente: si ya no hay filas con el id antiguo no hace nada. */
    remapUsers(pairs) {
      const olds = pairs.map(p => String(p.old)), news = pairs.map(p => p.id);
      return tx(async c => { for (const [t, col] of [['bp_progress', 'user_id'], ['bp_claims', 'user_id'], ['bp_inventory', 'user_id'], ['bp_equipped', 'user_id'], ['bp_gifts', 'from_user'], ['bp_gifts', 'to_user']])
        await c.query('UPDATE ' + t + ' SET ' + col + ' = m.n FROM (SELECT unnest($1::text[]) AS o, unnest($2::text[]) AS n) m WHERE ' + t + '.' + col + ' = m.o', [olds, news]); });
    },
    /* ---- [NUEVO] Mercado, historial de precios e intercambios ---- */
    marketListings: async () => (await pool.query('SELECT id::int AS id, seller, item_type AS t, item_id AS item, price, created_at, obtained_at FROM market_listings ORDER BY created_at DESC LIMIT 2000')).rows.map(r => ({ id: r.id, seller: r.seller, t: r.t, item: r.item, price: r.price, ts: +new Date(r.created_at), obtained: +new Date(r.obtained_at) })),
    marketList(uid, t, id, price, max, o = {}) {   // el objeto sale del inventario (y de lo equipado) y queda en depósito en el anuncio. Un objeto recién conseguido (< lockMs) no se puede anunciar.
      return tx(async c => {
        if ((await c.query('SELECT count(*)::int AS n FROM market_listings WHERE seller = $1', [uid])).rows[0].n >= max) return { error: 'limit' };
        let obtained = o.obtained || Date.now();
        if (!o.noInv) {
          const r = (await c.query('SELECT obtained_at FROM bp_inventory WHERE user_id = $1 AND item_type = $2 AND item_id = $3 FOR UPDATE', [uid, t, id])).rows[0]; if (!r) return { error: 'no-item' };
          obtained = +new Date(r.obtained_at); if (o.lockMs && Date.now() - obtained < o.lockMs) return { error: 'locked', until: obtained + o.lockMs };
          await c.query('DELETE FROM bp_inventory WHERE user_id = $1 AND item_type = $2 AND item_id = $3', [uid, t, id]); await c.query('DELETE FROM bp_equipped WHERE user_id = $1 AND item_id = $2', [uid, id]);
        }
        return { id: (await c.query('INSERT INTO market_listings (seller, item_type, item_id, price, obtained_at) VALUES ($1, $2, $3, $4, $5) RETURNING id::int AS id', [uid, t, id, price, new Date(obtained)])).rows[0].id };
      });
    },
    marketCancel(uid, listingId) {          // el objeto vuelve al inventario de su dueño, conservando la fecha en que lo consiguió
      return tx(async c => {
        const l = (await c.query('DELETE FROM market_listings WHERE id = $1 AND seller = $2 RETURNING item_type AS t, item_id AS item, obtained_at', [listingId, uid])).rows[0]; if (!l) return { error: 'gone' };
        if (l.t !== 'color') await c.query("INSERT INTO bp_inventory (user_id, item_type, item_id, source, obtained_at) VALUES ($1, $2, $3, 'mercado-devuelto', $4) ON CONFLICT DO NOTHING", [uid, l.t, l.item, l.obtained_at]);
        return { t: l.t, item: l.item, obtained: +new Date(l.obtained_at) };
      });
    },
    marketBuy(buyer, listingId, feeRate) {  // el anuncio desaparece, el objeto pasa al comprador (con la fecha de hoy: queda bloqueado) y la venta queda registrada; todo o nada
      return tx(async c => {
        const l = (await c.query('SELECT id::int AS id, seller, item_type AS t, item_id AS item, price FROM market_listings WHERE id = $1 FOR UPDATE', [listingId])).rows[0]; if (!l) return { error: 'gone' };
        if (l.seller === buyer) return { error: 'self' };
        if (l.t !== 'color' && (await c.query('SELECT 1 FROM bp_inventory WHERE user_id = $1 AND item_type = $2 AND item_id = $3', [buyer, l.t, l.item])).rowCount) return { error: 'owned' };
        const fee = Math.floor(l.price * feeRate);
        await c.query('DELETE FROM market_listings WHERE id = $1', [listingId]);
        if (l.t !== 'color') await c.query("INSERT INTO bp_inventory (user_id, item_type, item_id, source) VALUES ($1, $2, $3, 'mercado')", [buyer, l.t, l.item]);
        await c.query('INSERT INTO market_sales (listing_id, seller, buyer, item_type, item_id, price, fee) VALUES ($1, $2, $3, $4, $5, $6, $7)', [l.id, l.seller, buyer, l.t, l.item, l.price, fee]);
        return { listing: l, fee };
      });
    },
    marketRecent: async n => (await pool.query('SELECT item_type AS t, item_id AS item, price, fee, created_at FROM market_sales ORDER BY created_at DESC LIMIT $1', [n])).rows.map(r => ({ t: r.t, item: r.item, price: r.price, fee: r.fee, ts: +new Date(r.created_at) })),
    async marketSalesCount() { return (await pool.query('SELECT count(*)::int AS n FROM market_sales')).rows[0].n; },
    tradeSwap(a, t1, i1, b, t2, i2, lockMs) {   // intercambio directo: cada uno entrega su objeto y recibe el del otro, o no pasa nada
      return tx(async c => {
        const q = (u, t, i) => c.query('SELECT obtained_at FROM bp_inventory WHERE user_id = $1 AND item_type = $2 AND item_id = $3 FOR UPDATE', [u, t, i]);
        const ra = (await q(a, t1, i1)).rows[0], rb = (await q(b, t2, i2)).rows[0]; if (!ra) return { error: 'gone-a' }; if (!rb) return { error: 'gone-b' };
        for (const [r, k] of [[ra, 'a'], [rb, 'b']]) if (lockMs && Date.now() - +new Date(r.obtained_at) < lockMs) return { error: 'locked-' + k, until: +new Date(r.obtained_at) + lockMs };
        if ((await q(a, t2, i2)).rowCount) return { error: 'owned-a' }; if ((await q(b, t1, i1)).rowCount) return { error: 'owned-b' };
        for (const [u, t, i] of [[a, t1, i1], [b, t2, i2]]) { await c.query('DELETE FROM bp_inventory WHERE user_id = $1 AND item_type = $2 AND item_id = $3', [u, t, i]); await c.query('DELETE FROM bp_equipped WHERE user_id = $1 AND item_id = $2', [u, i]); }
        for (const [u, t, i] of [[a, t2, i2], [b, t1, i1]]) await c.query("INSERT INTO bp_inventory (user_id, item_type, item_id, source) VALUES ($1, $2, $3, 'intercambio')", [u, t, i]);
        return { ok: true };
      });
    },
    async grantItem(uid, t, id, source) {   // [NUEVO] mascotas y canjes del evento: false si ya lo tenía
      const r = await pool.query('INSERT INTO bp_inventory (user_id, item_type, item_id, source) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [uid, t, id, source]);
      return r.rowCount > 0;
    },
    async equip(uid, slot, itemId, itemType) {
      if (!itemId) { await pool.query('DELETE FROM bp_equipped WHERE user_id = $1 AND slot = $2', [uid, slot]); return true; }
      const has = await pool.query('SELECT 1 FROM bp_inventory WHERE user_id = $1 AND item_type = $2 AND item_id = $3', [uid, itemType, itemId]);
      if (!has.rowCount) return false;
      await pool.query('INSERT INTO bp_equipped (user_id, slot, item_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, slot) DO UPDATE SET item_id = EXCLUDED.item_id', [uid, slot, itemId]); return true;
    }
  };
}

/* ================= Almacén en archivo (sin PostgreSQL) ================= */
function fileStore(dataDir, log, S) {
  const st = new Store(path.join(dataDir, 'battlepass.json'), { users: {}, gifts: [] }, log);
  const D = st.data;
  const mk = () => (D.market = D.market || { seq: 0, listings: [], sales: [] });   // [NUEVO] anuncios y ventas del mercado
  const U = uid => (D.users[uid] || (D.users[uid] = { xp: 0, level: 1, vip: false, vipSince: 0, giftedBy: '', xpDay: '', xpToday: 0, claims: {}, inventory: {}, equipped: {} }));
  return {
    kind: 'file', flush: () => st.flush(),
    async state(uid) {
      const u = D.users[uid] || U(uid);
      return { xp: u.xp, level: u.level, vip: u.vip, vipSince: u.vipSince, giftedBy: u.giftedBy, claims: Object.entries(u.claims).map(([k, v]) => ({ level: +k.split(':')[0], track: k.split(':')[1], t: v.t, id: v.id })).sort((a, b) => a.level - b.level),
        inventory: Object.values(u.inventory).map(v => ({ t: v.t, id: v.id, ts: v.ts || 0 })), equipped: Object.assign({}, u.equipped) };
    },
    async addXp(uid, amount, { cap = 0, day = '' } = {}) {
      const u = U(uid), maxXp = S.bpTotalXp(S.BP_LEVELS), today = cap && u.xpDay === day ? u.xpToday : 0;
      let add = Math.max(0, Math.trunc(amount)); if (cap) add = Math.min(add, Math.max(0, cap - today)); add = Math.min(add, maxXp - u.xp);
      u.xp += add; u.level = S.bpLevelOf(u.xp).level; if (day) u.xpDay = day; if (cap) u.xpToday = today + add; st.save();
      return { added: add, xp: u.xp, level: u.level };
    },
    async claim(uid, level, track, r) {
      const u = U(uid), k = level + ':' + track; if (u.claims[k]) return false;
      u.claims[k] = { t: r.t, id: r.t === 'px' ? String(r.n) : r.id, ts: Date.now() };
      if (r.t !== 'px') u.inventory[r.t + ':' + r.id] = u.inventory[r.t + ':' + r.id] || { t: r.t, id: r.id, source: 'pase-s' + SEASON + '-' + track + '-' + level, ts: Date.now() };
      st.save(); return true;
    },
    async upgradeClaim(uid, level, track, r) {   // [NEÓN] ver la versión de PostgreSQL
      const u = U(uid), k = level + ':' + track, c = u.claims[k]; if (!c || c.t !== 'px') return false;
      u.claims[k] = { t: r.t, id: r.id, ts: c.ts, was: 'px:' + c.id };
      u.inventory[r.t + ':' + r.id] = u.inventory[r.t + ':' + r.id] || { t: r.t, id: r.id, source: 'pase-s' + SEASON + '-' + track + '-' + level, ts: Date.now() };
      st.save(); return true;
    },
    async grantVip(uid, giftedBy) { const u = U(uid); if (u.vip) return false; u.vip = true; u.vipSince = Date.now(); u.giftedBy = giftedBy || ''; st.save(); return true; },
    async remapUsers(pairs) {   // [NUEVO] igual que en PostgreSQL: pasa el progreso de ids antiguos a UUID
      const m = new Map(pairs.map(p => [String(p.old), p.id]));
      for (const [o, n] of m) if (D.users[o] && !D.users[n]) { D.users[n] = D.users[o]; delete D.users[o]; }
      for (const g of D.gifts) { if (m.has(String(g.from))) g.from = m.get(String(g.from)); if (m.has(String(g.to))) g.to = m.get(String(g.to)); }
      st.save();
    },
    async logGift(from, to) { D.gifts.push({ from, to, season: SEASON, ts: Date.now() }); if (D.gifts.length > 5000) D.gifts.shift(); st.save(); },
    async deleteUser(uid) {   // [NUEVO] borrar todo lo de una cuenta (ver la versión de PostgreSQL)
      delete D.users[uid]; D.gifts = D.gifts.filter(g => String(g.from) !== uid && String(g.to) !== uid);
      if (D.market) { D.market.listings = D.market.listings.filter(l => l.seller !== uid); for (const x of D.market.sales) { if (x.seller === uid) x.seller = 'eliminado'; if (x.buyer === uid) x.buyer = 'eliminado'; } }
      st.flush();
    },
    /* ---- [NUEVO] Mercado, historial e intercambios (mismo comportamiento que en PostgreSQL) ---- */
    marketListings: async () => { const M = mk(); return M.listings.slice().reverse().slice(0, 2000).map(x => Object.assign({}, x)); },
    async marketList(uid, t, id, price, max, o = {}) {
      const M = mk(), u = U(uid); if (M.listings.filter(x => x.seller === uid).length >= max) return { error: 'limit' };
      let obtained = o.obtained || Date.now();
      if (!o.noInv) {
        const it = u.inventory[t + ':' + id]; if (!it) return { error: 'no-item' };
        obtained = it.ts || 0; if (o.lockMs && obtained && Date.now() - obtained < o.lockMs) return { error: 'locked', until: obtained + o.lockMs };
        delete u.inventory[t + ':' + id]; for (const [k, v] of Object.entries(u.equipped)) if (v === id) delete u.equipped[k];
      }
      const l = { id: ++M.seq, seller: uid, t, item: id, price, ts: Date.now(), obtained }; M.listings.push(l); st.save(); return { id: l.id };
    },
    async marketCancel(uid, listingId) {
      const M = mk(), i = M.listings.findIndex(x => x.id === listingId && x.seller === uid); if (i < 0) return { error: 'gone' };
      const l = M.listings.splice(i, 1)[0], u = U(uid);
      if (l.t !== 'color') u.inventory[l.t + ':' + l.item] = u.inventory[l.t + ':' + l.item] || { t: l.t, id: l.item, source: 'mercado-devuelto', ts: l.obtained || Date.now() };
      st.save(); return { t: l.t, item: l.item, obtained: l.obtained };
    },
    async marketBuy(buyer, listingId, feeRate) {
      const M = mk(), i = M.listings.findIndex(x => x.id === listingId); if (i < 0) return { error: 'gone' }; const l = M.listings[i];
      if (l.seller === buyer) return { error: 'self' }; const b = U(buyer); if (l.t !== 'color' && b.inventory[l.t + ':' + l.item]) return { error: 'owned' };
      const fee = Math.floor(l.price * feeRate); M.listings.splice(i, 1); if (l.t !== 'color') b.inventory[l.t + ':' + l.item] = { t: l.t, id: l.item, source: 'mercado', ts: Date.now() };
      M.sales.push({ listing: l.id, seller: l.seller, buyer, t: l.t, item: l.item, price: l.price, fee, ts: Date.now() }); if (M.sales.length > 5000) M.sales.shift(); st.save(); return { listing: l, fee };
    },
    marketRecent: async n => mk().sales.slice(-n).reverse().map(x => ({ t: x.t, item: x.item, price: x.price, fee: x.fee, ts: x.ts })),
    async marketSalesCount() { return mk().sales.length; },
    async tradeSwap(a, t1, i1, b, t2, i2, lockMs) {
      const A = U(a), B = U(b), ia = A.inventory[t1 + ':' + i1], ib = B.inventory[t2 + ':' + i2]; if (!ia) return { error: 'gone-a' }; if (!ib) return { error: 'gone-b' };
      if (lockMs && ia.ts && Date.now() - ia.ts < lockMs) return { error: 'locked-a', until: ia.ts + lockMs }; if (lockMs && ib.ts && Date.now() - ib.ts < lockMs) return { error: 'locked-b', until: ib.ts + lockMs };
      if (A.inventory[t2 + ':' + i2]) return { error: 'owned-a' }; if (B.inventory[t1 + ':' + i1]) return { error: 'owned-b' };
      for (const [X, t, i] of [[A, t1, i1], [B, t2, i2]]) { delete X.inventory[t + ':' + i]; for (const [k, v] of Object.entries(X.equipped)) if (v === i) delete X.equipped[k]; }
      A.inventory[t2 + ':' + i2] = { t: t2, id: i2, source: 'intercambio', ts: Date.now() }; B.inventory[t1 + ':' + i1] = { t: t1, id: i1, source: 'intercambio', ts: Date.now() }; st.save(); return { ok: true };
    },
    async grantItem(uid, t, id, source) {   // [NUEVO] mascotas y canjes del evento: false si ya lo tenía
      const u = U(uid), k = t + ':' + id; if (u.inventory[k]) return false;
      u.inventory[k] = { t, id, source, ts: Date.now() }; st.save(); return true;
    },
    async equip(uid, slot, itemId, itemType) {
      const u = U(uid); if (!itemId) { delete u.equipped[slot]; st.save(); return true; }
      if (!u.inventory[itemType + ':' + itemId]) return false; u.equipped[slot] = itemId; st.save(); return true;
    }
  };
}

function createBattlePass({ S, accounts, admin, db, dataDir, log, env = process.env }) {
  const store = db ? pgStore(db.pool, S) : fileStore(dataDir, log, S);
  const VIP_PX = +env.BP_VIP_PX || S.BP_PRICES.vip, SKIP_PX = +env.BP_SKIP_PX || S.BP_PRICES.skipPerLevel, XP_CAP = +env.BP_XP_DAILY_CAP || 8000;
  const MAXL = S.BP_LEVELS, err = (code, error) => ({ code, error });
  const today = () => new Date().toISOString().slice(0, 10);

  /* [NUEVO] Al arrancar, el progreso de cuentas antiguas (id numérico) se pasa a su UUID. Ninguna operación empieza hasta que termine. */
  let ready = Promise.resolve();
  const pend = accounts.legacyPending();
  if (pend.length) ready = store.remapUsers(pend).then(() => { accounts.legacyDone(pend.map(p => p.id)); log('Pase de batalla: progreso de ' + pend.length + ' cuenta(s) antigua(s) reasignado a UUID'); }).catch(e => log('No se pudo reasignar el pase a los UUID: ' + e.message));

  /* Una operación a la vez por usuario: evita dobles cobros y dobles reclamos con clics rápidos */
  const chains = new Map();
  const lock = (uid, fn) => { const prev = chains.get(uid) || ready; const run = prev.then(fn, fn); const tail = run.catch(() => {}); chains.set(uid, tail); tail.then(() => { if (chains.get(uid) === tail) chains.delete(uid); }); return run; };

  const owned = (st, t, id) => st.inventory.some(x => x.t === t && x.id === id);
  const view = async u => {
    let st = await store.state(u.id);
    if (st.vip) {   // [NEÓN] niveles VIP reclamados cuando daban PX y que ahora dan una skin: se entrega una sola vez
      let got = false;
      for (const c of st.claims) { const r = c.track === 'vip' && c.t === 'px' && S.BP_TIERS[c.level - 1] ? S.BP_TIERS[c.level - 1].vip : null; if (r && r.t !== 'px' && await store.upgradeClaim(u.id, c.level, 'vip', r)) got = true; }
      if (got) st = await store.state(u.id);
    }
    const lv = S.bpLevelOf(st.xp);
    return { season: SEASON, level: lv.level, xp: st.xp, into: lv.into, need: lv.need, vip: st.vip, giftedBy: st.giftedBy, claims: st.claims.map(c => c.level + ':' + c.track), inventory: st.inventory, equipped: st.equipped,
      prices: { vip: VIP_PX, skip: SKIP_PX }, px: u.px };
  };

  /* XP tras una partida online (la llama el servidor de juego). Devuelve null si no suma nada. */
  async function awardMatch(u, { points, won }) {
    const xp = S.bpXpFor(points, won); if (xp <= 0) return null; await ready;
    const before = S.bpLevelOf((await store.state(u.id)).xp).level;
    const r = await lock(u.id, () => store.addXp(u.id, xp, { cap: XP_CAP, day: today() }));
    return { added: r.added, xp: r.xp, level: r.level, leveledUp: r.level > before };
  }

  const ops = {
    async claim(u, b) {
      const level = b.level | 0, track = b.track; if (level < 1 || level > MAXL || (track !== 'free' && track !== 'vip')) return err(400, 'Recompensa no válida.');
      const st = await store.state(u.id), reward = S.BP_TIERS[level - 1][track];
      if (st.level < level) return err(400, 'Aún no has alcanzado el nivel ' + level + '.');
      if (track === 'vip' && !st.vip) return err(403, 'Esta recompensa es del Pase VIP.');
      if (!(await store.claim(u.id, level, track, reward))) return err(409, 'Ya reclamaste esta recompensa.');
      if (reward.t === 'px') accounts.grant(u, reward.n, 'pase S' + SEASON + ' nivel ' + level);
      return { ok: true, reward, state: await view(u) };
    },
    async claimAll(u) {
      const st = await store.state(u.id), done = new Set(st.claims.map(c => c.level + ':' + c.track)); const got = [];
      for (let l = 1; l <= st.level; l++) for (const track of ['free', 'vip']) {
        if (track === 'vip' && !st.vip) continue; if (done.has(l + ':' + track)) continue;
        const reward = S.BP_TIERS[l - 1][track]; if (await store.claim(u.id, l, track, reward)) { if (reward.t === 'px') accounts.grant(u, reward.n, 'pase S' + SEASON + ' nivel ' + l); got.push({ level: l, track, reward }); }
      }
      if (!got.length) return err(400, 'No tienes recompensas pendientes.');
      return { ok: true, claimed: got, state: await view(u) };
    },
    async buy(u) {
      const st = await store.state(u.id); if (st.vip) return err(400, 'Ya tienes el Pase VIP.');
      if (!accounts.spend(u, VIP_PX, 'Pase VIP S' + SEASON)) return err(402, 'Te faltan ' + (VIP_PX - u.px) + ' PX.');
      try { if (!(await store.grantVip(u.id, null))) { accounts.grant(u, VIP_PX, 'reembolso Pase VIP'); return err(400, 'Ya tienes el Pase VIP.'); } }
      catch (e) { accounts.grant(u, VIP_PX, 'reembolso Pase VIP'); log('Pase VIP: ' + e.message); return err(500, 'No se pudo completar la compra. No se ha cobrado nada.'); }
      return { ok: true, state: await view(u) };
    },
    async gift(u, b) {
      const to = accounts.find(String(b.to || '')); if (!to) return err(404, 'No existe ningún jugador con ese nombre.');
      if (to.id === u.id) return err(400, 'Para ti mismo usa «Comprar Pase VIP».');
      if ((await store.state(to.id)).vip) return err(400, to.username + ' ya tiene el Pase VIP.');
      if (!accounts.spend(u, VIP_PX, 'Regalo de Pase VIP a ' + to.username)) return err(402, 'Te faltan ' + (VIP_PX - u.px) + ' PX.');
      try { if (!(await store.grantVip(to.id, u.username))) { accounts.grant(u, VIP_PX, 'reembolso regalo'); return err(400, to.username + ' ya tiene el Pase VIP.'); } await store.logGift(u.id, to.id); }
      catch (e) { accounts.grant(u, VIP_PX, 'reembolso regalo'); log('Regalo de pase: ' + e.message); return err(500, 'No se pudo completar el regalo. No se ha cobrado nada.'); }
      return { ok: true, to: to.username, state: await view(u) };
    },
    async skip(u, b) {
      const st = await store.state(u.id), want = b.levels | 0; if (want < 1) return err(400, 'Elige cuántos niveles saltar.');
      const n = Math.min(want, MAXL - st.level); if (n < 1) return err(400, 'Ya estás en el nivel máximo.');
      const cost = n * SKIP_PX; if (!accounts.spend(u, cost, 'Saltar ' + n + ' niveles del pase')) return err(402, 'Te faltan ' + (cost - u.px) + ' PX.');
      try { await store.addXp(u.id, S.bpTotalXp(st.level + n) - st.xp); } catch (e) { accounts.grant(u, cost, 'reembolso saltar niveles'); log('Saltar niveles: ' + e.message); return err(500, 'No se pudo completar. No se ha cobrado nada.'); }
      return { ok: true, skipped: n, cost, state: await view(u) };
    },
    async petBuy(u, b) {   // [NUEVO] comprar una mascota con PX: se cobra en el servidor y se reembolsa si algo falla
      const def = S.PETS.find(p => p.id === String(b.id || '')); if (!def) return err(400, 'Esa mascota no existe.');
      const st = await store.state(u.id); if (st.inventory.some(i => i.t === 'pet' && i.id === def.id)) return err(409, 'Ya tienes esa mascota.');
      if (!accounts.spend(u, def.px, 'Mascota ' + def.n)) return err(402, 'Te faltan ' + (def.px - u.px) + ' PX.');
      try { if (!(await store.grantItem(u.id, 'pet', def.id, 'tienda'))) { accounts.grant(u, def.px, 'reembolso mascota'); return err(409, 'Ya tienes esa mascota.'); } }
      catch (e) { accounts.grant(u, def.px, 'reembolso mascota'); log('Mascota: ' + e.message); return err(500, 'No se pudo completar la compra. No se ha cobrado nada.'); }
      return { ok: true, pet: def.id, state: await view(u) };
    },
    async equip(u, b) {
      const slot = String(b.slot || ''), item = b.item ? String(b.item) : null; if (!SLOT_RE.test(slot)) return err(400, 'Ranura no válida.');
      const type = slot === 'knife' ? 'kskin' : slot === 'banner' ? 'banner' : slot === 'pet' ? 'pet' : slot === 'avatar' ? 'avatar' : 'wskin';
      if (item) {
        const def = S.bpFind({ t: type, id: item }); if (!def) return err(400, 'Objeto no válido.');
        if (type === 'wskin' && slot !== 'weapon:' + def.w) return err(400, 'Esa skin es de otra arma.');
        if (def.base) { await store.equip(u.id, slot, null, type); return { ok: true, state: await view(u) }; }   // el cuchillo clásico es "sin skin"
      }
      if (!(await store.equip(u.id, slot, item, type))) return err(403, 'No tienes ese objeto.');
      return { ok: true, state: await view(u) };
    }
  };

  /* ---------- HTTP ---------- */
  const handles = p => p === '/api/bp' || p.startsWith('/api/bp/');
  async function handleHttp(req, res, url, ip) {
    const { send, readJson } = accounts.http;
    if (req.method === 'OPTIONS') { send(req, res, 204, null); return true; }
    try {
      const h = String(req.headers.authorization || ''), u = accounts.fromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
      if (!u) { send(req, res, 401, { error: 'Inicia sesión con una cuenta online.' }); return true; }
      await ready;
      const key = req.method + ' ' + url.pathname, b = req.method === 'POST' ? await readJson(req) : {};
      let out;
      if (key === 'GET /api/bp') out = { ok: true, state: await view(u) };
      else if (req.method === 'POST' && url.pathname.startsWith('/api/bp/')) {
        const op = { '/api/bp/claim': ops.claim, '/api/bp/claim-all': ops.claimAll, '/api/bp/buy': ops.buy, '/api/bp/gift': ops.gift, '/api/bp/skip': ops.skip, '/api/bp/equip': ops.equip, '/api/bp/pet-buy': ops.petBuy }[url.pathname];
        out = op ? await lock(u.id, () => op(u, b)) : err(404, 'No encontrado.');
      } else out = err(404, 'No encontrado.');
      send(req, res, out.code || 200, out.error ? { error: out.error } : out);
    } catch (e) { log('Pase de batalla: ' + e.message); send(req, res, 400, { error: 'Petición no válida.' }); }
    return true;
  }

  /* ---------- Panel de administración (soporte) ---------- */
  admin.addRoutes({
    'GET /bp/user': async ({ q }) => { const u = accounts.find(q.get('username') || ''); if (!u) return err(404, 'No existe esa cuenta.'); return { username: u.username, state: await view(u) }; },
    'POST /bp/grant': async ({ b, s }) => {
      const u = accounts.find(String(b.username || '')); if (!u) return err(404, 'No existe esa cuenta.');
      const xp = Math.trunc(+b.xp || 0), vip = b.vip === true; if (!xp && !vip) return err(400, 'Indica XP y/o VIP.'); if (Math.abs(xp) > 100000) return err(400, 'Demasiada XP.');
      const what = []; if (vip) { const g = await lock(u.id, () => store.grantVip(u.id, 'administración')); what.push(g ? 'Pase VIP' : 'ya tenía VIP'); }
      if (xp > 0) { const r = await lock(u.id, () => store.addXp(u.id, xp)); what.push('+' + r.added + ' XP'); }
      admin.audit(s.user, 'pase-conceder', u.username + ': ' + what.join(', ')); return { ok: true, username: u.username, applied: what, state: await view(u) };
    }
  });

  return { equippedPet: async uid => { try { const st = await store.state(uid), id = st.equipped.pet; return id && S.PETS.some(p => p.id === id) && st.inventory.some(i => i.t === 'pet' && i.id === id) ? id : ''; } catch (e) { return ''; } }, handles, handleHttp, awardMatch, view, store, lock, S, prices: { vip: VIP_PX, skip: SKIP_PX }, flush: () => (store.flush ? store.flush() : undefined) };
}

module.exports = { createBattlePass };
