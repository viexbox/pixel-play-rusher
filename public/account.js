/* PixelPlayRusher · Mi cuenta: correo vinculado, recuperar la contraseña, cambiar contraseña o correo y eliminar la cuenta.
   El servidor decide todo (códigos, plazos, límites); aquí solo se piden los datos y se enseñan los mensajes. */
(function () {
  'use strict';
  const P = window.PPR_BP; if (!P || !P.apiUrl) return;
  const $ = s => document.querySelector(s), esc = P.esc;
  const tk = () => P.acctToken();
  async function call(method, path, body) {
    const r = await fetch(P.apiUrl('api/' + path), { method, headers: Object.assign(tk() && path !== 'auth/forgot' && path !== 'auth/reset' ? { Authorization: 'Bearer ' + tk() } : {}, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'Error ' + r.status); e.status = r.status; throw e; } return j;
  }
  let status = null; const getStatus = async () => { if (!status) { try { status = await (await fetch(P.apiUrl('api/status'), { cache: 'no-store' })).json(); } catch (e) { status = {}; } } return status; };
  const legal = p => P.apiUrl(p);

  /* ---------- Ventana ---------- */
  function ensureModal() {
    let m = $('#acModal'); if (m) return m;
    m = document.createElement('div'); m.id = 'acModal'; m.hidden = true; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.innerHTML = '<div class="acb" id="acBox"></div>'; document.body.append(m);
    m.addEventListener('mousedown', e => { if (e.target === m) close(); }); document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden) close(); }); return m;
  }
  const close = () => { const m = $('#acModal'); if (m) m.hidden = true; };
  const field = (id, label, type, extra) => '<label class="acf"><span>' + esc(label) + '</span><input id="' + id + '" type="' + (type || 'text') + '" autocomplete="off" spellcheck="false" ' + (extra || '') + '></label>';
  const val = id => ($('#' + id) ? $('#' + id).value : '');
  /* Pinta la ventana con su título, contenido y botones; cada botón: { t, cls, run(box) → devuelve un texto de error, o '' si todo bien } */
  function show(title, html, buttons) {
    const m = ensureModal(), box = $('#acBox'); box.innerHTML = '<h3>' + title + '</h3>' + html + '<p class="ace" id="acErr" role="alert"></p><p class="aco" id="acOk" role="status"></p><div class="acbtns">' + buttons.map((b, i) => '<button type="button" class="ps-btn ' + (b.cls || 'alt') + '" data-i="' + i + '">' + b.t + '</button>').join('') + '</div>'; m.hidden = false;
    box.querySelectorAll('[data-i]').forEach(bt => bt.addEventListener('click', async () => {
      const b = buttons[+bt.dataset.i]; if (!b.run) return close(); bt.disabled = true; $('#acErr').textContent = '';
      try { const msg = await b.run(); if (msg) $('#acErr').textContent = msg; } catch (e) { $('#acErr').textContent = e.message; } bt.disabled = false;
    }));
    const first = box.querySelector('input'); if (first) first.focus();
  }
  const ok = t => { const o = $('#acOk'); if (o) o.textContent = t; };

  /* =====================================================================
     ¿Has olvidado tu contraseña? (sin sesión)
     ===================================================================== */
  async function forgot(prefill) {
    const st = await getStatus(), mailOn = st.mail !== false;
    const stepEmail = () => show('Recuperar tu cuenta', '<p>' + (mailOn ? 'Escribe el correo de tu cuenta. Si está <b>verificado</b>, te enviaremos un código de 6 cifras.' : 'Este servidor no envía correos. Pide a un administrador un código de recuperación y úsalo en el siguiente paso.') + '</p>' + field('acEmail', 'Correo electrónico', 'email', 'maxlength="80" value="' + esc(prefill || '') + '"') + '<p class="acn">¿No verificaste tu correo? Entonces no podemos comprobar que la cuenta es tuya: escribe al administrador del juego.</p>',
      [{ t: 'Cancelar' }, { t: 'Ya tengo un código', run: () => { stepReset(val('acEmail')); return ''; } }, mailOn ? { t: 'Enviar código', cls: 'vip', run: async () => { const e = val('acEmail').trim(); if (!e) return 'Escribe tu correo.'; const j = await call('POST', 'auth/forgot', { email: e }); stepReset(e, j.message); return ''; } } : { t: 'Continuar', cls: 'vip', run: () => { stepReset(val('acEmail')); return ''; } }]);
    const stepReset = (email, msg) => { show('Nueva contraseña', (msg ? '<p class="aco">' + esc(msg) + '</p>' : '<p>Escribe tu correo, el código de 6 cifras y tu contraseña nueva.</p>') + field('acEmail', 'Correo electrónico', 'email', 'maxlength="80" value="' + esc(email || '') + '"') + field('acCode', 'Código de 6 cifras', 'text', 'inputmode="numeric" maxlength="6" pattern="[0-9]*"') + field('acPw', 'Contraseña nueva (8 o más, con letras y números)', 'password', 'maxlength="128"') + field('acPw2', 'Repite la contraseña', 'password', 'maxlength="128"'),
      [{ t: 'Cancelar' }, { t: 'Cambiar contraseña', cls: 'vip', run: async () => {
        if (val('acPw') !== val('acPw2')) return 'Las contraseñas no coinciden.';
        const j = await call('POST', 'auth/reset', { email: val('acEmail').trim(), code: val('acCode').trim(), password: val('acPw') });
        const id = document.querySelector('#loginForm input[name=identifier]'); if (id) id.value = j.username;
        show('¡Listo!', '<p>Tu contraseña se ha cambiado y se han cerrado todas las sesiones. Ya puedes entrar como <b>' + esc(j.username) + '</b>.</p>', [{ t: 'Entrar', cls: 'vip' }]); return '';
      } }]); };
    stepEmail();
  }

  /* =====================================================================
     Mi cuenta (con sesión)
     ===================================================================== */
  const fmtDate = t => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  async function refresh() { if (P.syncRemote) await P.syncRemote(); updateBanner(); }
  async function account() {
    if (!tk()) return; let me; try { me = await call('GET', 'me'); } catch (e) { return P.toast(e.message); }
    const pr = me.profile, mailOn = me.mail !== false;
    const main = () => {
      const pending = pr.deleteAt ? '<div class="acwarn"><b>Tu cuenta se eliminará el ' + fmtDate(pr.deleteAt) + '.</b> Hasta entonces puedes cancelarlo.</div>' : '';
      show('Mi cuenta · ' + esc(pr.username), pending +
        '<div class="acrow"><div><b>Correo</b><br>' + esc(pr.email) + ' ' + (pr.emailVerified ? '<span class="acok">✔ verificado</span>' : '<span class="acbad">⚠ sin verificar</span>') + (pr.echange ? '<br><small>Cambio pendiente a ' + esc(pr.echange) + '</small>' : '') + '</div><div class="acbt">' + (!pr.emailVerified && mailOn ? '<button class="ps-btn sm vip" data-a="verify">Verificar</button>' : '') + (mailOn ? '<button class="ps-btn sm alt" data-a="email">Cambiar</button>' : '') + '</div></div>' +
        (!pr.emailVerified ? '<p class="acn">' + (mailOn ? 'Verifica tu correo: es la única forma de <b>recuperar la cuenta</b> si olvidas la contraseña.' : 'Este servidor no envía correos: si olvidas la contraseña, pide ayuda al administrador.') + '</p>' : '') +
        '<div class="acrow"><div><b>Contraseña</b><br><small>Al cambiarla se cierran tus otras sesiones.</small></div><div class="acbt"><button class="ps-btn sm alt" data-a="pw">Cambiar</button></div></div>' +
        '<div class="acrow"><div><b>Eliminar mi cuenta</b><br><small>Se borra todo (objetos, amigos, foto, pase). Tienes ' + (me.deleteDays || 7) + ' días para arrepentirte.</small></div><div class="acbt">' + (pr.deleteAt ? '<button class="ps-btn sm vip" data-a="undel">Cancelar eliminación</button>' : '<button class="ps-btn sm red" data-a="del">Eliminar</button>') + '</div></div>' +
        '<p class="acn"><a href="' + esc(legal('terminos')) + '" target="_blank" rel="noopener">Términos de uso</a> · <a href="' + esc(legal('privacidad')) + '" target="_blank" rel="noopener">Política de privacidad</a></p>', [{ t: 'Cerrar' }]);
      $('#acBox').querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => ({ verify: verify, email: changeEmail, pw: changePw, del: del, undel: undel })[b.dataset.a]()));
    };
    const back = { t: 'Volver', run: () => { account(); return ''; } };
    const verify = async () => {
      try { const j = await call('POST', 'auth/verify/send', {}); step(j.sentTo); } catch (e) { if (e.status === 429) return step(pr.email, true); $('#acErr').textContent = e.message; }
      function step(to, again) { show('Verificar el correo', '<p>' + (again ? 'Ya te enviamos un código hace un momento. ' : '') + 'Escribe el código de 6 cifras que hemos enviado a <b>' + esc(to) + '</b> (caduca en 15 minutos).</p>' + field('acCode', 'Código', 'text', 'inputmode="numeric" maxlength="6"'),
        [back, { t: 'Enviar otro', run: async () => { await call('POST', 'auth/verify/send', {}); ok('Código enviado.'); return ''; } }, { t: 'Verificar', cls: 'vip', run: async () => { await call('POST', 'auth/verify/confirm', { code: val('acCode').trim() }); await refresh(); P.toast('¡Correo verificado!'); pr.emailVerified = true; account(); return ''; } }]); }
    };
    const changeEmail = () => show('Cambiar el correo', '<p>Escribe el correo nuevo y tu contraseña. Te enviaremos un código <b>al correo nuevo</b>.</p>' + field('acNew', 'Correo nuevo', 'email', 'maxlength="80"') + field('acPw', 'Tu contraseña', 'password', 'maxlength="128"'),
      [back, { t: 'Enviar código', cls: 'vip', run: async () => { const j = await call('POST', 'me/email', { email: val('acNew').trim(), password: val('acPw') });
        show('Confirmar el correo nuevo', '<p>Escribe el código que hemos enviado a <b>' + esc(j.sentTo) + '</b>.</p>' + field('acCode', 'Código', 'text', 'inputmode="numeric" maxlength="6"'), [back, { t: 'Confirmar', cls: 'vip', run: async () => { await call('POST', 'me/email/confirm', { code: val('acCode').trim() }); await refresh(); P.toast('Correo cambiado y verificado'); account(); return ''; } }]); return ''; } }]);
    const changePw = () => show('Cambiar la contraseña', field('acOld', 'Contraseña actual', 'password', 'maxlength="128"') + field('acPw', 'Contraseña nueva (8 o más, con letras y números)', 'password', 'maxlength="128"') + field('acPw2', 'Repite la nueva', 'password', 'maxlength="128"'),
      [back, { t: 'Cambiar', cls: 'vip', run: async () => { if (val('acPw') !== val('acPw2')) return 'Las contraseñas no coinciden.'; await call('POST', 'me/password', { old: val('acOld'), password: val('acPw') }); P.toast('Contraseña cambiada'); account(); return ''; } }]);
    const del = () => show('Eliminar la cuenta', '<div class="acwarn">Se borrará <b>todo</b>: tu nombre, correo, objetos, amigos, foto y progreso del pase. No se puede recuperar. Tienes <b>' + (me.deleteDays || 7) + ' días</b> para cancelarlo entrando en el juego.</div>' + field('acPw', 'Tu contraseña', 'password', 'maxlength="128"') + field('acConf', 'Escribe tu nombre de usuario (' + esc(pr.username) + ') para confirmar', 'text', 'maxlength="20"'),
      [back, { t: 'Eliminar mi cuenta', cls: 'red', run: async () => { const j = await call('POST', 'me/delete', { password: val('acPw'), confirm: val('acConf') }); pr.deleteAt = j.deleteAt; await refresh(); P.toast('Eliminación programada'); account(); return ''; } }]);
    const undel = async () => { try { await call('POST', 'me/delete/cancel', {}); pr.deleteAt = 0; await refresh(); P.toast('Eliminación cancelada: tu cuenta sigue como siempre'); account(); } catch (e) { $('#acErr').textContent = e.message; } };
    main();
  }

  /* ---------- Aviso en el menú ---------- */
  async function updateBanner() {
    const b = $('#mailBanner'), row = $('#accountRow'), r = P.remote && P.remote(), on = !!(tk() && r && r.username); if (row) row.hidden = !on;
    if (!b) return; if (!on) { b.hidden = true; return; } const st = await getStatus();
    if (r.deleteAt) { b.hidden = false; b.className = 'mail-banner bad'; b.innerHTML = '⚠ Tu cuenta se eliminará el ' + esc(fmtDate(r.deleteAt)) + '. <button type="button" class="ps-btn sm vip" data-a="account">Cancelar eliminación</button>'; }
    else if (st.mail && r.emailVerified === false) { b.hidden = false; b.className = 'mail-banner'; b.innerHTML = '📧 Verifica tu correo para poder recuperar tu cuenta si olvidas la contraseña. <button type="button" class="ps-btn sm vip" data-a="account">Verificar ahora</button>'; }
    else b.hidden = true;
  }
  document.addEventListener('click', e => {
    if (e.target.closest('#forgotBtn')) { e.preventDefault(); const id = document.querySelector('#loginForm input[name=identifier]'); forgot(id && /@/.test(id.value) ? id.value : ''); }
    else if (e.target.closest('#accountBtn, #mailBanner [data-a=account]')) account();
    else { const a = e.target.closest('a[href="terminos"], a[href="privacidad"]'); if (a) { e.preventDefault(); window.open(legal(a.getAttribute('href')), '_blank', 'noopener'); } }
  });
  setInterval(updateBanner, 3000); setTimeout(updateBanner, 800);
  Object.assign(P, { openAccount: account, openForgot: forgot });
})();
