'use strict';
/* Pixel Play Rusher · administración del servidor (dueño de la web).
   - Cuenta de administrador con contraseña guardada como hash scrypt (nunca en claro)
   - Sesiones con token, bloqueo por intentos fallidos y registro de auditoría
   - Baneos (por nombre o por IP «anonimizada»), silencios, avisos y expulsiones
   - Reportes de jugadores, influencers verificados, filtro de chat y modo lento
   - Historial de partidas con análisis de comportamiento y estadísticas generales
   - Herramientas de mantenimiento: avisos globales, modo mantenimiento, apagado programado, copias de seguridad
   Toda la lógica de juego sigue en server.js; aquí solo se definen las reglas y la API (/api/admin/*, /admin-ws). */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
const hex = n => crypto.randomBytes(n).toString('hex');
const clampN = (v, a, b, d) => { v = +v; return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
const cleanStr = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const MIN_PASS = 12;

/* Normaliza un nombre para compararlo (sin tildes, mayúsculas ni símbolos, y con las sustituciones típicas 0→o, 1→i, 3→e…) */
function nameKey(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/0/g, 'o').replace(/[1|!]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
}

class Store {
  constructor(file, defaults, log) {
    this.file = file; this.log = log; this.timer = null; this.name = path.basename(file);
    let data = Store.db ? Store.db.get(this.name) : null;                       // con PostgreSQL, el documento viene de la base de datos
    if (!data) try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* primera ejecución (o primer arranque con PostgreSQL: se importa el archivo) */ }
    this.data = data && typeof data === 'object' ? Object.assign(JSON.parse(JSON.stringify(defaults)), data) : JSON.parse(JSON.stringify(defaults));
  }
  reload() { if (Store.db) return; try { const d = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (d && typeof d === 'object') Object.assign(this.data, d); } catch (e) { /* sin cambios */ } }
  save() { if (!this.timer) { this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 1500); if (this.timer.unref) this.timer.unref(); } }
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (Store.db) { Store.db.put(this.name, this.data); return; }
    try { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 }); fs.renameSync(tmp, this.file); }
    catch (e) { this.log('No se pudo guardar ' + path.basename(this.file) + ': ' + e.message); }
  }
}

Store.db = null;   // lo asigna server.js cuando hay PostgreSQL

