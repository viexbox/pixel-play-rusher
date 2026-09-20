'use strict';
/* Pixel Play Rusher · Pase de batalla (Temporada 1).
   - Niveles 1–50 con XP, dos filas de recompensas (gratis y VIP), skins de armas y cuchillos y el banner S1.
   - Se paga con PX (los PX ya se pueden comprar con dinero real en la tienda). El servidor decide todo: nivel, XP, quién es VIP y qué está reclamado.
   - Persistencia: PostgreSQL (tablas bp_*, ver migrations/) si hay DATABASE_URL; si no, un archivo JSON en DATA_DIR.
   Rutas: GET /api/bp · POST /api/bp/{claim,claim-all,buy,gift,skip,equip} · en el panel: /api/admin/bp/{user,grant}. */

const path = require('path');
const { Store } = require('./admin.js');

const SEASON = 1;
const SLOT_RE = /^(weapon:[a-z0-9_]{2,20}|knife|banner)$/;

/* ================= Almacén PostgreSQL ================= */
function pgStore(pool, S) {
  const tx = async fn => { const c = await pool.connect(); try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); } };
  return {
    kind: 'postgres',
    async state(uid) {
      const [p, c, i, e] = await Promise.all([
        pool.query('SELECT xp, level, vip, vip_since, gifted_by FROM bp_progress WHERE user_id = $1 AND season = $2', [uid, SEASON]),
        pool.query('SELECT level, track, item_type, item_id FROM bp_claims WHERE user_id = $1 AND season = $2 ORDER BY level', [uid, SEASON]),
        pool.query('SELECT item_type, item_id FROM bp_inventory WHERE user_id = $1', [uid]),
        pool.query('SELECT slot, item_id FROM bp_equipped WHERE user_id = $1', [uid])]);
      const r = p.rows[0] || { xp: 0, level: 1, vip: false, vip_since: null, gifted_by: null };
      return { xp: r.xp, level: r.level, vip: r.vip, vipSince: r.vip_since ? +new Date(r.vip_since) : 0, giftedBy: r.gifted_by || '', claims: c.rows.map(x => ({ level: x.level, track: x.track, t: x.item_type, id: x.item_id })),
        inventory: i.rows.map(x => ({ t: x.item_type, id: x.item_id })), equipped: Object.fromEntries(e.rows.map(x => [x.slot, x.item_id])) };
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
    async grantVip(uid, giftedBy) {
      const r = await pool.query('INSERT INTO bp_progress (user_id, season, vip, vip_since, gifted_by) VALUES ($1, $2, TRUE, now(), $3) ON CONFLICT (user_id, season) DO UPDATE SET vip = TRUE, vip_since = now(), gifted_by = $3, updated_at = now() WHERE bp_progress.vip = FALSE',
        [uid, SEASON, giftedBy || null]);
      return r.rowCount > 0;
    },
    async logGift(from, to) { await pool.query('INSERT INTO bp_gifts (from_user, to_user, season) VALUES ($1, $2, $3)', [from, to, SEASON]); },
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
  const U = uid => (D.users[uid] || (D.users[uid] = { xp: 0, level: 1, vip: false, vipSince: 0, giftedBy: '', xpDay: '', xpToday: 0, claims: {}, inventory: {}, equipped: {} }));
  return {
    kind: 'file', flush: () => st.flush(),
    async state(uid) {
      const u = D.users[uid] || U(uid);
      return { xp: u.xp, level: u.level, vip: u.vip, vipSince: u.vipSince, giftedBy: u.giftedBy, claims: Object.entries(u.claims).map(([k, v]) => ({ level: +k.split(':')[0], track: k.split(':')[1], t: v.t, id: v.id })).sort((a, b) => a.level - b.level),
        inventory: Object.values(u.inventory).map(v => ({ t: v.t, id: v.id })), equipped: Object.assign({}, u.equipped) };
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
    async grantVip(uid, giftedBy) { const u = U(uid); if (u.vip) return false; u.vip = true; u.vipSince = Date.now(); u.giftedBy = giftedBy || ''; st.save(); return true; },
    async logGift(from, to) { D.gifts.push({ from, to, season: SEASON, ts: Date.now() }); if (D.gifts.length > 5000) D.gifts.shift(); st.save(); },
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

  /* Una operación a la vez por usuario: evita dobles cobros y dobles reclamos con clics rápidos */
  const chains = new Map();
  const lock = (uid, fn) => { const prev = chains.get(uid) || Promise.resolve(); const run = prev.then(fn, fn); const tail = run.catch(() => {}); chains.set(uid, tail); tail.then(() => { if (chains.get(uid) === tail) chains.delete(uid); }); return run; };

  const owned = (st, t, id) => st.inventory.some(x => x.t === t && x.id === id);
  const view = async u => {
    const st = await store.state(u.id), lv = S.bpLevelOf(st.xp);
    return { season: SEASON, level: lv.level, xp: st.xp, into: lv.into, need: lv.need, vip: st.vip, giftedBy: st.giftedBy, claims: st.claims.map(c => c.level + ':' + c.track), inventory: st.inventory, equipped: st.equipped,
      prices: { vip: VIP_PX, skip: SKIP_PX }, px: u.px };
  };

  /* XP tras una partida online (la llama el servidor de juego). Devuelve null si no suma nada. */
  async function awardMatch(u, { points, won }) {
    const xp = S.bpXpFor(points, won); if (xp <= 0) return null;
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
    async equip(u, b) {
      const slot = String(b.slot || ''), item = b.item ? String(b.item) : null; if (!SLOT_RE.test(slot)) return err(400, 'Ranura no válida.');
      const type = slot === 'knife' ? 'kskin' : slot === 'banner' ? 'banner' : 'wskin';
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
      const key = req.method + ' ' + url.pathname, b = req.method === 'POST' ? await readJson(req) : {};
      let out;
      if (key === 'GET /api/bp') out = { ok: true, state: await view(u) };
      else if (req.method === 'POST' && url.pathname.startsWith('/api/bp/')) {
        const op = { '/api/bp/claim': ops.claim, '/api/bp/claim-all': ops.claimAll, '/api/bp/buy': ops.buy, '/api/bp/gift': ops.gift, '/api/bp/skip': ops.skip, '/api/bp/equip': ops.equip }[url.pathname];
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

  return { handles, handleHttp, awardMatch, view, store, prices: { vip: VIP_PX, skip: SKIP_PX }, flush: () => (store.flush ? store.flush() : undefined) };
}

module.exports = { createBattlePass };
