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
  /* [3D] Vista 3D de una skin de arma: el mismo modelo que en la partida (con su neón), girable arrastrando y que gira solo si no lo tocas */
  function open3d(skinId) {
    const k = S.WEAPON_SKINS.find(x => x.id === skinId); if (!k || !P.gunPreview || !P.THREE) return;
    const THREE = P.THREE, w = S.WEAPONS.find(x => x.id === k.w), rar = S.RARITY[k.r] || { n: '', c: '#9aa4b8' };
    const ov = document.createElement('div'); ov.className = 'sk3d'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', k.n);
    ov.innerHTML = '<div class="sk3d-card" style="--rc:' + rar.c + '"><div class="sk3d-bg"><i class="cl c1"></i><i class="cl c2"></i><i class="cl c3"></i><i class="bd b1"></i><i class="bd b2"></i><i class="bd b3"></i><i class="bd b4"></i><i class="ct"></i><i class="fl"></i></div>' +
      '<canvas></canvas><span class="sk3d-rar">' + esc(rar.n.toUpperCase()) + '</span><b class="sk3d-n">' + esc(k.n) + '</b><span class="sk3d-w">' + esc(w ? w.name : '') + '</span>' +
      '<span class="sk3d-hint">arrastra para girar</span><button type="button" class="sk3d-x" aria-label="Cerrar">✕</button></div>';
    document.body.appendChild(ov);
    const cv = ov.querySelector('canvas'); let ren;
    try {   // sin gráficos 3D (o si algo falla al montarla), la ventana no se queda abierta y vacía
    ren = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); ren.setClearColor(0x000000, 0);
    const sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0xffffff, 0.8)); const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(2, 3, 4); sc.add(sun);
    const g = P.gunPreview(k.w, k.id), piv = new THREE.Group(); piv.add(g); sc.add(piv);
    const bb = new THREE.Box3().setFromObject(g), ctr = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()); g.position.sub(ctr);
    /* [3D] Piezas flotando sobre el arma (skins de neón y legendarias): agujas en fila a lo largo del arma, con el color de neón,
       que suben, bajan y giran cada una a su ritmo y siguen al arma cuando la giras */
    const shards = [], fx = k.neon ? k.neon.col : k.r === 'leyenda' ? (k.glow || k.acc) : null;
    if (fx) {
      const n = 6, len = sz.z, sc = 0.6 * Math.max(0.7, Math.min(1.3, len / 0.9)), tipM = new THREE.MeshBasicMaterial({ color: fx }), bodyM = new THREE.MeshBasicMaterial({ color: 0xe9eef7 });
      const haloM = new THREE.MeshBasicMaterial({ color: fx, transparent: true, opacity: 0.22, depthWrite: false });
      for (let i = 0; i < n; i++) {
        const s1 = new THREE.Group();
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011 * sc, 0.05 * sc, 4), tipM); tip.rotation.x = Math.PI; s1.add(tip);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.004 * sc, 0.006 * sc, 0.03 * sc, 4), bodyM); body.position.y = 0.036 * sc; s1.add(body);
        const halo = new THREE.Mesh(new THREE.ConeGeometry(0.022 * sc, 0.075 * sc, 6), haloM); halo.rotation.x = Math.PI; s1.add(halo);
        s1.position.set(0, sz.y / 2 + 0.06 * sc, -len / 2 + len * (i + 0.5) / n); s1.userData = { y0: s1.position.y, ph: i * 1.1, sp: 1.6 + (i % 3) * 0.35 };
        piv.add(s1); shards.push(s1);
      }
    }
    const cam = new THREE.PerspectiveCamera(30, 1.6, 0.01, 50), L = Math.max(sz.x, sz.z), dist = Math.max(L * 1.35, sz.y * 3) + 0.05; cam.position.set(0, dist * 0.18, dist); cam.lookAt(0, 0, 0);
    let yaw = -Math.PI / 2 + 0.35, pitch = 0.08, drag = null, idleAt = 0, last = performance.now(), alive = true;
    const loop = t => { if (!alive) return; const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (!drag && t - idleAt > 1500) yaw += dt * 0.5;
      piv.rotation.set(pitch, yaw, 0);
      const ts = t / 1000; for (const sh of shards) { const u = sh.userData; sh.position.y = u.y0 + Math.sin(ts * u.sp + u.ph) * 0.012; sh.rotation.y = ts * 1.2 + u.ph; }
      const W = cv.clientWidth, H = cv.clientHeight; if (cv.width !== Math.round(W * ren.getPixelRatio()) || cv.height !== Math.round(H * ren.getPixelRatio())) { ren.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix(); }
      ren.render(sc, cam); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; yaw = drag.yaw + (e.clientX - drag.x) * 0.01; pitch = Math.max(-0.6, Math.min(0.6, drag.pitch + (e.clientY - drag.y) * 0.006)); });
    const up = () => { drag = null; idleAt = performance.now(); }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const close = () => { if (!alive) return; alive = false; document.removeEventListener('keydown', onKey, true); ren.dispose(); ov.remove(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    ov.querySelector('.sk3d-x').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    P.close3d = close;
    } catch (e) { try { if (ren) ren.dispose(); } catch (e2) { /* nada */ } ov.remove(); }
  }
  /* [INVENTARIO] Todo lo que tienes: skins de armas y cuchillos, banners, mascotas y colores; con su rareza, para equiparlo y
     (las skins de armas) verlo en 3D. Lo que tienes lo dice el servidor (inventario del pase + colores de la cuenta). */
  let invFilter = 'all';
  const INV_TYPES = [['all', 'Todo'], ['wskin', 'Armas'], ['kskin', 'Cuchillos'], ['banner', 'Banners'], ['pet', 'Mascotas'], ['color', 'Colores']];
  function invItems() {
    const out = [];
    for (const it of (st && st.inventory) || []) {
      if (it.t === 'pet') { const d = S.PETS.find(x => x.id === it.id); if (d) out.push({ t: 'pet', id: d.id, name: d.n, kind: 'Mascota', rar: S.RARITY[d.r], svg: P.petSvg ? P.petSvg(d) : '', slot: 'pet' }); continue; }
      if (!['wskin', 'kskin', 'banner'].includes(it.t) || !S.bpFind(it)) continue;
      const d = describe(it); out.push({ t: it.t, id: d.id, name: d.name, kind: d.kind, rar: d.rar, svg: d.svg, slot: d.equip });
    }
    for (const c of (P.unlockedColors ? P.unlockedColors() : [])) if (S.COLOR_COSTS[c] !== 0) out.push({ t: 'color', id: String(c), name: S.COLOR_NAMES[c], kind: S.COLOR_COSTS[c] === null ? 'Color exclusivo de rango' : 'Color', rar: S.RARITY[S.colorRarity(c)], svg: '<i class="swatch" style="background:' + S.COLOR_HEX[c] + '"></i>' });
    return out.sort((a, b) => (b.rar ? b.rar.ord : 0) - (a.rar ? a.rar.ord : 0) || a.name.localeCompare(b.name));
  }
  function drawInv() {
    const box = document.getElementById('invBox'); if (!box) return;
    const all = invItems(), list = invFilter === 'all' ? all : all.filter(x => x.t === invFilter), cur = P.currentColor ? String(P.currentColor()) : '';
    const count = n => n === 1 ? '1 objeto' : n + ' objetos';
    box.innerHTML = '<div class="invhead"><b>Inventario</b><span>' + count(all.length) + '</span></div>' +
      '<div class="invf" role="group" aria-label="Filtrar">' + INV_TYPES.map(([k, n]) => { const c = k === 'all' ? all.length : all.filter(x => x.t === k).length; return '<button type="button" data-invf="' + k + '" aria-pressed="' + (invFilter === k) + '">' + n + '<em>' + c + '</em></button>'; }).join('') + '</div>' +
      (list.length ? '<div class="invgrid">' + list.map(x => {
        const on = x.t === 'color' ? cur === x.id : !!(x.slot && st.equipped[x.slot] === x.id);
        const btn = x.t === 'color' ? '<button type="button" data-invcol="' + x.id + '"' + (on ? ' class="on"' : '') + '>' + (on ? 'En uso' : 'Usar') + '</button>'
          : '<button type="button" data-inveq="' + x.slot + '" data-invid="' + x.id + '"' + (on ? ' class="on"' : '') + '>' + (on ? 'Equipado ✓' : 'Equipar') + '</button>';
        const v3d = x.t === 'wskin' && P.gunPreview;
        return '<div class="rcard' + (on ? ' on' : '') + (v3d ? ' has3d' : '') + '" style="--rc:' + (x.rar ? x.rar.c : '#9aa4b8') + '"' + (v3d ? ' data-skin3d="' + x.id + '"' : '') + '><span class="rar">' + esc((x.rar ? x.rar.n : '').toUpperCase()) + '</span><div class="prev">' + x.svg + (v3d ? '<span class="v3d" title="Ver en 3D">3D</span>' : '') + '</div><b class="nm">' + esc(x.name) + '</b><span class="kind">' + esc(x.kind) + '</span><div class="act">' + btn + '</div></div>';
      }).join('') + '</div>'
      : '<p class="note">' + (all.length ? 'No tienes objetos de este tipo.' : 'Todavía no tienes objetos. Consíguelos en el Pase de Batalla, la Tienda o el Mercado.') + '</p>');
  }
  P.renderInventory = async () => {
    const box = document.getElementById('invBox'); if (!box) return;
    if (!P.acctToken()) { box.innerHTML = '<div class="invhead"><b>Inventario</b></div><p class="note warn">Inicia sesión con una cuenta online para tener inventario: tus skins, banners y mascotas se guardan en tu cuenta.</p>'; return; }
    box.innerHTML = '<div class="invhead"><b>Inventario</b></div><p class="note">Cargando…</p>';
    await load(); drawInv();
  };
  document.addEventListener('click', async e => {
    const box = document.getElementById('invBox'); if (!box || !box.contains(e.target)) return;
    const f = e.target.closest('[data-invf]'); if (f) { invFilter = f.dataset.invf; return drawInv(); }
    const q = e.target.closest('[data-inveq]'); if (q) { await equip(q.dataset.inveq, q.dataset.invid, q.classList.contains('on')); return drawInv(); }
    const c = e.target.closest('[data-invcol]'); if (c) { if (P.pickColor) P.pickColor(+c.dataset.invcol); return setTimeout(drawInv, 400); }
    const s3 = e.target.closest('[data-skin3d]'); if (s3 && !e.target.closest('button')) open3d(s3.dataset.skin3d);
  });
  function cardHtml(level, track) {
    const r = S.BP_TIERS[level - 1][track], d = describe(r), s = status(level, track);
    let act;
    if (s === 'ready') act = '<button type="button" data-claim="' + level + ':' + track + '">Reclamar</button>';
    else if (s === 'claimed') act = d.equip ? '<button type="button" class="equip' + (st.equipped[d.equip] === d.id ? ' on' : '') + '" data-equip="' + d.equip + '" data-item="' + d.id + '">' + (st.equipped[d.equip] === d.id ? 'Equipado ✓' : 'Equipar') + '</button>' : '<span class="st done">✓ Reclamado</span>';
    else if (s === 'vipoff') act = '<span class="st lock">Nv ' + level + ' · VIP</span>';
    else act = '<span class="st lock">Nivel ' + level + '</span>';
    const v3d = r.t === 'wskin' && P.gunPreview;   // [3D] las skins de armas se pueden ver en 3D al pulsar la tarjeta
    return '<div class="rcard ' + track + ' ' + s + (s === 'locked' ? ' locked' : '') + (v3d ? ' has3d' : '') + '" style="--rc:' + d.rar.c + '" data-l="' + level + '" data-t="' + track + '">' + (track === 'vip' && !(st && st.vip) ? LOCK : '') +
      '<span class="rar">' + esc(d.rar.n.toUpperCase()) + '</span><div class="prev">' + d.svg + (v3d ? '<span class="v3d" title="Ver en 3D">3D</span>' : '') + '</div><b class="nm">' + esc(d.name) + '</b><span class="kind">' + esc(d.kind) + '</span><div class="act">' + act + '</div></div>';
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
    const q = e.target.closest('[data-equip]'); if (q) return equip(q.dataset.equip, q.dataset.item, q.classList.contains('on'));
    const cd = e.target.closest('.rcard.has3d'); if (cd && !e.target.closest('button')) { const r = S.BP_TIERS[+cd.dataset.l - 1][cd.dataset.t]; if (r && r.t === 'wskin') open3d(r.id); }   // [3D]
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