function createAdmin(opts) {
  const { dataDir, log, S, rt, env = process.env } = opts;
  fs.mkdirSync(dataDir, { recursive: true });
  const F = n => path.join(dataDir, n);
  const now = () => Date.now();
  const ADMIN_USER = cleanStr(env.ADMIN_USER || 'Viexbox', 14) || 'Viexbox';
  const ADMIN_KEY = nameKey(ADMIN_USER);
  const ALLOWED_IPS = String(env.ADMIN_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  const SESSION_MS = 8 * 3600 * 1000;

  /* ---------- Almacenes ---------- */
  const secret = new Store(F('secret.json'), { key: hex(32) }, log); secret.flush();
  const cred = new Store(F('admin.json'), { user: ADMIN_USER, email: '', mustChange: false, salt: '', hash: '', createdAt: 0, changedAt: 0 }, log);
  const DEFAULT_PASS = 'Viexbox-2026';       // contraseña inicial: solo sirve para elegir la definitiva en el primer acceso
  const normEmail = e => String(e || '').trim().toLowerCase();
  const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
  const envMail = normEmail(env.ADMIN_EMAIL);
  if (validEmail(envMail) && cred.data.email !== envMail) { cred.data.email = envMail; cred.flush(); } // ADMIN_EMAIL manda sobre lo guardado
  const maskEmail = e => (e ? e.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2') : '');
  const bansS = new Store(F('bans.json'), { seq: 0, list: [] }, log);
  const reportsS = new Store(F('reports.json'), { seq: 0, list: [] }, log);
  const infS = new Store(F('influencers.json'), { seq: 0, list: [] }, log);
  const histS = new Store(F('history.json'), { seq: 0, list: [] }, log);
  const auditS = new Store(F('audit.json'), { list: [] }, log);
  const statsS = new Store(F('stats.json'), { since: now(), matches: 0, kills: 0, shots: 0, hits: 0, joins: 0, messages: 0, blocked: 0, reports: 0, bans: 0, kicks: 0, peak: 0, perMap: {}, perClass: {}, seen: {} }, log);
  const setS = new Store(F('settings.json'), { slowMs: 700, chatLocked: false, filterMode: 'mask', words: [], maintenance: { on: false, message: 'Servidor en mantenimiento. Vuelve en unos minutos.' }, mutes: {}, maxPerRoom: 0 }, log);
  const stores = [secret, cred, bansS, reportsS, infS, histS, auditS, statsS, setS];
  const S_ = setS.data, ST = statsS.data;
  const ipKey = ip => crypto.createHmac('sha256', secret.data.key).update(String(ip || '')).digest('hex').slice(0, 16);

  /* ---------- Credenciales del administrador ---------- */
  let credentialsNotice = '';
  async function setPassword(pw) {
    const salt = hex(16); const h = (await scrypt(pw, salt)).toString('hex');
    cred.data.user = ADMIN_USER; cred.data.salt = salt; cred.data.hash = h; cred.data.changedAt = now(); cred.data.mustChange = false; if (!cred.data.createdAt) cred.data.createdAt = now();
    cred.flush();
  }
  const ready = (async () => {
    if (cred.data.hash && cred.data.user === ADMIN_USER) return;
    let pw = String(env.ADMIN_PASSWORD || ''), initial = false;
    if (pw.length < MIN_PASS) { if (pw) log('ADMIN_PASSWORD es demasiado corta (mínimo ' + MIN_PASS + ' caracteres): se usará la contraseña inicial.'); pw = DEFAULT_PASS; initial = true; }
    await setPassword(pw);
    if (initial) { cred.data.mustChange = true; cred.flush(); }
    credentialsNotice = initial
      ? '\n╔══════════════════════════════════════════════════════════════╗\n║  CUENTA DE ADMINISTRADOR CREADA                               ║\n║  Usuario:             ' + ADMIN_USER.padEnd(39) + '║\n║  Contraseña inicial:  ' + DEFAULT_PASS.padEnd(39) + '║\n║  Al iniciar sesión (en el juego o en /admin) te pedirá        ║\n║  cambiarla. Hazlo antes de abrir el servidor al público.      ║\n╚══════════════════════════════════════════════════════════════╝\n'
      : 'Cuenta de administrador «' + ADMIN_USER + '» creada con la contraseña de ADMIN_PASSWORD.';
  })();

  /* ---------- Sesiones y auditoría ---------- */
  const sessions = new Map();           // token -> { user, exp, ip }
  const fails = new Map();              // ip -> { n, until }
  const validToken = t => { const s = sessions.get(t); if (!s) return null; if (s.exp < now()) { sessions.delete(t); return null; } return s; };
  const fullToken = t => { const s = validToken(t); return s && !s.setup ? s : null; }; // la sesión de contraseña inicial no da acceso de administrador
  function audit(by, action, detail) {
    auditS.data.list.push({ ts: now(), by, action, detail: cleanStr(typeof detail === 'string' ? detail : JSON.stringify(detail || ''), 300) });
    if (auditS.data.list.length > 1000) auditS.data.list.splice(0, auditS.data.list.length - 1000);
    auditS.save();
  }
  let credMtime = 0;
  function refreshCred() { try { const m = fs.statSync(F('admin.json')).mtimeMs; if (credMtime && m !== credMtime) cred.reload(); credMtime = m; } catch (e) { /* nada */ } }
  async function login(user, password, ip) {
    await ready; refreshCred();
    const f = fails.get(ip) || { n: 0, until: 0 };
    if (f.until > now()) return { ok: false, code: 429, error: 'Demasiados intentos. Espera ' + Math.ceil((f.until - now()) / 1000) + ' s.' };
    let good = false;
    try {
      const h = await scrypt(String(password || ''), cred.data.salt), stored = Buffer.from(cred.data.hash, 'hex');
      const who = String(user || '').trim().toLowerCase();
      good = h.length === stored.length && crypto.timingSafeEqual(h, stored) && (who === cred.data.user.toLowerCase() || (!!cred.data.email && who === cred.data.email));
    } catch (e) { good = false; }
    if (!good) {
      f.n++; if (f.n >= 5) { f.n = 0; f.until = now() + 5 * 60000; } fails.set(ip, f);
      audit('?', 'login-fallido', ipKey(ip)); return { ok: false, code: 401, error: 'Usuario o contraseña incorrectos.' };
    }
    fails.delete(ip);
    const setup = !!cred.data.mustChange, token = hex(32), exp = now() + (setup ? 15 * 60000 : SESSION_MS); sessions.set(token, { user: cred.data.user, exp, ip, setup });
    audit(cred.data.user, setup ? 'login-contraseña-inicial' : 'login', ipKey(ip));
    return { ok: true, token, expiresAt: exp, user: cred.data.user, mustChange: setup };
  }

  /* ---------- Contraseña olvidada: enlace de un solo uso al correo del administrador ---------- */
  const RESET_TTL = Math.max(1000, +env.ADMIN_RESET_TTL_MS || 30 * 60000);
  const PUBLIC_URL = String(env.PUBLIC_URL || '').replace(/\/+$/, '');
  const sha256 = x => crypto.createHash('sha256').update(String(x)).digest();
  const okPassword = pw => typeof pw === 'string' && pw.length >= MIN_PASS && pw.length <= 200 && /\p{L}/u.test(pw) && /\p{N}/u.test(pw);
  const PASS_RULE = 'La contraseña necesita al menos ' + MIN_PASS + ' caracteres con letras y números.';
  const FORGOT_GLOBAL = +env.ADMIN_FORGOT_GLOBAL || 8; // solicitudes por hora en total (protege el buzón del dueño)
  let resetTok = null;                          // { hash, exp }: solo hay un enlace válido a la vez
  const forgotHits = new Map(), resetFails = new Map(); let forgotAll = [];
  const smtpOn = () => !!env.SMTP_HOST;
  async function sendMail(to, subject, text) {
    if (!smtpOn()) return false;
    let nm; try { nm = require('nodemailer'); } catch (e) { log('Falta el módulo nodemailer: ejecuta npm install.'); return false; }
    const secure = env.SMTP_SECURE === '1' || +env.SMTP_PORT === 465;
    const tr = nm.createTransport({ host: env.SMTP_HOST, port: +env.SMTP_PORT || (secure ? 465 : 587), secure, ignoreTLS: env.SMTP_INSECURE === '1', auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' } : undefined, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    await tr.sendMail({ from: env.SMTP_FROM || env.SMTP_USER || 'Pixel Play Rusher <no-reply@localhost>', to, subject, text });
    return true;
  }
  async function deliverReset(token) {
    const link = PUBLIC_URL ? PUBLIC_URL + '/admin#reset=' + token : '';
    const mins = Math.round(RESET_TTL / 60000);
    const text = 'Has pedido restablecer la contraseña del administrador de Pixel Play Rusher.\n\n' + (link ? 'Abre este enlace (válido ' + mins + ' minutos y de un solo uso):\n' + link + '\n\n' : '') + 'Código de restablecimiento (pégalo en «Ya tengo un código» de la pantalla de acceso del panel):\n' + token + '\n\nSi no has sido tú, ignora este mensaje: tu contraseña no cambia.';
    let sent = false;
    try { sent = await sendMail(cred.data.email, 'Restablecer la contraseña del administrador', text); } catch (e) { log('No se pudo enviar el correo de restablecimiento: ' + e.message); }
    if (!sent) console.log('\n[RESTABLECER CONTRASEÑA] ' + (smtpOn() ? 'El correo no se pudo enviar. ' : 'No hay correo SMTP configurado. ') + 'Válido ' + mins + ' min.\n' + (link ? '  Enlace: ' + link + '\n' : '') + '  Código: ' + token + '\n'); // solo a la consola (no al registro del panel)
  }
  async function forgot(email, ip) {
    const t = now(), hits = (forgotHits.get(ip) || []).filter(x => t - x < 3600000); forgotAll = forgotAll.filter(x => t - x < 3600000);
    if (hits.length >= 3 || forgotAll.length >= FORGOT_GLOBAL) return { code: 429, error: 'Demasiadas solicitudes. Inténtalo más tarde.' };
    hits.push(t); forgotHits.set(ip, hits); forgotAll.push(t); refreshCred();
    if (cred.data.email && normEmail(email) === cred.data.email) {
      const token = hex(32); resetTok = { hash: sha256(token), exp: t + RESET_TTL }; audit('?', 'restablecer-solicitado', ipKey(ip));
      deliverReset(token).catch(() => {}); // sin esperar: la respuesta tarda lo mismo con o sin coincidencia
    } else audit('?', 'restablecer-correo-desconocido', ipKey(ip));
    return { ok: true, message: 'Si el correo coincide con el del administrador, recibirás un enlace para restablecer la contraseña (válido ' + Math.round(RESET_TTL / 60000) + ' minutos).' + (smtpOn() ? '' : ' Este servidor no tiene correo SMTP configurado: el enlace aparecerá en su consola.') };
  }
  async function resetPassword(token, password, ip) {
    const t = now(), f = (resetFails.get(ip) || []).filter(x => t - x < 900000);
    if (f.length >= 8) return { code: 429, error: 'Demasiados intentos. Espera unos minutos.' };
    const given = sha256(String(token || '').trim());
    if (!resetTok || resetTok.exp < t || !crypto.timingSafeEqual(given, resetTok.hash)) { f.push(t); resetFails.set(ip, f); audit('?', 'restablecer-codigo-invalido', ipKey(ip)); return { code: 400, error: 'El enlace no es válido o ha caducado. Pide uno nuevo.' }; }
    if (!okPassword(password)) return { code: 400, error: PASS_RULE }; // no gasta el enlace
    await setPassword(password); resetTok = null; sessions.clear(); fails.clear(); resetFails.delete(ip);
    audit('admin', 'contraseña-restablecida', ipKey(ip));
    sendMail(cred.data.email, 'Tu contraseña de administrador ha cambiado', 'La contraseña del administrador de Pixel Play Rusher se acaba de restablecer. Si no has sido tú, entra al servidor y ejecuta «node scripts/admin-password.js» para recuperar el control.').catch(() => {});
    return { ok: true };
  }

  /* ---------- Influencers ---------- */
  const keyHash = k => crypto.createHash('sha256').update(String(k || '').trim().toUpperCase()).digest('hex');
  const inf = {
    byKey(k) { if (!k) return null; const h = keyHash(k); return infS.data.list.find(i => i.active && i.keyHash === h) || null; },
    add(name, note) {
      name = cleanStr(name, 14).replace(/[^\p{L}\p{N}_-]/gu, '');
      if (name.length < 3) return { error: 'El nombre debe tener entre 3 y 14 caracteres (letras, números, _ o -).' };
      const k = nameKey(name); if (!k) return { error: 'Nombre no válido.' };
      if (k === ADMIN_KEY || k.includes(ADMIN_KEY)) return { error: 'Ese nombre está reservado para el administrador.' };
      if (infS.data.list.some(i => i.nameKey === k)) return { error: 'Ya existe un influencer con ese nombre.' };
      const key = 'INF-' + [1, 2, 3].map(() => hex(2).toUpperCase()).join('-');
      const rec = { id: ++infS.data.seq, name, nameKey: k, keyHash: keyHash(key), active: true, note: cleanStr(note, 80), createdAt: now() };
      infS.data.list.push(rec); infS.save(); return { rec, key };
    },
    regen(id) { const r = infS.data.list.find(i => i.id === id); if (!r) return null; const key = 'INF-' + [1, 2, 3].map(() => hex(2).toUpperCase()).join('-'); r.keyHash = keyHash(key); r.active = true; infS.save(); return { rec: r, key }; },
    revoke(id) { const r = infS.data.list.find(i => i.id === id); if (!r) return null; r.active = false; infS.save(); return r; },
    pub: r => ({ id: r.id, name: r.name, active: r.active, note: r.note, createdAt: r.createdAt })
  };

  /* ---------- Baneos, silencios ---------- */
  const bans = {
    check({ nameKey: nk, ipKey: ik }) {
      const t = now();
      for (const b of bansS.data.list) {
        if (!b.active) continue;
        if (b.until && b.until < t) { b.active = false; bansS.save(); continue; }
        if ((b.type === 'name' && nk && b.value === nk) || (b.type === 'ip' && ik && b.value === ik)) return b;
      }
      return null;
    },
    add({ type, value, display, minutes, reason, by }) {
      const rec = { id: ++bansS.data.seq, type, value, display: cleanStr(display, 30), reason: cleanStr(reason, 120) || 'Sin motivo', by, at: now(), until: minutes > 0 ? now() + minutes * 60000 : null, active: true };
      bansS.data.list.push(rec); ST.bans++; bansS.save(); statsS.save(); return rec;
    },
    remove(id) { const b = bansS.data.list.find(x => x.id === id); if (!b) return null; b.active = false; bansS.save(); return b; },
    message: b => 'Estás baneado' + (b.until ? ' hasta ' + new Date(b.until).toLocaleString('es-ES') : ' de forma permanente') + '. Motivo: ' + b.reason
  };
  function muteInfo(keys) {
    const t = now();
    for (const k of keys) { const m = S_.mutes[k]; if (!m) continue; if (m.until < t) { delete S_.mutes[k]; setS.save(); continue; } return m; }
    return null;
  }

  /* ---------- Identidad al entrar (juego y lobby) ---------- */
  function resolveIdentity({ name, adm, inf: infKey, ip }) {
    const ik = ipKey(ip); let role = 0, finalName = name;
    if (adm && fullToken(adm)) { role = 'admin'; finalName = cred.data.user; }
    else if (infKey) { const rec = inf.byKey(infKey); if (rec) { role = 'inf'; finalName = rec.name; } }
    const nk = nameKey(finalName);
    if (!role) {
      const reserved = nk && (nk.includes(ADMIN_KEY) || infS.data.list.some(i => i.active && i.nameKey === nk));
      if (reserved) return { ok: false, error: 'Ese nombre está reservado. Elige otro.' };
    }
    if (role !== 'admin') {
      const b = bans.check({ nameKey: nk, ipKey: ik }); if (b) return { ok: false, error: bans.message(b), banned: true };
      if (S_.maintenance.on) return { ok: false, error: S_.maintenance.message, maintenance: true };
    }
    if (nk) { ST.seen[nk] = now(); }
    return { ok: true, name: finalName, role, nameKey: nk, ipKey: ik };
  }

  /* ---------- Chat: filtro, silencios, modo lento ---------- */
  const chatRing = [];                  // últimos mensajes (para el panel)
  const filterRe = () => { const w = S_.words.filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); return w.length ? new RegExp('(' + w.join('|') + ')', 'giu') : null; };
  function checkChat(sender, text, t) {
    // sender: { role, nameKey, ipKey, chatT, lastText, lastTextT }
    if (sender.role !== 'admin') {
      const m = muteInfo([sender.nameKey, sender.ipKey]);
      if (m) return { ok: false, notice: 'Estás silenciado' + (m.reason ? ' (' + m.reason + ')' : '') + ' hasta las ' + new Date(m.until).toLocaleTimeString('es-ES') + '.' };
      if (S_.chatLocked && sender.role !== 'inf') return { ok: false, notice: 'El chat está desactivado temporalmente por la moderación.' };
      if (t - (sender.chatT || 0) < S_.slowMs) return { ok: false, notice: null };
      if (sender.lastText === text && t - (sender.lastTextT || 0) < 10000) return { ok: false, notice: 'No repitas el mismo mensaje.' };
    }
    let out = text, flagged = false; const re = filterRe();
    if (re && sender.role !== 'admin') {
      re.lastIndex = 0;
      if (re.test(text)) {
        flagged = true; re.lastIndex = 0;
        if (S_.filterMode === 'block') { ST.blocked++; statsS.save(); return { ok: false, notice: 'Tu mensaje contiene palabras no permitidas.', flagged: true, text }; }
        out = text.replace(re, m => '*'.repeat(m.length));
      }
    }
    sender.chatT = t; sender.lastText = text; sender.lastTextT = t;
    return { ok: true, text: out, flagged };
  }

  /* ---------- Estadísticas ---------- */
  const series = [];
  function sample() {
    const p = rt.playerCount(); if (p > ST.peak) { ST.peak = p; statsS.save(); }
    series.push({ t: now(), players: p, lobby: rt.lobbyCount(), rooms: rt.rooms().length });
    if (series.length > 720) series.shift();
  }
  const sampler = setInterval(sample, 30000); if (sampler.unref) sampler.unref(); sample();
  const cutSeen = () => { const t = now(); let n = 0; for (const k of Object.keys(ST.seen)) { if (t - ST.seen[k] > 30 * 86400000) delete ST.seen[k]; else n++; } if (n > 5000) { const ks = Object.keys(ST.seen).sort((a, b) => ST.seen[a] - ST.seen[b]); for (const k of ks.slice(0, n - 5000)) delete ST.seen[k]; } };
  function count(kind, key) { if (kind === 'join') { ST.joins++; } else if (kind === 'class') ST.perClass[key] = (ST.perClass[key] || 0) + 1; else if (kind === 'map') ST.perMap[key] = (ST.perMap[key] || 0) + 1; else if (kind === 'msg') ST.messages++; statsS.save(); }

  /* ---------- Historial y análisis de comportamiento ---------- */
  function recordMatch(row) {
    row.id = ++histS.data.seq; row.ts = row.ts || now();
    histS.data.list.push(row); if (histS.data.list.length > 5000) histS.data.list.splice(0, histS.data.list.length - 5000);
    ST.matches++; ST.kills += row.k || 0; ST.shots += row.shots || 0; ST.hits += row.hits || 0; histS.save(); statsS.save();
  }
  function analyze(list) {
    const by = new Map();
    for (const r of list) {
      const a = by.get(r.nameKey) || { name: r.name, nameKey: r.nameKey, matches: 0, k: 0, d: 0, hs: 0, shots: 0, hits: 0, secs: 0, fixes: 0, rlv: 0, last: 0, maxKpm: 0, ipKeys: new Set() };
      a.matches++; a.k += r.k; a.d += r.d; a.hs += r.hs; a.shots += r.shots; a.hits += r.hits; a.secs += r.dur; a.fixes += r.fixes || 0; a.rlv += r.rlv || 0; a.last = Math.max(a.last, r.ts); a.maxKpm = Math.max(a.maxKpm, r.dur > 30 ? r.k / (r.dur / 60) : 0); if (r.ipKey) a.ipKeys.add(r.ipKey); a.name = r.name;
      by.set(r.nameKey, a);
    }
    return [...by.values()].map(a => {
      const acc = a.shots ? a.hits / a.shots : 0, hsr = a.k ? a.hs / a.k : 0, kd = a.d ? a.k / a.d : a.k, flags = [];
      if (a.k >= 12 && hsr > 0.65) flags.push('Muchos disparos a la cabeza (' + Math.round(hsr * 100) + ' %)');
      if (a.shots >= 100 && acc > 0.7) flags.push('Precisión muy alta (' + Math.round(acc * 100) + ' %)');
      if (a.k >= 30 && kd > 12) flags.push('K/D extremo (' + kd.toFixed(1) + ')');
      if (a.fixes >= 5) flags.push('Movimientos imposibles corregidos (' + a.fixes + ')');
      if (a.rlv >= 20) flags.push('Cadencia de disparo imposible (' + a.rlv + ')');
      if (a.maxKpm > 14) flags.push('Ritmo de bajas anormal (' + a.maxKpm.toFixed(1) + '/min)');
      if (a.ipKeys.size >= 4) flags.push('Cambia mucho de IP (' + a.ipKeys.size + ')');
      const score = flags.length * 10 + Math.min(20, a.fixes) + Math.min(20, a.rlv / 5);
      return { name: a.name, nameKey: a.nameKey, matches: a.matches, kills: a.k, deaths: a.d, kd: +kd.toFixed(2), hsRate: +hsr.toFixed(2), accuracy: +acc.toFixed(2), minutes: Math.round(a.secs / 60), fixes: a.fixes, rlv: a.rlv, last: a.last, flags, score };
    }).sort((x, y) => y.score - x.score || y.kills - x.kills);
  }

  /* ---------- Reportes ---------- */
  const reportLimits = new Map();       // clave del que reporta -> [timestamps]
  function makeReport(reporter, m) {
    const t = now(), rk = reporter.ipKey + '|' + reporter.nameKey, hist = (reportLimits.get(rk) || []).filter(x => t - x < 3600000);
    if (hist.length >= 5) return { ok: false, error: 'Has enviado demasiados reportes. Inténtalo más tarde.' };
    const target = rt.findPlayer(m.id, m.name); if (!target) return { ok: false, error: 'El jugador ya no está en la sala.' };
    if (target === reporter.player) return { ok: false, error: 'No puedes reportarte a ti mismo.' };
    const cats = ['trampas', 'insultos', 'spam', 'nombre', 'otro']; const cat = cats.includes(m.cat) ? m.cat : 'otro';
    if (reportsS.data.list.some(r => r.reporterKey === rk && r.targetKey === target.nameKey && t - r.ts < 600000)) return { ok: false, error: 'Ya has reportado a este jugador hace poco.' };
    const rep = {
      id: ++reportsS.data.seq, ts: t, status: 'open', reporter: reporter.name, reporterKey: rk, target: target.name, targetKey: target.nameKey, targetIp: target.ipKey, cat, text: cleanStr(m.text, 200),
      room: target.room ? target.room.id : null, map: target.room ? target.room.map : null, chat: rt.roomChat(target.room ? target.room.id : 0).slice(-12),
      stats: { k: target.kills, d: target.deaths, hs: target.hs, shots: target.shots, hits: target.hits, fixes: target.fixes, rlv: target.rlv }, note: '', by: null
    };
    reportsS.data.list.push(rep); if (reportsS.data.list.length > 2000) reportsS.data.list.splice(0, reportsS.data.list.length - 2000);
    hist.push(t); reportLimits.set(rk, hist); ST.reports++; reportsS.save(); statsS.save();
    push({ t: 'report', report: pubReport(rep) });
    return { ok: true };
  }
  const pubReport = r => ({ id: r.id, ts: r.ts, status: r.status, reporter: r.reporter, target: r.target, cat: r.cat, text: r.text, room: r.room, map: r.map, chat: r.chat, stats: r.stats, note: r.note, by: r.by });
  function problemPlayers() {
    const by = new Map();
    for (const r of reportsS.data.list) {
      const a = by.get(r.targetKey) || { name: r.target, nameKey: r.targetKey, reports: 0, open: 0, reporters: new Set(), cats: {}, last: 0 };
      a.reports++; if (r.status === 'open') a.open++; a.reporters.add(r.reporterKey); a.cats[r.cat] = (a.cats[r.cat] || 0) + 1; a.last = Math.max(a.last, r.ts); a.name = r.target; by.set(r.targetKey, a);
    }
    const an = new Map(analyze(histS.data.list.slice(-1500)).map(x => [x.nameKey, x]));
    return [...by.values()].map(a => { const b = an.get(a.nameKey); return { name: a.name, nameKey: a.nameKey, reports: a.reports, open: a.open, reporters: a.reporters.size, cats: a.cats, last: a.last, flags: b ? b.flags : [], score: a.reporters.size * 3 + a.open * 2 + (b ? b.score : 0) }; }).sort((x, y) => y.score - x.score);
  }

  /* ---------- Canal en tiempo real del panel (/admin-ws) ---------- */
  const adminWss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const feeds = new Set();
  function push(obj) { const s = JSON.stringify(obj); for (const w of feeds) if (w.readyState === 1) w.send(s); }
  function onChat(evt) {
    chatRing.push(evt); if (chatRing.length > 500) chatRing.shift(); count('msg'); push({ t: 'chat', msg: evt });
  }
  const logRing = [];
  function onLog(line) { logRing.push(line); if (logRing.length > 500) logRing.shift(); push({ t: 'log', line }); }
  function handleUpgrade(req, socket, head, ip) {
    const reject = c => { socket.write('HTTP/1.1 ' + c + '\r\nConnection: close\r\n\r\n'); socket.destroy(); };
    if (ALLOWED_IPS.length && !ALLOWED_IPS.includes(ip)) return reject('403 Forbidden');
    adminWss.handleUpgrade(req, socket, head, ws => {
      let authed = false; const t = setTimeout(() => { if (!authed) ws.close(1008, 'auth'); }, 5000);
      ws.on('message', d => {
        let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
        if (m && m.t === 'auth' && fullToken(m.token)) { authed = true; clearTimeout(t); feeds.add(ws); ws.send(JSON.stringify({ t: 'ready', chat: chatRing.slice(-200), logs: logRing.slice(-100), user: cred.data.user })); }
        else if (!authed) ws.close(1008, 'auth');
      });
      ws.on('close', () => { clearTimeout(t); feeds.delete(ws); }); ws.on('error', () => {});
    });
  }
  // los tokens caducados cierran su canal
  const reaper = setInterval(() => { for (const w of feeds) { /* el panel reconecta con un token válido */ } for (const [k, s] of sessions) if (s.exp < now()) sessions.delete(k); cutSeen(); }, 60000); if (reaper.unref) reaper.unref();

  /* ---------- Mantenimiento ---------- */
  let shutdownPlan = null;
  function scheduleShutdown(seconds, restart, by) {
    cancelShutdown(); const at = now() + seconds * 1000; shutdownPlan = { at, restart: !!restart, by, timers: [] };
    const say = m => rt.broadcast({ t: 'notice', kind: 'maint', m });
    for (const mark of [3600, 1800, 600, 300, 120, 60, 30, 10, 5]) if (seconds > mark) shutdownPlan.timers.push(setTimeout(() => say('El servidor se ' + (restart ? 'reiniciará' : 'apagará') + ' en ' + (mark >= 60 ? Math.round(mark / 60) + ' min' : mark + ' s') + '. Termina tu partida.'), (seconds - mark) * 1000));
    shutdownPlan.timers.push(setTimeout(() => { say('Apagando el servidor…'); setTimeout(() => rt.exit(restart ? 0 : 0), 800); }, seconds * 1000));
    for (const x of shutdownPlan.timers) if (x.unref) x.unref();
    say('El servidor se ' + (restart ? 'reiniciará' : 'apagará') + ' en ' + (seconds >= 60 ? Math.round(seconds / 60) + ' min' : seconds + ' s') + '.');
    return shutdownPlan;
  }
  function cancelShutdown() { if (!shutdownPlan) return false; for (const t of shutdownPlan.timers) clearTimeout(t); shutdownPlan = null; return true; }
  function dirSize(d) { let n = 0; try { for (const f of fs.readdirSync(d)) { try { n += fs.statSync(path.join(d, f)).size; } catch (e) { /* nada */ } } } catch (e) { /* nada */ } return n; }

  /* ---------- API HTTP ---------- */
  const playerPub = p => ({ id: p.id, name: p.name, role: p.role || 0, room: p.room ? p.room.id : null, map: p.room ? p.room.map : null, k: p.kills, d: p.deaths, hs: p.hs, shots: p.shots, hits: p.hits, ping: Math.round(p.ping), ip: p.ipKey, since: p.joinedAt, muted: !!muteInfo([p.nameKey, p.ipKey]) });
  function overview() {
    const online = rt.playerCount(); if (online > ST.peak) { ST.peak = online; statsS.save(); }
    if (!series.length || now() - series[series.length - 1].t > 10000) sample();
    const mem = process.memoryUsage(), t = now(), day = h => Object.values(ST.seen).filter(x => t - x < h * 3600000).length;
    const lbAll = rt.lbAll(), top = [...lbAll].sort((a, b) => b.p - a.p).slice(0, 5);
    return {
      now: t, uptime: Math.round(process.uptime()), online: rt.playerCount(), lobby: rt.lobbyCount(), rooms: rt.rooms().map(r => ({ id: r.id, map: r.map, players: r.players.size, phase: r.phase, tl: Math.round(r.tl) })),
      peak: ST.peak, totals: { matches: ST.matches, kills: ST.kills, shots: ST.shots, hits: ST.hits, joins: ST.joins, messages: ST.messages, blocked: ST.blocked, reports: ST.reports, bans: ST.bans, kicks: ST.kicks, since: ST.since },
      accuracy: ST.shots ? +(ST.hits / ST.shots).toFixed(3) : 0, uniques24h: day(24), uniques7d: day(168), perMap: ST.perMap, perClass: ST.perClass, maps: S.MAPS.map(m => m.name), classes: S.WEAPONS.map(w => w.name),
      openReports: reportsS.data.list.filter(r => r.status === 'open').length, activeBans: bansS.data.list.filter(b => b.active && (!b.until || b.until > t)).length,
      series, top, mem: { rss: mem.rss, heap: mem.heapUsed }, load: os.loadavg(), maintenance: S_.maintenance, shutdown: shutdownPlan ? { at: shutdownPlan.at, restart: shutdownPlan.restart } : null
    };
  }
  function serverInfo() {
    return { node: process.version, platform: os.platform() + ' ' + os.release(), cpus: os.cpus().length, load: os.loadavg(), totalMem: os.totalmem(), freeMem: os.freemem(), rss: process.memoryUsage().rss, uptime: Math.round(process.uptime()), pid: process.pid, dataDir, dataBytes: dirSize(dataDir), connections: rt.connectionCount(), settings: S_, shutdown: shutdownPlan ? { at: shutdownPlan.at, restart: shutdownPlan.restart } : null, allowedIps: ALLOWED_IPS };
  }

  const readBody = req => new Promise((res, rej) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > 20000) { rej(new Error('cuerpo demasiado grande')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { res(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { rej(new Error('JSON no válido')); } });
    req.on('error', rej);
  });
  const send = (res, code, obj, extra) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' }, extra || {})); res.end(JSON.stringify(obj)); };
  const apiHits = new Map(); const apiTimer = setInterval(() => apiHits.clear(), 60000); if (apiTimer.unref) apiTimer.unref();

  const routes = {
    'GET /me': ({ s }) => ({ user: s.user, exp: s.exp, email: maskEmail(cred.data.email), smtp: smtpOn(), mustChange: !!s.setup }),
    'GET /overview': () => overview(),
    'GET /players': () => ({ players: rt.players().map(playerPub), lobby: rt.lobbyClients().map(w => ({ name: w.lobbyName, role: w.role || 0, ip: w.ipKey })) }),
    'POST /player/action': ({ b, s }) => {
      const p = rt.findPlayer(b.id, b.name), act = String(b.action || ''), reason = cleanStr(b.reason, 120), minutes = clampN(b.minutes, 0, 60 * 24 * 365, 0);
      const lw = !p && b.name ? rt.lobbyClients().find(w => nameKey(w.lobbyName) === nameKey(b.name)) : null;
      const tgt = p ? { name: p.name, nameKey: p.nameKey, ipKey: p.ipKey, role: p.role } : lw ? { name: lw.lobbyName, nameKey: nameKey(lw.lobbyName), ipKey: lw.ipKey, role: lw.role } : (b.name ? { name: cleanStr(b.name, 14), nameKey: nameKey(b.name), ipKey: null, role: 0 } : null);
      if (!tgt || !tgt.nameKey) return { code: 404, error: 'Jugador no encontrado.' };
      if (tgt.role === 'admin') return { code: 400, error: 'No puedes sancionar al administrador.' };
      const target = p || lw;
      if (act === 'kick') { if (!target) return { code: 404, error: 'El jugador no está conectado.' }; rt.kick(target, 'Has sido expulsado por la moderación.' + (reason ? ' Motivo: ' + reason : '')); ST.kicks++; }
      else if (act === 'warn') { if (!target) return { code: 404, error: 'El jugador no está conectado.' }; rt.notify(target, { t: 'notice', kind: 'warn', m: 'Aviso de la moderación: ' + (reason || 'respeta las normas.') }); }
      else if (act === 'mute') { const until = now() + (minutes || 10) * 60000; for (const k of [tgt.nameKey, tgt.ipKey]) if (k) S_.mutes[k] = { until, reason, by: s.user }; setS.save(); if (target) rt.notify(target, { t: 'notice', kind: 'warn', m: 'Has sido silenciado ' + (minutes || 10) + ' min' + (reason ? ': ' + reason : '.') }); }
      else if (act === 'unmute') { for (const k of [tgt.nameKey, tgt.ipKey]) if (k) delete S_.mutes[k]; setS.save(); }
      else if (act === 'ban') {
        const list = [bans.add({ type: 'name', value: tgt.nameKey, display: tgt.name, minutes, reason, by: s.user })];
        if (b.ip !== false && tgt.ipKey) list.push(bans.add({ type: 'ip', value: tgt.ipKey, display: 'IP de ' + tgt.name, minutes, reason, by: s.user }));
        for (const p2 of rt.players()) if (p2.nameKey === tgt.nameKey || (tgt.ipKey && p2.ipKey === tgt.ipKey)) rt.kick(p2, bans.message(list[0]));
        for (const w of rt.lobbyClients()) if (nameKey(w.lobbyName) === tgt.nameKey || (tgt.ipKey && w.ipKey === tgt.ipKey)) rt.kick(w, bans.message(list[0]));
      } else return { code: 400, error: 'Acción desconocida.' };
      audit(s.user, 'jugador-' + act, tgt.name + (minutes ? ' · ' + minutes + ' min' : '') + (reason ? ' · ' + reason : ''));
      return { ok: true };
    },
    'GET /bans': () => ({ bans: bansS.data.list.filter(b => b.active && (!b.until || b.until > now())).reverse(), mutes: Object.entries(S_.mutes).filter(([, m]) => m.until > now()).map(([k, m]) => ({ key: k.slice(0, 12), until: m.until, reason: m.reason, by: m.by })) }),
    'POST /bans/add': ({ b, s }) => {
      const type = b.type === 'ip' ? 'ip' : 'name', value = type === 'ip' ? cleanStr(b.value, 32) : nameKey(b.value);
      if (!value) return { code: 400, error: 'Escribe un nombre.' };
      if (type === 'name' && (value === ADMIN_KEY || value.includes(ADMIN_KEY))) return { code: 400, error: 'No puedes banear al administrador.' };
      const rec = bans.add({ type, value, display: cleanStr(b.value, 30), minutes: clampN(b.minutes, 0, 525600, 0), reason: b.reason, by: s.user });
      for (const p of rt.players()) if ((type === 'name' && p.nameKey === value) || (type === 'ip' && p.ipKey === value)) rt.kick(p, bans.message(rec));
      audit(s.user, 'ban', rec.display + ' · ' + rec.reason); return { ok: true, ban: rec };
    },
    'POST /bans/remove': ({ b, s }) => { const r = bans.remove(+b.id); if (!r) return { code: 404, error: 'Baneo no encontrado.' }; audit(s.user, 'desban', r.display); return { ok: true }; },
    'GET /reports': ({ q }) => ({ reports: reportsS.data.list.filter(r => !q.get('status') || r.status === q.get('status')).slice(-300).reverse().map(pubReport) }),
    'GET /reports/players': () => ({ players: problemPlayers().slice(0, 100) }),
    'POST /reports/update': ({ b, s }) => {
      const r = reportsS.data.list.find(x => x.id === +b.id); if (!r) return { code: 404, error: 'Reporte no encontrado.' };
      if (['open', 'reviewed', 'dismissed', 'actioned'].includes(b.status)) r.status = b.status; if (b.note != null) r.note = cleanStr(b.note, 200); r.by = s.user; reportsS.save();
      audit(s.user, 'reporte-' + r.status, '#' + r.id + ' ' + r.target); return { ok: true, report: pubReport(r) };
    },
    'GET /chat/recent': () => ({ chat: chatRing.slice(-200) }),
    'POST /chat/delete': ({ b, s }) => { const m = chatRing.find(x => x.id === +b.id); if (!m) return { code: 404, error: 'Mensaje no encontrado.' }; m.deleted = true; rt.chatDelete(m); audit(s.user, 'chat-borrar', m.name + ': ' + m.text); push({ t: 'chatdel', id: m.id }); return { ok: true }; },
    'POST /chat/say': ({ b, s }) => { const text = cleanStr(b.text, 120); if (!text) return { code: 400, error: 'Escribe un mensaje.' }; const id = rt.adminSay(cred.data.user, text, b.scope === 'lobby' ? 'lobby' : (b.room ? 'room:' + (+b.room) : 'all')); audit(s.user, 'chat-decir', text); return { ok: true, id }; },
    'GET /history': ({ q }) => { const nk = nameKey(q.get('name')), lim = clampN(q.get('limit'), 1, 500, 100); return { history: histS.data.list.filter(r => !nk || r.nameKey === nk).slice(-lim).reverse() }; },
    'GET /analysis': () => ({ players: analyze(histS.data.list.slice(-3000)).slice(0, 100) }),
    'GET /influencers': () => ({ influencers: infS.data.list.map(inf.pub) }),
    'POST /influencers/add': ({ b, s }) => { const r = inf.add(b.name, b.note); if (r.error) return { code: 400, error: r.error }; audit(s.user, 'influencer-crear', r.rec.name); return { ok: true, influencer: inf.pub(r.rec), key: r.key }; },
    'POST /influencers/regen': ({ b, s }) => { const r = inf.regen(+b.id); if (!r) return { code: 404, error: 'No encontrado.' }; audit(s.user, 'influencer-clave-nueva', r.rec.name); return { ok: true, influencer: inf.pub(r.rec), key: r.key }; },
    'POST /influencers/revoke': ({ b, s }) => { const r = inf.revoke(+b.id); if (!r) return { code: 404, error: 'No encontrado.' }; audit(s.user, 'influencer-revocar', r.name); return { ok: true }; },
    'GET /server': () => serverInfo(),
    'GET /settings': () => ({ settings: S_ }),
    'POST /settings': ({ b, s }) => {
      if (b.slowMs != null) S_.slowMs = clampN(b.slowMs, 0, 30000, 700);
      if (b.chatLocked != null) S_.chatLocked = !!b.chatLocked;
      if (b.filterMode) S_.filterMode = b.filterMode === 'block' ? 'block' : 'mask';
      if (Array.isArray(b.words)) S_.words = [...new Set(b.words.map(w => cleanStr(w, 24).toLowerCase()).filter(w => w.length >= 2))].slice(0, 200);
      if (b.maxPerRoom != null) S_.maxPerRoom = clampN(b.maxPerRoom, 0, 40, 0);
      setS.save(); audit(s.user, 'ajustes', { slowMs: S_.slowMs, chatLocked: S_.chatLocked, filterMode: S_.filterMode, words: S_.words.length, maxPerRoom: S_.maxPerRoom }); return { ok: true, settings: S_ };
    },
    'POST /announce': ({ b, s }) => { const text = cleanStr(b.text, 160); if (!text) return { code: 400, error: 'Escribe el anuncio.' }; rt.broadcast({ t: 'notice', kind: 'announce', m: text }); audit(s.user, 'anuncio', text); return { ok: true }; },
    'POST /maintenance': ({ b, s }) => {
      S_.maintenance.on = !!b.on; if (b.message) S_.maintenance.message = cleanStr(b.message, 140); setS.save();
      if (S_.maintenance.on) {
        const secs = clampN(b.kickIn, 0, 3600, 0);
        rt.broadcast({ t: 'notice', kind: 'maint', m: 'Mantenimiento: ' + S_.maintenance.message + (secs ? ' Se cerrarán las partidas en ' + secs + ' s.' : '') });
        if (secs) { const tm = setTimeout(() => { if (S_.maintenance.on) for (const p of rt.players()) if (p.role !== 'admin') rt.kick(p, S_.maintenance.message); }, secs * 1000); if (tm.unref) tm.unref(); }
        else for (const p of rt.players()) if (p.role !== 'admin' && b.kickNow) rt.kick(p, S_.maintenance.message);
      }
      audit(s.user, S_.maintenance.on ? 'mantenimiento-on' : 'mantenimiento-off', S_.maintenance.message); return { ok: true, maintenance: S_.maintenance };
    },
    'POST /shutdown': ({ b, s }) => { const secs = clampN(b.seconds, 5, 86400, 60); scheduleShutdown(secs, !!b.restart, s.user); audit(s.user, b.restart ? 'reinicio-programado' : 'apagado-programado', secs + ' s'); return { ok: true, at: shutdownPlan.at }; },
    'POST /shutdown/cancel': ({ s }) => { const ok = cancelShutdown(); if (ok) { rt.broadcast({ t: 'notice', kind: 'maint', m: 'Se ha cancelado el apagado del servidor.' }); audit(s.user, 'apagado-cancelado', ''); } return { ok }; },
    'POST /rooms/action': ({ b, s }) => { const r = rt.rooms().find(x => x.id === +b.id); if (!r) return { code: 404, error: 'Sala no encontrada.' }; if (b.action === 'end') rt.endRound(r.id); else if (b.action === 'close') rt.closeRoom(r.id, 'La sala se ha cerrado por mantenimiento.'); else return { code: 400, error: 'Acción desconocida.' }; audit(s.user, 'sala-' + b.action, '#' + r.id); return { ok: true }; },
    'POST /kickall': ({ s }) => { let n = 0; for (const p of rt.players()) if (p.role !== 'admin') { rt.kick(p, 'La moderación ha cerrado las partidas.'); n++; } audit(s.user, 'expulsar-todos', n + ' jugadores'); return { ok: true, kicked: n }; },
    'GET /audit': () => ({ audit: auditS.data.list.slice(-300).reverse() }),
    'GET /logs': () => ({ logs: logRing.slice(-300) }),
    'GET /backup': ({ s }) => { audit(s.user, 'copia-de-seguridad', ''); return { __download: 'pixel-play-rusher-backup-' + new Date().toISOString().slice(0, 10) + '.json', data: { version: 1, at: now(), leaderboard: rt.lbAll(), bans: bansS.data, reports: reportsS.data, influencers: { seq: infS.data.seq, list: infS.data.list.map(inf.pub) }, history: histS.data, stats: ST, settings: S_ } }; },
    'POST /leaderboard/remove': ({ b, s }) => { const n = rt.lbRemove(String(b.name || '')); audit(s.user, 'clasificacion-quitar', b.name + ' (' + n + ')'); return { ok: true, removed: n }; },
    'POST /leaderboard/reset': ({ b, s }) => { if (b.confirm !== 'BORRAR') return { code: 400, error: 'Escribe BORRAR para confirmar.' }; const n = rt.lbClear(); audit(s.user, 'clasificacion-borrar-todo', n + ' entradas'); return { ok: true, removed: n }; },
    'POST /password': async ({ b, s }) => {
      const cur = await scrypt(String(b.current || ''), cred.data.salt), stored = Buffer.from(cred.data.hash, 'hex');
      if (!(cur.length === stored.length && crypto.timingSafeEqual(cur, stored))) return { code: 401, error: 'La contraseña actual no es correcta.' };
      const nw = String(b.next || ''); if (!okPassword(nw)) return { code: 400, error: 'La nueva ' + PASS_RULE.slice(3) };
      if (nw === DEFAULT_PASS) return { code: 400, error: 'Elige una contraseña distinta de la inicial.' };
      await setPassword(nw); for (const [k] of sessions) if (k !== s.token) sessions.delete(k);
      const me = sessions.get(s.token); if (me) { me.setup = false; me.exp = now() + SESSION_MS; } // tras elegir la definitiva, esta misma sesión pasa a ser de administrador
      audit(s.user, s.setup ? 'contraseña-inicial-cambiada' : 'contraseña-cambiada', ''); return { ok: true };
    },
    'POST /email': async ({ b, s }) => {
      const cur = await scrypt(String(b.current || ''), cred.data.salt), stored = Buffer.from(cred.data.hash, 'hex');
      if (!(cur.length === stored.length && crypto.timingSafeEqual(cur, stored))) return { code: 401, error: 'La contraseña actual no es correcta.' };
      const e = normEmail(b.email); if (!validEmail(e)) return { code: 400, error: 'El correo no parece válido.' };
      cred.data.email = e; cred.flush(); resetTok = null; audit(s.user, 'correo-recuperacion', maskEmail(e)); return { ok: true, email: maskEmail(e) };
    },
    'POST /logout': ({ s }) => { sessions.delete(s.token); return { ok: true }; }
  };

  /* Devuelve true si la petición era de la API de administración (ya respondida). */
  async function handleHttp(req, res, url, ip) {
    if (!url.pathname.startsWith('/api/admin/')) return false;
    if (ALLOWED_IPS.length && !ALLOWED_IPS.includes(ip)) { send(res, 403, { error: 'IP no permitida.' }); return true; }
    const n = (apiHits.get(ip) || 0) + 1; apiHits.set(ip, n); if (n > 400) { send(res, 429, { error: 'Demasiadas peticiones.' }); return true; }
    const sub = url.pathname.slice('/api/admin'.length), key = req.method + ' ' + sub;
    try {
      if (key === 'POST /forgot') { const b = await readBody(req), r = await forgot(b.email, ip); send(res, r.code || 200, r.error ? { error: r.error } : { ok: true, message: r.message }); return true; }
      if (key === 'POST /reset') { const b = await readBody(req), r = await resetPassword(b.token, b.password, ip); send(res, r.code || 200, r.error ? { error: r.error } : { ok: true }); return true; }
      if (key === 'POST /login') { const b = await readBody(req), r = await login(b.user, b.password, ip); if (!r.ok) send(res, r.code, { error: r.error }); else send(res, 200, { token: r.token, expiresAt: r.expiresAt, user: r.user, mustChange: !!r.mustChange }); return true; }
      const h = String(req.headers.authorization || ''), token = h.startsWith('Bearer ') ? h.slice(7) : '', s = validToken(token);
      if (!s) { send(res, 401, { error: 'Sesión no válida o caducada.' }); return true; }
      if (s.setup && !['POST /password', 'GET /me', 'POST /logout'].includes(key)) { send(res, 403, { error: 'Debes cambiar la contraseña inicial antes de usar el panel.', mustChange: true }); return true; }
      const fn = routes[key]; if (!fn) { send(res, 404, { error: 'No encontrado.' }); return true; }
      const b = req.method === 'POST' ? await readBody(req) : {};
      const out = await fn({ b, s: { user: s.user, exp: s.exp, token, setup: !!s.setup }, q: url.searchParams });
      if (out && out.__download) { send(res, 200, out.data, { 'Content-Disposition': 'attachment; filename="' + out.__download + '"' }); return true; }
      if (out && out.error) { send(res, out.code || 400, { error: out.error }); return true; }
      send(res, 200, out || { ok: true });
    } catch (e) { log('Error en la API de administración: ' + e.message); send(res, 400, { error: e.message }); }
    return true;
  }

  function flushAll() { for (const s of stores) s.flush(); }
  return {
    ready, get credentialsNotice() { return credentialsNotice; }, adminUser: ADMIN_USER, nameKey, ipKey,
    /* extensiones para otros módulos (cuentas, tienda): rutas del panel, auditoría y comprobaciones de nombre/baneo */
    addRoutes(extra) { Object.assign(routes, extra); }, audit,
    roleOf(name) { const nk = nameKey(name); if (!nk) return 0; if (nk === ADMIN_KEY) return 'admin'; return infS.data.list.some(i => i.active && i.nameKey === nk) ? 'inf' : 0; },
    isReserved(name) { const nk = nameKey(name); return !!nk && (nk.includes(ADMIN_KEY) || infS.data.list.some(i => i.active && i.nameKey === nk)); },
    banFor(name, ip) { return bans.check({ nameKey: nameKey(name), ipKey: ipKey(ip) }); }, banMessage: b => bans.message(b),
    resolveIdentity, checkChat, onChat, onLog, recordMatch, makeReport, count, handleHttp, handleUpgrade, flushAll,
    settings: S_, maxPerRoom: () => S_.maintenance.on ? 0 : S_.maxPerRoom, roleOfToken: t => (fullToken(t) ? 'admin' : 0)
  };
}

module.exports = { createAdmin, nameKey, Store };
