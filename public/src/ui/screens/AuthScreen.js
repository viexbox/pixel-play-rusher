/* Pantalla de acceso: Entrar | Registro | Entrar como invitado.
   Validación con la API nativa de formularios (setCustomValidity) y mensajes visibles junto a cada campo. */
import { validateLogin, validateRegister } from '../../api/authService.js';

const TEMPLATE = `
<div class="auth-panel">
  <h2 id="authTitle" class="auth-logo">PIXEL PLAY <b>RUSHER</b></h2>
  <p class="auth-tag">Arena de disparos por bloques</p>
  <div class="auth-tabs" role="tablist" aria-label="Acceso">
    <button type="button" role="tab" id="tabLogin" data-tab="login" aria-selected="true" aria-controls="loginForm">Entrar</button>
    <button type="button" role="tab" id="tabRegister" data-tab="register" aria-selected="false" aria-controls="registerForm">Registro</button>
  </div>

  <form id="loginForm" class="auth-form" novalidate autocomplete="on" aria-labelledby="tabLogin">
    <label class="af"><span>Usuario o correo</span>
      <input name="identifier" type="text" required maxlength="80" autocomplete="username" spellcheck="false" autocapitalize="off">
      <small class="err" data-err="identifier" role="alert"></small></label>
    <label class="af"><span>Contraseña</span>
      <span class="pw"><input name="password" type="password" required maxlength="128" autocomplete="current-password"><button type="button" class="pw-toggle" aria-label="Mostrar u ocultar la contraseña">Mostrar</button></span>
      <small class="err" data-err="password" role="alert"></small></label>
    <label class="chk"><input name="remember" type="checkbox" checked><span>Recordarme en este dispositivo</span></label>
    <p class="auth-msg" data-msg role="alert"></p>
    <button type="submit" class="auth-submit">Entrar</button>
  </form>

  <form id="registerForm" class="auth-form" novalidate autocomplete="on" aria-labelledby="tabRegister" hidden>
    <label class="af"><span>Nombre de usuario</span>
      <input name="username" type="text" required minlength="3" maxlength="14" autocomplete="username" spellcheck="false" autocapitalize="off">
      <small class="err" data-err="username" role="alert"></small></label>
    <label class="af"><span>Correo electrónico</span>
      <input name="email" type="email" required maxlength="80" autocomplete="email" spellcheck="false">
      <small class="err" data-err="email" role="alert"></small></label>
    <label class="af"><span>Contraseña</span>
      <span class="pw"><input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"><button type="button" class="pw-toggle" aria-label="Mostrar u ocultar la contraseña">Mostrar</button></span>
      <small class="err" data-err="password" role="alert"></small></label>
    <label class="af"><span>Repite la contraseña</span>
      <input name="password2" type="password" required maxlength="128" autocomplete="new-password">
      <small class="err" data-err="password2" role="alert"></small></label>
    <p class="auth-msg" data-msg role="alert"></p>
    <button type="submit" class="auth-submit">Crear cuenta</button>
  </form>

  <div class="auth-sep"><span>o</span></div>
  <button type="button" id="guestBtn" class="auth-guest">Entrar como invitado</button>
  <p class="auth-note">Demostración: las cuentas se guardan solo en este navegador y no se comparten entre dispositivos.</p>
</div>`;

