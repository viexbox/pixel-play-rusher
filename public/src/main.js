/* Punto de entrada del metajuego: acceso (login / registro / invitado) y puente con el lobby existente. */
import { createApp } from './app.js';
import { defaultStorages } from './api/storage.js';
import { createAuthScreen } from './ui/screens/AuthScreen.js';
import { createAdminClient } from './api/adminService.js';
import { createAccountClient } from './api/accountService.js';

/* Puente con el lobby actual (index.html): nombre de cuenta, fila de sesión y botón «Cerrar sesión». */
function createLegacyBridge(doc, app, getAccounts) {
  const $ = id => doc.getElementById(id), Ev = doc.defaultView.Event;
  const nameIn = $('name'), row = $('sessionRow'), who = $('sessName'), btn = $('logoutBtn');
  let armedUntil = 0, armTimer = 0;
  const idleLabel = 'Cerrar sesión';

  function apply(session) {
    if (nameIn) {
      nameIn.value = session.username; nameIn.readOnly = true; nameIn.title = 'Tu nombre de cuenta';
      nameIn.dispatchEvent(new Ev('change', { bubbles: true }));
    }
    if (row) { row.hidden = false; who.textContent = session.guest ? 'Invitado · los datos solo están en este navegador' : (session.remote ? 'Cuenta online · ' : 'Cuenta · ') + session.username; }
    doc.defaultView.dispatchEvent(new Ev('ppr-session')); // el juego recarga el saldo y el progreso de la cuenta
  }
  function clear() {
    if (nameIn) { nameIn.readOnly = false; nameIn.removeAttribute('title'); }
    if (row) row.hidden = true;
    if (btn) { btn.textContent = idleLabel; btn.classList.remove('armed'); }
    doc.defaultView.dispatchEvent(new Ev('ppr-session'));
  }
  function logout() {
    const s = app.state.get().session; if (!s) return;
    const ac = getAccounts && getAccounts(); if (s.remote && ac) ac.logout(); // se avisa al servidor antes de borrar el token local
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
  const storages = opts.storages || defaultStorages();
  const app = createApp({ storages, root, cryptoApi: opts.cryptoApi, now: opts.now });
  if (config.auth === false) return app; // acceso desactivado desde config.js: el lobby queda como antes

  let accountsRef = null;
  const legacy = createLegacyBridge(doc, app, () => accountsRef);
  function enter(session) { app.state.signIn(session); legacy.apply(session); app.ui.show('lobby'); app.bus.emit('auth:login', { session }); }
  // El acceso del administrador se comprueba en el servidor: misma dirección que el juego, o la de config.js si la web está aparte
  const base = config.server ? String(config.server).replace(/\/+$/, '') + '/' : (doc.defaultView && doc.defaultView.location ? doc.defaultView.location.pathname.replace(/[^/]*$/, '') : '/');
  const admin = opts.admin || createAdminClient({ fetchFn: (...a) => globalThis.fetch(...a), base });
  const accounts = opts.accounts || createAccountClient({ fetchFn: (...a) => globalThis.fetch(...a), base, storage: storages.local });
  accountsRef = accounts;
  app.ui.register('auth', createAuthScreen({ doc, auth: app.auth, admin, accounts, onAuthenticated: enter }));
  app.ui.register('lobby', { mount() {}, show() {}, hide() {} }); // el lobby ya está en la página; aquí solo se marca como activo

  const restored = app.auth.restoreSession();
  if (restored) enter(restored);
  else if (globalThis.PPR_PORTAL) { const g = app.auth.guest(); if (g.ok) enter(g.session); else app.ui.show('auth'); }   // [PORTALES] en CrazyGames/Poki no hay pantalla de acceso propia: se entra como invitado
  else app.ui.show('auth');
  /* [PORTALES] Con sesión en CrazyGames se entra con la cuenta del servidor enlazada a ese usuario (progreso guardado en el servidor).
     Sin sesión, el invitado ve «Guardar progreso», que abre el acceso de CrazyGames. */
  const P = globalThis.PPR_PORTAL;
  if (P && P.account) {
    const link = async () => {
      const cur = app.state.get().session; if (cur && cur.remote) return true;
      const a = await P.account(); if (!a) return false;
      try {
        const r = await globalThis.fetch(base + 'api/auth/crazygames', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: a.token }) });
        const j = await r.json().catch(() => ({})); if (!r.ok || !j.token) return false;
        enter(app.auth.remoteSession(j.profile && j.profile.username || a.username, j.token)); return true;
      } catch (e) { return false; }
    };
    const btn = doc.getElementById('cgLinkBtn');
    const showBtn = () => { const s = app.state.get().session; if (btn) btn.hidden = !(P.accountAvailable && P.accountAvailable() && s && s.guest); };
    if (btn) btn.addEventListener('click', async () => { btn.disabled = true; await P.login(); await link(); btn.disabled = false; showBtn(); });
    P.onAuth(u => { if (u) link().then(showBtn); });
    P.onReady(() => { link().then(showBtn); });
    app.portalLink = link;
  }
  app.legacy = legacy;
  return app;
}

// En el navegador arranca solo; en pruebas se importa sin efectos y se llama a bootstrap() a mano.
if (typeof document !== 'undefined' && !globalThis.__PPR_MANUAL_BOOT__ && !globalThis.__PPR_SHELL) {   // [MÓVIL] en el marco para móviles el juego va dentro del iframe
  const start = () => { globalThis.__ppr = bootstrap(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
