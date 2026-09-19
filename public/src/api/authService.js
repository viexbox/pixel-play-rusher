/* Servicio de autenticación SIMULADO (todo ocurre en este navegador).
   Sirve para probar el flujo completo sin servidor. Para producción hay que sustituirlo por una API real:
   las cuentas guardadas en localStorage no son seguras ni se comparten entre dispositivos.
   Todos los métodos son asíncronos o devuelven {ok, ...} para poder cambiarlos por fetch() sin tocar la interfaz. */
const USERS_KEY = 'ppr.users';
const SESSION_KEY = 'ppr.session';
const DAY = 86400000;

export const RULES = { userMin: 3, userMax: 14, passMin: 8, maxAttempts: 5, lockMs: 30000, sessionDays: 30 };
const USER_RE = /^[\p{L}\p{N}_-]+$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---- Validaciones (las usa también la pantalla para los mensajes junto a cada campo) ---- */
export function validateUsername(v) {
  v = String(v || '').trim();
  if (!v) return 'Escribe un nombre de usuario.';
  if (v.length < RULES.userMin) return 'Mínimo ' + RULES.userMin + ' caracteres.';
  if (v.length > RULES.userMax) return 'Máximo ' + RULES.userMax + ' caracteres.';
  if (!USER_RE.test(v)) return 'Solo letras, números, guion y guion bajo.';
  if (/^guest_/i.test(v)) return 'Ese nombre está reservado para invitados.';
  return '';
}
export function validateEmail(v) {
  v = String(v || '').trim();
  if (!v) return 'Escribe tu correo electrónico.';
  return EMAIL_RE.test(v) ? '' : 'El correo no parece válido.';
}
export function validatePassword(v) {
  v = String(v || '');
  if (!v) return 'Escribe una contraseña.';
  if (v.length < RULES.passMin) return 'Mínimo ' + RULES.passMin + ' caracteres.';
  if (!/\p{L}/u.test(v) || !/\p{N}/u.test(v)) return 'Combina al menos una letra y un número.';
  return '';
}
export function validateRegister(f) {
  const e = {};
  const u = validateUsername(f.username); if (u) e.username = u;
  const m = validateEmail(f.email); if (m) e.email = m;
  const p = validatePassword(f.password); if (p) e.password = p;
  if (!e.password && f.password !== f.password2) e.password2 = 'Las contraseñas no coinciden.';
  if (!f.password2 && !e.password2) e.password2 = 'Repite la contraseña.';
  return e;
}
export function validateLogin(f) {
  const e = {};
  if (!String(f.identifier || '').trim()) e.identifier = 'Escribe tu usuario o correo.';
  if (!f.password) e.password = 'Escribe tu contraseña.';
  return e;
}

/* ---- Utilidades criptográficas ---- */
const hexOf = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
function randomBytes(n, cryptoApi) {
  const a = new Uint8Array(n);
  if (cryptoApi && cryptoApi.getRandomValues) cryptoApi.getRandomValues(a); else for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
  return a;
}
/* PBKDF2-SHA256 si el navegador lo permite (https o localhost); si no, un resumen débil solo apto para la demostración. */
async function hashPassword(password, saltHex, cryptoApi) {
  const iter = 100000;
  if (cryptoApi && cryptoApi.subtle) {
    const enc = new TextEncoder(), salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
    const key = await cryptoApi.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await cryptoApi.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
    return { algo: 'pbkdf2', iter, hash: hexOf(bits) };
  }
  let h1 = 0x811c9dc5, h2 = 0x1b873593; const s = saltHex + '|' + password;
  for (let r = 0; r < 2000; r++) for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 + h1 + i, 2246822519) >>> 0; }
  return { algo: 'weak', iter: 2000, hash: h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') };
}
const sameHash = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const fail = (code, message, field) => ({ ok: false, error: { code, message, field: field || null } });

