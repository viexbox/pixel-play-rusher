/* Panel de administración de Pixel Play Rusher (script clásico, sin dependencias). Todo el texto se inserta con textContent. */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const TICK = '<svg class="vt" viewBox="0 0 24 24" role="img" aria-label="Cuenta verificada"><path fill="#1d9bf0" d="M12 1.6l2.4 1.8 3-.1 1 2.9 2.5 1.8-.9 2.9.9 2.9-2.5 1.8-1 2.9-3-.1-2.4 1.8-2.4-1.8-3 .1-1-2.9-2.5-1.8.9-2.9-.9-2.9 2.5-1.8 1-2.9 3 .1z"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M7.6 12.3l3.1 3.1 5.7-6.2"/></svg>';
const SK = 'ppr.admin.token', GAME_KEY = 'ppr.admtoken';
let token = null, ws = null, wsTimer = 0, tab = 'overview', me = null, pollTimer = 0, meInfo = {};
const chatItems = []; let unreadChat = 0, unreadRep = 0, chatPaused = false;
const MAPS = ['Almenas', 'Dunas', 'Contenedores', 'Bosque'];

function h(tag, props) {
  const e = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) { const v = props[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v); }
  for (let i = 2; i < arguments.length; i++) { const kids = [].concat(arguments[i]); for (const c of kids) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const fmtT = ts => new Date(ts).toLocaleTimeString('es-ES');
const fmtD = ts => new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtUp = s => { const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + ' d ' : '') + hh + ' h ' + m + ' min'; };
const fmtMB = b => (b / 1048576).toFixed(0) + ' MB';
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); }
function nameEl(name, role) {
  const s = h('span', { class: role === 'admin' ? 'gold-neon' : '', text: name });
  const w = h('span', null, s);
  if (role) { const t = h('span'); t.innerHTML = TICK; w.append(t); }
  return w;
}
const roleTag = r => (r === 'admin' ? h('span', { class: 'tag gold', text: 'ADMIN' }) : r === 'inf' ? h('span', { class: 'tag', text: 'INFLUENCER' }) : null);

/* ---------- API ---------- */
async function api(method, path, body) {
  const r = await fetch('/api/admin' + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (r.status === 401 && token) { logout(true); throw new Error('Sesión caducada'); }
  if (!r.ok) throw new Error((j && j.error) || 'Error ' + r.status);
  return j;
}
const act = async (fn, okMsg) => { try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, true); return null; } };

/* ---------- Ventana de diálogo ---------- */
function ask(title, fields, okText) {
  return new Promise(res => {
    const m = $('#modal'), body = $('#mBody'); $('#mTitle').textContent = title; body.replaceChildren();
    for (const f of fields) {
      const inp = f.type === 'select' ? h('select', { name: f.name }, f.options.map(o => h('option', { value: o[0], text: o[1] }))) : f.type === 'textarea' ? h('textarea', { name: f.name, rows: 3, maxlength: f.max || 200 }) : h('input', { name: f.name, type: f.type || 'text', maxlength: f.max || 120, required: !!f.required });
      if (f.value != null) inp.value = f.value;
      body.append(h('label', null, f.label, inp));
    }
    $('#mOk').textContent = okText || 'Aceptar'; m.hidden = false;
    const first = body.querySelector('input,select,textarea'); if (first) first.focus();
    const done = v => { m.hidden = true; $('#modalForm').onsubmit = null; $('#mCancel').onclick = null; res(v); };
    $('#modalForm').onsubmit = ev => { ev.preventDefault(); const v = {}; for (const el of body.querySelectorAll('[name]')) v[el.name] = el.value; done(v); };
    $('#mCancel').onclick = () => done(null);
  });
}
const DURS = [['10', '10 minutos'], ['60', '1 hora'], ['1440', '1 día'], ['10080', '7 días'], ['0', 'Permanente']];

/* ---------- Sesión ---------- */
async function doLogin(ev) {
  ev.preventDefault(); const btn = $('#loginForm button'); btn.disabled = true; $('#loginErr').textContent = '';
  try {
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: $('#lUser').value, password: $('#lPass').value }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'No se pudo entrar');
    const typed = $('#lPass').value; token = j.token; me = j.user;
    if (j.mustChange && !(await forceNewPassword(typed))) { token = null; return; } // contraseña inicial: hay que elegir la definitiva
    try { sessionStorage.setItem(SK, token); } catch (e) { /* sin sessionStorage */ }
    $('#lPass').value = ''; showApp();
  } catch (e) { $('#loginErr').textContent = e.message; }
  btn.disabled = false;
}
function logout(expired) {
  if (token && !expired) fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  token = null; try { sessionStorage.removeItem(SK); localStorage.removeItem(GAME_KEY); } catch (e) { /* nada */ }
  if (ws) { try { ws.close(); } catch (e) { /* cerrado */ } ws = null; } clearTimeout(wsTimer); clearInterval(pollTimer);
  $('#app').hidden = true; $('#loginView').hidden = false; if (expired) $('#loginErr').textContent = 'La sesión ha caducado. Vuelve a entrar.';
}
function showApp() {
  $('#loginView').hidden = true; $('#app').hidden = false;
  $('#whoName').textContent = me || 'Viexbox'; $('#whoTick').innerHTML = TICK;
  connectWs(); go('overview'); api('GET', '/me').then(m => { meInfo = m; if (tab === 'account') render(true); }).catch(() => {});
  clearInterval(pollTimer); pollTimer = setInterval(() => { if (tab === 'overview' || tab === 'players') render(true); }, 5000);
}

/* Primer acceso con la contraseña inicial: no se entra al panel hasta elegir la definitiva */
async function forceNewPassword(current) {
  for (;;) {
    const v = await ask('Primer acceso: elige tu contraseña definitiva', [
      { name: 'next', label: 'Nueva contraseña (mínimo 12, con letras y números)', type: 'password', required: true, max: 128 },
      { name: 'next2', label: 'Repite la contraseña', type: 'password', required: true, max: 128 }], 'Guardar y entrar');
    if (!v) { fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); return false; }
    if (v.next !== v.next2) { toast('Las contraseñas no coinciden.', true); continue; }
    try { await api('POST', '/password', { current, next: v.next }); toast('Contraseña guardada'); return true; } catch (e) { toast(e.message, true); }
  }
}

