/* Krunxa · Perfil de jugador, amigos y Mercado de cosméticos.
   Usa window.PPR_BP (catálogo compartido y utilidades de client.js/bp.js). El servidor decide todo; aquí solo se dibuja y se piden las acciones.
   Cuentas online: perfil propio y ajeno, foto (16 predefinidas o imagen propia reducida a 128×128), estado, amigos, bloqueos, denuncias y mercado con Créditos. */
(function () {
  'use strict';
  const P = window.PPR_BP; if (!P || !P.S || !P.describe) return;
  const S = P.S, esc = P.esc, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], fmt = n => Number(n).toLocaleString('es-ES');
  const tk = () => P.acctToken();

  /* ---------- API ---------- */
  async function api(method, path, body) {
    const r = await fetch(P.apiUrl(path), { method, headers: Object.assign(tk() ? { Authorization: 'Bearer ' + tk() } : {}, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error ' + r.status); return j;
  }

  /* ---------- Piezas visuales ---------- */
  const PAL = ['#ff5a5f', '#ffb020', '#ffdc3a', '#37f29a', '#38e4ff', '#4aa8ff', '#8b5cf6', '#ff5bd1', '#f0f4ff', '#ff8a3d', '#22c08a', '#7a9bff', '#e04b6a', '#c4a35a', '#5ad1b0', '#b56cff'];
  /* Foto predefinida: un «identicon» simétrico de 5×5 con el color de su número (siempre el mismo dibujo para el mismo número) */
  function presetSvg(id, px) {
    let h = (id * 2654435761 + 12345) >>> 0; const cell = [], c = PAL[id % PAL.length];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) { h = (h * 1103515245 + 12345) >>> 0; cell[y * 5 + x] = (h >>> 16) & 1; cell[y * 5 + 4 - x] = cell[y * 5 + x]; }
    let r = ''; for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (cell[y * 5 + x]) r += '<rect x="' + (x * 4 + 2) + '" y="' + (y * 4 + 2) + '" width="4" height="4"/>';
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" aria-hidden="true"><rect width="24" height="24" fill="#10152b"/><g fill="' + c + '">' + r + '</g></svg>';
  }
  const avatarHtml = (a, px) => !a ? presetSvg(0, px) : a.kind === 'custom' ? '<img src="' + esc(a.preview || (/^https?:\/\//.test(a.url) ? a.url : P.apiUrl(a.url))) + '" width="' + px + '" height="' + px + '" alt="" style="object-fit:cover;display:block">' : presetSvg(a.id, px);
  const TICKS = { admin: 'Administrador verificado', inf: 'Influencer verificado', acc: 'Cuenta verificada' };
  const tick = v => v ? '<svg class="vtick" viewBox="0 0 24 24" role="img" aria-label="' + TICKS[v] + '"><title>' + TICKS[v] + '</title><path d="M12 2l2.4 2 3.1-.3 1 3 2.6 1.7-.9 3 .9 3-2.6 1.7-1 3-3.1-.3L12 22l-2.4-2-3.1.3-1-3L2.9 15.6l.9-3-.9-3 2.6-1.7 1-3 3.1.3z" fill="#2aa1ff"/><path d="M8 12.2l2.6 2.6L16 9.4" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
  /* [VERIFICADOS] nombre dorado brillante + tic, igual que en la partida (antes en el perfil y en la lista de amigos solo salía el tic) */
  const vname = u => u.verified ? '<span class="rl-admin">' + esc(u.username) + '</span>' + tick(u.verified) : esc(u.username);
  const ONLINE = { game: ['En partida', '#37f29a'], lobby: ['En el menú', '#ffdc3a'], off: ['Desconectado', '#6b7590'] };

  /* ---------- Ventana de diálogo ---------- */
  function modal(html, buttons) {
    return new Promise(res => {
      const m = $('#soModal'), box = $('#soBox'); box.innerHTML = html + '<div class="err" id="soErr"></div><div class="btns">' + buttons.map((b, i) => '<button type="button" class="ps-btn ' + (b.cls || 'alt') + '" data-b="' + i + '">' + b.t + '</button>').join('') + '</div>'; m.hidden = false;
      const done = v => { m.hidden = true; res(v); };
      box.querySelectorAll('[data-b]').forEach(bt => bt.addEventListener('click', async () => { const b = buttons[+bt.dataset.b]; if (!b.run) return done(null); bt.disabled = true; const e = await b.run(box); if (e) { $('#soErr').textContent = e; bt.disabled = false; } else done(true); }));
      m.onclick = e => { if (e.target === m) done(null); };
    });
  }

  /* =====================================================================
     PERFIL
     ===================================================================== */
  let me = null, cur = null, side = 'friends', social = null;       // me: mi perfil; cur: el que se está viendo
  const meName = () => { const r = P.remote(); return r ? r.username : ''; };

  async function refreshSocial() { if (!tk()) { social = null; return; } try { social = await api('GET', 'api/social'); } catch (e) { social = null; } }
  async function loadProfile(name) { const j = await api('GET', 'api/profile?name=' + encodeURIComponent(name)); return j.profile; }

  function cardHtml(p) {
    const own = p.relation === 'self', b = p.banner && S.BANNERS.find(x => x.id === p.banner), on = p.online && ONLINE[p.online], st = p.stats;
    const acts = own ? '<button class="ps-btn" data-a="editphoto">Cambiar foto</button><button class="ps-btn alt" data-a="editstatus">Cambiar estado</button><button class="ps-btn alt" data-a="rename">Cambiar nombre</button><button class="ps-btn alt" data-a="account">Mi cuenta</button>'
      : !tk() ? '<span class="pf-hint">Inicia sesión para añadir amigos.</span>'
      : { none: '<button class="ps-btn" data-a="request">Añadir amigo</button>', 'pending-out': '<button class="ps-btn alt" data-a="cancel">Cancelar solicitud</button>', 'pending-in': '<button class="ps-btn" data-a="accept">Aceptar solicitud</button><button class="ps-btn alt" data-a="decline">Rechazar</button>',
          friend: (P.partyInvite ? '<button class="ps-btn" data-a="pinv">Invitar al grupo</button>' : '') + '<button class="ps-btn" data-a="trade">Proponer intercambio</button><button class="ps-btn alt" data-a="remove">Eliminar amigo</button>', blocked: '<button class="ps-btn alt" data-a="unblock">Desbloquear</button>' }[p.relation] + (p.relation !== 'blocked' ? '<button class="ps-btn ghost" data-a="block">Bloquear</button>' : '') + '<button class="ps-btn ghost" data-a="report">Denunciar</button>';
    return (b ? '<div class="pf-banner" style="--b1:' + b.c1 + ';--b2:' + b.c2 + '"><b>' + esc(b.tag) + '</b> ' + esc(b.n.toUpperCase()) + '</div>' : '<div class="pf-banner none"></div>') +
      '<div class="pf-head"><div class="pf-av' + (own ? ' own' : '') + '" ' + (own ? 'data-a="editphoto" title="Cambiar foto"' : '') + '>' + avatarHtml(p.avatar, 96) + '</div><div class="pf-id"><h2>' + vname(p) + '</h2>' +
      '<div class="pf-tags"><span class="pf-rank" style="--c:' + p.rank.col + '">' + esc(p.rank.n) + '</span><span>Pase nivel <b>' + p.bpLevel + '</b>' + (p.bpVip ? ' · VIP' : '') + '</span><span>' + fmt(p.points) + ' pts</span><span>' + p.friends + ' amigos</span>' + (p.ranked && p.ranked.league ? '<span class="pf-rank" style="--c:' + p.ranked.col + '" title="Liga del clasificatorio">Liga ' + esc(p.ranked.league) + '</span>' : '') + ((p.ranked && p.ranked.badges) || []).map(b => '<span class="pf-rank" style="--c:' + (b.col || '#9aa4b8') + '" title="Insignia de la temporada ' + b.s + '">T' + b.s + ' · ' + esc(b.l) + '</span>').join('') + '</div>' +
      '<p class="pf-status">' + (p.status ? esc(p.status) : '<i>Sin estado</i>') + '</p>' + (own && p.avatar.status === 'pending' ? '<small class="pf-hint">📷 Tu foto está en revisión: solo tú la ves hasta que se apruebe.</small>' : '') + (own && p.note ? '<small class="pf-hint" style="color:#ff8b98">' + esc(p.note) + '</small>' : '') + (on ? '<small class="pf-on" style="--c:' + on[1] + '">● ' + on[0] + '</small>' : '') + '</div></div>' +
      '<div class="pf-stats">' + [['Partidas', st.games], ['Bajas', st.kills], ['K/D', st.kd], ['Victorias', st.wins], ['Mejor partida', st.best], ['Mejor racha', st.streak]].map(x => '<div><b>' + fmt(x[1]) + '</b><span>' + x[0] + '</span></div>').join('') + '</div>' +
      '<div class="pf-actions">' + acts + '</div><div class="pf-edit" id="pfEdit" hidden></div>';
  }
  function renderCard() { const el = $('#pfCard'); if (!cur) { el.innerHTML = '<p class="pf-hint" style="padding:30px">Elige un jugador de la lista o búscalo por su nombre.</p>'; return; } el.innerHTML = cardHtml(cur); }

  function renderSide() {
    const el = $('#pfList'); $$('#pfTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === side));
    if (!tk()) { el.innerHTML = '<p class="pf-hint">Inicia sesión con una cuenta online para tener amigos.</p>'; $('#pfReqN').textContent = ''; return; }
    if (!social) { el.innerHTML = '<p class="pf-hint">Cargando…</p>'; return; }
    $('#pfReqN').textContent = social.incoming.length ? social.incoming.length : '';
    const row = (u, extra) => '<div class="pf-row" data-name="' + esc(u.username) + '"><span class="pf-mini">' + avatarHtml(u.avatar, 36) + '</span><span class="pf-rn"><b>' + vname(u) + '</b><small>' + (u.online ? '<i style="color:' + ONLINE[u.online][1] + '">●</i> ' + ONLINE[u.online][0] : esc(u.rank.n)) + '</small></span>' + (extra || '') + '</div>';
    if (side === 'friends') el.innerHTML = social.friends.length ? social.friends.map(u => row(u, u.online && P.partyInvite ? '<button class="ps-btn sm" data-q="pinv" title="Invitar al grupo">Invitar</button>' : '')).join('') : '<p class="pf-hint">Aún no tienes amigos. Abre el perfil de un jugador y pulsa «Añadir amigo».</p>';
    else if (side === 'req') el.innerHTML = (social.incoming.length ? '<h4>Recibidas</h4>' + social.incoming.map(u => row(u, '<button class="ps-btn sm" data-q="accept">Aceptar</button><button class="ps-btn sm alt" data-q="decline">✕</button>')).join('') : '') +
      (social.outgoing.length ? '<h4>Enviadas</h4>' + social.outgoing.map(u => row(u, '<button class="ps-btn sm alt" data-q="cancel">Cancelar</button>')).join('') : '') || '<p class="pf-hint">No hay solicitudes pendientes.</p>';
    else el.innerHTML = social.blocked.length ? social.blocked.map(u => row(u, '<button class="ps-btn sm alt" data-q="unblock">Desbloquear</button>')).join('') : '<p class="pf-hint">No has bloqueado a nadie.</p>';
  }

  async function show(name) { try { cur = await loadProfile(name); if (cur.relation === 'self') me = cur; } catch (e) { P.toast(e.message); return; } renderCard(); }
  async function openProfile(name) {
    $('#profileScreen').hidden = false; await refreshSocial(); renderSide();
    const n = name || meName(); if (n) await show(n); else { cur = null; renderCard(); }
  }
  function closeProfile() { $('#profileScreen').hidden = true; P.showTab('home'); }

  /* Reducir una imagen a 128×128 (recortando al centro) y comprimirla: pesa unos KB y nunca pasa del límite del servidor (60 KB) */
  function shrink(file) {
    return new Promise((res, rej) => {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return rej(new Error('Elige una imagen (JPG, PNG, WebP o GIF).'));
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), s = Math.min(im.width, im.height); g.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 128, 128); res(c.toDataURL('image/jpeg', 0.85)); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer esa imagen.')); }; im.src = url;
    });
  }
  async function setAvatar(body) { try { const j = await api('POST', 'api/social/avatar', body); await show(meName()); P.toast(j.status === 'pending' ? 'Foto enviada: se verá para los demás cuando se revise. Mientras, solo la ves tú.' : 'Foto actualizada'); applyMyAvatar(); } catch (e) { P.toast(e.message); } }
  function editPhoto() {
    const box = $('#pfEdit'); box.hidden = !box.hidden; if (box.hidden) return;
    box.innerHTML = '<h4>Elige tu foto</h4><div class="pf-presets">' + PAL.map((_, i) => '<button type="button" data-p="' + i + '" aria-label="Foto ' + (i + 1) + '">' + presetSvg(i, 44) + '</button>').join('') + '</div>' +
      '<div class="pf-up"><label class="ps-btn alt">Subir una imagen<input type="file" id="pfFile" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label><button type="button" class="ps-btn ghost" data-p="remove">Quitar foto</button></div><small class="pf-hint">Se recorta al centro y se reduce a 128×128. No subas imágenes que no puedas compartir: cualquiera puede verla y se puede denunciar.</small>';
  }
  async function editStatus() {
    const me0 = cur && cur.status || '';
    await modal('<h3>Tu estado</h3><p>Una frase corta (máx. 40 caracteres) que verán en tu perfil.</p><input type="text" id="soIn" maxlength="40" value="' + esc(me0) + '" placeholder="Ej.: Buscando equipo">', [{ t: 'Cancelar' }, { t: 'Guardar', cls: 'vip', run: async box => { try { await api('POST', 'api/social/status', { status: box.querySelector('#soIn').value }); await show(meName()); return ''; } catch (e) { return e.message; } } }]);
  }
  async function reportPlayer(name) {
    await modal('<h3>Denunciar a ' + esc(name) + '</h3><label>Motivo<select id="soCat"><option value="foto">Foto de perfil inapropiada</option><option value="nombre">Nombre inapropiado</option><option value="estado">Estado ofensivo</option><option value="trampas">Trampas</option><option value="insultos">Insultos</option><option value="otro">Otro</option></select></label><input type="text" id="soIn" maxlength="200" placeholder="Detalles (opcional)">',
      [{ t: 'Cancelar' }, { t: 'Enviar denuncia', cls: 'vip', run: async box => { try { await api('POST', 'api/social/report', { name, cat: box.querySelector('#soCat').value, text: box.querySelector('#soIn').value }); P.toast('Denuncia enviada. Gracias.'); return ''; } catch (e) { return e.message; } } }]);
  }
  async function act(a) {
    if (!cur) return; const name = cur.username;
    if (a === 'editphoto') return editPhoto(); if (a === 'editstatus') return editStatus();
    if (a === 'rename') { const rb = $('#renameBtn'); if (rb) { closeProfile(); rb.click(); } return; }
    if (a === 'account') { closeProfile(); return P.openAccount && P.openAccount(); }
    if (a === 'report') return reportPlayer(name);
    if (a === 'pinv') { if (P.partyInvite) P.partyInvite(name); return; }   // [GRUPOS]
    if (a === 'trade') { closeProfile(); await openMarket(); toggleTrades(true); return proposeTrade(name); }
    if (a === 'block' && !window.confirm('¿Bloquear a ' + name + '? Se romperá la amistad y no podrá enviarte solicitudes.')) return;
    if (a === 'remove' && !window.confirm('¿Eliminar a ' + name + ' de tus amigos?')) return;
    try { await api('POST', 'api/social/' + a, { name }); await refreshSocial(); renderSide(); await show(name); } catch (e) { P.toast(e.message); }
  }
  function initProfile() {
    $('#pfClose').addEventListener('click', closeProfile);
    $('#pfCard').addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (b) return act(b.dataset.a);
      const p = e.target.closest('[data-p]'); if (p) return setAvatar(p.dataset.p === 'remove' ? { remove: true } : { preset: +p.dataset.p });
    });
    $('#pfCard').addEventListener('change', async e => { if (e.target.id !== 'pfFile' || !e.target.files[0]) return; try { await setAvatar({ image: await shrink(e.target.files[0]) }); } catch (er) { P.toast(er.message); } });
    $('#pfTabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { side = b.dataset.t; renderSide(); } });
    $('#pfList').addEventListener('click', async e => {
      const row = e.target.closest('.pf-row'); if (!row) return; const name = row.dataset.name, q = e.target.closest('[data-q]');
      if (q && q.dataset.q === 'pinv') { if (P.partyInvite) P.partyInvite(name); return; }   // [GRUPOS]
      if (q) { try { await api('POST', 'api/social/' + q.dataset.q, { name }); await refreshSocial(); renderSide(); if (cur && cur.username === name) await show(name); } catch (er) { P.toast(er.message); } return; }
      show(name);
    });
    const find = () => { const v = $('#pfFind').value.trim(); if (v) show(v); };
    $('#pfFindBtn').addEventListener('click', find); $('#pfFind').addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
    $$('.nav button[data-tab=profile]').forEach(b => b.addEventListener('click', () => openProfile()));
    const av = $('#avatar'); if (av) { av.style.cursor = 'pointer'; av.addEventListener('click', () => { if (tk()) openProfile(); }); }
    /* Clic en un nombre de la clasificación (u otro sitio con data-profile) abre su perfil */
    document.addEventListener('click', e => { const a = e.target.closest('[data-profile]'); if (a) { e.preventDefault(); openProfile(a.dataset.profile); } });
  }
  /* La foto propia también se ve en la tarjeta del menú principal */
  async function applyMyAvatar() {
    const av = $('#avatar'); if (!av) return;
    if (!tk() || !meName()) { av.textContent = 'P'; av.classList.remove('has'); return; }
    try { const p = await loadProfile(meName()); me = p; av.innerHTML = avatarHtml(p.avatar, 46); av.classList.add('has'); } catch (e) { /* sin conexión */ }
  }

  /* =====================================================================
     MERCADO
     ===================================================================== */
  let mk = null;   // última respuesta del mercado
  const q = () => new URLSearchParams({ t: $('#mkType').value, r: $('#mkRar').value, sort: $('#mkSort').value, q: $('#mkQ').value.trim(), mine: $('#mkMine').checked ? '1' : '' });
  async function loadMarket() {
    try { mk = await api('GET', 'api/market?' + q()); P.setCr(mk.credits); } catch (e) { mk = null; $('#mkGrid').innerHTML = '<p class="pf-hint" style="padding:30px">' + esc(e.message) + '</p>'; return; }
    $('#mkCr').textContent = fmt(mk.credits) + ' CR';
    $('#mkGrid').innerHTML = mk.listings.length ? mk.listings.map(l => {
      const isC = l.t === 'color', d = isC ? { rar: S.RARITY[l.rarity], svg: '<svg viewBox="0 0 60 40"><circle cx="30" cy="20" r="16" fill="' + esc(l.hex) + '" stroke="#fff" stroke-opacity=".5" stroke-width="2"/></svg>', kind: 'Color de personaje' } : P.describe({ t: l.t, id: l.item }), mine = l.mine;
      return '<div class="mk-card" style="--rc:' + d.rar.c + '"><span class="rar">' + esc(d.rar.n.toUpperCase()) + '</span><div class="prev">' + d.svg + '</div><b class="nm">' + esc(l.name) + '</b><span class="kind">' + esc(d.kind) + '</span>' +
        '<span class="seller">de ' + esc(l.seller) + '</span>' + refTag(l) + '<div class="price">' + fmt(l.price) + ' <small>CR</small></div>' + (mine ? '<button class="ps-btn alt sm" data-c="' + l.id + '">Retirar</button>' : '<button class="ps-btn sm" data-b="' + l.id + '"' + (mk.credits < l.price ? ' disabled title="Te faltan ' + fmt(l.price - mk.credits) + ' CR"' : '') + '>Comprar</button>') + '</div>';
    }).join('') : '<p class="pf-hint" style="padding:30px">No hay anuncios con estos filtros.</p>';
  }
  /* Etiqueta con el precio de referencia (media de las ventas de los últimos 30 días): barato, normal o caro */
  const refTag = l => !l.ref ? '<span class="ref">sin ventas aún</span>' : '<span class="ref ' + (l.price <= l.ref.avg * 0.75 ? 'lo' : l.price >= l.ref.avg * 1.5 ? 'hi' : '') + '" title="Últimas ' + l.ref.n + ' venta(s): entre ' + fmt(l.ref.min) + ' y ' + fmt(l.ref.max) + ' CR">media ' + fmt(l.ref.avg) + ' CR' + (l.price <= l.ref.avg * 0.75 ? ' · barato' : l.price >= l.ref.avg * 1.5 ? ' · caro' : '') + '</span>';
  async function openMarket() { $('#marketScreen').hidden = false; if (!tk()) { $('#mkGrid').innerHTML = '<p class="pf-hint" style="padding:30px">Inicia sesión con una cuenta online para comprar y vender.</p>'; $('#mkCr').textContent = ''; return; } await P.load(); await loadMarket(); loadTrades(); }
  function closeMarket() { $('#marketScreen').hidden = true; toggleTrades(false); P.showTab('home'); }
  async function buy(id) {
    const l = mk && mk.listings.find(x => x.id === id); if (!l) return;
    await modal('<h3>Comprar ' + esc(l.name) + '</h3><p>Se te cobrarán <b>' + fmt(l.price) + ' CR</b> a ' + esc(l.seller) + '. Ahora tienes ' + fmt(mk.credits) + ' CR.</p>', [{ t: 'Cancelar' }, { t: 'Comprar', cls: 'vip', run: async () => { try { const j = await api('POST', 'api/market/buy', { id }); P.apply(j.state); P.setCr(j.credits); P.toast('¡' + j.name + ' es tuyo!'); return ''; } catch (e) { return e.message; } } }]);
    loadMarket();
  }
  async function cancelListing(id) { try { const j = await api('POST', 'api/market/cancel', { id }); P.apply(j.state); P.toast('Anuncio retirado'); } catch (e) { P.toast(e.message); } loadMarket(); }
  let sellItems = [];   // lo que se puede vender ahora, en el mismo orden que el desplegable
  const lockText = ms => { const h = Math.ceil(ms / 3600000); return h >= 1 ? h + ' h' : Math.max(1, Math.ceil(ms / 60000)) + ' min'; };
  const lockOf = (ts, lockMs) => (lockMs && ts && Date.now() - ts < lockMs ? ts + lockMs - Date.now() : 0);
  function sellable() {   // objetos del pase + colores de pago, cada uno con lo que le queda de bloqueo
    const st = P.state, rm = P.remote(), lockMs = mk ? mk.lock : 0, out = [];
    for (const i of (st ? st.inventory : [])) { const d = P.describe({ t: i.t, id: i.id }); if (d && d.id !== 'k_clasico') out.push({ i, d, lock: lockOf(i.ts, lockMs) }); }
    for (const c of (rm ? rm.unlocked : [])) if (S.COLOR_COSTS[c] > 0) out.push({ i: { t: 'color', id: String(c), ts: (rm.colorTs || {})[c] || 0 }, d: { name: 'Color ' + S.COLOR_NAMES[c], rar: S.RARITY[S.colorRarity(c)] }, lock: lockOf((rm.colorTs || {})[c], lockMs) });
    return out.sort((a, b) => !!a.lock - !!b.lock || b.d.rar.ord - a.d.rar.ord || a.d.name.localeCompare(b.d.name));
  }
  async function sell() {
    if (!P.state) return P.toast('Inicia sesión primero.');
    const items = sellItems = sellable();
    if (!items.length) return P.toast('No tienes objetos para vender. Consigue skins en el Pase de batalla o compra colores.');
    const opts = items.map((x, n) => '<option value="' + n + '"' + (x.lock ? ' disabled' : '') + '>' + esc(x.d.name) + ' · ' + esc(x.d.rar.n) + (x.lock ? ' · 🔒 ' + lockText(x.lock) : '') + '</option>').join('');
    const first = Math.max(0, items.findIndex(x => !x.lock));
    await modal('<h3>Vender un objeto</h3><label>Objeto<select id="soItem">' + opts + '</select></label><p class="pf-hint">🔒 Los objetos nuevos (del pase, comprados o recibidos) se bloquean unas horas antes de poder venderse.</p><label>Precio en Créditos<input type="number" id="soPrice" min="1" step="1"></label><p id="soHint" class="pf-hint"></p><p id="soNet" class="pf-hint"></p>',
      [{ t: 'Cancelar' }, { t: 'Anunciar', cls: 'vip', run: async box => {
        const x = items[+box.querySelector('#soItem').value], price = Math.trunc(+box.querySelector('#soPrice').value); if (!(price > 0)) return 'Escribe un precio.';
        try { const j = await api('POST', 'api/market/list', { t: x.i.t, item: x.i.id, price }); P.apply(j.state); if (x.i.t === 'color' && P.syncRemote) await P.syncRemote(); P.toast('Anunciado. Cobrarás ' + fmt(j.net) + ' CR si se vende.'); return ''; } catch (e) { return e.message; } } }]);
    const sel = $('#soItem'); if (sel) { sel.selectedIndex = first; sel.dispatchEvent(new Event('input', { bubbles: true })); }
    loadMarket();
  }
  let hintTok = 0;
  document.addEventListener('input', async e => {
    if (!['soPrice', 'soItem'].includes(e.target.id)) return; const box = $('#soBox'), sel = box.querySelector('#soItem'), pr = box.querySelector('#soPrice'); if (!sel || !pr) return;
    const it = sellItems[+sel.value], price = Math.trunc(+pr.value) || 0, fee = Math.floor(price * S.MARKET.FEE);
    const rk = it && Object.keys(S.RARITY).find(k => S.RARITY[k].n === it.d.rar.n);
    $('#soNet').textContent = 'Comisión del ' + Math.round(S.MARKET.FEE * 100) + ' %: cobrarías ' + fmt(Math.max(0, price - fee)) + ' CR' + (rk ? ' · precio mínimo ' + fmt(S.MARKET.MIN_PRICE[rk]) + ' CR' : '');
    if (e.target.id === 'soItem' && it) {   // precio de referencia de ese objeto
      const tok = ++hintTok, h = $('#soHint'); h.textContent = 'Mirando las últimas ventas…';
      try { const j = await api('GET', 'api/market/price?t=' + it.i.t + '&item=' + encodeURIComponent(it.i.id)); if (tok !== hintTok || !$('#soHint')) return; $('#soHint').textContent = j.ref ? 'Últimas ventas (30 días): media ' + fmt(j.ref.avg) + ' CR · entre ' + fmt(j.ref.min) + ' y ' + fmt(j.ref.max) + ' · última ' + fmt(j.ref.last) + ' CR (' + j.ref.n + ' venta' + (j.ref.n > 1 ? 's' : '') + ').' : 'Todavía no se ha vendido ninguno: tú pones el precio.'; }
      catch (er) { if ($('#soHint')) $('#soHint').textContent = ''; }
    }
  });
  /* ---------- Intercambios directos entre amigos ---------- */
  let trades = null, tradeView = false;
  const rarC = k => (S.RARITY[k] || S.RARITY.comun).c;
  const itemChip = it => '<span class="tr-it" style="--rc:' + rarC(it.rarity) + '">' + esc(it.name) + '</span>';
  async function loadTrades() {
    try { trades = await api('GET', 'api/trades'); } catch (e) { trades = null; }
    const n = trades ? trades.incoming.length : 0; $('#mkTradeN').textContent = n ? n : ''; if (tradeView) renderTrades();
  }
  function renderTrades() {
    const el = $('#mkTrades'); if (!trades) { el.innerHTML = '<p class="pf-hint" style="padding:20px">No se pudieron cargar los intercambios.</p>'; return; }
    const row = (o, btns) => '<div class="tr-row"><span><b>' + esc(o.mine ? 'Tú' : o.from) + '</b> ' + (o.mine ? 'das' : 'da') + ' ' + itemChip(o.give) + ' y ' + (o.mine ? 'pides a <b>' + esc(o.to) + '</b>' : 'pide') + ' ' + itemChip(o.want) + '</span><span class="tr-b">' + btns + '</span></div>';
    el.innerHTML = '<div class="tr-head"><button type="button" class="ps-btn" data-tr="new">Proponer un intercambio</button><small class="pf-hint">Solo con tus amigos, objeto por objeto (skins, cuchillos y banners). Caduca a las 48 h. Lo que recibes queda bloqueado unas horas.</small></div>' +
      '<h4>Recibidas</h4>' + (trades.incoming.length ? trades.incoming.map(o => row(o, '<button class="ps-btn sm" data-tr="accept" data-id="' + o.id + '">Aceptar</button><button class="ps-btn sm alt" data-tr="decline" data-id="' + o.id + '">Rechazar</button>')).join('') : '<p class="pf-hint">No tienes propuestas pendientes.</p>') +
      '<h4>Enviadas</h4>' + (trades.outgoing.length ? trades.outgoing.map(o => row(o, '<button class="ps-btn sm alt" data-tr="cancel" data-id="' + o.id + '">Cancelar</button>')).join('') : '<p class="pf-hint">No has enviado ninguna.</p>') +
      (trades.recent.length ? '<h4>Recientes</h4>' + trades.recent.map(o => row(o, '<span class="tr-st ' + o.status + '">' + ({ done: 'Hecho', declined: 'Rechazada', cancelled: 'Cancelada', expired: 'Caducada', void: 'Anulada' }[o.status] || o.status) + '</span>')).join('') : '');
  }
  function toggleTrades(on) { tradeView = on; $('#mkTrades').hidden = !on; $('#mkGrid').hidden = on; $('.mk-filters').hidden = on; $('#mkTab').textContent = on ? '← Volver al mercado' : 'Intercambios'; if (on) { renderTrades(); loadTrades(); } }
  async function proposeTrade(friend) {
    await refreshSocial(); const fr = social ? social.friends : [];
    if (!fr.length) return P.toast('Necesitas amigos para intercambiar. Añádelos desde su perfil.');
    let mine = [], theirs = [];
    const load = async box => {
      const name = box.querySelector('#trFriend').value, a = await api('GET', 'api/trades/items'); mine = a.items;
      try { theirs = (await api('GET', 'api/trades/items?name=' + encodeURIComponent(name))).items; } catch (e) { theirs = []; }
      const opt = (l, lock) => l.map((x, n) => '<option value="' + n + '"' + (lock && x.lock ? ' disabled' : '') + '>' + esc(x.name) + ' · ' + esc(S.RARITY[x.rarity].n) + (lock && x.lock ? ' · 🔒 ' + lockText(x.lock) : '') + '</option>').join('');
      box.querySelector('#trMine').innerHTML = opt(mine, true) || '<option disabled>No tienes objetos</option>'; box.querySelector('#trTheirs').innerHTML = opt(theirs, false) || '<option disabled>No tiene objetos</option>';
      const f = mine.findIndex(x => !x.lock); box.querySelector('#trMine').selectedIndex = Math.max(0, f);
    };
    const p = modal('<h3>Proponer un intercambio</h3><label>Con<select id="trFriend">' + fr.map(f => '<option' + (friend === f.username ? ' selected' : '') + '>' + esc(f.username) + '</option>').join('') + '</select></label><label>Tú das<select id="trMine"></select></label><label>Tú pides<select id="trTheirs"></select></label><p class="pf-hint">El objeto que recibas quedará bloqueado unas horas antes de poder venderlo o volver a intercambiarlo.</p>',
      [{ t: 'Cancelar' }, { t: 'Enviar propuesta', cls: 'vip', run: async box => {
        const g = mine[+box.querySelector('#trMine').value], w = theirs[+box.querySelector('#trTheirs').value]; if (!g || !w) return 'Elige un objeto en cada lado.';
        try { await api('POST', 'api/trades/offer', { to: box.querySelector('#trFriend').value, giveT: g.t, giveId: g.id, wantT: w.t, wantId: w.id }); P.toast('Propuesta enviada'); return ''; } catch (e) { return e.message; } } }]);
    const box = $('#soBox'); await load(box); box.querySelector('#trFriend').addEventListener('change', () => load(box)); await p; loadTrades();
  }
  async function tradeAct(a, id) {
    try {
      const j = await api('POST', 'api/trades/' + a, { id });
      if (a === 'accept') { P.apply(j.state); P.toast('¡Intercambio hecho! Recibes: ' + j.got); } else P.toast(a === 'decline' ? 'Propuesta rechazada' : 'Propuesta cancelada');
    } catch (e) { P.toast(e.message); }
    loadTrades();
  }
  function initMarket() {
    $('#mkClose').addEventListener('click', closeMarket); $('#mkSell').addEventListener('click', sell);
    ['mkType', 'mkRar', 'mkSort', 'mkMine'].forEach(id => $('#' + id).addEventListener('change', loadMarket)); let t = 0; $('#mkQ').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadMarket, 250); });
    $('#mkGrid').addEventListener('click', e => { const b = e.target.closest('[data-b]'), c = e.target.closest('[data-c]'); if (b) buy(+b.dataset.b); else if (c) cancelListing(+c.dataset.c); });
    $$('.nav button[data-tab=market]').forEach(b => b.addEventListener('click', openMarket));
    $('#mkTab').addEventListener('click', () => toggleTrades(!tradeView));
    $('#mkTrades').addEventListener('click', e => { const b = e.target.closest('[data-tr]'); if (!b) return; if (b.dataset.tr === 'new') proposeTrade(); else tradeAct(b.dataset.tr, +b.dataset.id); });
  }

  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!$('#soModal').hidden) $('#soModal').hidden = true; else if (!$('#profileScreen').hidden) closeProfile(); else if (!$('#marketScreen').hidden) closeMarket(); });
  window.addEventListener('ppr-session', () => { me = null; cur = null; social = null; applyMyAvatar(); });
  initProfile(); initMarket(); applyMyAvatar();
  Object.assign(P, { proposeTrade, openProfile, openMarket, presetSvg, avatarHtml, tick, refreshSocial });
})();
