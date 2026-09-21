'use strict';
/* Pixel Play Rusher · Perfiles y opciones sociales.
   - Perfil público de cada jugador: foto, estado, rango, estadísticas, banner equipado del pase e insignia de verificado.
   - Foto de perfil: una de 16 predefinidas o una imagen propia (JPEG/PNG, máx. 60 KB y 512×512; el navegador la reduce antes de subirla). Se valida por
     contenido (no por lo que diga el navegador), se guarda en PostgreSQL (tabla user_avatars) o en DATA_DIR/avatars y se sirve con nosniff.
   - Amigos: solicitudes, aceptar, rechazar, cancelar, eliminar, bloquear y denunciar. Todo cuelga del ID de la cuenta.
   - Verificado: administrador o influencer (por nombre, como en el juego) o cuenta marcada por el administrador desde el panel.
   Rutas: GET /api/profile?name= · GET /api/avatar?u= · GET /api/social · POST /api/social/{avatar,status,request,accept,decline,cancel,remove,block,unblock,report} */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./admin.js');

const MAX_BYTES = 60000, MAX_DIM = 512, PRESETS = 16, MAX_FRIENDS = 100, MAX_PENDING = 50;
const AVATAR_GAP_MS = process.env.AVATAR_GAP_MS !== undefined ? +process.env.AVATAR_GAP_MS : 20000;   // espera entre cambios de foto (evita el abuso)

