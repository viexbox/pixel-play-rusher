'use strict';
/* PixelPlayRusher · cuentas online.
   - Registro con nombre de usuario ÚNICO (sin distinguir mayúsculas ni tildes) y contraseña guardada como hash scrypt.
   - El servidor es quien manda en el progreso y en la moneda PX: reparte tras cada partida, cobra colores y recompensas de rango,
     y acredita las compras de la tienda (Stripe Checkout + webhook firmado). El panel de administración puede sumar o restar PX.
   Rutas: /api/auth/*, /api/me*, /api/store*  y, en el panel, /api/admin/accounts, /px y /orders. */

const crypto = require('crypto');
const path = require('path');
const { Store } = require('./admin.js');
const { createAccountSecurity, mask } = require('./accountsec.js');

const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
const hex = n => crypto.randomBytes(n).toString('hex');
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const ukey = n => String(n || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const maskEmail = e => (e ? e.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2') : '');
const SESSION_MS = 30 * 86400000;
const EMPTY_STATS = () => ({ games: 0, kills: 0, deaths: 0, wins: 0, streak: 0, points: 0, best: 0 });

function createAccounts({ dataDir, log, S, admin, env = process.env }) {
  const now = () => Date.now();
  const db = new Store(path.join(dataDir, 'accounts.json'), { seq: 0, users: {}, sessions: {}, orders: [], pxlog: [] }, log);
  const D = db.data;
  /* ===== [NUEVO] Identidad por ID =====
     Cada cuenta se guarda con un UUID permanente (D.users[uuid]). El nombre de usuario es solo una etiqueta que se puede cambiar: el progreso, los PX, el pase
     de batalla y las sesiones cuelgan del ID. `byKey` es un índice (nombre normalizado → cuenta) que se reconstruye al arrancar y sirve para que dos cuentas no
     compartan nombre. Las cuentas antiguas (clave = nombre, id numérico) se migran solas en el primer arranque conservando su antiguo id en `legacyId`. */
  const isUuid = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  const byId = new Map(), byKey = new Map();
  let migrated = 0;
  (function loadUsers() {
    const remap = new Map(), users = {};
    for (const u of Object.values(D.users)) {
      if (!isUuid(u.id)) { const old = String(u.id); u.legacyId = u.legacyId || old; u.id = crypto.randomUUID(); remap.set(old, u.id); migrated++; }
      u.key = ukey(u.username); u.credits = u.credits | 0; for (const k of ['friends', 'reqIn', 'reqOut', 'blocked']) if (!Array.isArray(u[k])) u[k] = []; users[u.id] = u; byId.set(u.id, u); byKey.set(u.key, u);   // [NUEVO] u.credits: segunda moneda
    }
    D.users = users;
    for (const [h, s] of Object.entries(D.sessions || {})) if (!isUuid(s.uid)) { const n = remap.get(String(s.uid)); if (n) s.uid = n; else delete D.sessions[h]; }
    for (const o of D.orders || []) if (!isUuid(o.uid) && remap.has(String(o.uid))) o.uid = remap.get(String(o.uid));
    if (migrated) { log('Cuentas migradas a identificador único (UUID): ' + migrated); db.flush(); }
  })();
  const hooks = { onRename: null };   // server.js lo usa para mantener la clasificación al día cuando alguien cambia de nombre
  const NAME_CHANGE_MS = (+env.NAME_CHANGE_DAYS >= 0 ? +env.NAME_CHANGE_DAYS : 7) * 86400000;   // espera entre cambios de nombre (el primero es libre)
  const REQUIRE_TERMS = env.REQUIRE_TERMS !== '0';   // [NUEVO] para crear una cuenta hay que aceptar los términos y la privacidad (REQUIRE_TERMS=0 lo desactiva, solo para pruebas)
  const REG_MAX = +env.ACCOUNTS_REG_MAX || 5;                 // registros por IP y hora
  const PX_DAILY_CAP = +env.PX_DAILY_CAP || 5000;
  const CR_DAILY_CAP = +env.CR_DAILY_CAP || 4000;             // [NUEVO] Créditos máximos por cuenta y día que se pueden ganar jugando             // PX máximos por cuenta y día que se pueden ganar jugando
  const ALLOWED_ORIGINS = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

  /* ---------- Tienda (Stripe Checkout) ---------- */
  const STRIPE_KEY = String(env.STRIPE_SECRET_KEY || ''), STRIPE_WH = String(env.STRIPE_WEBHOOK_SECRET || '');
  const STRIPE_BASE = String(env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/+$/, '');
  const PUBLIC_URL = String(env.PUBLIC_URL || '').replace(/\/+$/, '');
  const CURRENCY = String(env.STORE_CURRENCY || 'eur').toLowerCase().slice(0, 3);
  let PACKS = [{ id: 'px500', px: 500, price: 99 }, { id: 'px1300', px: 1300, price: 199, tag: '+30 %' }, { id: 'px3500', px: 3500, price: 499, tag: '+40 %' }, { id: 'px8000', px: 8000, price: 999, tag: '+60 %' }];
  try { if (env.STORE_PACKS) { const p = JSON.parse(env.STORE_PACKS); if (Array.isArray(p) && p.length) PACKS = p.filter(x => x && /^[a-z0-9_-]{2,20}$/.test(x.id) && x.px > 0 && x.price >= 50).slice(0, 8); } } catch (e) { log('STORE_PACKS no es un JSON válido: se usan los paquetes por defecto.'); }
  /* [MEJORA] La tienda solo se abre con las TRES cosas: clave, dirección pública y secreto del webhook. Sin el secreto el jugador podría pagar y no recibir sus PX. */
  const storeOn = () => !!(STRIPE_KEY && PUBLIC_URL && STRIPE_WH);
  const storeMissing = () => [!STRIPE_KEY && 'STRIPE_SECRET_KEY', !PUBLIC_URL && 'PUBLIC_URL', !STRIPE_WH && 'STRIPE_WEBHOOK_SECRET'].filter(Boolean);
  /* [NUEVO] Métodos de pago de la tienda: por defecto SOLO tarjeta (incluye Apple Pay y Google Pay) y PayPal, sean cuales sean los que tengas activados en el panel de Stripe.
     STRIPE_PAYMENT_METHODS="card,paypal" (lista separada por comas) o "auto" para dejar que decida el panel de Stripe. */
  const rawMethods = String(env.STRIPE_PAYMENT_METHODS || 'card,paypal').trim().toLowerCase();
  const PAY_METHODS = rawMethods === 'auto' ? [] : [...new Set(rawMethods.split(',').map(s => s.trim()).filter(s => /^[a-z0-9_]{2,30}$/.test(s)))].slice(0, 6);
  let payFallback = false;   // true si Stripe rechazó algún método (p. ej. PayPal sin activar en tu cuenta): se cobra solo con tarjeta hasta reiniciar
  const storeInfo = () => ({ enabled: storeOn(), currency: CURRENCY, packs: PACKS.map(p => ({ id: p.id, px: p.px, price: p.price, tag: p.tag || '' })), methods: payFallback ? ['card'] : PAY_METHODS, reason: storeOn() ? '' : 'El dueño de la web aún no ha activado los pagos.' });

  /* ---------- Cuentas y sesiones ---------- */
  const fails = new Map(), regHits = new Map();
  const pub = u => (syncRankColors(u), { id: u.id, username: u.username, px: u.px, credits: u.credits | 0, stats: u.stats, unlocked: u.unlocked, colorTs: u.colorTs || {}, claimed: u.claimed, createdAt: u.createdAt, email: mask(u.email), emailVerified: !!u.emailVerified, deleteAt: u.deleteAt || 0, echange: u.echange ? mask(u.echange.email) : '' });   // [NUEVO] correo (enmascarado), si está verificado y si la cuenta está en plazo de eliminación
  function newSession(u) {
    const token = hex(32), t = now();
    D.sessions[sha(token)] = { uid: u.id, exp: t + SESSION_MS };
    const mine = Object.entries(D.sessions).filter(([, s]) => s.uid === u.id).sort((a, b) => a[1].exp - b[1].exp);
    for (const [k] of mine.slice(0, Math.max(0, mine.length - 5))) delete D.sessions[k];      // como mucho 5 sesiones abiertas por cuenta
    if (Object.keys(D.sessions).length > 20000) for (const [k, s] of Object.entries(D.sessions)) if (s.exp < t) delete D.sessions[k];
    db.save(); return token;
  }
  function fromToken(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const s = D.sessions[sha(token)]; if (!s) return null;
    if (s.exp < now()) { delete D.sessions[sha(token)]; return null; }
    const u = byId.get(s.uid) || null; if (u) markActive(u); return u;
  }
  /* [NUEVO] Actividad diaria de cada cuenta (últimos 90 días): base de las métricas de jugadores activos y retención */
  function markActive(u) { const d = new Date().toISOString().slice(0, 10); if (u.lastAct === d) return; u.lastAct = d; const a = (u.act = u.act || []); if (a[a.length - 1] !== d) a.push(d); if (a.length > 90) a.shift(); db.save(); }
  /* Movimientos de monedas por día (ganadas jugando), últimos 45 días */
  function eco(d) { const e = (D.eco = D.eco || {}); const k = d || new Date().toISOString().slice(0, 10); if (!e[k]) { e[k] = { px: 0, cr: 0, matches: 0 }; const ks = Object.keys(e).sort(); while (ks.length > 45) delete e[ks.shift()]; } return e[k]; }
  const nameTaken = name => byKey.has(ukey(name));
  const err = (code, error, extra) => Object.assign({ code, error }, extra || {});
  /* [NUEVO] Alternativas libres cuando el nombre elegido ya está cogido (en vez de un simple «ya en uso») */
  function suggest(base) {
    base = String(base || 'Jugador').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 10) || 'Jugador'; const out = [];
    for (let i = 0; i < 40 && out.length < 3; i++) { const n = base + (i % 2 ? '_' : '') + (10 + Math.floor(Math.random() * 990)); if (!byKey.has(ukey(n)) && !out.includes(n) && !admin.isReserved(n)) out.push(n); }
    return out;
  }

  function checkUsername(name) {
    name = String(name || '').trim();
    if (name.length < 3) return 'Mínimo 3 caracteres.'; if (name.length > 14) return 'Máximo 14 caracteres.';
    if (!/^[\p{L}\p{N}_-]+$/u.test(name)) return 'Solo letras, números, _ y -.';
    if (ukey(name).length < 3) return 'Usa letras del alfabeto latino o números.';
    if (/^guest/i.test(name) || /^invitado/i.test(name)) return 'Ese nombre está reservado para invitados.';
    return '';
  }
  async function register(b, ip) {
    const t = now(), hits = (regHits.get(ip) || []).filter(x => t - x < 3600000);
    if (hits.length >= REG_MAX) return err(429, 'Demasiados registros desde tu conexión. Inténtalo más tarde.');
    const username = String(b.username || '').trim(), email = normEmail(b.email), pw = String(b.password || '');
    if (REQUIRE_TERMS && b.terms !== true) return err(400, 'Debes aceptar los Términos de uso y la Política de privacidad para crear la cuenta.');   // [NUEVO]
    const e = checkUsername(username); if (e) return err(400, e);
    if (!validEmail(email)) return err(400, 'El correo no parece válido.');
    if (pw.length < 8 || pw.length > 128 || !/\p{L}/u.test(pw) || !/\p{N}/u.test(pw)) return err(400, 'La contraseña necesita 8 caracteres o más, con letras y números.');
    const ban = admin.banFor(username, ip); if (ban) return err(403, admin.banMessage(ban));
    if (admin.isReserved(username)) return err(400, 'Ese nombre está reservado.');
    const key = ukey(username);
    if (byKey.has(key)) return err(409, 'Ese nombre de usuario ya está en uso. Elige otro.', { suggestions: suggest(username) });
    if (Object.values(D.users).some(u => u.email === email)) return err(409, 'Ese correo ya tiene una cuenta.');
    hits.push(t); regHits.set(ip, hits);
    const salt = hex(16), hash = (await scrypt(pw, salt)).toString('hex');
    if (byKey.has(key)) return err(409, 'Ese nombre de usuario ya está en uso. Elige otro.', { suggestions: suggest(username) });   // otra petición pudo ganarle mientras se calculaba el hash
    const u = { id: crypto.randomUUID(), username, key, email, salt, hash, createdAt: t, lastLogin: t, px: 0, credits: 0, act: [new Date().toISOString().slice(0, 10)], friends: [], reqIn: [], reqOut: [], blocked: [], avatar: null, status: '', verified: false, stats: EMPTY_STATS(), unlocked: [0, 1, 2, 3], claimed: [], day: { d: '', px: 0 } };
    D.users[u.id] = u; byId.set(u.id, u); byKey.set(key, u); if (b.terms === true) u.terms = { v: 1, at: t }; u.emailVerified = false; db.flush(); if (Store.db) await Store.db.drain(2000); if (sec.mailOn()) sec.sendVerification(u).catch(() => {});   // [NUEVO] la cuenta se guarda por su ID y al momento (no a los 1,5 s)
    log('Cuenta nueva: ' + username + ' (' + u.id + ')');
    return { ok: true, token: newSession(u), profile: pub(u) };
  }
  async function login(b, ip) {
    const idf = String(b.identifier || '').trim(), pw = String(b.password || '');
    const kIp = 'ip:' + ip, kId = 'id:' + (ukey(idf) || normEmail(idf));
    const t = now(); for (const k of [kIp, kId]) { const f = fails.get(k); if (f && f.until > t) return err(429, 'Demasiados intentos. Espera ' + Math.ceil((f.until - t) / 1000) + ' s.'); }
    const u = byKey.get(ukey(idf)) || Object.values(D.users).find(x => idf.includes('@') && x.email === normEmail(idf)) || null;   // por nombre o por correo; la sesión que se crea va ligada al ID
    let good = false;
    try { const h = await scrypt(pw, u ? u.salt : 'a'.repeat(32)), st = Buffer.from(u ? u.hash : 'b'.repeat(128), 'hex'); good = !!u && h.length === st.length && crypto.timingSafeEqual(h, st); } catch (e) { good = false; }
    if (!good) {
      for (const [k, lim] of [[kIp, 6], [kId, 8]]) { const f = fails.get(k) || { n: 0, until: 0 }; f.n++; if (f.n >= lim) { f.n = 0; f.until = t + 5 * 60000; } fails.set(k, f); }
      return err(401, 'Usuario o contraseña incorrectos.');
    }
    fails.delete(kIp); fails.delete(kId);
    const ban = admin.banFor(u.username, ip); if (ban) return err(403, admin.banMessage(ban));
    u.lastLogin = t; return { ok: true, token: newSession(u), profile: pub(u) };
  }

  /* ---------- Progreso y monedero ---------- */
  const today = () => new Date().toISOString().slice(0, 10);
  /* [NUEVO] Beneficios de las cuentas verificadas (los edita el administrador en el panel → Verificados) */
  const VDEF = { chat: true, bonusPx: 20, bonusCr: 20, giftPx: 0, giftCr: 0 };
  const vcfg = () => Object.assign({}, VDEF, D.vcfg || {});
  function setVcfg(b) {
    const n = (v, max) => Math.max(0, Math.min(max, Math.trunc(+v) || 0)), c = { chat: b.chat !== false, bonusPx: n(b.bonusPx, 200), bonusCr: n(b.bonusCr, 200), giftPx: n(b.giftPx, 100000), giftCr: n(b.giftCr, 100000) };
    D.vcfg = c; db.flush(); return vcfg();
  }
  function awardMatch(u, r) {
    const st = u.stats, prevBest = st.best, ev0 = r.ev || { px: 1, cr: 1, names: [] }, vb = u.verified ? vcfg() : null;
    const ev = vb ? { px: ev0.px * (1 + vb.bonusPx / 100), cr: ev0.cr * (1 + vb.bonusCr / 100), names: (ev0.names || []).concat((vb.bonusPx || vb.bonusCr) ? ['Verificado +' + Math.max(vb.bonusPx, vb.bonusCr) + ' %'] : []) } : ev0;   // [NUEVO] beneficio de las cuentas verificadas (configurable en el panel; los topes diarios siguen valiendo)
    let px = Math.round(S.pxFor(r.points, r.won, r.cls) * ev.px);   // ev: eventos temporales (modo destacado y eventos del administrador)
    st.games++; st.kills += r.kills; st.deaths += r.deaths; st.wins += r.won ? 1 : 0; st.streak = Math.max(st.streak, r.bestStreak || 0); st.points += r.points; st.best = Math.max(st.best, r.points);
    if (u.day.d !== today()) u.day = { d: today(), px: 0 };
    px = Math.max(0, Math.min(px, PX_DAILY_CAP - u.day.px)); u.day.px += px; u.px += px;    // tope diario contra el granjeo entre cuentas
    /* [NUEVO] Créditos: la moneda que se gana jugando (con su propio tope diario) */
    if (!u.dayCr || u.dayCr.d !== today()) u.dayCr = { d: today(), n: 0 };
    const cr = Math.max(0, Math.min(Math.round(S.crFor(r.points, r.won) * ev.cr), CR_DAILY_CAP - u.dayCr.n)); u.dayCr.n += cr; u.credits += cr;
    { const e = eco(); e.px += px; e.cr += cr; e.matches++; }
    db.save(); return { px, cr, balance: u.px, crBalance: u.credits, prevBest, stats: st, mult: S.eventMult(S.todayEvent(), r.cls), ev: ev.names };
  }
  function unlockColor(u, i) {
    i = i | 0; const cost = S.COLOR_COSTS[i];
    if (cost == null) return err(400, 'Color no válido.'); if (u.unlocked.includes(i)) return err(400, 'Ya lo tienes.');
    if (u.px < cost) return err(402, 'Te faltan ' + (cost - u.px) + ' PX.');
    u.px -= cost; u.unlocked.push(i); (u.colorTs = u.colorTs || {})[i] = now(); db.flush(); return { ok: true, profile: pub(u) };   // colorTs: cuándo se consiguió (bloqueo de 24 h del mercado)
  }
  /* [RANGOS] Quien reclamó un rango antes del cambio recibe su color exclusivo nuevo sin volver a reclamar */
  function syncRankColors(u) {
    let ch = false;
    for (const i of u.claimed || []) { const r = S.RANKS[i]; if (r && r.color != null && !u.unlocked.includes(r.color)) { u.unlocked.push(r.color); (u.colorTs = u.colorTs || {})[r.color] = now(); ch = true; } }
    if (ch) db.save();
  }
  function claimRank(u, i) {
    i = i | 0; const r = S.RANKS[i];
    if (!r) return err(400, 'Rango no válido.'); if (u.stats.points < r.pts) return err(400, 'Aún no has alcanzado ese rango.'); if (u.claimed.includes(i)) return err(400, 'Ya reclamaste esa recompensa.');
    u.claimed.push(i); u.px += r.kr; if (r.color != null && !u.unlocked.includes(r.color)) { u.unlocked.push(r.color); (u.colorTs = u.colorTs || {})[r.color] = now(); }
    db.flush(); return { ok: true, profile: pub(u), gained: r.kr };
  }
  function adjust(username, delta, reason, by) {
    const u = byKey.get(ukey(username)); if (!u) return err(404, 'No existe ninguna cuenta con ese nombre.');
    delta = Math.trunc(+delta); if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1000000) return err(400, 'La cantidad debe ser un número entero distinto de 0 (máximo 1.000.000).');
    const applied = delta < 0 ? -Math.min(u.px, -delta) : delta; u.px += applied;
    D.pxlog.unshift({ ts: now(), uid: u.id, user: u.username, delta, applied, balance: u.px, reason: clean(reason, 120), by });
    if (D.pxlog.length > 2000) D.pxlog.length = 2000; db.flush();
    return { ok: true, username: u.username, applied, balance: u.px };
  }

  /* Cobro y abono de PX para otros módulos (pase de batalla). spend() no deja saldos negativos: devuelve false si no alcanza. */
  function spend(u, n, reason) {
    n = Math.trunc(n); if (!(n > 0) || u.px < n) return false;
    u.px -= n; D.pxlog.unshift({ ts: now(), uid: u.id, user: u.username, delta: -n, applied: -n, balance: u.px, reason: clean(reason, 120), by: 'juego' }); if (D.pxlog.length > 2000) D.pxlog.length = 2000; db.flush(); return true;
  }
  function grant(u, n, reason) {
    n = Math.trunc(n); if (!(n > 0)) return; u.px += n;
    D.pxlog.unshift({ ts: now(), uid: u.id, user: u.username, delta: n, applied: n, balance: u.px, reason: clean(reason, 120), by: 'juego' }); if (D.pxlog.length > 2000) D.pxlog.length = 2000; db.flush();
  }
  /* [NUEVO] Créditos: cobrar / abonar (los usa el mercado). spendCr no deja saldos negativos. */
  function spendCr(u, n, reason) { n = Math.trunc(n); if (!(n > 0) || u.credits < n) return false; u.credits -= n; logCr(u, -n, reason); return true; }
  function grantCr(u, n, reason) { n = Math.trunc(n); if (!(n > 0)) return; u.credits += n; logCr(u, n, reason); }
  function logCr(u, delta, reason) { (D.crlog = D.crlog || []).unshift({ ts: now(), uid: u.id, user: u.username, delta, balance: u.credits, reason: clean(reason, 120) }); if (D.crlog.length > 2000) D.crlog.length = 2000; db.flush(); }
  const find = name => byKey.get(ukey(name)) || null;
  const findById = id => byId.get(String(id)) || null;

  /* [NUEVO] Cambiar de nombre sin perder nada: todo cuelga del ID, no del nombre. El primer cambio es libre; los siguientes, cada NAME_CHANGE_DAYS días. */
  function rename(u, name, ip) {
    name = String(name || '').trim(); const e = checkUsername(name); if (e) return err(400, e);
    if (name === u.username) return err(400, 'Ese ya es tu nombre.');
    if (u.renamedAt && now() - u.renamedAt < NAME_CHANGE_MS) return err(429, 'Podrás cambiar el nombre otra vez en ' + Math.ceil((NAME_CHANGE_MS - (now() - u.renamedAt)) / 86400000) + ' día(s).');
    if (admin.banFor(u.username, ip) || admin.banFor(name, ip)) return err(403, 'No puedes cambiar de nombre ahora mismo.');
    if (admin.isReserved(u.username) || admin.isReserved(name)) return err(400, 'Ese nombre está reservado.');
    const key = ukey(name), other = byKey.get(key);
    if (other && other !== u) return err(409, 'Ese nombre de usuario ya está en uso. Elige otro.', { suggestions: suggest(name) });
    const old = u.username; byKey.delete(u.key); u.username = name; u.key = key; byKey.set(key, u);
    u.renamedAt = now(); u.prevNames = (u.prevNames || []).concat(old).slice(-5); db.flush();
    log('Cambio de nombre: ' + old + ' → ' + name + ' (' + u.id + ')'); if (hooks.onRename) hooks.onRename(u, old);
    return { ok: true, profile: pub(u) };
  }

  /* ---------- Compras (Stripe Checkout) ---------- */
  async function checkout(u, packId) {
    if (!storeOn()) return err(503, storeInfo().reason);
    const pack = PACKS.find(p => p.id === packId); if (!pack) return err(400, 'Paquete no válido.');
    /* Crea la sesión de pago con los métodos indicados. Devuelve { j } si va bien o { bad, msg } si Stripe la rechaza. */
    const createSession = async methods => {
      const f = new URLSearchParams();
      f.set('mode', 'payment'); f.set('success_url', PUBLIC_URL + '/?px=ok'); f.set('cancel_url', PUBLIC_URL + '/?px=cancel');
      f.set('client_reference_id', String(u.id)); f.set('metadata[pack]', pack.id); f.set('metadata[uid]', String(u.id));
      f.set('line_items[0][quantity]', '1'); f.set('line_items[0][price_data][currency]', CURRENCY); f.set('line_items[0][price_data][unit_amount]', String(pack.price));
      f.set('line_items[0][price_data][product_data][name]', pack.px + ' PX · PixelPlayRusher');
      methods.forEach((m, i) => f.set('payment_method_types[' + i + ']', m));   // [NUEVO] solo estos métodos (vacío = los del panel de Stripe)
      const r = await fetch(STRIPE_BASE + '/v1/checkout/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + STRIPE_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f, signal: AbortSignal.timeout(15000) });
      const j = await r.json(); if (r.ok && j.url && j.id) return { j };
      const e = (j && j.error) || {}; return { bad: true, msg: clean(e.message, 160), method: /payment_method/i.test(e.param || '') || /payment method/i.test(e.message || '') };
    };
    let j; try {
      let res = await createSession(payFallback ? ['card'] : PAY_METHODS);
      if (res.bad && res.method && !payFallback && PAY_METHODS.some(m => m !== 'card')) {   // [NUEVO] p. ej. PayPal aún sin activar en tu cuenta de Stripe: no se cae la tienda, se cobra con tarjeta y se avisa en el registro
        payFallback = true; log('Stripe rechazó un método de pago (' + res.msg + '). Se cobrará solo con tarjeta. Activa PayPal en Stripe → Ajustes → Métodos de pago o revisa STRIPE_PAYMENT_METHODS.');
        res = await createSession(['card']);
      }
      if (res.bad) { log('Stripe rechazó la sesión de pago: ' + res.msg); return err(502, 'No se pudo iniciar el pago. Inténtalo más tarde.'); }
      j = res.j;
    } catch (e) { log('No se pudo contactar con Stripe: ' + e.message); return err(502, 'No se pudo iniciar el pago. Inténtalo más tarde.'); }
    D.orders.unshift({ id: j.id, uid: u.id, user: u.username, pack: pack.id, px: pack.px, amount: pack.price, currency: CURRENCY, status: 'pending', ts: now() });
    if (D.orders.length > 2000) D.orders.length = 2000; db.flush();
    return { ok: true, url: j.url };
  }
  function verifySignature(raw, header) {
    if (!STRIPE_WH || !header) return false;
    const parts = Object.fromEntries(String(header).split(',').map(x => x.trim().split('=')).filter(x => x.length === 2));
    const ts = +parts.t; if (!ts || Math.abs(now() / 1000 - ts) > 300) return false;
    const expected = crypto.createHmac('sha256', STRIPE_WH).update(ts + '.' + raw).digest('hex');
    return String(header).split(',').map(x => x.trim()).filter(x => x.startsWith('v1=')).some(x => { const v = x.slice(3); return v.length === expected.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected)); });
  }
  function webhook(raw, header) {
    if (!verifySignature(raw, header)) return err(400, 'Firma no válida.');
    let ev; try { ev = JSON.parse(raw); } catch (e) { return err(400, 'JSON no válido.'); }
    const o = ev && ev.data && ev.data.object;
    if (ev && (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') && o && o.payment_status === 'paid') {
      const order = D.orders.find(x => x.id === o.id);
      if (!order) { log('Pago recibido de una sesión desconocida: ' + clean(o.id, 40)); return { ok: true }; }
      if (order.status === 'paid') return { ok: true };                       // ya acreditado (Stripe reintenta los avisos)
      if (o.amount_total !== order.amount || String(o.currency).toLowerCase() !== order.currency) { order.status = 'mismatch'; db.save(); log('Pago con importe distinto al pedido ' + order.id); return { ok: true }; }
      const u = byId.get(order.uid); if (!u) { order.status = 'orphan'; db.flush(); return { ok: true }; }
      u.px += order.px; order.status = 'paid'; order.paidAt = now(); db.flush(); log('PX comprados: ' + order.px + ' para ' + u.username);
    }
    return { ok: true };
  }

  /* ---------- HTTP ---------- */
  const handles = p => p.startsWith('/api/auth/') || p === '/api/me' || p.startsWith('/api/me/') || p.startsWith('/api/store');
  const hits = new Map(); const hitTimer = setInterval(() => hits.clear(), 60000); if (hitTimer.unref) hitTimer.unref();
  const readRaw = (req, max) => new Promise((res, rej) => { let n = 0; const parts = []; req.on('data', c => { n += c.length; if (n > max) { rej(new Error('cuerpo demasiado grande')); req.destroy(); } else parts.push(c); }); req.on('end', () => res(Buffer.concat(parts).toString('utf8'))); req.on('error', rej); });
  function send(req, res, code, obj) {
    const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const origin = req.headers.origin; if (origin && (ALLOWED_ORIGINS.includes(origin) || (env.ALLOW_FILE_ORIGIN !== '0' && origin === 'null'))) { h['Access-Control-Allow-Origin'] = origin; h.Vary = 'Origin'; h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'; h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'; }
    res.writeHead(code, h); res.end(obj == null ? '' : JSON.stringify(obj));
  }
  /* [NUEVO] Correo vinculado, recuperación y eliminación de la cuenta */
  const sec = createAccountSecurity({ D, byKey, byId, db, err, sha, scrypt, hex, now, ukey, normEmail, validEmail, admin, log, env, S, Store });
  async function handleHttp(req, res, url, ip) {
    if (!handles(url.pathname)) return false;
    if (req.method === 'OPTIONS') { send(req, res, 204, null); return true; }
    const n = (hits.get(ip) || 0) + 1; hits.set(ip, n); if (n > 300) { send(req, res, 429, { error: 'Demasiadas peticiones.' }); return true; }
    const key = req.method + ' ' + url.pathname;
    try {
      if (key === 'POST /api/store/webhook') { const r = webhook(await readRaw(req, 100000), req.headers['stripe-signature']); send(req, res, r.code || 200, r.error ? { error: r.error } : { ok: true }); return true; }
      const body = req.method === 'POST' ? (() => readRaw(req, 4000).then(t => (t ? JSON.parse(t) : {})))() : Promise.resolve({});
      const b = await body;
      let out;
      if (key === 'POST /api/auth/register') out = await register(b, ip);
      else if (key === 'POST /api/auth/login') out = await login(b, ip);
      else if (key === 'GET /api/store') out = storeInfo();
      else if (sec.publicRoutes[key]) out = await sec.publicRoutes[key](b, ip);
      else {
        const h = String(req.headers.authorization || ''), token = h.startsWith('Bearer ') ? h.slice(7) : '', u = fromToken(token);
        if (!u) { send(req, res, 401, { error: 'Sesión no válida o caducada.' }); return true; }
        if (key === 'GET /api/me') out = { ok: true, profile: pub(u), mail: sec.mailOn(), deleteDays: sec.deleteDays };
        else if (sec.authRoutes[key]) out = await sec.authRoutes[key](u, b, ip, token);
        else if (key === 'POST /api/auth/logout') { delete D.sessions[sha(token)]; db.save(); out = { ok: true }; }
        else if (key === 'POST /api/me/unlock') out = unlockColor(u, b.i);
        else if (key === 'POST /api/me/claim') out = claimRank(u, b.i);
        else if (key === 'POST /api/me/rename') out = rename(u, b.username, ip);   // [NUEVO]
        else if (key === 'POST /api/store/checkout') out = await checkout(u, String(b.pack || ''));
        else { send(req, res, 404, { error: 'No encontrado.' }); return true; }
      }
      send(req, res, out.code || 200, out.error ? { error: out.error, suggestions: out.suggestions } : out);
    } catch (e) { send(req, res, 400, { error: e.message === 'cuerpo demasiado grande' ? e.message : 'Petición no válida.' }); }
    return true;
  }

  /* ---------- Rutas del panel de administración ---------- */
  admin.addRoutes({
    'GET /accounts': ({ q }) => {
      const s = ukey(q.get('q')), list = Object.values(D.users).filter(u => !s || u.key.includes(s) || u.email.includes(String(q.get('q')).toLowerCase())).sort((a, b) => b.createdAt - a.createdAt);
      return { total: Object.keys(D.users).length, accounts: list.slice(0, 100).map(u => ({ id: u.id, username: u.username, email: maskEmail(u.email), px: u.px, points: u.stats.points, games: u.stats.games, createdAt: u.createdAt, lastLogin: u.lastLogin, credits: u.credits | 0, verified: !!u.verified, emailOk: !!u.emailVerified, deleteAt: u.deleteAt || 0, email2: u.email })) };
    },
    /* [NUEVO] Ajuste manual de Créditos (soporte): suma o resta, sin dejar saldos negativos */
    'POST /credits': ({ b, s }) => {
      const u = find(b.username); if (!u) return err(404, 'No existe ninguna cuenta con ese nombre.');
      const d = Math.trunc(+b.delta); if (!Number.isFinite(d) || d === 0 || Math.abs(d) > 1000000) return err(400, 'La cantidad debe ser un entero distinto de 0 (máximo 1.000.000).');
      const applied = d > 0 ? d : -Math.min(u.credits, -d); if (applied > 0) grantCr(u, applied, 'ajuste admin: ' + clean(b.reason, 80)); else if (applied < 0) spendCr(u, -applied, 'ajuste admin: ' + clean(b.reason, 80));
      admin.audit(s.user, 'creditos-' + (applied >= 0 ? 'sumar' : 'restar'), u.username + ' ' + (applied >= 0 ? '+' : '') + applied + ' CR'); return { ok: true, username: u.username, applied, credits: u.credits };
    },
    'POST /px': ({ b, s }) => { const r = adjust(b.username, b.delta, b.reason, s.user); if (!r.error) admin.audit(s.user, 'px-' + (r.applied >= 0 ? 'sumar' : 'restar'), r.username + ' ' + (r.applied >= 0 ? '+' : '') + r.applied + ' PX' + (b.reason ? ' · ' + clean(b.reason, 80) : '')); return r; },
    'GET /orders': () => ({ enabled: storeOn(), orders: D.orders.slice(0, 200), pxlog: D.pxlog.slice(0, 100) })
  });

  const readJson = (req, max) => readRaw(req, max || 4000).then(t => (t ? JSON.parse(t) : {}));   // max: las fotos de perfil necesitan más de 4 KB
  /* Ids antiguos (numéricos) cuyas filas del pase aún hay que pasar al UUID nuevo (lo hace battlepass.js al arrancar) */
  const legacyPending = () => Object.values(D.users).filter(u => u.legacyId && !u.bpMoved).map(u => ({ old: u.legacyId, id: u.id }));
  const legacyDone = ids => { for (const id of ids) { const u = byId.get(id); if (u) u.bpMoved = true; } db.save(); };
  log(storeOn() ? 'Tienda: ACTIVADA (métodos: ' + (PAY_METHODS.join(', ') || 'los del panel de Stripe') + ')' : (STRIPE_KEY || PUBLIC_URL || STRIPE_WH ? 'Tienda: DESACTIVADA. Faltan las variables: ' + storeMissing().join(', ') : 'Tienda: desactivada (sin configurar Stripe)'));   // [NUEVO] para comprobarlo en el registro del servidor
  /* [NUEVO] Colores comerciables: quitar un color de la cuenta (al anunciarlo) o darlo (al comprarlo o al retirar el anuncio) */
  function takeColor(u, i) { const k = u.unlocked.indexOf(i); if (k < 0) return false; u.unlocked.splice(k, 1); if (u.colorTs) delete u.colorTs[i]; db.save(); return true; }
  function giveColor(u, i, ts) { if (u.unlocked.includes(i)) return false; u.unlocked.push(i); (u.colorTs = u.colorTs || {})[i] = ts || now(); db.save(); return true; }
  const touch = () => db.save(), allUsers = () => Object.values(D.users);   // [NUEVO] para el módulo social
  admin.setVerifiedProvider({ has: name => { const u = byKey.get(ukey(name)); return !!(u && u.verified); }, cfg: vcfg });   // [NUEVO] el panel verifica por nombre de cuenta
  /* Ajuste de Créditos (misma lógica que POST /credits) para otros módulos del panel */
  function adjustCr(username, delta, reason, by) {
    const u = find(username); if (!u) return err(404, 'No existe ninguna cuenta con ese nombre.');
    const d = Math.trunc(+delta); if (!Number.isFinite(d) || d === 0 || Math.abs(d) > 1000000) return err(400, 'La cantidad debe ser un entero distinto de 0 (máximo 1.000.000).');
    const applied = d > 0 ? d : -Math.min(u.credits, -d); if (applied > 0) grantCr(u, applied, 'ajuste admin: ' + clean(reason, 80)); else if (applied < 0) spendCr(u, -applied, 'ajuste admin: ' + clean(reason, 80));
    return { ok: true, username: u.username, applied, credits: u.credits };
  }
  return { deleteDays: sec.deleteDays, doc: D, adjustPx: adjust, adjustCr, vcfg, setVcfg, flush: () => db.flush(), storeOn, mailOn: sec.mailOn, onRemove: sec.onRemove, removeUser: sec.removeUser, purgeDue: sec.purgeDue, eco: () => Object.assign({}, D.eco || {}), markActive, takeColor, giveColor, touch, allUsers, handleHttp, handles, fromToken, nameTaken, awardMatch, profile: pub, flush: () => db.flush(), adjust, register, storeInfo, spend, grant, spendCr, grantCr, find, findById, rename, suggest, hooks, legacyPending, legacyDone, http: { send, readJson } };
}

module.exports = { createAccounts, ukey };