/* ---------- Contraseña olvidada ---------- */
function showPane(name) {
  $('#loginForm').hidden = name !== 'login'; $('#forgotForm').hidden = name !== 'forgot'; $('#resetForm').hidden = name !== 'reset';
  for (const id of ['#loginErr', '#forgotMsg', '#resetMsg']) { $(id).textContent = ''; $(id).classList.remove('okmsg'); }
}
async function postPublic(path, body) {
  const r = await fetch('/api/admin' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error ' + r.status); return j;
}
async function doForgot(ev) {
  ev.preventDefault(); const btn = $('#forgotForm button[type=submit]'), out = $('#forgotMsg'); btn.disabled = true; out.textContent = ''; out.classList.remove('okmsg');
  try { const j = await postPublic('/forgot', { email: $('#fEmail').value }); out.textContent = j.message; out.classList.add('okmsg'); } catch (e) { out.textContent = e.message; }
  btn.disabled = false;
}
async function doReset(ev) {
  ev.preventDefault(); const out = $('#resetMsg'); out.classList.remove('okmsg');
  if ($('#rPass').value !== $('#rPass2').value) { out.textContent = 'Las contraseñas no coinciden.'; return; }
  const btn = $('#resetForm button[type=submit]'); btn.disabled = true;
  try {
    await postPublic('/reset', { token: $('#rCode').value, password: $('#rPass').value });
    $('#rPass').value = ''; $('#rPass2').value = ''; $('#rCode').value = ''; showPane('login'); $('#loginErr').textContent = 'Contraseña cambiada. Ya puedes entrar con la nueva.'; $('#loginErr').classList.add('okmsg');
  } catch (e) { out.textContent = e.message; }
  btn.disabled = false;
}
function checkResetLink() { // el enlace del correo lleva el código en el fragmento (#reset=…), que nunca viaja al servidor
  const m = /^#reset=([0-9a-f]{20,80})$/i.exec(location.hash || ''); if (!m) return;
  $('#rCode').value = m[1]; showPane('reset'); try { history.replaceState(null, '', location.pathname); } catch (e) { /* nada */ }
}

/* ---------- Canal en tiempo real ---------- */
function setLive(on) { $('#wsDot').classList.toggle('off', !on); $('#wsTxt').textContent = on ? 'en directo' : 'sin conexión en directo'; }
function connectWs() {
  if (!token) return;
  try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/admin-ws'); } catch (e) { return; }
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token }));
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'ready') { setLive(true); chatItems.length = 0; for (const c of m.chat) chatItems.push(c); if (tab === 'chat') render(); }
    else if (m.t === 'chat') { chatItems.push(m.msg); if (chatItems.length > 400) chatItems.shift(); if (tab === 'chat') { if (!chatPaused) appendChat(m.msg); } else { unreadChat++; badge('bChat', unreadChat); } }
    else if (m.t === 'chatdel') { const c = chatItems.find(x => x.id === m.id); if (c) c.deleted = true; const row = document.querySelector('[data-mid="' + m.id + '"]'); if (row) row.classList.add('del'); }
    else if (m.t === 'report') { unreadRep++; badge('bRep', unreadRep); if (tab === 'reports') render(true); toast('Nuevo reporte contra ' + m.report.target); }
    else if (m.t === 'log' && tab === 'maint') { const box = $('#logbox'); if (box) { box.textContent += m.line + '\n'; box.scrollTop = box.scrollHeight; } }
  };
  ws.onclose = () => { setLive(false); if (token) { clearTimeout(wsTimer); wsTimer = setTimeout(connectWs, 3000); } };
  ws.onerror = () => {};
}
function badge(id, n) { const b = $('#' + id); b.textContent = n > 99 ? '99+' : n; b.hidden = !n; }

/* ---------- Navegación ---------- */
function go(t) {
  tab = t; for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('on', b.dataset.tab === t);
  if (t === 'chat') { unreadChat = 0; badge('bChat', 0); } if (t === 'reports') { unreadRep = 0; badge('bRep', 0); }
  render();
}
async function render(quiet) {
  const v = $('#view'), mine = tab;
  try {
    const node = await views[tab]();
    if (mine !== tab) return; // el usuario ya cambió de pestaña
    if (quiet && (v.querySelector('input:focus,select:focus,textarea:focus') || !$('#modal').hidden)) return;
    v.replaceChildren(node);
  } catch (e) { if (!quiet) v.replaceChildren(h('p', { class: 'err', text: e.message })); }
}
const table = (heads, rows) => h('div', { class: 'scroll' }, h('table', null, h('thead', null, h('tr', null, heads.map(x => h('th', { text: x })))), h('tbody', null, rows)));
const card = (label, val) => h('div', { class: 'card' }, h('b', { text: val }), h('span', { text: label }));
function bars(obj, labels, total) {
  const max = Math.max(1, ...Object.values(obj)); const box = h('div');
  const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
  if (!keys.length) return h('p', { class: 'muted', text: 'Aún no hay datos.' });
  for (const k of keys.slice(0, 9)) box.append(h('div', { class: 'bar' }, h('span', { text: labels[k] || k }), h('div', null, h('i', { style: 'width:' + Math.round(obj[k] / max * 100) + '%' })), h('span', { text: obj[k] })));
  return box;
}
function chart(series) {
  const W = 600, H = 150, pad = 18, max = Math.max(4, ...series.map(s => s.players)), n = series.length;
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'svgchart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Jugadores conectados en las últimas horas');
  const line = (pts, color, w) => { const p = document.createElementNS(NS, 'polyline'); p.setAttribute('points', pts); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', w); svg.append(p); };
  const X = i => pad + (n <= 1 ? 0 : i / (n - 1) * (W - pad * 2)), Y = v => H - pad - v / max * (H - pad * 2);
  line(pad + ',' + (H - pad) + ' ' + (W - pad) + ',' + (H - pad), 'rgba(255,255,255,.2)', 1);
  const pts = n === 1 ? [series[0], series[0]] : series, X2 = i => pad + (pts.length <= 1 ? 0 : i / (pts.length - 1) * (W - pad * 2));
  if (n >= 1) { line(pts.map((s, i) => X2(i) + ',' + Y(s.players)).join(' '), '#ffd54a', 2.6); line(pts.map((s, i) => X2(i) + ',' + Y(s.lobby)).join(' '), '#38e4ff', 1.6); }
  const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 6); t.setAttribute('y', 12); t.setAttribute('fill', '#9aa4d0'); t.setAttribute('font-size', 15); t.textContent = 'máx. ' + max + ' · amarillo: en partida · azul: en el lobby'; svg.append(t);
  return svg;
}