/* Comprueba por el contenido que es JPEG o PNG y lee su tamaño en píxeles (así una imagen «bomba» de 60 KB con 30.000 px no llega a nadie) */
function sniffImage(buf) {
  if (buf.length > 24 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && buf.slice(12, 16).toString() === 'IHDR') return { mime: 'image/png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1]; if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { mime: 'image/jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/* ================= Almacén de fotos ================= */
function avatarStore(pool, dataDir) {
  if (pool) return {
    async put(uid, mime, buf) { await pool.query('INSERT INTO user_avatars (user_id, mime, data) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()', [uid, mime, buf]); },
    async get(uid) { const r = (await pool.query('SELECT mime, data FROM user_avatars WHERE user_id = $1', [uid])).rows[0]; return r ? { mime: r.mime, buf: r.data } : null; },
    async del(uid) { await pool.query('DELETE FROM user_avatars WHERE user_id = $1', [uid]); }
  };
  const dir = path.join(dataDir, 'avatars'); fs.mkdirSync(dir, { recursive: true });
  const file = uid => path.join(dir, uid.replace(/[^0-9a-f-]/gi, '') + '.bin');
  return {
    async put(uid, mime, buf) { fs.writeFileSync(file(uid), Buffer.concat([Buffer.from(mime === 'image/png' ? 'P' : 'J'), buf]), { mode: 0o600 }); },
    async get(uid) { try { const b = fs.readFileSync(file(uid)); return { mime: b[0] === 0x50 ? 'image/png' : 'image/jpeg', buf: b.slice(1) }; } catch (e) { return null; } },
    async del(uid) { try { fs.unlinkSync(file(uid)); } catch (e) { /* no había */ } }
  };
}

function createSocial({ S, accounts, admin, bp, db, dataDir, log, presence, rankedOf, env }) {
  env = env || process.env;
  /* [NUEVO] Moderación de fotos ANTES de mostrarlas. AVATAR_MODERATION = off (por defecto: se muestra al momento) · hold (la foto queda «en revisión», solo la ve su dueño, hasta que un administrador la apruebe),
     auto (la revisa un servicio externo en AVATAR_MODERATION_URL y solo si no responde queda en revisión).
     Contrato del servicio: POST JSON { image: <base64>, mime } → { ok: true | false, reason? }. No hay un clasificador de imágenes propio: eso lo pone quien lo contrate. */
  const MOD = ['off', 'hold', 'auto'].includes(env.AVATAR_MODERATION) ? env.AVATAR_MODERATION : 'off', MOD_URL = env.AVATAR_MODERATION_URL || '', MOD_KEY = env.AVATAR_MODERATION_KEY || '', MOD_MS = +env.AVATAR_MODERATION_TIMEOUT_MS || 5000;
  const CDN = String(env.AVATAR_CDN_URL || '').replace(/\/+$/, '');   // si hay un CDN delante, las fotos se piden allí (él pide al servidor y las guarda)
  async function screen(buf, mime) {
    if (MOD === 'off') return { status: 'ok' };
    if (MOD === 'auto' && MOD_URL) {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), MOD_MS);
      try {
        const r = await fetch(MOD_URL, { method: 'POST', signal: ac.signal, headers: Object.assign({ 'Content-Type': 'application/json' }, MOD_KEY ? { Authorization: 'Bearer ' + MOD_KEY } : {}), body: JSON.stringify({ image: buf.toString('base64'), mime }) });
        const j = await r.json(); clearTimeout(tm);
        if (r.ok && typeof j.ok === 'boolean') return j.ok ? { status: 'ok' } : { status: 'rejected', reason: String(j.reason || 'Contenido no permitido').replace(/[\u0000-\u001f<>]/g, '').slice(0, 80) };
        log('Moderación de fotos: respuesta no válida del servicio; la foto queda en revisión');
      } catch (e) { clearTimeout(tm); log('Moderación de fotos: el servicio no responde (' + e.message + '); la foto queda en revisión'); }
    }
    return { status: 'pending' };
  }
  const err = (code, error) => ({ code, error });
  const avatars = avatarStore(db ? db.pool : null, dataDir);
  const doc = new Store(path.join(dataDir, 'social.json'), { seq: 0, reports: [] }, log);   // denuncias de perfil (las ve el panel)
  const clean = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const rankOf = pts => { let i = 0; S.RANKS.forEach((r, k) => { if (pts >= r.pts) i = k; }); return { i, n: S.RANKS[i].n, col: S.RANKS[i].col }; };
  const verifiedOf = u => { const r = admin.roleOf(u.username); return r || (u.verified ? 'acc' : 0); };   // 'admin' | 'inf' | 'acc' | 0

  const modOf = u => (u.avatar && u.avatar.kind === 'custom' ? u.avatar.mod || 'ok' : 'ok');   // las fotos anteriores a la moderación cuentan como aprobadas
  const fallback = u => ({ kind: 'preset', id: Math.abs(hash(u.id)) % PRESETS });
  const avatarView = u => (!u.avatar ? fallback(u) : u.avatar.kind === 'preset' ? { kind: 'preset', id: u.avatar.id } : modOf(u) !== 'ok' ? fallback(u) : { kind: 'custom', url: (CDN ? CDN + '/' : '') + 'api/avatar?u=' + encodeURIComponent(u.username) + '&v=' + u.avatar.v });
  /* Lo que ve el propio dueño: su foto aunque esté en revisión (como imagen incrustada), con su estado */
  async function ownAvatarView(u) { const v = avatarView(u), m = modOf(u); if (u.avatar && u.avatar.kind === 'custom' && m !== 'ok') { const a = await avatars.get(u.id); if (a) return Object.assign(v, { status: m, preview: 'data:' + a.mime + ';base64,' + a.buf.toString('base64') }); } return m === 'ok' ? v : Object.assign(v, { status: m }); }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  const relation = (me, u) => !me ? 'none' : me.id === u.id ? 'self' : me.blocked.includes(u.id) ? 'blocked' : me.friends.includes(u.id) ? 'friend' : me.reqOut.includes(u.id) ? 'pending-out' : me.reqIn.includes(u.id) ? 'pending-in' : 'none';

  /* Perfil público. La conexión (en línea / jugando) solo la ven el propio jugador y sus amigos. */
  async function profileOf(u, me) {
    const st = u.stats, rel = relation(me, u), seeOnline = rel === 'self' || rel === 'friend';
    const bps = await bp.view(u), banner = bps.equipped.banner || null;
    return { username: u.username, verified: verifiedOf(u), avatar: rel === 'self' ? await ownAvatarView(u) : avatarView(u), status: u.status || '', rank: rankOf(st.points), points: st.points, bpLevel: bps.level, bpVip: bps.vip, banner,
      stats: { games: st.games, kills: st.kills, deaths: st.deaths, wins: st.wins, best: st.best, streak: st.streak, kd: st.deaths ? +(st.kills / st.deaths).toFixed(2) : st.kills }, since: u.createdAt,
      friends: u.friends.length, online: seeOnline ? presence(u.id) : null, relation: rel, ranked: rankedOf ? rankedOf(u) : null, note: rel === 'self' ? u.avatarNote || '' : '' };
  }
  const brief = u => ({ username: u.username, verified: verifiedOf(u), avatar: avatarView(u), rank: rankOf(u.stats.points), status: u.status || '' });

  /* ---------- Acciones ---------- */
  const other = name => accounts.find(String(name || ''));
  const unlink = (a, b) => { for (const k of ['friends', 'reqIn', 'reqOut']) { a[k] = a[k].filter(x => x !== b.id); b[k] = b[k].filter(x => x !== a.id); } };
  const social = {
    async request(u, b) {
      const t = other(b.name); if (!t) return err(404, 'No existe ningún jugador con ese nombre.'); if (t.id === u.id) return err(400, 'No puedes añadirte a ti mismo.');
      if (u.blocked.includes(t.id) || t.blocked.includes(u.id)) return err(400, 'No se puede enviar la solicitud a este jugador.');
      if (u.friends.includes(t.id)) return err(400, 'Ya sois amigos.'); if (u.reqOut.includes(t.id)) return err(400, 'Ya le enviaste una solicitud.');
      if (u.reqIn.includes(t.id)) return social.accept(u, { name: t.username });   // ya te la había enviado él: se aceptan mutuamente
      if (u.friends.length >= MAX_FRIENDS) return err(400, 'Has llegado al máximo de ' + MAX_FRIENDS + ' amigos.'); if (t.friends.length >= MAX_FRIENDS) return err(400, 'Ese jugador tiene la lista de amigos llena.');
      if (t.reqIn.length >= MAX_PENDING || u.reqOut.length >= MAX_PENDING) return err(400, 'Demasiadas solicitudes pendientes.');
      u.reqOut.push(t.id); t.reqIn.push(u.id); accounts.touch(); return { ok: true, relation: 'pending-out' };
    },
    async accept(u, b) {
      const t = other(b.name); if (!t || !u.reqIn.includes(t.id)) return err(400, 'No tienes una solicitud de ese jugador.');
      if (u.friends.length >= MAX_FRIENDS || t.friends.length >= MAX_FRIENDS) return err(400, 'Lista de amigos llena.');
      unlink(u, t); u.friends.push(t.id); t.friends.push(u.id); accounts.touch(); return { ok: true, relation: 'friend' };
    },
    async decline(u, b) { const t = other(b.name); if (!t || !u.reqIn.includes(t.id)) return err(400, 'No tienes una solicitud de ese jugador.'); unlink(u, t); accounts.touch(); return { ok: true, relation: 'none' }; },
    async cancel(u, b) { const t = other(b.name); if (!t || !u.reqOut.includes(t.id)) return err(400, 'No hay una solicitud enviada a ese jugador.'); unlink(u, t); accounts.touch(); return { ok: true, relation: 'none' }; },
    async remove(u, b) { const t = other(b.name); if (!t || !u.friends.includes(t.id)) return err(400, 'Ese jugador no está en tu lista de amigos.'); unlink(u, t); accounts.touch(); return { ok: true, relation: 'none' }; },
    async block(u, b) {
      const t = other(b.name); if (!t) return err(404, 'No existe ningún jugador con ese nombre.'); if (t.id === u.id) return err(400, 'No puedes bloquearte a ti mismo.');
      unlink(u, t); if (!u.blocked.includes(t.id)) { if (u.blocked.length >= 200) return err(400, 'Lista de bloqueados llena.'); u.blocked.push(t.id); } accounts.touch(); return { ok: true, relation: 'blocked' };
    },
    async unblock(u, b) { const t = other(b.name); if (!t || !u.blocked.includes(t.id)) return err(400, 'Ese jugador no está bloqueado.'); u.blocked = u.blocked.filter(x => x !== t.id); accounts.touch(); return { ok: true, relation: 'none' }; },
    async status(u, b) { u.status = clean(b.status, 40); accounts.touch(); return { ok: true, status: u.status }; },
    async avatar(u, b) {
      if (u.avatarAt && Date.now() - u.avatarAt < AVATAR_GAP_MS) return err(429, 'Espera unos segundos antes de cambiar la foto otra vez.');
      if (b.remove) { await avatars.del(u.id); u.avatar = null; }
      else if (Number.isInteger(b.preset)) { if (b.preset < 0 || b.preset >= PRESETS) return err(400, 'Foto no válida.'); await avatars.del(u.id); u.avatar = { kind: 'preset', id: b.preset }; }
      else if (typeof b.image === 'string') {
        const m = /^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(b.image); if (!m) return err(400, 'Sube una imagen JPEG o PNG.');
        const buf = Buffer.from(m[1], 'base64'); if (buf.length > MAX_BYTES) return err(413, 'La imagen pesa demasiado (máximo 60 KB). Prueba con otra o más pequeña.');
        const im = sniffImage(buf); if (!im) return err(400, 'El archivo no es una imagen JPEG o PNG válida.');
        if (!(im.w > 0 && im.h > 0) || im.w > MAX_DIM || im.h > MAX_DIM) return err(400, 'La imagen es demasiado grande (máximo ' + MAX_DIM + '×' + MAX_DIM + ' píxeles).');
        const sc = await screen(buf, im.mime);
        if (sc.status === 'rejected') { u.avatarAt = Date.now(); return err(400, 'Foto rechazada: ' + sc.reason + '. Elige otra imagen.'); }
        await avatars.put(u.id, im.mime, buf); u.avatar = { kind: 'custom', v: ((u.avatar && u.avatar.v) || 0) + 1, mod: sc.status, at: Date.now() }; u.avatarNote = '';
      } else return err(400, 'Indica una foto.');
      u.avatarAt = Date.now(); accounts.touch(); return { ok: true, status: modOf(u), avatar: await ownAvatarView(u) };
    },
    async report(u, b) {
      const t = other(b.name); if (!t) return err(404, 'No existe ningún jugador con ese nombre.'); if (t.id === u.id) return err(400, 'No puedes denunciarte a ti mismo.');
      const now = Date.now(), mine = doc.data.reports.filter(r => r.by === u.id && now - r.ts < 3600000);
      if (mine.length >= 5) return err(429, 'Has enviado demasiadas denuncias. Inténtalo más tarde.'); if (mine.some(r => r.target === t.id)) return err(400, 'Ya denunciaste a este jugador hace poco.');
      const cats = ['foto', 'nombre', 'estado', 'trampas', 'insultos', 'otro'];
      doc.data.reports.push({ id: ++doc.data.seq, ts: now, by: u.id, byName: u.username, target: t.id, targetName: t.username, cat: cats.includes(b.cat) ? b.cat : 'otro', text: clean(b.text, 200), status: 'open' });
      if (doc.data.reports.length > 500) doc.data.reports.splice(0, doc.data.reports.length - 500); doc.save(); return { ok: true };
    }
  };

  /* ---------- HTTP ---------- */
  const hits = new Map(); setInterval(() => hits.clear(), 60000).unref();
  const handles = p => p === '/api/profile' || p === '/api/avatar' || p === '/api/social' || p.startsWith('/api/social/');
  async function handleHttp(req, res, url, ip) {
    const { send, readJson } = accounts.http;
    if (req.method === 'OPTIONS') { send(req, res, 204, null); return true; }
    const n = (hits.get(ip) || 0) + 1; hits.set(ip, n); if (n > 240) { send(req, res, 429, { error: 'Demasiadas peticiones.' }); return true; }
    try {
      const h = String(req.headers.authorization || ''), me = accounts.fromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
      if (req.method === 'GET' && url.pathname === '/api/avatar') {   // foto personalizada (pública): se sirve con el tipo que se comprobó al subirla
        const u = other(url.searchParams.get('u')), a = u && u.avatar && u.avatar.kind === 'custom' && modOf(u) === 'ok' ? await avatars.get(u.id) : null;   // solo se sirven las aprobadas
        if (!a) { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end(); return true; }
        const etag = '"' + crypto.createHash('sha1').update(a.buf).digest('hex').slice(0, 16) + '"', cc = url.searchParams.get('v') ? 'public, max-age=86400' : 'public, max-age=300';   // con versión (?v=) se puede guardar un día: al cambiar la foto cambia la dirección
        if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cc }); res.end(); return true; }
        res.writeHead(200, { 'Content-Type': a.mime, 'Content-Length': a.buf.length, ETag: etag, 'Cache-Control': cc, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin' }); res.end(a.buf); return true;
      }
      if (req.method === 'GET' && url.pathname === '/api/profile') {
        const u = other(url.searchParams.get('name')); if (!u) { send(req, res, 404, { error: 'No existe ningún jugador con ese nombre.' }); return true; }
        send(req, res, 200, { ok: true, profile: await profileOf(u, me) }); return true;
      }
      if (!me) { send(req, res, 401, { error: 'Inicia sesión con una cuenta online.' }); return true; }
      let out;
      if (req.method === 'GET' && url.pathname === '/api/social') {
        const byId = ids => ids.map(id => accounts.findById(id)).filter(Boolean);
        out = { ok: true, friends: byId(me.friends).map(u => Object.assign(brief(u), { online: presence(u.id) })).sort((a, b) => (b.online !== 'off') - (a.online !== 'off') || a.username.localeCompare(b.username)),
          incoming: byId(me.reqIn).map(brief), outgoing: byId(me.reqOut).map(brief), blocked: byId(me.blocked).map(brief), limit: MAX_FRIENDS };
      } else if (req.method === 'POST') {
        const op = { '/api/social/request': social.request, '/api/social/accept': social.accept, '/api/social/decline': social.decline, '/api/social/cancel': social.cancel, '/api/social/remove': social.remove, '/api/social/block': social.block,
          '/api/social/unblock': social.unblock, '/api/social/status': social.status, '/api/social/avatar': social.avatar, '/api/social/report': social.report }[url.pathname];
        out = op ? await op(me, await readJson(req, url.pathname === '/api/social/avatar' ? 120000 : 4000)) : err(404, 'No encontrado.');
      } else out = err(404, 'No encontrado.');
      send(req, res, out.code || 200, out.error ? { error: out.error } : out);
    } catch (e) { log('Social: ' + e.message); send(req, res, 400, { error: e.message === 'cuerpo demasiado grande' ? 'La imagen es demasiado grande.' : 'Petición no válida.' }); }
    return true;
  }

  /* ---------- Panel: denuncias de perfil, foto y estado, y cuentas verificadas ---------- */
  admin.addRoutes({
    'GET /social/reports': () => ({ reports: doc.data.reports.slice().reverse().slice(0, 200) }),
    'POST /social/reports/close': ({ b, s }) => { const r = doc.data.reports.find(x => x.id === Math.trunc(+b.id)); if (!r) return err(404, 'No existe.'); r.status = 'closed'; doc.save(); admin.audit(s.user, 'denuncia-perfil-cerrar', '#' + r.id); return { ok: true }; },
    'POST /social/avatar-remove': async ({ b, s }) => { const u = accounts.find(String(b.username || '')); if (!u) return err(404, 'No existe esa cuenta.'); await avatars.del(u.id); u.avatar = null; if (b.status !== false) u.status = ''; accounts.touch(); admin.audit(s.user, 'foto-retirar', u.username); return { ok: true }; },
    'GET /social/avatars/pending': async () => ({ mode: MOD, pending: await Promise.all(accounts.allUsers().filter(u => u.avatar && u.avatar.kind === 'custom' && modOf(u) === 'pending').sort((a, b) => (a.avatar.at || 0) - (b.avatar.at || 0)).slice(0, 50).map(async u => { const a = await avatars.get(u.id); return { username: u.username, since: u.avatar.at || 0, preview: a ? 'data:' + a.mime + ';base64,' + a.buf.toString('base64') : '' }; })) }),
    'POST /social/avatars/review': async ({ b, s }) => {
      const u = accounts.find(String(b.username || '')); if (!u || !u.avatar || u.avatar.kind !== 'custom' || modOf(u) !== 'pending') return err(404, 'Esa foto ya no está pendiente.');
      if (b.approve === true) { u.avatar.mod = 'ok'; accounts.touch(); admin.audit(s.user, 'foto-aprobar', u.username); return { ok: true }; }
      await avatars.del(u.id); u.avatar = null; u.avatarNote = 'Tu foto fue rechazada' + (b.reason ? ': ' + clean(b.reason, 80) : '') + '.'; accounts.touch(); admin.audit(s.user, 'foto-rechazar', u.username + (b.reason ? ' · ' + clean(b.reason, 80) : '')); return { ok: true };
    },
    'POST /verify': ({ b, s }) => { const u = accounts.find(String(b.username || '')); if (!u) return err(404, 'No existe esa cuenta.'); u.verified = b.verified !== false; accounts.touch(); admin.audit(s.user, u.verified ? 'verificar' : 'quitar-verificado', u.username); return { ok: true, username: u.username, verified: u.verified }; }
  });
  return { handles, handleHttp, profileOf, removeAvatar: u => avatars.del(u.id) };
}

module.exports = { createSocial, sniffImage };