export function createAuthScreen({ doc, auth, onAuthenticated }) {
  let el = null, tab = 'login', busy = false, touched = { login: false, register: false };
  const BACKGROUND = ['menu', 'chat', 'chatTab'];

  const form = name => el.querySelector('#' + name + 'Form');
  const values = f => {
    const v = {}; for (const i of f.elements) if (i.name) v[i.name] = i.type === 'checkbox' ? i.checked : i.value;
    return v;
  };
  function setErr(f, field, msg) {
    const input = f.elements[field]; if (!input) return;
    input.setCustomValidity(msg || ''); input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const out = f.querySelector('[data-err="' + field + '"]'); if (out) out.textContent = msg || '';
  }
  function setMsg(f, msg) { f.querySelector('[data-msg]').textContent = msg || ''; }
  function validate(which, f) {
    const errs = which === 'login' ? validateLogin(values(f)) : validateRegister(values(f));
    const fields = which === 'login' ? ['identifier', 'password'] : ['username', 'email', 'password', 'password2'];
    let first = null;
    for (const name of fields) { setErr(f, name, errs[name] || ''); if (errs[name] && !first) first = name; }
    return first;
  }
  function setBusy(on, label) {
    busy = on;
    for (const b of el.querySelectorAll('button, input')) { if (on) b.setAttribute('disabled', ''); else b.removeAttribute('disabled'); }
    const s = form(tab).querySelector('.auth-submit');
    s.textContent = on ? label : (tab === 'login' ? 'Entrar' : 'Crear cuenta');
  }
  function setTab(name) {
    tab = name;
    for (const b of el.querySelectorAll('[role="tab"]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    form('login').hidden = name !== 'login'; form('register').hidden = name !== 'register';
    for (const f of [form('login'), form('register')]) setMsg(f, '');
    const first = form(name).querySelector('input'); if (first) first.focus();
  }
  function background(lock) {
    for (const id of BACKGROUND) { const n = doc.getElementById(id); if (!n) continue; if (lock) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); } else { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); } }
  }
  function finish(session) {
    for (const f of [form('login'), form('register')]) { f.reset(); for (const n of ['identifier', 'password', 'username', 'email', 'password2']) setErr(f, n, ''); setMsg(f, ''); }
    touched = { login: false, register: false };
    onAuthenticated(session);
  }
  function showFail(which, f, error) {
    if (error.field && f.elements[error.field]) { setErr(f, error.field, error.message); f.elements[error.field].focus(); }
    else setMsg(f, error.message);
  }
  async function submit(which, ev) {
    ev.preventDefault(); if (busy) return;
    const f = form(which); touched[which] = true; setMsg(f, '');
    const bad = validate(which, f); if (bad) { f.elements[bad].focus(); return; }
    const v = values(f);
    setBusy(true, which === 'login' ? 'Entrando…' : 'Creando cuenta…');
    let r;
    try { r = which === 'login' ? await auth.login(v) : await auth.register(v); }
    catch (e) { r = { ok: false, error: { message: 'No se pudo completar la operación. Inténtalo de nuevo.' } }; }
    setBusy(false, '');
    if (!r.ok) { showFail(which, f, r.error); return; }
    finish(r.session);
  }

  return {
    mount(root) {
      el = doc.createElement('div'); el.id = 'auth'; el.className = 'auth-overlay'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'authTitle');
      el.innerHTML = TEMPLATE; root.appendChild(el);
      for (const b of el.querySelectorAll('[role="tab"]')) b.addEventListener('click', () => { if (!busy) setTab(b.dataset.tab); });
      form('login').addEventListener('submit', ev => submit('login', ev));
      form('register').addEventListener('submit', ev => submit('register', ev));
      // validación en vivo una vez que se ha intentado enviar
      for (const which of ['login', 'register']) form(which).addEventListener('input', () => { if (touched[which]) validate(which, form(which)); });
      for (const t of el.querySelectorAll('.pw-toggle')) t.addEventListener('click', () => {
        const input = t.parentElement.querySelector('input'), show = input.type === 'password';
        input.type = show ? 'text' : 'password'; t.textContent = show ? 'Ocultar' : 'Mostrar';
      });
      el.querySelector('#guestBtn').addEventListener('click', () => { if (busy) return; const r = auth.guest(); if (r.ok) finish(r.session); });
    },
    show() { el.hidden = false; background(true); setTab(tab); },
    hide() { el.hidden = true; background(false); }
  };
}