/* [NUEVO] Eventos temporales: modo destacado de la semana (automático) y eventos con multiplicadores de PX y Créditos lanzados a mano */
async function eventsView() {
  const d = await api('GET', '/events'), MODES_ = { '': 'Todos los modos', duelo: 'Duelo por equipos', zona: 'Capturar zona', cuchillos: 'Solo cuchillos', carrera: 'Carrera de armas' };
  const left = ms => { const h = Math.floor(ms / 3600000); return h >= 24 ? Math.floor(h / 24) + ' d ' + (h % 24) + ' h' : h >= 1 ? h + ' h' : Math.max(1, Math.ceil(ms / 60000)) + ' min'; };
  const inp = (id, ph, val, w) => h('input', { id, placeholder: ph, value: val, style: 'width:' + w + 'px' });
  const sel = h('select', { id: 'evMode' }, Object.keys(MODES_).map(k => h('option', { value: k, text: MODES_[k] })));
  const send = () => act(async () => { await api('POST', '/events/start', { name: $('#evName').value, mode: $('#evMode').value, px: +$('#evPx').value, cr: +$('#evCr').value, hours: +$('#evH').value }); render(); }, 'Evento lanzado');
  return h('div', null, h('h2', { text: 'Eventos temporales' }),
    h('h3', { text: 'Activos ahora' }), d.active.length ? table(['Evento', 'Bonificación', 'Modo', 'Termina en', ''], d.active.map(e => h('tr', null, h('td', { text: e.name }), h('td', { text: '×' + e.px + ' PX · ×' + e.cr + ' CR' }), h('td', { text: MODES_[e.mode] || e.mode }), h('td', { text: left(e.endsAt - d.now) }), h('td', null, e.auto ? h('span', { class: 'muted', text: 'automático' }) : h('button', { class: 'btn sm red', text: 'Terminar', onclick: () => act(async () => { await api('POST', '/events/stop', { id: e.id }); render(); }, 'Evento terminado') }))))) : h('p', { text: 'No hay eventos activos.' }),
    h('h3', { text: 'Lanzar un evento' }), h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' }, inp('evName', 'Nombre (p. ej. Finde de cuchillos)', '', 240), sel, h('label', { text: '×PX ' }, inp('evPx', '1', '1', 60)), h('label', { text: '×CR ' }, inp('evCr', '1', '2', 60)), h('label', { text: 'Horas ' }, inp('evH', '24', '24', 70)), h('button', { class: 'btn', text: 'Lanzar', onclick: send })),
    h('p', { class: 'muted', text: 'Multiplicadores de 1 a 3 (varios eventos a la vez se multiplican con un tope de ×3). Duración de 1 h hasta ' + Math.round(d.maxHours / 24) + ' días. Los topes diarios de PX y Créditos siguen valiendo.' }),
    h('h3', { text: 'Modo destacado de la semana (automático, ×' + d.featuredMult + ')' }), table(['Empieza', 'Modo'], d.next.map(n => h('tr', null, h('td', { text: new Date(n.startsAt).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' }) }), h('td', { text: n.name })))));
}
/* [NUEVO] Copias de seguridad */
async function backupsView() {
  const d = await api('GET', '/backups'), kb = n => (n / 1024 < 1024 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  const download = async name => { try { const r = await fetch('/api/admin/backups/download?name=' + encodeURIComponent(name), { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) throw new Error('No se pudo descargar'); const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } catch (e) { toast(e.message, true); } };
  return h('div', null, h('h2', { text: 'Copias de seguridad' }),
    h('div', { class: 'cards' }, card('Modo', d.mode === 'postgres' ? 'PostgreSQL' : 'Archivos'), card('Frecuencia', d.everyHours ? 'cada ' + d.everyHours + ' h' : 'desactivadas'), card('Se conservan', d.keep), card('Cifrado', d.encrypted ? 'sí' : 'no')),
    h('p', { class: 'muted', text: 'Carpeta: ' + d.dir + '. Una copia en el mismo servidor no te protege si se pierde ese servidor: usa BACKUP_DIR en otro volumen o descarga copias a menudo. Contienen correos y contraseñas cifradas: trátalas como datos sensibles (BACKUP_PASSPHRASE las cifra).' }),
    d.lastError ? h('p', { class: 'err', text: 'Última copia fallida: ' + d.lastError }) : null,
    h('p', null, h('button', { class: 'btn', text: d.running ? 'Creando…' : 'Crear copia ahora', onclick: () => act(async () => { await api('POST', '/backups/run', {}); render(); }, 'Copia creada') })),
    d.backups.length ? table(['Copia', 'Fecha', 'Tamaño', ''], d.backups.map(b => h('tr', null, h('td', { text: b.name }), h('td', { text: fmtD(b.ts) }), h('td', { text: kb(b.size) }), h('td', null, h('button', { class: 'btn sm', text: 'Descargar', onclick: () => download(b.name) }), ' ', h('button', { class: 'btn sm red', text: 'Borrar', onclick: () => { if (window.confirm('¿Borrar ' + b.name + '?')) act(async () => { await api('POST', '/backups/delete', { name: b.name }); render(); }, 'Copia borrada'); } }))))) : h('p', { text: 'Todavía no hay copias.' }),
    h('p', { class: 'muted', text: 'Restaurar: para el servidor y ejecuta  node scripts/restore-backup.js <copia> --yes  (con DATABASE_URL para PostgreSQL o con DATA_DIR para archivos).' }));
}
const views = {
  backups: backupsView, events: eventsView,
  async overview() {
    const o = await api('GET', '/overview'), T = o.totals;
    const cards = h('div', { class: 'cards' },
      card('Jugadores en partida', o.online), card('En el lobby', o.lobby), card('Salas activas', o.rooms.length), card('Pico de jugadores', o.peak),
      card('Únicos 24 h', o.uniques24h), card('Únicos 7 días', o.uniques7d), card('Partidas jugadas', T.matches), card('Bajas totales', T.kills),
      card('Precisión global', Math.round(o.accuracy * 100) + ' %'), card('Mensajes de chat', T.messages), card('Reportes abiertos', o.openReports), card('Baneos activos', o.activeBans),
      card('Tiempo activo', fmtUp(o.uptime)), card('Memoria', fmtMB(o.mem.rss)), card('Carga CPU', o.load[0].toFixed(2)));
    const topRows = o.top.map((t, i) => h('tr', null, h('td', { text: i + 1 }), h('td', null, nameEl(t.n, t.r)), h('td', { text: MAPS[t.m] || '' }), h('td', { text: t.p + ' pts' })));
    const grid = h('div', { class: 'grid2' },
      h('div', { class: 'box' }, h('h3', { text: 'Jugadores conectados' }), chart(o.series)),
      h('div', { class: 'box' }, h('h3', { text: 'Mapas más jugados' }), bars(o.perMap, o.maps)),
      h('div', { class: 'box' }, h('h3', { text: 'Clases más usadas' }), bars(o.perClass, o.classes)),
      h('div', { class: 'box' }, h('h3', { text: 'Mejores puntuaciones' }), topRows.length ? h('table', null, h('tbody', null, topRows)) : h('p', { class: 'muted', text: 'Aún no hay puntuaciones. Aparecerán al terminar las primeras partidas.' })));
    const roomRows = o.rooms.map(r => h('tr', null, h('td', { text: '#' + r.id }), h('td', { text: MAPS[r.map] + ' · ' + ({ duelo: 'Duelo', zona: 'Zona', cuchillos: 'Cuchillos', carrera: 'Carrera' }[r.mode] || r.mode) + (r.ranked ? ' (clasif.)' : '') }), h('td', { text: r.players + (r.specs ? ' (+' + r.specs + ' espectando)' : '') }), h('td', { text: r.phase === 'play' ? 'jugando' : 'descanso' }), h('td', { text: r.tl + ' s' }),
      h('td', null, h('button', { class: 'btn sm', text: 'Ver en vivo', title: 'Abre la partida como espectador, con estadísticas para detectar trampas', onclick: () => { try { localStorage.setItem(GAME_KEY, token); } catch (e) { /* nada */ } window.open('/?spec=' + r.id, '_blank'); } }), ' ', h('button', { class: 'btn sm', text: 'Terminar ronda', onclick: () => act(() => api('POST', '/rooms/action', { id: r.id, action: 'end' }), 'Ronda terminada') }), ' ',
        h('button', { class: 'btn sm red', text: 'Cerrar sala', onclick: () => act(() => api('POST', '/rooms/action', { id: r.id, action: 'close' }), 'Sala cerrada') }))));
    return h('div', null, h('h2', { text: 'Resumen del servidor' }), cards, grid, h('h3', { text: 'Salas' }), table(['Sala', 'Mapa', 'Jugadores', 'Fase', 'Tiempo', ''], roomRows));
  },
  async players() {
    const d = await api('GET', '/players');
    const rows = d.players.map(p => h('tr', null, h('td', { text: p.id }), h('td', null, nameEl(p.name, p.role), ' ', p.muted ? h('span', { class: 'tag red', text: 'silenciado' }) : null), h('td', { text: '#' + p.room + ' · ' + MAPS[p.map] }),
      h('td', { text: p.k + ' / ' + p.d }), h('td', { text: p.shots ? Math.round(p.hits / p.shots * 100) + ' %' : '—' }), h('td', { text: p.ping + ' ms' }), h('td', { class: 'muted', text: p.ip }),
      h('td', null, p.role === 'admin' ? '' : [h('button', { class: 'btn sm', text: 'Avisar', onclick: () => sanction(p.name, p.id, 'warn') }), ' ', h('button', { class: 'btn sm', text: 'Silenciar', onclick: () => sanction(p.name, p.id, 'mute') }), ' ', h('button', { class: 'btn sm', text: 'Expulsar', onclick: () => sanction(p.name, p.id, 'kick') }), ' ', h('button', { class: 'btn sm red', text: 'Banear', onclick: () => sanction(p.name, p.id, 'ban') })])));
    return h('div', null, h('h2', { text: 'Jugadores conectados (' + d.players.length + ')' }), table(['ID', 'Jugador', 'Sala', 'K / D', 'Precisión', 'Ping', 'IP (anónima)', 'Acciones'], rows),
      h('h3', { text: 'En el lobby (' + d.lobby.length + ')' }), h('p', { class: 'muted', text: d.lobby.map(l => l.name).join(', ') || 'Nadie.' }));
  },
  async chat() {
    const s = (await api('GET', '/settings')).settings;
    const list = h('div', { class: 'chatlist', id: 'chatlist', 'aria-live': 'off' });
    for (const c of chatItems) list.append(chatRow(c)); setTimeout(() => { list.scrollTop = list.scrollHeight; }, 0);
    const say = h('input', { id: 'sayText', maxlength: 120, placeholder: 'Escribe como ' + (me || 'Viexbox') + '…' });
    const scope = h('select', { id: 'sayScope' }, h('option', { value: 'all', text: 'Todos (lobby y salas)' }), h('option', { value: 'lobby', text: 'Solo lobby' }));
    const sendMsg = async () => { const t = say.value.trim(); if (!t) return; const r = await act(() => api('POST', '/chat/say', { text: t, scope: scope.value })); if (r) say.value = ''; };
    say.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendMsg(); } });
    const words = h('textarea', { id: 'wordsBox', rows: 3, placeholder: 'palabras separadas por comas' }); words.value = s.words.join(', ');
    const root = h('div', null, h('h2', { text: 'Moderación del chat en tiempo real' }),
      h('div', { class: 'tools' },
        h('button', { class: 'btn' + (s.chatLocked ? ' red' : ''), id: 'lockBtn', text: s.chatLocked ? 'Chat bloqueado · pulsa para abrirlo' : 'Bloquear el chat', onclick: async () => { await act(() => api('POST', '/settings', { chatLocked: !s.chatLocked }), s.chatLocked ? 'Chat abierto' : 'Chat bloqueado'); render(); } }),
        h('label', { class: 'muted', text: 'Modo lento (ms) ' }, h('input', { id: 'slowIn', type: 'number', min: 0, max: 30000, step: 100, value: s.slowMs, style: 'width:90px' })),
        h('button', { class: 'btn', text: 'Aplicar', onclick: () => act(() => api('POST', '/settings', { slowMs: +$('#slowIn').value }), 'Modo lento actualizado') }),
        h('button', { class: 'btn ghost', id: 'pauseBtn', text: chatPaused ? 'Reanudar desplazamiento' : 'Pausar desplazamiento', onclick: e => { chatPaused = !chatPaused; e.target.textContent = chatPaused ? 'Reanudar desplazamiento' : 'Pausar desplazamiento'; } })),
      list,
      h('div', { class: 'tools', style: 'margin-top:10px' }, say, scope, h('button', { class: 'btn gold', text: 'Enviar', onclick: sendMsg })),
      h('h3', { text: 'Filtro de palabras' }),
      h('div', { class: 'tools' }, h('select', { id: 'fmode' }, h('option', { value: 'mask', text: 'Tapar con ****' }), h('option', { value: 'block', text: 'Bloquear el mensaje' })), h('button', { class: 'btn', text: 'Guardar filtro', onclick: () => act(() => api('POST', '/settings', { filterMode: $('#fmode').value, words: $('#wordsBox').value.split(',').map(x => x.trim()).filter(Boolean) }), 'Filtro guardado') })), words);
    root.querySelector('#fmode').value = s.filterMode; return root;
  },
  async reports() {
    const [rp, pp] = await Promise.all([api('GET', '/reports'), api('GET', '/reports/players')]);
    const cats = { trampas: 'Trampas', insultos: 'Insultos', spam: 'Spam', nombre: 'Nombre ofensivo', otro: 'Otro' };
    const list = rp.reports.map(r => h('div', { class: 'rep' },
      h('div', { class: 'h' }, h('b', { text: '#' + r.id }), h('span', { class: 'tag' + (r.status === 'open' ? ' red' : ''), text: r.status === 'open' ? 'ABIERTO' : r.status.toUpperCase() }), h('span', { class: 'tag', text: cats[r.cat] || r.cat }), h('span', null, 'contra ', h('b', { text: r.target })), h('span', { class: 'muted', text: 'por ' + r.reporter + ' · ' + fmtD(r.ts) + ' · sala #' + r.room + ' ' + (MAPS[r.map] || '') })),
      r.text ? h('p', { text: '«' + r.text + '»' }) : null,
      h('p', { class: 'muted', text: 'Estadísticas del acusado: ' + r.stats.k + ' bajas · ' + r.stats.d + ' muertes · ' + r.stats.hs + ' cabezazos · ' + (r.stats.shots ? Math.round(r.stats.hits / r.stats.shots * 100) + ' % de precisión' : 'sin disparos') + ' · ' + r.stats.fixes + ' correcciones de movimiento' }),
      r.chat.length ? h('pre', { text: r.chat.map(c => c.n + ': ' + c.m).join('\n') }) : null,
      r.note ? h('p', { class: 'muted', text: 'Nota: ' + r.note + (r.by ? ' (' + r.by + ')' : '') }) : null,
      h('div', { class: 'tools' },
        h('button', { class: 'btn sm', text: 'Revisado', onclick: () => setRep(r.id, 'reviewed') }), h('button', { class: 'btn sm', text: 'Descartar', onclick: () => setRep(r.id, 'dismissed') }), h('button', { class: 'btn sm', text: 'Acción tomada', onclick: () => setRep(r.id, 'actioned') }),
        h('button', { class: 'btn sm', text: 'Silenciar', onclick: () => sanction(r.target, null, 'mute', r.id) }), h('button', { class: 'btn sm red', text: 'Banear', onclick: () => sanction(r.target, null, 'ban', r.id) }), h('button', { class: 'btn sm ghost', text: 'Nota', onclick: () => noteRep(r) }))));
    const probs = table(['Jugador', 'Reportes', 'Abiertos', 'Reportado por', 'Motivos', 'Señales de comportamiento', 'Riesgo'], pp.players.map(p => h('tr', null, h('td', { text: p.name }), h('td', { text: p.reports }), h('td', { text: p.open }), h('td', { text: p.reporters + ' jugadores' }), h('td', { text: Object.keys(p.cats).map(k => cats[k] + ' ×' + p.cats[k]).join(', ') }), h('td', { class: 'flags', text: p.flags.join(' · ') || '—' }), h('td', { text: p.score }))));
    return h('div', null, h('h2', { text: 'Gestión de reportes' }), h('h3', { text: 'Jugadores que están causando problemas' }), probs, h('h3', { text: 'Reportes recientes' }), rp.reports.length ? list : h('p', { class: 'muted', text: 'No hay reportes. Los jugadores pueden reportar desde el menú de pausa o con /reportar nombre motivo.' }));
  },
  async bans() {
    const d = await api('GET', '/bans');
    const rows = d.bans.map(b => h('tr', null, h('td', { text: b.type === 'ip' ? 'IP' : 'Nombre' }), h('td', { text: b.display }), h('td', { text: b.reason }), h('td', { text: b.by + ' · ' + fmtD(b.at) }), h('td', { text: b.until ? 'hasta ' + fmtD(b.until) : 'permanente' }), h('td', null, h('button', { class: 'btn sm', text: 'Quitar', onclick: async () => { await act(() => api('POST', '/bans/remove', { id: b.id }), 'Baneo retirado'); render(); } }))));
    return h('div', null, h('h2', { text: 'Baneos y silencios' }),
      h('div', { class: 'tools' }, h('input', { id: 'banName', placeholder: 'Nombre del jugador', maxlength: 14 }), h('select', { id: 'banDur' }, DURS.map(o => h('option', { value: o[0], text: o[1] }))), h('input', { id: 'banWhy', placeholder: 'Motivo', maxlength: 120, style: 'min-width:220px' }),
        h('button', { class: 'btn red', text: 'Banear por nombre', onclick: async () => { const r = await act(() => api('POST', '/bans/add', { type: 'name', value: $('#banName').value, minutes: +$('#banDur').value, reason: $('#banWhy').value }), 'Baneo aplicado'); if (r) render(); } })),
      table(['Tipo', 'Objetivo', 'Motivo', 'Por', 'Duración', ''], rows), d.bans.length ? null : h('p', { class: 'muted', text: 'No hay baneos activos.' }),
      h('p', { class: 'muted', text: 'Las IP se guardan anonimizadas (huella irreversible): sirve para banear sin almacenar la dirección real.' }),
      h('h3', { text: 'Silenciados' }), d.mutes.length ? table(['Clave', 'Hasta', 'Motivo', 'Por'], d.mutes.map(m => h('tr', null, h('td', { class: 'muted', text: m.key }), h('td', { text: fmtT(m.until) }), h('td', { text: m.reason || '' }), h('td', { text: m.by })))) : h('p', { class: 'muted', text: 'Nadie está silenciado.' }));
  },
  async history() {
    const q = $('#histName') ? $('#histName').value : '';
    const [hs, an] = await Promise.all([api('GET', '/history?limit=150&name=' + encodeURIComponent(q)), api('GET', '/analysis')]);
    const sev = p => (p.flags.length ? 'flags' : '');
    return h('div', null, h('h2', { text: 'Historial de partidas y análisis de comportamiento' }),
      h('h3', { text: 'Jugadores con señales sospechosas' }),
      table(['Jugador', 'Partidas', 'Bajas / Muertes', 'K/D', 'Cabezazos', 'Precisión', 'Señales', 'Riesgo', ''], an.players.map(p => h('tr', null, h('td', { text: p.name }), h('td', { text: p.matches }), h('td', { text: p.kills + ' / ' + p.deaths }), h('td', { text: p.kd }), h('td', { text: Math.round(p.hsRate * 100) + ' %' }), h('td', { text: Math.round(p.accuracy * 100) + ' %' }), h('td', { class: sev(p), text: p.flags.join(' · ') || '—' }), h('td', { text: Math.round(p.score) }),
        h('td', null, h('button', { class: 'btn sm', text: 'Ver partidas', onclick: () => { const box = $('#histName'); if (box) { box.value = p.name; render(); } } }))))),
      h('h3', { text: 'Partidas registradas' }),
      h('div', { class: 'tools' }, h('input', { id: 'histName', placeholder: 'Filtrar por jugador', value: q }), h('button', { class: 'btn', text: 'Buscar', onclick: () => render() })),
      table(['Fecha', 'Jugador', 'Mapa', 'Clase', 'Duración', 'Bajas', 'Muertes', 'Cabezazos', 'Disparos', 'Precisión', 'Puntos', 'Correcciones'], hs.history.map(r => h('tr', null, h('td', { text: fmtD(r.ts) }), h('td', { text: r.name }), h('td', { text: MAPS[r.map] }), h('td', { text: r.cn || r.cls }), h('td', { text: r.dur + ' s' }), h('td', { text: r.k }), h('td', { text: r.d }), h('td', { text: r.hs }), h('td', { text: r.shots }), h('td', { text: r.shots ? Math.round(r.hits / r.shots * 100) + ' %' : '—' }), h('td', { text: r.pts }), h('td', { text: r.fixes })))));
  },
  async influencers() {
    const d = await api('GET', '/influencers');
    const rows = d.influencers.map(i => h('tr', null, h('td', null, nameEl(i.name, 'inf')), h('td', { text: i.note || '' }), h('td', null, h('span', { class: 'tag ' + (i.active ? 'ok' : 'red'), text: i.active ? 'ACTIVO' : 'REVOCADO' })), h('td', { text: fmtD(i.createdAt) }),
      h('td', null, h('button', { class: 'btn sm', text: 'Nueva clave', onclick: async () => { const r = await act(() => api('POST', '/influencers/regen', { id: i.id }), 'Clave generada'); if (r) showKey(r.influencer.name, r.key); } }), ' ', i.active ? h('button', { class: 'btn sm red', text: 'Revocar', onclick: async () => { await act(() => api('POST', '/influencers/revoke', { id: i.id }), 'Influencer revocado'); render(); } }) : null)));
    return h('div', null, h('h2', { text: 'Programa de influencers' }),
      h('p', { class: 'muted', text: 'Cada influencer recibe una clave personal. La introduce en Ajustes → «Código de influencer» y el servidor le pone su nombre verificado (tic azul) y el efecto dorado en sus bajas. El nombre queda reservado: nadie más puede usarlo.' }),
      h('div', { class: 'tools', style: 'margin-top:10px' }, h('input', { id: 'infName', placeholder: 'Nombre (3-14 caracteres)', maxlength: 14 }), h('input', { id: 'infNote', placeholder: 'Nota (canal, red social…)', maxlength: 80, style: 'min-width:220px' }),
        h('button', { class: 'btn gold', text: 'Crear influencer', onclick: async () => { const r = await act(() => api('POST', '/influencers/add', { name: $('#infName').value, note: $('#infNote').value }), 'Influencer creado'); if (r) showKey(r.influencer.name, r.key); } })),
      h('div', { id: 'keyArea' }), table(['Nombre', 'Nota', 'Estado', 'Alta', ''], rows), d.influencers.length ? null : h('p', { class: 'muted', text: 'Aún no hay influencers.' }));
  },
  async economy() {
    const q = $('#accQ') ? $('#accQ').value : '';
    const [ac, od] = await Promise.all([api('GET', '/accounts?q=' + encodeURIComponent(q)), api('GET', '/orders')]);
    const money = o => (o.amount / 100).toFixed(2) + ' ' + String(o.currency).toUpperCase();
    const adjust = async (name, sign) => {
      const v = await ask((sign > 0 ? 'Sumar PX a ' : 'Restar PX a ') + name, [{ name: 'amount', label: 'Cantidad de PX', type: 'number', required: true, value: '100' }, { name: 'reason', label: 'Motivo (queda en la auditoría)', max: 120 }], sign > 0 ? 'Sumar' : 'Restar'); if (!v) return;
      const n = Math.abs(Math.trunc(+v.amount)); if (!n) { toast('Escribe una cantidad mayor que 0', true); return; }
      const r = await act(() => api('POST', '/px', { username: name, delta: sign * n, reason: v.reason }), 'Hecho'); if (r) { toast(r.applied === 0 ? 'Sin cambios: ' + name + ' ya tenía 0 PX' : (r.applied >= 0 ? '+' : '') + r.applied + ' PX · saldo ' + r.balance); render(); }
    };
    const rows = ac.accounts.map(a => h('tr', null, h('td', { text: a.username }), h('td', { class: 'muted', text: a.email }), h('td', { text: a.px }), h('td', { text: a.points }), h('td', { text: a.games }), h('td', { text: fmtD(a.lastLogin) }),
      h('td', null, h('button', { class: 'btn sm', text: '+ PX', onclick: () => adjust(a.username, 1) }), ' ', h('button', { class: 'btn sm red', text: '− PX', onclick: () => adjust(a.username, -1) }))));
    const orders = od.orders.map(o => h('tr', null, h('td', { text: fmtD(o.ts) }), h('td', { text: o.user }), h('td', { text: o.px + ' PX' }), h('td', { text: money(o) }), h('td', null, h('span', { class: 'tag ' + (o.status === 'paid' ? 'ok' : o.status === 'pending' ? '' : 'red'), text: o.status === 'paid' ? 'PAGADO' : o.status === 'pending' ? 'PENDIENTE' : o.status.toUpperCase() }))));
    const logs = od.pxlog.map(l => h('tr', null, h('td', { text: fmtD(l.ts) }), h('td', { text: l.user }), h('td', { text: (l.applied >= 0 ? '+' : '') + l.applied }), h('td', { text: l.balance }), h('td', { text: l.reason || '' }), h('td', { text: l.by })));
    return h('div', null, h('h2', { text: 'Economía: cuentas y PX' }),
      h('p', { class: 'muted', text: 'Aquí puedes sumar o restar PX a mano a cualquier cuenta online. Cada ajuste queda en la auditoría. ' + (od.enabled ? 'La tienda de pago está activada.' : 'La tienda de pago NO está activada (faltan STRIPE_SECRET_KEY y PUBLIC_URL).') }),
      h('div', { class: 'tools', style: 'margin:14px 0;display:flex;gap:10px;align-items:center' }, h('input', { id: 'accQ', placeholder: 'Buscar por usuario o correo', value: q }), h('button', { class: 'btn', text: 'Buscar', onclick: () => render() }), h('span', { class: 'muted', text: ac.total + ' cuentas registradas' })),
      table(['Usuario', 'Correo', 'PX', 'Puntos', 'Partidas', 'Último acceso', ''], rows), ac.accounts.length ? null : h('p', { class: 'muted', text: 'No hay cuentas que coincidan.' }),
      h('h3', { text: 'Pedidos de la tienda' }), od.orders.length ? table(['Fecha', 'Cuenta', 'Paquete', 'Importe', 'Estado'], orders) : h('p', { class: 'muted', text: 'Todavía no hay compras.' }),
      h('h3', { text: 'Ajustes manuales de PX' }), od.pxlog.length ? table(['Fecha', 'Cuenta', 'Cambio', 'Saldo', 'Motivo', 'Por'], logs) : h('p', { class: 'muted', text: 'Todavía no hay ajustes.' }));
  },
  async maint() {
    const [sv, ov, lg] = await Promise.all([api('GET', '/server'), api('GET', '/overview'), api('GET', '/logs')]);
    const m = sv.settings.maintenance;
    const box = h('pre', { id: 'logbox', class: 'box', style: 'max-height:240px;overflow:auto;font:12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap' }); box.textContent = lg.logs.join('\n');
    return h('div', null, h('h2', { text: 'Mantenimiento del servidor' }),
      h('div', { class: 'cards' }, card('Node', sv.node), card('CPU (núcleos)', sv.cpus), card('Carga 1 min', sv.load[0].toFixed(2)), card('RAM del proceso', fmtMB(sv.rss)), card('RAM libre', fmtMB(sv.freeMem)), card('Conexiones', sv.connections), card('Datos en disco', (sv.dataBytes / 1024).toFixed(0) + ' KB'), card('Tiempo activo', fmtUp(sv.uptime))),
      h('div', { class: 'grid2' },
        h('div', { class: 'box' }, h('h3', { text: 'Anuncio a todos los jugadores' }), h('div', { class: 'tools' }, h('input', { id: 'annText', maxlength: 160, placeholder: 'Mensaje…', style: 'min-width:240px' }), h('button', { class: 'btn gold', text: 'Enviar anuncio', onclick: async () => { const r = await act(() => api('POST', '/announce', { text: $('#annText').value }), 'Anuncio enviado'); if (r) $('#annText').value = ''; } }))),
        h('div', { class: 'box' }, h('h3', { text: 'Modo mantenimiento' }), h('p', { class: 'muted', text: m.on ? 'ACTIVADO: nadie nuevo puede entrar (tú sí).' : 'Desactivado.' }),
          h('input', { id: 'mMsg', value: m.message, maxlength: 140 }), h('div', { class: 'tools', style: 'margin-top:8px' }, h('label', { class: 'muted', text: 'Cerrar partidas en (s) ' }, h('input', { id: 'mKick', type: 'number', min: 0, max: 3600, value: 60, style: 'width:80px' })),
            h('button', { class: 'btn ' + (m.on ? '' : 'red'), text: m.on ? 'Desactivar' : 'Activar', onclick: async () => { await act(() => api('POST', '/maintenance', { on: !m.on, message: $('#mMsg').value, kickIn: +$('#mKick').value }), m.on ? 'Mantenimiento desactivado' : 'Mantenimiento activado'); render(); } }))),
        h('div', { class: 'box' }, h('h3', { text: 'Apagar o reiniciar' }), h('p', { class: 'muted', text: sv.shutdown ? 'Programado para ' + fmtT(sv.shutdown.at) + '.' : 'El reinicio solo funciona si el servidor está bajo pm2, systemd o Docker con reinicio automático.' }),
          h('div', { class: 'tools' }, h('input', { id: 'shSecs', type: 'number', min: 5, max: 86400, value: 120, style: 'width:90px' }), h('span', { class: 'muted', text: 'segundos' }),
            h('button', { class: 'btn', text: 'Reiniciar', onclick: async () => { if (await ask('Reiniciar el servidor', [], 'Reiniciar') !== null) { await act(() => api('POST', '/shutdown', { seconds: +$('#shSecs').value, restart: true }), 'Reinicio programado'); render(); } } }),
            h('button', { class: 'btn red', text: 'Apagar', onclick: async () => { if (await ask('Apagar el servidor', [], 'Apagar') !== null) { await act(() => api('POST', '/shutdown', { seconds: +$('#shSecs').value, restart: false }), 'Apagado programado'); render(); } } }),
            sv.shutdown ? h('button', { class: 'btn ghost', text: 'Cancelar', onclick: async () => { await act(() => api('POST', '/shutdown/cancel', {}), 'Cancelado'); render(); } }) : null)),
        h('div', { class: 'box' }, h('h3', { text: 'Herramientas' }), h('div', { class: 'tools' },
          h('button', { class: 'btn red', text: 'Expulsar a todos', onclick: async () => { if (await ask('Expulsar a todos los jugadores', [], 'Expulsar') !== null) act(() => api('POST', '/kickall', {}), 'Jugadores expulsados'); } }),
          h('button', { class: 'btn', text: 'Descargar copia de seguridad', onclick: downloadBackup })),
          h('div', { class: 'tools' }, h('input', { id: 'lbName', placeholder: 'Quitar un nombre de la clasificación' }), h('button', { class: 'btn', text: 'Quitar', onclick: () => act(() => api('POST', '/leaderboard/remove', { name: $('#lbName').value }), 'Quitado de la clasificación') })),
          h('button', { class: 'btn red sm', text: 'Vaciar toda la clasificación…', onclick: async () => { const v = await ask('Vaciar la clasificación global', [{ name: 'confirm', label: 'Escribe BORRAR para confirmar', required: true }], 'Vaciar'); if (v) act(() => api('POST', '/leaderboard/reset', { confirm: v.confirm }), 'Clasificación vaciada'); } }))),
      h('h3', { text: 'Registro del servidor (en directo)' }), box);
  },
  async audit() {
    const d = await api('GET', '/audit');
    return h('div', null, h('h2', { text: 'Registro de auditoría' }), h('p', { class: 'muted', text: 'Todo lo que se hace desde el panel queda anotado aquí.' }), table(['Fecha', 'Quién', 'Acción', 'Detalle'], d.audit.map(a => h('tr', null, h('td', { text: fmtD(a.ts) }), h('td', { text: a.by }), h('td', { text: a.action }), h('td', { text: a.detail })))));
  },
  async account() {
    const mail = h('div', { class: 'box', style: 'max-width:520px;margin-top:18px' }, h('h3', { style: 'margin-top:0', text: 'Correo de recuperación' }),
      h('p', { class: 'muted', text: meInfo.email ? 'Ahora: ' + meInfo.email + '. Sirve para entrar y para «¿Has olvidado la contraseña?».' : 'Aún no hay ningún correo de recuperación.' }),
      h('p', { class: 'muted', text: meInfo.smtp ? 'Envío de correo: configurado.' : 'Envío de correo: sin configurar (SMTP_HOST). El enlace de restablecimiento saldrá en la consola del servidor.' }),
      h('div', { class: 'tools', style: 'flex-direction:column;align-items:stretch' }, h('input', { id: 'mailNew', type: 'email', placeholder: 'Correo nuevo', autocomplete: 'email' }), h('input', { id: 'mailPass', type: 'password', placeholder: 'Contraseña actual (para confirmar)', autocomplete: 'current-password' }),
        h('button', { class: 'btn', text: 'Guardar correo', onclick: async () => { const r = await act(() => api('POST', '/email', { email: $('#mailNew').value, current: $('#mailPass').value }), 'Correo guardado'); if (r) { meInfo.email = r.email; $('#mailPass').value = ''; render(true); } } })));
    return h('div', null, h('h2', { text: 'Mi cuenta' }), h('p', { class: 'muted' }, 'Sesión de ', nameEl(me || 'Viexbox', 'admin'), '. La contraseña se guarda solo como hash; cambiarla cierra las demás sesiones.'),
      h('div', { class: 'tools', style: 'margin-top:12px;max-width:520px;flex-direction:column;align-items:stretch' }, h('input', { id: 'pCur', type: 'password', placeholder: 'Contraseña actual', autocomplete: 'current-password' }), h('input', { id: 'pNew', type: 'password', placeholder: 'Nueva contraseña (mínimo 12, con letras y números)', autocomplete: 'new-password' }),
        h('button', { class: 'btn gold', text: 'Cambiar contraseña', onclick: async () => { const r = await act(() => api('POST', '/password', { current: $('#pCur').value, next: $('#pNew').value }), 'Contraseña cambiada'); if (r) { $('#pCur').value = ''; $('#pNew').value = ''; } } })), mail);
  }
};

/* ---------- Piezas de las vistas ---------- */
function chatRow(c) {
  const row = h('div', { class: 'msg' + (c.flagged ? ' flag' : '') + (c.deleted ? ' del' : ''), 'data-mid': c.id }, h('time', { text: fmtT(c.ts) }), h('span', { class: 'sc', text: c.scope === 'lobby' ? 'lobby' : c.scope.replace('room:', 'sala #') }),
    h('span', { class: 'tx' }, nameEl(c.name, c.role), ': ', c.text, c.shown !== c.text ? h('span', { class: 'muted', text: '  → ' + c.shown }) : null),
    c.role === 'admin' ? h('span') : h('span', { class: 'acts' }, h('button', { class: 'btn sm', text: 'Borrar', onclick: () => act(() => api('POST', '/chat/delete', { id: c.id })) }), h('button', { class: 'btn sm', text: 'Silenciar', onclick: () => sanction(c.name, null, 'mute') }), h('button', { class: 'btn sm red', text: 'Banear', onclick: () => sanction(c.name, null, 'ban') })));
  return row;
}
function appendChat(c) { const l = $('#chatlist'); if (!l) return; l.append(chatRow(c)); while (l.children.length > 300) l.firstChild.remove(); l.scrollTop = l.scrollHeight; }
async function sanction(name, id, action, reportId) {
  const titles = { warn: 'Avisar a ', mute: 'Silenciar a ', kick: 'Expulsar a ', ban: 'Banear a ' };
  const fields = [{ name: 'reason', label: 'Motivo', max: 120 }];
  if (action === 'mute' || action === 'ban') fields.unshift({ name: 'minutes', label: 'Duración', type: 'select', options: action === 'mute' ? DURS.slice(0, 4) : DURS });
  const v = await ask(titles[action] + name, fields, action === 'ban' ? 'Banear' : 'Aceptar'); if (!v) return;
  const r = await act(() => api('POST', '/player/action', { id, name, action, minutes: +(v.minutes || 0), reason: v.reason }), 'Hecho');
  if (r && reportId) await act(() => api('POST', '/reports/update', { id: reportId, status: 'actioned' }));
  if (r) render(true);
}
async function setRep(id, status) { await act(() => api('POST', '/reports/update', { id, status }), 'Reporte actualizado'); render(); }
async function noteRep(r) { const v = await ask('Nota del reporte #' + r.id, [{ name: 'note', label: 'Nota interna', type: 'textarea', value: r.note }]); if (v) { await act(() => api('POST', '/reports/update', { id: r.id, note: v.note }), 'Nota guardada'); render(); } }
function showKey(name, key) {
  const a = $('#keyArea'); if (!a) return;
  a.replaceChildren(h('p', { class: 'muted', text: 'Clave de ' + name + ' (se muestra solo ahora; cópiala y envíasela por un canal privado):' }), h('div', { class: 'keybox', id: 'keyText', text: key }));
  render(true);
}
async function downloadBackup() {
  const r = await act(() => api('GET', '/backup')); if (!r) return;
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })), download: 'pixel-play-rusher-backup.json' }); document.body.append(a); a.click(); a.remove(); toast('Copia descargada');
}

/* ---------- Arranque ---------- */
$('#loginForm').addEventListener('submit', doLogin);
$('#forgotLink').addEventListener('click', () => showPane('forgot'));
$('#haveCode').addEventListener('click', () => showPane('reset'));
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => showPane('login'));
$('#forgotForm').addEventListener('submit', doForgot); $('#resetForm').addEventListener('submit', doReset);
checkResetLink();
$('#logoutBtn').addEventListener('click', () => logout(false));
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
$('#playAsAdmin').addEventListener('click', () => { try { localStorage.setItem(GAME_KEY, token); } catch (e) { toast('El navegador no permite guardar el acceso', true); return; } window.open('/', '_blank'); toast('Juego abierto con tu nombre dorado'); });
try { fetch('/api/status').then(r => r.json()).then(j => { if (j.admin && $('#lUser').value === 'Viexbox') $('#lUser').value = j.admin; }).catch(() => {}); } catch (e) { /* sin red */ }
try { const t = sessionStorage.getItem(SK); if (t) { token = t; api('GET', '/me').then(m => { me = m.user; showApp(); }).catch(() => logout(true)); } } catch (e) { /* sin sesión previa */ }
window.__admin = { go, get tab() { return tab; } };
})();