export function createAuthService({ local, session, cryptoApi = globalThis.crypto, now = () => Date.now() }) {
  const attempts = new Map(); // identificador -> { n, until }

  const readUsers = () => { try { const u = JSON.parse(local.getItem(USERS_KEY) || '{}'); return u && typeof u === 'object' ? u : {}; } catch (e) { return {}; } };
  const writeUsers = u => local.setItem(USERS_KEY, JSON.stringify(u));
  const findByEmail = (users, email) => Object.values(users).find(u => u.emailLower === email);
  const newToken = () => hexOf(randomBytes(16, cryptoApi));

  function storeSession(user, remember) {
    const s = { token: newToken(), userId: user.id, username: user.username, guest: !!user.guest, remember: !!remember, createdAt: now(), expiresAt: user.guest ? null : now() + (remember ? RULES.sessionDays * DAY : DAY) };
    // «Recordarme» y los invitados usan localStorage (sobrevive al cierre); si no, sessionStorage (solo esta pestaña)
    const target = (remember || user.guest) ? local : session, other = target === local ? session : local;
    other.removeItem(SESSION_KEY); target.setItem(SESSION_KEY, JSON.stringify(s));
    return s;
  }

  async function register(input) {
    const errors = validateRegister(input);
    const first = Object.keys(errors)[0];
    if (first) return fail('invalid', errors[first], first);
    const username = String(input.username).trim(), email = String(input.email).trim(), users = readUsers(), key = username.toLowerCase();
    if (users[key]) return fail('username-taken', 'Ese nombre de usuario ya existe.', 'username');
    if (findByEmail(users, email.toLowerCase())) return fail('email-taken', 'Ya hay una cuenta con ese correo.', 'email');
    const salt = hexOf(randomBytes(16, cryptoApi)), h = await hashPassword(input.password, salt, cryptoApi);
    const user = { id: 'u-' + hexOf(randomBytes(6, cryptoApi)), username, email, emailLower: email.toLowerCase(), salt, algo: h.algo, iter: h.iter, hash: h.hash, createdAt: now() };
    users[key] = user; writeUsers(users);
    return { ok: true, session: storeSession(user, input.remember !== false), created: true };
  }

  async function login(input) {
    const errors = validateLogin(input), first = Object.keys(errors)[0];
    if (first) return fail('invalid', errors[first], first);
    const id = String(input.identifier).trim().toLowerCase(), at = attempts.get(id) || { n: 0, until: 0 };
    if (at.until > now()) return fail('locked', 'Demasiados intentos. Espera ' + Math.ceil((at.until - now()) / 1000) + ' s.');
    const users = readUsers(), user = users[id] || findByEmail(users, id);
    let good = false;
    if (user) { const h = await hashPassword(input.password, user.salt, cryptoApi); good = h.algo === user.algo && sameHash(h.hash, user.hash); }
    else await hashPassword(input.password, '00'.repeat(16), cryptoApi); // mismo coste: no revela si el usuario existe
    if (!good) {
      at.n += 1; if (at.n >= RULES.maxAttempts) { at.n = 0; at.until = now() + RULES.lockMs; }
      attempts.set(id, at);
      return fail('bad-credentials', 'Usuario o contraseña incorrectos.');
    }
    attempts.delete(id);
    return { ok: true, session: storeSession(user, !!input.remember) };
  }

  function guest() {
    const n = 1000 + (randomBytes(2, cryptoApi).reduce((a, b) => a * 256 + b, 0) % 9000);
    const user = { id: 'guest-' + hexOf(randomBytes(4, cryptoApi)), username: 'Guest_' + n, guest: true };
    return { ok: true, session: storeSession(user, true) };
  }

  function readSession() {
    for (const st of [session, local]) {
      try { const s = JSON.parse(st.getItem(SESSION_KEY) || 'null'); if (s && s.token && s.userId) return s; } catch (e) { /* sesión corrupta */ }
    }
    return null;
  }
  /* Recupera la sesión al recargar (F5). Devuelve null si caducó o si la cuenta ya no existe. */
  function restoreSession() {
    const s = readSession(); if (!s) return null;
    if (s.expiresAt && s.expiresAt < now()) { logout(); return null; }
    if (!s.guest) { const u = readUsers()[String(s.username).toLowerCase()]; if (!u || u.id !== s.userId) { logout(); return null; } }
    return s;
  }
  function logout() { session.removeItem(SESSION_KEY); local.removeItem(SESSION_KEY); }

  return { register, login, guest, restoreSession, logout };
}
