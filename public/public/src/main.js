/* Punto de entrada del metajuego: acceso (login / registro / invitado) y puente con el lobby existente. */
import { createApp } from './app.js';
import { defaultStorages } from './api/storage.js';
import { createAuthScreen } from './ui/screens/AuthScreen.js';
import { createAdminClient } from './api/adminService.js';

/* Puente con el lobby actual (index.html): nombre de cuenta, fila de sesión y botón «Cerrar sesión». */
function createLegacyBridge(doc, app) {
  const $ = id => doc.getElementById(id), Ev = doc.defaultView.Event;
  const nameIn = $('name'), row = $('sessionRow'), who = $('sessName'), btn = $('logoutBtn');
  let armedUntil = 0, armTimer = 0;
  const idleLabel = 'Cerrar sesión';

  function apply(session) {
    if (nameIn) {
      nameIn.value = session.username; nameIn.readOnly = true; nameIn.title = 'Tu nombre de cuenta';
      nameIn.dispatchEvent(new Ev('change', { bubbles: true }));
    }
    if (row) { row.hidden = false; who.textContent = session.guest ? 'Invitado · los datos solo están en este navegador' : 'Cuenta · ' + session.username; }
  }
  function clear() {
    if (nameIn) { nameIn.readOnly = false; nameIn.removeAttribute('title'); }
    if (row) row.hidden = true;
    if (btn) { btn.textContent = idleLabel; btn.classList.remove('armed'); }
  }
  function logout() {
    const s = app.state.get().session; if (!s) return;
    app.auth.logout(); app.state.signOut({ wipe: s.guest });
    clear(); app.ui.show('auth');
  }
  if (btn) btn.addEventListener('click', () => {
    const s = app.state.get().session; if (!s) return;
    if (s.guest && Date.now() > armedUntil) { // el invitado no se puede recuperar: pedir confirmación con un segundo clic
      armedUntil = Date.now() + 4000; btn.textContent = '¿Seguro? Se borran los datos'; btn.classList.add('armed');
      clearTimeout(armTimer); armTimer = setTimeout(() => { btn.textContent = idleLabel; btn.classList.remove('armed'); armedUntil = 0; }, 4000);
      return;
    }
    clearTimeout(armTimer); armedUntil = 0; logout();
  });
  return { apply, clear, logout };
}

export function bootstrap(opts = {}) {
  const doc = opts.document || globalThis.document;
  const config = opts.config || globalThis.VOLT_CONFIG || {};
  let root = doc.getElementById('uiRoot');
  if (!root) { root = doc.createElement('div'); root.id = 'uiRoot'; doc.body.appendChild(root); }
  const app = createApp({ storages: opts.storages || defaultStorages(), root, cryptoApi: opts.cryptoApi, now: opts.now });
  if (config.auth === false) return app; // acceso desactivado desde config.js: el lobby queda como antes

  const legacy = createLegacyBridge(doc, app);
  function enter(session) { app.state.signIn(session); legacy.apply(session); app.ui.show('lobby'); app.bus.emit('auth:login', { session }); }
  // El acceso del administrador se comprueba en el servidor: misma dirección que el juego, o la de config.js si la web está aparte
  const base = config.server ? String(config.server).replace(/\/+$/, '') + '/' : (doc.defaultView && doc.defaultView.location ? doc.defaultView.location.pathname.replace(/[^/]*$/, '') : '/');
  const admin = opts.admin || createAdminClient({ fetchFn: (...a) => globalThis.fetch(...a), base });
  app.ui.register('auth', createAuthScreen({ doc, auth: app.auth, admin, onAuthenticated: enter }));
  app.ui.register('lobby', { mount() {}, show() {}, hide() {} }); // el lobby ya está en la página; aquí solo se marca como activo

  const restored = app.auth.restoreSession();
  if (restored) enter(restored); else app.ui.show('auth');
  app.legacy = legacy;
  return app;
}

// En el navegador arranca solo; en pruebas se importa sin efectos y se llama a bootstrap() a mano.
if (typeof document !== 'undefined' && !globalThis.__PPR_MANUAL_BOOT__) {
  const start = () => { globalThis.__ppr = bootstrap(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
