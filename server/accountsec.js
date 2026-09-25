'use strict';
/* PixelPlayRusher · Seguridad de las cuentas: correo vinculado, recuperación y eliminación.
   - Verificación de correo: código de 6 cifras por correo (15 min, 5 intentos, un envío por minuto). Solo un correo VERIFICADO sirve para recuperar la cuenta:
     así nadie puede quedarse con una cuenta registrada con un correo que no es suyo.
   - Cambiar de correo: pide la contraseña, manda el código al correo NUEVO y avisa al antiguo.
   - Recuperar contraseña: «¿Has olvidado tu contraseña?» → código al correo verificado → contraseña nueva; cierra todas las sesiones y avisa por correo.
     La respuesta es siempre la misma exista o no el correo (no se puede averiguar quién tiene cuenta).
   - Cambiar contraseña estando dentro: pide la actual y cierra el resto de sesiones.
   - Eliminar cuenta: pide contraseña y escribir el nombre; queda programada ACCOUNT_DELETE_DAYS días (7) y se puede cancelar entrando; pasado el plazo se borra todo
     (cuenta, foto, amigos, anuncios, pase y clasificación) — el derecho a borrar los datos, con margen para arrepentirse o para que no lo haga otra persona.
   - Sin SMTP configurado (SMTP_HOST) no hay correos: el administrador puede dar a un jugador un código de recuperación desde el panel (POST /api/admin/accounts/reset-code).
   Rutas públicas: POST /api/auth/forgot · POST /api/auth/reset. Con sesión: POST /api/auth/verify/{send,confirm} · /api/me/{email,email/confirm,password,delete,delete/cancel} */

const crypto = require('crypto');

const MAX_TRIES = 5, HOUR = 3600000;
const mask = e => { const [n, d] = String(e || '').split('@'); return n ? n[0] + '*'.repeat(Math.max(1, Math.min(6, n.length - 1))) + '@' + (d || '') : ''; };

