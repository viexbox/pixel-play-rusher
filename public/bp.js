/* PixelPlayRusher · pantalla del Pase de batalla (Temporada 1).
   Se apoya en window.PPR_BP, que client.js rellena con el catálogo compartido (S) y utilidades del juego.
   El servidor manda: aquí solo se dibuja el estado que devuelve /api/bp y se piden las acciones. */
(function () {
  'use strict';
  const P = window.PPR_BP; if (!P || !P.S) return;
  const S = P.S, esc = P.esc, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const fmt = n => Number(n).toLocaleString('es-ES');
  let st = null;            // estado del pase de esta cuenta (null = sin cuenta online: solo se puede mirar)
  let loading = null;

  /* ---------- Vistas previas (SVG con los colores reales de cada skin) ---------- */
  const OL = '#0b0f1e';
  const R = (x, y, w, h, f, rx) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '" stroke="' + OL + '" stroke-width="1.6"' + (rx ? ' rx="' + rx + '"' : '') + '/>';
  function weaponSvg(wid, k) {
    const w = S.WEAPONS.find(x => x.id === wid) || S.WEAPONS[0], c = k || { body: w.col, acc: '#ffffff', dark: '#2a1b3d' };
    const L = Math.round(30 + w.size[2] * 95);       // el largo del arma manda el de la silueta
    let g = '';
    if (wid === 'sheriff') {
      g = R(26, 44, 12, 26, c.dark) + R(34, 34, 46, 16, c.body) + R(38, 36, 36, 4, c.acc) + '<circle cx="62" cy="43" r="11" fill="' + c.dark + '" stroke="' + OL + '" stroke-width="1.6"/>' + R(80, 36, 54, 9, c.dark) + R(134, 34, 6, 13, c.dark);
    } else if (wid === 'duo') {
      const one = (dx, dy) => R(30 + dx, 34 + dy, 44, 15, c.body) + R(34 + dx, 36 + dy, 34, 3.5, c.acc) + R(74 + dx, 37 + dy, 30, 8, c.dark) + R(36 + dx, 48 + dy, 11, 20, c.dark);
      g = one(16, 14) + one(0, -4);
    } else {
      const bx = 34, by = 30;
      g = R(8, by + 3, 28, 18, c.dark) + R(bx, by, L, 20, c.body) + R(bx + 4, by + 2, L - 10, 4.5, c.acc) + R(bx + L, by + 5, 34, 8, c.dark) + R(bx + L + 34, by + 3, 7, 12, c.dark) +
        R(bx + 12, by + 20, 11, 22, c.dark) + R(bx + L * 0.42, by + 20, 13, 24, c.dark);
      if (wid === 'lince') g += R(bx + 22, by - 13, 46, 11, c.dark, 4) + '<circle cx="' + (bx + 68) + '" cy="' + (by - 7.5) + '" r="6" fill="#7dffea" stroke="' + OL + '" stroke-width="1.4"/>';
      else if (wid === 'trueno') g += R(bx + L * 0.5, by + 20, 30, 9, c.dark);
      else g += R(bx + L * 0.3, by - 6, 16, 6, c.dark);
    }
    return '<svg viewBox="0 0 170 84" aria-hidden="true">' + g + '</svg>';
  }
  function knifeSvg(k) {
    return '<svg viewBox="0 0 170 84" aria-hidden="true"><g transform="rotate(-24 85 44)">' +
      '<polygon points="62,34 130,37 146,44 130,51 62,54" fill="' + k.blade + '" stroke="' + OL + '" stroke-width="1.6"/><polygon points="64,36 128,39 128,42 64,42" fill="' + k.edge + '"/>' +
      R(53, 29, 10, 30, k.guard) + R(18, 36, 36, 16, k.handle, 3) + R(26, 38, 3, 12, k.guard) + R(38, 38, 3, 12, k.guard) + '</g></svg>';
  }
  function bannerSvg(b) {
    const id = 'bg' + b.id;
    return '<svg viewBox="0 0 170 84" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + b.c1 + '"/><stop offset="1" stop-color="' + b.c2 + '"/></linearGradient></defs>' +
      '<rect x="8" y="14" width="154" height="56" fill="url(#' + id + ')" stroke="#fff" stroke-width="2"/><path d="M8 14h70l-40 56H8z" fill="rgba(0,0,0,.28)"/><path d="M96 14h24l-40 56H56z" fill="rgba(255,255,255,.14)"/>' +
      '<text x="100" y="52" text-anchor="middle" font-family="Exo 2,Arial,sans-serif" font-weight="900" font-style="italic" font-size="34" fill="#fff8d6" stroke="' + OL + '" stroke-width="1.2">' + esc(b.tag) + '</text></svg>';
  }
  function coinSvg(n) {
    return '<svg viewBox="0 0 170 84" aria-hidden="true"><circle cx="85" cy="42" r="30" fill="#ffc83a" stroke="' + OL + '" stroke-width="2"/><circle cx="85" cy="42" r="22" fill="none" stroke="#b07a00" stroke-width="2.5"/>' +
      '<text x="85" y="48" text-anchor="middle" font-family="Exo 2,Arial,sans-serif" font-weight="900" font-size="' + (String(n).length > 3 ? 17 : 20) + '" fill="#7a4d00">' + n + '</text></svg>';
  }
  const LOCK = '<svg class="padlock" viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffb020" d="M7 10V7a5 5 0 0110 0v3h1.5A1.5 1.5 0 0120 11.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 20.5v-9A1.5 1.5 0 015.5 10H7zm2 0h6V7a3 3 0 00-6 0v3z"/></svg>';

  /* Datos de una recompensa para pintarla */
  function describe(r) {
    const info = S.bpInfo(r), rar = S.RARITY[info.r];
    if (r.t === 'px') return { name: info.n, kind: 'Moneda del juego', rar, svg: coinSvg(r.n), equip: null };
    const it = S.bpFind(r);
    if (r.t === 'wskin') return { name: it.n, kind: 'Skin · ' + P.weaponName(it.w), rar, svg: weaponSvg(it.w, it), equip: 'weapon:' + it.w, id: it.id };
    if (r.t === 'kskin') return { name: it.n, kind: 'Skin de cuchillo', rar, svg: knifeSvg(it), equip: 'knife', id: it.id };
    return { name: it.n, kind: 'Banner exclusivo', rar, svg: bannerSvg(it), equip: 'banner', id: it.id };
  }

  /* ---------- Servidor ---------- */
  async function api(method, path, body) {
    const r = await fetch(P.apiUrl(path), { method, headers: Object.assign({ Authorization: 'Bearer ' + P.acctToken() }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error ' + r.status); return j;
  }
  function apply(s) {   // el servidor manda: se guarda el estado y se aplica lo equipado al juego
    st = s; const eq = s ? s.equipped : {}; const before = JSON.stringify(P.equipped);
    P.equipped = eq; if (JSON.stringify(eq) !== before) P.rebuild();
    P.state = s; if (s) P.setPx(s.px); applyBanner();
  }
  P.applyState = s => apply(s);   // [MASCOTAS] la tienda aplica el estado que devuelve el servidor tras comprar o equipar
  async function load() {
    if (!P.acctToken()) { apply(null); return null; }
    if (loading) return loading;
    loading = api('GET', 'api/bp').then(j => { apply(j.state); return j.state; }).catch(() => { apply(null); return null; }).finally(() => { loading = null; });
    return loading;
  }
  function applyBanner() {
    const el = $('#myBanner'); if (!el) return; const id = st && st.equipped.banner, b = id && S.BANNERS.find(x => x.id === id);
    if (!b) { el.hidden = true; return; }
    el.hidden = false; el.style.setProperty('--b1', b.c1); el.style.setProperty('--b2', b.c2); el.innerHTML = '<b>' + esc(b.tag) + '</b>' + esc(b.n.toUpperCase());
  }

  /* ---------- Pantalla ---------- */
  function status(level, track) {
    if (!st) return 'locked';
    if (st.claims.includes(level + ':' + track)) return 'claimed';
    if (st.level < level) return 'locked';
    return track === 'vip' && !st.vip ? 'vipoff' : 'ready';
  }
  function cardHtml(level, track) {
    const r = S.BP_TIERS[level - 1][track], d = describe(r), s = status(level, track);
    let act;
    if (s === 'ready') act = '<button type="button" data-claim="' + level + ':' + track + '">Reclamar</button>';
    else if (s === 'claimed') act = d.equip ? '<button type="button" class="equip' + (st.equipped[d.equip] === d.id ? ' on' : '') + '" data-equip="' + d.equip + '" data-item="' + d.id + '">' + (st.equipped[d.equip] === d.id ? 'Equipado ✓' : 'Equipar') + '</button>' : '<span class="st done">✓ Reclamado</span>';
    else if (s === 'vipoff') act = '<span class="st lock">Nv ' + level + ' · VIP</span>';
    else act = '<span class="st lock">Nivel ' + level + '</span>';
    return '<div class="rcard ' + track + ' ' + s + (s === 'locked' ? ' locked' : '') + '" style="--rc:' + d.rar.c + '" data-l="' + level + '">' + (track === 'vip' && !(st && st.vip) ? LOCK : '') +
      '<span class="rar">' + esc(d.rar.n.toUpperCase()) + '</span><div class="prev">' + d.svg + '</div><b class="nm">' + esc(d.name) + '</b><span class="kind">' + esc(d.kind) + '</span><div class="act">' + act + '</div></div>';
  }
  function render() {
    const lv = st ? st.level : 1, vip = !!(st && st.vip);
    $('#psLv').textContent = lv; const vs = $('#psVipStat'); vs.textContent = vip ? 'PASE VIP' : 'PASE GRATIS'; vs.classList.toggle('on', vip);
    const max = lv >= S.BP_LEVELS; $('#psXp').style.width = (st ? (max ? 100 : Math.round(st.into / st.need * 100)) : 0) + '%';
    $('#psXpTxt').textContent = !st ? 'Inicia sesión para ganar XP' : max ? 'NIVEL MÁXIMO' : fmt(st.into) + ' / ' + fmt(st.need) + ' XP';
    $('#psWallet').textContent = st ? fmt(st.px) + ' PX' : '';
    const note = $('#psNote'), gift = st && st.giftedBy && vip ? 'Tu Pase VIP es un regalo de ' + st.giftedBy + '. ' : '';
    if (!P.acctToken()) { note.hidden = false; note.textContent = 'Estás viendo el catálogo. Inicia sesión con una cuenta online (Registro) para ganar XP, reclamar recompensas y comprar el Pase VIP.'; }
    else if (gift) { note.hidden = false; note.textContent = gift + '¡Disfrútalo!'; } else note.hidden = true;
    const buy = $('#psBuy'), price = st ? st.prices.vip : S.BP_PRICES.vip, skip = st ? st.prices.skip : S.BP_PRICES.skipPerLevel;
    buy.innerHTML = vip ? 'Pase VIP activo ✓' : 'Comprar Pase VIP<small>' + fmt(price) + ' PX</small>'; buy.disabled = !st || vip;
    $('#psGift').innerHTML = 'Regalar Pase<small>' + fmt(price) + ' PX</small>'; $('#psGift').disabled = !st;
    $('#psSkip').innerHTML = 'Saltar Niveles<small>' + fmt(skip) + ' PX/nivel</small>'; $('#psSkip').disabled = !st || max;
    const ready = st ? S.BP_TIERS.reduce((n, t) => n + (status(t.level, 'free') === 'ready') + (status(t.level, 'vip') === 'ready'), 0) : 0;
    $('#psClaimAll').textContent = ready ? 'Reclamar todo (' + ready + ')' : 'Reclamar todo'; $('#psClaimAll').disabled = !ready;
    const keep = $('#psScroll').scrollLeft;
    $('#psScroll').innerHTML = S.BP_TIERS.map(t => '<div class="ps-col">' + cardHtml(t.level, 'free') + '<div class="ps-lv' + (t.level < lv ? ' done' : t.level === lv ? ' cur' : '') + '">' + t.level + '</div>' + cardHtml(t.level, 'vip') + '</div>').join('');
    $('#psScroll').scrollLeft = keep;
  }
  function goToLevel() { const c = $('#psScroll .ps-col:nth-child(' + Math.max(1, (st ? st.level : 1) - 1) + ')'); if (c) $('#psScroll').scrollLeft = c.offsetLeft - 8; }

  /* ---------- Acciones ---------- */
  async function act(fn, okMsg) {
    try { const j = await fn(); if (j && j.state) apply(j.state); render(); if (okMsg) P.toast(typeof okMsg === 'function' ? okMsg(j) : okMsg); return j; } catch (e) { P.toast(e.message); return null; }
  }
  const claim = key => { const [l, t] = key.split(':'); return act(() => api('POST', 'api/bp/claim', { level: +l, track: t }), j => j.reward.t === 'px' ? '+' + j.reward.n + ' PX' : '¡' + S.bpInfo(j.reward).n + ' es tuyo!'); };
  const claimAll = () => act(() => api('POST', 'api/bp/claim-all', {}), j => j.claimed.length + ' recompensas reclamadas');
  const equip = (slot, item, on) => act(() => api('POST', 'api/bp/equip', { slot, item: on ? null : item }), on ? 'Quitado' : 'Equipado');

  /* Ventana de confirmación */
  function modal(html, buttons) {
    return new Promise(res => {
      const m = $('#psModal'), box = $('#psmBox'); box.innerHTML = html + '<div class="err" id="psmErr"></div><div class="btns">' + buttons.map((b, i) => '<button type="button" class="ps-btn ' + (b.cls || 'alt') + '" data-b="' + i + '">' + b.t + '</button>').join('') + '</div>'; m.hidden = false;
      const first = box.querySelector('input'); if (first) first.focus();
      const done = v => { m.hidden = true; res(v); };
      box.querySelectorAll('[data-b]').forEach(bt => bt.addEventListener('click', async () => { const b = buttons[+bt.dataset.b]; if (!b.run) return done(null); bt.disabled = true; const err = await b.run(box); if (err) { $('#psmErr').textContent = err; bt.disabled = false; } else done(true); }));
      m.onclick = e => { if (e.target === m) done(null); };
    });
  }
  function needPx(price) { return st && st.px < price; }
  async function buyVip() {
    const price = st.prices.vip; const items = S.BP_TIERS.reduce((a, t) => { const r = t.vip; if (r.t === 'wskin') a.w++; else if (r.t === 'kskin') a.k++; else if (r.t === 'banner') a.b++; else a.px += r.n; return a; }, { w: 0, k: 0, b: 0, px: 0 });
    const short = needPx(price);
    await modal('<h3>Pase VIP · Temporada 1</h3><p>Desbloquea la fila VIP de los 50 niveles:</p><ul><li><b>' + items.w + '</b> skins de armas (hasta legendarias)</li><li><b>' + items.k + '</b> skins de cuchillo</li><li>Banner exclusivo <b>S1</b></li><li>' + fmt(items.px) + ' PX repartidos por el camino</li></ul><div class="row"><span>Precio</span><b>' + fmt(price) + ' PX</b></div><div class="row"><span>Tu saldo</span><b>' + fmt(st.px) + ' PX</b></div>' + (short ? '<p class="err">Te faltan ' + fmt(price - st.px) + ' PX.</p>' : ''),
      [{ t: 'Cancelar' }].concat(short ? [{ t: 'Conseguir PX', cls: '', run: async () => { closePass(); P.showTab('store'); } }] : [{ t: 'Comprar por ' + fmt(price) + ' PX', cls: 'vip', run: async () => { try { const j = await api('POST', 'api/bp/buy', {}); apply(j.state); render(); P.toast('¡Pase VIP activado!'); return ''; } catch (e) { return e.message; } } }]));
  }
  async function giftPass() {
    const price = st.prices.vip, short = needPx(price);
    await modal('<h3>Regalar Pase VIP</h3><p>Escribe el nombre de usuario de la cuenta que lo recibirá. Se te cobrarán <b>' + fmt(price) + ' PX</b> y esa persona tendrá el Pase VIP de la Temporada 1.</p><input type="text" id="psmTo" maxlength="14" placeholder="Nombre de usuario" autocomplete="off">' + (short ? '<p class="err">Te faltan ' + fmt(price - st.px) + ' PX.</p>' : ''),
      [{ t: 'Cancelar' }, { t: 'Regalar', cls: 'vip', run: async box => { const to = box.querySelector('#psmTo').value.trim(); if (!to) return 'Escribe un nombre de usuario.'; try { const j = await api('POST', 'api/bp/gift', { to }); apply(j.state); render(); P.toast('Pase VIP regalado a ' + j.to); return ''; } catch (e) { return e.message; } } }]);
  }
  async function skipLevels() {
    const per = st.prices.skip, maxN = S.BP_LEVELS - st.level;
    await modal('<h3>Saltar niveles</h3><p>Compra XP para subir de nivel al momento. Cada nivel cuesta <b>' + fmt(per) + ' PX</b>.</p><label>Niveles a saltar (1–' + maxN + ')<input type="number" id="psmN" min="1" max="' + maxN + '" value="1"></label><div class="row"><span>Llegarías al nivel</span><b id="psmLv"></b></div><div class="row"><span>Coste</span><b id="psmCost"></b></div><div class="row"><span>Tu saldo</span><b>' + fmt(st.px) + ' PX</b></div>',
      [{ t: 'Cancelar' }, { t: 'Saltar', cls: 'vip', run: async box => { const n = Math.max(1, Math.min(maxN, +box.querySelector('#psmN').value | 0)); if (st.px < n * per) return 'Te faltan ' + fmt(n * per - st.px) + ' PX.'; try { const j = await api('POST', 'api/bp/skip', { levels: n }); apply(j.state); render(); P.toast('Saltaste ' + j.skipped + ' niveles (−' + fmt(j.cost) + ' PX)'); return ''; } catch (e) { return e.message; } } }]);
  }
  document.addEventListener('input', e => { if (e.target && e.target.id === 'psmN' && st) { const n = Math.max(1, Math.min(S.BP_LEVELS - st.level, +e.target.value | 0)); $('#psmLv').textContent = Math.min(S.BP_LEVELS, st.level + n); $('#psmCost').textContent = fmt(n * st.prices.skip) + ' PX'; } });
  document.addEventListener('focusin', e => { if (e.target && e.target.id === 'psmN') e.target.dispatchEvent(new Event('input', { bubbles: true })); });

  /* ---------- Abrir y cerrar ---------- */
  async function openPass() {
    const el = $('#passScreen'); el.hidden = false; render(); await load(); render(); goToLevel();
  }
  function closePass() { $('#passScreen').hidden = true; $('#psModal').hidden = true; P.showTab('home'); }
  $('#psClose').addEventListener('click', closePass);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#passScreen').hidden) { if (!$('#psModal').hidden) $('#psModal').hidden = true; else closePass(); } });
  /* Antes de abrir una compra se vuelve a pedir el estado al servidor: saldo, nivel y VIP siempre al día (por si compraste PX o te regalaron el pase) */
  const fresh = async fn => { await load(); render(); fn(); };
  $('#psBuy').addEventListener('click', () => fresh(() => { if (st && !st.vip) buyVip(); }));
  $('#psGift').addEventListener('click', () => fresh(() => { if (st) giftPass(); }));
  $('#psSkip').addEventListener('click', () => fresh(() => { if (st && st.level < S.BP_LEVELS) skipLevels(); }));
  $('#psClaimAll').addEventListener('click', claimAll);
  $('#psScroll').addEventListener('click', e => {
    const c = e.target.closest('[data-claim]'); if (c) return claim(c.dataset.claim);
    const q = e.target.closest('[data-equip]'); if (q) equip(q.dataset.equip, q.dataset.item, q.classList.contains('on'));
  });
  $$('.nav button[data-tab=pass]').forEach(b => b.addEventListener('click', openPass));
  window.addEventListener('ppr-session', () => { load().then(() => { if (!$('#passScreen').hidden) render(); }); });   // al iniciar o cerrar sesión: skins, banner y estado al día
  load();

  /* XP que manda el servidor al terminar una partida online */
  P.onXp = m => {
    if (st) { const s2 = S.bpLevelOf(m.total); st.xp = m.total; st.level = s2.level; st.into = s2.into; st.need = s2.need; }
    P.toast('+' + m.xp + ' XP del pase' + (m.up ? ' · ¡nivel ' + m.level + '!' : ''));
    const e = $('#endXp'); if (e) { e.hidden = false; e.textContent = '+' + m.xp + ' XP del Pase de batalla' + (m.up ? ' · ¡Subes al nivel ' + m.level + '!' : ' · nivel ' + m.level); }
    if (!$('#passScreen').hidden) render();
  };
  P.open = openPass; P.close = closePass; P.reload = load; P.load = load; P.render = render; P.apply = apply; P.describe = describe;   // (el perfil y el mercado usan estas piezas)
})();
