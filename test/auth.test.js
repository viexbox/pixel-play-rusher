'use strict';
/* Metajuego, fase 1: servicios (auth, perfil, estado) y pantalla de acceso con Login / Registro / Invitado. */
const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url'); const { JSDOM } = require('jsdom');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(15); } return false; }
const SRC = path.join(__dirname, '..', 'public', 'src');
const imp = rel => import(pathToFileURL(path.join(SRC, rel)).href);
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
const storages = () => ({ local: memStore(), session: memStore() });

(async () => {
  globalThis.__PPR_MANUAL_BOOT__ = true;
  const A = await imp('api/authService.js'), P = await imp('api/playerService.js'), S = await imp('state/playerState.js'), ST = await imp('api/storage.js'), B = await imp('state/eventBus.js'), APP = await imp('app.js');

  /* ---------- Validaciones ---------- */
  ok(A.validateUsername('Ana') === '' && A.validateUsername('Ñandú_9') === '', 'nombres de usuario válidos (también con ñ y acentos)');
  ok(/reservado/.test(A.validateUsername('Viexbox')) && /reservado/.test(A.validateUsername('V1exb0x')) && /reservado/.test(A.validateUsername('viexbox_2')) && A.validateUsername('Vixbox') === '', 'el nombre del administrador «Viexbox» está reservado en el registro (también con variantes)');
  ok(/Mínimo/.test(A.validateUsername('ab')) && /Máximo/.test(A.validateUsername('a'.repeat(15))) && /Solo letras/.test(A.validateUsername('a b!')) && /reservado/.test(A.validateUsername('guest_1234')), 'nombre: corto, largo, caracteres raros y «Guest_» reservado');
  ok(A.validateEmail('a@b.co') === '' && /válido/.test(A.validateEmail('a@b')) && A.validateEmail('') !== '', 'validación de correo');
  ok(A.validatePassword('abc12345') === '' && /Mínimo/.test(A.validatePassword('abc123')) && /letra y un número/.test(A.validatePassword('abcdefgh')), 'contraseña: mínimo 8 y letra + número');
  ok(A.validateRegister({ username: 'Ana', email: 'a@b.co', password: 'abc12345', password2: 'otra' }).password2 === 'Las contraseñas no coinciden.', 'las contraseñas deben coincidir');

  /* ---------- Registro, acceso y sesión ---------- */
  let t = 1000000, now = () => t; let st = storages();
  let auth = A.createAuthService({ local: st.local, session: st.session, now });
  let r = await auth.register({ username: 'Ana', email: 'Ana@Correo.com', password: 'secreto123', password2: 'secreto123' });
  ok(r.ok && r.session.username === 'Ana' && !r.session.guest, 'registro correcto y sesión iniciada');
  const users = st.local.getItem('ppr.users');
  ok(!users.includes('secreto123') && /"algo":"pbkdf2"/.test(users), 'la contraseña no se guarda en claro (PBKDF2)');
  ok((await auth.register({ username: 'ANA', email: 'otra@x.com', password: 'secreto123', password2: 'secreto123' })).error.field === 'username', 'nombre repetido (sin distinguir mayúsculas) rechazado');
  ok((await auth.register({ username: 'Beto', email: 'ana@correo.com', password: 'secreto123', password2: 'secreto123' })).error.field === 'email', 'correo repetido rechazado');
  ok((await auth.register({ username: 'X', email: 'nope', password: '1', password2: '2' })).error.code === 'invalid', 'datos inválidos rechazados antes de crear nada');
  auth.logout(); ok(auth.restoreSession() === null, 'cerrar sesión borra la sesión');
  ok((await auth.login({ identifier: 'ana', password: 'secreto123' })).ok, 'acceso con el nombre de usuario');
  ok((await auth.login({ identifier: 'ANA@correo.com', password: 'secreto123' })).ok, 'acceso con el correo');
  const bad = await auth.login({ identifier: 'ana', password: 'malaclave1' }), noUser = await auth.login({ identifier: 'nadie', password: 'malaclave1' });
  ok(!bad.ok && bad.error.message === noUser.error.message && /incorrectos/.test(bad.error.message), 'error genérico: no revela si el usuario existe');
  for (let i = 0; i < 4; i++) await auth.login({ identifier: 'ana', password: 'x' + i + 'aaaaaaa' });
  const locked = await auth.login({ identifier: 'ana', password: 'secreto123' });
  ok(!locked.ok && locked.error.code === 'locked', 'tras 5 fallos, bloqueo temporal (' + locked.error.message + ')');
  t += 31000; ok((await auth.login({ identifier: 'ana', password: 'secreto123' })).ok, 'pasado el bloqueo se puede entrar de nuevo');

  /* ---------- Persistencia de sesión (F5) ---------- */
  auth.logout(); await auth.login({ identifier: 'ana', password: 'secreto123', remember: true });
  auth = A.createAuthService({ local: st.local, session: st.session, now });
  ok(auth.restoreSession() && auth.restoreSession().username === 'Ana', 'con «Recordarme», la sesión sobrevive a recargar la página');
  auth.logout(); await auth.login({ identifier: 'ana', password: 'secreto123', remember: false });
  ok(!st.local.getItem('ppr.session') && st.session.getItem('ppr.session'), 'sin «Recordarme» la sesión va a sessionStorage (solo esta pestaña)');
  const newTab = A.createAuthService({ local: st.local, session: memStore(), now });
  ok(newTab.restoreSession() === null && A.createAuthService({ local: st.local, session: st.session, now }).restoreSession(), 'otra pestaña/navegador nuevo no hereda la sesión temporal');
  auth.logout(); await auth.login({ identifier: 'ana', password: 'secreto123', remember: true });
  t += 31 * 86400000; ok(A.createAuthService({ local: st.local, session: st.session, now }).restoreSession() === null, 'la sesión caduca a los 30 días');
  t -= 31 * 86400000; auth.logout(); await auth.login({ identifier: 'ana', password: 'secreto123', remember: true });
  st.local.setItem('ppr.users', '{}'); ok(A.createAuthService({ local: st.local, session: st.session, now }).restoreSession() === null, 'si la cuenta ya no existe, la sesión se descarta');
  st.local.setItem('ppr.users', '{{corrupto'); ok(!(await A.createAuthService({ local: st.local, session: st.session, now }).login({ identifier: 'ana', password: 'secreto123' })).ok, 'datos corruptos en el almacén no rompen el acceso');

  /* ---------- Invitado ---------- */
  st = storages(); auth = A.createAuthService({ local: st.local, session: st.session, now });
  const g = auth.guest();
  ok(g.ok && /^Guest_\d{4}$/.test(g.session.username) && g.session.guest && !g.session.expiresAt, 'invitado con nombre «Guest_XXXX» (' + g.session.username + ')');
  ok(A.createAuthService({ local: st.local, session: st.session, now }).restoreSession().userId === g.session.userId, 'el invitado se conserva al recargar');

  /* ---------- Estado del jugador ---------- */
  const bus = B.createEventBus(), svc = P.createPlayerService(st.local), ps = S.createPlayerState({ service: svc, bus });
  const events = []; ps.subscribe((s, k) => events.push(k)); let busHits = 0; bus.on('state:change', () => busHits++);
  ps.signIn(g.session); let prof = ps.get().profile;
  ok(prof.level === 1 && prof.title === 'Invitado' && prof.gold === 500 && prof.gems === 10 && prof.heroes.equipped === 'h1', 'perfil inicial del invitado (nivel 1, oro, gemas, héroe por defecto)');
  ps.updateProfile(p => { p.gold += 250; p.stats.kills = 7; return p; });
  ok(ps.get().profile.gold === 750 && svc.load(g.session.userId).stats.kills === 7, 'los cambios se guardan automáticamente');
  ok(events.join() === 'signin,profile' && busHits === 2, 'suscriptores y bus reciben los cambios (' + events.join() + ')');
  st.local.setItem('ppr.profile.old', JSON.stringify({ displayName: 'Vieja', gold: 42 }));
  const old = svc.load('old'); ok(old.gold === 42 && old.pets && old.stats.games === 0 && old.settings.music === 0.6, 'un perfil antiguo se completa con los valores por defecto');
  ps.signOut({ wipe: true }); ok(ps.get().session === null && svc.load(g.session.userId) === null, 'cerrar sesión de invitado borra sus datos');
  const ra = await auth.register({ username: 'Luz', email: 'luz@x.com', password: 'clave1234', password2: 'clave1234' });
  ps.signIn(ra.session); ps.updateProfile(p => { p.gems = 99; return p; }); ps.signOut();
  ps.signIn(ra.session); ok(ps.get().profile.gems === 99 && ps.get().profile.title === 'Novato', 'la cuenta registrada conserva su perfil al volver a entrar');
  ok(ST.safeStorage(() => { throw new Error('bloqueado'); }).persistent === false && (() => { const s = ST.safeStorage(() => null); s.setItem('a', 1); return s.getItem('a') === '1'; })(), 'sin localStorage disponible la app sigue funcionando en memoria');

  /* ---------- Pantalla de acceso (DOM real con jsdom) ---------- */
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script[^>]*src[^>]*><\/script>/g, '').replace(/<link[^>]*(fonts|stylesheet)[^>]*>/g, '');
  const M = await imp('main.js');
  const boot = (stores, config) => { const w = new JSDOM(html, { pretendToBeVisual: true, url: 'https://ejemplo.test/' }).window; const app = M.bootstrap({ document: w.document, storages: stores, config: config || { auth: true } }); return { w, app, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] }; };
  const type = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const submit = (w, f) => f.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  const sess = storages();
  let U = boot(sess);
  ok(!U.$('#auth').hidden && U.$('#menu').hasAttribute('inert') && U.$('#auth [role=tablist]'), 'sin sesión: aparece la pantalla de acceso y el lobby de fondo queda inactivo');
  ok(U.$('#loginForm') && !U.$('#loginForm').hidden && U.$('#registerForm').hidden && U.$('#guestBtn').textContent === 'Entrar como invitado', 'pestañas Entrar | Registro y botón «Entrar como invitado»');
  submit(U.w, U.$('#loginForm'));
  ok(/usuario o correo/i.test(U.$('#loginForm [data-err=identifier]').textContent) && U.$('#loginForm [name=identifier]').getAttribute('aria-invalid') === 'true' && U.$('#loginForm [name=identifier]').validity.customError && U.w.document.activeElement === U.$('#loginForm [name=identifier]'), 'enviar vacío muestra errores visibles junto a los campos y enfoca el primero');
  U.$('#tabRegister').click();
  ok(!U.$('#registerForm').hidden && U.$('#loginForm').hidden && U.$('#tabRegister').getAttribute('aria-selected') === 'true', 'la pestaña «Registro» muestra su formulario');
  type(U.w, U.$('#registerForm [name=username]'), 'Ma'); type(U.w, U.$('#registerForm [name=email]'), 'malo'); type(U.w, U.$('#registerForm [name=password]'), 'abcdefgh'); type(U.w, U.$('#registerForm [name=password2]'), 'x');
  submit(U.w, U.$('#registerForm'));
  ok(/Mínimo 3/.test(U.$('#registerForm [data-err=username]').textContent) && /correo/.test(U.$('#registerForm [data-err=email]').textContent) && /letra y un número/.test(U.$('#registerForm [data-err=password]').textContent), 'registro inválido: un mensaje por campo');
  type(U.w, U.$('#registerForm [name=username]'), 'Pixel_Ana'); type(U.w, U.$('#registerForm [name=email]'), 'ana@x.com'); type(U.w, U.$('#registerForm [name=password]'), 'clave1234'); type(U.w, U.$('#registerForm [name=password2]'), 'distinta1');
  ok(/no coinciden/.test(U.$('#registerForm [data-err=password2]').textContent), 'validación en vivo tras el primer intento');
  type(U.w, U.$('#registerForm [name=password2]'), 'clave1234'); submit(U.w, U.$('#registerForm'));
  ok(/aceptar los términos/.test(U.$('#registerForm [data-err=terms]').textContent) && !U.$('#registerForm [name=terms]').checked && /Términos de uso/.test(U.$('#registerForm').textContent) && U.$('#registerForm a[href="privacidad"]'), 'sin marcar la casilla de términos y privacidad no se crea la cuenta (con enlaces a ambos textos)');
  ok(U.$('#forgotBtn') && /olvidado tu contraseña/.test(U.$('#forgotBtn').textContent), 'y el formulario de entrar tiene «¿Has olvidado tu contraseña?»');
  U.$('#registerForm [name=terms]').checked = true; submit(U.w, U.$('#registerForm'));
  ok(await until(() => U.$('#auth').hidden), 'registro correcto: se cierra la pantalla de acceso');
  ok(U.$('#name').value === 'Pixel_Ana' && U.$('#name').readOnly && !U.$('#sessionRow').hidden && /Pixel_Ana/.test(U.$('#sessName').textContent) && !U.$('#menu').hasAttribute('inert'), 'el lobby recibe el nombre de la cuenta, muestra la sesión y vuelve a estar activo');
  ok(U.app.state.get().profile.displayName === 'Pixel_Ana' && !sess.local.getItem('ppr.users').includes('clave1234'), 'estado del jugador cargado y contraseña no guardada en claro');
  U.$('#logoutBtn').click();
  ok(!U.$('#auth').hidden && !U.$('#name').readOnly && U.$('#sessionRow').hidden && U.app.state.get().session === null, '«Cerrar sesión» devuelve a la pantalla de acceso y libera el nombre');
  type(U.w, U.$('#loginForm [name=identifier]'), 'pixel_ana'); type(U.w, U.$('#loginForm [name=password]'), 'incorrecta1'); submit(U.w, U.$('#loginForm'));
  ok(await until(() => /incorrectos/.test(U.$('#loginForm [data-msg]').textContent)), 'contraseña incorrecta: mensaje de error en el formulario');
  ok(U.$('#loginForm [name=password]').type === 'password' && (U.$('#loginForm .pw-toggle').click(), U.$('#loginForm [name=password]').type === 'text'), 'botón para mostrar/ocultar la contraseña');
  type(U.w, U.$('#loginForm [name=password]'), 'clave1234'); submit(U.w, U.$('#loginForm'));
  ok(await until(() => U.$('#auth').hidden) && U.app.state.get().session.username === 'Pixel_Ana', 'acceso con la cuenta creada');
  const F5 = boot(sess);
  ok((!F5.$('#auth') || F5.$('#auth').hidden) && F5.$('#name').value === 'Pixel_Ana' && F5.app.state.get().session && !F5.$('#sessionRow').hidden, 'al recargar (F5) entra directo, sin volver a pedir el acceso');
  F5.$('#logoutBtn').click();

  U = boot(storages());
  U.$('#guestBtn').click();
  ok(U.$('#auth').hidden && /^Guest_\d{4}$/.test(U.$('#name').value) && U.app.state.get().session.guest && /Invitado/.test(U.$('#sessName').textContent), 'invitado: un clic y entra con nombre «' + U.$('#name').value + '»');
  U.$('#logoutBtn').click();
  ok(U.$('#auth').hidden && /Seguro/.test(U.$('#logoutBtn').textContent), 'cerrar la sesión de un invitado pide confirmar (se pierden sus datos)');
  U.$('#logoutBtn').click();
  ok(!U.$('#auth').hidden && U.app.state.get().session === null, 'confirmado: vuelve a la pantalla de acceso');

  U = boot(storages(), { auth: false });
  ok(!U.$('#auth') && U.$('#sessionRow').hidden && !U.$('#name').readOnly, 'con auth:false en config.js no aparece la pantalla de acceso y el lobby queda como antes');

  /* ---------- Empaquetado en un solo archivo ---------- */
  const build = require('../scripts/build-single.js');
  const out = build.build({ three: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js' });
  const scripts = [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  let parsed = true; try { for (const s of scripts) new (require('vm').Script)(s); } catch (e) { parsed = false; console.log(e.message); }
  ok(parsed && scripts.length >= 3 && !/<script[^>]*type="module"/.test(out) && !/(src|href)="src\//.test(out) && /createAuthService/.test(out) && !/^\s*import\s/m.test(out), 'el empaquetado en un solo archivo incluye el acceso, sin módulos externos y con JS válido (' + Math.round(out.length / 1024) + ' KB)');

  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})().catch(e => { console.log('EXCEPCIÓN', e); process.exit(1); });