function createAccountSecurity(ctx) {
  const { D, byKey, byId, db, err, sha, scrypt, hex, now, ukey, normEmail, validEmail, admin, log, env, S, Store } = ctx;
  const TTL = +env.MAIL_CODE_TTL_MS || 15 * 60000, GAP = +env.MAIL_GAP_MS || 60000;   // validez de un código y espera entre envíos (ajustables solo para pruebas)
  const DELETE_MS = (env.ACCOUNT_DELETE_DAYS !== undefined && env.ACCOUNT_DELETE_DAYS !== '' ? +env.ACCOUNT_DELETE_DAYS : 7) * 86400000;
  const mailOn = () => !!(admin.smtpOn && admin.smtpOn());
  const hooks = [];                       // otros módulos (foto, pase, mercado…) se apuntan aquí para limpiar sus datos al borrar una cuenta
  const mailHits = new Map();             // límite de correos por IP y por cuenta/correo y hora
  const okRate = (key, max) => { const t = now(), a = (mailHits.get(key) || []).filter(x => t - x < HOUR); if (a.length >= max) return false; a.push(t); mailHits.set(key, a); return true; };
  setInterval(() => { const t = now(); for (const [k, a] of mailHits) { const b = a.filter(x => t - x < HOUR); if (b.length) mailHits.set(k, b); else mailHits.delete(k); } }, 600000).unref();

  const newRec = (extra) => { const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'), salt = hex(8); return { code, rec: Object.assign({ salt, h: sha(salt + ':' + code), exp: now() + TTL, tries: 0, sentAt: now() }, extra || {}) }; };
  /* Comprueba un código: devuelve null si vale, o el motivo. Cada fallo cuenta; a los 5 el código deja de valer. */
  function checkRec(rec, code) {
    if (!rec) return 'No hay ningún código pendiente. Pide uno nuevo.';
    if (now() > rec.exp) return 'El código ha caducado. Pide uno nuevo.';
    if (rec.tries >= MAX_TRIES) return 'Demasiados intentos. Pide un código nuevo.';
    if (!/^\d{6}$/.test(String(code || '').trim()) || !crypto.timingSafeEqual(Buffer.from(sha(rec.salt + ':' + String(code).trim())), Buffer.from(rec.h))) { rec.tries++; db.flush(); return 'Código incorrecto.' + (rec.tries >= MAX_TRIES ? ' Pide un código nuevo.' : ' Te quedan ' + (MAX_TRIES - rec.tries) + ' intentos.'); }
    return null;
  }
  async function mail(to, subject, text) { try { return await admin.sendMail(to, subject, text + '\n\n—\nPixelPlayRusher. Si no has sido tú, puedes ignorar este correo.'); } catch (e) { log('No se pudo enviar el correo a ' + mask(to) + ': ' + e.message); return false; } }
  const pwOk = pw => pw.length >= 8 && pw.length <= 128 && /\p{L}/u.test(pw) && /\p{N}/u.test(pw);
  async function checkPw(u, pw) { try { const h = await scrypt(String(pw || ''), u.salt), st = Buffer.from(u.hash, 'hex'); return h.length === st.length && crypto.timingSafeEqual(h, st); } catch (e) { return false; } }
  async function setPw(u, pw) { u.salt = hex(16); u.hash = (await scrypt(pw, u.salt)).toString('hex'); }
  const killSessions = (u, keep) => { for (const k of Object.keys(D.sessions)) if (D.sessions[k].uid === u.id && k !== keep) delete D.sessions[k]; };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- Verificación del correo ---------- */
  async function sendVerification(u) {
    if (!mailOn()) return err(503, 'Este servidor no tiene el correo configurado, así que no se pueden enviar códigos.');
    if (u.emailVerified) return err(400, 'Tu correo ya está verificado.');
    if (u.vcode && now() - u.vcode.sentAt < GAP) return err(429, 'Espera un minuto antes de pedir otro código.', { retry: Math.ceil((GAP - (now() - u.vcode.sentAt)) / 1000) });
    if (!okRate('acct:' + u.id, 5)) return err(429, 'Has pedido demasiados códigos. Inténtalo dentro de una hora.');
    const { code, rec } = newRec({ email: u.email }); u.vcode = rec; db.flush();
    const sent = await mail(u.email, 'Tu código de verificación: ' + code, 'Tu código para verificar el correo de tu cuenta «' + u.username + '» es:\n\n    ' + code + '\n\nCaduca en 15 minutos.');
    return sent ? { ok: true, sentTo: mask(u.email), retry: GAP / 1000 } : err(502, 'No se pudo enviar el correo. Inténtalo más tarde.');
  }
  const confirmVerification = (u, b) => {
    if (u.emailVerified) return { ok: true, verified: true };
    if (u.vcode && u.vcode.email !== u.email) u.vcode = null;
    const why = checkRec(u.vcode, b.code); if (why) return err(400, why);
    u.emailVerified = true; u.vcode = null; db.flush(); log('Correo verificado: ' + u.username); return { ok: true, verified: true };
  };

  /* ---------- Cambiar de correo ---------- */
  async function changeEmail(u, b) {
    if (!mailOn()) return err(503, 'Este servidor no tiene el correo configurado.');
    if (!(await checkPw(u, b.password))) return err(403, 'La contraseña no es correcta.');
    const email = normEmail(b.email); if (!validEmail(email)) return err(400, 'El correo no parece válido.');
    if (email === u.email) return err(400, 'Ese ya es tu correo.');
    if (Object.values(D.users).some(x => x.email === email)) return err(409, 'Ese correo ya tiene una cuenta.');
    if (u.echange && now() - u.echange.rec.sentAt < GAP) return err(429, 'Espera un minuto antes de pedir otro código.');
    if (!okRate('acct:' + u.id, 5)) return err(429, 'Demasiados códigos. Inténtalo dentro de una hora.');
    const { code, rec } = newRec(); u.echange = { email, rec }; db.flush();
    const sent = await mail(email, 'Tu código para cambiar el correo: ' + code, 'Has pedido usar este correo en tu cuenta «' + u.username + '». Tu código es:\n\n    ' + code + '\n\nCaduca en 15 minutos.');
    return sent ? { ok: true, sentTo: mask(email) } : err(502, 'No se pudo enviar el correo. Inténtalo más tarde.');
  }
  async function confirmEmailChange(u, b) {
    if (!u.echange) return err(400, 'No hay ningún cambio de correo pendiente.');
    const why = checkRec(u.echange.rec, b.code); if (why) return err(400, why);
    const email = u.echange.email; if (Object.values(D.users).some(x => x.email === email && x !== u)) { u.echange = null; db.flush(); return err(409, 'Ese correo acaba de ser usado por otra cuenta.'); }
    const old = u.email, oldVerified = u.emailVerified; u.email = email; u.emailVerified = true; u.echange = null; u.vcode = null; db.flush();
    if (oldVerified && mailOn()) mail(old, 'Se ha cambiado el correo de tu cuenta', 'El correo de tu cuenta «' + u.username + '» ahora es ' + mask(email) + '. Si no has sido tú, escribe al administrador cuanto antes.');
    log('Correo cambiado: ' + u.username); return { ok: true, email: mask(email) };
  }

  /* ---------- Contraseña ---------- */
  async function forgot(b, ip) {
    const generic = { ok: true, message: 'Si existe una cuenta con ese correo verificado, te hemos enviado un código (válido 15 minutos).' };
    if (!mailOn()) return err(503, 'Este servidor no tiene el correo configurado. Pide al administrador un código de recuperación.');
    const email = normEmail(b.email); if (!validEmail(email)) return generic;
    if (!okRate('ip:' + ip, 10) || !okRate('em:' + email, 3)) return err(429, 'Demasiadas peticiones. Inténtalo dentro de una hora.');
    const u = Object.values(D.users).find(x => x.email === email);
    (async () => {                                              // el envío no retrasa la respuesta: así no se nota si la cuenta existe
      if (!u || !u.emailVerified || (u.reset && now() - u.reset.sentAt < GAP)) return;
      const { code, rec } = newRec(); u.reset = rec; db.flush();
      await mail(u.email, 'Tu código para recuperar la cuenta: ' + code, 'Alguien (esperamos que tú) ha pedido recuperar la cuenta «' + u.username + '». Tu código es:\n\n    ' + code + '\n\nCaduca en 15 minutos. Si no lo has pedido, ignora este correo: tu contraseña sigue igual.');
    })().catch(() => {});
    await wait(150 + Math.floor(Math.random() * 150)); return generic;
  }
  async function reset(b, ip) {
    if (!okRate('rs:' + ip, 20)) return err(429, 'Demasiados intentos. Inténtalo más tarde.');
    const email = normEmail(b.email), pw = String(b.password || ''), u = validEmail(email) ? Object.values(D.users).find(x => x.email === email) : null;
    const bad = err(400, 'El código no es válido o ha caducado. Pide uno nuevo.');
    if (!u || !u.reset) { await wait(200); return bad; }
    if (!pwOk(pw)) return err(400, 'La contraseña nueva necesita 8 caracteres o más, con letras y números.');
    const why = checkRec(u.reset, b.code); if (why) return err(400, why);
    await setPw(u, pw); u.reset = null; u.vcode = null; if (u.email === email) u.emailVerified = true; killSessions(u); db.flush();
    if (mailOn()) mail(u.email, 'Tu contraseña se ha cambiado', 'La contraseña de tu cuenta «' + u.username + '» se acaba de restablecer y se cerraron todas las sesiones. Si no has sido tú, escribe al administrador.');
    log('Contraseña restablecida: ' + u.username); return { ok: true, username: u.username };
  }
  async function changePassword(u, b, ip, token) {
    if (!okRate('pw:' + u.id, 10)) return err(429, 'Demasiados intentos. Inténtalo más tarde.');
    if (!(await checkPw(u, b.old))) return err(403, 'La contraseña actual no es correcta.');
    const pw = String(b.password || ''); if (!pwOk(pw)) return err(400, 'La contraseña nueva necesita 8 caracteres o más, con letras y números.');
    if (pw === String(b.old)) return err(400, 'La contraseña nueva debe ser distinta.');
    await setPw(u, pw); killSessions(u, sha(token)); db.flush();
    if (u.emailVerified && mailOn()) mail(u.email, 'Tu contraseña se ha cambiado', 'La contraseña de tu cuenta «' + u.username + '» se acaba de cambiar y se cerraron las demás sesiones. Si no has sido tú, escribe al administrador.');
    return { ok: true };
  }

  /* ---------- Eliminar la cuenta (con plazo para arrepentirse) ---------- */
  async function requestDelete(u, b) {
    if (!(await checkPw(u, b.password))) return err(403, 'La contraseña no es correcta.');
    if (String(b.confirm || '').trim().toLowerCase() !== u.username.toLowerCase()) return err(400, 'Escribe tu nombre de usuario exacto para confirmar.');
    u.deleteAt = now() + DELETE_MS; db.flush();
    if (u.emailVerified && mailOn()) mail(u.email, 'Tu cuenta se eliminará', 'Has pedido eliminar la cuenta «' + u.username + '». Se borrará por completo el ' + new Date(u.deleteAt).toLocaleDateString('es-ES') + '. Si te arrepientes, entra en el juego y cancela la eliminación antes de esa fecha.');
    log('Eliminación solicitada: ' + u.username + ' (se borra el ' + new Date(u.deleteAt).toISOString().slice(0, 10) + ')'); return { ok: true, deleteAt: u.deleteAt };
  }
  const cancelDelete = u => { if (!u.deleteAt) return err(400, 'Tu cuenta no tiene ninguna eliminación programada.'); u.deleteAt = 0; db.flush(); log('Eliminación cancelada: ' + u.username); return { ok: true }; };
  async function removeUser(u) {
    for (const f of hooks) { try { await f(u); } catch (e) { log('Limpieza al borrar ' + u.username + ' (' + e.message + ')'); } }
    for (const o of Object.values(D.users)) for (const k of ['friends', 'reqIn', 'reqOut', 'blocked']) if (Array.isArray(o[k]) && o[k].includes(u.id)) o[k] = o[k].filter(x => x !== u.id);
    killSessions(u); delete D.users[u.id]; byId.delete(u.id); byKey.delete(u.key); db.flush(); log('Cuenta eliminada: ' + u.username + ' (' + u.id + ')');
  }
  let purging = false;
  async function purgeDue() { if (purging) return 0; purging = true; let n = 0; try { for (const u of Object.values(D.users)) if (u.deleteAt && u.deleteAt <= now()) { await removeUser(u); n++; } } finally { purging = false; } return n; }
  const timer = setInterval(() => { purgeDue().catch(e => log('Purga de cuentas: ' + e.message)); }, +env.PURGE_CHECK_MS || 3600000); timer.unref();

  /* ---------- Panel: código de recuperación cuando no hay correo (o para ayudar a un jugador) ---------- */
  admin.addRoutes({
    'POST /accounts/reset-code': ({ b, s }) => {
      const u = byKey.get(ukey(String(b.username || ''))); if (!u) return err(404, 'No existe esa cuenta.');
      const { code, rec } = newRec(); rec.exp = now() + 30 * 60000; rec.admin = s.user; u.reset = rec; db.flush(); admin.audit(s.user, 'cuenta-codigo-recuperacion', u.username);
      return { ok: true, code, email: u.email, minutes: 30, note: 'Dale este código al jugador: en «¿Has olvidado tu contraseña?» debe escribir su correo (' + mask(u.email) + '), este código y la contraseña nueva.' };
    },
    'POST /accounts/verify-email': ({ b, s }) => { const u = byKey.get(ukey(String(b.username || ''))); if (!u) return err(404, 'No existe esa cuenta.'); u.emailVerified = b.verified !== false; db.flush(); admin.audit(s.user, u.emailVerified ? 'correo-verificar' : 'correo-quitar-verificacion', u.username); return { ok: true, verified: u.emailVerified }; }
  });

  return {
    mailOn, mask, removeUser, purgeDue, onRemove: f => hooks.push(f), sendVerification, deleteDays: DELETE_MS / 86400000,
    publicRoutes: { 'POST /api/auth/forgot': forgot, 'POST /api/auth/reset': reset },
    authRoutes: {
      'POST /api/auth/verify/send': u => sendVerification(u), 'POST /api/auth/verify/confirm': (u, b) => confirmVerification(u, b),
      'POST /api/me/email': (u, b) => changeEmail(u, b), 'POST /api/me/email/confirm': (u, b) => confirmEmailChange(u, b),
      'POST /api/me/password': changePassword, 'POST /api/me/delete': (u, b) => requestDelete(u, b), 'POST /api/me/delete/cancel': u => cancelDelete(u)
    }
  };
}

module.exports = { createAccountSecurity, mask };
