/* PixelPlayRusher · Modos de juego, clasificatorio con temporadas y espectador.
   Usa window.PPR_BP (puente con client.js). El servidor manda; aquí solo se elige, se dibuja y se avisa. */
(function () {
  'use strict';
  const P = window.PPR_BP; if (!P || !P.S || !P.net || !P.S.MODES) return;
  const S = P.S, esc = P.esc, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], fmt = n => Number(n).toLocaleString('es-ES');
  const tk = () => P.acctToken();
  async function api(method, path, body) {
    const r = await fetch(P.apiUrl(path), { method, headers: Object.assign(tk() ? { Authorization: 'Bearer ' + tk() } : {}, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error ' + r.status); return j;
  }
  const TEAMC = ['#3d8bff', '#ff4d5a'];

  /* =====================================================================
     SELECTOR DE MODO + CLASIFICATORIO
     ===================================================================== */
  let rk = null;   // /api/ranked
  const cfg = P.cfg;
  const label = () => S.MODES[cfg.mode].name + (cfg.ranked && cfg.mode === 'duelo' ? ' · Clasificatorio' : '');
  function refreshButtons() {
    const b = $('#modeBtn'); if (b) b.textContent = label();
    const s = $('#playOnline small'); if (s) s.textContent = label();
    renderInline();
  }
  /* Tarjetas de modo en el panel del inicio (los mismos modos y la misma casilla de Clasificatorio que la ventana «Modo», sin abrirla) */
  const MODE_COL = { duelo: '#2f7bff', zona: '#ff8a1f', cuchillos: '#3fd15a', carrera: '#ff3b48' };
  function renderInline() {
    const box = $('#modeCards'); if (!box) return;
    const rkOn = !!(cfg.ranked && cfg.mode === 'duelo');
    box.innerHTML = Object.values(S.MODES).map(x => '<button type="button" class="mcard' + (cfg.mode === x.id && !rkOn ? ' on' : '') + '" data-m="' + x.id + '" aria-pressed="' + (cfg.mode === x.id && !rkOn) + '" title="' + esc(x.desc) + '"><i style="--c:' + (MODE_COL[x.id] || '#fff') + '"></i>' + esc(x.short) + '</button>').join('') +
      '<button type="button" class="mcard wide' + (rkOn ? ' on' : '') + '" data-rk="1" aria-pressed="' + rkOn + '" title="Partidas con Elo y ligas (necesita cuenta online)"><i style="--c:#ffd23f"></i>CLASIFICATORIO</button>';
    const d = $('#modeDesc'); if (d) d.textContent = rkOn ? 'Clasificatorio: Duelo por equipos con Elo y ligas, de Bronce a Maestro. Necesita cuenta online.' : S.MODES[cfg.mode].desc;
  }
  function initInline() {
    const box = $('#modeCards'); if (!box) return;
    box.addEventListener('click', e => {
      const c = e.target.closest('[data-m]');
      if (c) { cfg.mode = c.dataset.m; if (cfg.mode !== 'duelo') cfg.ranked = false; P.saveCfg(); refreshButtons(); return; }
      if (e.target.closest('[data-rk]')) {
        if (!tk()) { openModeModal(); return; }   // sin cuenta se abre la ventana, que explica por qué hace falta
        if (cfg.ranked && cfg.mode === 'duelo') cfg.ranked = false; else { cfg.mode = 'duelo'; cfg.ranked = true; }
        P.saveCfg(); refreshButtons();
      }
    });
  }
  async function loadRanked() { try { rk = await api('GET', 'api/ranked'); } catch (e) { rk = null; } return rk; }

  function leagueChip(l, mmr) { return '<span class="mdl-lg" style="--c:' + l.col + '">' + esc(l.n) + (mmr != null ? ' · ' + fmt(mmr) : '') + '</span>'; }
  /* La ventana se dibuja de forma síncrona con los datos ya cargados: cambiar de modo no espera a la red */
  function renderModal() {
    const m = $('#modeModal'), box = $('#modeBox');
    const logged = !!tk() && rk && rk.me, me = logged ? rk.me : null;
    const cards = Object.values(S.MODES).map(x => '<button type="button" class="mdl-card' + (cfg.mode === x.id ? ' on' : '') + '" data-m="' + x.id + '"><b>' + esc(x.name) + '</b><small>' + esc(x.desc) + '</small></button>').join('');
    const season = rk ? '<div class="mdl-sea"><h4>Temporada ' + rk.season.id + ' · quedan ' + rk.season.daysLeft + ' días</h4>' +
      (me ? '<p>' + leagueChip(S.LEAGUES[me.i], me.mmr) + ' <span>' + me.games + ' partidas · ' + me.wins + ' victorias' + (me.next ? ' · siguiente liga (' + esc(me.next.n) + ') a los ' + me.next.at + ' pts' : '') + '</span></p>' + (me.eligible ? '' : '<p class="mdl-hint">Juega ' + (rk.min - me.games) + ' partida(s) clasificatoria(s) más para optar al premio de la temporada.</p>') : '<p class="mdl-hint">Inicia sesión para jugar el clasificatorio y ganar premios al cierre de la temporada.</p>') +
      '<details><summary>Premios por liga y mejores de la temporada</summary><table class="mdl-tb"><tbody>' + S.LEAGUES.map(l => '<tr><td>' + leagueChip(l) + '</td><td>desde ' + l.min + ' pts</td><td>' + (l.cr || l.px ? fmt(l.cr) + ' CR' + (l.px ? ' + ' + l.px + ' PX' : '') : '—') + '</td></tr>').join('') + '</tbody></table>' +
      '<h5>Mejores de la temporada</h5>' + (rk.top.length ? '<ol class="mdl-top">' + rk.top.map(t => '<li><span>' + t.pos + '</span><b>' + esc(t.name) + '</b><i style="color:' + t.col + '">' + esc(t.league) + '</i><em>' + fmt(t.mmr) + '</em></li>').join('') + '</ol>' : '<p class="mdl-hint">Aún no hay jugadores con partidas suficientes.</p>') + '</details></div>' : '';
    box.innerHTML = '<h3>Elige cómo jugar</h3><div class="mdl-cards">' + cards + '</div>' +
      '<label class="mdl-rk"><input type="checkbox" id="mdlRk"' + (cfg.ranked && cfg.mode === 'duelo' ? ' checked' : '') + (cfg.mode !== 'duelo' || !logged ? ' disabled' : '') + '> <b>Clasificatorio</b> <small>' + (!logged ? 'necesita cuenta online' : cfg.mode !== 'duelo' ? 'solo en Duelo por equipos' : 'sube de liga y gana premios; abandonar resta puntos') + '</small></label>' + season +
      '<div class="btns"><button type="button" class="ps-btn vip" id="mdlOk">Listo</button></div>';
    box.onclick = e => {
      const c = e.target.closest('[data-m]'); if (c) { cfg.mode = c.dataset.m; if (cfg.mode !== 'duelo') cfg.ranked = false; P.saveCfg(); refreshButtons(); renderModal(); return; }
      if (e.target.id === 'mdlOk') { m.hidden = true; refreshButtons(); }
    };
    box.onchange = e => { if (e.target.id === 'mdlRk') { cfg.ranked = e.target.checked; P.saveCfg(); refreshButtons(); } };
    m.onclick = e => { if (e.target === m) { m.hidden = true; refreshButtons(); } };
  }
  async function openModeModal() { $('#modeModal').hidden = false; renderModal(); await loadRanked(); if (!$('#modeModal').hidden) renderModal(); }
  /* Premio de temporada pendiente: se enseña una vez y se descarta */
  let lastAcct = null;
  async function checkReward() {
    if (!tk() || lastAcct === tk()) return; lastAcct = tk(); const r = await loadRanked(); if (!r || !r.reward) return;
    const w = r.reward, m = $('#modeModal'), box = $('#modeBox'); m.hidden = false;
    box.innerHTML = '<h3>¡Temporada ' + w.s + ' cerrada!</h3><p>Tu mejor liga fue <b style="color:' + (S.LEAGUES.find(l => l.n === w.league) || {}).col + '">' + esc(w.league) + '</b> (' + fmt(w.mmr) + ' pts).</p><p class="mdl-big">+' + fmt(w.cr) + ' Créditos' + (w.px ? ' · +' + w.px + ' PX' : '') + '</p><p class="mdl-hint">Guardamos una insignia de esta temporada en tu perfil. Tu puntuación se ha acercado a 1000 para empezar la nueva.</p><div class="btns"><button type="button" class="ps-btn vip" id="mdlOk">Genial</button></div>';
    box.onclick = async e => { if (e.target.id === 'mdlOk') { m.hidden = true; try { await api('POST', 'api/ranked/ack', {}); } catch (er) { /* nada */ } if (P.syncRemote) P.syncRemote(); } };
  }

  /* =====================================================================
     HUD por modo + zona en 3D
     ===================================================================== */
  const modeBar = () => $('#modeBar');
  function updateBar() {
    const n = P.net(), pl = P.player(), el = modeBar(); if (!el) return;
    const playing = document.body.classList.contains('playing') && !n.spec;
    if (!playing || !n.mode || n.mode === 'duelo' && !n.ranked) { el.hidden = true; return; }
    let t = '';
    if (n.mode === 'carrera') { const tot = P.limit(), nivel = (n.gl || 0) + 1; t = nivel >= tot ? 'NIVEL FINAL · SOLO CUCHILLO · una baja y ganas' : 'NIVEL ' + nivel + ' / ' + tot + (pl && P.S.WEAPONS[pl.wi] ? ' · ' + P.S.WEAPONS[pl.wi].name.toUpperCase() : ''); }
    else if (n.mode === 'cuchillos') t = 'SOLO CUCHILLOS · el primer equipo a ' + (P.limit ? P.limit() : '') + ' bajas';
    else if (n.mode === 'zona') t = '';
    else if (n.ranked) t = 'CLASIFICATORIO';
    el.hidden = !t; el.textContent = t;
  }
  let ring = null, disc = null, zoneCur = null;
  function ensureZone() {
    const scene = P.scene(), T = P.THREE; if (!scene || !T) return;
    if (!ring) {
      ring = new T.Mesh(new T.CylinderGeometry(1, 1, 7, 40, 1, true), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, side: T.DoubleSide, depthWrite: false }));
      disc = new T.Mesh(new T.CircleGeometry(1, 40), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false })); disc.rotation.x = -Math.PI / 2;
      scene.add(ring); scene.add(disc);
    }
  }
  function zoneColor(o) { return o === 0 ? 0x3d8bff : o === 1 ? 0xff4d5a : o === 2 ? 0xffb020 : 0xf0f4ff; }
  function drawZone(now) {
    const n = P.net(), z = n.zone, playing = (document.body.classList.contains('playing') || document.body.classList.contains('spectating'));
    if (!z || !playing || n.mode !== 'zona') { if (ring) ring.visible = disc.visible = false; const h = $('#zoneHud'); if (h) h.hidden = true; return; }
    ensureZone(); if (!ring) return; ring.visible = disc.visible = true;
    ring.scale.set(z.r, 1, z.r); const zy = z.y || 0; ring.position.set(z.x, zy + 3.5, z.z); disc.scale.set(z.r, z.r, 1); disc.position.set(z.x, zy + 0.06, z.z);   // [NUEVO] la zona puede estar en una azotea
    const c = zoneColor(z.o), pulse = 0.16 + 0.07 * Math.sin(now / 320); ring.material.color.setHex(c); disc.material.color.setHex(c); ring.material.opacity = pulse + (z.o >= 0 ? 0.06 : 0); disc.material.opacity = pulse + 0.06;
    /* Brújula y estado */
    const h = $('#zoneHud'); if (!h) return; const pl = P.player(), cam = P.camera();
    if (n.spec || !pl) { h.hidden = true; return; } h.hidden = false;
    const d = Math.hypot(z.x - pl.pos.x, z.z - pl.pos.z), dy = (z.y || 0) - pl.pos.y, inside = d <= z.r && Math.abs(dy) <= 2.6, above = d <= z.r && !inside, T = P.THREE, fw = new T.Vector3(); cam.getWorldDirection(fw);
    const ang = Math.atan2(fw.x * (z.z - cam.position.z) - fw.z * (z.x - cam.position.x), fw.x * (z.x - cam.position.x) + fw.z * (z.z - cam.position.z));
    const who = z.o === 0 ? 'AZUL' : z.o === 1 ? 'ROJO' : z.o === 2 ? 'DISPUTADA' : 'LIBRE', mine = z.o === pl.team;
    const txt = 'ZONA · ' + (z.n ? z.n.toUpperCase() + ' · ' : '') + who + (inside ? ' · ¡estás dentro!' : above ? (dy > 0 ? ' · ▲ sube' : ' · ▼ baja') : ' · a ' + Math.round(d) + ' m') + ' · cambia en ' + Math.max(0, z.mv - Math.floor((performance.now() - (n.zoneAt || 0)) / 1000)) + ' s';
    if (h.dataset.t !== txt) { h.dataset.t = txt; h.querySelector('span').textContent = txt; }
    h.style.setProperty('--c', '#' + c.toString(16).padStart(6, '0')); h.classList.toggle('mine', mine && z.o >= 0);
    const ar = h.querySelector('i'); ar.style.transform = 'rotate(' + (inside ? 0 : -ang) + 'rad)'; ar.style.opacity = inside ? 0.25 : 1;
  }
  P.onZone = z => { const n = P.net(); n.zoneAt = performance.now(); if (z && n.zone !== z) n.zone = z; };
  P.onMode = () => { const n = P.net(); n.zoneAt = performance.now(); updateBar(); };

  /* =====================================================================
     ESPECTADOR (administrador): estadísticas en directo y avisos de posibles trampas
     ===================================================================== */
  const FLAGS = [
    ['Precisión anómala', r => r.shots >= 20 && r.hits / r.shots >= 0.8],
    ['Muchas cabezas', r => r.kills >= 5 && r.hs / r.kills >= 0.7],
    ['Movimientos imposibles', r => r.fixes >= 5],
    ['Cadencia anómala', r => r.rlv >= 5]
  ];
  let stats = [], specOn = false;
  function renderSpec() {
    const n = P.net(), el = $('#specPanel'); if (!el || !specOn) return;
    const rows = stats.map(a => { const f = n.remotes.get(a[0]); return f ? { id: a[0], f, shots: a[1], hits: a[2], hs: a[3], fixes: a[4], rlv: a[5], ping: a[6], hp: a[7], gl: a[8], kills: f.kills || 0, deaths: f.deaths || 0 } : null; }).filter(Boolean);
    const body = rows.map(r => {
      const acc = r.shots ? Math.round(r.hits / r.shots * 100) : 0, hsr = r.kills ? Math.round(r.hs / r.kills * 100) : 0, fl = FLAGS.filter(x => x[1](r)).map(x => x[0]);
      return '<tr class="' + (r.id === n.specTarget ? 'sel ' : '') + (fl.length ? 'warn' : '') + '" data-id="' + r.id + '"><td><i style="background:' + TEAMC[r.f.team === 1 ? 1 : 0] + '"></i>' + esc(r.f.name) + '</td><td>' + r.kills + '/' + r.deaths + '</td><td>' + acc + '%</td><td>' + hsr + '%</td><td>' + r.fixes + '</td><td>' + r.ping + '</td><td class="fl">' + (fl.length ? '⚠ ' + fl.join(', ') : '') + '</td></tr>';
    }).join('');
    $('#specBody').innerHTML = body || '<tr><td colspan="7" class="mdl-hint">Sin jugadores en la sala.</td></tr>';
    $('#specView').textContent = n.specView === 'fpv' ? 'Vista: primera persona' : 'Vista: tercera persona';
  }
  P.onSpectate = on => { specOn = on; const el = $('#specPanel'); if (el) el.hidden = !on; if (on) renderSpec(); };
  P.onSpecStats = s => { stats = s; renderSpec(); };
  function initSpec() {
    const el = $('#specPanel'); if (!el) return;
    $('#specPrev').addEventListener('click', () => { P.specCycle(-1); renderSpec(); }); $('#specNext').addEventListener('click', () => { P.specCycle(1); renderSpec(); });
    $('#specViewBtn').addEventListener('click', () => { P.setSpecView(P.net().specView === 'fpv' ? 'follow' : 'fpv'); renderSpec(); });
    $('#specExit').addEventListener('click', () => { P.stopSpectate(); location.href = location.pathname; });
    $('#specBody').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) { P.net().specTarget = +tr.dataset.id; renderSpec(); } });
    document.addEventListener('keydown', e => {
      if (!specOn) return; if (e.key === 'ArrowLeft' || e.key === 'q') P.specCycle(-1); else if (e.key === 'ArrowRight' || e.key === 'e') P.specCycle(1); else if (e.key === 'v') P.setSpecView(P.net().specView === 'fpv' ? 'follow' : 'fpv'); else return; renderSpec();
    });
    const id = new URLSearchParams(location.search).get('spec');
    if (id && /^\d+$/.test(id)) setTimeout(() => P.startSpectate(id), 1200);
  }

  /* ---------- Arranque ---------- */
  function init() {
    const mb = $('#modeBtn'); if (mb) mb.addEventListener('click', openModeModal);
    if (!S.MODES[cfg.mode]) cfg.mode = 'duelo'; initInline(); refreshButtons(); initSpec();
    (function loop(now) { requestAnimationFrame(loop); try { drawZone(now); } catch (e) { /* la escena aún no está lista */ } })(0);
    setInterval(updateBar, 300); setInterval(() => { if (tk()) checkReward(); else lastAcct = null; }, 2500);
  }
  init();
  Object.assign(P, { openModeModal });
})();
