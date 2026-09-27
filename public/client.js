(function () {
'use strict';

/* =====================================================================
   Utilidades y almacenamiento
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const TAU = Math.PI * 2;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VTICK = '<svg class="vt" viewBox="0 0 24 24" role="img" aria-label="Cuenta verificada"><path fill="#1d9bf0" d="M12 1.6l2.4 1.8 3-.1 1 2.9 2.5 1.8-.9 2.9.9 2.9-2.5 1.8-1 2.9-3-.1-2.4 1.8-2.4-1.8-3 .1-1-2.9-2.5-1.8.9-2.9-.9-2.9 2.5-1.8 1-2.9 3 .1z"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M7.6 12.3l3.1 3.1 5.7-6.2"/></svg>';
/* Nombre con su rol: el administrador en dorado neón y, junto a administradores e influencers, el tic azul de verificación */
/* Verificados (administrador e influencers): nombre dorado brillante + tic azul, visible para todos. Resto de jugadores: nombre azul sin brillo. */
const teamTitle = (win, mine) => (win < 0 ? 'Empate' : win === mine ? '¡Victoria del equipo ' + TEAMS[win].n + '!' : 'Gana el equipo ' + TEAMS[win].n);
const teamScore = tk => '<span class="tsb t0">Azul ' + tk[0] + '</span> – <span class="tsb t1">' + tk[1] + ' Rojo</span> · ';
const nameHtml = (name, rl) => rl ? '<span class="rl-admin">' + esc(name) + '</span>' + VTICK : '<span class="pn">' + esc(name) + '</span>';
const selfHtml = rl => rl ? '<span class="rl-admin">TÚ</span>' + VTICK : '<span class="pn">TÚ</span>';
const admToken = () => { try { return localStorage.getItem('ppr.admtoken') || ''; } catch (e) { return ''; } };
const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const K = { cfg: 'voltarena.v1.cfg', scores: 'voltarena.v1.scores', stats: 'voltarena.v1.stats' };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
};

const cfg = Object.assign({ name: '', cls: 0, map: 0, diff: 1, wantTeam: null, sens: 1, fov: 90, vol: 0.6, shadows: true, wheelSwap: true, shake: 100, recoilCam: 100, fovSpeed: 8, hudScale: 100, hudCompact: false, mode: 'duelo', ranked: false, look: { col: 0, skin: 0 }, infKey: '', rankClaimed: [] }, store.get(K.cfg, {}));
cfg.look = { col: clamp((cfg.look && cfg.look.col) | 0, 0, 9), skin: clamp((cfg.look && cfg.look.skin) | 0, 0, 4) };
cfg.cls = clamp(cfg.cls | 0, 0, window.VoltShared.WEAPONS.length - 1); if (!cfg.optics || typeof cfg.optics !== 'object') cfg.optics = {}; if (!Array.isArray(cfg.rankClaimed)) cfg.rankClaimed = []; cfg.infKey = String(cfg.infKey || '').slice(0, 40); cfg.map = (cfg.map | 0) >= 0 && (cfg.map | 0) < window.VoltShared.MAPS.length ? cfg.map | 0 : 0;   // un mapa guardado que ya no existe vuelve al primero cfg.diff = clamp(cfg.diff | 0, 0, 2);
if (!cfg.name) cfg.name = 'Jugador' + irand(100, 999);
const saveCfg = () => store.set(K.cfg, cfg);

/* =====================================================================
   Datos de juego
   ===================================================================== */
const S = window.VoltShared;
const WEAPONS = S.WEAPONS, MAPS = S.MAPS;
const OPTICS = S.OPTICS;
/* Mira elegida por el jugador para un arma (o la primera de su lista) */
const OPT_OFF = { iron: 0.031, dot: 0.033, holo: 0.043, acog: 0.038 };
/* Altura de la línea de mira sobre el arma: sirve para centrarla en pantalla al apuntar */
const sightH = (w, opt) => (w.id === 'ak' || opt.kind === 'scope' ? opt.h : w.size[1] / 2 + 0.012 + OPT_OFF[opt.kind]);
function opticOf(w, id) { if (!w.optics) return null; const k = id || (cfg.optics && cfg.optics[w.id]); return OPTICS[w.optics.includes(k) ? k : w.optics[0]]; }
const opticIdOf = w => { const o = opticOf(w); return w.optics.find(k => OPTICS[k] === o); };
const aimFovOf = w => { const o = opticOf(w); return o ? o.fov : w.aimFov; };
const scopeKind = w => { const o = opticOf(w); return o ? (o.kind === 'scope' || o.kind === 'acog' ? o.kind : null) : (w.scope ? 'scope' : null); };
const BOT_WEAPONS = [0, 1, 2, 7, 8];
const DIFFS = [
  { react: 0.75, err: 0.05, dmg: 7, interval: 0.22, speed: 4.0 },
  { react: 0.45, err: 0.032, dmg: 9, interval: 0.17, speed: 4.8 },
  { react: 0.25, err: 0.02, dmg: 11, interval: 0.13, speed: 5.5 }
];
const BOT_NAMES = ['Nova', 'Kraken', 'Pixel', 'Rayo', 'Turbo', 'Ámbar', 'Zeta'];
const BOT_COLORS = ['#ff4d6d', '#3a86ff', '#2ec4b6', '#ffbe0b', '#b388ff', '#ff7b00', '#00c2ff'];
const { WALK, SPRINT, CROUCH, JUMP, GRAV, STEP, MATCH_TIME, KILL_LIMIT, RESPAWN } = S.CONST;
/* Equipos: azul (0) y rojo (1). Al entrar se reparte al azar; no hay fuego amigo y gana el equipo con más bajas. */
const TEAMS = [{ n: 'AZUL', c: '#2f7bff' }, { n: 'ROJO', c: '#ff3b48' }];
const OFFLINE_TEAM_LIMIT = 60;   // [PARTIDAS] igual que online
let teamLimit = OFFLINE_TEAM_LIMIT;
const tdot = t => '<i class="tdot t' + (t === 1 ? 1 : 0) + '"></i>';

/* =====================================================================
   Escena 3D
   ===================================================================== */
const canvas = $('#c');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('#glWarn').hidden = false; $('#play').disabled = true;
}
if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const FOG = 0xffd9c0;
scene.fog = new THREE.Fog(FOG, 70, 230);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

/* =====================================================================
   Aspecto visual: cielo, luces, texturas procedurales y materiales
   (todo se dibuja en el navegador; no se usa ningún recurso externo)
   ===================================================================== */
function rngSeed(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const strHash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      hor: { value: new THREE.Color('#bfe4ff') }, mid: { value: new THREE.Color('#5aa8ff') }, top: { value: new THREE.Color('#2f80ff') }, bot: { value: new THREE.Color('#9fc8ee') },
      sunDir: { value: new THREE.Vector3(0.5, 0.6, 0.35).normalize() }, sunCol: { value: new THREE.Color('#fff1c9') }
    },
    vertexShader: 'varying vec3 dir; void main(){ dir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 hor; uniform vec3 mid; uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 dir;' +
      'void main(){ vec3 d = normalize(dir); float h = d.y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.28, h)); c = mix(c, top, smoothstep(0.2, 0.85, h));' +
      ' if (h < 0.0) c = mix(hor, bot, smoothstep(0.0, 0.25, -h));' +
      ' float s = max(dot(d, normalize(sunDir)), 0.0); c += sunCol * (pow(s, 1400.0) * 4.0 + pow(s, 70.0) * 0.32 + pow(s, 7.0) * 0.08);' +
      ' gl_FragColor = vec4(c, 1.0); }'
  })
);
scene.add(sky);

// nubes de bloques que siguen a la cámara y avanzan despacio
const cloudRoot = new THREE.Group(); sky.add(cloudRoot);
(function () {
  const R = rngSeed(11), white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), shade = new THREE.MeshBasicMaterial({ color: 0xe3ecff, fog: false });
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group(), a = R() * TAU, r = 140 + R() * 110, n = 3 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(16 + R() * 26, 5 + R() * 5, 12 + R() * 16), k === 0 ? shade : white);
      m.position.set(k * 13 - n * 6.5 + R() * 8, k === 0 ? -2 : R() * 4, R() * 12 - 6); g.add(m);
    }
    g.position.set(Math.cos(a) * r, 52 + R() * 60, Math.sin(a) * r); g.rotation.y = R() * TAU; cloudRoot.add(g);
  }
})();

/* [GRÁFICOS] Calidad alta (por defecto, salvo en equipos sin tarjeta gráfica): sombras más nítidas y texturas al doble de resolución.
   Se cambia en Ajustes → «Calidad gráfica alta» y se aplica al recargar. El ajuste automático de rendimiento sigue funcionando igual. */
const HQ = cfg.hq != null ? !!cfg.hq : !(renderer && isSoftwareGL());
const hemi = new THREE.HemisphereLight(0xffffff, 0x9fb0ff, 0.66); scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff1c9, 0.88);
sunLight.position.set(52, 92, 34); scene.add(sunLight, sunLight.target);
sunLight.shadow.mapSize.set(HQ ? 4096 : 2048, HQ ? 4096 : 2048);
const fillLight = new THREE.DirectionalLight(0xbfd4ff, 0.22); fillLight.position.set(-40, 30, -60); scene.add(fillLight);   // [GRÁFICOS] luz de relleno fría desde el lado contrario al sol: las caras en sombra ya no quedan planas
Object.assign(sunLight.shadow.camera, { left: -78, right: 78, top: 78, bottom: -78, near: 10, far: 280 });
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.06;
function isSoftwareGL() {
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return /swiftshader|llvmpipe|software|softpipe/i.test(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''); } catch (e) { return false; }
}
function applyShadows() {
  const on = !!(renderer && renderer.shadowMap && cfg.shadows && !qShadowsOff);   // [NUEVO] qShadowsOff = apagadas automáticamente por rendimiento (no se guarda en los ajustes)
  if (renderer && renderer.shadowMap) { renderer.shadowMap.enabled = on; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  sunLight.castShadow = on;
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
}

/* --- Texturas procedurales (casi blancas: el color del material las tiñe) --- */
const rgba = (c, a) => 'rgba(' + c + ',' + a + ')';
const DK = (g, a, x, y, w, h) => { g.fillStyle = rgba('0,0,0', a); g.fillRect(x, y, w, h); };
const LT = (g, a, x, y, w, h) => { g.fillStyle = rgba('255,255,255', a); g.fillRect(x, y, w, h); };
const white = (g, S) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); };
function speckle(g, S, R, n, amax, big) {
  for (let i = 0; i < n; i++) { const x = R() * S, y = R() * S, s = 1 + R() * (big || 2); if (R() < 0.55) DK(g, R() * amax, x, y, s, s); else LT(g, R() * amax * 0.7, x, y, s, s); }
}
function crack(g, R, x, y, len) {
  g.strokeStyle = rgba('0,0,0', 0.38); g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < 5; i++) { x += (R() - 0.5) * len * 0.5; y += R() * len * 0.3; g.lineTo(x, y); } g.stroke();
}
function blocks(g, S, R, rows, minW, maxW, bevel) {
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -R() * minW;
    while (x < S) {
      let w = minW + R() * (maxW - minW); const y = r * rh;
      DK(g, 0.02 + R() * 0.14, x, y, w, rh); LT(g, 0.3, x + 2, y + 2, w - 4, bevel); LT(g, 0.16, x + 2, y + 2, bevel, rh - 4);
      DK(g, 0.24, x + 2, y + rh - 2 - bevel, w - 4, bevel); DK(g, 0.18, x + w - 2 - bevel, y + 2, bevel, rh - 4);
      DK(g, 0.55, x, y, w, 3); DK(g, 0.55, x, y, 3, rh);
      if (R() < 0.28) crack(g, R, x + R() * w, y + 6, 26);
      x += w;
    }
  }
}
const TEX = {
  brick: { tile: 3.2, draw(g, S, R) {
    white(g, S); const rows = 8, bh = S / rows, bw = S / 4;
    for (let r = 0; r < rows; r++) { const off = (r % 2) * bw / 2; for (let c = -1; c < 5; c++) { const x = c * bw + off, y = r * bh;
      DK(g, 0.03 + R() * 0.17, x, y, bw, bh); LT(g, 0.34, x + 3, y + 3, bw - 6, 2); DK(g, 0.22, x + 3, y + bh - 5, bw - 6, 2); } }
    for (let r = 0; r < rows; r++) { const off = (r % 2) * bw / 2; DK(g, 0.5, 0, r * bh, S, 3); for (let c = -1; c < 5; c++) DK(g, 0.5, c * bw + off, r * bh, 3, bh); }
    speckle(g, S, R, 600, 0.2);
  } },
  stone: { tile: 4, draw(g, S, R) { white(g, S); blocks(g, S, R, 4, 56, 118, 3); speckle(g, S, R, 800, 0.16); } },
  sand: { tile: 4, draw(g, S, R) {
    white(g, S); blocks(g, S, R, 3, 96, 150, 2);
    for (let i = 0; i < 46; i++) DK(g, 0.02 + R() * 0.05, 0, R() * S, S, 1 + R() * 3);
    for (let i = 0; i < 40; i++) DK(g, 0.1 + R() * 0.15, R() * S, R() * S, 2 + R() * 5, 2 + R() * 2);
    speckle(g, S, R, 900, 0.14);
  } },
  metal: { tile: 2.6, draw(g, S, R) {
    white(g, S);
    for (let i = 0; i < 16; i++) { const x = i * 16; LT(g, 0.2, x, 0, 3, S); DK(g, 0.07, x + 3, 0, 6, S); DK(g, 0.3, x + 9, 0, 5, S); }
    for (let i = 0; i < 26; i++) DK(g, 0.05 + R() * 0.1, R() * S, 16 + R() * 90, 2 + R() * 5, 30 + R() * 130);
    DK(g, 0.42, 0, 0, S, 13); DK(g, 0.42, 0, S - 13, S, 13); LT(g, 0.34, 0, 13, S, 2); LT(g, 0.34, 0, S - 15, S, 2); DK(g, 0.3, 0, 11, S, 2);
    for (let x = 8; x < S; x += 32) { LT(g, 0.55, x, 4, 4, 4); LT(g, 0.55, x, S - 9, 4, 4); }
    DK(g, 0.28, 0, 0, 4, S); DK(g, 0.28, S - 4, 0, 4, S);
    speckle(g, S, R, 500, 0.2);
  } },
  crate: { tile: 0, draw(g, S, R) {
    white(g, S);
    for (let i = 0; i < 5; i++) { DK(g, 0.04 + R() * 0.12, 0, i * S / 5, S, S / 5); DK(g, 0.5, 0, i * S / 5, S, 3); }
    for (let i = 0; i < 70; i++) DK(g, 0.06 + R() * 0.08, R() * S, R() * S, 10 + R() * 60, 1);
    for (let i = 26; i < S - 26; i += 3) { DK(g, 0.3, i - 13, i - 13, 26, 26); }
    for (let i = 26; i < S - 26; i += 3) { LT(g, 0.18, i - 13, i - 14, 26, 1); }
    DK(g, 0.34, 0, 0, S, 28); DK(g, 0.34, 0, S - 28, S, 28); DK(g, 0.34, 0, 0, 28, S); DK(g, 0.34, S - 28, 0, 28, S);
    LT(g, 0.32, 0, 0, S, 3); LT(g, 0.32, 0, 0, 3, S); DK(g, 0.5, 26, 26, S - 52, 2); DK(g, 0.5, 26, S - 28, S - 52, 2);
    [[10, 10], [S - 18, 10], [10, S - 18], [S - 18, S - 18]].forEach(([x, y]) => { DK(g, 0.7, x, y, 8, 8); LT(g, 0.6, x + 1, y + 1, 3, 3); });
  } },
  wood: { tile: 2, draw(g, S, R) {
    white(g, S); const n = 8, ph = S / n;
    for (let i = 0; i < n; i++) { DK(g, 0.03 + R() * 0.16, 0, i * ph, S, ph); DK(g, 0.55, 0, i * ph, S, 3); LT(g, 0.22, 0, i * ph + 3, S, 2);
      for (let k = 0; k < 9; k++) DK(g, 0.08 + R() * 0.1, R() * S, i * ph + 5 + R() * (ph - 10), 20 + R() * 90, 1);
      if (R() < 0.35) { const x = R() * S, y = i * ph + ph / 2; DK(g, 0.3, x, y - 3, 9, 6); DK(g, 0.4, x + 2, y - 1, 5, 3); } }
    DK(g, 0.4, 0, 0, 3, S); speckle(g, S, R, 300, 0.14);
  } },
  bark: { tile: 2.4, draw(g, S, R) {
    white(g, S);
    for (let i = 0; i < 46; i++) { const x = R() * S, w = 3 + R() * 8; DK(g, 0.18 + R() * 0.3, x, 0, w, S); LT(g, 0.16, x + w, 0, 2, S); }
    for (let i = 0; i < 30; i++) DK(g, 0.25 + R() * 0.2, R() * S, R() * S, 4 + R() * 10, 3 + R() * 9);
    for (let i = 0; i < 16; i++) LT(g, 0.14, R() * S, R() * S, 3 + R() * 6, 10 + R() * 30);
    speckle(g, S, R, 500, 0.2);
  } },
  leaf: { tile: 3, draw(g, S, R) {
    white(g, S);
    for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 16) { const t = R(); if (t < 0.4) DK(g, 0.1 + R() * 0.25, x, y, 16, 16); else if (t > 0.78) LT(g, 0.1 + R() * 0.15, x, y, 16, 16);
      if (R() < 0.5) DK(g, 0.08 + R() * 0.2, x + (R() < 0.5 ? 0 : 8), y + (R() < 0.5 ? 0 : 8), 8, 8); }
    speckle(g, S, R, 200, 0.2, 3);
  } },
  concrete: { tile: 4, draw(g, S, R) {
    white(g, S);
    for (let i = 0; i < 9; i++) DK(g, 0.02 + R() * 0.05, R() * S, R() * S, 40 + R() * 90, 30 + R() * 80);
    DK(g, 0.4, 0, 0, S, 3); DK(g, 0.4, 0, S / 2, S, 3); DK(g, 0.4, 0, 0, 3, S); DK(g, 0.4, S / 2, 0, 3, S);
    LT(g, 0.26, 3, 3, S / 2 - 6, 2); LT(g, 0.26, S / 2 + 3, 3, S / 2 - 6, 2); LT(g, 0.26, 3, S / 2 + 3, S / 2 - 6, 2); LT(g, 0.26, S / 2 + 3, S / 2 + 3, S / 2 - 6, 2);
    speckle(g, S, R, 1100, 0.2); for (let i = 0; i < 4; i++) crack(g, R, R() * S, R() * S * 0.7, 30);
  } },
  tile: { tile: 8, draw(g, S, R) {
    white(g, S); const n = 4, ts = S / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const x = c * ts, y = r * ts; DK(g, (r + c) % 2 ? 0.1 : 0.0, x, y, ts, ts); DK(g, R() * 0.05, x, y, ts, ts);
      LT(g, 0.45, x + 3, y + 3, ts - 6, 2); LT(g, 0.3, x + 3, y + 3, 2, ts - 6); DK(g, 0.25, x + 3, y + ts - 5, ts - 6, 2); DK(g, 0.2, x + ts - 5, y + 3, 2, ts - 6);
      DK(g, 0.72, x, y, ts, 3); DK(g, 0.72, x, y, 3, ts); }
    speckle(g, S, R, 500, 0.14);
  } },
  grass: { tile: 8, draw(g, S, R) {
    white(g, S);
    for (let i = 0; i < 34; i++) { g.fillStyle = rgba(R() < 0.5 ? '0,0,0' : '255,255,255', 0.05 + R() * 0.06); g.beginPath(); g.arc(R() * S, R() * S, 16 + R() * 40, 0, TAU); g.fill(); }
    for (let i = 0; i < 1800; i++) { const x = R() * S, y = R() * S, l = 3 + R() * 7; if (R() < 0.6) DK(g, 0.1 + R() * 0.28, x, y, 1 + R(), l); else LT(g, 0.12 + R() * 0.25, x, y, 1 + R(), l); }
  } },
  sandfloor: { tile: 8, draw(g, S, R) {
    white(g, S);
    for (let y = 0; y < S; y += 10) for (let x = 0; x < S; x += 4) { const yy = y + Math.sin((x / S) * TAU * 2 + y * 0.31) * 3; DK(g, 0.06, x, yy, 4, 2); LT(g, 0.16, x, yy + 2, 4, 1); }
    for (let i = 0; i < 20; i++) { g.fillStyle = rgba('0,0,0', 0.03); g.beginPath(); g.arc(R() * S, R() * S, 20 + R() * 40, 0, TAU); g.fill(); }
    speckle(g, S, R, 1100, 0.16);
  } },
  concfloor: { tile: 8, draw(g, S, R) {
    white(g, S);
    for (let i = 0; i < 12; i++) DK(g, 0.02 + R() * 0.05, R() * S, R() * S, 40 + R() * 100, 30 + R() * 90);
    DK(g, 0.34, 0, 0, S, 4); DK(g, 0.34, 0, S / 2, S, 4); DK(g, 0.34, 0, 0, 4, S); DK(g, 0.34, S / 2, 0, 4, S);
    LT(g, 0.22, 0, 4, S, 2); LT(g, 0.22, 0, S / 2 + 4, S, 2);
    for (let i = 0; i < 5; i++) { g.fillStyle = rgba('20,20,30', 0.07); g.beginPath(); g.ellipse(R() * S, R() * S, 8 + R() * 16, 5 + R() * 9, R() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 3; i++) DK(g, 0.05, R() * S, 0, 6 + R() * 6, S);
    speckle(g, S, R, 1300, 0.2);
  } },
  awning: { tile: 2, draw(g, S, R, color) {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : color; g.fillRect(i * 32, 0, 32, S); }
    for (let i = 0; i < 8; i++) { LT(g, 0.16, i * 32, 0, 5, S); DK(g, 0.14, i * 32 + 22, 0, 10, S); }
    for (let i = 0; i < 3; i++) DK(g, 0.1, 0, R() * S, S, 6); speckle(g, S, R, 300, 0.12);
  } },
  roof: { tile: 3, draw(g, S, R) {
    white(g, S); const rows = 12, rh = S / rows, sw = 32;
    for (let r = 0; r < rows; r++) { const off = (r % 2) * sw / 2; for (let c = -1; c < S / sw + 1; c++) { const x = c * sw + off, y = r * rh;
      DK(g, 0.04 + R() * 0.2, x, y, sw, rh); LT(g, 0.3, x + 2, y + 1, sw - 4, 2); DK(g, 0.5, x, y + rh - 4, sw, 4); DK(g, 0.4, x, y, 2, rh); } }
    speckle(g, S, R, 400, 0.16);
  } },
  glass: { tile: 3.2, draw(g, S, R) {   // fachada de cristal: paneles con marco oscuro y reflejos en diagonal (se tiñe con el color de la caja)
    white(g, S); const n = 4, p = S / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = c * p, y = r * p; DK(g, 0.05 + R() * 0.12, x, y, p, p); LT(g, 0.24, x + 9, y + 9, p - 30, 5); LT(g, 0.16, x + 9, y + 16, 5, p - 38);
      for (let k = 0; k < 4; k++) LT(g, 0.12, x + 16 + k * 9, y + p - 22 - k * 9, 8, 3);
    }
    for (let i = 0; i < n; i++) { DK(g, 0.55, i * p - 3, 0, 6, S); DK(g, 0.55, 0, i * p - 3, S, 6); } DK(g, 0.55, S - 3, 0, 3, S); DK(g, 0.55, 0, S - 3, S, 3);
  } },
  helipad: { tile: 9, raw: true, draw(g, S) {   // helipuerto: asfalto gris, borde y anillo amarillos y una «H» blanca. Lleva sus propios colores (raw): no se tiñe.
    g.fillStyle = '#6f7787'; g.fillRect(0, 0, S, S); g.fillStyle = '#7a8293'; for (let i = 0; i < 16; i++) g.fillRect((i * 53) % S, (i * 37) % S, 30, 5);
    g.strokeStyle = '#ffd23f'; g.lineWidth = 12; g.strokeRect(9, 9, S - 18, S - 18); g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff'; const h = S * 0.27, w = 20; g.fillRect(S / 2 - h * 0.7, S / 2 - h, w, h * 2); g.fillRect(S / 2 + h * 0.7 - w, S / 2 - h, w, h * 2); g.fillRect(S / 2 - h * 0.7, S / 2 - w / 2, h * 1.4, w);
  } },
  /* [NUEVO] patrones de skins de armas: en blanco y negro, como el resto de TEX — el color de la skin los tiñe al aplicarse (mismo mecanismo que ya usa el mapa) */
  carbono: { tile: 1, draw(g, S, R) {   // trenzado de fibra de carbono: cuadros a cuadros con un brillo diagonal
    white(g, S); const cell = S / 10;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) { const x = c * cell, y = r * cell, dark = (r + c) % 2 === 0;
      DK(g, dark ? 0.22 : 0.08, x, y, cell, cell); LT(g, dark ? 0.05 : 0.16, x + 1, y + 1, cell - 2, cell - 2); }
    for (let i = -10; i < 20; i++) LT(g, 0.05, i * cell * 1.4, 0, 3, S);
    speckle(g, S, R, 300, 0.08);
  } },
  camuflaje: { tile: 1, draw(g, S, R) {   // manchas irregulares de camuflaje, 3 tonos
    white(g, S); LT(g, 0.06, 0, 0, S, S);
    for (let i = 0; i < 26; i++) { const x = R() * S, y = R() * S, s = 18 + R() * 34; g.beginPath();
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = s * (0.6 + R() * 0.5); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; k === 0 ? g.moveTo(px, py) : g.lineTo(px, py); }
      g.closePath(); g.fillStyle = rgba('0,0,0', 0.1 + R() * 0.22); g.fill(); }
    speckle(g, S, R, 500, 0.1);
  } },
  /* [NEÓN] Patrones que emiten luz: líneas blancas sobre negro. Se usan como emissiveMap (el color lo pone la skin),
     así las líneas se ven encendidas aunque el arma esté a la sombra. */
  n_circuito: { tile: 1, raw: true, draw(g, S, R) {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'square';
    for (let k = 0; k < 16; k++) { let x = Math.round(R() * 8) * S / 8, y = Math.round(R() * 8) * S / 8; g.beginPath(); g.moveTo(x, y);
      for (let st = 0; st < 5; st++) { if (R() < 0.5) x += (R() < 0.5 ? -1 : 1) * S / 8; else y += (R() < 0.5 ? -1 : 1) * S / 8; g.lineTo(x, y); }
      g.stroke(); g.fillRect(x - 7, y - 7, 14, 14); }
  } },
  n_grietas: { tile: 1, raw: true, draw(g, S, R) {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.lineJoin = 'round';
    const crack = (x, y, a, len, w, depth) => { g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 6; i++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6; g.lineTo(x, y);
        if (depth < 2 && R() < 0.3) { g.stroke(); crack(x, y, a + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.6), len * 0.55, w * 0.6, depth + 1); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); } }
      g.stroke(); };
    for (let k = 0; k < 6; k++) crack(R() * S, R() * S, R() * Math.PI * 2, S * (0.45 + R() * 0.35), 4 + R() * 2, 0);
  } },
  n_hex: { tile: 1, raw: true, draw(g, S) {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.lineWidth = 3.5; const r = S / 8, h = r * Math.sqrt(3);
    for (let row = -1; row < 7; row++) for (let col = -1; col < 7; col++) { const cx = col * r * 1.5, cy = row * h + (col % 2 ? h / 2 : 0);
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; const px = cx + Math.cos(a) * r * 0.92, py = cy + Math.sin(a) * r * 0.92; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.stroke(); }
  } },
  n_rayas: { tile: 1, raw: true, draw(g, S) {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.save(); g.translate(S / 2, S / 2); g.rotate(-0.55); g.translate(-S, -S); g.fillStyle = '#fff';
    for (let k = 0; k < 14; k++) { g.fillRect(0, k * S / 7, S * 2, k % 3 === 0 ? 10 : 4); } g.restore();
  } },
  rayas: { tile: 1, draw(g, S, R) {   // dos franjas diagonales gruesas, estilo carreras
    white(g, S); g.save(); g.translate(S / 2, S / 2); g.rotate(-0.5); g.translate(-S / 2, -S / 2);
    DK(g, 0.5, S * 0.18, -S * 0.5, S * 0.16, S * 2); DK(g, 0.28, S * 0.42, -S * 0.5, S * 0.09, S * 2);
    g.restore(); speckle(g, S, R, 250, 0.07);
  } }
};
/* [GRÁFICOS] grano fino (poros, arena, desgaste) y manchas grandes muy suaves: rompe la repetición de la textura sin cambiar su dibujo */
function grain(g, S, R) {
  for (let i = 0; i < 8; i++) { const x = R() * S, y = R() * S, r = S * (0.08 + R() * 0.16), gr = g.createRadialGradient && g.createRadialGradient(x, y, 0, x, y, r); if (!gr || !gr.addColorStop) break; gr.addColorStop(0, R() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const n = S * S / 90; for (let i = 0; i < n; i++) { const a = R(); g.fillStyle = a < 0.5 ? 'rgba(0,0,0,' + (0.03 + R() * 0.07) + ')' : 'rgba(255,255,255,' + (0.03 + R() * 0.06) + ')'; g.fillRect(R() * S | 0, R() * S | 0, 1, 1); }
}
const texCache = {};
function getTex(name, arg) {
  const key = name + (arg || ''); if (texCache[key]) return texCache[key];
  const S = HQ ? 512 : 256, c = document.createElement('canvas'); c.width = c.height = S;
  const R = rngSeed(strHash(key)); TEX[name].draw(c.getContext('2d'), S, R, arg);
  if (TEX[name].tile > 1 && !TEX[name].raw) grain(c.getContext('2d'), S, R);   // [GRÁFICOS] grano fino y manchas suaves en las texturas del mapa
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (renderer) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return (texCache[key] = t);
}

const matCache = {};
const mat = c => matCache[c] || (matCache[c] = new THREE.MeshLambertMaterial({ color: c }));
const mapMats = {};
function mapMat(type, color) {
  const key = type + '|' + color; if (mapMats[key]) return mapMats[key];
  const aw = type === 'awning';
  return (mapMats[key] = new THREE.MeshLambertMaterial({ map: getTex(type, aw ? color : undefined), color: aw ? '#ffffff' : color, vertexColors: true }));
}
const farMats = {};
const farMat = c => farMats[c] || (farMats[c] = new THREE.MeshLambertMaterial({ color: c, vertexColors: true }));

/* UV en metros (la textura se repite igual en cualquier tamaño) y oclusión ambiental de vértice */
function worldUV(geo, w, h, d, tile, off) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v, du = tile ? dims[f][0] / tile : 1, dv = tile ? dims[f][1] / tile : 1;
    uv.setXY(i, uv.getX(i) * du + (tile ? off[0] : 0), uv.getY(i) * dv + (tile ? off[1] : 0));
  }
}
function shadeBox(geo, bottom, tint) {   // tint: color de la caja, que va en los vértices junto con el sombreado
  const pos = geo.attributes.position, nor = geo.attributes.normal, col = new Float32Array(pos.count * 3), tr = tint ? tint.r : 1, tg = tint ? tint.g : 1, tb = tint ? tint.b : 1;
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i); let k = 1;
    if (ny < -0.5) k = bottom * 0.75; else if (ny < 0.5 && pos.getY(i) < 0) k = bottom;
    col[i * 3] = k * tr; col[i * 3 + 1] = k * tg; col[i * 3 + 2] = k * tb;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
/* Qué material lleva cada caja del mapa según su forma y su posición */
function pickType(L, cx, y0, cz, w, h, d) {
  const big = Math.max(w, d), small = Math.min(w, d), far = Math.hypot(cx, cz) > 12;
  if (h >= 8 && big >= 30) return L.wall;
  if (L.trunk && w <= 1.6 && d <= 1.6 && h >= 5) return L.trunk;
  if (L.leaf && y0 >= 5 && h <= 2.2 && w >= 3) return L.leaf;
  if (h <= 0.5 && big >= 4 && small >= 2.5 && y0 >= 2) return (y0 >= 3.5 && L.roof) ? L.roof : (L.awning || L.block);
  if (L.crate && w <= 2.6 && d <= 2.6 && h >= 1 && h <= 2.6) return L.crate;
  if (L.metal && big >= 6 && h >= 2 && h <= 3.2 && small <= 3.2) return L.metal;
  if (L.rock && Math.abs(w - 3) < 0.01 && Math.abs(d - 3) < 0.01 && h <= 1.7 && y0 === 0) return L.rock;
  if (L.hill && h <= 0.6 && big >= 6 && far) return L.hill;
  if (L.plat && h >= 2 && small >= 8) return L.plat;
  return L.block;
}

/* --- Contenedor del mapa, suelo y decoración --- */
const mapGroup = new THREE.Group(); scene.add(mapGroup);
const outMesh = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: '#8f7bff' }));
outMesh.rotation.x = -Math.PI / 2; outMesh.position.y = -0.05; outMesh.receiveShadow = false; scene.add(outMesh);
let colliders = [], mapHalf = 40, waypoints = [], curMap = -1, curLook = null, uvR = rngSeed(3), curSpawns = null, curNav = null;

/* =====================================================================
   [NUEVO] MAPA EN LOTES (menos draw calls): antes cada caja del mapa y de la decoración era su propia THREE.Mesh (200–400 por mapa, y otras tantas en el pase de sombras).
   Ahora cada caja se convierte en geometría ya colocada, se agrupa por MATERIAL y por tipo de sombra, y al terminar el mapa cada grupo se fusiona en UNA sola malla
   (mergeGeometries, propio: esta versión de Three.js no trae BufferGeometryUtils). El color de cada caja pasa a color por vértice (el shader ya multiplica
   color de material × color de vértice, así que el resultado es idéntico): en vez de un material por color hay un material por textura. Resultado: de ~300 mallas
   a ~10–15 por mapa. No se usa InstancedMesh porque las cajas tienen tamaños distintos y su textura se repite según el tamaño (UV en metros).
   ===================================================================== */
const MAX_BATCH_VERTS = 60000;   // por malla, para no pasar de 65.535 vértices (índices de 16 bits)
const boxBatches = new Map(), colorOf = (() => { const cache = {}; return c => cache[c] || (cache[c] = new THREE.Color(c)); })(), WHITE = new THREE.Color(1, 1, 1);
function mergeGeometries(geos) {
  const first = geos[0], names = Object.keys(first.attributes); let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const a = first.attributes[n], arr = new Float32Array(vCount * a.itemSize); let off = 0;
    for (const g of geos) { arr.set(g.attributes[n].array, off); off += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize));
  }
  const idx = new Uint16Array(iCount); let io = 0, vo = 0;
  for (const g of geos) { const src = g.index.array; for (let i = 0; i < src.length; i++) idx[io++] = src[i] + vo; vo += g.attributes.position.count; }
  out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
const vcMats = {};   // un material por textura (y por color solo en los toldos, cuya textura lleva el color): el color de cada caja va en los vértices
function vcMat(kind, type, color) {
  const aw = kind === 'tex' && type === 'awning', key = kind + '|' + (type || '') + (aw ? '|' + color : ''); if (vcMats[key]) return vcMats[key];
  return (vcMats[key] = kind === 'tex' ? new THREE.MeshLambertMaterial({ map: getTex(type, aw ? color : undefined), color: '#ffffff', vertexColors: true })
    : kind === 'basic' ? new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true }) : new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }));
}
function queueBox(material, cast, recv, geo) {
  const k = material.uuid + (cast ? 'c' : '-') + (recv ? 'r' : '-'); let b = boxBatches.get(k);
  if (!b) boxBatches.set(k, b = { material, cast, recv, geos: [], verts: 0 });
  b.geos.push(geo); b.verts += geo.attributes.position.count;
}
function flushBoxes() {
  let boxes = 0;
  for (const b of boxBatches.values()) {
    for (let i = 0; i < b.geos.length;) {   // varias mallas solo si un lote pasa de 60.000 vértices
      let n = 0, v = 0; while (i + n < b.geos.length && (v + b.geos[i + n].attributes.position.count) <= MAX_BATCH_VERTS) { v += b.geos[i + n].attributes.position.count; n++; }
      const mesh = new THREE.Mesh(mergeGeometries(b.geos.slice(i, i + n)), b.material); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mapGroup.add(mesh);
      i += n; boxes += n;
    }
    for (const g of b.geos) g.dispose();
  }
  boxBatches.clear(); return boxes;
}

function addMesh(cx, y0, cz, w, h, d, color, solid, tag) {
  const geo = new THREE.BoxGeometry(w, h, d), c = colorOf(color);
  if (!solid) { shadeBox(geo, 0.55, c); geo.deleteAttribute('uv'); geo.translate(cx, y0 + h / 2, cz); queueBox(vcMat('far'), false, false, geo); return; }
  const type = tag && TEX[tag] ? tag : pickType(curLook, cx, y0, cz, w, h, d);   // [NUEVO] el mapa puede fijar la textura de una caja (cristal, helipuerto…)
  worldUV(geo, w, h, d, TEX[type].tile, TEX[type].raw ? [0, 0] : [uvR(), uvR()]); shadeBox(geo, y0 <= 0.05 ? 0.6 : 0.8, (type === 'awning' || TEX[type].raw) ? WHITE : c);   // [GRÁFICOS] lo que toca el suelo se oscurece más abajo (sombra de contacto)
  geo.translate(cx, y0 + h / 2, cz); queueBox(vcMat('tex', type, color), true, true, geo);
}
function floorTex(type, worldSize) {
  const t = getTex(type).clone(); t.needsUpdate = true; const r = worldSize / TEX[type].tile; t.repeat.set(r, r); return t;
}
function setFloor(m, L) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(m.half * 2, m.half * 2), new THREE.MeshLambertMaterial({ map: floorTex(L.floor, m.half * 2), color: m.floor[0] }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.own = true; mapGroup.add(floor);
  if (outMesh.material.map) outMesh.material.map.dispose();
  outMesh.material.map = floorTex(L.outFloor || L.floor, 700); outMesh.material.color.set(m.out); outMesh.material.needsUpdate = true;
}
const decoBox = (cx, y0, cz, w, h, d, color, basic, noCast) => {   // [NUEVO] va a un lote (una malla por material y sombra), no a una malla propia
  const geo = new THREE.BoxGeometry(w, h, d); shadeBox(geo, !basic && y0 <= 0.05 && h > 0.3 ? 0.7 : 1, colorOf(color)); geo.deleteAttribute('uv'); geo.translate(cx, y0 + h / 2, cz);
  queueBox(vcMat(basic ? 'basic' : 'lit'), !basic && !noCast && h > 0.9, false, geo);
};
/* [GRÁFICOS] Pieza decorativa que proyecta y RECIBE sombra (molduras, ventanas, losas del suelo): así no brilla cuando le cae la sombra de una casa */
const decoRecv = (cx, y0, cz, w, h, d, color) => { const geo = new THREE.BoxGeometry(w, h, d); shadeBox(geo, y0 <= 0.05 && h > 0.3 ? 0.75 : 1, colorOf(color)); geo.deleteAttribute('uv'); geo.translate(cx, y0 + h / 2, cz); queueBox(vcMat('lit'), true, true, geo); };
/* [GRÁFICOS] Detalle arquitectónico automático: cada edificio macizo del mapa recibe zócalo, moldura y cornisa (solo decoración, sin colisión) */
function archDetail(L, half) {
  if (!L.trimBase) return; const T = { base: L.trimBase, top: L.trimTop };
  for (const c of colliders) {
    const w = c.maxX - c.minX, d = c.maxZ - c.minZ, h = c.maxY - c.minY;
    if (c.minY > 0.05 || h < 2.8 || Math.min(w, d) < 2.5 || Math.max(w, d) > half * 1.9) continue;
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2, top = c.maxY;
    decoRecv(cx, 0, cz, w + 0.14, 0.4, d + 0.14, T.base);                 // zócalo
    decoRecv(cx, top - 0.44, cz, w + 0.14, 0.1, d + 0.14, T.base);        // moldura
    const e = 0.4;   // cornisa: un borde alrededor del tejado (no tapa la textura de arriba)
    decoRecv(cx, top - 0.26, c.minZ + e / 2 - 0.15, w + 0.3, 0.3, e, T.top); decoRecv(cx, top - 0.26, c.maxZ - e / 2 + 0.15, w + 0.3, 0.3, e, T.top);
    decoRecv(c.minX + e / 2 - 0.15, top - 0.26, cz, e, 0.3, d - 0.5, T.top); decoRecv(c.maxX - e / 2 + 0.15, top - 0.26, cz, e, 0.3, d - 0.5, T.top);
  }
}
function decorate(L, m) {
  const half = m.half, R = rngSeed(strHash(m.name));
  archDetail(L, half);
  const wallTop = (color, step) => { // almenas sobre el muro perimetral
    const y = L.wallH;
    for (let s = -half + 1; s <= half - 1; s += step) {
      decoBox(s, y, -half - 0.5, step * 0.5, 1.5, 1.0, color); decoBox(s, y, half + 0.5, step * 0.5, 1.5, 1.0, color);
      decoBox(-half - 0.5, y, s, 1.0, 1.5, step * 0.5, color); decoBox(half + 0.5, y, s, 1.0, 1.5, step * 0.5, color);
    }
  };
  const free = (x, z, r) => !S.overlapAt(colliders, x, 0, z, r, 1.8);
  if (L.decor === 'castle') {
    wallTop('#a78bfa', 4);
    const flags = ['#ff4d6d', '#ffd23f', '#2ec4b6', '#4cc9f0'];
    [-24, -8, 8, 24].forEach((x, i) => { [-1, 1].forEach(s => { decoBox(x, 4.2, s * (half - 0.08), 3, 5, 0.14, flags[(i + (s > 0 ? 2 : 0)) % 4]); decoBox(x, 9.1, s * (half - 0.1), 3.4, 0.18, 0.2, '#2a1b3d'); }); });
    decoBox(0, 3.6, 0, 0.16, 5.2, 0.16, '#2a1b3d'); decoBox(0.95, 7.4, 0, 1.8, 1.05, 0.06, '#ff4d6d', true);
    [[28, 28], [-28, 28], [28, -28], [-28, -28]].forEach(([x, z]) => { decoBox(x, 5, z, 0.2, 2.4, 0.2, '#2a1b3d'); decoBox(x, 7.4, z, 1.2, 0.5, 1.2, '#ffd23f', true); });
  } else if (L.decor === 'desert') {
    wallTop('#ffcf7a', 4);
    const cactus = (x, z) => { const h = 2.4 + R() * 1.4; decoBox(x, 0, z, 0.7, h, 0.7, '#22b573'); decoBox(x - 0.55, 1.0 + R() * 0.5, z, 0.9, 0.45, 0.45, '#22b573'); decoBox(x - 0.85, 1.0, z, 0.45, 1.0, 0.45, '#22b573'); decoBox(x + 0.5, 1.5, z, 0.8, 0.4, 0.4, '#22b573'); decoBox(x + 0.75, 1.5, z, 0.4, 0.8, 0.4, '#22b573'); };
    for (let i = 0; i < 16; i++) { const t = (R() - 0.5) * (half * 2 - 8), e = (half - 2.5 - R() * 2) * (R() < 0.5 ? 1 : -1), x = i % 2 ? t : e, z = i % 2 ? e : t; if (free(x, z, 1.2)) cactus(x, z); }
    for (let i = 0; i < 18; i++) { const x = (R() - 0.5) * (half * 2 - 6), z = (R() - 0.5) * (half * 2 - 6); if (free(x, z, 0.8)) decoBox(x, 0, z, 0.7 + R() * 0.7, 0.4 + R() * 0.5, 0.7 + R() * 0.7, R() < 0.5 ? '#c98b52' : '#d9a066'); }
    const pen = ['#12c2b3', '#ff7b00', '#ff4d6d', '#ffd23f']; for (let s = -half + 3; s <= half - 3; s += 6) { decoBox(s, 8.2, -half + 0.05, 1.2, 1.6, 0.06, pen[(s + half) / 6 & 3]); decoBox(s, 8.2, half - 0.05, 1.2, 1.6, 0.06, pen[((s + half) / 6 + 1) & 3]); }
  } else if (L.decor === 'port') {
    wallTop('#b3bed4', 6);
    for (let x = -38; x <= 38; x += 6) { [-17.5, 17.5, 0].forEach(z => decoBox(x, 0.0, z, 3, 0.04, 0.28, '#ffd23f', true)); }
    for (let z = -38; z <= 38; z += 6) { [-31, 31].forEach(x => decoBox(x, 0.0, z, 0.28, 0.04, 3, '#ffffff', true)); }
    const lamp = (x, z) => { decoBox(x, 0, z, 0.25, 7, 0.25, '#38425a'); decoBox(x, 7, z, 1.4, 0.3, 0.7, '#fff3b0', true); };
    [[-38, -38], [38, -38], [-38, 38], [38, 38], [0, -39], [0, 39], [-39, 0], [39, 0]].forEach(([x, z]) => lamp(x, z));
    const bar = ['#e63946', '#1d6cf2', '#ffbe0b']; for (let i = 0; i < 26; i++) { const x = (R() - 0.5) * 78, z = (R() - 0.5) * 78; if (free(x, z, 0.9)) { const c = bar[i % 3]; decoBox(x, 0, z, 0.85, 1.15, 0.85, c); decoBox(x, 1.15, z, 0.87, 0.08, 0.87, '#2a2f45'); decoBox(x, 0.55, z, 0.89, 0.08, 0.89, '#2a2f45'); } }
    for (let i = 0; i < 6; i++) { const x = (R() - 0.5) * 70, z = (R() - 0.5) * 70; if (free(x, z, 1)) { decoBox(x, 0, z, 1.5, 0.15, 1.5, '#8a6a3e'); decoBox(x, 0.15, z, 1.3, 0.9, 1.3, '#c98b52'); } }
  } else if (L.decor === 'forest') {
    wallTop('#7dff8a', 3);
    const pet = ['#ff4d6d', '#ffd23f', '#ffffff', '#b388ff', '#ff9f1c'];
    for (let i = 0; i < 190; i++) {
      const x = (R() - 0.5) * (half * 2 - 4), z = (R() - 0.5) * (half * 2 - 4); if (!free(x, z, 0.4)) continue;
      const k = R();
      if (k < 0.5) decoBox(x, 0, z, 0.3, 0.45 + R() * 0.35, 0.3, R() < 0.5 ? '#2fdc59' : '#1fbf4a');
      else if (k < 0.8) { decoBox(x, 0, z, 0.08, 0.55, 0.08, '#1a9e46'); decoBox(x, 0.5, z, 0.26, 0.26, 0.26, pet[Math.floor(R() * pet.length)]); }
      else if (k < 0.92) { decoBox(x, 0, z, 0.14, 0.3, 0.14, '#f3ead7'); decoBox(x, 0.28, z, 0.42, 0.16, 0.42, '#e63946'); }
      else { decoBox(x, 0, z, 1.3 + R(), 0.9 + R() * 0.6, 1.3 + R(), '#98a4bd'); }
    }
    for (let i = 0; i < 14; i++) { const a = R() * TAU, r = half - 3, x = Math.max(-half + 2, Math.min(half - 2, Math.cos(a) * r * 1.2)), z = Math.max(-half + 2, Math.min(half - 2, Math.sin(a) * r * 1.2)); if (free(x, z, 1.3)) { decoBox(x, 0, z, 1.9, 1.3, 1.9, '#1f9d55'); decoBox(x, 1.3, z, 1.3, 0.6, 1.3, '#39d96a'); } }
  } else if (L.decor === 'duna') {   // [MAPAS 2] pueblo del desierto: almenas, palmeras, ventanas, alfombras, farolillos, ropa tendida y cerámica
    wallTop('#e3c28a', 4);
    const palm = (x, z, s) => { for (let k = 0; k < 5; k++) decoBox(x + Math.sin(k * 0.7) * 0.18 * s, k * 1.1 * s, z, 0.5 * s, 1.1 * s, 0.5 * s, k % 2 ? '#8a5a34' : '#7a4f2d', false, true);
      const y = 5.5 * s; decoBox(x, y, z, 0.8 * s, 0.6 * s, 0.8 * s, '#5a3a1e', false, true); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { decoBox(x + dx * 1.3 * s, y + 0.2 * s, z + dz * 1.3 * s, dx ? 2.6 * s : 0.7 * s, 0.14 * s, dz ? 2.6 * s : 0.7 * s, '#3faa3a', false, true); decoBox(x + dx * 2.5 * s, y - 0.3 * s, z + dz * 2.5 * s, dx ? 0.9 * s : 0.6 * s, 0.4 * s, dz ? 0.9 * s : 0.6 * s, '#2f8f2f', false, true); } };
    [[-41, -41], [41, -41], [-41, 41], [41, 41], [-31, 33], [31, 33], [-35, -33], [35, -33], [-16, 8.5], [16, -8.5]].forEach(([x, z]) => palm(x, z, 0.9 + R() * 0.3));
    for (let i = 0; i < 26; i++) { const t = (R() - 0.5) * (half * 2 - 6), e = (half - 2 - R() * 2) * (R() < 0.5 ? 1 : -1), x = i % 2 ? t : e, z = i % 2 ? e : t; if (free(x, z, 0.9)) decoBox(x, 0, z, 0.6 + R() * 0.5, 0.35 + R() * 0.4, 0.6 + R() * 0.5, R() < 0.5 ? '#c98b52' : '#d9a066'); }   // piedras y dunas pequeñas junto al muro
    const win = (x, y, z, alongX) => {   // [GRÁFICOS] ventana con marco, reja, alféizar, dintel y postigos
      const W = (a, b) => (alongX ? a : b), sh = ['#3f7fbf', '#3f9f6a', '#b3542f'][Math.abs(Math.round(x + z)) % 3];
      decoRecv(x, y - 0.1, z, W(1.4, 0.1), 1.45, W(0.1, 1.4), '#e9d3a8'); decoRecv(x, y, z, W(1.1, 0.12), 1.2, W(0.12, 1.1), '#2a1d14');
      decoRecv(x, y + 0.55, z, W(1.1, 0.14), 0.06, W(0.14, 1.1), '#5a3a1e'); decoRecv(x, y, z, W(0.06, 0.14), 1.2, W(0.14, 0.06), '#5a3a1e');
      decoRecv(x, y - 0.18, z, W(1.6, 0.26), 0.12, W(0.26, 1.6), '#c9a26a'); decoRecv(x, y + 1.25, z, W(1.6, 0.18), 0.16, W(0.18, 1.6), '#b89868');
      for (const k of [-1, 1]) decoRecv(x + (alongX ? k * 0.85 : 0), y - 0.05, z + (alongX ? 0 : k * 0.85), W(0.55, 0.14), 1.3, W(0.14, 0.55), sh);
    };
    for (const sx of [-1, 1]) {
      for (const a of [8, 11, 20, 23]) win(sx * a, 1.8, -11.95, true);   // fachadas de la plaza
      for (const a of [7, 17, 21]) win(sx * a, 1.8, 11.95, true);
      for (const a of [12, 20]) win(sx * a, 2.2, -31.95, true);
      decoBox(sx * 19, 0.6, -11.9, 2.2, 2.6, 0.06, ['#b3542f', '#3f7fbf'][(sx + 1) / 2], false, true);   // alfombras colgadas
      decoBox(sx * 31, 0, -15.55, 1.4, 2.3, 0.1, '#5a3a1e', false, true); decoBox(sx * 31, 0, 15.55, 1.4, 2.3, 0.1, '#5a3a1e', false, true);   // puertas
      for (const z of [-24, 24]) { decoBox(sx * 3.8, 0, z, 0.5, 0.7, 0.5, '#b86a3a'); decoBox(sx * 3.8, 0.7, z, 0.34, 0.22, 0.34, '#9a5226'); }   // tinajas
    }
    for (const z of [-22, 23]) { decoBox(0, 3.9, z, 44, 0.04, 0.04, '#5a3a1e', false, true); for (let x = -20; x <= 20; x += 2.5) decoBox(x, 3.35, z, 0.9, 0.55, 0.05, ['#ff4d6d', '#ffd23f', '#3fb8e6', '#ffffff', '#8ae234'][Math.round((x + 20) / 2.5 + (z > 0 ? 2 : 0)) % 5], false, true); }   // ropa tendida
    /* [GRÁFICOS] suelo: losas de piedra alrededor del pozo, calzada del mercado */
    for (let x = -9.5; x <= 9.5; x += 1) for (let z = -9.5; z <= 9.5; z += 1) { const r = Math.hypot(x, z); if (r < 2.3 || r > 9.2 || !free(x, z, 0.3)) continue; decoRecv(x + (R() - 0.5) * 0.08, 0, z + (R() - 0.5) * 0.08, 0.86 + R() * 0.08, 0.025, 0.86 + R() * 0.08, ['#cdbb97', '#bfae8c', '#d8c7a3', '#b5a483'][Math.floor(R() * 4)]); }
    for (let x = -30; x <= 30; x += 1.2) for (const z of [22.8, 24, 25.2]) if (free(x, z, 0.3)) decoRecv(x, 0, z + (R() - 0.5) * 0.1, 1.08, 0.022, 1.08, ['#c8b48f', '#b9a582', '#d3c09a'][Math.floor(R() * 3)]);
    for (const [x, z] of [[-6, -12.2], [6, -12.2], [-6, 12.2], [6, 12.2], [0, 36.8], [-14, 36.2], [14, 36.2]]) { decoBox(x, 3.2, z, 0.06, 0.5, 0.06, '#3a2a1e', false, true); decoBox(x, 2.75, z, 0.4, 0.45, 0.4, '#ffb347', true); }   // farolillos
  } else if (L.decor === 'villa') {   // [MAPAS 2] villa de verano: fondo de la piscina, sombrillas, palmeras, ventanas y guirnalda de luces
    wallTop('#ffffff', 3);
    const W = L.water; decoBox((W.x0 + W.x1) / 2, 0.005, (W.z0 + W.z1) / 2, W.x1 - W.x0, 0.02, W.z1 - W.z0, '#2fa7d9', true);
    for (const z of [-3.5, 0, 3.5]) decoBox(0, 0.03, z, W.x1 - W.x0 - 3, 0.02, 0.35, '#1e6fa8', true);   // calles de la piscina
    for (let x = W.x0 + 1; x <= W.x1 - 1; x += 1) { decoBox(x, 0.42, W.z0 - 0.3, 0.46, 0.012, 0.12, x % 2 ? '#2fa7d9' : '#ffffff', true); decoBox(x, 0.42, W.z1 + 0.3, 0.46, 0.012, 0.12, x % 2 ? '#2fa7d9' : '#ffffff', true); }   // gresite del borde
    const palm = (x, z, s) => { for (let k = 0; k < 5; k++) decoBox(x + Math.sin(k * 0.7) * 0.18 * s, k * 1.1 * s, z, 0.5 * s, 1.1 * s, 0.5 * s, k % 2 ? '#8a5a34' : '#7a4f2d', false, true);
      const y = 5.5 * s; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { decoBox(x + dx * 1.3 * s, y + 0.2 * s, z + dz * 1.3 * s, dx ? 2.6 * s : 0.7 * s, 0.14 * s, dz ? 2.6 * s : 0.7 * s, '#3faa3a', false, true); decoBox(x + dx * 2.5 * s, y - 0.3 * s, z + dz * 2.5 * s, dx ? 0.9 * s : 0.6 * s, 0.4 * s, dz ? 0.9 * s : 0.6 * s, '#2f8f2f', false, true); } };
    [[-37, -37], [37, -37], [-37, 37], [37, 37], [-20, -10], [20, 10], [-20, 12], [20, -12]].forEach(([x, z]) => palm(x, z, 0.85 + R() * 0.3));
    const umb = (x, z, c) => { decoBox(x, 0, z, 0.1, 2.4, 0.1, '#e9edf5', false, true); decoBox(x, 2.3, z, 2.6, 0.12, 2.6, c, false, true); decoBox(x, 2.42, z, 1.8, 0.12, 1.8, c, false, true); decoBox(x, 2.54, z, 0.9, 0.12, 0.9, '#ffffff', false, true); };
    for (const sx of [-1, 1]) { umb(sx * 7.5, -11, '#ff7a59'); umb(sx * 7.5, 11, '#3fb8e6'); umb(sx * 11, 30.5, '#ffd23f'); }
    for (const x of [-18, -12, 12, 18]) { decoBox(x, 0.8, -21.95, 1.8, 2, 0.08, '#8fd8ff', false, true); decoBox(x, 0.7, -21.95, 2.1, 0.12, 0.12, '#ffffff', false, true); }   // ventanas de la planta baja
    decoBox(0, 0, -21.95, 2.6, 2.8, 0.1, '#7a4a25', false, true);
    for (let x = -23; x <= 23; x += 1) decoBox(x, 4.9 - Math.abs(Math.sin(x * 0.55)) * 0.3, -22.3, 0.16, 0.16, 0.16, ['#ffd23f', '#ff7a59', '#3fb8e6', '#8ae234'][(x + 23) % 4], true);   // guirnalda de luces
    /* [GRÁFICOS] jardín con césped en franjas, camino de losas hasta el bar y marcos en las ventanas */
    for (let x = -38; x < 38; x += 4) decoRecv(x + 2, 0, 28.5, 4, 0.02, 22.6, (x / 4) % 2 ? '#5fbf4a' : '#57b344');
    for (let z = 8.5; z <= 26; z += 1.6) decoRecv((R() - 0.5) * 0.3, 0, z, 1.3, 0.035, 0.9, ['#d9d2c3', '#c9c1b0', '#e6dfd0'][Math.floor(R() * 3)]);
    for (const x of [-18, -12, 12, 18]) { decoRecv(x, 0.62, -21.9, 2.1, 0.12, 0.14, '#ffffff'); decoRecv(x, 2.8, -21.9, 2.1, 0.12, 0.14, '#ffffff'); decoRecv(x - 1.02, 0.7, -21.9, 0.1, 2.1, 0.14, '#ffffff'); decoRecv(x + 1.02, 0.7, -21.9, 0.1, 2.1, 0.14, '#ffffff'); }
    for (let i = 0; i < 60; i++) { const x = (R() - 0.5) * 70, z = 18 + R() * 20; if (free(x, z, 0.5)) { decoBox(x, 0, z, 0.08, 0.3, 0.08, '#2f8f2f'); decoBox(x, 0.28, z, 0.26, 0.2, 0.26, ['#ff4d6d', '#ffd23f', '#ffffff', '#b388ff', '#ff9f1c'][i % 5]); } }   // flores del jardín
  } else if (L.decor === 'nexus') {
    wallTop('#9aa3b2', 6);
    /* Alrededores (solo decoración, sin colisión): colinas verdes escalonadas, casas de píxeles y árboles fuera del muro, como en el croquis */
    const tree = (x, z, s) => { decoBox(x, 0, z, 0.9 * s, 3.2 * s, 0.9 * s, '#7b5330', false, true); decoBox(x, 3.2 * s, z, 3.4 * s, 2.6 * s, 3.4 * s, R() < 0.5 ? '#3fbf3a' : '#35a832', false, true); decoBox(x, 5.8 * s, z, 2.2 * s, 1.5 * s, 2.2 * s, '#4fd046', false, true); };
    const house = (x, z, w, d, c, roof) => { decoBox(x, 0, z, w, 4.2, d, c, false, true); decoBox(x, 4.2, z, w + 0.8, 0.9, d + 0.8, roof, false, true); decoBox(x + w * 0.2, 0, z - d / 2 - 0.02, 1.6, 2.6, 0.1, '#7a4a25', false, true); };
    const hill = (x, z, w) => { for (let k = 0; k < 4; k++) decoBox(x, k * 1.3, z, w - k * 4.6, 1.3, w - k * 4.6, k % 2 ? '#58cf42' : '#4fc23a', false, true); };
    hill(-74, -72, 24); hill(78, 76, 22); hill(-80, 66, 20); hill(72, -78, 26);
    [[-62, 64, 10, 9, '#e8d6a6', '#ff8a1f'], [64, 62, 9, 10, '#d9c08a', '#c9702a'], [-68, -46, 9, 9, '#c9d0da', '#ff8a1f'], [68, -52, 10, 9, '#e8d6a6', '#3a9bff'], [-60, 20, 8, 8, '#d9c08a', '#c9702a']].forEach(a => house(...a));
    for (let i = 0; i < 46; i++) { const a = R() * TAU, r = half + 8 + R() * 30, x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r * 1.05; if (Math.max(Math.abs(x), Math.abs(z)) > half + 6) tree(x, z, 0.8 + R() * 0.6); }
    /* Dentro: farolas en los callejones, balizas de las antenas, luces de los helipuertos y banderas de cada base */
    const lamp = (x, z) => { decoBox(x, 0, z, 0.25, 6, 0.25, '#38425a'); decoBox(x, 6, z, 1.3, 0.3, 0.7, '#fff3b0', true); };
    [[-46, 38], [-26, 38], [26, 38], [46, 38], [-46, 47], [46, 47], [-20, -32], [16, -32], [-46, -25]].forEach(([x, z]) => lamp(x, z));
    decoBox(45.2, 11.4, -46.8, 0.5, 0.5, 0.5, '#ff3b48', true); decoBox(46.8, 11.4, -46.8, 0.5, 0.5, 0.5, '#ff3b48', true);
    [[-44, -47.5], [-35.3, -47.5], [-44, -38.8], [-35.3, -38.8], [-9, -47.5], [-0.3, -47.5], [-9, -38.8], [-0.3, -38.8]].forEach(([x, z]) => decoBox(x, 5.46, z, 0.35, 0.3, 0.35, '#ffd23f', true));
    const flag = (x, z, c) => { decoBox(x, 0, z, 0.2, 5, 0.2, '#39435a'); decoBox(x + 0.9, 3.4, z, 1.6, 1.1, 0.06, c, true); };
    flag(-49.4, -15.5, '#ff3b48'); flag(-49.4, 10.5, '#ff3b48'); flag(47.6, -15.5, '#2f7bff'); flag(47.6, 10.5, '#2f7bff');   // [MAPA] junto a las bases nuevas, en el borde que mira al centro
    for (let i = 0; i < 8; i++) { decoBox(-7.4 + i * 1.9, 0, 41.5, 0.9, 0.05, 1.2, i % 2 ? '#ffd23f' : '#39435a', true); }   // franjas de peligro a la entrada del túnel
  }
}
function buildMap(i) {
  const m = MAPS[i], L = m.look; curMap = i; mapHalf = m.half; curLook = L; uvR = rngSeed(31 + i);
  mapGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.userData.own && o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  while (mapGroup.children.length) mapGroup.remove(mapGroup.children[0]);
  const u = sky.material.uniforms, top = new THREE.Color(m.sky[0]), hor = new THREE.Color(m.sky[1]);
  u.top.value.copy(top); u.hor.value.copy(hor); u.mid.value.copy(top).lerp(hor, 0.42); u.bot.value.copy(hor).multiplyScalar(0.86);
  u.sunCol.value.set(L.sun); sunLight.color.set(L.sun); scene.fog.color.set(m.fog);
  hemi.color.set(top).lerp(new THREE.Color('#ffffff'), 0.72); hemi.groundColor.set(m.floor[0]).lerp(new THREE.Color('#9fb0ff'), 0.45);   // [GRÁFICOS] el rebote de luz toma el color del suelo de cada mapa
  setFloor(m, L);
  const world = S.buildWorld(i, addMesh);
  colliders = world.colliders; waypoints = world.waypoints; curSpawns = world.spawns; curNav = world.nav;
  decorate(L, m);
  flushBoxes();
  buildLife(L, m);   // [MAPAS 2] gallinas, balón, agua, rodadoras y polvo (aparte del mapa fusionado)   // [NUEVO] fusiona los lotes: de ~300 mallas a ~10–15
}

/* ===== [MAPAS 2] Vida del mapa: lo que se mueve y reacciona. Va en un grupo aparte (no en el mapa fusionado) y es solo
   decoración de cada navegador: no se sincroniza en el online (cada jugador ve sus propias gallinas y su propio balón). ===== */
const mapLife = new THREE.Group(); scene.add(mapLife);
const life = { chickens: [], ball: null, water: null, floats: [], weeds: [], dust: null, last: new Map(), splashT: 0 };
function colorMesh(parts, basic) {   // varias cajas de colores en UNA malla (color por vértice)
  const geos = parts.map(([w, h, d, x, y, z, c]) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z); const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const shade = g.attributes.normal.getY(i) > 0.5 ? 1 : g.attributes.normal.getY(i) < -0.5 ? 0.6 : 0.82; a[i * 3] = col.r * shade; a[i * 3 + 1] = col.g * shade; a[i * 3 + 2] = col.b * shade; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; });
  let n = 0; geos.forEach(g => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(out, basic ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true })); m.castShadow = true; return m;
}
function lifeTex(key, draw, n) { const c = document.createElement('canvas'); c.width = c.height = n || 64; draw(c.getContext('2d'), c.width); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function clearLife() {
  mapLife.traverse(o => { if (o.userData.shared) return; if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  while (mapLife.children.length) mapLife.remove(mapLife.children[0]);
  life.chickens = []; life.ball = null; life.water = null; life.floats = []; life.weeds = []; life.dust = null; life.last.clear();
}
const CHICKEN_PARTS = [[0.34, 0.3, 0.42, 0, 0.36, 0, '#f4f1ea'], [0.22, 0.24, 0.14, 0, 0.5, 0.22, '#f4f1ea'], [0.2, 0.24, 0.2, 0, 0.62, -0.2, '#f4f1ea'], [0.05, 0.09, 0.14, 0, 0.78, -0.2, '#e03a3a'],
  [0.05, 0.07, 0.04, 0, 0.51, -0.31, '#e03a3a'], [0.09, 0.06, 0.1, 0, 0.61, -0.34, '#ffae33'], [0.21, 0.045, 0.045, 0, 0.66, -0.25, '#15151a'], [0.04, 0.2, 0.28, 0.19, 0.38, 0.02, '#dcd6c8'], [0.04, 0.2, 0.28, -0.19, 0.38, 0.02, '#dcd6c8'],
  [0.045, 0.22, 0.045, 0.08, 0.1, 0, '#ffae33'], [0.045, 0.22, 0.045, -0.08, 0.1, 0, '#ffae33'], [0.1, 0.03, 0.14, 0.08, 0.01, -0.03, '#ffae33'], [0.1, 0.03, 0.14, -0.08, 0.01, -0.03, '#ffae33']];
const CHICKEN = (() => { const m = colorMesh(CHICKEN_PARTS); return { geo: m.geometry, mat: m.material }; })();   // se crea una vez al cargar: todas las gallinas comparten geometría y material
function lifeSpot(maxAbsX) {   // un punto de paso libre, lejos de las bases
  for (let k = 0; k < 40; k++) { const w = waypoints[Math.floor(Math.random() * waypoints.length)]; if (w && Math.abs(w[0]) <= maxAbsX && !overlapAt(w[0], 0, w[1], 0.3, 0.6)) return w; }
  return [0, 6];
}
function buildLife(L, m) {
  clearLife();
  if (L.decor === 'duna') {
    for (let i = 0; i < 7; i++) { const mesh = new THREE.Mesh(CHICKEN.geo, CHICKEN.mat), sp = lifeSpot(28); mesh.castShadow = true; mesh.userData.shared = true; const c = { mesh, pos: new THREE.Vector3(sp[0], 0, sp[1]), yaw: Math.random() * TAU, tx: sp[0], tz: sp[1], state: 'peck', t: Math.random() * 2, alive: true, respawn: 0, hop: 0 }; mesh.position.copy(c.pos); mapLife.add(mesh); life.chickens.push(c); }
    const ballTex = lifeTex('ball', (g, n) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n); g.fillStyle = '#15151a'; for (const [x, y] of [[8, 12], [40, 12], [24, 36], [56, 40], [8, 52]]) { g.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU - Math.PI / 2; g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); } g.fill(); } });
    const bm = new THREE.Mesh(new THREE.SphereGeometry(0.33, 18, 12), new THREE.MeshLambertMaterial({ map: ballTex })); bm.castShadow = true; mapLife.add(bm);
    life.ball = { mesh: bm, home: new THREE.Vector3(0, 0, 6), e: { pos: new THREE.Vector3(0, 0, 6), vel: new THREE.Vector3(), hw: 0.3, h: 0.6, onGround: true }, cd: 0 };
    for (let i = 0; i < 3; i++) { const g = new THREE.Group(), mat1 = new THREE.MeshLambertMaterial({ color: '#a97a45' }); g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat1)); const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshLambertMaterial({ color: '#7a5530' })); inner.rotation.set(0.6, 0.3, 0); g.add(inner); mapLife.add(g); life.weeds.push({ g, z: [-26, 4.5, 26][i], x: -m.half + i * 30, v: 2.4 + i * 0.7 }); }
  }
  if (L.decor === 'duna' || L.decor === 'villa') {   // motas de polvo o de polen que flotan con el viento
    const n = 260, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * m.half * 2; pos[i * 3 + 1] = 0.3 + Math.random() * 7; pos[i * 3 + 2] = (Math.random() - 0.5) * m.half * 2; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: L.decor === 'duna' ? '#fff0cc' : '#ffffff', size: L.decor === 'duna' ? 0.09 : 0.06, transparent: true, opacity: 0.7, depthWrite: false }));
    mapLife.add(pts); life.dust = { pts, half: m.half };
  }
  if (L.water) {
    const W = L.water, rip = lifeTex('water', (g, n) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n); g.strokeStyle = 'rgba(40,120,170,.35)'; g.lineWidth = 2; for (let i = 0; i < 9; i++) { g.beginPath(); const y = i * 7 + 3; for (let x = 0; x <= n; x += 4) g.lineTo(x, y + Math.sin(x * 0.2 + i) * 2.5); g.stroke(); } });
    rip.repeat.set((W.x1 - W.x0) / 3, (W.z1 - W.z0) / 3);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W.x1 - W.x0, W.z1 - W.z0), new THREE.MeshLambertMaterial({ color: '#63d4ff', map: rip, transparent: true, opacity: 0.62, depthWrite: false }));
    water.rotation.x = -Math.PI / 2; water.position.set((W.x0 + W.x1) / 2, W.y, (W.z0 + W.z1) / 2); water.renderOrder = 2; mapLife.add(water);
    const glint = lifeTex('glint', (g, n) => { g.clearRect(0, 0, n, n); g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 30; i++) g.fillRect((i * 37) % n, (i * 23) % n, 3 + (i % 3) * 2, 1); });
    glint.repeat.set((W.x1 - W.x0) / 4, (W.z1 - W.z0) / 4);
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(W.x1 - W.x0, W.z1 - W.z0), new THREE.MeshBasicMaterial({ map: glint, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    shine.rotation.x = -Math.PI / 2; shine.position.set(water.position.x, W.y + 0.01, water.position.z); shine.renderOrder = 3; mapLife.add(shine);
    life.water = { W, rip, glint };
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 8, 16), new THREE.MeshLambertMaterial({ color: '#ff5a5a' })); ring.rotation.x = -Math.PI / 2; mapLife.add(ring);
    const bb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshLambertMaterial({ map: lifeTex('bball', (g, n) => { ['#ff4d6d', '#ffffff', '#3fb8e6', '#ffd23f', '#ffffff', '#8ae234'].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * n / 6, 0, n / 6 + 1, n); }); }) })); mapLife.add(bb);
    life.floats = [{ m: ring, x: -6, z: 2, ph: 0, vx: 0.3, vz: 0.15, r: 0.12 }, { m: bb, x: 6, z: -2, ph: 1.7, vx: -0.25, vz: 0.2, r: 0.3 }];
  }
}
function cluck(p) { if (!camera || camera.position.distanceTo(p) > 16) return; tone(1100, 700, 0.05, 'square', 0.025); tone(1000, 650, 0.06, 'square', 0.02, 0.09); }
/* Un disparo (tuyo) que pasa por una gallina o por el balón: la gallina estalla en plumas y el balón sale despedido */
function shootLife(o, d, maxT) {
  for (const c of life.chickens) {
    if (!c.alive) continue; const t = raySphere(o, d, { x: c.pos.x, y: c.pos.y + 0.42, z: c.pos.z }, 0.32);
    if (t < maxT) { c.alive = false; c.mesh.visible = false; c.respawn = 18 + Math.random() * 10; burst(new THREE.Vector3(c.pos.x, c.pos.y + 0.45, c.pos.z), '#ffffff', 12, 3.2); burst(new THREE.Vector3(c.pos.x, c.pos.y + 0.45, c.pos.z), '#e03a3a', 3, 2); cluck(c.pos); return; }
  }
  const b = life.ball; if (b) { const t = raySphere(o, d, { x: b.e.pos.x, y: b.e.pos.y + 0.33, z: b.e.pos.z }, 0.34); if (t < maxT) { b.e.vel.x += d.x * 7; b.e.vel.z += d.z * 7; b.e.vel.y = Math.max(b.e.vel.y, 2.5); b.e.onGround = false; } }
}
const _lq = new THREE.Quaternion(), _lax = new THREE.Vector3();
function animMap(dt) {
  if (!mapLife.children.length) return;
  dt = Math.min(dt, 0.05); const tt = performance.now() / 1000;
  const alive = fighters.filter(f => f.alive && f.pos);
  const velOf = f => { const l = life.last.get(f); const v = l ? { x: (f.pos.x - l.x) / Math.max(dt, 1e-3), z: (f.pos.z - l.z) / Math.max(dt, 1e-3) } : { x: 0, z: 0 }; return v; };
  /* gallinas: pasean, picotean y huyen de quien se acerca */
  for (const c of life.chickens) {
    if (!c.alive) { c.respawn -= dt; if (c.respawn <= 0) { const sp = lifeSpot(28); c.pos.set(sp[0], 0, sp[1]); c.tx = sp[0]; c.tz = sp[1]; c.alive = true; c.mesh.visible = true; c.state = 'peck'; c.t = 1; } continue; }
    let near = null, nd = 4.5; for (const f of alive) { const dd = Math.hypot(f.pos.x - c.pos.x, f.pos.z - c.pos.z); if (dd < nd && Math.abs(f.pos.y - c.pos.y) < 2) { nd = dd; near = f; } }
    let spd = 0, dx = 0, dz = 0;
    if (near) { if (c.state !== 'flee') { c.state = 'flee'; cluck(c.pos); } dx = c.pos.x - near.pos.x; dz = c.pos.z - near.pos.z; spd = 4.6; c.hop += dt * 16; }
    else {
      if (c.state === 'flee') { c.state = 'walk'; const sp = lifeSpot(28); c.tx = sp[0]; c.tz = sp[1]; }
      c.t -= dt;
      if (c.state === 'peck') { if (c.t <= 0) { c.state = 'walk'; const a = Math.random() * TAU, r = 2 + Math.random() * 5; c.tx = c.pos.x + Math.cos(a) * r; c.tz = c.pos.z + Math.sin(a) * r; c.t = 6; } }
      else { dx = c.tx - c.pos.x; dz = c.tz - c.pos.z; spd = 1.2; c.hop += dt * 9; if (Math.hypot(dx, dz) < 0.3 || c.t <= 0) { c.state = 'peck'; c.t = 1 + Math.random() * 2.5; spd = 0; } }
    }
    if (spd) {
      const l = Math.hypot(dx, dz) || 1, nx = c.pos.x + dx / l * spd * dt, nz = c.pos.z + dz / l * spd * dt;
      if (Math.abs(nx) < mapHalf - 1 && Math.abs(nz) < mapHalf - 1 && !overlapAt(nx, c.pos.y, nz, 0.2, 0.5)) { c.pos.x = nx; c.pos.z = nz; } else { const a = Math.random() * TAU; c.tx = c.pos.x + Math.cos(a) * 4; c.tz = c.pos.z + Math.sin(a) * 4; c.t = 3; if (c.state === 'flee') c.pos.x += (Math.random() - 0.5) * 0.1; }
      const want = Math.atan2(-dx, -dz); let dy = want - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, dt * 10);
    }
    c.mesh.position.set(c.pos.x, c.pos.y + (spd ? Math.abs(Math.sin(c.hop)) * (c.state === 'flee' ? 0.18 : 0.05) : 0), c.pos.z); c.mesh.rotation.y = c.yaw;
    c.mesh.rotation.x = c.state === 'peck' ? Math.max(0, Math.sin(tt * 9 + c.pos.x)) * 0.5 : 0;
  }
  /* balón: se chuta al pasar por encima (lo empuja cualquiera: tú, los bots o los demás jugadores), rebota en las paredes y rueda */
  const b = life.ball;
  if (b) {
    const e = b.e; b.cd -= dt;
    for (const f of alive) {
      const dx = e.pos.x - f.pos.x, dz = e.pos.z - f.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 0.72 && e.pos.y < f.pos.y + 1.2 && e.pos.y + 0.6 > f.pos.y - 0.2) {
        const fv = f.vel && (f.isPlayer || !online) ? f.vel : velOf(f), v = Math.max(Math.hypot(fv.x, fv.z), 2.2), nx = dx / (dd || 1), nz = dz / (dd || 1);
        e.pos.x = f.pos.x + nx * 0.73; e.pos.z = f.pos.z + nz * 0.73;
        if (b.cd <= 0) { e.vel.x = nx * v * 1.4; e.vel.z = nz * v * 1.4; e.vel.y = 1.8 + v * 0.18; e.onGround = false; b.cd = 0.18; }
      }
    }
    const pvx = e.vel.x, pvz = e.vel.z, pvy = e.vel.y;
    S.moveEntity(colliders, e, dt);
    if (e.vel.x === 0 && Math.abs(pvx) > 0.4) e.vel.x = -pvx * 0.6; if (e.vel.z === 0 && Math.abs(pvz) > 0.4) e.vel.z = -pvz * 0.6;
    if (e.onGround) { if (pvy < -3) { e.vel.y = -pvy * 0.42; e.onGround = false; } else { const k = Math.exp(-1.3 * dt); e.vel.x *= k; e.vel.z *= k; } }
    if (e.pos.y < -5 || Math.abs(e.pos.x) > mapHalf || Math.abs(e.pos.z) > mapHalf) { e.pos.copy(b.home); e.vel.set(0, 0, 0); }
    const sp = Math.hypot(e.vel.x, e.vel.z); if (sp > 0.05) { _lax.set(e.vel.z, 0, -e.vel.x).normalize(); _lq.setFromAxisAngle(_lax, sp * dt / 0.33); b.mesh.quaternion.premultiply(_lq); }
    b.mesh.position.set(e.pos.x, e.pos.y + 0.33, e.pos.z);
  }
  /* rodadoras empujadas por el viento */
  for (const w of life.weeds) { w.x += w.v * dt; if (w.x > mapHalf + 3) w.x = -mapHalf - 3; w.g.position.set(w.x, 0.55 + Math.abs(Math.sin(tt * 3 + w.z)) * 0.45, w.z + Math.sin(tt * 0.7 + w.v) * 1.5); w.g.rotation.z -= w.v * dt / 0.55; w.g.rotation.y += dt * 0.3; }
  /* polvo o polen a la deriva */
  if (life.dust) { const a = life.dust.pts.geometry.attributes.position, h = life.dust.half; for (let i = 0; i < a.count; i++) { let x = a.getX(i) + dt * (0.9 + (i % 5) * 0.2), y = a.getY(i) + Math.sin(tt + i) * dt * 0.15; if (x > h) x = -h; a.setX(i, x); a.setY(i, y); } a.needsUpdate = true; }
  /* agua: ondas y destellos que se mueven, flotadores que se mecen y salpicaduras al andar por la piscina */
  if (life.water) {
    const W = life.water.W; life.water.rip.offset.set(tt * 0.05, tt * 0.03); life.water.glint.offset.set(-tt * 0.04, tt * 0.06);
    for (const f of life.floats) {
      f.x += f.vx * dt; f.z += f.vz * dt; if (f.x < W.x0 + 1.2 || f.x > W.x1 - 1.2) f.vx = -f.vx; if (f.z < W.z0 + 1.2 || f.z > W.z1 - 1.2) f.vz = -f.vz;
      for (const g of alive) { const dx = f.x - g.pos.x, dz = f.z - g.pos.z, dd = Math.hypot(dx, dz); if (dd < 0.9) { f.vx += dx / (dd || 1) * 2 * dt * 10; f.vz += dz / (dd || 1) * 2 * dt * 10; } }
      f.vx *= Math.exp(-0.3 * dt); f.vz *= Math.exp(-0.3 * dt);
      f.m.position.set(f.x, W.y + f.r * 0.6 + Math.sin(tt * 1.6 + f.ph) * 0.05, f.z); f.m.rotation.z = Math.sin(tt * 1.2 + f.ph) * 0.12;
    }
    life.splashT -= dt;
    for (const f of alive) {
      if (f.pos.x > W.x0 && f.pos.x < W.x1 && f.pos.z > W.z0 && f.pos.z < W.z1 && f.pos.y < W.y) { const v = velOf(f); if (Math.hypot(v.x, v.z) > 1.5 && Math.random() < dt * 14) burst(new THREE.Vector3(f.pos.x, W.y + 0.05, f.pos.z), '#c8f2ff', 2, 2.2); }
    }
  }
  for (const f of alive) life.last.set(f, { x: f.pos.x, z: f.pos.z });
}
/* Física y rayos (compartidos con el servidor) */
const overlapAt = (x, y, z, hw, h) => S.overlapAt(colliders, x, y, z, hw, h);
const moveEntity = (e, dt) => S.moveEntity(colliders, e, dt);
const rayWorld = (o, d, t) => S.rayWorld(colliders, o, d, t);
const raySphere = S.raySphere, rayCyl = S.rayCyl;

/* =====================================================================
   Luchadores (jugador + bots)
   ===================================================================== */
function newFighter(name, isPlayer, color) {
  return { name, isPlayer, color, rl: 0, team: 0, accent: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, hp: 100, alive: false,
    kills: 0, deaths: 0, hs: 0, points: 0, streak: 0, bestStreak: 0, hw: 0.35, h: 1.8, onGround: false, protect: 0, lastAttacker: null, lastHit: -9, respawnAt: 0 };
}
let fighters = [], player = null, bots = [];
const teamKills = t => fighters.reduce((n, f) => n + (f.team === t ? f.kills : 0), 0);
const tkNow = () => (online && net.tk ? net.tk : [teamKills(0), teamKills(1)]);
let state = 'menu';        // menu | playing | paused | ended
let spawnAt = 0, quickSwapMode = false, quickSwapTimer = null;   // [NUEVO] tecla C: cambiar de arma los primeros segundos tras reaparecer
let simTime = 0, timeLeft = MATCH_TIME, locked = false, fallback = false, lockTimer = 0;
const keys = {}; let mouseL = false, mouseR = false, jumpQueued = false;   // [CONTROLES] jumpQueued: el salto se arma UNA vez por pulsación, no mientras se mantenga Espacio

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
function spreadDir(base, spread) {
  const r = spread * Math.sqrt(Math.random()), a = Math.random() * TAU;
  const up = Math.abs(base.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(base, up).normalize();
  const up2 = new THREE.Vector3().crossVectors(right, base);
  return base.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
}
function eyePos(f, out) { return out.set(f.pos.x, f.pos.y + (f.isPlayer ? f.eye : 1.6), f.pos.z); }

function hitscan(o, d, shooter, maxT) {
  let bestT = rayWorld(o, d, maxT), who = null, head = false;
  for (const f of fighters) {
    if (f === shooter || !f.alive || (shooter && f.team === shooter.team)) continue;   // los compañeros no se pueden herir
    const bodyTop = f.pos.y + f.h - 0.4;
    const hc = _v3.set(f.pos.x, f.pos.y + f.h - 0.22, f.pos.z);
    const th = raySphere(o, d, hc, 0.27);
    const tb = rayCyl(o, d, f.pos.x, f.pos.z, 0.38, f.pos.y, bodyTop);
    if (th < bestT && th <= tb + 0.05) { bestT = th; who = f; head = true; }
    else if (tb < bestT) { bestT = tb; who = f; head = false; }
  }
  return { t: bestT, f: who, head, point: new THREE.Vector3().copy(d).multiplyScalar(bestT).add(o) };
}

/* =====================================================================
   Modelos: bots, arma en primera persona, efectos
   ===================================================================== */
/* =====================================================================
   Personajes, armas y manos (modelos de bloques con detalle)
   ===================================================================== */
const BG_CACHE = {};
const BG = (w, h, d) => { const k = w + ',' + h + ',' + d; return BG_CACHE[k] || (BG_CACHE[k] = new THREE.BoxGeometry(w, h, d)); };
const basicCache = {};
const basicMat = c => basicCache[c] || (basicCache[c] = new THREE.MeshBasicMaterial({ color: c }));
const SKINS = ['#f2c9a0', '#e2ac7d', '#c98d60', '#8d5a3b', '#ffdcbc'];
const PANTS = ['#26325c', '#3a2a55', '#1f3341', '#4a3a2a', '#2d4a3e'];

const faceCache = {};
function faceTex(skin, seed) {   // [GRÁFICOS] cara a 64 px: sombras de mandíbula y mejillas, cejas, ojos con iris y brillo, nariz y labios
  const key = skin + (seed % 3); if (faceCache[key]) return faceCache[key];
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = skin; g.fillRect(0, 0, 64, 64);
  const gr = g.createLinearGradient && g.createLinearGradient(0, 0, 0, 64); if (gr && gr.addColorStop) { gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.16)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, 4, 64); g.fillRect(60, 0, 4, 64);
  g.fillStyle = 'rgba(255,90,90,.16)'; g.fillRect(8, 38, 10, 6); g.fillRect(46, 38, 10, 6);   // mejillas
  const brow = seed % 3 === 2 ? '#2a1d14' : '#3b2a20'; g.fillStyle = brow; g.fillRect(11, 19, 15, 4); g.fillRect(38, 19, 15, 4); g.fillRect(11, 18, 5, 2); g.fillRect(48, 18, 5, 2);
  g.fillStyle = '#ffffff'; g.fillRect(13, 25, 12, 10); g.fillRect(39, 25, 12, 10);
  const iris = seed % 3 === 0 ? '#2a6df4' : seed % 3 === 1 ? '#6b4423' : '#1f9d55'; g.fillStyle = iris; g.fillRect(17, 26, 7, 9); g.fillRect(43, 26, 7, 9);
  g.fillStyle = '#0b0b12'; g.fillRect(19, 28, 4, 5); g.fillRect(45, 28, 4, 5); g.fillStyle = '#ffffff'; g.fillRect(19, 28, 2, 2); g.fillRect(45, 28, 2, 2);   // pupila y brillo
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(13, 25, 12, 2); g.fillRect(39, 25, 12, 2);   // párpado
  g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(29, 34, 6, 9); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(27, 42, 10, 3);   // nariz
  g.fillStyle = '#8a3434'; g.fillRect(22, 50, 20, 4); g.fillStyle = '#b85a5a'; g.fillRect(24, 53, 16, 2); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(24, 50, 16, 1);   // labios
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return (faceCache[key] = t);
}
const chestCache = {};
function chestTex(color, style) {
  const key = color + style; if (chestCache[key]) return chestCache[key];
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, 0, 64, 4);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 58, 64, 6);
  if (style === 0) { // chaleco táctico con bolsillos
    g.fillStyle = 'rgba(20,24,40,.72)'; g.fillRect(8, 6, 48, 46); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(8, 6, 48, 3);
    g.fillStyle = 'rgba(0,0,0,.35)'; [12, 26, 40].forEach(x => { g.fillRect(x, 32, 12, 16); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, 32, 12, 2); g.fillStyle = 'rgba(0,0,0,.35)'; });
  } else if (style === 1) { // franjas
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 22, 64, 6); g.fillRect(0, 34, 64, 6);
  } else if (style === 2) { // canana de munición
    g.fillStyle = '#5a4630'; g.beginPath(); g.moveTo(4, 0); g.lineTo(20, 0); g.lineTo(60, 64); g.lineTo(44, 64); g.closePath(); g.fill();
    g.fillStyle = '#ffc857'; for (let i = 0; i < 6; i++) g.fillRect(12 + i * 7, 8 + i * 9, 5, 9);
  } else if (style === 3) { // camuflaje de hojas
    for (let i = 0; i < 70; i++) { g.fillStyle = i % 2 ? 'rgba(20,60,20,.5)' : 'rgba(150,210,110,.5)'; g.fillRect((i * 37) % 60, (i * 53) % 60, 8, 8); }
  } else if (style === 4) { // peto de soldador
    g.fillStyle = '#8a5a34'; g.fillRect(10, 10, 44, 44); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(10, 10, 44, 3); g.fillStyle = '#ffdc3a'; g.fillRect(28, 20, 8, 8);
  } else if (style === 6) { // jersey a rayas
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 6; y < 58; y += 12) g.fillRect(0, y, 64, 6);
  }
  if (style === 5 || style === 7 || style === 1 || style === 0) { // rayo de Krunxa
    g.fillStyle = '#ffdc3a'; g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(34, 8); g.lineTo(22, 30); g.lineTo(31, 30); g.lineTo(26, 52); g.lineTo(44, 24); g.lineTo(34, 24); g.lineTo(40, 8); g.closePath();
    if (style !== 0) { g.fill(); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return (chestCache[key] = t);
}
const torsoMats = {};
function torsoMat(color, style) {
  const key = color + style; if (torsoMats[key]) return torsoMats[key];
  const side = new THREE.MeshLambertMaterial({ color }), back = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.8) });
  return (torsoMats[key] = [side, side, side, mat('#26325c'), back, new THREE.MeshLambertMaterial({ map: chestTex(color, style) })]);
}
const headMats = {};
function headMat(skin, seed) {
  const key = skin + (seed % 3); if (headMats[key]) return headMats[key];
  const s = new THREE.MeshLambertMaterial({ color: skin });
  return (headMats[key] = [s, s, s, s, s, new THREE.MeshLambertMaterial({ map: faceTex(skin, seed) })]);
}

/* [ARMAS HD] Armas detalladas hechas con piezas biseladas (antes: modelos .glb de Blender con piezas sueltas, o cajas).
   Cada arma se describe como una lista de piezas con un «papel» de color (body = color del arma o de la skin, acc = detalle,
   dark = piezas oscuras, metal = acero algo más claro que dark, y colores fijos para cartuchos, lentes…). Al construirla,
   las piezas del mismo color se funden en UNA malla (pocas llamadas de dibujo aunque haya 60 piezas) y el contorno de
   cómic se hace pieza a pieza y también se funde. Medidas en metros, el cañón mira a −z y el cajón ocupa de z=0 a z=−size[2]
   con su parte de arriba en y=size[1]/2 (ahí se montan las miras, igual que antes). */
const CHAMFER_CACHE = {};
function chamferGeo(w, h, d, c) {   // caja con las aristas achaflanadas: lo que más quita el aspecto de «cubo» sin salirse del low-poly
  c = Math.min(c == null ? 0.004 : c, w * 0.3, h * 0.3, d * 0.3);
  const k = [w, h, d, c].map(v => v.toFixed(4)).join(','); if (CHAMFER_CACHE[k]) return CHAMFER_CACHE[k];
  if (c < 0.0006) return (CHAMFER_CACHE[k] = new THREE.BoxGeometry(w, h, d));
  const hw = w / 2 - c, hh = h / 2 - c, sh = new THREE.Shape();
  sh.moveTo(-hw, -hh); sh.lineTo(hw, -hh); sh.lineTo(hw, hh); sh.lineTo(-hw, hh); sh.lineTo(-hw, -hh);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(d - 2 * c) / 2); g.computeVertexNormals();
  return (CHAMFER_CACHE[k] = g);
}
const CYL_CACHE = {};
function cylGeo(r1, r2, len, seg) {   // cilindro a lo largo de z (r1 = radio del lado −z, el de la boca)
  const k = [r1, r2, len, seg].join(','); if (CYL_CACHE[k]) return CYL_CACHE[k];
  const g = new THREE.CylinderGeometry(r2, r1, len, seg || 10); g.rotateX(-Math.PI / 2);
  return (CYL_CACHE[k] = g);
}
/* Funde varias piezas { geo, m (Matrix4) } en una sola geometría con posición, normal y uv */
function mergePieces(list) {
  let n = 0; const flat = list.map(p => { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo; n += g.attributes.position.count; return { g, m: p.m }; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  let o = 0;
  for (const { g, m } of flat) {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv; nm.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++, o++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z; }
      if (U) { uv[o * 2] = U.getX(i) * 4; uv[o * 2 + 1] = U.getY(i) * 4; }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}
/* Lienzo de piezas: b() = caja biselada, c() = cilindro. rx/ry/rz en radianes. Devuelve las piezas para gunModel. */
function gunKit() {
  const parts = [], e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const put = (role, geo, x, y, z, rx, ry, rz, noLine) => { e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e); parts.push({ role, geo, noLine, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, one) }); };
  return {
    parts,
    b: (role, w, h, d, x, y, z, rx, ry, rz, c) => put(role, chamferGeo(w, h, d, c), x, y, z, rx, ry, rz),
    c: (role, r1, r2, len, x, y, z, seg, rx, ry) => put(role, cylGeo(r1, r2, len, seg), x, y, z, rx, ry, 0),
    t: (role, w, h, d, x, y, z, rx, ry, rz) => put(role, chamferGeo(w, h, d, 0), x, y, z, rx, ry, rz, true)   // detalle diminuto: sin contorno (quedaría un borrón negro)
  };
}
/* ---- Piezas comunes ---- */
function kitGrip(k, s, z, tilt, len) {   // empuñadura de pistola con estrías y talón
  const y = -s[1] / 2 - (len || 0.12) / 2 + 0.012, r = tilt == null ? -0.3 : tilt;
  k.b('dark', 0.052, len || 0.12, 0.062, 0, y, z, r, 0, 0, 0.012);
  for (let i = 0; i < 3; i++) k.t('metal', 0.054, 0.006, 0.05, 0, y + 0.03 - i * 0.025, z - 0.004 + (i * 0.025) * Math.sin(-r), r);
  k.b('metal', 0.056, 0.014, 0.07, 0, y - (len || 0.12) / 2 + 0.004, z + (len || 0.12) / 2 * Math.sin(-r), r, 0, 0, 0.004);
}
function kitTrigger(k, s, z) {   // guardamonte y gatillo
  const y0 = -s[1] / 2;
  k.b('metal', 0.014, 0.007, 0.075, 0, y0 - 0.036, z - 0.045, 0, 0, 0, 0.002);
  k.b('metal', 0.014, 0.036, 0.007, 0, y0 - 0.018, z - 0.082, 0, 0, 0, 0.002);
  k.t('acc', 0.008, 0.024, 0.008, 0, y0 - 0.014, z - 0.05, -0.3);
}
function kitMag(k, s, m, curve) {   // cargador: m = [ancho, alto, largo, z] de shared.js; curve = curvatura (0 recto)
  const [mw, mh, md, mz] = m, y0 = -s[1] / 2;
  k.b('body', mw + 0.012, 0.026, md + 0.014, 0, y0 - 0.008, mz, 0, 0, 0, 0.004);   // brocal
  const h1 = mh * 0.55, h2 = mh * 0.5;
  k.b('dark', mw, h1, md, 0, y0 - 0.02 - h1 / 2, mz - curve * 0.1, curve * 0.5, 0, 0, 0.006);
  k.b('dark', mw, h2, md, 0, y0 - 0.02 - h1 - h2 / 2 + 0.012, mz - curve * 0.16, curve * 1.2, 0, 0, 0.006);
  for (let i = 0; i < 3; i++) k.t('metal', mw + 0.003, 0.006, md * 0.8, 0, y0 - 0.045 - i * (h1 / 3), mz - curve * 0.1 - 0.004 * i, curve * 0.5);
  k.b('metal', mw + 0.006, 0.012, md + 0.006, 0, y0 - 0.02 - h1 - h2 + 0.016, mz - curve * 0.3, curve * 1.2, 0, 0, 0.003);   // base
}
function kitRail(k, s, z0, z1, x) {   // riel picatinny: base + dientes
  const top = s[1] / 2, len = z0 - z1;
  k.b('metal', (x || s[0] * 0.55), 0.008, len, 0, top + 0.004, (z0 + z1) / 2, 0, 0, 0, 0.002);
  for (let z = z0 - 0.012; z > z1 + 0.008; z -= 0.022) k.t('metal', (x || s[0] * 0.55) + 0.008, 0.005, 0.009, 0, top + 0.0095, z);
}
function kitBarrel(k, s, z0, len, r, brake) {   // cañón con bloque de gases y freno de boca
  k.c('metal', r, r, len, 0, 0.012, z0 - len / 2, 10);
  if (brake === 'supp') { k.c('dark', r * 2.1, r * 2.1, 0.11, 0, 0.012, z0 - len - 0.05, 12); k.c('metal', r * 2.2, r * 2.2, 0.012, 0, 0.012, z0 - len - 0.1, 12); return z0 - len - 0.106; }
  k.c('dark', r * 1.7, r * 1.7, 0.05, 0, 0.012, z0 - len - 0.02, 8);
  if (brake !== 'plain') for (const sx of [-1, 1]) k.t('metal', 0.006, r * 2, 0.008, sx * r * 1.7, 0.012, z0 - len - 0.02);
  return z0 - len - 0.045;
}
function kitScope(k, s, zc, len, yc, r0) {   // mira telescópica de verdad: tubo, campana, ocular, anillas y lentes
  const y = yc || s[1] / 2 + 0.05, r = r0 || 0.02;
  k.c('dark', r, r, len * 0.62, 0, y, zc, 12);
  k.c('dark', r * 1.55, r, len * 0.2, 0, y, zc - len * 0.4, 12); k.c('metal', r * 1.6, r * 1.6, 0.01, 0, y, zc - len * 0.5, 12);
  k.c('dark', r * 1.1, r * 1.35, len * 0.16, 0, y, zc + len * 0.38, 12); k.c('acc', r * 1.38, r * 1.38, 0.008, 0, y, zc + len * 0.3, 12);
  k.c('metal', 0.009, 0.009, 0.02, 0, y + r + 0.006, zc, 8, Math.PI / 2); k.c('metal', 0.009, 0.009, 0.02, r + 0.006, y, zc + 0.02, 8, 0, Math.PI / 2);   // torretas
  for (const dz of [-len * 0.22, len * 0.2]) { k.b('metal', 0.03, 0.03, 0.018, 0, y - 0.02, zc + dz, 0, 0, 0, 0.003); k.b('metal', 0.048, 0.008, 0.022, 0, s[1] / 2 + 0.008, zc + dz, 0, 0, 0, 0.002); }
  k.c('lens', r * 1.4, r * 1.4, 0.004, 0, y, zc - len * 0.505, 12); k.c('lens', r * 1.2, r * 1.2, 0.004, 0, y, zc + len * 0.465, 12);
}
function kitStock(k, s, style) {   // culata detrás del cajón (z > 0): en primera persona es lo que lleva el arma hasta la esquina de la pantalla
  const top = s[1] / 2;
  if (style === 'short') { k.b('body', s[0] * 0.85, s[1] * 0.75, 0.09, 0, top - s[1] * 0.42, 0.045, 0, 0, 0, 0.008); k.b('dark', s[0] * 0.9, s[1] * 0.85, 0.02, 0, top - s[1] * 0.45, 0.1, 0, 0, 0, 0.005); return; }   // culata corta de subfusil
  k.b('body', s[0] * 0.8, s[1] * 0.55, 0.12, 0, top - s[1] * 0.3, 0.06, 0, 0, 0, 0.008);          // cuello de la culata
  k.b('body', s[0] * 0.78, s[1] * 0.9, 0.1, 0, top - s[1] * 0.5, 0.16, 0, 0, 0, 0.01);            // culata
  k.b('dark', s[0] * 0.84, s[1] * 0.35, 0.09, 0, top - s[1] * 0.78, 0.155, 0, 0, 0, 0.006);       // parte baja oscura
  k.b('dark', s[0] * 0.86, s[1] * 0.98, 0.02, 0, top - s[1] * 0.5, 0.215, 0, 0, 0, 0.005);        // cantonera de goma
  k.b('acc', s[0] * 0.8 + 0.003, 0.008, 0.08, 0, top - s[1] * 0.25, 0.15, 0, 0, 0, 0.002);
}
/* ---- Cada familia de armas ---- */
function buildRifle(k, w, s, L, bl, o) {   // fusiles: Asalto, Centinela, Precisión
  const [sx, sy, sz] = s, top = sy / 2;
  k.b('body', sx, sy * 0.6, sz * 0.62, 0, top - sy * 0.3, -sz * 0.31, 0, 0, 0, 0.008);          // cajón superior
  const lowL = Math.max(sz * 0.46, L.mag ? -L.mag[3] + L.mag[2] / 2 + 0.01 : 0);
  k.b('body', sx * 0.88, sy * 0.46, lowL, 0, -sy * 0.26, -lowL / 2, 0, 0, 0, 0.008);      // cajón inferior (llega hasta el cargador)
  k.b('acc', sx + 0.003, 0.012, sz * 0.36, 0, top - sy * 0.22, -sz * 0.3, 0, 0, 0, 0.002);       // franja
  k.b('dark', 0.004, sy * 0.24, sz * 0.14, sx / 2 + 0.001, top - sy * 0.28, -sz * 0.2, 0, 0, 0, 0.001);   // ventana de expulsión
  k.b('metal', 0.02, 0.012, 0.03, 0.022, top - 0.012, -sz * 0.08, 0, 0, 0, 0.003);             // palanca de carga
  const hg0 = -sz * 0.62, hgL = sz * 0.38 + (o.longGuard || 0);
  k.b(o.guard || 'dark', sx * 0.96, sy * 0.8, hgL, 0, top - sy * 0.42, hg0 - hgL / 2, 0, 0, 0, 0.01);   // guardamanos
  for (let i = 0; i < 4; i++) for (const x of [-1, 1]) k.t('metal', 0.004, sy * 0.2, hgL * 0.14, x * (sx * 0.48 + 0.001), top - sy * 0.42, hg0 - hgL * (0.16 + i * 0.22));   // ranuras
  kitRail(k, s, -0.01, hg0 - hgL + 0.01);
  const tip = kitBarrel(k, s, hg0 - hgL + 0.004, Math.max(0.06, bl * 0.9 - (o.longGuard || 0)), o.r || 0.012, o.brake);
  k.b('dark', 0.026, 0.03, 0.022, 0, 0.03, hg0 - hgL - 0.02, 0, 0, 0, 0.004);                  // bloque de gases
  if (L.mag) kitMag(k, s, L.mag, o.curve == null ? 0.12 : o.curve);
  kitGrip(k, s, -0.07); kitTrigger(k, s, -0.1);
  kitStock(k, s, o.stock);
  if (L.scope) kitScope(k, s, -sz * 0.4, L.scope + 0.08);
  return tip;
}
function buildSmg(k, w, s, L, bl, o) {   // subfusiles: Ráfaga, Vórtice
  const [sx, sy, sz] = s, top = sy / 2;
  k.b('body', sx, sy, sz * 0.78, 0, 0, -sz * 0.39, 0, 0, 0, 0.01);
  k.b('dark', sx * 1.02, sy * 0.34, sz * 0.3, 0, -sy * 0.3, -sz * 0.18, 0, 0, 0, 0.005);        // bloque del gatillo
  k.b('acc', sx + 0.003, 0.01, sz * 0.5, 0, top - sy * 0.3, -sz * 0.42, 0, 0, 0, 0.002);
  k.b('acc', sx + 0.003, 0.01, sz * 0.2, 0, top - sy * 0.52, -sz * 0.55, 0, 0, 0, 0.002);
  for (let i = 0; i < 3; i++) for (const x of [-1, 1]) k.t('dark', 0.004, sy * 0.35, 0.012, x * (sx / 2 + 0.001), top - sy * 0.5, -sz * (0.62 + i * 0.07));
  k.b('dark', sx * 0.9, sy * 0.78, sz * 0.26, 0, -0.004, -sz * 0.91, 0, 0, 0, 0.01);            // funda del cañón
  kitRail(k, s, -0.012, -sz * 0.72);
  const tip = kitBarrel(k, s, -sz * 1.03, Math.max(0.05, bl * 0.55), 0.011, o.brake);
  if (L.mag) kitMag(k, s, L.mag, 0.04);
  kitGrip(k, s, -0.07); kitTrigger(k, s, -0.1);
  if (o.foregrip) { k.b('dark', 0.036, 0.075, 0.036, 0, -sy / 2 - 0.04, -sz * 0.86, 0.12, 0, 0, 0.008); k.b('metal', 0.04, 0.01, 0.04, 0, -sy / 2 - 0.078, -sz * 0.86 - 0.005, 0.12, 0, 0, 0.003); }
  kitStock(k, s, 'short');
  return tip;
}
function buildLmg(k, w, s, L, bl) {   // ametralladora: Torrente
  const [sx, sy, sz] = s, top = sy / 2;
  k.b('body', sx, sy, sz * 0.6, 0, 0, -sz * 0.3, 0, 0, 0, 0.012);
  k.b('metal', sx * 1.04, sy * 0.4, sz * 0.2, 0, top - sy * 0.2, -sz * 0.12, 0, 0, 0, 0.006);   // tapa de alimentación
  k.b('acc', sx + 0.003, 0.012, sz * 0.4, 0, -sy * 0.05, -sz * 0.32, 0, 0, 0, 0.002);
  const g0 = -sz * 0.6, gL = sz * 0.4 + 0.04;
  k.c('dark', 0.034, 0.034, gL, 0, 0.006, g0 - gL / 2, 12);                                     // camisa del cañón
  for (let i = 0; i < 5; i++) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) k.t('metal', 0.006, 0.006, 0.02, Math.cos(a) * 0.0345, 0.006 + Math.sin(a) * 0.0345, g0 - 0.03 - i * gL / 5.2);
  kitRail(k, s, -0.012, g0 + 0.01);
  const tip = kitBarrel(k, s, g0 - gL, Math.max(0.08, bl * 0.7), 0.014, 'brake');
  k.b('metal', 0.012, 0.05, 0.012, 0, top + 0.02, g0 - 0.05); k.b('metal', 0.012, 0.012, 0.1, 0, top + 0.045, g0 - 0.1); k.b('metal', 0.012, 0.05, 0.012, 0, top + 0.02, g0 - 0.15);   // asa de transporte
  for (const x of [-1, 1]) k.b('metal', 0.01, 0.01, 0.2, x * 0.02, -0.03, g0 - gL + 0.02, 0, 0, x * 0.1, 0.002);   // bípode plegado bajo el cañón
  k.b('dark', 0.05, 0.02, 0.03, 0, -0.03, g0 - gL - 0.07, 0, 0, 0, 0.004);
  if (L.mag) { const [mw, mh, md, mz] = L.mag; k.b('dark', mw, mh, md, 0, -top - mh / 2 + 0.01, mz, 0, 0, 0, 0.012); k.b('acc', mw + 0.003, 0.012, md * 0.7, 0, -top - mh * 0.35, mz, 0, 0, 0, 0.002); k.b('metal', mw + 0.004, 0.01, md + 0.004, 0, -top - mh + 0.012, mz, 0, 0, 0, 0.003); }
  kitGrip(k, s, -0.07); kitTrigger(k, s, -0.1); kitStock(k, s);
  return tip;
}
function buildShotgun(k, w, s, L, bl) {   // escopeta: Trueno
  const [sx, sy, sz] = s, top = sy / 2;
  k.b('body', sx, sy * 0.8, sz * 0.55, 0, top - sy * 0.4, -sz * 0.275, 0, 0, 0, 0.012);
  k.b('acc', sx + 0.003, 0.012, sz * 0.4, 0, top - sy * 0.18, -sz * 0.28, 0, 0, 0, 0.002);
  for (let i = 0; i < 4; i++) { k.c('shell', 0.009, 0.009, 0.034, sx / 2 + 0.008, top - sy * 0.45, -sz * (0.12 + i * 0.1), 8, 0, 0); k.c('brass', 0.0095, 0.0095, 0.012, sx / 2 + 0.008, top - sy * 0.45, -sz * (0.12 + i * 0.1) + 0.02, 8); }   // cartuchos de repuesto
  k.b('dark', 0.006, sy * 0.3, sz * 0.46, sx / 2 + 0.003, top - sy * 0.45, -sz * 0.27, 0, 0, 0, 0.002);
  const bz = -sz * 0.55, bL = sz * 0.45 + bl * 0.8;
  k.c('metal', 0.02, 0.02, bL, 0, top - 0.024, bz - bL / 2, 12);                                 // cañón
  k.c('dark', 0.016, 0.016, bL * 0.8, 0, top - 0.064, bz - bL * 0.4, 10);                         // depósito tubular
  k.c('dark', 0.024, 0.024, 0.03, 0, top - 0.024, bz - bL + 0.012, 12);
  k.b('metal', 0.006, 0.006, bL * 0.95, 0, top - 0.002, bz - bL / 2, 0, 0, 0, 0.001);            // banda de mira
  k.t('hi', 0.008, 0.008, 0.008, 0, top + 0.004, bz - bL + 0.02);
  const pz = bz - bL * 0.3;                                                                        // corredera (pump) estriada
  k.b('dark', 0.056, 0.05, 0.16, 0, top - 0.068, pz, 0, 0, 0, 0.012);
  for (let i = 0; i < 5; i++) k.t('metal', 0.059, 0.036, 0.008, 0, top - 0.068, pz - 0.06 + i * 0.03);
  kitGrip(k, s, -0.07, -0.42); kitTrigger(k, s, -0.1); kitStock(k, s);
  return bz - bL - 0.003;
}
function buildRevolver(k, w, s, L, bl) {   // revólver: Sheriff
  const [sx, sy, sz] = s, top = sy / 2, dz = -sz * 0.5;
  k.b('body', sx, sy * 0.78, sz, 0, top - sy * 0.39, -sz / 2, 0, 0, 0, 0.01);
  k.c('dark', 0.036, 0.036, 0.07, 0, 0.004, dz, 12);                                             // tambor
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; k.t('metal', 0.008, 0.008, 0.074, Math.cos(a) * 0.034, 0.004 + Math.sin(a) * 0.034, dz); }   // estrías
  k.c('metal', 0.012, 0.012, 0.02, 0, 0.004, dz - 0.044, 10);
  const bL = Math.max(0.12, bl * 0.55);
  k.c('metal', 0.013, 0.013, bL, 0, top - 0.018, -sz - bL / 2 + 0.01, 10);                       // cañón
  k.b('body', 0.02, 0.014, bL, 0, top - 0.004, -sz - bL / 2 + 0.01, 0, 0, 0, 0.003);            // costilla
  k.c('dark', 0.006, 0.006, bL * 0.55, 0, top - 0.042, -sz - bL * 0.28, 8);                       // varilla
  k.t('hi', 0.006, 0.012, 0.01, 0, top + 0.006, -sz - bL + 0.02);
  k.b('dark', 0.016, 0.03, 0.02, 0, top + 0.006, 0.004, 0.4, 0, 0, 0.004);                        // martillo
  k.b('dark', 0.05, 0.13, 0.052, 0, -sy / 2 - 0.05, 0.005, -0.5, 0, 0, 0.016);                   // cachas
  for (const x of [-1, 1]) k.t('acc', 0.004, 0.02, 0.02, x * 0.026, -sy / 2 - 0.04, 0.0, -0.5);   // medallones
  k.b('metal', 0.052, 0.016, 0.03, 0, -sy / 2 - 0.1, 0.035, -0.5, 0, 0, 0.004);
  kitTrigger(k, s, -0.03);
  return -sz - bL + 0.005;
}
function buildPistol(k, w, s, L, bl) {   // pistola: Dúo
  const [sx, sy, sz] = s, top = sy / 2;
  k.b('body', sx, sy * 0.52, sz + 0.03, 0, top - sy * 0.26, -sz / 2 - 0.015, 0, 0, 0, 0.007);    // corredera
  for (let i = 0; i < 5; i++) for (const x of [-1, 1]) k.t('dark', 0.003, sy * 0.36, 0.005, x * (sx / 2 + 0.0005), top - sy * 0.26, -0.012 - i * 0.011);   // estrías
  k.b('dark', 0.004, sy * 0.2, 0.03, sx / 2 + 0.0005, top - sy * 0.2, -sz * 0.45, 0, 0, 0, 0.001);
  k.b('dark', sx * 0.92, sy * 0.5, sz * 0.9, 0, -sy * 0.2, -sz * 0.47, 0, 0, 0, 0.006);           // armazón
  k.b('acc', sx + 0.003, 0.008, sz * 0.5, 0, -sy * 0.1, -sz * 0.55, 0, 0, 0, 0.002);
  k.c('metal', 0.009, 0.009, 0.03, 0, top - sy * 0.26, -sz - 0.03, 10);
  k.t('hi', 0.006, 0.01, 0.008, 0, top + 0.004, -sz - 0.01); k.t('dark', 0.02, 0.01, 0.008, 0, top + 0.004, -0.01);
  k.b('dark', 0.046, 0.12, 0.056, 0, -sy / 2 - 0.045, -0.02, -0.25, 0, 0, 0.012);
  k.b('body', 0.048, 0.07, 0.04, 0, -sy / 2 - 0.045, -0.02, -0.25, 0, 0, 0.01);
  kitTrigger(k, s, -0.05);
  return -sz - 0.046;
}
function buildAk(k, w, s, L, bl) {   // AK: cajón estampado, madera y cargador muy curvo
  const [sx, sy, sz] = s, top = sy / 2;
  k.b('body', sx, sy, 0.36, 0, 0, -0.18, 0, 0, 0, 0.008);                                          // cajón
  k.b('metal', sx * 0.8, 0.014, 0.3, 0, top + 0.004, -0.19, 0, 0, 0, 0.004);                       // tapa
  for (let i = 0; i < 4; i++) k.t('metal', sx * 0.82, 0.006, 0.01, 0, top + 0.012, -0.08 - i * 0.05);   // nervios de la tapa
  k.b('dark', 0.004, sy * 0.3, 0.09, sx / 2 + 0.001, top - sy * 0.32, -0.16, 0, 0, 0, 0.001);    // ventana
  k.b('metal', 0.01, 0.018, 0.12, sx / 2 + 0.004, top - sy * 0.5, -0.2, 0, 0, 0, 0.002);         // selector
  k.b('acc', sx + 0.003, 0.01, 0.2, 0, -sy * 0.16, -0.2, 0, 0, 0, 0.002);
  k.b('wood', 0.086, 0.074, 0.22, 0, -0.014, -0.47, 0, 0, 0, 0.012);                               // guardamanos de madera
  k.b('woodDk', 0.07, 0.032, 0.22, 0, 0.045, -0.47, 0, 0, 0, 0.008);
  for (let i = 0; i < 3; i++) for (const x of [-1, 1]) k.t('woodDk', 0.004, 0.03, 0.03, x * 0.044, -0.014, -0.4 - i * 0.06);
  k.c('metal', 0.012, 0.012, 0.26, 0, 0.038, -0.49, 8);                                            // tubo de gases
  k.b('metal', 0.035, 0.04, 0.03, 0, 0.025, -0.6, 0, 0, 0, 0.005);                                  // bloque de gases
  const tip = kitBarrel(k, s, -0.58, Math.max(0.1, bl * 0.9), 0.014, 'brake');
  k.b('metal', 0.012, 0.035, 0.014, 0, 0.05, tip + 0.06, 0, 0, 0, 0.003);                          // poste de mira
  k.b('wood', 0.056, 0.13, 0.066, 0, -top - 0.058, -0.08, -0.3, 0, 0, 0.014);                     // empuñadura de madera
  kitTrigger(k, s, -0.11);
  const mz = -0.25, y0 = -top;                                                                      // cargador «banana» en 3 tramos
  k.b('dark', 0.05, 0.08, 0.08, 0, y0 - 0.035, mz, 0.1, 0, 0, 0.008);
  k.b('dark', 0.05, 0.08, 0.08, 0, y0 - 0.1, mz - 0.018, 0.3, 0, 0, 0.008);
  k.b('dark', 0.05, 0.07, 0.08, 0, y0 - 0.16, mz - 0.05, 0.5, 0, 0, 0.008);
  for (let i = 0; i < 3; i++) k.t('metal', 0.053, 0.006, 0.06, 0, y0 - 0.04 - i * 0.06, mz - 0.01 * i * i, 0.1 + i * 0.2);
  k.b('wood', sx * 0.8, sy * 1.0, 0.18, 0, -0.02, 0.1, -0.12, 0, 0, 0.012);                        // culata de madera
  k.b('woodDk', sx * 0.84, sy * 1.15, 0.02, 0, -0.035, 0.19, -0.12, 0, 0, 0.004);
  return tip;
}
function buildSniper(k, w, s, L, bl) {   // francotirador: Lince (la mira va en la altura que usa el zoom, ver OPTICS.scope)
  const [sx, sy, sz] = s, top = sy / 2;
  k.b('body', sx, sy, sz * 0.45, 0, 0, -sz * 0.225, 0, 0, 0, 0.008);                             // cajón
  k.b('body', sx * 1.1, sy * 1.05, sz * 0.5, 0, -0.004, -sz * 0.7, 0, 0, 0, 0.012);              // guardamanos flotante
  for (let i = 0; i < 5; i++) for (const x of [-1, 1]) k.t('dark', 0.004, sy * 0.4, sz * 0.05, x * (sx * 0.55 + 0.001), -0.004, -sz * (0.52 + i * 0.075));
  k.b('acc', sx + 0.003, 0.01, sz * 0.35, 0, top - sy * 0.3, -sz * 0.24, 0, 0, 0, 0.002);
  k.b('metal', 0.05, 0.018, 0.018, 0.045, 0.02, -sz * 0.3, 0, 0, 0, 0.004); k.b('hi', 0.03, 0.03, 0.03, 0.078, 0.02, -sz * 0.3, 0, 0, 0, 0.008);   // cerrojo
  const tip = kitBarrel(k, s, -sz * 0.95, Math.max(0.1, bl * 0.95), 0.013, 'brake');
  k.b('dark', 0.05, 0.05, 0.09, 0, 0.012, tip + 0.03, 0, 0, 0, 0.008);                           // freno grande
  kitScope(k, s, -sz * 0.45, L.scope + 0.1, s[1] / 2 + 0.055, 0.024);
  k.b('dark', 0.06, 0.13, 0.07, 0, -top - 0.06, -0.08, -0.25, 0, 0, 0.012); kitTrigger(k, s, -0.11);
  if (L.mag) kitMag(k, s, L.mag, 0); else k.b('dark', 0.045, 0.05, 0.08, 0, -top - 0.02, -sz * 0.36, 0, 0, 0, 0.006);
  k.b('body', sx * 0.9, sy * 1.5, 0.2, 0, -0.02, 0.1, 0, 0, 0, 0.012); k.b('dark', sx * 0.95, sy * 1.6, 0.02, 0, -0.02, 0.205, 0, 0, 0, 0.004); k.b('metal', sx * 0.6, 0.03, 0.12, 0, top + 0.012, 0.06, 0, 0, 0, 0.006);   // culata y carrillera
  return tip;
}
const GUN_BUILDERS = {
  ak: buildAk, lince: buildSniper,
  asalto: (k, w, s, L, bl) => buildRifle(k, w, s, L, bl, {}),
  centinela: (k, w, s, L, bl) => buildRifle(k, w, s, L, bl, { longGuard: 0.06, curve: 0.05, brake: 'brake', r: 0.013 }),
  precision: (k, w, s, L, bl) => buildRifle(k, w, s, L, bl, { longGuard: 0.08, curve: 0, guard: 'body', r: 0.011, brake: 'plain' }),
  rafaga: (k, w, s, L, bl) => buildSmg(k, w, s, L, bl, {}),
  vortice: (k, w, s, L, bl) => buildSmg(k, w, s, L, bl, { brake: 'supp', foregrip: true }),
  torrente: buildLmg, trueno: buildShotgun, sheriff: buildRevolver, duo: buildPistol
};
const FIXED_GUN_COLS = { shell: '#e5484d', brass: '#d9a441', lens: '#38e4ff', hi: '#ffdc3a', wood: '#9a5522', woodDk: '#74400f' };
function buildDetailedGun(w, g, s, L, bl, cols, matFor) {
  const k = gunKit(), tip = GUN_BUILDERS[w.id](k, w, s, L, bl), byRole = {};
  for (const p of k.parts) (byRole[p.role] = byRole[p.role] || []).push(p);
  for (const role in byRole) {
    const mesh = new THREE.Mesh(mergePieces(byRole[role]), role === 'lens' ? new THREE.MeshBasicMaterial({ color: FIXED_GUN_COLS.lens }) : matFor(cols[role] || FIXED_GUN_COLS[role]));
    mesh.name = role; mesh.userData.ownOutline = true; g.add(mesh);
  }
  /* Contorno: una copia de cada pieza (salvo los detalles diminutos) un poco más grande y pintada por dentro, todo en una malla */
  const t = 0.0035, bb = new THREE.Box3(), sz = new THREE.Vector3(), ct = new THREE.Vector3(), lines = [];
  for (const p of k.parts) {
    if (p.noLine || p.role === 'lens') continue;
    if (!p.geo.boundingBox) p.geo.computeBoundingBox(); bb.copy(p.geo.boundingBox); bb.getSize(sz); bb.getCenter(ct);
    const sc = new THREE.Matrix4().makeTranslation(ct.x, ct.y, ct.z).multiply(new THREE.Matrix4().makeScale(1 + 2 * t / Math.max(sz.x, 1e-3), 1 + 2 * t / Math.max(sz.y, 1e-3), 1 + 2 * t / Math.max(sz.z, 1e-3))).multiply(new THREE.Matrix4().makeTranslation(-ct.x, -ct.y, -ct.z));
    lines.push({ geo: p.geo, m: p.m.clone().multiply(sc) });
  }
  const ol = new THREE.Mesh(mergePieces(lines), OUTLINE_MAT); ol.userData.isOutline = true; ol.renderOrder = -1; ol.raycast = () => {}; g.add(ol);
  return tip;
}
/* Modelo de arma (se usa en primera persona y en las manos de los personajes) */
const gunMatCache = {}, NEON_MATS = new Set();
/* [NEÓN] El brillo de las skins late despacio, como un neón de verdad */
/* [NEÓN] El mismo dibujo en negativo (líneas negras sobre blanco): multiplicado por el color del cuerpo, lo deja igual salvo en las líneas */
const neonShade = {};
function neonShadeTex(pat) {
  if (neonShade[pat]) return neonShade[pat];
  const src = getTex(pat).image, c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'difference'; g.drawImage(src, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return (neonShade[pat] = t);
}
function pulseNeon() { const k = 0.82 + 0.28 * Math.sin(performance.now() / 1000 * 3.2); for (const m of NEON_MATS) m.emissiveIntensity = m.userData.neon ? k : 0.55 * k; }
/* [TOON] Sombreado tipo cómic para las armas: bandas de luz duras (MeshToonMaterial + rampa de 3 tonos) en vez del
   degradado suave de antes. Las skins siguen mandando: color, patrón y brillo se aplican igual; «metal» usa una rampa
   con más contraste (reflejo marcado) y «rough» suaviza la banda clara. Los valores de la skin quedan en userData. */
const TOON_RAMPS = {};
function toonRamp(kind) {
  if (TOON_RAMPS[kind]) return TOON_RAMPS[kind];
  const steps = kind === 'metal' ? [55, 150, 255] : kind === 'matte' ? [110, 175, 225] : [85, 170, 245];
  const t = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.LuminanceFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return (TOON_RAMPS[kind] = t);
}
function gunMat(col, sk, wcol, acc, dark) {
  const isBody = col === wcol, isAcc = col === acc, isDark = col === dark;
  const skinPart = !!sk && (isBody || isAcc || isDark);
  const rough = skinPart && sk.rough != null ? sk.rough : null, metal = skinPart && sk.metal != null ? sk.metal : null;
  const glow = skinPart && isAcc && sk.glow ? sk.glow : '', pattern = skinPart && isBody && sk.pattern ? sk.pattern : '';
  const neon = skinPart && isBody && sk.neon ? sk.neon : null;   // [NEÓN] dibujo que emite luz sobre el cuerpo
  const ramp = metal != null && metal >= 0.5 ? 'metal' : rough != null && rough >= 0.55 ? 'matte' : 'std';
  const key = col + '|' + ramp + '|' + glow + '|' + pattern + '|' + (rough != null ? rough : '') + '|' + (metal != null ? metal : '') + '|' + (neon ? neon.pat + neon.col : '');
  if (gunMatCache[key]) return gunMatCache[key];
  const params = { color: col, gradientMap: toonRamp(ramp) };
  if (glow) { params.emissive = new THREE.Color(glow); params.emissiveIntensity = 0.55; }
  if (pattern) params.map = getTex(pattern);
  if (neon) { params.emissive = new THREE.Color(neon.col); params.emissiveMap = getTex(neon.pat); params.emissiveIntensity = 1; params.map = neonShadeTex(neon.pat); }   // las líneas también oscurecen el cuerpo: así destacan hasta sobre un cuerpo claro (Osario)
  const m = new THREE.MeshToonMaterial(params);
  m.userData = { toon: true, rough, metal, ramp, neon: !!neon };
  if (neon || glow) NEON_MATS.add(m);   // late despacio (pulseNeon)
  return (gunMatCache[key] = m);
}
/* [TOON] Contorno negro por «casco invertido»: una copia de la pieza, un pelín más grande, pintada solo por dentro
   (BackSide). Grosor constante en metros (no un % de la pieza), así las piezas finas no quedan con un contorno enorme.
   Solo en las armas: el mapa y los personajes no pagan ningún coste extra. */
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x07080d, side: THREE.BackSide });
function addGunOutlines(root, t) {
  const meshes = []; root.traverse(o => { if (o.isMesh && !o.userData.isOutline && !o.userData.ownOutline && o.material !== OUTLINE_MAT) meshes.push(o); });
  for (const m of meshes) {
    if (m.material && (m.material.transparent || m.material.type === 'MeshBasicMaterial')) continue;   // cristales de mira, destellos: sin contorno
    const g = m.geometry; if (!g) continue; if (!g.boundingBox) g.computeBoundingBox();
    const sz = g.boundingBox.getSize(new THREE.Vector3()), c = g.boundingBox.getCenter(new THREE.Vector3());
    const o = new THREE.Mesh(g, OUTLINE_MAT); o.userData.isOutline = true; o.name = '';
    o.scale.set(1 + 2 * t / Math.max(sz.x, 1e-3), 1 + 2 * t / Math.max(sz.y, 1e-3), 1 + 2 * t / Math.max(sz.z, 1e-3));
    o.position.set(-c.x * (o.scale.x - 1), -c.y * (o.scale.y - 1), -c.z * (o.scale.z - 1));   // crece alrededor del centro de la pieza, no del origen
    o.renderOrder = -1; o.raycast = () => {}; m.add(o);
  }
}
function gunModel(w, ox, oid, skinId) {
  const sk = skinId ? S.WEAPON_SKINS.find(k => k.id === skinId && k.w === w.id) : null, wcol = sk ? sk.body : w.col, acc = sk ? sk.acc : '#ffffff';   // skin del pase de batalla (solo en tu arma en primera persona)
  const g = new THREE.Group(), s = w.size, L = w.look || {}, bl = (L.barrel || 0.4) * 0.6, dark = sk ? sk.dark : '#2a1b3d';
  const opt = w.optics ? OPTICS[oid && w.optics.includes(oid) ? oid : w.optics[0]] : null;
  const box = (x, y, z, px, py, pz, col) => { const m = new THREE.Mesh(BG(x, y, z), gunMat(col, sk, wcol, acc, dark)); m.position.set(px, py, pz); return m; };
  const cyl = (r1, r2, len, px, py, pz, col) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 10), gunMat(col, sk, wcol, acc, dark)); m.rotation.x = Math.PI / 2; m.position.set(px, py, pz); return m; };
  const top0 = s[1] / 2, ty0 = top0 + 0.012, rail = '#20242f';
  /* Dibuja la mira elegida (hierro, punto rojo, holográfica o ACOG) sobre el cajón: zc = centro de la mira, zRear = alza, zf = punto de mira */
  const sights = (zc, zRear, zf) => {
    if (!opt) return;
    const glass = (wd, ht, x, y, z, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, ht), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, side: THREE.DoubleSide })); m.position.set(x, y, z); g.add(m); };
  if (opt.kind === 'iron') {
    g.add(box(0.05, 0.008, 0.045, 0, ty0 + 0.004, zRear, rail));
    g.add(box(0.012, 0.03, 0.02, -0.02, ty0 + 0.022, zRear, rail)); g.add(box(0.012, 0.03, 0.02, 0.02, ty0 + 0.022, zRear, rail));     // muescas traseras
    g.add(box(0.03, 0.03, 0.03, 0, 0.0445, zf, rail)); g.add(box(0.008, 0.032, 0.008, 0, 0.0755, zf, '#ffdc3a'));                       // punto de mira
  } else if (opt.kind === 'dot') {
    g.add(box(0.05, 0.012, 0.09, 0, ty0 + 0.006, zc, rail)); g.add(box(0.008, 0.04, 0.07, -0.024, ty0 + 0.032, zc, rail)); g.add(box(0.008, 0.04, 0.07, 0.024, ty0 + 0.032, zc, rail)); g.add(box(0.056, 0.008, 0.07, 0, ty0 + 0.056, zc, rail));
    glass(0.04, 0.03, 0, ty0 + 0.033, zc - 0.036, '#ff5a5a');
  } else if (opt.kind === 'holo') {
    g.add(box(0.06, 0.014, 0.1, 0, ty0 + 0.007, zc, rail)); g.add(box(0.01, 0.058, 0.1, -0.029, ty0 + 0.043, zc, rail)); g.add(box(0.01, 0.058, 0.1, 0.029, ty0 + 0.043, zc, rail)); g.add(box(0.068, 0.01, 0.1, 0, ty0 + 0.076, zc, rail));
    glass(0.048, 0.05, 0, ty0 + 0.043, zc - 0.05, '#7dffb0');
  } else if (opt.kind === 'acog') {
    g.add(box(0.04, 0.03, 0.1, 0, ty0 + 0.012, zc, rail));
    g.add(cyl(0.024, 0.024, 0.15, 0, ty0 + 0.038, zc, '#1b2038'));
    g.add(cyl(0.032, 0.026, 0.05, 0, ty0 + 0.038, zc - 0.09, '#1b2038')); g.add(cyl(0.026, 0.03, 0.03, 0, ty0 + 0.038, zc + 0.09, '#1b2038'));
    const fib = new THREE.Mesh(BG(0.006, 0.006, 0.13), basicMat('#ff7a00')); fib.position.set(0, ty0 + 0.068, zc); g.add(fib);
    glass(0.04, 0.04, 0, ty0 + 0.038, zc - 0.116, '#38e4ff');
  }
  };
  if (GUN_BUILDERS[w.id]) {   // [ARMAS HD] arma detallada (ver buildDetailedGun)
    const metal = '#' + new THREE.Color(dark).lerp(new THREE.Color('#8a93b8'), 0.22).getHexString();
    const cols = { body: wcol, acc, dark, metal }; if (w.id === 'ak') { cols.wood = sk ? sk.acc : '#9a5522'; cols.woodDk = sk ? sk.dark : '#74400f'; cols.metal = '#2b2f3f'; }
    g.userData.tipZ = buildDetailedGun(w, g, s, L, bl, cols, c => gunMat(c, sk, wcol, acc, dark));
    if (w.id === 'ak') sights(-0.16, -0.06, g.userData.tipZ + 0.06);
    else if (!L.scope) { if (opt) sights(-s[2] * 0.3, -s[2] * 0.12, g.userData.tipZ + 0.03); else g.add(box(0.01, 0.016, 0.012, 0, s[1] / 2 + 0.008, g.userData.tipZ + 0.035, dark)); }   // punto de mira sencillo
  } else {
    g.add(box(s[0], s[1], s[2], 0, 0, -s[2] / 2, wcol));
    g.add(box(s[0] * 0.5, 0.012, s[2] * 0.9, 0, s[1] / 2 + 0.006, -s[2] / 2, acc)); // franja clara en el cajón
    g.add(box(0.035, 0.035, bl, 0, 0.012, -s[2] - bl / 2 + 0.02, dark));
    g.add(box(0.06, 0.13, 0.07, 0, -s[1] / 2 - 0.06, -0.08, dark));
    if (L.mag) g.add(box(L.mag[0], L.mag[1], L.mag[2], 0, -s[1] / 2 - L.mag[1] / 2, L.mag[3], dark));
    if (w.id === 'lince') {
      const ty = s[1] / 2 + 0.055, tz = -s[2] * 0.45, ink = '#1b2038';
      g.add(cyl(0.024, 0.024, L.scope, 0, ty, tz, ink));
      g.add(cyl(0.036, 0.03, 0.07, 0, ty, tz - L.scope / 2 - 0.02, ink));
      g.add(cyl(0.03, 0.026, 0.05, 0, ty, tz + L.scope / 2 + 0.02, ink));
      g.add(box(0.03, 0.04, 0.03, 0, s[1] / 2 + 0.02, tz - L.scope * 0.28, dark)); g.add(box(0.03, 0.04, 0.03, 0, s[1] / 2 + 0.02, tz + L.scope * 0.28, dark));
      g.add(box(0.05, 0.018, 0.018, 0.045, 0.02, -s[2] * 0.3, dark)); g.add(box(0.03, 0.03, 0.03, 0.078, 0.02, -s[2] * 0.3, '#ffdc3a'));
      g.add(box(0.05, 0.05, 0.09, 0, 0.012, -s[2] - bl + 0.03, dark));
    } else if (L.scope) g.add(box(0.05, 0.05, L.scope, 0, s[1] / 2 + 0.045, -s[2] * 0.5, dark)); else if (opt) sights(-s[2] * 0.3, -s[2] * 0.12, -s[2] - bl + 0.02); else g.add(box(0.03, 0.04, 0.05, 0, s[1] / 2 + 0.02, -s[2] * 0.6, dark));
  }
  if (!GUN_BUILDERS[w.id] && L.drum) g.add(box(0.075, 0.075, 0.09, 0, 0, -s[2] * 0.55, dark));
  if (!GUN_BUILDERS[w.id] && L.pump) g.add(box(0.1, 0.06, 0.16, 0, -0.06, -s[2] - 0.05, dark));
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, fog: false }));
  fl.position.set(0, 0.012, (g.userData.tipZ != null ? g.userData.tipZ : -s[2] - bl) - 0.08); fl.visible = false; g.add(fl); g.userData.flash = fl;   // [CORREGIDO] con modelo 3D, en la boca real del cañón
  addGunOutlines(g, 0.0035);   // [TOON] contorno negro fino en todas las piezas del arma
  g.position.x = ox || 0; return g;
}
function addHands(g, w) {
  const s = w.size, glove = '#1c2236', sleeve = (state === 'playing' || state === 'paused') && player ? TEAMS[player.team].c : COLORS[cfg.look.col].c;   // en partida, la manga es del color del equipo
  const box = (x, y, z, px, py, pz, col, rx, ry) => { const m = new THREE.Mesh(BG(x, y, z), mat(col)); m.position.set(px, py, pz); if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; g.add(m); };
  box(0.085, 0.1, 0.12, 0, -s[1] / 2 - 0.11, -0.08, glove);
  box(0.1, 0.1, 0.5, 0.02, -s[1] / 2 - 0.2, 0.2, sleeve, -0.32);
  box(0.11, 0.11, 0.05, 0.02, -s[1] / 2 - 0.15, -0.02, '#2a2f45', -0.32);
  if (!w.dual && s[2] > 0.3) {
    box(0.095, 0.09, 0.15, -0.005, -s[1] / 2 - 0.035, -s[2] * 0.72, glove);
    box(0.1, 0.1, 0.55, -0.075, -s[1] / 2 - 0.16, -s[2] * 0.72 + 0.3, sleeve, -0.28, -0.22);
    box(0.11, 0.11, 0.05, -0.055, -s[1] / 2 - 0.1, -s[2] * 0.72 + 0.06, '#2a2f45', -0.28, -0.22);
  }
}
function buildGun(w) {
  while (gun.children.length) gun.remove(gun.children[0]);
  flashes = [];
  const add = ox => { const g = gunModel(w, ox, cfg.optics[w.id], mySkin(w.id)); flashes.push(g.userData.flash); addHands(g, w); gun.add(g); };
  if (w.dual) { add(-0.22); add(0.22); } else add(0);
}

/* Personaje: piernas con botas, torso con textura, cabeza con cara, brazos con el arma de su clase y equipo propio de cada clase */
/* ===== [TRAJES] Trajes de personaje (S.OUTFITS): militar, camuflaje, bombero, antibombas, alienígena y hombre lobo.
   Mismas medidas que el muñeco normal (piernas en y=0,78, torso en 1,15, cabeza en 1,4) para que las animaciones sirvan igual. ===== */
const outfitDef = id => (id ? S.OUTFITS.find(o => o.id === id) : null) || null;
const OUTFIT_TEX = {};
function outfitCanvas(key, size, draw) {
  if (OUTFIT_TEX[key]) return OUTFIT_TEX[key];
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return (OUTFIT_TEX[key] = t);
}
function camoDraw(g, n, of, seed) {   // manchas de camuflaje en 3 tonos
  g.fillStyle = of.main; g.fillRect(0, 0, n, n); let r = seed || 11; const R = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 38; i++) { g.fillStyle = ['#39432a', '#8a8a55', '#2a2f1f'][i % 3]; const x = R() * n, y = R() * n, w = 4 + R() * 12, h = 3 + R() * 8; g.fillRect(x, y, w, h); g.fillRect(x + w * 0.3, y - h * 0.4, w * 0.5, h * 0.6); }
}
function outfitFront(of) {   // pecho del traje (cara −z del torso)
  return outfitCanvas('front|' + of.id, 64, (g, n) => {
    if (of.camo) camoDraw(g, n, of, 7); else { g.fillStyle = of.main; g.fillRect(0, 0, n, n); }
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, n, 3); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, n - 5, n, 5);
    if (of.kind === 'soldier') {
      g.fillStyle = of.dark; g.fillRect(6, 6, 52, 46);                                        // chaleco
      if (of.camo) { g.globalAlpha = 0.35; camoDraw(g, n, of, 3); g.globalAlpha = 1; g.fillStyle = 'rgba(40,46,28,.55)'; g.fillRect(6, 6, 52, 46); }
      g.fillStyle = 'rgba(0,0,0,.35)'; [9, 24, 39].forEach(x => { g.fillRect(x, 30, 14, 18); }); g.fillStyle = 'rgba(255,255,255,.18)'; [9, 24, 39].forEach(x => g.fillRect(x, 30, 14, 2));   // bolsillos
      g.fillStyle = of.acc; g.fillRect(10, 12, 18, 6); g.fillStyle = '#e9edf5'; g.fillRect(36, 12, 16, 10); g.fillStyle = of.main; g.fillRect(36, 12, 16, 3);   // cinta de nombre y bandera
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(30, 6, 3, 46);
    } else if (of.kind === 'firefighter') {
      g.fillStyle = of.dark; g.fillRect(30, 0, 4, n);                                            // cierre
      for (const y of [18, 44]) { g.fillStyle = of.acc; g.fillRect(0, y, n, 3); g.fillStyle = '#e9edf5'; g.fillRect(0, y + 3, n, 3); g.fillStyle = of.acc; g.fillRect(0, y + 6, n, 3); }   // bandas reflectantes
      g.fillStyle = '#2a2a22'; [8, 30].forEach(y => { g.fillRect(24, y, 5, 3); g.fillRect(35, y, 5, 3); });
    } else if (of.kind === 'eod') {
      g.fillStyle = of.dark; g.fillRect(8, 4, 48, 40); g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(8, 4, 48, 3);   // placa de pecho
      g.fillStyle = of.acc; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('EOD', 32, 30);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(4, 48, 56, 10); g.fillStyle = '#2a2a22'; g.fillRect(12, 0, 5, 48); g.fillRect(47, 0, 5, 48);
    } else if (of.kind === 'alien') {
      g.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 0; x < n; x += 8) g.fillRect(x, 0, 1, n);
      g.fillStyle = of.dark; g.fillRect(0, 50, n, 6); g.fillStyle = of.acc; g.beginPath(); g.moveTo(32, 12); g.lineTo(46, 28); g.lineTo(32, 44); g.lineTo(18, 28); g.closePath(); g.fill();
      g.fillStyle = '#0b1020'; g.beginPath(); g.moveTo(32, 20); g.lineTo(38, 28); g.lineTo(32, 36); g.lineTo(26, 28); g.closePath(); g.fill();
    } else if (of.kind === 'wolf') {
      let r = 5; const R = () => (r = (r * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 90; i++) { g.fillStyle = i % 2 ? of.dark : '#8a7560'; g.fillRect(R() * n, R() * n, 2, 5 + R() * 5); }
      g.fillStyle = '#b8a48c'; g.beginPath(); g.moveTo(18, 10); g.lineTo(46, 10); g.lineTo(40, 50); g.lineTo(24, 50); g.closePath(); g.fill();   // pecho claro
      g.fillStyle = '#3b4a6b'; g.fillRect(0, 54, n, 10); g.fillStyle = '#b8a48c'; for (let x = 2; x < n; x += 9) g.fillRect(x, 52, 4, 5);   // camisa rota
    }
  });
}
function outfitFace(of) {   // cara de los trajes que no enseñan la del jugador (alienígena y lobo)
  return outfitCanvas('face|' + of.id, 32, (g) => {
    if (of.kind === 'alien') {
      g.fillStyle = of.helm; g.fillRect(0, 0, 32, 32); g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(0, 26, 32, 6);
      g.fillStyle = '#0b1020'; g.beginPath(); g.ellipse(9, 15, 6, 8, -0.5, 0, TAU); g.fill(); g.beginPath(); g.ellipse(23, 15, 6, 8, 0.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(160,255,200,.8)'; g.fillRect(7, 11, 2, 2); g.fillRect(21, 11, 2, 2); g.fillStyle = '#2b5a20'; g.fillRect(13, 26, 6, 1);
    } else {
      g.fillStyle = of.main; g.fillRect(0, 0, 32, 32); g.fillStyle = of.dark; for (let i = 0; i < 20; i++) g.fillRect((i * 7) % 30, (i * 11) % 30, 2, 4);
      g.fillStyle = '#b8a48c'; g.fillRect(8, 18, 16, 14); g.fillStyle = '#0b0b12'; g.fillRect(5, 10, 8, 2); g.fillRect(19, 10, 8, 2);
      g.fillStyle = of.acc; g.fillRect(7, 12, 6, 4); g.fillRect(19, 12, 6, 4); g.fillStyle = '#0b0b12'; g.fillRect(9, 13, 2, 3); g.fillRect(21, 13, 2, 3);
    }
  });
}
function headExtras(head, skin, mk) {   // [GRÁFICOS] orejas y nariz para las cabezas con cara
  const dk = '#' + new THREE.Color(skin).multiplyScalar(0.86).getHexString();
  for (const x of [-0.215, 0.215]) mk(head, 0.04, 0.11, 0.09, dk, x, 0.19, 0.02);
  mk(head, 0.07, 0.08, 0.05, skin, 0, 0.16, -0.215);
}
/* [RULETA TRAJES] Trajes con efectos: Neón (tiras de neón que laten y parpadean), Oro Yakuza (oro con un brillo que lo recorre y ojos rojos),
   Dragón Imperial (aura cálida y brasas que suben) y Espectro Ártico (cuerpo semitransparente con contorno luminoso y copos flotando).
   Los materiales se comparten por traje y se animan una vez por fotograma (tickKnives); las partículas se mueven en su onBeforeRender. */
const OFX = [], OFXM = {}; let fxClock = 0;
function sweepTex() {   // franja de luz blanca sobre negro: al desplazarla, un brillo recorre la pieza
  return outfitCanvas('sweep', 64, (g, n) => { g.fillStyle = '#000'; g.fillRect(0, 0, n, n); for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,255,255,' + (1 - Math.abs(i - 7) / 7.5).toFixed(2) + ')'; g.fillRect(25 + i, 0, 1, n); } });
}
function fxMats(of) {
  if (OFXM[of.id]) return OFXM[of.id];
  const k = of.kind, M = { main: mat(of.main), dark: mat(of.dark), pants: mat(of.pants), helm: mat(of.helm) }, glow = c => new THREE.MeshBasicMaterial({ color: c });
  const add = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }, o));
  if (k === 'neon') {
    M.a = glow(of.acc); M.b = glow(of.acc2); M.vis = glow(of.acc2); const ca = new THREE.Color(of.acc), cb = new THREE.Color(of.acc2); let fl = 0;
    OFX.push((t, dt) => { if (Math.random() < dt * 0.6) fl = 0.14; fl = Math.max(0, fl - dt);   // de vez en cuando parpadea, como un neón de verdad
      M.a.color.copy(ca).multiplyScalar((0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3))) * (fl > 0 && Math.sin(t * 90) > 0 ? 0.25 : 1));
      M.b.color.copy(cb).multiplyScalar(0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3 + Math.PI))); M.vis.color.copy(cb).multiplyScalar(0.75 + 0.25 * Math.sin(t * 6)); });
  } else if (k === 'yakuza' || k === 'dragon') {
    const sw = sweepTex().clone(); sw.needsUpdate = true; sw.wrapS = sw.wrapT = THREE.RepeatWrapping; sw.magFilter = THREE.LinearFilter;
    M.gold = new THREE.MeshPhongMaterial({ color: of.acc, specular: 0xfff0b0, shininess: 70, emissive: of.acc, emissiveMap: sw, emissiveIntensity: 1 });
    M.eye = glow(of.acc2); const ce = new THREE.Color(of.acc2);
    if (k === 'yakuza') { M.staff = new THREE.MeshPhongMaterial({ color: '#8a6a2a', specular: 0x8a7040, shininess: 40, emissive: '#c9973a', emissiveMap: sw }); M.tip = mat('#4a3218'); }
    else { M.aura = add('#ff7a1a', { opacity: 0.12, side: THREE.BackSide }); M.ember = add('#ffb03a', { opacity: 0.9 }); }
    OFX.push(t => { sw.offset.x = -((t * 0.45) % 1.6) + 0.3; M.eye.color.copy(ce).multiplyScalar(0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.4)));
      if (M.aura) { M.aura.opacity = 0.1 + 0.05 * Math.sin(t * 1.8); M.gold.emissiveIntensity = 0.8 + 0.2 * Math.sin(t * 1.8); M.ember.opacity = 0.7 + 0.3 * Math.sin(t * 13); } });
  } else if (k === 'spectre') {
    M.body = new THREE.MeshLambertMaterial({ color: of.main, transparent: true, opacity: 0.55, emissive: '#1d3440' }); M.bodyD = new THREE.MeshLambertMaterial({ color: of.pants, transparent: true, opacity: 0.55, emissive: '#1d3440' });
    M.line = add(of.acc2, { opacity: 0.35, side: THREE.BackSide }); M.vis = glow('#eafcff'); M.snow = add('#ffffff', { opacity: 0.85 });
    OFX.push(t => { const o = 0.5 + 0.08 * Math.sin(t * 1.5); M.body.opacity = o; M.bodyD.opacity = o; M.line.opacity = 0.28 + 0.16 * Math.sin(t * 2.2); M.snow.opacity = 0.6 + 0.3 * Math.sin(t * 3); });
  }
  return (OFXM[of.id] = M);
}
function fxParticles(parent, n, m, size, fn) {   // partículas que se mueven solas (cada una con su fórmula) sin registrar nada: se colocan justo antes de dibujarse
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(BG(size, size, size), m); p.castShadow = false; p.userData.shared = true; fn(p, i, 0);
    p.onBeforeRender = () => { fn(p, i, fxClock); p.updateMatrix(); if (p.parent) p.matrixWorld.multiplyMatrices(p.parent.matrixWorld, p.matrix); };
    parent.add(p);
  }
}
function fxOutfitBody(g, of, team, seed, mk) {
  const k = of.kind, M = fxMats(of), spec = k === 'spectre', body = spec ? M.body : M.main, legM = spec ? M.bodyD : M.pants;
  const line = (p, w, h, d, x, y, z) => { if (!spec) return; const o = new THREE.Mesh(BG(w * 1.1, h * 1.06, d * 1.12), M.line); o.position.set(x, y, z); p.add(o); };   // contorno luminoso del espectro
  const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(-0.14, 0.78, 0); legR.position.set(0.14, 0.78, 0);
  [legL, legR].forEach((l, i) => {
    const sx = i ? 1 : -1;
    mk(l, 0.25, 0.6, 0.28, legM, 0, -0.3, 0); line(l, 0.25, 0.6, 0.28, 0, -0.3, 0);
    mk(l, 0.28, 0.2, 0.37, k === 'dragon' ? M.dark : spec ? M.body : '#0d0d10', 0, -0.68, -0.035); mk(l, 0.29, 0.03, 0.39, '#0d101c', 0, -0.775, -0.035);
    if (k === 'dragon') mk(l, 0.29, 0.07, 0.38, M.gold, 0, -0.6, -0.035);                                     // botas con remate dorado
    if (k === 'yakuza') mk(l, 0.03, 0.62, 0.02, M.gold, sx * 0.09, -0.36, -0.145);                            // raya dorada
    if (k === 'neon') mk(l, 0.2, 0.05, 0.02, M.b, 0, -0.03, -0.146);                                            // tiras cian de la cadera
    g.add(l);
  });
  mk(g, 0.58, 0.16, 0.33, legM, 0, 0.82, 0);
  mk(g, 0.6, 0.06, 0.35, k === 'neon' ? M.b : k === 'dragon' ? M.gold : k === 'yakuza' ? '#0b0b0b' : M.line, 0, 0.9, 0);   // cinturón
  const torsoFront = k === 'dragon' ? new THREE.MeshLambertMaterial({ map: outfitCanvas('front|' + of.id, 64, (c, n) => {
    c.fillStyle = of.main; c.fillRect(0, 0, n, n); c.fillStyle = '#e0842a'; c.beginPath(); c.moveTo(12, 10); c.lineTo(22, 10); c.lineTo(12, 54); c.closePath(); c.fill(); c.beginPath(); c.moveTo(52, 10); c.lineTo(42, 10); c.lineTo(52, 54); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, n - 5, n, 5); c.fillStyle = 'rgba(255,220,120,.35)'; for (let y = 16; y < 50; y += 6) c.fillRect(28, y, 8, 2);   // escamas doradas en el centro
  }) }) : body;
  const torso = new THREE.Mesh(BG(0.62, 0.52, 0.36), k === 'dragon' ? [body, body, body, M.dark, body, torsoFront] : body); torso.position.y = 1.15; torso.castShadow = true; g.add(torso); line(g, 0.62, 0.52, 0.36, 0, 1.15, 0);
  for (const x of [-1, 1]) mk(g, 0.2, 0.12, 0.4, team, x * 0.25, 1.36, 0);   // hombreras del color del equipo (hay que saber de qué equipo es)
  if (k === 'neon') {   // tiras de neón del pecho, cuello y cinturón
    mk(g, 0.62, 0.04, 0.37, M.a, 0, 1.4, 0);
    const s1 = mk(g, 0.025, 0.49, 0.01, M.a, -0.09, 1.15, -0.186); s1.rotation.z = 0.46; const s2 = mk(g, 0.025, 0.33, 0.01, M.b, 0.09, 1.245, -0.186); s2.rotation.z = -0.72;
  } else if (k === 'yakuza') {   // dos bandas doradas en diagonal, el emblema y el bastón a la espalda
    for (const y of [1.29, 1.01]) { const b = mk(g, 0.64, 0.028, 0.01, M.gold, 0, y, -0.186); b.rotation.z = -0.22; }
    const ring = new THREE.Mesh(kgeo('yring', () => new THREE.TorusGeometry(0.06, 0.011, 6, 20)), M.gold); ring.position.set(0, 1.15, -0.186); g.add(ring);
    const stG = new THREE.Group(); stG.position.set(0, 1.12, 0.24); stG.rotation.z = 0.42; g.add(stG);
    const st = new THREE.Mesh(cylGeo(0.022, 0.022, 1.25, 8), M.staff); st.rotation.x = Math.PI / 2; st.castShadow = true; stG.add(st);
    const tip = mk(stG, 0.08, 0.08, 0.08, M.tip, 0, 0.64, 0); tip.rotation.z = 0.3;
  } else if (k === 'dragon') {   // bandas doradas del pecho, aura y brasas
    mk(g, 0.64, 0.06, 0.37, M.gold, 0, 1.36, 0); mk(g, 0.64, 0.05, 0.37, M.gold, 0, 0.94, 0);
    const aura = new THREE.Mesh(kgeo('aura', () => new THREE.SphereGeometry(1, 16, 12)), M.aura); aura.scale.set(0.62, 1.05, 0.5); aura.position.y = 1.0; aura.castShadow = false; g.add(aura);
    fxParticles(g, 7, M.ember, 0.045, (p, i, t) => { const f = (t * 0.42 + i / 7) % 1, a = i * 2.4 + t * 0.7, r = 0.4 + 0.06 * Math.sin(t * 2 + i); p.position.set(Math.cos(a) * r, 0.1 + f * 1.9, Math.sin(a) * r * 0.7); p.scale.setScalar(1 - f * 0.75); });
  } else if (spec) {
    fxParticles(g, 6, M.snow, 0.035, (p, i, t) => { const f = (t * 0.1 + i / 6) % 1, a = i * 1.9 + t * 0.35; p.position.set(Math.cos(a) * 0.5, 0.35 + f * 1.5, Math.sin(a) * 0.4); });
  }
  const head = new THREE.Group(); head.position.set(0, 1.4, 0); g.add(head);
  mk(head, 0.1, 0.1, 0.1, spec ? M.body : M.helm, 0, -0.02, 0);
  mk(head, 0.42, 0.42, 0.42, spec ? M.body : M.helm, 0, 0.21, 0); line(head, 0.42, 0.42, 0.42, 0, 0.21, 0);
  if (k === 'neon') { mk(head, 0.3, 0.1, 0.02, M.vis, 0, 0.23, -0.215); mk(head, 0.07, 0.04, 0.021, '#dffaff', -0.08, 0.24, -0.221, true); }
  else if (k === 'yakuza') { for (const x of [-0.08, 0.08]) mk(head, 0.08, 0.04, 0.02, M.eye, x, 0.25, -0.215); }
  else if (k === 'dragon') { mk(head, 0.46, 0.08, 0.46, M.gold, 0, 0.44, 0); for (const x of [-0.08, 0.08]) mk(head, 0.08, 0.05, 0.02, M.eye, x, 0.26, -0.215); }
  else mk(head, 0.3, 0.1, 0.02, M.vis, 0, 0.25, -0.215);
  return { legL, legR, head, sleeve: spec ? M.body : k === 'dragon' ? M.dark : M.main, cuff: team, gl: spec ? M.body : k === 'dragon' ? M.gold : '#0d0d10' };
}
function outfitBody(g, of, team, seed, mk) {
  if (of.ru) return fxOutfitBody(g, of, team, seed, mk);   // [RULETA TRAJES]
  const k = of.kind, side = new THREE.MeshLambertMaterial({ color: of.camo ? '#ffffff' : of.main, map: of.camo ? outfitCanvas('camo|' + of.id, 32, (c, n) => camoDraw(c, n, of, 5)) : null });
  const mkT = (p, w, h, d, tex, x, y, z) => { const m = new THREE.Mesh(BG(w, h, d), new THREE.MeshLambertMaterial({ map: tex })); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
  const camoT = of.camo ? outfitCanvas('camo|' + of.id, 32, (c, n) => camoDraw(c, n, of, 5)) : null;
  const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(-0.14, 0.78, 0); legR.position.set(0.14, 0.78, 0);
  const bulky = k === 'eod', lw = bulky ? 0.3 : 0.25;
  [legL, legR].forEach((l, i) => {
    if (camoT) mkT(l, lw, 0.6, 0.28, camoT, 0, -0.3, 0); else mk(l, lw, 0.6, bulky ? 0.32 : 0.28, of.pants, 0, -0.3, 0);
    if (k === 'wolf') { mk(l, 0.29, 0.14, 0.34, of.main, 0, -0.6, -0.02); mk(l, 0.3, 0.12, 0.42, of.dark, 0, -0.72, -0.06); for (const x of [-0.08, 0, 0.08]) mk(l, 0.04, 0.04, 0.06, '#f2ede0', x, -0.74, -0.29); }   // patas con garras
    else {
      mk(l, lw + 0.02, bulky ? 0.2 : 0.07, bulky ? 0.36 : 0.3, of.dark, 0, bulky ? -0.46 : -0.52, -0.01);                // rodilleras / espinilleras
      mk(l, 0.28, k === 'firefighter' ? 0.28 : 0.2, 0.37, k === 'alien' ? of.dark : '#1c1a16', 0, k === 'firefighter' ? -0.64 : -0.68, -0.035); mk(l, 0.29, 0.03, 0.39, '#0d101c', 0, -0.775, -0.035);
      if (k === 'firefighter') { mk(l, 0.27, 0.035, 0.3, of.acc, 0, -0.38, 0); mk(l, 0.27, 0.035, 0.3, '#e9edf5', 0, -0.345, 0); }
      if (k === 'soldier' && i === 1) mk(l, 0.07, 0.14, 0.14, of.dark, 0.15, -0.22, 0);   // bolsillo del muslo
    }
    g.add(l);
  });
  if (camoT) mkT(g, 0.58, 0.16, 0.33, camoT, 0, 0.82, 0); else mk(g, 0.58, 0.16, bulky ? 0.38 : 0.33, k === 'wolf' ? '#3b4a6b' : of.pants, 0, 0.82, 0);
  mk(g, 0.6, 0.07, 0.35, k === 'alien' ? of.acc : '#2a2a22', 0, 0.91, 0, k === 'alien'); mk(g, 0.1, 0.08, 0.02, k === 'alien' ? '#ffffff' : of.acc, 0, 0.91, -0.18, true);   // cinturón
  const tw = bulky ? 0.74 : k === 'wolf' ? 0.68 : 0.62, th = bulky ? 0.6 : 0.52, td = bulky ? 0.46 : 0.38;
  const back = new THREE.MeshLambertMaterial({ color: new THREE.Color(of.camo ? of.main : of.main).multiplyScalar(0.82) });
  const torso = new THREE.Mesh(BG(tw, th, td), [side, side, side, mat(of.dark), back, new THREE.MeshLambertMaterial({ map: outfitFront(of) })]); torso.position.y = 1.15 + (bulky ? 0.02 : 0); torso.castShadow = true; g.add(torso);
  for (const x of [-1, 1]) mk(g, bulky ? 0.24 : 0.2, bulky ? 0.16 : 0.12, bulky ? 0.48 : 0.4, team, x * (tw / 2 - 0.06), 1.36 + (bulky ? 0.02 : 0), 0);   // hombreras del color del equipo
  if (k === 'soldier') { for (const x of [-0.14, 0, 0.14]) mk(g, 0.12, 0.13, 0.06, of.dark, x, 1.02, -0.21); mk(g, 0.42, 0.48, 0.18, of.dark, 0, 1.15, 0.27); mk(g, 0.03, 0.4, 0.03, '#1c1a16', 0.15, 1.5, 0.3); }   // bolsillos, mochila y antena
  else if (k === 'firefighter') { const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12), mat('#ffd23a')); tank.position.set(0, 1.15, 0.28); tank.castShadow = true; g.add(tank); mk(g, 0.08, 0.06, 0.08, '#8a93b8', 0, 1.43, 0.28); mk(g, 0.64, 0.05, 0.4, '#2a2a22', 0, 1.26, 0); }
  else if (bulky) { mk(g, 0.64, 0.16, 0.54, of.dark, 0, 1.46, 0); mk(g, 0.4, 0.22, 0.06, of.dark, 0, 0.8, -0.2); }   // cuello protector y placa de ingle
  else if (k === 'alien') { mk(g, 0.5, 0.05, 0.4, of.acc, 0, 1.3, 0, true); }
  else if (k === 'wolf') { const tail = mk(g, 0.12, 0.12, 0.38, of.main, 0, 0.92, 0.3); tail.rotation.x = -0.6; mk(g, 0.1, 0.1, 0.1, of.dark, 0, 0.8, 0.46); mk(g, 0.62, 0.14, 0.34, of.main, 0, 1.43, 0.02); }
  const head = new THREE.Group(); head.position.set(0, 1.4, 0); g.add(head);
  const H = (w, h, d, c, x, y, z, basic) => mk(head, w, h, d, c, x, y, z, basic);
  const skin = SKINS[seed % SKINS.length];
  if (k === 'alien' || k === 'wolf') {
    const hs = k === 'alien' ? [0.46, 0.5, 0.46] : [0.42, 0.42, 0.42], hc = k === 'alien' ? of.helm : of.main;
    const hm = new THREE.Mesh(BG(hs[0], hs[1], hs[2]), [mat(hc), mat(hc), mat(hc), mat(hc), mat(hc), new THREE.MeshLambertMaterial({ map: outfitFace(of) })]); hm.position.y = hs[1] / 2; hm.castShadow = true; head.add(hm);
    if (k === 'alien') { for (const x of [-1, 1]) { const an = H(0.03, 0.22, 0.03, of.helm, x * 0.12, 0.6, 0); an.rotation.z = -x * 0.35; H(0.07, 0.07, 0.07, of.acc, x * 0.17, 0.72, 0, true); } H(0.1, 0.1, 0.1, of.helm, 0, -0.02, 0); }
    else {
      H(0.2, 0.14, 0.2, '#b8a48c', 0, 0.12, -0.28); H(0.08, 0.05, 0.04, '#0b0b12', 0, 0.18, -0.39);   // hocico y nariz
      for (const x of [-0.05, 0.05]) H(0.03, 0.05, 0.02, '#f2ede0', x, 0.04, -0.38);                    // colmillos
      for (const x of [-1, 1]) { const ear = H(0.1, 0.16, 0.06, of.main, x * 0.13, 0.48, 0.02); ear.rotation.z = -x * 0.2; H(0.05, 0.09, 0.02, '#b8a48c', x * 0.13, 0.47, -0.01); }
      for (const x of [-0.1, 0.1]) H(0.07, 0.04, 0.01, of.acc, x, 0.29, -0.215, true);                  // ojos que brillan
      H(0.1, 0.1, 0.1, of.main, 0, -0.02, 0);
    }
    return { legL, legR, head, sleeve: k === 'alien' ? of.main : of.main, cuff: team, gl: k === 'alien' ? of.helm : of.dark };
  }
  if (bulky) {   // casco antibombas: grande, sin cara, visera oscura con reflejo
    H(0.56, 0.56, 0.56, of.helm, 0, 0.24, 0.02); H(0.46, 0.26, 0.03, '#15232c', 0, 0.26, -0.265, true); H(0.08, 0.2, 0.031, '#9fe8ff', -0.12, 0.3, -0.27, true); H(0.6, 0.06, 0.6, of.dark, 0, 0.0, 0.02);
    return { legL, legR, head, sleeve: of.main, cuff: team, gl: '#2a2a22' };
  }
  const hm = new THREE.Mesh(BG(0.4, 0.4, 0.4), headMat(skin, seed)); hm.position.y = 0.2; hm.castShadow = true; head.add(hm);
  H(0.1, 0.1, 0.1, skin, 0, -0.02, 0); headExtras(head, skin, mk);
  if (k === 'firefighter') { H(0.5, 0.2, 0.5, of.helm, 0, 0.37, 0); H(0.52, 0.04, 0.34, of.helm, 0, 0.27, 0.18); H(0.12, 0.13, 0.03, '#ffd23a', 0, 0.37, -0.26, true); H(0.06, 0.12, 0.44, of.helm, 0, 0.5, 0.02); H(0.46, 0.1, 0.03, '#bfe9ff', 0, 0.3, -0.255); }
  else { H(0.48, 0.18, 0.48, of.helm, 0, 0.37, 0); H(0.52, 0.04, 0.54, of.helm, 0, 0.29, -0.01); H(0.46, 0.05, 0.05, '#1c1a16', 0, 0.33, -0.245); H(0.12, 0.05, 0.02, '#9fe8ff', -0.1, 0.33, -0.27, true); H(0.12, 0.05, 0.02, '#9fe8ff', 0.1, 0.33, -0.27, true); }
  return { legL, legR, head, sleeve: of.camo ? of.dark : of.main, cuff: team, gl: '#2a2a22' };
}
function fillCharacter(g, color, wi, seed, skinIdx, opticId, accent) {
  while (g.children.length) g.remove(g.children[0]);
  const shirt = new THREE.Color(color), dark = '#' + shirt.clone().multiplyScalar(0.5).getHexString(), light = '#' + shirt.clone().lerp(new THREE.Color('#ffffff'), 0.45).getHexString();
  const skin = SKINS[(skinIdx == null ? seed : skinIdx) % SKINS.length], pants = PANTS[seed % PANTS.length], boot = '#1c2033', glove = '#1c2236';
  const mk = (p, w, h, d, c, x, y, z, basic) => { const m = new THREE.Mesh(BG(w, h, d), c && c.isMaterial ? c : basic ? basicMat(c) : mat(c)); m.position.set(x, y, z); m.castShadow = !basic && !(c && c.isMaterial && (c.transparent || c.isMeshBasicMaterial)); p.add(m); return m; };   // c puede ser un material (trajes con efectos)
  const of = outfitDef(g.userData.outfit);   // [TRAJES] con traje, el cuerpo entero sale del traje (el color del equipo va en hombreras y brazaletes)
  let legL, legR, head, sleeve = color, cuff = dark, gl = glove;
  if (of) ({ legL, legR, head, sleeve, cuff, gl } = outfitBody(g, of, color, seed, mk));
  else {
  legL = new THREE.Group(); legR = new THREE.Group();
  legL.position.set(-0.14, 0.78, 0); legR.position.set(0.14, 0.78, 0);
  [legL, legR].forEach(l => { mk(l, 0.25, 0.6, 0.28, pants, 0, -0.3, 0); mk(l, 0.27, 0.06, 0.3, '#3d4566', 0, -0.52, -0.01); mk(l, 0.28, 0.2, 0.37, boot, 0, -0.68, -0.035); mk(l, 0.29, 0.03, 0.39, '#0d101c', 0, -0.775, -0.035); g.add(l); });
  mk(g, 0.58, 0.16, 0.33, pants, 0, 0.82, 0); mk(g, 0.6, 0.07, 0.35, '#3b2f2a', 0, 0.91, 0); mk(g, 0.1, 0.08, 0.02, '#ffdc3a', 0, 0.91, -0.18);
  const style = wi === 8 ? 2 : wi;
  const torso = new THREE.Mesh(BG(0.62, 0.52, 0.36), torsoMat(color, style)); torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  mk(g, 0.7, 0.12, 0.4, accent || dark, 0, 1.36, 0); // hombreras (con el color elegido en el lobby)
  head = new THREE.Group(); head.position.set(0, 1.4, 0); g.add(head);
  const hm = new THREE.Mesh(BG(0.4, 0.4, 0.4), headMat(skin, seed)); hm.position.y = 0.2; hm.castShadow = true; head.add(hm);
  mk(head, 0.1, 0.1, 0.1, skin, 0, -0.02, 0); // cuello
  headExtras(head, skin, mk);   // [GRÁFICOS] orejas y nariz
  mk(g, 0.38, 0.07, 0.3, dark, 0, 1.42, 0); for (const x of [-0.19, 0.19]) mk(g, 0.1, 0.1, 0.06, '#3b2f2a', x, 0.88, -0.18);   // cuello de la camisa y bolsillos del cinturón
  const H = (w, h, d, c, x, y, z, basic) => mk(head, w, h, d, c, x, y, z, basic);
  const hair = ['#2b1d14', '#5a3a1e', '#c9a25a', '#151515', '#7a3b1e'][seed % 5];
  switch (wi) {
    case 0: H(0.5, 0.2, 0.5, dark, 0, 0.38, 0); H(0.53, 0.05, 0.57, '#232a3f', 0, 0.29, -0.01); H(0.1, 0.08, 0.1, '#232a3f', 0, 0.43, -0.28); H(0.36, 0.07, 0.03, '#38e4ff', 0, 0.22, -0.215, true); break;
    case 1: H(0.46, 0.13, 0.46, light, 0, 0.37, 0); H(0.3, 0.03, 0.2, light, 0, 0.32, 0.3); H(0.06, 0.15, 0.12, '#232a3f', -0.24, 0.2, 0); H(0.06, 0.15, 0.12, '#232a3f', 0.24, 0.2, 0); H(0.03, 0.03, 0.18, '#232a3f', -0.24, 0.13, -0.12); H(0.44, 0.06, 0.03, hair, 0, 0.42, -0.22); break;
    case 2: H(0.55, 0.26, 0.55, dark, 0, 0.36, 0); H(0.46, 0.05, 0.06, '#2b3550', 0, 0.16, -0.24); H(0.18, 0.22, 0.05, '#2b3550', 0, 0.1, -0.245); break;
    case 3: H(0.52, 0.3, 0.52, '#3f6b3a', 0, 0.33, 0.02); H(0.52, 0.42, 0.12, '#3a6136', 0, 0.06, 0.29); H(0.46, 0.09, 0.05, '#151a28', 0, 0.22, -0.23); H(0.15, 0.07, 0.03, '#38e4ff', -0.12, 0.22, -0.26, true); H(0.15, 0.07, 0.03, '#38e4ff', 0.12, 0.22, -0.26, true); for (let i = 0; i < 6; i++) H(0.1, 0.08, 0.1, i % 2 ? '#5f9a4a' : '#274d24', -0.2 + i * 0.08, 0.5 + (i % 2) * 0.03, 0.02 + (i % 3) * 0.08); break;
    case 4: H(0.5, 0.14, 0.5, '#ffdc3a', 0, 0.37, 0); H(0.5, 0.04, 0.22, '#ffdc3a', 0, 0.3, -0.3); H(0.44, 0.15, 0.06, '#e5484d', 0, 0.06, -0.23); H(0.06, 0.04, 0.06, '#232a3f', -0.1, 0.36, -0.25, true); break;
    case 5: H(0.86, 0.04, 0.86, '#8a5a34', 0, 0.36, 0); H(0.44, 0.22, 0.44, '#9a6a3c', 0, 0.48, 0); H(0.46, 0.06, 0.46, '#2a1b3d', 0, 0.4, 0); mk(g, 0.11, 0.11, 0.03, '#ffd23f', -0.2, 1.22, -0.195, true); H(0.44, 0.08, 0.05, hair, 0, 0.42, -0.2); break;
    case 6: H(0.46, 0.16, 0.46, '#a78bfa', 0, 0.37, 0); H(0.1, 0.1, 0.1, '#ffffff', 0, 0.5, 0); H(0.5, 0.12, 0.4, light, 0, 0.0, 0); break;
    case 8: H(0.46, 0.2, 0.46, '#c9b27c', 0, 0.34, 0); H(0.44, 0.14, 0.05, '#c9b27c', 0, 0.06, -0.225); H(0.46, 0.05, 0.05, '#7a6a48', 0, 0.26, -0.235); H(0.4, 0.07, 0.04, '#111111', 0, 0.2, -0.24); break;
    default: H(0.08, 0.18, 0.4, '#ff4d9a', 0, 0.47, 0); H(0.44, 0.07, 0.04, '#111111', 0, 0.22, -0.22); H(0.44, 0.06, 0.05, hair, 0, 0.41, -0.2);
  }
  if (wi === 0 || wi === 3 || wi === 2) mk(g, 0.4, 0.46, 0.16, wi === 3 ? '#3a6136' : wi === 2 ? '#3b4258' : dark, 0, 1.15, 0.26); // mochila
  }
  const aim = new THREE.Group(); aim.position.set(0, 1.25, 0); g.add(aim);
  const w = WEAPONS[wi] || WEAPONS[0];
  const arm = (x, ry, len) => { const a = new THREE.Group(); a.position.set(x, 0, 0); a.rotation.y = ry; mk(a, 0.16, 0.16, len, sleeve, 0, 0, -len / 2 + 0.05); mk(a, 0.17, 0.17, 0.08, cuff, 0, 0, -len * 0.55); mk(a, 0.14, 0.14, 0.14, gl, 0, 0, -len + 0.08); aim.add(a); };
  arm(0.38, 0.35, 0.56);
  if (!w.dual) arm(-0.38, -0.5, 0.66); else arm(-0.38, -0.2, 0.56);
  const guns = [];
  const skn = (g.userData.skins || {})[w.id];   // [SKINS VISIBLES] la skin que lleva este jugador en esta arma (la manda el servidor)
  if (w.dual) { guns.push(gunModel(w, 0.32, undefined, skn)); guns.push(gunModel(w, -0.14, undefined, skn)); } else guns.push(gunModel(w, 0.12, opticId, skn));
  guns.forEach(gm => { gm.position.y = -0.04; gm.position.z = -0.3; gm.traverse(o => { if (o.isMesh && o.material.color && o !== gm.userData.flash) o.castShadow = true; }); aim.add(gm); });
  const kn = new THREE.Group(); kn.visible = false; kn.position.set(0.1, -0.02, -0.34);
  kn.add(knifeMesh(S.KNIFE_SKINS.find(k => k.id === (g.userData.skins || {}).knife)));   // [CUCHILLOS] el cuchillo que lleva equipado (lo manda el servidor)
  aim.add(kn); g.userData.knife = kn; g.userData.guns = guns;
  g.userData.legL = legL; g.userData.legR = legR; g.userData.aim = aim; g.userData.head = head; g.userData.flash = guns[0].userData.flash; g.userData.wi = wi;
}
function buildBot(color, wi, seed, skinIdx, accent) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  fillCharacter(g, color, wi || 0, seed || 0, skinIdx, undefined, accent); return g;
}
/* [SKINS VISIBLES] aplica las skins de otro jugador y redibuja su arma */
function applyLook(f, sk) { if (!f || !f.mesh) return; f.mesh.userData.skins = sk || {}; const wi = f.mesh.userData.wi; if (wi == null) return; f.mesh.userData.wi = -1; setOutfit(f, wi); }
/* [TRAJES] el traje de un jugador (lo manda el servidor según su inventario) o de un bot del entrenamiento: se redibuja el muñeco */
function setCharOutfit(f, id) { if (!f || !f.mesh) return; f.outfit = outfitDef(id) ? id : ''; f.mesh.userData.outfit = f.outfit; const wi = f.mesh.userData.wi; if (wi == null) return; f.mesh.userData.wi = -1; setOutfit(f, wi); }
const BOT_OUTFITS = S.OUTFITS.filter(o => o.r !== 'leyenda' && !o.ru).map(o => o.id);
const setOutfit = (f, wi) => { if (f.mesh && f.mesh.userData.wi !== wi) fillCharacter(f.mesh, f.color, wi, f.seed || 0, f.skin, undefined, f.accent); };
function poseChar(f, sp, dt) {
  const u = f.mesh.userData; if (!u.legL) return;
  f.walk = (f.walk || 0) + sp * dt * 2.2;
  const sw = Math.sin(f.walk) * 0.75 * Math.min(1, sp / 3);
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.aim.rotation.x = f.pitch * 0.92; u.head.rotation.x = f.pitch * 0.6;
  const kOn = (f.knifeT || 0) > 0;   // golpe de cuchillo de otro jugador: el arma se guarda y se ve el cuchillo cortando
  if (kOn) { f.knifeT -= dt; u.aim.rotation.x += Math.sin((1 - Math.max(0, f.knifeT) / 0.5) * Math.PI) * 0.9; }
  if (u.knife && u.knife.visible !== kOn) { u.knife.visible = kOn; for (const gm of u.guns) gm.visible = !kOn; }
  u.aim.position.y = 1.25 + Math.abs(Math.sin(f.walk)) * 0.015 * Math.min(1, sp / 3);
}
function flashChar(f) { const fl = f && f.mesh && f.mesh.userData.flash; if (!fl) return; fl.visible = true; setTimeout(() => { fl.visible = false; }, 55); }
const DIE_T = 0.85;
function startDying(f) { if (!f.mesh) return; f.dyT = DIE_T; f.mesh.visible = true; if (f.label) f.label.visible = false; }
function resetPose(f) { f.dyT = 0; if (f.mesh) { f.mesh.rotation.x = 0; f.mesh.scale.y = 1; } }
function updateDying(dt) {
  for (const f of fighters) if (f.dyT > 0 && f.mesh) {
    f.dyT -= dt; const k = 1 - Math.max(0, f.dyT) / DIE_T, e = k * k * (3 - 2 * k);
    f.mesh.rotation.x = e * 1.52; f.mesh.position.set(f.pos.x, f.pos.y - e * 0.1, f.pos.z); f.mesh.rotation.y = f.yaw;
    if (f.dyT <= 0) { f.mesh.visible = false; f.mesh.rotation.x = 0; }
  }
}

function makeLabel(text, rl, team) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,11,24,0.86)'; g.fillRect(0, 8, 256, 48); g.fillStyle = team === 0 || team === 1 ? TEAMS[team].c : (rl ? '#ffd54a' : '#5aa9ff'); g.fillRect(0, 8, 8, 48);   // la barra lateral lleva el color del equipo
  g.font = '800 30px "Exo 2", "Barlow Semi Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tx = rl ? 116 : 128, tw = rl ? 196 : 240;
  if (rl) { g.shadowColor = '#ffb400'; g.shadowBlur = 14; g.fillStyle = '#ffd54a'; g.fillText(text, tx, 33, tw); g.fillText(text, tx, 33, tw); g.shadowBlur = 0; }   // verificado: dorado brillante
  else { g.fillStyle = '#6db3ff'; g.fillText(text, tx, 33, tw); }                                                                                                    // normal: azul sin brillo
  if (rl) { // insignia de verificación azul
    g.fillStyle = '#1d9bf0'; g.beginPath(); g.arc(230, 32, 13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(223, 32.5); g.lineTo(228.5, 38); g.lineTo(238, 26); g.stroke();
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, fog: false }));
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.3; return s;
}

window.PPR_BP = window.PPR_BP || { equipped: {} };   // lo que lleva puesto la cuenta (skins de armas y cuchillo, banner); bp.js lo mantiene al día
const mySkin = wid => window.PPR_BP.equipped['weapon:' + wid] || '';
const gun = new THREE.Group(); camera.add(gun);
const viewmodel = S.createViewmodel();   // [NUEVO] posición y giro del arma en primera persona (vaivén y apuntado)
/* [CUCHILLOS] Modelos de cuchillo: la hoja mira a −z, la guarda está en z=0 y el mango va hacia +z (ancho de la hoja en y, grosor en x).
   Las hojas son perfiles 2D extruidos con bisel (punta y filo de verdad, no cajas). Cada «kind» es un modelo: clásico, bayoneta,
   daga, mariposa (los mangos giran al sacarla), karambit (hoja curva y anilla) y machete. Con «fx», la hoja lleva luces que la
   recorren (emissiveMap animada), un filo que brilla y un halo que late: los materiales se comparten y se animan una vez por fotograma. */
const KGEO = {};
const kgeo = (key, f) => KGEO[key] || (KGEO[key] = f());
const BLADES = {   // perfil de la hoja (s = distancia desde la guarda, y = alto) y el del filo (una tira fina por el lado que corta)
  classic: { b: [['m', 0, -0.03], ['l', 0.3, -0.03], ['q', 0.4, -0.026, 0.45, 0.018], ['l', 0.36, 0.034], ['l', 0, 0.034]],
    e: [['m', 0, -0.03], ['l', 0.3, -0.03], ['q', 0.4, -0.026, 0.45, 0.018], ['l', 0.43, 0.012], ['q', 0.39, -0.014, 0.3, -0.019], ['l', 0, -0.019]] },
  bayonet: { b: [['m', 0, -0.034], ['l', 0.36, -0.034], ['q', 0.47, -0.03, 0.5, 0.004], ['l', 0.4, 0.036], ['l', 0.26, 0.036], ['l', 0.25, 0.046], ['l', 0.23, 0.036], ['l', 0.21, 0.046], ['l', 0.19, 0.036], ['l', 0.17, 0.046], ['l', 0.15, 0.036], ['l', 0.13, 0.046], ['l', 0.11, 0.036], ['l', 0, 0.036]],
    e: [['m', 0, -0.034], ['l', 0.36, -0.034], ['q', 0.47, -0.03, 0.5, 0.004], ['l', 0.48, 0.002], ['q', 0.45, -0.02, 0.36, -0.022], ['l', 0, -0.022]] },
  dagger: { b: [['m', 0, -0.03], ['q', 0.26, -0.036, 0.46, 0], ['q', 0.26, 0.036, 0, 0.03]],
    e: [['m', 0.02, -0.004], ['l', 0.43, -0.001], ['l', 0.43, 0.001], ['l', 0.02, 0.004]] },
  butterfly: { b: [['m', 0, -0.022], ['l', 0.26, -0.022], ['q', 0.33, -0.02, 0.36, 0.01], ['l', 0.29, 0.024], ['l', 0, 0.024]],
    e: [['m', 0, -0.022], ['l', 0.26, -0.022], ['q', 0.33, -0.02, 0.36, 0.01], ['l', 0.345, 0.006], ['q', 0.32, -0.012, 0.26, -0.013], ['l', 0, -0.013]] },
  karambit: { b: [['m', 0, 0.03], ['q', 0.22, 0.05, 0.3, -0.1], ['q', 0.15, -0.006, 0, -0.022]],
    e: [['m', 0.3, -0.1], ['q', 0.15, -0.006, 0, -0.022], ['l', 0, -0.01], ['q', 0.14, 0.008, 0.285, -0.08]] },
  machete: { b: [['m', 0, -0.028], ['l', 0.46, -0.05], ['q', 0.56, -0.052, 0.57, 0.0], ['l', 0.5, 0.042], ['l', 0, 0.03]],
    e: [['m', 0, -0.028], ['l', 0.46, -0.05], ['q', 0.56, -0.052, 0.57, 0.0], ['l', 0.555, 0.0], ['q', 0.545, -0.036, 0.46, -0.038], ['l', 0, -0.018]] }
};
const BLADE_LEN = { classic: 1.16, bayonet: 1.02, dagger: 1.08, butterfly: 1.25, karambit: 1.35, machete: 0.95 };   // hojas de 0,50–0,55 m; karambit (curvo) ~0,40
function bladeGeo(cmds, thick, key) {
  return kgeo(key, () => {
    const sh = new THREE.Shape();
    for (const c of cmds) { if (c[0] === 'm') sh.moveTo(c[1], c[2]); else if (c[0] === 'l') sh.lineTo(c[1], c[2]); else sh.quadraticCurveTo(c[1], c[2], c[3], c[4]); }
    const bev = Math.min(0.004, thick * 0.4);
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, thick - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.6, bevelSegments: 1, curveSegments: 8 });
    g.translate(0, 0, -(thick - 2 * bev) / 2); g.rotateY(Math.PI / 2); g.computeVertexNormals(); return g;   // x del perfil → −z; grosor → x
  });
}
const KMAT = {}, KFX = [];
const kMetal = c => KMAT['m' + c] || (KMAT['m' + c] = new THREE.MeshPhongMaterial({ color: c, specular: 0x8a96aa, shininess: 70 }));
function knifeFxTex(pat) {   // franjas / degradado / zigzag en blanco sobre negro; se repite a lo largo de la hoja y se desplaza cada fotograma
  const c = document.createElement('canvas'); c.width = 64; c.height = 16; const x = c.getContext && c.getContext('2d');
  if (x) {
    x.fillStyle = '#000'; x.fillRect(0, 0, 64, 16); x.fillStyle = '#fff'; x.strokeStyle = '#fff';
    if (pat === 'ola') for (let i = 0; i < 2; i++) { x.globalAlpha = 1; x.fillRect(i * 32, 0, 7, 16); x.globalAlpha = 0.45; x.fillRect(i * 32 + 7, 0, 6, 16); x.globalAlpha = 0.18; x.fillRect(i * 32 + 13, 0, 6, 16); }
    else if (pat === 'rayo') { x.lineWidth = 2.5; x.beginPath(); const ys = [8, 2, 13, 4, 12, 3, 14, 6, 11, 2, 12, 8]; ys.forEach((y, i) => { const px = i * 64 / (ys.length - 1); if (i) x.lineTo(px, y); else x.moveTo(px, y); }); x.stroke(); x.globalAlpha = 0.35; x.lineWidth = 6; x.stroke(); }
    else { const gr = x.createLinearGradient && x.createLinearGradient(0, 0, 64, 0); if (gr && gr.addColorStop) { gr.addColorStop(0, '#000'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, '#000'); x.fillStyle = gr; } x.fillRect(0, 0, 64, 16); }
    x.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); return t;
}
function knifeMats(K) {   // materiales de una skin (compartidos): hoja, filo y, si tiene efecto, halo animado
  if (KMAT[K.id]) return KMAT[K.id];
  const out = { blade: kMetal(K.blade), edge: kMetal(K.edge), fx: null };
  if (K.fx) {
    const tex = knifeFxTex(K.fx.pat), col = new THREE.Color(K.fx.col);
    out.blade = new THREE.MeshPhongMaterial({ color: K.blade, specular: 0x6a7488, shininess: 60, emissive: col, emissiveMap: tex, emissiveIntensity: 1 });
    out.edge = new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), 0.35) });
    out.halo = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    out.fx = { tex, pat: K.fx.pat, t: Math.random() * 10 }; KFX.push(out);
  }
  return (KMAT[K.id] = out);
}
function tickKnives(dt) {   // mueve las luces de las hojas con efecto (una vez por fotograma, para todas las que se han creado)
  fxClock += dt; for (const f of OFX) f(fxClock, dt);   // [RULETA TRAJES] y los efectos de los trajes
  for (const m of KFX) {
    const f = m.fx; f.t += dt;
    if (f.pat === 'ola') { f.tex.offset.x -= dt * 0.9; m.blade.emissiveIntensity = 0.9 + Math.sin(f.t * 3) * 0.15; m.halo.opacity = 0.18 + Math.sin(f.t * 3) * 0.06; }
    else if (f.pat === 'rayo') { f.tex.offset.x -= dt * 2.2; if (Math.random() < dt * 14) f.tex.offset.y = Math.random(); const fl = Math.random() < 0.08 ? 1.6 : 1; m.blade.emissiveIntensity = fl; m.halo.opacity = 0.14 + (fl - 1) * 0.3 + Math.random() * 0.05; }
    else { const p = 0.5 + 0.5 * Math.sin(f.t * 4.2); f.tex.offset.x -= dt * 0.5; m.blade.emissiveIntensity = 0.55 + p * 0.9; m.halo.opacity = 0.1 + p * 0.22; }
  }
}
function knifeMesh(K) {   // devuelve un grupo con el cuchillo completo (sin guante); userData.bfly = partes que giran en la mariposa
  K = K || S.KNIFE_SKINS[0];
  const kind = K.kind || 'classic', BL = BLADES[kind] || BLADES.classic, M = knifeMats(K), g = new THREE.Group();
  const thick = kind === 'machete' ? 0.012 : kind === 'butterfly' ? 0.012 : 0.016;
  let tgt = g, swing = null;   // mariposa: la hoja y el mango suelto cuelgan del pivote del mango que se agarra (así giran alrededor de la mano)
  if (kind === 'butterfly') { swing = new THREE.Group(); swing.position.set(0, -0.018, 0.004); g.add(swing); tgt = new THREE.Group(); tgt.position.set(0, 0.018, -0.004); swing.add(tgt); }
  const add = (geo, m, x, y, z, rx, ry, rz, p) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); (p || tgt).add(o); return o; };
  const box = (w, h, d, c, x, y, z, p) => add(chamferGeo(w, h, d, Math.min(w, h, d) * 0.25), typeof c === 'string' ? mat(c) : c, x, y, z, 0, 0, 0, p);
  const sl = BLADE_LEN[kind] || 1, bl = new THREE.Group(); bl.scale.set(1, 1 + (sl - 1) * 0.5, sl); tgt.add(bl);   // [CUCHILLOS] largo de la hoja por modelo (el clásico, como el de antes: ~0,52)
  const blade = add(bladeGeo(BL.b, thick, kind + 'b'), M.blade, 0, 0, 0, 0, 0, 0, bl);
  add(bladeGeo(BL.e, thick + 0.003, kind + 'e'), M.edge, 0, 0, 0, 0, 0, 0, bl);
  if (!K.fx && kind !== 'karambit' && kind !== 'dagger') box(thick + 0.002, 0.007, kind === 'machete' ? 0.3 : 0.2, K.base ? '#8ea0bf' : K.edge, 0, kind === 'butterfly' ? 0.008 : 0.014, -0.16, bl);   // canal (vaciado) de la hoja
  if (M.halo) { const h = add(blade.geometry, M.halo, 0, 0, 0.006, 0, 0, 0, bl); h.scale.set(2.6, 1.35, 1.04); h.renderOrder = 2; }
  const H = K.handle, G = K.guard;
  if (kind === 'classic') {
    box(0.03, 0.1, 0.025, G, 0, 0.002, 0); box(0.038, 0.05, 0.16, H, 0, -0.002, 0.095);
    for (const z of [0.05, 0.1, 0.145]) box(0.042, 0.054, 0.012, G, 0, -0.002, z);
    box(0.044, 0.058, 0.025, G, 0, -0.002, 0.185);
  } else if (kind === 'bayonet') {
    box(0.03, 0.11, 0.028, G, 0, 0.008, 0); add(kgeo('bring', () => new THREE.TorusGeometry(0.022, 0.006, 6, 14)), mat(G), 0, 0.074, 0.004);
    box(0.036, 0.052, 0.17, H, 0, -0.004, 0.1); for (let i = 0; i < 6; i++) box(0.04, 0.056, 0.006, '#11141b', 0, -0.004, 0.035 + i * 0.024);
    box(0.042, 0.062, 0.03, G, 0, 0.0, 0.195); box(0.012, 0.02, 0.032, '#11141b', 0.022, 0.012, 0.195);
  } else if (kind === 'dagger') {
    box(0.028, 0.17, 0.022, G, 0, 0, 0); for (const y of [-0.09, 0.09]) add(kgeo('ball', () => new THREE.SphereGeometry(0.016, 10, 8)), mat(G), 0, y, 0);
    add(cylGeo(0.02, 0.024, 0.15, 10), mat(H), 0, 0, 0.087); for (const z of [0.04, 0.075, 0.11, 0.145]) add(cylGeo(0.026, 0.026, 0.008, 10), mat(G), 0, 0, z);
    add(kgeo('pom', () => new THREE.SphereGeometry(0.026, 12, 10)), mat(G), 0, 0, 0.18);
    box(thick + 0.004, 0.006, 0.36, M.edge, 0, 0, -0.2, bl);   // arista central
  } else if (kind === 'butterfly') {   // dos mangos con pivote en la espiga: al sacarla (o con F) la hoja da la vuelta alrededor de la mano
    const halves = [];
    for (const sgn of [1, -1]) {
      const pv = new THREE.Group(); pv.position.set(0, sgn * 0.018, 0.004); (sgn > 0 ? tgt : g).add(pv); halves.push(pv);
      box(0.03, 0.02, 0.3, H, 0, sgn * 0.011, 0.15, pv);   // mangos casi tan largos como la hoja: cerrada, la tapan entera
      for (let i = 0; i < 5; i++) box(0.032, 0.008, 0.03, '#0a0d16', 0, sgn * 0.011, 0.045 + i * 0.05, pv);   // ventanas del mango
      add(cylGeo(0.007, 0.007, 0.036, 8), mat(G), 0, 0, 0, 0, Math.PI / 2, 0, pv);   // pasador del pivote
      box(0.034, 0.024, 0.02, G, 0, sgn * 0.011, 0.295, pv);
      if (sgn < 0) box(0.012, 0.012, 0.05, G, 0, sgn * 0.022, 0.315, pv);   // pestillo
    }
    box(0.016, 0.05, 0.012, G, 0, 0, 0.0); g.userData.bfly = { swing, top: halves[0] };
  } else if (kind === 'karambit') {
    const hd = new THREE.Group(); hd.rotation.x = 0.28; g.add(hd);
    box(0.034, 0.05, 0.13, H, 0, 0, 0.07, hd); for (const z of [0.03, 0.1]) add(cylGeo(0.008, 0.008, 0.04, 8), mat(G), 0, 0, z, 0, Math.PI / 2, 0, hd);
    box(0.03, 0.056, 0.02, G, 0, 0.004, 0.0);
    add(kgeo('kring', () => new THREE.TorusGeometry(0.036, 0.009, 8, 20)), mat(G), 0, 0, 0.17, 0, Math.PI / 2, 0, hd);
    const P = new THREE.Vector3(0, 0, 0.17).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.28), pv = new THREE.Group(), inner = new THREE.Group();   // [CUCHILLOS] el karambit gira sobre la anilla al sacarlo
    pv.position.copy(P); inner.position.copy(P).negate(); pv.add(inner); while (g.children.length) inner.add(g.children[0]); g.add(pv); g.userData.spin = pv;
  } else {   // machete
    box(0.024, 0.07, 0.02, G, 0, 0.002, 0); box(0.04, 0.056, 0.19, H, 0, -0.004, 0.105);
    for (const z of [0.05, 0.1, 0.15]) add(cylGeo(0.008, 0.008, 0.044, 8), mat('#d6a64a'), 0, -0.004, z, 0, Math.PI / 2, 0);
    box(0.044, 0.064, 0.03, H, 0, -0.01, 0.2);
  }
  return g;
}
/* Mariposa: k = 0 cerrada (la hoja dentro de los mangos, junto a la mano), 1 abierta. Primero sale la hoja y luego la sigue el mango suelto */
const SPIN_AX = new THREE.Vector3(), SPIN_Q = new THREE.Quaternion();
function setKnifeDraw(g, k, turns, holder) {   // mariposa (se abre) y karambit (vueltas sobre la anilla, en el plano de la pantalla para que no se salga de la vista)
  setButterfly(g, k); const sp = g && g.userData.spin; if (!sp) return;
  if (holder) { SPIN_Q.copy(holder.quaternion).multiply(g.quaternion).invert(); SPIN_AX.set(0, 0, 1).applyQuaternion(SPIN_Q); } else SPIN_AX.set(1, 0, 0);
  sp.quaternion.setFromAxisAngle(SPIN_AX, -turns * TAU);
}
function setButterfly(g, k) {
  const bf = g && g.userData.bfly; if (!bf) return;
  const a = clamp(k * 1.6, 0, 1), b = clamp(k * 1.6 - 0.6, 0, 1);
  bf.swing.rotation.x = Math.PI * (1 - ease01(a)); bf.top.rotation.x = Math.PI * (1 - ease01(b));
}
/* Cuchillo en primera persona: el arma baja, el cuchillo sube, corta en diagonal y todo vuelve (0,62 s) */
const knifeG = new THREE.Group(); camera.add(knifeG); knifeG.visible = false;
let knifeModel = null;
function buildKnifeModel() {   // el cuchillo de la skin equipada (por defecto, acero clásico) con el guante y la manga
  while (knifeG.children.length) knifeG.remove(knifeG.children[0]);
  const K = S.KNIFE_SKINS.find(k => k.id === window.PPR_BP.equipped.knife) || S.KNIFE_SKINS[0];
  knifeModel = knifeMesh(K); knifeModel.rotation.z = -1.25; knifeG.add(knifeModel);   // girado sobre su eje para que se vea la cara de la hoja, no el lomo
  const gl = new THREE.Mesh(BG(0.085, 0.085, 0.12), mat('#1c2236')); gl.position.set(0, -0.01, 0.12); knifeG.add(gl);
  const sl = new THREE.Mesh(BG(0.1, 0.1, 0.4), mat('#ff7b00')); sl.position.set(0.01, -0.06, 0.4); knifeG.add(sl);   // guante y manga
}
buildKnifeModel();
knifeG.scale.setScalar(1.5);
let knifeT = 0, pendingMelee = 0, slideK = 0, knifeFlip = 1, inspectT = 0;   // [CUCHILLOS] knifeFlip: 0..1 apertura de la mariposa al sacarla; inspectT: 0..1 inspección con F   // slideK: 0..1 suaviza la cámara y el arma durante el deslizamiento

/* =====================================================================
   [NUEVO] Ranuras de arma: 0 = arma principal, 1 = cuchillo en mano
   Se cambia con la rueda del ratón (arriba o abajo), con 1 / 2 o con Q. La transición dura ~0.11 s y se puede cancelar a mitad.
   Con el cuchillo en mano el botón izquierdo golpea (sin sacar el cuchillo) y no se puede disparar, recargar ni apuntar.
   La tecla V sigue siendo el golpe rápido desde el arma.
   ===================================================================== */
/* =====================================================================
   [NUEVO] Sacudida de pantalla y reacción al daño
   «trauma» (0..1) sube con golpes recibidos, disparos y golpes de cuchillo, y se apaga solo. La sacudida crece con su cuadrado: fuerte al principio, suave al final.
   Se puede reducir o desactivar en Ajustes (cfg.shake, 0–100 %).
   ===================================================================== */
let trauma = 0;
function addShake(a) { if (cfg.shake > 0 && !reduce) trauma = Math.min(1, trauma + a * cfg.shake / 100); }
function applyShake(dt) {
  if (trauma <= 0.002) { trauma = 0; return; }
  const k = trauma * trauma * 0.045, t = simTime;
  camera.rotation.x += Math.sin(t * 61) * k; camera.rotation.y += Math.sin(t * 53 + 1.7) * k; camera.rotation.z += Math.sin(t * 47 + 3.1) * k * 0.7;
  trauma = Math.max(0, trauma - dt * 1.7);
}
/* =====================================================================
   [NUEVO] GAME FEEL: retroceso visual de la cámara (procedural recoil) y FOV dinámico por velocidad.
   - RETROCESO: cada disparo da un impulso a la cámara —arriba (X), un poco de lado (Y), un poco de ladeo (Z) y un pequeño tirón hacia atrás—. Es SOLO visual: se aplica
     al final del fotograma y la puntería y las balas salen de p.yaw/p.pitch, así que nunca desvía un disparo. Suavizado en dos etapas con slerp/lerp independientes del
     framerate: la cámara SUBE rápido hacia el impulso (RECOIL_RISE) y el impulso VUELVE despacio a cero (RECOIL_RETURN). Con fuego automático se acumula hasta RECOIL_MAX.
     Ajustes → «Retroceso de cámara» (0–100 %); se reduce al apuntar (–40 %) y se apaga con «reducir movimiento» del sistema.
   - FOV DINÁMICO: por encima de FOV_SPEED_MIN m/s el campo de visión se abre (hasta «FOV dinámico» grados, 5–10 recomendados) y llega al máximo a FOV_SPEED_FULL m/s;
     sumado al del deslizamiento nunca pasa de FOV_EXTRA_MAX grados de más, y no actúa al apuntar. Ajustes → «FOV dinámico» (0 = desactivado).
   ===================================================================== */
const GF = { RECOIL_RISE: 38, RECOIL_RETURN: 9, RECOIL_MAX: 0.14, BACK_MAX: 0.07, FOV_SPEED_MIN: 9, FOV_SPEED_FULL: 12.5, FOV_EXTRA_MAX: 10, FOV_SMOOTH: 5, FIX_HARD_DIST: 3, FIX_SMOOTH: 22 };   // [PR1] FIX_HARD_DIST: a partir de aquí, snap duro. FIX_SMOOTH: cuanto más alto, más rápido se disuelve la corrección suave (con 22, baja de ~100 % a ~7 % en 120 ms)
const recoilQ = new THREE.Quaternion(), recoilT = new THREE.Quaternion(), _qId = new THREE.Quaternion(), _rQ = new THREE.Quaternion(), _rE = new THREE.Euler(0, 0, 0, 'YXZ');
let recoilBack = 0, recoilBackT = 0, fovBoost = 0;
const fixOffset = new THREE.Vector3();   // [PR1] desfase SOLO visual entre la posición real (player.pos, ya corregida) y lo último que se veía; se disuelve solo
const recoilAngle = q => 2 * Math.acos(Math.min(1, Math.abs(q.w)));
const aimDirOf = p => { const cp = Math.cos(p.pitch); return new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp); };   // hacia donde APUNTA el jugador (sin retroceso ni sacudida)
function addCameraRecoil(w, p) {
  const k = clamp((+cfg.recoilCam || 0) / 100, 0, 1) * (reduce ? 0 : 1) * (1 - 0.4 * p.aim); if (k <= 0) return;
  const up = clamp(w.kick * 4.5, 0.008, 0.11) * k;
  _rE.set(up, (Math.random() - 0.5) * 0.7 * up, (Math.random() - 0.5) * 0.5 * up, 'YXZ'); _rQ.setFromEuler(_rE); recoilT.multiply(_rQ);
  const ang = recoilAngle(recoilT); if (ang > GF.RECOIL_MAX) recoilT.slerp(_qId, 1 - GF.RECOIL_MAX / ang);   // tope al acumular ráfagas
  recoilBackT = Math.min(GF.BACK_MAX, recoilBackT + (0.012 + w.kick * 2.4) * k);
}
function resetGameFeel() { recoilQ.identity(); recoilT.identity(); recoilBack = recoilBackT = 0; fovBoost = 0; fixOffset.set(0, 0, 0); }
const dynFovTarget = spd => { const t = clamp((spd - GF.FOV_SPEED_MIN) / (GF.FOV_SPEED_FULL - GF.FOV_SPEED_MIN), 0, 1); return reduce ? 0 : clamp(+cfg.fovSpeed || 0, 0, 10) * t * t * (3 - 2 * t); };
/* Un paso de suavizado (recoil + FOV) y aplicación a la cámara. Va al FINAL de updatePlayer: lo anterior (rayo de la mira, etc.) ve la cámara sin retroceso. */
function cameraFeel(dt) {
  const rise = 1 - Math.exp(-GF.RECOIL_RISE * dt), ret = 1 - Math.exp(-GF.RECOIL_RETURN * dt);
  recoilQ.slerp(recoilT, rise); recoilT.slerp(_qId, ret);                                        // sube rápido hacia el impulso; el impulso vuelve suave a cero
  recoilBack += (recoilBackT - recoilBack) * rise; recoilBackT -= recoilBackT * ret;
  if (recoilAngle(recoilQ) < 1e-4 && recoilAngle(recoilT) < 1e-4 && recoilBack < 1e-4 && recoilBackT < 1e-4) { recoilQ.identity(); recoilT.identity(); recoilBack = recoilBackT = 0; }
  else { camera.quaternion.multiply(recoilQ); if (recoilBack > 1e-5) camera.translateZ(recoilBack); }   // arriba/lado/ladeo y un tirón hacia atrás
}
/* Daño recibido (lo comparten el modo offline y el online): viñeta roja proporcional al golpe, aro de dirección del atacante y sacudida */
function playerHurtFx(amount, ax, az) {
  sfx.hurt();
  el.vig.style.setProperty('--k', clamp(0.4 + amount / 70, 0.4, 1)); el.vig.classList.add('on'); clearTimeout(vigT); vigT = setTimeout(() => el.vig.classList.remove('on'), 110);
  if (ax != null) {
    const rel = Math.atan2(-(ax - player.pos.x), -(az - player.pos.z)) - player.yaw;
    el.dir.style.transform = 'rotate(' + (-rel * 180 / Math.PI) + 'deg)';
    el.dir.classList.add('on'); clearTimeout(dirT); dirT = setTimeout(() => el.dir.classList.remove('on'), 160);
  }
  addShake(0.2 + clamp(amount / 100, 0, 1) * 0.55);
}

let slot = 0, slotK = 0, slashT = 0;            // slotK: 0..1 = cuánto está sacado el cuchillo (animación); slashT: golpe con el cuchillo en mano
let wheelAcc = 0, wheelT = 0, wheelLock = 0;    // acumulador y enfriamiento de la rueda
const SLOT_TIME = 0.11, WHEEL_STEP = 30, WHEEL_LOCK_MS = 140;
function setSlot(s) {
  if (!gunsOK()) s = 1;   // [NUEVO] en «Solo cuchillos» y en el último nivel de la Carrera solo hay cuchillo
  const p = player; if (!p || !p.alive || state !== 'playing' || s === slot) return;
  slot = s; p.reload = 0; pendingMelee = 0; inspectT = 0; if (s === 1) knifeFlip = 0; sfx.draw(); updateSlotHud();
}
function resetSlot() { slot = gunsOK() ? 0 : 1; slotK = 0; slashT = 0; if (typeof updateSlotHud === 'function' && el.slots) updateSlotHud(); }
/* Rueda: normaliza el tamaño del giro (ratón clásico, ratón libre o trackpad), cambia en cuanto se supera un pequeño umbral y
   deja un enfriamiento corto para que un giro rápido o la inercia del trackpad no hagan rebotar el cambio.
   Durante el enfriamiento los giros se descartan (no se acumulan), así un giro «de más» nunca anula el siguiente gesto. */
function onWheel(e) {
  if (state !== 'playing') return;
  e.preventDefault();
  if (!cfg.wheelSwap || !(locked || fallback) || !player.alive) return;   // igual que el ratón: también vale en el modo sin bloqueo de puntero
  const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  const t = performance.now();
  if (t < wheelLock) { wheelLock = Math.max(wheelLock, t + 90); return; }   // enfriamiento: los giros no cuentan; si siguen llegando (inercia del trackpad) se espera a que haya una pausa
  if (t - wheelT > 250) wheelAcc = 0;                                        // una pausa larga = gesto nuevo
  wheelT = t; wheelAcc += dy;
  if (Math.abs(wheelAcc) < WHEEL_STEP) return;
  wheelAcc = 0; wheelLock = t + WHEEL_LOCK_MS; setSlot(1 - slot);
}
const ease01 = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
let flashes = [], gunKick = 0, reloadAnim = 0, altHand = 0;
const tracerPool = [];
for (let i = 0; i < 20; i++) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0, fog: false }));
  l.frustumCulled = false; scene.add(l); tracerPool.push({ l, life: 0 });
}
let tIdx = 0;
function tracer(a, b, color) {
  const t = tracerPool[tIdx++ % tracerPool.length];
  const p = t.l.geometry.attributes.position;
  p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
  t.l.material.color.set(color); t.l.material.opacity = 0.9; t.life = 0.07;
}
const partPool = [];
for (let i = 0; i < 90; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  m.visible = false; scene.add(m); partPool.push({ m, vel: new THREE.Vector3(), life: 0 });
}
let pIdx = 0;
function burst(pos, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const p = partPool[pIdx++ % partPool.length];
    p.m.position.copy(pos); p.m.material.color.set(color); p.m.material.opacity = 1; p.m.visible = true; p.m.scale.setScalar(1);
    p.vel.set(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(speed); p.life = rand(0.45, 0.9);
  }
}

/* =====================================================================
   Audio sintetizado
   ===================================================================== */
let AC = null, master = null, noiseBuf = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = cfg.vol; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function tone(f0, f1, dur, type, vol, delay) {
  if (!AC) return; const t = AC.currentTime + (delay || 0);
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'square';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, fc) {
  if (!AC) return; const t = AC.currentTime;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(fc, t); f.frequency.exponentialRampToValueAtTime(Math.max(90, fc * 0.2), t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5, dur + 0.05);
}
const sfx = {
  shot(w, v) { v = v == null ? 1 : v; if (v < 0.03) return; const big = w.id === 'lince' || w.id === 'sheriff' || w.id === 'precision'; noise(w.id === 'trueno' ? 0.24 : big ? 0.2 : 0.12, 0.45 * v, big ? 3600 : 2600); tone(big ? 190 : w.id === 'duo' ? 300 : 230, 60, 0.12, 'sawtooth', 0.16 * v); },
  melee() { noise(0.09, 0.25, 2800); tone(600, 250, 0.08, 'triangle', 0.1); },
  draw() { tone(1100, 1700, 0.06, 'triangle', 0.05); noise(0.05, 0.06, 5200); },
  slide() { noise(0.4, 0.11, 900); tone(170, 80, 0.32, 'triangle', 0.05); },
  hit() { tone(900, 700, 0.06, 'square', 0.12); },
  head() { tone(1500, 1100, 0.09, 'square', 0.16); tone(2000, 1600, 0.09, 'square', 0.1, 0.05); },
  kill() { tone(500, 900, 0.1, 'triangle', 0.22); tone(750, 1300, 0.16, 'triangle', 0.22, 0.09); },
  hurt() { tone(220, 90, 0.16, 'sawtooth', 0.2); },
  gold() { tone(880, 880, 0.12, 'sine', 0.12); tone(1320, 1320, 0.2, 'sine', 0.1, 0.09); tone(1760, 1760, 0.26, 'sine', 0.08, 0.18); },
  bolt() { noise(0.03, 0.18, 4200); tone(260, 140, 0.05, 'square', 0.08); tone(360, 180, 0.05, 'square', 0.08, 0.13); },
  reload() { tone(300, 200, 0.05, 'square', 0.1); tone(420, 300, 0.05, 'square', 0.1, 0.5); },
  spawn() { tone(330, 660, 0.14, 'triangle', 0.12); },
  end() { tone(520, 520, 0.14, 'triangle', 0.2); tone(660, 660, 0.14, 'triangle', 0.2, 0.15); tone(880, 880, 0.3, 'triangle', 0.22, 0.3); }
};

/* =====================================================================
   HUD
   ===================================================================== */
const hud = $('#hud'), el = {
  net: $('#netinfo'), fps: $('#fps'), timer: $('#timer'), mode: $('#modeName'), area: $('#areaName'), goal: $('#goalfill'),
  myPts: $('#myPts'), myKD: $('#myKD'), leadName: $('#leadName'), leadPts: $('#leadPts'), banner: $('#banner'),
  live: $('#liveRows'), lbPlace: $('#lbPlace'), feed: $('#feed'), cross: $('#crosshair'), hitmark: $('#hitmark'), dmgnums: $('#dmgnums'), killcard: $('#killcard'),
  scope: $('#scope'), optic: $('#optic'), scZoom: $('#scZoom'), scRange: $('#scRange'), vig: $('#dmgvig'), dir: $('#dmgdir'), lowhp: $('#lowhp'), toast: $('#toast'),
  hpbox: $('#hpbox'), hpghost: $('#hpghost'), slots: $('#slots'), slot0: $('#slot0'), slot1: $('#slot1'),   // [REDISEÑO] rastro de daño y ranuras de arma
  hpbar: $('#hpbar'), hpnum: $('#hpnum'), hpProt: $('#hpProt'), streakPips: [...document.querySelectorAll('#hpStreak i')],
  ammobox: $('#ammobox'), wname: $('#wname'), wtype: $('#wtype'), wicon: $('#wicon'), mag: $('#mag'), magmax: $('#magmax'), pips: $('#pips'),
  reload: $('#amReload'), reloadBar: $('#amReloadBar'), reloadmsg: $('#reloadmsg'),
  board: $('#board'), boardRows: $('#boardRows'),
  death: $('#death'), deathBy: $('#deathBy'), deathCount: $('#deathCount')
};
const _aimV = new THREE.Vector3();
let toastT = 0, hitT = 0, vigT = 0, dirT = 0, fpsAcc = 0, fpsN = 0, aimTick = 0;
const hudCache = {};
const setTxt = (node, key, v) => { if (hudCache[key] !== v) { hudCache[key] = v; node.textContent = v; } };

/* Iconos de armas: se dibujan con las mismas medidas que el modelo 3D */
function weaponIcon(w) {
  const L = w.look || {}, sz = w.size, bl = (L.barrel || 0.4) * 0.6;
  const sc = 66 / (sz[2] + bl), x0 = 20, rl = sz[2] * sc, rh = clamp(sz[1] * sc * 1.5, 5, 9), top = 11;
  const r = (x, y, wd, h, extra) => '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + wd.toFixed(1) + '" height="' + h.toFixed(1) + '"' + (extra === undefined ? ' rx="1"' : extra) + '/>';
  let s = '<polygon points="' + [x0 - 17, top + 1, x0, top, x0, top + rh, x0 - 17, top + rh + 5].join(' ') + '"/>';
  s += r(x0, top, rl, rh) + r(x0 + rl, top + 1, bl * sc, 2.8, '');
  s += '<polygon points="' + [x0 + 3, top + rh, x0 + 8, top + rh, x0 + 6.5, top + rh + 8, x0 + 2, top + rh + 8].join(' ') + '"/>';
  if (L.mag) { const mw = clamp(L.mag[2] * sc, 3, 8), mh = clamp(L.mag[1] * sc * 1.4, 6, 13); s += r(x0 - L.mag[3] * sc - mw / 2, top + rh, mw, mh); }
  if (L.drum) s += '<circle cx="' + (x0 + rl * 0.5).toFixed(1) + '" cy="' + (top + rh + 1).toFixed(1) + '" r="5.5"/>';
  if (L.scope) { const sl = L.scope * sc, sx = x0 + rl * 0.22; s += r(sx, top - 5, sl, 3.6, ' rx="1.6"') + r(sx + sl * 0.15, top - 2, 2, 2, '') + r(sx + sl * 0.7, top - 2, 2, 2, ''); }
  else s += r(x0 + rl * 0.6, top - 2.4, 2.4, 2.4, '');
  if (L.pump) s += r(x0 + rl - 2, top + rh + 0.5, 10, 3.6);
  if (w.dual) s = '<g transform="translate(-4,-5) scale(.9)">' + s + '</g><g transform="translate(9,6) scale(.9)">' + s + '</g>';
  return '<svg viewBox="0 0 100 32" aria-hidden="true">' + s + '</svg>';
}
const KNIFE_ICON = '<svg viewBox="0 0 100 32" aria-hidden="true"><polygon points="8,20 64,8 92,14 64,20 24,24"/><rect x="2" y="19" width="15" height="6" rx="2"/></svg>';
const HEAD_ICON = '<svg class="hs" viewBox="0 0 16 16" aria-label="Disparo a la cabeza"><circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="8" cy="8" r="1.7"/><path d="M8 .5v3M8 12.5v3M.5 8h3M12.5 8h3" stroke="currentColor" stroke-width="1.6"/></svg>';
const WICON = { Cuchillo: KNIFE_ICON };
WEAPONS.forEach(w => { WICON[w.name] = weaponIcon(w); });

/* Cartel grande con el equipo que te ha tocado (al entrar, en cada ronda nueva y en el entrenamiento) */
let teamBannerT = 0;
function teamBanner(team, note) {
  const b = $('#teamBanner'); if (!b) return;
  b.className = 't' + team; b.innerHTML = '<small>TE HA TOCADO</small><b>EQUIPO ' + TEAMS[team].n + '</b><em>' + esc(note || 'Sin fuego amigo') + '</em>';
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); clearTimeout(teamBannerT); teamBannerT = setTimeout(() => b.classList.remove('on'), 3200);
}
function toast(text) { el.toast.textContent = text; el.toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('on'), 1600); }
/* [MEJORA] Marcador de impacto: cada impacto reinicia la animación «pop» (blanco = impacto, dorado = cabeza, rojo con aro = baja) */
function hitmark(kind) {
  const cls = 'on' + (kind === 'head' ? ' head' : '') + (kind === 'kill' ? ' kill' : '');
  el.hitmark.className = ''; void el.hitmark.offsetWidth; el.hitmark.className = cls;
  clearTimeout(hitT); hitT = setTimeout(() => { el.hitmark.className = ''; }, kind === 'kill' ? 300 : 130);
}
/* Números de daño flotantes (se agrupan los perdigones de una misma ráfaga) */
let dnAcc = null;
function dmgNumber(amount, head, killed) {
  const s = document.createElement('span'); s.textContent = Math.round(amount); s.className = killed ? 'kill' : head ? 'head' : '';
  s.style.setProperty('--x', Math.round(rand(-70, 70)) + 'px'); s.style.left = '0'; s.style.top = Math.round(rand(-70, -25)) + 'px';
  el.dmgnums.appendChild(s); setTimeout(() => s.remove(), 900);
  while (el.dmgnums.children.length > 8) el.dmgnums.firstChild.remove();
}
function hitNumber(amount, head, killed) {
  if (!dnAcc) { dnAcc = { a: 0, h: false, k: false }; setTimeout(() => { const d = dnAcc; dnAcc = null; dmgNumber(d.a, d.h, d.k); }, 0); }
  dnAcc.a += amount; dnAcc.h = dnAcc.h || head; dnAcc.k = dnAcc.k || killed;
}
let multiCount = 0, lastKillT = 0;
function killPopup(name, pts, head, streak, gold, vrl) {
  const now = performance.now(); multiCount = now - lastKillT < 3500 ? multiCount + 1 : 1; lastKillT = now;
  const tags = [];
  if (head) tags.push('DISPARO A LA CABEZA');
  if (multiCount >= 2) tags.push(['', '', 'DOBLE BAJA', 'TRIPLE BAJA', 'CUÁDRUPLE BAJA'][multiCount] || 'MÚLTIPLE ×' + multiCount);
  if (streak >= 3) tags.push('RACHA ×' + streak);
  el.killcard.innerHTML = '<div class="l1">ELIMINASTE A <b>' + nameHtml(name, vrl) + '</b><span class="pts">+' + pts + '</span></div><div class="l2">' + tags.join(' · ') + '</div>';
  el.killcard.classList.toggle('gold', !!gold); el.killcard.classList.remove('on'); void el.killcard.offsetWidth; el.killcard.classList.add('on');
}
function rankOf(f) { return sortedFighters().indexOf(f) + 1; }
function sortedFighters() { return fighters.slice().sort((a, b) => b.points - a.points || b.kills - a.kills || a.deaths - b.deaths); }
function feedAdd(k, v, weapon, head) {
  const li = document.createElement('li'); li.className = (k.isPlayer ? 'mine' : '') + (v.isPlayer ? ' dead' : '') + (k.rl ? ' gold' : '');
  li.innerHTML = '<span class="n' + (k.isPlayer ? ' me' : '') + '">' + tdot(k.team) + (k.isPlayer ? selfHtml(k.rl) : nameHtml(k.name, k.rl)) + '</span>' + (WICON[weapon] || '') + (head ? HEAD_ICON : '') + '<span class="n' + (v.isPlayer ? ' me' : '') + '">' + (v.isPlayer ? selfHtml(v.rl) : nameHtml(v.name, v.rl)) + '</span>';
  el.feed.appendChild(li);
  while (el.feed.children.length > 6) el.feed.removeChild(el.feed.firstChild);
  setTimeout(() => li.classList.add('fade'), 4800); setTimeout(() => li.remove(), 5300);
}
function tableRows(list, meRef) {
  return list.map((f, i) => '<tr class="' + (f === meRef ? 'me ' : '') + (i === 0 ? 'first ' : '') + 't' + f.team + '"><td class="pos">' + (i + 1) + '</td><td>' + tdot(f.team) + nameHtml(f.name, f.rl) + '</td><td class="r">' + f.kills + '</td><td class="r">' + f.deaths + '</td><td class="r">' + f.points + '</td></tr>').join('');
}
let hudAcc = 0;
function updateHudSlow() {
  const s = sortedFighters(), me = player, mi = s.indexOf(me);
  const rows = s.slice(0, 5); if (mi >= 5) rows.push(me);
  el.live.innerHTML = rows.map(f => '<li class="' + (f.isPlayer ? 'me' : '') + ' t' + f.team + '"><span>' + (s.indexOf(f) + 1) + '</span><span class="nm">' + tdot(f.team) + nameHtml(f.name, f.rl) + '</span><i>' + f.kills + '</i><b>' + f.points + '</b></li>').join('');
  el.lbPlace.textContent = (mi + 1) + '/' + s.length;
  setTxt(el.myPts, 'pts', me.points); setTxt(el.myKD, 'kd', me.kills + ' K · ' + me.deaths + ' M');
  { const tk = tkNow(), tx = 'AZUL ' + tk[0] + ' – ' + tk[1] + ' ROJO'; if (hudCache.tk !== tx) { hudCache.tk = tx; el.leadName.innerHTML = '<span class="tsb t0">' + tk[0] + '</span><span class="tsep">–</span><span class="tsb t1">' + tk[1] + '</span>'; } setTxt(el.leadPts, 'lp', 'Tu equipo: ' + TEAMS[me.team].n + (teamLimit > 0 ? ' · meta ' + teamLimit : ' · 🎁 regalos')); }   // [NAVIDAD] sin límite de bajas: cuentan los regalos
  el.goal.style.width = clamp(Math.max(...tkNow()) / teamLimit * 100, 0, 100) + '%';
  { const tp = $('#hsTeam'); if (tp) { tp.textContent = 'EQUIPO ' + TEAMS[me.team].n; tp.className = 'teampill t' + me.team; } }
  setTxt(el.area, 'area', (() => { const a = S.areaAt(curMap, me.pos.x, me.pos.y, me.pos.z); return a ? '▸ ' + a : ''; })());   // [NUEVO] rótulo «estás en…»
  setTxt(el.mode, 'mode', MAPS[curMap].name + ' · ' + (online ? S.MODES[net.mode || 'duelo'].short + (net.ranked ? ' CLASIF.' : '') : 'entrenamiento'));
  const st = statsNow(), L = levelOf(st.points || 0);
  { const rl = online && player && player.rl ? player.rl : 0, hk = rl ? player.name + '|' + rl : cfg.name; if (hudCache.hsn !== hk) { hudCache.hsn = hk; hs.name.innerHTML = nameHtml(rl ? player.name : cfg.name, rl); } } // el administrador ve su nombre dorado también en su tarjeta
  setTxt(hs.lvl, 'hsl', 'NV ' + L.lvl);
  setTxt(hs.kd, 'hskd', 'K/D ' + (me.deaths ? (me.kills / me.deaths).toFixed(1) : me.kills.toFixed(1)));
  setTxt(hs.kr, 'hskr', fmtKr(krTotal())); setTxt(hs.gain, 'hsg', '+' + fmtKr(krFor(me.points, false)));
  if (!el.board.hidden) el.boardRows.innerHTML = tableRows(s, player);
}
function buildAmmoUi(w) {
  el.wname.textContent = w.name; el.wtype.textContent = w.type + (w.optics ? ' · ' + opticOf(w).name : ''); $('#optHint').hidden = !w.optics; el.wicon.innerHTML = weaponIcon(w);
  el.magmax.textContent = '/ ' + w.mag; el.pips.innerHTML = '<i></i>'.repeat(w.mag); el.ammobox.style.setProperty('--wc', w.col);
  hudCache.pips = -1;
}
/* [NUEVO] Resalta en el HUD la ranura activa (arma o cuchillo) y atenúa la munición cuando se lleva el cuchillo */
/* [NUEVO] Preferencias del HUD: tamaño de las tarjetas (variable CSS --hs) y modo compacto */
function applyHudPrefs() { document.documentElement.style.setProperty('--hs', String(clamp(+cfg.hudScale || 100, 80, 120) / 100)); document.body.classList.toggle('hud-compact', !!cfg.hudCompact); }
function updateSlotHud() {
  el.slot0.classList.toggle('on', slot === 0); el.slot1.classList.toggle('on', slot === 1);
  el.ammobox.classList.toggle('knife', slot === 1);
}
function updateHudFast() {
  const p = player, w = WEAPONS[p.wi];
  setTxt(el.timer, 'tm', fmtTime(timeLeft)); el.timer.classList.toggle('low', timeLeft <= 10 && !(online && net.wait));
  const hp = Math.max(0, Math.ceil(p.hp));
  setTxt(el.hpnum, 'hp', hp); el.hpbar.style.width = clamp(p.hp, 0, 100) + '%';
  if (hudCache.hpw !== hp) { hudCache.hpw = hp; el.hpghost.style.width = clamp(p.hp, 0, 100) + '%'; }   // [NUEVO] el rastro (barra blanca) se vacía después de la barra: se ve el daño recién recibido
  el.hpbox.classList.toggle('low', p.alive && p.hp < 30);
  const hc = p.hp < 30 ? 'low' : p.hp < 60 ? 'mid' : ''; if (hudCache.hpc !== hc) { hudCache.hpc = hc; el.hpbar.className = hc; }
  el.lowhp.classList.toggle('on', p.alive && p.hp < 30);
  el.hpProt.hidden = !(p.alive && p.protect > 0);
  const st = Math.min(5, p.streak || 0); if (hudCache.st !== st) { hudCache.st = st; el.streakPips.forEach((n, i) => n.classList.toggle('on', i < st)); }
  if (hudCache.wi !== p.wi) { hudCache.wi = p.wi; buildAmmoUi(w); }
  setTxt(el.mag, 'mag', p.ammo); el.mag.classList.toggle('low', p.ammo <= Math.ceil(w.mag * 0.25));
  if (hudCache.pips !== p.ammo) { hudCache.pips = p.ammo; const k = el.pips.children; for (let i = 0; i < k.length; i++) k[i].classList.toggle('on', i < p.ammo); }
  const rel = p.reload > 0; el.reload.classList.toggle('on', rel); if (rel) el.reloadBar.style.width = (1 - p.reload / w.reload) * 100 + '%';
  setTxt(el.reloadmsg, 'rm', rel ? 'RECARGANDO' : p.ammo === 0 ? 'PULSA R' : 'R · RECARGAR'); el.reloadmsg.classList.toggle('warn', !rel && p.ammo === 0);
  el.banner.hidden = !(online && net.wait);
  if (online) { el.net.hidden = false; setTxt(el.net, 'net', net.ping + ' ms · ' + (net.remotes.size + 1) + (net.remotes.size ? ' JUGADORES' : ' JUGADOR')); } else el.net.hidden = true;
}

/* =====================================================================
   Lógica de combate
   ===================================================================== */
function damage(victim, amount, attacker, head, weaponName) {
  if (!victim.alive || victim.protect > 0 || state !== 'playing') return;
  if (attacker && attacker !== victim && attacker.team === victim.team) return;   // sin fuego amigo
  victim.hp -= amount; victim.lastHit = simTime; victim.lastAttacker = attacker;
  if (attacker === player && victim !== player) { hitmark(victim.hp <= 0 ? 'kill' : head ? 'head' : 'hit'); hitNumber(amount, head, victim.hp <= 0); if (victim.hp > 0) (head ? sfx.head : sfx.hit)(); }
  if (victim === player) {
    playerHurtFx(amount, attacker ? attacker.pos.x : null, attacker ? attacker.pos.z : null);   // [MEJORA] un solo sitio para los efectos de daño
    if (attacker) {
      /* (el aro de dirección ya lo pinta playerHurtFx) */
    }
  }
  if (victim.hp <= 0) kill(victim, attacker, head, weaponName);
}
function kill(victim, attacker, head, weaponName) {
  victim.alive = false; victim.deaths++; victim.streak = 0; victim.respawnAt = simTime + RESPAWN;
  if (attacker && attacker !== victim) {
    attacker.kills++; attacker.streak++; attacker.bestStreak = Math.max(attacker.bestStreak, attacker.streak);
    const pts = 100 + (head ? 50 : 0); attacker.points += pts; if (head) attacker.hs++;
    if (attacker === player) {
      sfx.kill(); hitmark('kill');
      botCash += S.CONST.SHOP_KILL_CASH; renderDeathPick();   // [NUEVO] recompensa de la tienda de armas
      killPopup(victim.name, pts, head, attacker.streak);
    }
    feedAdd(attacker, victim, weaponName, head);
  }
  startDying(victim);
  const c = new THREE.Vector3(victim.pos.x, victim.pos.y + 1, victim.pos.z);
  burst(c, victim.isPlayer ? '#ff5a5f' : victim.color, 16, 5);
  if (victim === player) {
    el.death.hidden = false; document.body.classList.add('dead'); if (document.exitPointerLock) document.exitPointerLock();   // [CORREGIDO] «dead» hace visible el cursor (antes quedaba invisible aunque se liberase el bloqueo)
    el.deathBy.textContent = attacker && attacker !== victim ? 'Te eliminó ' + attacker.name + ' con ' + weaponName : 'Has caído';
    deathLook = attacker && attacker !== victim ? attacker : null; renderDeathPick();
    mouseL = false; mouseR = false; gun.visible = false; el.cross.style.opacity = 0; el.scope.hidden = true; el.optic.hidden = true;
  }
  updateHudSlow();
  if (attacker && attacker !== victim && !online && teamKills(attacker.team) >= teamLimit) endMatch();
}
let deathLook = null, botCash = S.CONST.SHOP_START_CASH;   // [NUEVO] tienda de armas: dinero del jugador en el modo entrenamiento (sin servidor)
/* [NUEVO] Tienda de armas de la pantalla de reaparición: 8 tarjetas (S.SHOP) con precio en Cash, estadísticas y compra; el resto de armas se elige gratis con 1–9, como antes. */
function curCash() { return online ? (net.cash || 0) : botCash; }
function renderDeathPick() {
  const cash = curCash(); $('#shopCashN').textContent = cash.toLocaleString('es-ES');
  $('#shopGrid').innerHTML = S.SHOP.map((item, si) => {
    const w = WEAPONS[item.wi], st = S.shopStats(w), owned = item.wi === cfg.cls, afford = cash >= item.price;
    return '<div class="wcard ' + (owned ? 'owned' : afford ? '' : 'locked') + '" role="listitem">' +
      '<div class="wpic">' + (WICON[w.name] || '') + '</div>' +
      '<div class="wname"><b>' + esc(w.name) + '</b><em>$' + item.price.toLocaleString('es-ES') + '</em></div>' +
      '<div class="wtype">' + esc(w.type) + '</div>' +
      '<div class="wstats"><span>DMG <b>' + st.dmg + '</b></span><span>RPM <b>' + st.rpm + '</b></span><span>RNG <b>' + st.rng + '</b></span><span>ACC <b>' + st.acc + '%</b></span></div>' +
      '<button type="button" data-si="' + si + '" ' + (owned || !afford ? 'disabled' : '') + '>' + (owned ? 'Equipada' : 'Purchase') + '</button></div>';   // [CORREGIDO] sin dinero suficiente también se deshabilita, no solo si ya está equipada
  }).join('');
}
/* Compra (o, si el arma no está en la tienda, cambio gratis como antes): equipa el arma elegida para el próximo respawn. */
/* [NUEVO] si = índice en S.SHOP. Es la ÚNICA forma de cambiar de arma tras morir: se paga con el Cash de la partida. */
function buy(si) {
  const item = S.SHOP[si]; if (!item || item.wi === cfg.cls) return;
  if (online) { netSend({ t: 'buy', i: si }); return; }   // el servidor valida el precio y confirma
  if (botCash < item.price) { toast('No te alcanza el dinero.'); return; }
  botCash -= item.price; selectClass(item.wi); renderDeathPick();
}
function onNetBuy(m) {
  if (!m.ok) { if (Number.isFinite(m.cash)) net.cash = m.cash; toast(m.reason === 'cash' ? 'No te alcanza el dinero.' : 'Compra no válida.'); renderDeathPick(); return; }
  net.cash = m.cash; selectClass(m.wi); renderDeathPick();
}

function pickSpawn(f) {
  const c = (curSpawns && curSpawns[f.team] ? curSpawns[f.team] : waypoints).map(s => {   // en Nexus Outpost cada equipo aparece en su base (Spawn Red / Spawn Blue)
    let md = Infinity;
    for (const o of fighters) if (o !== f && o.alive) md = Math.min(md, Math.hypot(o.pos.x - s[0], o.pos.z - s[1]));
    return { s, score: Math.min(md, 60) + Math.random() * 10 };
  });
  c.sort((a, b) => b.score - a.score); return c[0].s;
}
function respawn(f) {
  const s = pickSpawn(f);
  f.pos.set(s[0], 0, s[1]); f.vel.set(0, 0, 0); f.hp = 100; f.alive = true; f.protect = 1.5; f.h = 1.8; f.lastAttacker = null;
  f.yaw = Math.atan2(s[0], s[1]); f.pitch = 0;
  if (f.mesh) { resetPose(f); f.mesh.visible = true; f.label.visible = true; }
  if (f.isPlayer) {
    f.wi = cfg.cls; const w = WEAPONS[f.wi]; f.ammo = w.mag; f.reload = 0; f.fireCd = 0.3; f.slide = 0; f.aim = 0; f.eye = 1.6;
    buildGun(w); resetSlot(); el.death.hidden = true; deathLook = null; sfx.spawn(); if (f.isPlayer) { document.body.classList.remove('dead'); fixOffset.set(0, 0, 0); if (state === 'playing') requestLock(); }   // [NUEVO] se reaparece con el arma principal en mano, se recupera el bloqueo del puntero y el cursor vuelve a ocultarse; [PR1] sin desfase de la vida anterior
  } else {
    f.wi = BOT_WEAPONS[irand(0, BOT_WEAPONS.length - 1)]; setOutfit(f, f.wi);
    f.ai = { wp: null, repath: 0, stuck: 0, last: new THREE.Vector3(s[0], 0, s[1]), stuckT: 0, strafe: 1, strafeT: 0, scan: rand(0, 0.3), target: null, seen: false, react: 0, burst: 0, pause: rand(0.2, 0.6), cd: 0, walk: 0 };
  }
}

/* --- Jugador --- */
function playerShoot() {
  const p = player, w = WEAPONS[p.wi];
  if (p.reload > 0 || p.fireCd > 0 || knifeT > 0) return;
  if (p.ammo <= 0) { startReload(); return; }
  p.ammo--; p.fireCd = w.interval;
  const base = aimDirOf(p);   // [NUEVO] la bala sale de donde apuntas (p.yaw/p.pitch), no de la cámara: el retroceso visual no la desvía
  const scoped = !!scopeKind(w) && p.aim > 0.85, tight = scoped && w.scopedSpread != null;
  let sp = tight ? w.scopedSpread : w.spread;
  if (!tight) { if (!p.onGround) sp *= 2; else if (Math.hypot(p.vel.x, p.vel.z) > 1) sp *= 1.35; if (p.aim > 0.5) sp *= 0.45; if (p.h < 1.5) sp *= 0.75; }
  const origin = new THREE.Vector3(p.pos.x, p.pos.y + p.eye, p.pos.z);
  const dirs = [];
  const hand = w.dual ? (altHand++ % 2 ? 0.22 : -0.22) : 0.18 * (1 - p.aim);
  const muzzle = camera.localToWorld(new THREE.Vector3(hand, -0.16, -0.9));
  for (let i = 0; i < w.pellets; i++) {
    const d = spreadDir(base, sp);
    dirs.push([r3(d.x), r3(d.y), r3(d.z)]);
    const r = hitscan(origin, d, p, w.range); shootLife(origin, d, r.t);   // [MAPAS 2] gallinas y balón
    if (r.f) {
      let dm = (r.head && w.head) ? w.head : w.dmg * (r.head ? 2 : 1);
      if (w.fall) dm *= clamp(1 - (r.t - w.fall[0]) / (w.fall[1] - w.fall[0]), w.fall[2], 1);
      burst(r.point, r.head ? '#ff5a5f' : '#ffe9b0', 2, 2.5);
      if (!online) damage(r.f, Math.round(dm), p, r.head, w.name);
    } else if (r.t < w.range) burst(r.point, '#ffe9b0', 3, 2);
    if (i < 3 || w.pellets === 1) tracer(muzzle, r.point, online && player.rl ? '#ffd23f' : '#fff1b8');
  }
  if (online) netSend({ t: 'st', ep: net.ep, x: r3(p.pos.x), y: r3(p.pos.y), z: r3(p.pos.z), yaw: r3(p.yaw), pitch: r3(p.pitch), h: r3(p.h) });   // [ANTITRAMPAS] el servidor comprueba el disparo con la mira de este mismo instante
  if (online) netSend({ t: 'shoot', o: [r3(origin.x), r3(origin.y), r3(origin.z)], d: dirs });
  sfx.shot(w, 1);
  if (scoped) { el.scope.classList.add('kick'); setTimeout(() => el.scope.classList.remove('kick'), 120); }
  if (w.scope && w.interval > 0.5) setTimeout(() => { if (state === 'playing' || state === 'paused') sfx.bolt(); }, 380);
  gunKick = 1; addShake(w.kick * 10); addCameraRecoil(w, p); const fl = flashes[w.dual ? (hand > 0 ? 1 : 0) : 0]; if (fl) { fl.visible = true; setTimeout(() => { fl.visible = false; }, 45); }
  p.pitch += w.kick * (0.6 + Math.random() * 0.8); p.yaw += rand(-0.5, 0.5) * w.kick;
  if (p.ammo <= 0) startReload();
}
function playerMelee() {
  const p = player;
  if (!p.alive || p.meleeCd > 0) return;
  if (slot === 1) { p.meleeCd = 0.55; slashT = 0.0001; pendingMelee = 0.1; sfx.draw(); return; }   // [NUEVO] cuchillo en mano: el golpe empieza ya (0.55 s entre golpes: el servidor pide 0.48 s)
  p.meleeCd = 0.62; knifeT = 0.0001; pendingMelee = 0.22; inspectT = 0; if (slot !== 1) knifeFlip = 0; p.reload = 0; sfx.draw();   // el golpe llega cuando el cuchillo ya está en mano
}
function meleeHit() {
  const p = player; sfx.melee();
  const d = aimDirOf(p), r = hitscan(new THREE.Vector3(p.pos.x, p.pos.y + p.eye, p.pos.z), d, p, 2.8);
  if (r.f) { burst(r.point, '#ff5a5f', 4, 3); addShake(0.18); if (!online) damage(r.f, 60, p, false, 'Cuchillo'); }
  if (online) netSend({ t: 'melee', d: [r3(d.x), r3(d.y), r3(d.z)] });
}
function startReload() {
  const p = player, w = WEAPONS[p.wi];
  if (p.reload > 0 || p.ammo >= w.mag || knifeT > 0) return;
  p.reload = w.reload; reloadAnim = 1; sfx.reload();
  if (online) netSend({ t: 'reload' });
}
function updatePlayer(dt) {
  const p = player, w = WEAPONS[p.wi];
  p.protect = Math.max(0, p.protect - dt); p.fireCd = Math.max(0, p.fireCd - dt); p.meleeCd = Math.max(0, (p.meleeCd || 0) - dt);
  if (!p.alive) {
    resetGameFeel();   // [NUEVO] al morir se quita el retroceso y el FOV extra
    knifeT = 0; pendingMelee = 0; knifeG.visible = false; slot = 0; slotK = 0; slashT = 0;   // [NUEVO] al morir se suelta el cuchillo
    if (online) el.deathCount.textContent = 'Reapareces en ' + Math.max(1, Math.ceil((net.respawnAt - performance.now()) / 1000)) + ' s.';   // [CORREGIDO] ya no se cambia de arma con 1-9: ahora es la tienda
    else if (simTime >= p.respawnAt) respawn(p);
    else el.deathCount.textContent = 'Reapareces en ' + Math.ceil(p.respawnAt - simTime) + ' s.';   // [CORREGIDO] ya no se cambia de arma con 1-9: ahora es la tienda
    return;
  }
  // regeneración (en línea la calcula el servidor)
  if (!online && simTime - p.lastHit > 4 && p.hp < 100) p.hp = Math.min(100, p.hp + 18 * dt);
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sinY = Math.sin(p.yaw), cosY = Math.cos(p.yaw);
  let wx = -sinY * fwd + cosY * str, wz = -cosY * fwd - sinY * str;
  const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
  p.aim = clamp(p.aim + ((mouseR && slot === 0 ? 1 : 0) - p.aim) * Math.min(1, dt * 22), 0, 1);   // [AJUSTE] apuntado más rápido (antes 14)   // [NUEVO] sin apuntar con el cuchillo
  const crouching = !!keys.ShiftLeft || !!keys.ShiftRight;   // [CONTROLES] Mayús = agacharse/deslizar (antes era «correr»; ya no hay una tecla de correr aparte, como en Krunker)
  let speed = crouching ? CROUCH : SPRINT;   // se corre siempre a lo que antes era la velocidad de «sprint»: sin un paso intermedio de «caminar»
  if (p.aim > 0.3) speed *= 0.85;   // [AJUSTE] apuntar frena menos (antes 0,72)
  speed *= w.speed * (crouching ? 1 : p.hop || 1) * (online && net.mode === 'cuchillos' ? 1.12 : 1);   // [NUEVO] a cuchillo, un poco más rápido;    // [NUEVO] p.hop = impulso acumulado del bunny hop (1 a 1,25)
  /* [NUEVO] Velocidad, deslizamiento, slide hop, coyote time y salto: la lógica está en shared.js (S.moveStep y los parámetros de S.MOVE) para que cliente, pruebas y servidor usen las mismas reglas */
  S.moveStep(p, { wx, wz, fwd, str, speed, jump: jumpQueued }, dt); jumpQueued = false;   // [CONTROLES] una sola pulsación = un solo intento de salto; hay que soltar y volver a pulsar Espacio
  // altura (agachado / deslizamiento)
  const wantH = (crouching || p.slide > 0) ? 1.2 : 1.8;
  if (wantH > p.h) { if (!overlapAt(p.pos.x, p.pos.y, p.pos.z, p.hw, wantH)) p.h = wantH; }
  else p.h = wantH;
  moveEntity(p, dt);
  const eyeT = p.h - 0.2 - (p.slide > 0 ? 0.26 : 0); p.eye += (eyeT - p.eye) * Math.min(1, dt * 14);   // la cámara baja más al deslizarse
  // disparo y recarga
  if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.reload = 0; p.ammo = w.mag; } }
  if (mouseL) { if (slot === 1) playerMelee(); else playerShoot(); }   // [NUEVO] con el cuchillo en mano, el clic golpea
  // cámara
  p.pitch = clamp(p.pitch, -1.5, 1.5);
  fixOffset.multiplyScalar(Math.exp(-GF.FIX_SMOOTH * dt)); if (fixOffset.lengthSq() < 1e-6) fixOffset.set(0, 0, 0);   // [PR1] se va disolviendo solo; el jugador sigue moviéndose con normalidad mientras tanto
  camera.position.set(p.pos.x + fixOffset.x, p.pos.y + p.eye + fixOffset.y, p.pos.z + fixOffset.z);
  camera.rotation.set(p.pitch, p.yaw, 0);
  applyShake(dt);   // [NUEVO]
  fovBoost += (dynFovTarget(Math.hypot(p.vel.x, p.vel.z)) - fovBoost) * (1 - Math.exp(-GF.FOV_SMOOTH * dt));   // [NUEVO] FOV dinámico: se abre al superar cierta velocidad
  const fovTarget = cfg.fov * (1 + (aimFovOf(w) - 1) * p.aim) + Math.min(GF.FOV_EXTRA_MAX, slideK * 6 + fovBoost) * (1 - p.aim);   // el deslizamiento y la velocidad abren el campo de visión (máx. +10°)
  if (Math.abs(camera.fov - fovTarget) > 0.02) { camera.fov = fovTarget; camera.updateProjectionMatrix(); }
  // arma en primera persona
  const opt = opticOf(w), sk = scopeKind(w), scoped = !!sk && p.aim > 0.85;
  gun.visible = !scoped;
  if (el.scope.hidden === scoped) el.scope.hidden = !scoped;
  if (scoped) { if (el.scope.dataset.k !== sk) el.scope.dataset.k = sk; const zt = '×' + +(1 / aimFovOf(w)).toFixed(1); if (el.scZoom.textContent !== zt) el.scZoom.textContent = zt; }
  const ok = opt && (opt.kind === 'dot' || opt.kind === 'holo') && p.aim > 0.8 ? opt.kind : '';
  if ((el.optic.dataset.k || '') !== ok) { el.optic.dataset.k = ok; el.optic.hidden = !ok; }
  if (knifeT > 0) { knifeT += dt / 0.62; if (knifeT >= 1) knifeT = 0; }
  if (pendingMelee > 0) { pendingMelee -= dt; if (pendingMelee <= 0) { pendingMelee = 0; meleeHit(); } }
  const swV = knifeT > 0 ? (knifeT < 0.3 ? ease01(knifeT / 0.3) : knifeT < 0.72 ? 1 : 1 - ease01((knifeT - 0.72) / 0.28)) : 0;   // golpe rápido con V: 0 = arma arriba, 1 = arma abajo
  slotK = clamp(slotK + (slot === 1 ? 1 : -1) * dt / SLOT_TIME, 0, 1);                                                          // [NUEVO] cambio de ranura (~0.11 s)
  const held = ease01(slotK), sw = Math.max(swV, held);                                                                          // sw: cuánto está el arma bajada y el cuchillo subido
  if (slashT > 0) { slashT += dt / 0.32; if (slashT >= 1) slashT = 0; }                                                          // [NUEVO] golpe con el cuchillo en mano (0.32 s)
  slideK += ((p.slide > 0 ? 1 : 0) - slideK) * Math.min(1, dt * 9);
  if (sw > 0.01) {
    const sl = slashT > 0 ? (slashT < 0.5 ? ease01(slashT / 0.5) : 1 - ease01((slashT - 0.5) / 0.5)) : ease01((knifeT - 0.26) / 0.36), arc = Math.sin(sl * Math.PI);
    const idle = held > 0.5 && slashT === 0 && knifeT === 0 ? Math.sin(simTime * 9) * 0.004 * Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 5) : 0;   // el cuchillo en mano se balancea al andar
    knifeG.visible = true;
    if (knifeFlip < 1) knifeFlip = Math.min(1, knifeFlip + dt / 0.38);
    if (inspectT > 0) { inspectT += dt / 2.2; if (inspectT >= 1 || slashT > 0 || knifeT > 0 || slot !== 1) inspectT = 0; }   // [CUCHILLOS] inspección (F): gira el cuchillo para enseñarlo
    const ins = inspectT > 0 ? Math.sin(Math.PI * ease01(inspectT * 1.15)) : 0, spin = inspectT > 0 && !(knifeModel && (knifeModel.userData.bfly || knifeModel.userData.spin)) ? ease01((inspectT - 0.35) / 0.4) * Math.PI * 2 : 0;
    knifeG.position.set(0.26 - sl * 0.5 - ins * 0.05, -0.66 + sw * 0.4 + arc * 0.05 + idle + ins * 0.07, -0.4 - arc * 0.1 - ins * 0.08);
    knifeG.rotation.set(0.3 - sl * 0.85 + arc * 0.2 + (1 - ease01(knifeFlip)) * 0.6, 0.2 + sl * 0.45 + ins * 0.3, 0.9 - sl * 1.8 - ins * 0.7 + spin);
    setKnifeDraw(knifeModel, inspectT > 0 ? 0.5 + 0.5 * Math.cos(inspectT * Math.PI * 4) : knifeFlip, inspectT > 0 ? ease01(inspectT * 1.25) * 2 : 1 - ease01(knifeFlip), knifeG);
  } else knifeG.visible = false;
  gun.visible = gun.visible && sw < 0.98;
  reloadAnim = Math.max(0, reloadAnim - dt / Math.max(0.5, w.reload));
  const moving = Math.hypot(p.vel.x, p.vel.z);
  const long = w.id === 'lince'; // el rifle largo se sitúa un poco más lejos para no tapar la pantalla
  /* [NUEVO] Viewmodel (S.createViewmodel, en shared.js): vaivén senoidal según la velocidad y lerp suave al apuntar, con el arma desplazada justo para que su
     punto de mira (sightH sobre el origen del arma) caiga en el centro de la pantalla. Las demás animaciones (retroceso, recarga, cambio de arma, deslizamiento) van en `extra`. */
  const pose = viewmodel.update(dt, {
    speed: moving, onGround: p.onGround, adsTarget: !!(mouseR && slot === 0),
    hip: { x: w.dual ? 0 : (long ? 0.17 : 0.2), y: -0.2, z: long ? -0.42 : -0.35 }, sight: opt ? { x: 0, y: sightH(w, opt), z: 0 } : null,
    extra: { py: -sw * 0.42 - slideK * 0.045, pz: gunKick * 0.07 + sw * 0.1, rx: gunKick * 0.06 - Math.sin(reloadAnim * Math.PI) * 0.6 - sw * 0.9, ry: sw * 0.3, rz: Math.sin(reloadAnim * Math.PI) * 0.25 + slideK * 0.12 }
  });
  gun.position.set(pose.px, pose.py, pose.pz); gun.rotation.set(pose.rx, pose.ry, pose.rz);
  const spr = (moving > 1 ? 10 : 6) + (p.onGround ? 0 : 8) + gunKick * 5;
  el.cross.style.setProperty('--gap', (spr * (1 - p.aim * 0.6)) + 'px');
  el.cross.style.opacity = scoped ? 0 : (opt && opt.kind !== 'scope' ? 1 - clamp(p.aim * 1.5, 0, 1) : 1);
  aimTick += dt;
  if (aimTick > 0.033) { // la mira se pone roja sobre un rival; con la mira telescópica se mide la distancia
    aimTick = 0; camera.getWorldDirection(_aimV);
    const ar = hitscan(camera.position, _aimV, p, scoped ? 400 : 150);
    el.cross.classList.toggle('enemy', !!(ar.f && ar.f.alive));
    if (scoped) el.scRange.textContent = ar.t < 400 ? Math.round(ar.t) + ' m' : '— m';
  }
  cameraFeel(dt);   // [NUEVO] retroceso visual de la cámara (al final: nada de lo anterior lo ve)
}

/* --- Bots --- */
function updateBot(b, dt) {
  b.protect = Math.max(0, b.protect - dt);
  if (!b.alive) { if (simTime >= b.respawnAt) respawn(b); return; }
  const lvl = DIFFS[cfg.diff], ai = b.ai;
  ai.scan -= dt; ai.cd -= dt;
  if (ai.scan <= 0) {
    ai.scan = 0.2 + Math.random() * 0.15;
    ai.target = pickTarget(b);
    if (ai.target && !ai.seen) ai.react = lvl.react * (0.7 + Math.random() * 0.6);
    ai.seen = !!ai.target;
  }
  const t = ai.target && ai.target.alive ? ai.target : null;
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
  let wx = 0, wz = 0;
  if (t) {
    const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz);
    let diff = want - b.yaw; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
    b.yaw += clamp(diff, -7 * dt, 7 * dt);
    ai.strafeT -= dt; if (ai.strafeT <= 0) { ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.strafeT = rand(0.6, 1.6); }
    const fwd = dist > 16 ? 1 : dist < 7 ? -0.6 : 0.2;
    wx = fx * fwd + rx * ai.strafe * 0.8; wz = fz * fwd + rz * ai.strafe * 0.8;
    // disparo
    if (ai.react > 0) ai.react -= dt;
    else if (Math.abs(diff) < 0.14) {
      if (ai.burst <= 0) { ai.pause -= dt; if (ai.pause <= 0) ai.burst = irand(3, 7); }
      else if (ai.cd <= 0) { botShoot(b, t, dist); ai.cd = lvl.interval; ai.burst--; if (ai.burst <= 0) ai.pause = rand(0.3, 0.8); }
    }
  } else {
    if (!ai.wp || Math.hypot(ai.wp[0] - b.pos.x, ai.wp[1] - b.pos.z) < 1.6 || (ai.repath -= dt) <= 0) {
      let pool = waypoints;
      if (Math.random() < 0.7) {   // [NUEVO] casi siempre rondan cerca del rival vivo más cercano: se encuentran aunque las bases estén lejos
        let foe = null, fd = Infinity; for (const o of fighters) if (o !== b && o.alive && o.team !== b.team) { const d = Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z); if (d < fd) { fd = d; foe = o; } }
        if (foe) { const near = waypoints.filter(w => Math.hypot(w[0] - foe.pos.x, w[1] - foe.pos.z) < 16); if (near.length) pool = near; }
      }
      for (let i = 0; i < 8; i++) { const c = pool[irand(0, pool.length - 1)]; if (Math.hypot(c[0] - b.pos.x, c[1] - b.pos.z) > 8) { ai.wp = c; break; } }
      ai.repath = rand(4, 8);
    }
    if (ai.wp) {
      let dx = ai.wp[0] - b.pos.x, dz = ai.wp[1] - b.pos.z;
      if (curNav) { const dir = S.navDir(curNav, S.navField(curNav, ai.wp[0], ai.wp[1]), b.pos.x, b.pos.z); if (dir) { dx = dir[0]; dz = dir[1]; } }   // [NUEVO] rodea paredes siguiendo la rejilla de navegación
      const want = Math.atan2(-dx, -dz);
      let diff = want - b.yaw; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
      b.yaw += clamp(diff, -4 * dt, 4 * dt);
      const k = Math.abs(diff) < 1 ? 1 : 0.2; wx = fx * k; wz = fz * k;
    }
    b.pitch += (0 - b.pitch) * Math.min(1, dt * 4);
  }
  const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
  const acc = b.onGround ? 40 : 10;
  b.vel.x += clamp(wx * lvl.speed - b.vel.x, -acc * dt, acc * dt);
  b.vel.z += clamp(wz * lvl.speed - b.vel.z, -acc * dt, acc * dt);
  const wall = moveEntity(b, dt);
  if (wall && b.onGround && Math.random() < 0.06) b.vel.y = JUMP * 0.98;
  // atasco
  ai.stuckT += dt;
  if (ai.stuckT > 0.7) {
    if (Math.hypot(b.pos.x - ai.last.x, b.pos.z - ai.last.z) < 0.4 && wl > 0.3) { ai.wp = null; ai.repath = 0; ai.strafe = -ai.strafe; if (b.onGround) b.vel.y = JUMP * 0.98; }
    ai.last.copy(b.pos); ai.stuckT = 0;
  }
  if (t) { const dy = (t.pos.y + 1.2) - (b.pos.y + 1.6), hd = Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z); b.pitch += (Math.atan2(dy, hd) - b.pitch) * Math.min(1, dt * 8); }
  // malla
  poseChar(b, Math.hypot(b.vel.x, b.vel.z), dt);
  b.mesh.position.copy(b.pos); b.mesh.rotation.y = b.yaw;
  b.mesh.visible = true;
}
function pickTarget(b) {
  let best = null, bd = Infinity;
  const o = eyePos(b, new THREE.Vector3());
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  for (const f of fighters) {
    if (f === b || f.team === b.team || !f.alive || f.protect > 1.2) continue;
    const dx = f.pos.x - b.pos.x, dz = f.pos.z - b.pos.z, dist = Math.hypot(dx, dz);
    const revenge = b.lastAttacker === f && simTime - b.lastHit < 3;
    if (dist > 55 && !revenge) continue;
    const dot = (dx * fx + dz * fz) / (dist || 1);
    if (dot < 0.5 && dist > 12 && !revenge) continue;
    const dir = new THREE.Vector3(f.pos.x - o.x, f.pos.y + 1.1 - o.y, f.pos.z - o.z);
    const len = dir.length(); dir.multiplyScalar(1 / len);
    if (rayWorld(o, dir, len) < len - 0.3) continue;
    const score = revenge ? dist - 20 : dist;
    if (score < bd) { bd = score; best = f; }
  }
  return best;
}
function botShoot(b, t, dist) {
  const lvl = DIFFS[cfg.diff]; flashChar(b);
  const o = eyePos(b, new THREE.Vector3());
  const aim = new THREE.Vector3(t.pos.x, t.pos.y + 1.15, t.pos.z);
  const dir = aim.sub(o).normalize();
  const d = spreadDir(dir, lvl.err * (0.7 + dist / 35));
  const r = hitscan(o, d, b, 120);
  const muzzle = new THREE.Vector3(o.x - Math.sin(b.yaw) * 0.7, o.y - 0.3, o.z - Math.cos(b.yaw) * 0.7);
  tracer(muzzle, r.point, '#ffb3b6');
  const pd = Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z);
  sfx.shot(WEAPONS[b.wi], clamp(1 - pd / 55, 0, 1) * 0.6);
  if (r.f) damage(r.f, Math.round(lvl.dmg * (r.head ? 1.6 : 1)), b, r.head, WEAPONS[b.wi].name);
}

/* =====================================================================
   Modo online
   ===================================================================== */
let online = false, serverOK = false, noPointer = false;
const BASE = location.pathname.replace(/[^/]*$/, '');
// Si el servidor Node vive en otra dirección, se indica en config.js (window.VOLT_CONFIG.server)
const CFG_SERVER = window.VOLT_CONFIG && window.VOLT_CONFIG.server ? String(window.VOLT_CONFIG.server).replace(/\/+$/, '') : '';
const apiUrl = p => (CFG_SERVER ? CFG_SERVER + '/' : BASE) + p;
const wsUrl = () => (CFG_SERVER ? CFG_SERVER.replace(/^http/, 'ws') + '/ws' : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + BASE + 'ws');
const net = { tk: null, ws: null, id: null, ep: 0, ping: 0, sendAcc: 0, pingAcc: 0, respawnAt: 0, wait: false, endAt: 0, joined: false, timer: 0, remotes: new Map(), endTxt: '', cash: S.CONST.SHOP_START_CASH };   // [NUEVO] cash: dinero de la tienda de armas
const INTERP = 100;
const r3 = v => Math.round(v * 1000) / 1000;
const wrapAng = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
function netSend(o) { const ws = net.ws; if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function setNetMsg(t) { const e = $('#netMsg'); e.textContent = t || ''; e.hidden = !t; }

function setServer(ok, j) {
  const first = ok && !serverOK;
  serverOK = ok; if (ok) lobbyConnect(); else lobbyClose();
  { const pl = $('#lobbyPlay'); if (pl) pl.classList.toggle('srvok', !!ok); }   // punto verde/rojo del botón «Servidor»
  setTimeout(() => { const oi = $('#onlineInfo'); if (oi) oi.title = oi.textContent; }, 0);   // el aviso se recorta a 4 líneas: el texto completo sale al pasar el ratón
  $('#playOnline').disabled = !ok || noPointer || !!net.ws;
  const opt = $('#lbScope').querySelector('option[value="global"]'); if (opt) opt.disabled = !ok;
  if (ok) {
    if (j) $('#onlineInfo').textContent = j.players + (j.players === 1 ? ' jugador conectado' : ' jugadores conectados') + ' · ' + j.rooms.length + (j.rooms.length === 1 ? ' sala activa' : ' salas activas');
    if (first) { $('#lbScope').value = 'global'; renderLeaderboard(); }
  } else {
    $('#onlineInfo').textContent = CFG_SERVER ? 'No hay respuesta del servidor ' + CFG_SERVER.replace(/^https?:\/\//, '') + '. Comprueba la dirección con el botón «Servidor». Mientras tanto puedes entrenar contra bots.' : location.protocol === 'file:' ? 'Estás abriendo el juego desde un archivo: para jugar online pulsa «Servidor» y escribe la dirección de tu servidor. Mientras tanto puedes entrenar contra bots.' : 'El modo online no está disponible en esta página. Puedes entrenar contra bots.';
    if ($('#lbScope').value === 'global') { $('#lbScope').value = 'local'; renderLeaderboard(); }
  }
}
/* [NUEVO] Botón «Servidor»: elegir a qué servidor online conectarse (se recuerda en este navegador) */
function initServerBtn() {
  const b = $('#serverBtn'); if (!b) return;
  b.textContent = CFG_SERVER ? CFG_SERVER.replace(/^https?:\/\//, '') : location.protocol === 'file:' ? 'Sin servidor' : 'Esta web'; b.title = CFG_SERVER || 'Juegas online en el servidor de esta web. Pulsa para usar otro servidor.';   // [LOBBY] antes «Este equipo», que parecía hablar de tu ordenador o de tu equipo de juego
  b.addEventListener('click', () => {
    const v = window.prompt('Dirección del servidor online (por ejemplo https://mi-juego.onrender.com).\nDéjalo vacío para usar el servidor de esta misma página.', CFG_SERVER || '');
    if (v === null) return; const s = v.trim().replace(/\/+$/, '');
    if (s && !/^https?:\/\/[^\s/?#]+(:\d+)?(\/[^\s?#]*)?$/i.test(s)) { toast('Esa dirección no es válida. Debe empezar por http:// o https://'); return; }
    try { if (s) localStorage.setItem('ppr.server', s); else localStorage.removeItem('ppr.server'); } catch (e) { /* sin almacenamiento */ }
    location.reload();
  });
}
function checkServer() {
  if (state !== 'menu') return;
  if (typeof fetch !== 'function') return setServer(false);
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tm = setTimeout(() => { if (ctl) ctl.abort(); }, 8000);   // [AJUSTE] 8 s (antes 3): un servidor recién despertado tarda en responder
  fetch(apiUrl('api/status'), { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('http'))))
    .then(j => setServer(true, j))
    .catch(() => setServer(false))
    .then(() => clearTimeout(tm));
}

function startOnline() {
  if (!renderer || !serverOK || net.ws) return;
  if (cfg.ranked && cfg.mode === 'duelo' && !acctToken()) { setNetMsg('El clasificatorio necesita una cuenta online. Inicia sesión o desactívalo en «Modo».'); return; }
  initAudio();
  cfg.name = sanitizeName($('#name').value) || cfg.name; saveCfg();
  setNetMsg(''); lobbyClose();
  const btn = $('#playOnline'); btn.disabled = true; btn.textContent = 'Conectando…';
  clearFighters();
  online = true; state = 'connecting';
  requestLock();
  let ws;
  try { ws = new WebSocket(wsUrl()); }
  catch (e) { return netFail('No se pudo abrir la conexión.'); }
  net.ws = ws; net.joined = false;
  const ptok = partyC.tok; partyC.tok = null;   // [GRUPOS] el billete del grupo se guarda ANTES: borrarlo después de asignar onopen lo borraba antes de enviarlo
  ws.onopen = () => netSend({ t: 'hello', v: 1, n: cfg.name, map: cfg.map, c: cfg.cls, lk: [cfg.look.col, cfg.look.skin], adm: admToken(), inf: cfg.infKey || '', acct: acctToken(), mode: S.MODES[cfg.mode] ? cfg.mode : 'duelo', rk: cfg.ranked && cfg.mode === 'duelo' ? 1 : 0, tm: cfg.wantTeam, pt: ptok || undefined });   // [GRUPOS] billete del grupo (solo sirve una vez)
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } try { netHandle(m); } catch (e) { console.error(e); } };
  ws.onclose = ev => {
    if (net.ws !== ws) return;
    if (!net.joined && state === 'connecting' && ev && ev.code === 1008 && (net.tries = (net.tries || 0) + 1) <= 2) { clearTimeout(net.timer); net.ws = null; online = false; state = 'menu'; setNetMsg('Reintentando la conexión…'); setTimeout(startOnline, 400); return; }   // [NUEVO] el servidor cortó por tardar en saludar: se reintenta solo (2 veces)
    net.tries = 0; netClosed();
  };
  ws.onerror = () => {};
  /* [AJUSTE] 25 s en vez de 6: un servidor gratuito que «duerme» o un móvil/PC lento tardan en conectar; mientras tanto se avisa */
  setNetMsg('Conectando con el servidor… (si estaba dormido puede tardar hasta medio minuto)');
  net.timer = setTimeout(() => { if (!net.joined) netFail('El servidor no responde. Inténtalo de nuevo.'); }, 25000);
}
/* [NUEVO] Espectador (solo administrador): entra en una sala en directo sin jugar. Uso: /?spec=<sala> con la sesión de administrador abierta en este navegador. */
function startSpectate(roomId) {
  if (!renderer || net.ws) return;
  initAudio(); clearFighters(); online = true; net.spec = true; state = 'connecting'; net.sstats = null; net.specTarget = 0; net.specView = 'follow';
  let ws; try { ws = new WebSocket(wsUrl()); } catch (e) { return netFail('No se pudo abrir la conexión.'); }
  net.ws = ws; net.joined = false;
  ws.onopen = () => netSend({ t: 'hello', v: 1, spec: 1, room: +roomId, adm: admToken() });
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } try { netHandle(m); } catch (e) { console.error(e); } };
  ws.onclose = () => { if (net.ws === ws) netClosed(); };
  net.timer = setTimeout(() => { if (!net.joined) netFail('No se pudo entrar como espectador.'); }, 6000);
}
function stopSpectate() { net.spec = false; leaveToMenu(); }
function specTargets() { return [...net.remotes.values()].filter(f => f.alive); }
function specCycle(d) { const l = specTargets(); if (!l.length) return; const i = Math.max(0, l.findIndex(f => f.id === net.specTarget)); net.specTarget = l[(i + d + l.length) % l.length].id; }
function specCam(dt) {
  const l = specTargets(); let t = net.remotes.get(net.specTarget); if (!t || !t.alive) { t = l[0]; net.specTarget = t ? t.id : 0; }
  if (!t) { orbitA += dt * 0.09; camera.position.set(Math.cos(orbitA) * mapHalf, 17, Math.sin(orbitA) * mapHalf); camera.lookAt(0, 2.5, 0); return; }
  if (net.specView === 'fpv') { camera.position.set(t.pos.x, t.pos.y + 1.6 * (t.h / 1.8), t.pos.z); camera.rotation.set(t.pitch || 0, t.yaw, 0); t.mesh.visible = false; t.label.visible = false; }
  else { camera.position.lerp(new THREE.Vector3(t.pos.x + Math.sin(t.yaw) * 3.4, t.pos.y + 2.2, t.pos.z + Math.cos(t.yaw) * 3.4), Math.min(1, dt * 6)); camera.lookAt(t.pos.x, t.pos.y + 1.3, t.pos.z); }
  for (const f of l) if (f !== t || net.specView !== 'fpv') { f.mesh.visible = true; f.label.visible = true; }
}
function netDisconnect() {
  clearTimeout(net.timer);
  const ws = net.ws; net.ws = null; net.joined = false; net.remotes.clear();
  if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch (e) { /* ya cerrado */ } }
  const b = $('#playOnline'); if (b) { b.textContent = 'Jugar online'; b.disabled = !serverOK || noPointer; }
}
function netFail(msg) {
  netDisconnect(); online = false; state = 'menu'; clearFighters();
  if (document.exitPointerLock) document.exitPointerLock();
  setNetMsg(msg);
}
function netClosed() {
  if (!online) return;
  if (state === 'connecting') return netFail('El servidor cerró la conexión.');
  leaveToMenu(); setNetMsg('Se perdió la conexión con el servidor.');
}
function setPauseTexts(kind) {
  const on = kind !== 'offline';
  $('#pauseTitle').textContent = kind === 'round' ? 'Nueva partida' : on ? 'Pausa' : 'Partida en pausa';
  $('#pauseSub').textContent = kind === 'round' ? 'Haz clic en «Ir a la arena» para empezar.' : on ? 'En el modo online la partida no se detiene. Haz clic en Reanudar para seguir.' : 'Haz clic en Reanudar para volver a la arena.';
  $('#resume').textContent = kind === 'round' ? 'Ir a la arena' : 'Reanudar';   // [IDIOMAS] antes «Entrar», que en inglés choca con «Entrar» (iniciar sesión)
  $('#quit').textContent = on ? 'Salir al menú' : 'Abandonar'; $('#reportBtn').hidden = !on;
}
function updateEndCountdown() {
  const t = 'Siguiente partida en ' + Math.max(0, Math.ceil((net.endAt - performance.now()) / 1000)) + ' s…';
  if (t !== net.endTxt) { net.endTxt = t; $('#endNext').textContent = t; }
}

/* --- Mensajes del servidor --- */
function netHandle(m) {
  switch (m.t) {
    case 'welcome': return onWelcome(m);
    case 'join': return addRemote(m.p);
    case 'party': case 'pinvite': case 'pnote': case 'pgo': onPartyMsg(m); return;   // [GRUPOS] también en partida
    case 'pet': { const pf = net.remotes.get(m.id); if (pf) setPet(pf, m.pt); return; }
    case 'outfit': { const of = net.remotes.get(m.id); if (of) setCharOutfit(of, m.of); return; }   // [TRAJES]
    case 'look': return applyLook(net.remotes.get(m.id), m.sk);   // [SKINS VISIBLES] alguien entra con skins equipadas   // [MASCOTAS] alguien equipó su mascota al entrar
    case 'leave': return removeRemote(m.id);
    case 'spawn': return onNetSpawn(m);
    case 'snap': xmasSnap(m.e); return onSnap(m);
    case 'elves': if (xmas.on) { for (const e of xmas.elves.values()) scene.remove(e.mesh); xmas.elves.clear(); for (const id of m.e) xmasElf(id); } return;   // [NAVIDAD]
    case 'gadd': return xmasAddGifts(m.g);
    case 'gdel': return xmasDelGift(m.id);
    case 'gclr': for (const g of [...xmas.gifts.keys()]) xmasDelGift(g); xmas.mine = 0; return updateXmasHud();
    case 'gpick': { xmasDelGift(m.id); if (Array.isArray(m.tk)) net.tk = m.tk; if (m.p === net.id) { xmas.mine = m.n; updateXmasHud(); popGift(); } updateHudSlow(); return; }
    case 'ekill': { const e = xmas.elves.get(m.id); if (e) { e.alive = false; e.mesh.visible = false; } return; }
    case 'shot': return onNetShot(m);
    case 'hit': return onNetHit(m);
    case 'hurt': return onNetHurt(m);
    case 'kill': return onNetKill(m);
    case 'board': return onNetBoard(m);
    case 'team': return onNetTeam(m);
    case 'melee': { const f = net.remotes.get(m.id); if (f && f.alive) f.knifeT = 0.5; return; }
    case 'end': return onNetEnd(m);
    case 'round': return onNetRound(m);
    case 'fix': {   // [PR1] el antitrampas del servidor corrige la posición: suave si es un desajuste pequeño, snap duro si es grande
      if (!player) return;
      net.ep = m.ep;
      const dx = player.pos.x - m.x, dy = player.pos.y - m.y, dz = player.pos.z - m.z, dist = Math.hypot(dx, dy, dz);
      player.pos.set(m.x, m.y, m.z);   // la posición REAL (física, disparos, mensajes al servidor) se corrige siempre al instante: nunca se retrasa
      if (dist > GF.FIX_HARD_DIST) { player.vel.set(0, 0, 0); fixOffset.set(0, 0, 0); }   // desajuste grande: parada en seco, sin desfase que disolver
      else fixOffset.add(new THREE.Vector3(dx, dy, dz));   // desajuste pequeño: la CÁMARA se queda un instante donde estaba y se desliza hasta el sitio correcto
      return;
    }
    case 'pong': net.ping = Math.round(performance.now() - m.ts); return;
    case 'chat': return chatAdd(m.id === net.id ? 'me' : '', m.n, m.m, m.rl, m.i);
    case 'chatdel': return chatDel(m.i);
    case 'notice': return showNotice(m);
    case 'reportok': return reportResult(m);
    case 'zone': net.zone = m.z; if (window.PPR_BP.onZone) window.PPR_BP.onZone(m.z); return;
    case 'gg': return onNetLadder(m);
    case 'rank': net.rank = m; return onNetRank(m);
    case 'sstats': net.sstats = m.p; if (window.PPR_BP.onSpecStats) window.PPR_BP.onSpecStats(m.p); return;
    case 'award': return onNetAward(m);
    case 'bpxp': return window.PPR_BP.onXp && window.PPR_BP.onXp(m);
    case 'votes': endVote.counts = m.v; return renderEndMaps();
    case 'map': buildMap(m.map); return;
    case 'cash': net.cash = m.cash; renderDeathPick(); return;   // [NUEVO] tienda de armas: dinero actualizado (reinicio de ronda)
    case 'buy': return onNetBuy(m);   // [NUEVO] tienda de armas: resultado de una compra
    case 'err': if (!net.joined) return netFail(m.m || 'Error del servidor.'); leaveToMenu(); return setNetMsg(m.m || 'Error del servidor.');
  }
}
function onWelcome(m) {
  clearTimeout(net.timer); net.joined = true; net.tries = 0; net.id = m.id; setNetMsg('');
  { const ec = $('#endCr'), er = $('#endRank'); if (ec) ec.hidden = true; if (er) er.hidden = true; }
  net.mode = S.MODES[m.mode] ? m.mode : 'duelo'; net.ranked = !!m.rk; net.zone = m.zone || null; net.gl = 0; net.rank = null; net.spec = !!m.spec;   // [NUEVO] modo de la sala
  net.cash = Number.isFinite(m.cash) ? m.cash : S.CONST.SHOP_START_CASH;   // [NUEVO] tienda de armas
  if (curMap !== m.map) buildMap(m.map);
  clearFighters();
  if (m.spec) {   // espectador: sin jugador propio; la cámara sigue a los demás
    player = newFighter('Espectador', true, '#ffffff'); player.alive = false; player.id = 0; fighters = [player]; bots = []; net.tk = m.tk || [0, 0]; teamLimit = m.lim != null ? m.lim : 60; m.players.forEach(addRemote);
    document.body.classList.remove('dead'); simTime = 0; timeLeft = m.tl; $('#menu').hidden = true; $('#end').hidden = true; $('#pause').hidden = true; hud.hidden = true; el.board.hidden = true; el.death.hidden = true; gun.visible = false; document.body.classList.remove('playing'); document.body.classList.add('spectating');
    state = 'spectate'; if (window.PPR_BP.onSpectate) window.PPR_BP.onSpectate(true); return;
  }
  player = newFighter(m.n || cfg.name, true, '#ffc857'); player.rl = m.rl || 0; player.team = m.tm === 1 ? 1 : 0; net.tk = m.tk || [0, 0]; teamLimit = m.lim != null ? m.lim : 60;
  player.id = m.id; player.wi = cfg.cls; player.alive = false; player.ammo = 0; player.reload = 0; player.fireCd = 0; player.slide = 0; player.aim = 0; player.eye = 1.6; player.meleeCd = 0;
  fighters = [player]; bots = [];
  m.players.forEach(addRemote);
  simTime = 0; timeLeft = m.tl; hudAcc = 0; net.ep = 0; net.sendAcc = 0; net.pingAcc = 0; net.wait = false;
  el.feed.innerHTML = '';
  $('#menu').hidden = true; $('#end').hidden = true; $('#pause').hidden = true; hud.hidden = false; el.board.hidden = true; el.death.hidden = true;
  document.body.classList.add('playing');
  camera.fov = cfg.fov; camera.updateProjectionMatrix();
  state = 'playing'; updateChatCh();
  const b = $('#playOnline'); b.textContent = 'Jugar online';
  updateHudSlow(); updateHudFast();
  toast('Sala ' + m.room + ' · ' + MAPS[m.map].name + ' · ' + S.MODES[net.mode].name + (net.ranked ? ' (clasificatorio)' : '') + ' · Equipo ' + TEAMS[player.team].n); teamBanner(player.team, S.MODES[net.mode].short + ' · sin fuego amigo');
  if (window.PPR_BP.onMode) window.PPR_BP.onMode(net);
  xmasWelcome(m);   // [NAVIDAD] al final: más arriba se llama a clearFighters, que borraría los duendes
}
function addRemote(p) {
  if (!player || p.id === net.id || net.remotes.has(p.id)) return;
  const lk = Array.isArray(p.lk) ? p.lk : null;
  const f = newFighter(p.n, false, '#ffffff'); f.skin = lk ? lk[1] : undefined; f.team = p.tm === 1 ? 1 : 0; f.color = TEAMS[f.team].c; f.accent = lk ? (COLORS[lk[0]] || COLORS[0]).c : null;   // camiseta del equipo, hombreras con su color
  f.id = p.id; f.kills = p.k || 0; f.deaths = p.d || 0; f.points = p.p || 0; f.buf = []; f.walk = 0;
  f.seed = p.id; f.wi = p.c || 0; f.rl = p.rl || 0; f.mesh = buildBot(f.color, f.wi, f.seed, f.skin, f.accent); f.label = makeLabel(f.name, f.rl, f.team);
  f.mesh.visible = false; f.label.visible = false;
  scene.add(f.mesh); scene.add(f.label);
  if (p.alive) {
    f.alive = true; f.pos.set(p.x, p.y, p.z); f.yaw = p.yaw || 0; f.h = p.h || 1.8;
    f.buf.push({ t: performance.now(), x: p.x, y: p.y, z: p.z, yaw: f.yaw, pitch: p.pitch || 0, h: f.h });
    f.mesh.visible = true; f.label.visible = true; f.mesh.position.copy(f.pos); f.mesh.rotation.y = f.yaw;
  }
  net.remotes.set(p.id, f); fighters.push(f); setPet(f, p.pt);   // [MASCOTAS]
  if (p.of) setCharOutfit(f, p.of);   // [TRAJES]
  if (p.sk) applyLook(f, p.sk);   // [SKINS VISIBLES]
  updateHudSlow();
}
/* ===== [MASCOTAS] Te siguen flotando junto al hombro y los demás las ven. Son objetos aparte (no hijos del muñeco),
   porque fillCharacter borra todo lo que cuelga del personaje al cambiar de ropa o de arma. La mascota de cada jugador
   la decide el servidor según su inventario (mensajes «join» y «pet»), nunca el propio cliente. ===== */
const PET_OFF = new THREE.Vector3(0.62, 1.55, 0.05), PET_UP = new THREE.Vector3(0, 1, 0), _petV = new THREE.Vector3();
function petMesh(def) {
  const g = new THREE.Group(), b = def.body, a = def.acc, e = def.eye;
  const B = (w, h, d, c, x, y, z, rz) => { const m = new THREE.Mesh(BG(w, h, d), mat(c)); m.position.set(x, y, z); if (rz) m.rotation.z = rz; g.add(m); return m; };
  const eyes = (y, z, gap) => { B(0.055, 0.07, 0.02, e, -gap, y, z); B(0.055, 0.07, 0.02, e, gap, y, z); };
  const S3 = (r, c, x, y, z, sx, sy, sz, basic) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), basic ? basicMat(c) : mat(c)); m.position.set(x, y, z); m.scale.set(sx || 1, sy || 1, sz || 1); g.add(m); return m; };
  const eyeBall = (x, y, z, r) => { S3(r, '#ffffff', x, y, z, 1, 1, 0.6); const pu = S3(r * 0.55, e, x, y, z - r * 0.45, 1, 1, 0.5); return pu; };   // ojo con blanco y pupila
  const spin = [], flap = [], blink = [];
  if (def.kind === 'drone') {   // [MASCOTAS 2] dron con brazos en X, hélices que giran, cámara y luces
    B(0.24, 0.08, 0.3, b, 0, 0, 0); B(0.16, 0.05, 0.2, a, 0, 0.06, 0.01); B(0.2, 0.03, 0.22, '#1b2038', 0, -0.05, 0);
    for (const [x, z] of [[0.19, 0.19], [-0.19, 0.19], [0.19, -0.19], [-0.19, -0.19]]) {
      const arm = B(0.26, 0.025, 0.04, b, x / 2, 0.01, z / 2); arm.rotation.y = Math.atan2(-z, x);
      B(0.06, 0.05, 0.06, '#1b2038', x, 0.03, z);
      const rot = new THREE.Group(); rot.position.set(x, 0.065, z); g.add(rot); spin.push(rot);
      const blade = new THREE.Mesh(BG(0.2, 0.008, 0.03), mat('#e9edf5')); rot.add(blade); const b2 = blade.clone(); b2.rotation.y = Math.PI / 2; rot.add(b2);
    }
    S3(0.045, '#1b2038', 0, -0.02, -0.16); S3(0.028, e, 0, -0.02, -0.19, 1, 1, 0.5, true);   // cámara
    S3(0.015, '#ff3b48', 0.1, 0.0, -0.15, 1, 1, 1, true); S3(0.015, '#3dff9a', -0.1, 0.0, -0.15, 1, 1, 1, true);
  } else if (def.kind === 'ball') {   // [MASCOTAS 2] bola con ojos grandes que bota y parpadea
    S3(0.17, b, 0, 0, 0); S3(0.12, a, 0.02, 0.08, -0.06, 1, 0.5, 0.8);   // brillo
    blink.push(eyeBall(-0.065, 0.03, -0.14, 0.055), eyeBall(0.065, 0.03, -0.14, 0.055));
    B(0.08, 0.02, 0.02, '#1b2038', 0, -0.06, -0.165);   // boquita
    for (const x of [-0.13, 0.13]) S3(0.03, a, x, -0.03, -0.12, 1, 0.6, 0.5);   // mofletes
  } else if (def.kind === 'bird') {   // [MASCOTAS 2] pájaro: cuerpo redondo, pico, cresta, cola y alas que baten
    S3(0.13, b, 0, 0, 0, 1, 0.95, 1.15); S3(0.1, '#ffffff', 0, -0.03, -0.06, 0.9, 0.8, 0.7);
    B(0.05, 0.04, 0.08, a, 0, 0.02, -0.17); B(0.04, 0.02, 0.05, a, 0, -0.005, -0.16);   // pico
    for (const [x, h] of [[0, 0.07], [0.03, 0.05], [-0.03, 0.05]]) B(0.025, h, 0.03, b, x, 0.14, -0.02);   // cresta
    B(0.1, 0.02, 0.12, b, 0, 0.03, 0.15, 0); B(0.06, 0.02, 0.1, '#1b2038', 0, 0.035, 0.2);   // cola
    for (const sx of [-1, 1]) { const w = new THREE.Group(); w.position.set(sx * 0.11, 0.03, 0); g.add(w); const m = new THREE.Mesh(BG(0.18, 0.02, 0.12), mat(b)); m.position.x = sx * 0.09; w.add(m); const tip = new THREE.Mesh(BG(0.06, 0.021, 0.1), mat('#1b2038')); tip.position.x = sx * 0.16; w.add(tip); w.userData.sx = sx; flap.push(w); }
    blink.push(eyeBall(-0.06, 0.05, -0.1, 0.035), eyeBall(0.06, 0.05, -0.1, 0.035));
    for (const x of [-0.04, 0.04]) B(0.015, 0.06, 0.015, a, x, -0.14, 0);
  } else if (def.kind === 'ufo') {   // [MASCOTAS 2] platillo volador: disco metálico, cúpula de cristal con alienígena, luces que giran y rayo de luz
    S3(0.26, b, 0, 0, 0, 1, 0.22, 1); S3(0.2, '#8a93b8', 0, -0.03, 0, 1, 0.2, 1);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#bff6ff', transparent: true, opacity: 0.45 })); dome.position.y = 0.04; g.add(dome);
    S3(0.055, a, 0, 0.08, 0); S3(0.018, '#0b1020', -0.022, 0.09, -0.045, 1, 1.3, 0.5, true); S3(0.018, '#0b1020', 0.022, 0.09, -0.045, 1, 1.3, 0.5, true);   // alienígena
    const ring = new THREE.Group(); g.add(ring); spin.push(ring);
    for (let i = 0; i < 8; i++) { const an = i / 8 * TAU; const l = S3(0.022, i % 2 ? e : '#ffd23a', Math.cos(an) * 0.235, -0.01, Math.sin(an) * 0.235, 1, 1, 1, true); ring.add(l); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.5, 14, 1, true), new THREE.MeshBasicMaterial({ color: e, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = -0.3; g.add(beam); g.userData.beam = beam;
  } else if (def.kind === 'ghost') {
    B(0.3, 0.32, 0.28, b, 0, 0, 0); B(0.3, 0.04, 0.28, a, 0, 0.18, 0);
    for (const x of [-0.1, 0, 0.1]) B(0.08, 0.08, 0.28, b, x, -0.19, 0);
    eyes(0.04, -0.145, 0.07);
  } else if (def.kind === 'fox') {
    B(0.22, 0.2, 0.32, b, 0, -0.06, 0.02); B(0.24, 0.22, 0.22, b, 0, 0.1, -0.18);
    B(0.06, 0.1, 0.05, b, -0.08, 0.26, -0.18); B(0.06, 0.1, 0.05, b, 0.08, 0.26, -0.18);
    B(0.1, 0.08, 0.07, a, 0, 0.05, -0.31); B(0.09, 0.09, 0.22, b, 0, 0.0, 0.26); B(0.09, 0.09, 0.07, a, 0, 0.0, 0.39);
    eyes(0.14, -0.295, 0.06);
  } else if (def.kind === 'dragon') {
    B(0.26, 0.22, 0.34, b, 0, -0.02, 0.02); B(0.22, 0.2, 0.22, b, 0, 0.11, -0.22);
    B(0.04, 0.08, 0.04, a, -0.07, 0.25, -0.2); B(0.04, 0.08, 0.04, a, 0.07, 0.25, -0.2);
    B(0.3, 0.03, 0.18, a, -0.26, 0.08, 0.02, 0.35); B(0.3, 0.03, 0.18, a, 0.26, 0.08, 0.02, -0.35);
    B(0.08, 0.08, 0.24, b, 0, -0.04, 0.3); eyes(0.14, -0.335, 0.06);
  } else {   // cube
    B(0.3, 0.3, 0.3, b, 0, 0, 0); B(0.31, 0.06, 0.31, a, 0, 0.08, 0); eyes(0.0, -0.155, 0.07);
  }
  g.userData.kind = def.kind; g.userData.spin = spin; g.userData.flap = flap; g.userData.blink = blink; return g;
}
/* [MASCOTAS 2] Animación propia de cada mascota: hélices y luces que giran, alas que baten, ojos que parpadean, la bola bota */
function animPetParts(o, tt) {
  const u = o.userData, ph = u.phase || 0;
  for (const r of u.spin || []) r.rotation.y = tt * (u.kind === 'ufo' ? 2.2 : 28);
  for (const w of u.flap || []) w.rotation.z = w.userData.sx * Math.sin(tt * 14 + ph) * 0.7;
  const shut = (tt * 0.7 + ph) % 3.2 < 0.12; for (const b of u.blink || []) b.parent && (b.visible = !shut);
  if (u.kind === 'ball') { const k = Math.abs(Math.sin(tt * 4 + ph)); o.children[0].scale.set(1 + (1 - k) * 0.08, 1 - (1 - k) * 0.1, 1 + (1 - k) * 0.08); o.position.y += k * 0.08; }
  if (u.beam) u.beam.material.opacity = 0.12 + 0.08 * Math.sin(tt * 5);
}
const petDef = id => (id ? S.PETS.find(p => p.id === id) : null) || null;
function setPet(f, id) {   // mascota de un jugador de la partida (la manda el servidor)
  if (f.petObj) { scene.remove(f.petObj); f.petObj = null; }
  f.pt = id || ''; const def = petDef(f.pt); if (!def) return;
  f.petObj = petMesh(def); f.petObj.visible = false; f.petObj.userData.phase = (f.seed || 0) * 1.7; scene.add(f.petObj);
}
function setPreviewPet() {   // la tuya, junto a tu personaje en la lobby
  if (!pv.scene) return;
  if (pv.pet) { pv.scene.remove(pv.pet); pv.pet = null; }
  const def = petDef((window.PPR_BP.equipped || {}).pet); if (!def) return;
  pv.pet = petMesh(def); pv.pet.scale.setScalar(1.35); pv.scene.add(pv.pet);
}
function animPets(dt) {
  const tt = performance.now() / 1000;
  for (const f of fighters) {
    const o = f.petObj; if (!o) continue;
    const vis = !!(f.alive && f.mesh && f.mesh.visible); o.visible = vis; if (!vis) continue;
    _petV.copy(PET_OFF).applyAxisAngle(PET_UP, f.yaw).add(f.pos);
    if (!o.userData.placed) { o.position.copy(_petV); o.userData.placed = true; } else o.position.lerp(_petV, Math.min(1, dt * 8));
    o.position.y += Math.sin(tt * 3 + o.userData.phase) * 0.05; o.rotation.y = f.yaw + Math.sin(tt * 1.3 + o.userData.phase) * 0.25; animPetParts(o, tt);
  }
  if (pv.pet) { pv.pet.position.set(0.8, 1.74 + Math.sin(tt * 3) * 0.05, 0.25); pv.pet.rotation.y = tt * 0.9; animPetParts(pv.pet, tt); }   // en la vista previa: fija a la derecha del personaje (si girase con él, taparía la cabeza), girando sobre sí misma
}
function removeRemote(id) {
  const f = net.remotes.get(id); if (!f) return;
  scene.remove(f.mesh); scene.remove(f.label); if (f.petObj) scene.remove(f.petObj); net.remotes.delete(id);
  fighters = fighters.filter(x => x !== f); if (deathLook === f) deathLook = null;
  updateHudSlow();
}
function applySpawnLocal(m) {
  const p = player;
  p.pos.set(m.x, m.y, m.z); p.vel.set(0, 0, 0); p.hp = 100; p.alive = true; p.protect = 1.5; p.h = 1.8; p.yaw = m.yaw; p.pitch = 0; net.ep = m.ep; spawnAt = performance.now();
  p.wi = m.c; const w = WEAPONS[p.wi];
  p.ammo = w.mag; p.reload = 0; p.fireCd = 0.3; p.slide = 0; p.aim = 0; p.eye = 1.6; p.meleeCd = 0;
  buildGun(w); resetSlot(); gun.visible = true; el.death.hidden = true; deathLook = null; sfx.spawn(); document.body.classList.remove('dead'); fixOffset.set(0, 0, 0); if (state === 'playing') requestLock();   // [NUEVO] se recupera el bloqueo del puntero al reaparecer y el cursor vuelve a ocultarse; [PR1] sin desfase de la vida anterior
}
function onNetSpawn(m) {
  if (!player) return;
  if (m.id === net.id) return applySpawnLocal(m);
  const f = net.remotes.get(m.id); if (!f) return;
  resetPose(f); setOutfit(f, m.c || 0); f.alive = true; f.pos.set(m.x, m.y, m.z); f.yaw = m.yaw; f.h = 1.8;
  f.buf = [{ t: performance.now(), x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: 0, h: 1.8 }];
  f.mesh.visible = true; f.label.visible = true; f.mesh.position.copy(f.pos); f.mesh.rotation.y = f.yaw;
}
function onSnap(m) {
  if (!player) return;
  timeLeft = m.tl; net.wait = !!m.w; player.hp = m.hp;
  const t = performance.now();
  for (const s of m.s) {
    if (s[0] === net.id) continue;
    const f = net.remotes.get(s[0]); if (!f || !f.alive) continue;
    f.buf.push({ t, x: s[1], y: s[2], z: s[3], yaw: s[4], pitch: s[5], h: s[6] });
    if (f.buf.length > 12) f.buf.shift();
  }
}
function onNetShot(m) {
  flashChar(net.remotes.get(m.id));
  const o = new THREE.Vector3(m.o[0], m.o[1], m.o[2]), e = new THREE.Vector3(m.e[0], m.e[1], m.e[2]);
  const dir = e.clone().sub(o).normalize(), start = o.clone().addScaledVector(dir, 0.7); start.y -= 0.25;
  tracer(start, e, m.rl ? '#ffd23f' : '#ffb3b6');
  const pd = player ? Math.hypot(o.x - player.pos.x, o.z - player.pos.z) : 99;
  if (WEAPONS[m.c]) sfx.shot(WEAPONS[m.c], clamp(1 - pd / 55, 0, 1) * 0.7);
}
function onNetHit(m) {
  dmgNumber(m.d, !!m.h, !!m.k);
  if (m.k) { if (Number.isFinite(m.cash)) { net.cash = m.cash; renderDeathPick(); } hitmark('kill'); return; }   // [NUEVO] tienda de armas: dinero por la baja
  hitmark(m.h ? 'head' : 'hit'); (m.h ? sfx.head : sfx.hit)();
}
function onNetHurt(m) {
  if (!player) return;
  playerHurtFx(+m.d || 20, m.ax, m.az);   // [MEJORA] antes duplicaba el código del modo offline
}
function onNetKill(m) {
  if (!player) return;
  const k = m.k === net.id ? player : net.remotes.get(m.k), v = m.v === net.id ? player : net.remotes.get(m.v);
  if (!v) return;
  v.alive = false;
  startDying(v);
  burst(new THREE.Vector3(v.pos.x, v.pos.y + 1, v.pos.z), v.isPlayer ? '#ff5a5f' : v.color, 16, 5);
  if (k && m.kr) k.rl = m.kr;
  if (m.kr) goldKillFx(new THREE.Vector3(v.pos.x, v.pos.y + 1, v.pos.z)); // efecto dorado exclusivo de administradores e influencers
  if (k) feedAdd(k, v, m.w, !!m.h);
  if (k === player) {
    player.streak = (player.streak || 0) + 1; player.bestStreak = Math.max(player.bestStreak || 0, player.streak);
    sfx.kill(); hitmark('kill'); if (player.rl) { sfx.gold(); goldFlash(); }
    killPopup(v.name, m.pts, !!m.h, m.streak, !!player.rl, v.rl);
  }
  if (v === player) {
    player.streak = 0; player.hp = 0;
    el.death.hidden = false; document.body.classList.add('dead'); if (document.exitPointerLock) document.exitPointerLock();   // [CORREGIDO] «dead» hace visible el cursor (antes quedaba invisible aunque se liberase el bloqueo)
    el.deathBy.textContent = k && k !== v ? 'Te eliminó ' + k.name + ' con ' + m.w + (m.h ? ' (cabeza)' : '') + (m.ds != null ? ' · a ' + m.ds + ' m' : '') + (m.ah != null ? ' · le quedan ' + m.ah + ' de vida' : '') : 'Has caído';
    deathLook = k && k !== v ? k : null; net.respawnAt = performance.now() + (m.rs || 3) * 1000;
    renderDeathPick(); mouseL = mouseR = false; el.scope.hidden = true; el.optic.hidden = true; gun.visible = false; el.cross.style.opacity = 0;
  }
}
/* [NUEVO] Carrera de armas: el servidor te da el arma de tu nivel */
const gunsOK = () => !(online && !net.spec && (net.mode === 'cuchillos' || (net.mode === 'carrera' && net.gl >= teamLimit - 1)));
function onNetLadder(m) {
  if (!player || !WEAPONS[m.c]) return; const nivel = m.lv, last = teamLimit - 1;
  net.gl = m.lv; player.wi = m.c; const w = WEAPONS[m.c]; player.ammo = w.mag; player.reload = 0;
  if (player.alive) { buildGun(w); if (!gunsOK()) { slot = 1; updateSlotHud(); } }
  toast(m.down ? 'Te mataron a cuchillo: bajas al nivel ' + (nivel + 1) : nivel >= last ? '¡Nivel final! Solo cuchillo: una baja más y ganas' : 'Nivel ' + (nivel + 1) + '/' + (last + 1) + ': ' + w.name);
  if (window.PPR_BP.onMode) window.PPR_BP.onMode(net);
}
function onNetRank(m) {   // puntuación clasificatoria tras la ronda (se enseña en la pantalla final)
  const e = $('#endRank'); if (!e) return; e.hidden = false; e.style.setProperty('--c', m.col);
  e.innerHTML = 'CLASIFICATORIO · <b>' + (m.delta >= 0 ? '+' : '') + m.delta + '</b> → ' + m.mmr + ' pts · <b>' + esc(m.league) + '</b>' + (m.up ? ' · ¡SUBES DE LIGA!' : m.down ? ' · bajas de liga' : '') + (m.games <= 10 ? ' <small>(colocación ' + m.games + '/10)</small>' : '');
}
function onNetTeam(m) { // el servidor equilibra los equipos entre rondas
  if (m.id === net.id) { player.team = m.tm; buildGun(WEAPONS[player.wi]); toast('Cambias al equipo ' + TEAMS[m.tm].n + ' para equilibrar'); teamBanner(m.tm, 'Equipos equilibrados'); updateHudSlow(); return; }
  const f = net.remotes.get(m.id); if (!f || f.team === m.tm) return;
  f.team = m.tm; f.color = TEAMS[m.tm].c; scene.remove(f.mesh); scene.remove(f.label);
  f.mesh = buildBot(f.color, f.wi, f.seed, f.skin, f.accent); f.label = makeLabel(f.name, f.rl, f.team); f.mesh.visible = f.alive; f.label.visible = f.alive;
  if (f.outfit) setCharOutfit(f, f.outfit);   // [TRAJES] al cambiar de equipo se conserva el traje
  scene.add(f.mesh); scene.add(f.label); updateHudSlow();
}
function onNetBoard(m) {
  if (m.tk) net.tk = m.tk;
  for (const b of m.b) {
    const f = b[0] === net.id ? player : net.remotes.get(b[0]);
    if (f) { f.kills = b[1]; f.deaths = b[2]; f.points = b[3]; }
  }
  updateHudSlow();
}
function onNetAward(m) { // el servidor ha repartido PX y progreso a esta cuenta
  if (!remote) return;
  remote.px = m.balance; remote.stats = m.stats; net.prevBest = m.prevBest; lastReward = { kr: m.px, mult: m.mult, notes: [] }; if (m.ev && m.ev.length) lastReward.notes.push('Evento: ' + m.ev.join(' · '));
  if (m.crBalance != null) { remote.credits = m.crBalance; renderCr(); const ec = $('#endCr'); if (ec) { ec.hidden = !(m.cr > 0); ec.textContent = '+' + fmtKr(m.cr | 0) + ' Créditos'; } }   // [NUEVO]
}
const endVote = { sel: -1, counts: [0, 0, 0, 0] };
function renderEndMaps() {
  const sel = online ? endVote.sel : cfg.map;
  $('#endMapBtns').innerHTML = MAPS.map((m, i) => '<button type="button" class="emap" data-i="' + i + '" aria-pressed="' + (i === sel) + '" style="--img:url(' + mapImg(i) + ');--a:' + m.pal[1] + ';--b:' + m.pal[3] + '"><b>' + esc(m.name) + '</b>' + (online ? '<em>' + (endVote.counts[i] || 0) + ' votos</em>' : '') + '</button>').join('');
  $('#endMapsNote').textContent = online ? 'Vota: el mapa con más votos se juega en la siguiente ronda.' : 'Elige el mapa y pulsa «Jugar otra vez».';
}
function initEnd() {
  $('#endMapBtns').addEventListener('click', e => {
    const b = e.target.closest('.emap'); if (!b) return; const i = +b.dataset.i;
    if (online) { endVote.sel = i; netSend({ t: 'vote', m: i }); } else { cfg.map = i; saveCfg(); buildMapButtons(); updateLobby(); }
    renderEndMaps();
  });
}
function onNetEnd(m) {
  if (net.spec) { net.endAt = performance.now() + m.next * 1000; if (window.PPR_BP.onSpecEnd) window.PPR_BP.onSpecEnd(m); return; }
  if (m.nb > 0 && m.rw === false) toast('Sala con bots: esta ronda no da premios (hacen falta 2 jugadores reales).');   // [NUEVO]
  { const ex = $('#endXp'); if (ex) ex.hidden = true; }   // (la línea de Créditos y la de clasificatorio llegan ANTES del fin de ronda: se ocultan al empezar la siguiente)   // la XP del pase llega poco después (mensaje bpxp)
  if (!player) return;
  state = 'ended'; document.body.classList.remove('playing');
  if (document.exitPointerLock) document.exitPointerLock();
  mouseL = mouseR = false; Object.keys(keys).forEach(k => { keys[k] = false; });
  hud.hidden = true; el.board.hidden = true; el.scope.hidden = true; el.optic.hidden = true; gun.visible = false; $('#pause').hidden = true;
  sfx.end();
  const rows = m.res, idx = rows.findIndex(r => r[0] === net.id), me = rows[idx], mine = me && me[8] != null ? me[8] : player.team, win = m.tw == null ? -1 : m.tw, won = win >= 0 && win === mine;
  let prevBest = 0;
  if (remote) prevBest = net.prevBest || 0;
  else if (me && me[2] + me[3] > 0) {
    player.kills = me[2]; player.deaths = me[3]; player.points = me[4]; player.hs = me[5]; player.wi = me[6];
    prevBest = saveLocalResult(player, won);
  }
  $('#endTitle').textContent = teamTitle(win, mine);
  $('#endSub').innerHTML = teamScore(m.tk || [0, 0]) + (me ? 'Quedaste en el puesto ' + (idx + 1) + ' de ' + rows.length + ' con ' + me[4] + ' puntos.' + (me[4] > prevBest && me[4] > 0 ? '<span class="pill">Nuevo récord</span>' : '') + rewardHtml() : 'Fin de la partida.');
  $('#endRows').innerHTML = rows.map((r, i) => '<tr class="' + (r[0] === net.id ? 'me ' : '') + (i === 0 ? 'first ' : '') + 't' + (r[8] === 1 ? 1 : 0) + '"><td class="pos">' + (i + 1) + '</td><td>' + tdot(r[8]) + nameHtml(r[1], r[7]) + '</td><td class="r">' + r[2] + '</td><td class="r">' + r[3] + '</td><td class="r">' + r[4] + '</td></tr>').join('');
  $('#again').hidden = true; $('#endNext').hidden = false; net.endAt = performance.now() + m.next * 1000; net.endTxt = '';
  endVote.sel = -1; endVote.counts = MAPS.map(() => 0); $('#endMaps').hidden = MAPS.length < 2; renderEndMaps();   /* con un solo mapa no hay nada que votar */
  updateEndCountdown();
  $('#end').hidden = false;
}
function onNetRound(m) {
  if (net.spec) { net.remotes.forEach(f => { f.alive = false; resetPose(f); f.mesh.visible = false; f.label.visible = false; }); timeLeft = m.tl; teamLimit = m.lim != null ? m.lim : teamLimit; net.zone = m.zone || null; return; }
  if (!player) return;
  if (m.nb > 0) toast('Sala con bots de relleno: no se dan premios ni estadísticas hasta que haya 2 jugadores reales.');   // [NUEVO]
  net.gl = 0; teamLimit = m.lim != null ? m.lim : teamLimit; net.zone = m.zone || null; { const ec = $('#endCr'), er = $('#endRank'); if (ec) ec.hidden = true; if (er) er.hidden = true; } if (window.PPR_BP.onMode) window.PPR_BP.onMode(net);
  teamBanner(player.team, 'Nueva ronda · sin fuego amigo');
  $('#end').hidden = true; hud.hidden = false; el.feed.innerHTML = '';
  fighters.forEach(f => { f.kills = f.deaths = f.points = f.hs = f.streak = 0; });
  player.bestStreak = 0; player.alive = false; timeLeft = m.tl; net.tk = [0, 0];
  net.remotes.forEach(f => { f.alive = false; resetPose(f); f.mesh.visible = false; f.label.visible = false; });
  updateHudSlow();
  state = 'paused'; document.body.classList.remove('playing'); setPauseTexts('round'); $('#pause').hidden = false;
}

/* --- Simulación en línea --- */
function updateRemotes(dt) {
  const rt = performance.now() - INTERP;
  for (const f of net.remotes.values()) {
    if (!f.alive || !f.buf.length) continue;
    const b = f.buf;
    while (b.length > 2 && b[1].t <= rt) b.shift();
    const a = b[0], c = b[1];
    let x = a.x, y = a.y, z = a.z, yaw = a.yaw, pitch = a.pitch, h = a.h;
    if (c && rt >= a.t) {
      const k = clamp((rt - a.t) / Math.max(1, c.t - a.t), 0, 1);
      x = a.x + (c.x - a.x) * k; y = a.y + (c.y - a.y) * k; z = a.z + (c.z - a.z) * k;
      yaw = a.yaw + wrapAng(c.yaw - a.yaw) * k; pitch = a.pitch + (c.pitch - a.pitch) * k; h = c.h;
    }
    const sp = Math.hypot(x - f.pos.x, z - f.pos.z) / Math.max(dt, 1e-3);
    f.pos.set(x, y, z); f.yaw = yaw; f.pitch = pitch; f.h = h;
    poseChar(f, sp, dt); f.mesh.scale.y = clamp(h / 1.8, 0.7, 1);
    f.mesh.position.copy(f.pos); f.mesh.rotation.y = yaw;
    f.label.position.set(x, y + 2.3, z);
  }
}
function stepOnline(dt) {
  simTime += dt;
  updatePlayer(dt);
  updateRemotes(dt);
  updateFx(dt);
  net.sendAcc += dt;
  if (net.sendAcc >= 0.05) {
    net.sendAcc = 0;
    if (player.alive) netSend({ t: 'st', ep: net.ep, x: r3(player.pos.x), y: r3(player.pos.y), z: r3(player.pos.z), yaw: r3(player.yaw), pitch: r3(player.pitch), h: r3(player.h) });
  }
  net.pingAcc += dt;
  if (net.pingAcc > 2) { net.pingAcc = 0; netSend({ t: 'ping', ts: performance.now() }); }
}

/* =====================================================================
   Flujo de la partida
   ===================================================================== */
/* ===== [NAVIDAD] Duendes y regalos: el servidor manda dónde están y quién coge qué; aquí solo se dibujan ===== */
const xmas = { on: false, elves: new Map(), gifts: new Map(), mine: 0 };
function elfMesh() {
  const g = new THREE.Group(), B = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(BG(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const legL = B(0.13, 0.32, 0.14, '#1f5e2e', -0.08, 0.16, 0), legR = B(0.13, 0.32, 0.14, '#1f5e2e', 0.08, 0.16, 0);
  B(0.15, 0.08, 0.2, '#3a2412', -0.08, 0.04, 0.03); B(0.15, 0.08, 0.2, '#3a2412', 0.08, 0.04, 0.03);   // botas
  B(0.36, 0.34, 0.24, '#2fa84f', 0, 0.49, 0); B(0.37, 0.06, 0.25, '#3a2412', 0, 0.4, 0); B(0.07, 0.07, 0.02, '#ffd23f', 0, 0.4, 0.13);   // túnica, cinturón y hebilla
  B(0.09, 0.28, 0.11, '#2fa84f', -0.23, 0.5, 0); B(0.09, 0.28, 0.11, '#2fa84f', 0.23, 0.5, 0);   // brazos
  B(0.28, 0.26, 0.26, '#f2c9a0', 0, 0.8, 0);   // cabeza
  B(0.05, 0.1, 0.1, '#f2c9a0', -0.16, 0.84, 0).rotation.z = 0.5; B(0.05, 0.1, 0.1, '#f2c9a0', 0.16, 0.84, 0).rotation.z = -0.5;   // orejas puntiagudas
  B(0.05, 0.05, 0.02, '#1b2038', -0.06, 0.82, 0.135); B(0.05, 0.05, 0.02, '#1b2038', 0.06, 0.82, 0.135);   // ojos
  B(0.32, 0.06, 0.3, '#ffffff', 0, 0.95, 0); B(0.24, 0.12, 0.22, '#e03a3a', 0, 1.04, -0.02); B(0.14, 0.1, 0.13, '#e03a3a', 0, 1.14, -0.07); B(0.09, 0.09, 0.09, '#ffffff', 0, 1.2, -0.13);   // gorro y pompón
  g.userData.legs = [legL, legR]; return g;
}
const GIFT_COLS = [['#e03a3a', '#ffd23f'], ['#2fa84f', '#ffffff'], ['#3a86ff', '#ffd23f'], ['#b388ff', '#ffffff']];
function giftMesh(id) {
  const [c, r] = GIFT_COLS[id % GIFT_COLS.length], g = new THREE.Group(), B = (w, h, d, col, x, y, z) => { const m = new THREE.Mesh(BG(w, h, d), mat(col)); m.position.set(x, y, z); g.add(m); return m; };
  B(0.36, 0.3, 0.36, c, 0, 0.15, 0); B(0.38, 0.06, 0.38, c, 0, 0.32, 0);   // caja y tapa
  B(0.07, 0.36, 0.385, r, 0, 0.17, 0); B(0.385, 0.36, 0.07, r, 0, 0.17, 0);   // lazo en cruz
  B(0.12, 0.08, 0.05, r, -0.06, 0.39, 0).rotation.z = 0.5; B(0.12, 0.08, 0.05, r, 0.06, 0.39, 0).rotation.z = -0.5;   // el nudo
  return g;
}
function xmasClear() {
  for (const e of xmas.elves.values()) scene.remove(e.mesh);
  for (const g of xmas.gifts.values()) scene.remove(g.mesh);
  xmas.elves.clear(); xmas.gifts.clear(); xmas.mine = 0; updateXmasHud();
}
function xmasElf(id) { let e = xmas.elves.get(id); if (!e) { e = { id, mesh: elfMesh(), pos: new THREE.Vector3(), tgt: new THREE.Vector3(), yaw: 0, alive: true, placed: false, ph: Math.random() * 6 }; e.mesh.visible = false; scene.add(e.mesh); xmas.elves.set(id, e); } return e; }
function xmasAddGifts(list) { for (const [id, x, y, z] of list || []) { if (xmas.gifts.has(id)) continue; const m = giftMesh(id); m.position.set(x, y, z); scene.add(m); xmas.gifts.set(id, { id, mesh: m, y, ph: Math.random() * 6 }); } }
function xmasDelGift(id) { const g = xmas.gifts.get(id); if (g) { scene.remove(g.mesh); xmas.gifts.delete(id); } }
function xmasWelcome(m) {
  xmasClear(); xmas.on = m.mode === 'navidad'; document.body.classList.toggle('xmas', xmas.on);
  if (!xmas.on) return updateXmasHud();
  for (const id of m.el || []) xmasElf(id);
  xmasAddGifts(m.g); updateXmasHud();
}
function xmasSnap(e) {
  if (!xmas.on || !Array.isArray(e)) return;
  for (const [id, x, y, z, yaw, al] of e) { const d = xmasElf(id); d.tgt.set(x, y, z); d.yaw = yaw; d.alive = !!al; if (!d.placed || !al) { d.pos.set(x, y, z); d.placed = true; } }
}
function popGift() { const h = $('#xmasHud'); if (!h) return; const s = document.createElement('span'); s.className = 'gpop'; s.textContent = '+1 🎁'; h.appendChild(s); setTimeout(() => s.remove(), 900); try { sfx.hit(); } catch (e) { /* sin sonido */ } }
function updateXmasHud() { const h = $('#xmasHud'); if (!h) return; h.hidden = !xmas.on; h.querySelector('b').textContent = xmas.mine; }
function animXmas(dt) {
  if (!xmas.on) return; const tt = performance.now() / 1000;
  for (const e of xmas.elves.values()) {
    e.mesh.visible = e.alive && e.placed; if (!e.mesh.visible) continue;
    const moving = e.pos.distanceTo(e.tgt) > 0.02; e.pos.lerp(e.tgt, Math.min(1, dt * 12)); e.mesh.position.copy(e.pos); e.mesh.rotation.y = e.yaw;
    const sw = moving ? Math.sin(tt * 14 + e.ph) * 0.5 : 0; e.mesh.userData.legs[0].rotation.x = sw; e.mesh.userData.legs[1].rotation.x = -sw;
  }
  for (const g of xmas.gifts.values()) { g.mesh.rotation.y = tt * 1.6 + g.ph; g.mesh.position.y = g.y + 0.12 + Math.sin(tt * 3 + g.ph) * 0.06; }
}
function clearFighters() {
  xmasClear(); xmas.on = false; document.body.classList.remove('xmas');   // [NAVIDAD]
  for (const f of fighters) { if (f.mesh) { scene.remove(f.mesh); scene.remove(f.label); } if (f.petObj) scene.remove(f.petObj); }
  fighters = []; bots = []; player = null; net.remotes.clear();
}
function startMatch() {
  if (!renderer) return;
  online = false; netDisconnect(); lobbyClose();
  botCash = S.CONST.SHOP_START_CASH;   // [NUEVO] tienda de armas: dinero de la partida
  if (curMap !== cfg.map) buildMap(cfg.map);   // p. ej. tras elegir otro mapa en la pantalla final
  initAudio();
  clearFighters();
  cfg.name = sanitizeName($('#name').value) || cfg.name; saveCfg();
  teamLimit = OFFLINE_TEAM_LIMIT;
  const tm = Array.from({ length: BOT_NAMES.length + 1 }, (_, i) => i % 2);            // mitad y mitad
  for (let i = tm.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tm[i], tm[j]] = [tm[j], tm[i]]; }   // y se reparten al azar (también tu equipo)
  player = newFighter(cfg.name, true, '#ffc857'); player.wi = cfg.cls; player.ammo = 0; player.reload = 0; player.fireCd = 0; player.slide = 0; player.aim = 0; player.eye = 1.6; player.team = tm[0];
  fighters.push(player);
  for (let i = 0; i < BOT_NAMES.length; i++) {
    const b = newFighter(BOT_NAMES[i], false, BOT_COLORS[i]); b.team = tm[i + 1]; b.color = TEAMS[b.team].c;
    b.seed = i + 1; b.wi = BOT_WEAPONS[i % BOT_WEAPONS.length]; b.mesh = buildBot(b.color, b.wi, b.seed); b.label = makeLabel(b.name, 0, b.team);
    if (i % 2 === 0) setCharOutfit(b, BOT_OUTFITS[(i / 2 + irand(0, 9)) % BOT_OUTFITS.length]);   // [TRAJES] la mitad de los bots del entrenamiento lleva un traje (nunca los de leyenda)
    scene.add(b.mesh); scene.add(b.label);
    b.ai = null; b.mesh.visible = false; b.label.visible = false;
    fighters.push(b); bots.push(b);
  }
  simTime = 0; timeLeft = MATCH_TIME; hudAcc = 0;
  fighters.forEach(f => { respawn(f); f.protect = 2; });
  el.feed.innerHTML = '';
  $('#menu').hidden = true; $('#end').hidden = true; $('#pause').hidden = true; hud.hidden = false; el.board.hidden = true; el.death.hidden = true;
  document.body.classList.add('playing');
  state = 'playing';
  requestLock();
  camera.fov = cfg.fov; camera.updateProjectionMatrix();
  updateHudSlow(); updateHudFast(); teamBanner(player.team, 'Entrenamiento · sin fuego amigo');
  toast('¡A por ellos!');
}
function requestLock() {
  fallback = false; clearTimeout(lockTimer);
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { fallback = true; }); } catch (e) { fallback = true; }
  lockTimer = setTimeout(() => { if (!locked) fallback = true; }, 700);
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused'; document.body.classList.remove('playing');
  setPauseTexts(online ? 'online' : 'offline'); $('#pause').hidden = false;
  mouseL = mouseR = false; Object.keys(keys).forEach(k => keys[k] = false); el.board.hidden = true;
  if (document.exitPointerLock) document.exitPointerLock();
}
function resumeGame() {
  if (state !== 'paused') return;
  $('#pause').hidden = true; state = 'playing'; document.body.classList.add('playing'); requestLock();
}
function leaveToMenu() {
  if (online) netDisconnect();
  online = false; net.spec = false; document.body.classList.remove('spectating'); if (window.PPR_BP.onSpectate) window.PPR_BP.onSpectate(false); state = 'menu'; clearFighters(); $('#again').hidden = false; $('#endNext').hidden = true; hud.hidden = true; $('#pause').hidden = true; $('#end').hidden = true; $('#menu').hidden = false;
  document.body.classList.remove('playing'); gun.visible = false; el.scope.hidden = true; el.optic.hidden = true;
  camera.fov = 60; camera.updateProjectionMatrix();
  if (document.exitPointerLock) document.exitPointerLock();
  lobbyRefresh(); renderLeaderboard(); checkServer(); updateChatCh();
}
function saveLocalResult(pl, won) {
  if (remote) { lastReward = null; return remote.stats.best || 0; } // en cuentas online el progreso y los PX los reparte el servidor
  const stats = store.get(K.stats, { games: 0, kills: 0, wins: 0, streak: 0, points: 0, best: 0 });
  const prevBest = stats.best || 0;
  stats.games++; stats.kills += pl.kills; stats.wins += won ? 1 : 0; stats.streak = Math.max(stats.streak || 0, pl.bestStreak || 0);
  stats.points = (stats.points || 0) + pl.points; stats.best = Math.max(prevBest, pl.points);
  store.set(K.stats, stats);
  const list = store.get(K.scores, []);
  list.push({ m: cfg.map, n: pl.name, p: pl.points, k: pl.kills, d: pl.deaths, h: pl.hs, c: WEAPONS[pl.wi].name, df: online ? -1 : cfg.diff, t: Date.now() });
  list.sort((a, b) => b.p - a.p || b.k - a.k); store.set(K.scores, list.slice(0, 30));
  applyRewards(pl, won);
  return prevBest;
}
function endMatch() {
  if (state !== 'playing') return;
  state = 'ended'; document.body.classList.remove('playing');
  if (document.exitPointerLock) document.exitPointerLock();
  mouseL = mouseR = false; sfx.end();
  const s = sortedFighters(), place = s.indexOf(player) + 1, tk = tkNow(), win = tk[0] === tk[1] ? -1 : tk[0] > tk[1] ? 0 : 1, won = win === player.team;
  const prevBest = saveLocalResult(player, won);
  $('#endTitle').textContent = teamTitle(win, player.team);
  $('#endSub').innerHTML = teamScore(tk) + 'Quedaste en el puesto ' + place + ' de ' + s.length + ' con ' + player.points + ' puntos.' + (player.points > prevBest && player.points > 0 ? '<span class="pill">Nuevo récord</span>' : '') + rewardHtml();
  $('#endRows').innerHTML = tableRows(s, player);
  hud.hidden = true; $('#end').hidden = false; $('#endMaps').hidden = MAPS.length < 2; renderEndMaps();   /* con un solo mapa no hay nada que votar */
}

/* =====================================================================
   Menú: clases, ajustes y clasificación
   ===================================================================== */
function sanitizeName(s) { return String(s || '').replace(/[^\p{L}\p{N}_ \-]/gu, '').trim().slice(0, 14); }
/* =====================================================================
   Pantalla de inicio: PX, eventos, desafíos, personaje 3D y chat
   ===================================================================== */
K.kr = 'voltarena.v1.kr'; K.daily = 'voltarena.v1.daily'; K.unlock = 'voltarena.v1.unlock';
const COLORS = [
  { n: 'Naranja', c: '#ff7b00', cost: 0 }, { n: 'Coral', c: '#ff4d6d', cost: 0 }, { n: 'Azul', c: '#3a86ff', cost: 0 }, { n: 'Turquesa', c: '#2ec4b6', cost: 0 },
  { n: 'Amarillo', c: '#ffbe0b', cost: 150 }, { n: 'Violeta', c: '#b388ff', cost: 150 }, { n: 'Cian', c: '#00c2ff', cost: 300 }, { n: 'Lima', c: '#8ae234', cost: 300 },
  { n: 'Carbón', c: '#3b4058', cost: 500 }, { n: 'Blanco', c: '#f2f5ff', cost: 500 },
  /* [RANGOS] exclusivos de rango: sin precio (no se compran ni se venden) */
  { n: 'Plata', c: '#c9d1e4', cost: null, rank: 1 }, { n: 'Oro', c: '#ffd54a', cost: null, rank: 2 }, { n: 'Platino', c: '#63e6ff', cost: null, rank: 3 },
  { n: 'Diamante', c: '#7aa2ff', cost: null, rank: 4 }, { n: 'Maestro', c: '#ff4dd8', cost: null, rank: 5 }
];
const FREE = [0, 1, 2, 3];
const hs = { name: $('#hsName'), lvl: $('#hsLvl'), kd: $('#hsKD'), kr: $('#hsKr'), gain: $('#hsKrGain') };

/* --- PX: la moneda del juego --- */
/* Cuenta online (registrada en el servidor): su saldo de PX, estadísticas, colores y rangos viven allí. Invitados y cuentas locales usan el navegador. */
let remote = null;
const acctToken = () => { try { return localStorage.getItem('ppr.acct') || ''; } catch (e) { return ''; } };
const statsNow = () => (remote ? remote.stats : store.get(K.stats, { games: 0, kills: 0, wins: 0, streak: 0, points: 0, best: 0 }));
const claimedNow = () => (remote ? remote.claimed : cfg.rankClaimed);
async function acctPost(path, body) {
  const r = await fetch(apiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + acctToken() }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'Error ' + r.status); e.suggestions = j.suggestions; throw e; } return j;   // [MEJORA] conserva las sugerencias de nombre libres
}
/* [NUEVO] El nombre de la cuenta manda el servidor (puede haber cambiado desde otro dispositivo): se refleja en el lobby y se muestra el botón de renombrar */
function applyAccountName() {
  const rb = $('#renameBtn'); if (rb) rb.hidden = !remote;
  if (!remote || !remote.username) return;
  const ni = $('#name'); if (ni && ni.readOnly && ni.value !== remote.username) { ni.value = remote.username; ni.dispatchEvent(new Event('change', { bubbles: true })); const sn = $('#sessName'); if (sn) sn.textContent = 'Cuenta online · ' + remote.username; }
}
async function syncRemote() {
  const tk = acctToken();
  if (!tk) remote = null;
  else {
    try {
      const r = await fetch(apiUrl('api/me'), { headers: { Authorization: 'Bearer ' + tk }, cache: 'no-store' });
      if (r.status === 401) { try { localStorage.removeItem('ppr.acct'); } catch (e) { /* nada */ } remote = null; } else if (r.ok) { remote = (await r.json()).profile; applyAccountName(); }
    } catch (e) { /* sin conexión: se conserva el último perfil */ }
  }
  lobbyRefresh(); if (!$('#tab-store').hidden) renderStore(); if (!$('#tab-ranks').hidden) renderRanks();
}
const krTotal = () => (remote ? Math.max(0, remote.px | 0) : Math.max(0, store.get(K.kr, 0) | 0));
const fmtKr = n => Number(n).toLocaleString('es-ES');
function renderKr() { $('#krTotal').textContent = fmtKr(krTotal()); renderCr(); }
/* [NUEVO] Segunda moneda: Créditos (se ganan jugando y vendiendo en el mercado) */
function renderCr() { const c = $('#crTotal'); if (c) c.textContent = fmtKr(remote ? remote.credits | 0 : 0); }
function krAdd(n) { store.set(K.kr, Math.max(0, krTotal() + Math.round(n))); renderKr(); }
const EVENTS = S.EVENTS;
const todayEvent = () => S.todayEvent();
const eventMult = ev => S.eventMult(ev, cfg.cls);
const krFor = (points, won) => S.pxFor(points, won, cfg.cls);
function levelOf(pts) { const lvl = 1 + Math.floor(Math.sqrt(pts / 250)), prev = 250 * (lvl - 1) * (lvl - 1), next = 250 * lvl * lvl; return { lvl, next, frac: clamp((pts - prev) / (next - prev), 0, 1) }; }

/* --- Desafíos diarios (cambian cada día) --- */
const DAILY_DEFS = [
  { id: 'kills', text: n => 'Consigue ' + n + ' bajas', goals: [8, 10, 12, 15], stat: 'kills', reward: 100 },
  { id: 'hs', text: n => 'Logra ' + n + ' disparos a la cabeza', goals: [3, 4, 5, 6], stat: 'hs', reward: 120 },
  { id: 'wins', text: () => 'Gana una partida', goals: [1], stat: 'wins', reward: 150 },
  { id: 'games', text: n => 'Juega ' + n + ' partidas', goals: [2, 3], stat: 'games', reward: 80 },
  { id: 'streak', text: n => 'Encadena una racha de ' + n + ' bajas', goals: [3, 4, 5], stat: 'streak', reward: 100 }
];
const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function dailyToday() {
  const R = rngSeed(strHash(dayKey())), defs = DAILY_DEFS.slice();
  for (let i = defs.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [defs[i], defs[j]] = [defs[j], defs[i]]; }
  return defs.slice(0, 3).map(d => { const goal = d.goals[Math.floor(R() * d.goals.length)]; return { id: d.id, text: d.text(goal), goal, stat: d.stat, reward: d.reward }; });
}
function dailyState() { const s = store.get(K.daily, null); return (s && s.d === dayKey()) ? s : { d: dayKey(), p: {}, done: {} }; }
let lastReward = null;
function applyRewards(pl, won) {
  const base = krFor(pl.points, won), st = dailyState(), notes = [];
  st.p.kills = (st.p.kills || 0) + pl.kills; st.p.hs = (st.p.hs || 0) + (pl.hs || 0); st.p.wins = (st.p.wins || 0) + (won ? 1 : 0); st.p.games = (st.p.games || 0) + 1;
  st.p.streak = Math.max(st.p.streak || 0, pl.bestStreak || 0);
  let bonus = 0;
  for (const c of dailyToday()) if (!st.done[c.id] && (st.p[c.stat] || 0) >= c.goal) { st.done[c.id] = true; bonus += c.reward; notes.push(c.text + ' · +' + c.reward + ' PX'); }
  store.set(K.daily, st); krAdd(base + bonus);
  lastReward = { kr: base + bonus, mult: eventMult(todayEvent()), notes };
}
function rewardHtml() {
  const r = lastReward; lastReward = null; if (!r) return '';
  return '<div class="krgain">+' + fmtKr(r.kr) + ' PX' + (r.mult > 1 ? ' (evento ×' + r.mult + ')' : '') + r.notes.map(n => '<br>Desafío completado: ' + esc(n)).join('') + '</div>';
}
function renderEvent() {
  const ev = todayEvent(), on = eventMult(ev) > 1;
  $('#eventBox').innerHTML = '<div class="ev"><span class="mult">×' + ev.mult + ' PX</span><b>' + esc(ev.name) + '</b>' + esc(ev.desc) + (ev.cls ? '<br><small>' + (on ? 'Activo con tu clase actual.' : 'Cambia de clase para aprovecharlo.') + '</small>' : '') + '</div>';
  loadEvents();
}
/* [NUEVO] Eventos temporales del servidor (modo destacado de la semana y eventos del administrador), con el tiempo que les queda */
let evTimer = 0;
async function loadEvents() {
  if (!serverOK) return;
  try {
    const j = await (await fetch(apiUrl('api/events'), { cache: 'no-store' })).json(), box = $('#eventBox'); if (!box || !j.events) return;
    const left = ms => { const h = Math.floor(ms / 3600000), d = Math.floor(h / 24); return d >= 1 ? d + ' d ' + (h % 24) + ' h' : h >= 1 ? h + ' h ' + Math.floor(ms % 3600000 / 60000) + ' min' : Math.max(1, Math.ceil(ms / 60000)) + ' min'; };
    box.querySelectorAll('.ev.srv').forEach(x => x.remove());
    j.events.forEach(e => { const d = document.createElement('div'); d.className = 'ev srv'; d.innerHTML = '<span class="mult">×' + e.px + ' PX · ×' + e.cr + ' CR</span><b>' + esc(e.name) + '</b>' + esc(e.desc) + '<br><small>Termina en ' + left(e.endsAt - j.now) + (e.mode ? ' · solo en ' + esc((S.MODES[e.mode] || {}).name || e.mode) : '') + '</small>'; box.append(d); });
    clearTimeout(evTimer); evTimer = setTimeout(loadEvents, 60000);
  } catch (e) { /* sin servidor: solo el evento diario */ }
}
function renderDaily() {
  if (remote) { $('#daily').innerHTML = '<li><em></em>Los desafíos diarios solo cuentan en cuentas locales.</li>'; return; }
  const st = dailyState();
  $('#daily').innerHTML = dailyToday().map(c => { const v = Math.min(c.goal, st.p[c.stat] || 0); return '<li class="' + (st.done[c.id] ? 'done' : '') + '"><em>+' + c.reward + ' PX</em>' + esc(c.text) + '<div class="pg"><i style="width:' + (v / c.goal * 100) + '%"></i></div></li>'; }).join('');
}

/* --- Secciones, equipamiento y personalización --- */
const TABS = ['maps', 'rank', 'ranks', 'store', 'inv', 'controls', 'settings'];   // [INVENTARIO] 'inv'
function showTab(name) {
  $$('.nav button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.tab === name)));
  TABS.forEach(t => { $('#tab-' + t).hidden = t !== name; });
  $('#lobbyC').hidden = !TABS.includes(name); document.body.classList.toggle('tabopen', TABS.includes(name));   // con un panel abierto se oculta el logo para que no lo tape
  if (name === 'rank') renderLeaderboard();
  if (name === 'ranks') renderRanks();
  if (name === 'store') renderStore();
  if (name === 'inv' && window.PPR_BP.renderInventory) window.PPR_BP.renderInventory();   // [INVENTARIO]
}
function buildClassButtons() {
  $('#classes').innerHTML = WEAPONS.map((w, i) => '<button class="cls" data-i="' + i + '" aria-pressed="' + (i === cfg.cls) + '" title="' + esc(w.desc) + '"><span class="ic">' + weaponIcon(w) + '</span><span><b>' + esc(w.name) + '</b><small>' + esc(w.type) + '</small></span><span class="mt"><i style="--v:' + w.stats[0] * 20 + '%"></i><i style="--v:' + w.stats[1] * 20 + '%"></i><i style="--v:' + w.stats[2] * 20 + '%"></i></span></button>').join('');
}
/* Vista previa de cada mapa: una captura real del propio mapa (public/maps/mapN.jpg; el archivo único las lleva incrustadas) */
const mapImg = i => (window.MAP_IMGS && window.MAP_IMGS[i]) || 'maps/map' + i + '.jpg';
function buildMapButtons() {
  $('#maps').innerHTML = MAPS.map((m, i) =>
    '<button class="mapc" data-i="' + i + '" aria-pressed="' + (i === cfg.map) + '"><span class="sw" style="background:url(' + mapImg(i) + ') center/cover,linear-gradient(' + m.sky[0] + ',' + m.sky[1] + ')"></span>' +
    '<span><b>' + esc(m.name) + '</b><span class="d">' + esc(m.desc) + '</span><small>' + (m.half * 2) + ' × ' + (m.half * 2) + ' m</small></span></button>').join('');
}
const unlocked = () => { if (remote) return remote.unlocked.slice(); const u = store.get(K.unlock, FREE); return Array.isArray(u) ? u : FREE; };
function buildCustom() {
  if (!remote) { const u0 = unlocked(); let ch = false; for (const ri of cfg.rankClaimed || []) { const r = RANKS[ri]; if (r && r.color != null && !u0.includes(r.color)) { u0.push(r.color); ch = true; } } if (ch) store.set(K.unlock, u0); }   // [RANGOS] invitados que ya reclamaron: su color exclusivo nuevo
  const un = unlocked(); if (!un.includes(cfg.look.col)) cfg.look.col = 0;
  $('#swColors').innerHTML = COLORS.map((c, i) => { const ok = un.includes(i); return '<button class="cs' + (ok ? '' : ' locked') + '" data-i="' + i + '" style="--c:' + c.c + '" data-cost="' + (ok ? '' : c.cost == null ? '★ ' + S.RANKS[c.rank].n : c.cost + ' PX') + '" aria-pressed="' + (cfg.look.col === i) + '" aria-label="' + esc(c.n) + (ok ? '' : ', cuesta ' + c.cost + ' PX') + '"></button>'; }).join('');
  $('#swColors').classList.toggle('hasLock', COLORS.some((c, i) => !un.includes(i)));
  $('#swSkins').innerHTML = SKINS.map((c, i) => '<button class="cs" data-i="' + i + '" style="--c:' + c + '" aria-pressed="' + (cfg.look.skin === i) + '" aria-label="Piel ' + (i + 1) + '"></button>').join('');
}
function pickColor(i) {
  const un = unlocked(), c = COLORS[i], msg = $('#custMsg');
  if (c && c.cost == null && !un.includes(i)) { msg.textContent = 'Color exclusivo: se consigue al llegar al rango ' + S.RANKS[c.rank].n + '.'; return; }   // [RANGOS] ni se compra ni se desbloquea gratis
  if (remote && !un.includes(i)) { // el servidor cobra y desbloquea
    acctPost('api/me/unlock', { i }).then(j => { remote = j.profile; cfg.look.col = i; saveCfg(); msg.textContent = 'Desbloqueado: ' + c.n + ' (−' + c.cost + ' PX)'; renderKr(); buildCustom(); updatePreview(); }).catch(e => { msg.textContent = e.message; });
    return;
  }
  if (!un.includes(i)) {
    if (krTotal() < c.cost) { msg.textContent = 'Te faltan ' + fmtKr(c.cost - krTotal()) + ' PX para «' + c.n + '».'; return; }
    krAdd(-c.cost); un.push(i); store.set(K.unlock, un); msg.textContent = 'Desbloqueado: ' + c.n + ' (−' + c.cost + ' PX)';
  } else msg.textContent = '';
  cfg.look.col = i; saveCfg(); buildCustom(); updatePreview();
}
function pickSkin(i) { cfg.look.skin = i; saveCfg(); buildCustom(); updatePreview(); }
/* Resumen del equipamiento (panel del inicio): arma, mira, color y piel; el cajón «Personalizar equipo» los cambia */
function updateEquip() {
  const w = WEAPONS[cfg.cls], el = $('#eqPrimary'); if (!w || !el) return;
  const o = w.optics ? opticOf(w) : null;
  el.textContent = w.name; $('#eqOptic').textContent = o ? o.name : 'Sin mira';
  $('#eqColor').textContent = COLORS[cfg.look.col].n; $('#eqSkin').textContent = 'Tono ' + (cfg.look.skin + 1);
  const b = $('#eqBust'); if (b) { b.style.setProperty('--shirt', COLORS[cfg.look.col].c); b.style.setProperty('--skin', SKINS[cfg.look.skin]); }
}
function updateLobby() {
  updateLkChar();
  const w = WEAPONS[cfg.cls];
  $('#charTitle').textContent = w.name + ' · ' + w.type;
  $('#mapBtn').textContent = MAPS[cfg.map].name;
  $('#avatar').textContent = (cfg.name || 'P').charAt(0).toUpperCase();
  $('#avatar').style.color = COLORS[cfg.look.col].c;
  updateEquip();
}
function cycleOptic() {
  const p = player, w = WEAPONS[p.wi]; if (!w.optics || p.aim > 0.3 || p.reload > 0) return;
  const next = w.optics[(w.optics.indexOf(opticIdOf(w)) + 1) % w.optics.length];
  cfg.optics[w.id] = next; saveCfg(); buildGun(w); buildAmmoUi(w); toast('Mira: ' + OPTICS[next].name); sfx.reload();
}
function renderOptics() {
  const w = WEAPONS[cfg.cls], sect = $('#opticSect'); sect.hidden = !w.optics; if (!w.optics) return;
  const cur = opticIdOf(w);
  $('#optics').innerHTML = w.optics.map(k => '<button class="opt" type="button" data-k="' + k + '" aria-pressed="' + (k === cur) + '">' + esc(OPTICS[k].name) + '</button>').join('');
}
function selectClass(i) {
  cfg.cls = i; saveCfg(); $$('.cls').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === i)));
  updateLobby(); updatePreview(); renderEvent(); renderOptics();
}
/* [NUEVO] Bando y arma se eligen al entrar a partida, no en la lobby: Online/Entrenar abren este cajón primero */
let pendingPlay = null;
function pickTeam(v) {
  cfg.wantTeam = v === '0' ? 0 : v === '1' ? 1 : null; saveCfg();
  $$('#teamPick .tm').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tm === v)));
}
/* [LOBBY] El personaje vive abajo a la derecha en la lobby y se muda al cajón cuando se abre (un solo personaje de vista previa) */
function placeCharView(inDrawer) {
  const cv = $('#charView'), dr = $('#lobbyR'), slot = $('#lkChar'); if (!cv || !dr || !slot) return;
  if (inDrawer) dr.insertBefore(cv, $('#teamSect')); else slot.insertBefore(cv, slot.firstChild);
  if (pv.back) pv.back.visible = !!inDrawer;   // en la lobby, sin recuadro oscuro detrás del personaje
}
function updateLkChar() { const w = WEAPONS[cfg.cls]; if (!w || !$('#lkClass')) return; $('#lkClass').textContent = w.name; $('#lkType').textContent = w.type; }
function openCustomize() {
  pendingPlay = null;
  $('#drawTitle').textContent = 'Personaje'; $('#teamSect').hidden = true; $('#custSect').hidden = false; $('#eqPlay').hidden = true;
  placeCharView(true); buildClassButtons(); renderOptics(); buildCustom(); updatePreview();
  document.body.classList.add('eqopen');
}
function openLoadout(mode) {
  pendingPlay = mode; placeCharView(true);
  $('#drawTitle').textContent = 'Antes de jugar'; $('#teamSect').hidden = false; $('#custSect').hidden = false; $('#eqPlay').hidden = false;
  $('#eqPlay').textContent = mode === 'online' ? 'Jugar online' : 'Entrenar';
  const tmv = cfg.wantTeam === 0 ? '0' : cfg.wantTeam === 1 ? '1' : 'auto';
  $$('#teamPick .tm').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tm === tmv)));
  buildClassButtons(); renderOptics(); buildCustom(); updatePreview();
  document.body.classList.add('eqopen');
}
/* [NUEVO] Tecla C, solo los primeros segundos tras reaparecer: cambia de arma para la próxima vida (como la tienda de
   la pantalla de muerte, pero gratis y sin esperar a morir). No es instantáneo: el arma que llevas en la mano no
   cambia hasta la siguiente reaparición, igual que el resto del juego ya hace con la tienda. */
const QUICK_SWAP_MS = 6000;
function openQuickSwap() {
  quickSwapMode = true;
  $('#teamSect').hidden = true; $('#custSect').hidden = true; $('#eqPlay').hidden = true;
  buildClassButtons(); renderOptics();
  document.body.classList.add('eqopen');
  const tick = () => { const left = Math.max(0, QUICK_SWAP_MS - (performance.now() - swapOpenedAt)); $('#drawTitle').textContent = 'Cambiar de arma (' + Math.ceil(left / 1000) + 's)'; if (left <= 0) closeQuickSwap(); };
  var swapOpenedAt = performance.now(); tick();
  clearInterval(quickSwapTimer); quickSwapTimer = setInterval(tick, 250);
}
function closeQuickSwap() {
  quickSwapMode = false; clearInterval(quickSwapTimer); quickSwapTimer = null;
  document.body.classList.remove('eqopen'); $('#drawTitle').textContent = 'Personaje';
}
function quickSwapPick(i) {
  if (online) netSend({ t: 'cls', c: i }); else selectClass(i);   // entrenamiento: como la tienda de la pantalla de muerte, se aplica en la próxima reaparición
  closeQuickSwap();
}
function selectMap(i) {
  cfg.map = i; saveCfg(); $$('.mapc').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === i)));
  if (state === 'menu' && curMap !== i) buildMap(i);
  updateLobby();
}
/* --- Rangos y recompensas: se suben con los puntos acumulados y cada rango da PX y, en los altos, un color exclusivo --- */
const RANKS = S.RANKS;
const tierOf = pts => { let t = 0; RANKS.forEach((r, i) => { if (pts >= r.pts) t = i; }); return t; };
const rewardText = r => '+' + fmtKr(r.kr) + ' PX' + (r.color != null ? ' · color exclusivo «' + COLORS[r.color].n + '»' : '');
function claimRank(i) {
  const r = RANKS[i], pts = statsNow().points || 0;
  if (remote) { // en cuentas online reclama el servidor
    if (!r || pts < r.pts || remote.claimed.includes(i)) return;
    acctPost('api/me/claim', { i }).then(j => { remote = j.profile; toast('Rango ' + r.n + ': ' + rewardText(r)); renderKr(); renderRanks(); buildCustom(); }).catch(e => toast(e.message));
    return;
  }
  if (!r || pts < r.pts || cfg.rankClaimed.includes(i)) return;
  cfg.rankClaimed.push(i); saveCfg(); krAdd(r.kr);
  if (r.color != null) { const un = unlocked(); if (!un.includes(r.color)) { un.push(r.color); store.set(K.unlock, un); } }
  toast('Rango ' + r.n + ': ' + rewardText(r)); renderRanks(); if (typeof buildCustom === 'function') buildCustom();
}
/* --- Tienda: comprar PX con dinero real (pago seguro en Stripe; los PX los acredita el servidor al confirmarse el pago) --- */
async function renderStore() {
  const box = $('#storeBox'); box.innerHTML = '<p class="note">Cargando…</p>';
  let info = null;
  try { const r = await fetch(apiUrl('api/store'), { cache: 'no-store' }); if (r.ok) info = await r.json(); } catch (e) { /* sin servidor */ }
  if (!info) { box.innerHTML = '<p class="note">La tienda necesita el servidor del juego. No está disponible en esta versión.</p>'; return; }
  const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: info.currency || 'eur' });
  const pp = info.paypal, can = info.enabled && !!remote, canPP = !!pp && !!remote;   // [PAYPAL] pago manual por PayPal + ticket en Discord
  const why = !remote ? 'Inicia sesión con una cuenta online (Registro) para comprar PX.' : (!info.enabled && !pp ? info.reason : '');
  const btns = p => (info.enabled ? '<button type="button" data-pack="' + esc(p.id) + '"' + (can ? '' : ' disabled') + '>' + fmt.format(p.price / 100) + '</button>' : '') +
    (pp ? '<button type="button" class="ppbtn" data-pp="' + esc(p.id) + '"' + (canPP ? '' : ' disabled') + '>' + (info.enabled ? 'PayPal' : fmt.format(p.price / 100) + ' · PayPal') + '</button>' : '');
  box.innerHTML = '<div class="storehead"><b>Tienda de PX</b><span>Saldo: <em id="storeBal">' + fmtKr(krTotal()) + ' PX</em></span></div>' + (why ? '<p class="note warn">' + esc(why) + '</p>' : '') +
    '<div class="packs">' + info.packs.map(p => '<div class="pack"><div class="pxn">' + fmtKr(p.px) + '<small>PX</small></div>' + (p.tag ? '<span class="ptag">' + esc(p.tag) + '</span>' : '') + btns(p) + '</div>').join('') + '</div>' +
    '<div id="ppBox" hidden></div><div id="knivesBox"></div><div id="outfitRoulBox"></div><div id="outfitsBox"></div><div id="petsBox"></div>' +
    '<p class="note small">' + (info.enabled ? 'El pago con tarjeta se hace en la página segura de Stripe; nunca guardamos tus datos de pago. ' : '') + (pp ? 'Con PayPal pagas tú directamente y un administrador te entrega los PX por ticket en Discord. ' : '') + 'Los PX solo sirven dentro del juego (colores y recompensas).</p><p id="storeMsg" class="note" role="status"></p>';
  for (const b of box.querySelectorAll('[data-pack]')) b.addEventListener('click', async () => {
    b.disabled = true; $('#storeMsg').textContent = 'Abriendo el pago seguro…';
    try { const j = await acctPost('api/store/checkout', { pack: b.dataset.pack }); (window.__pprNav || (u => { location.href = u; }))(j.url); } catch (e) { $('#storeMsg').textContent = e.message; b.disabled = false; }
  });
  for (const b of box.querySelectorAll('[data-pp]')) b.addEventListener('click', async () => {
    b.disabled = true; $('#storeMsg').textContent = '';
    try { const j = await acctPost('api/store/paypal', { pack: b.dataset.pp }); showPaypalOrder(j.order, fmt); } catch (e) { $('#storeMsg').textContent = e.message; }
    b.disabled = false;
  });
  renderKnives();   // [CUCHILLOS]
  renderOutfits();   // [TRAJES]
  renderPets();   // [MASCOTAS]
}
/* [PAYPAL] Instrucciones del pedido: correo de PayPal (y PayPal.me si lo hay), importe, código para la nota del pago y ticket en Discord */
function showPaypalOrder(o, fmt) {
  const box = $('#ppBox'); if (!box) return;
  const amt = fmt.format(o.amount / 100), me = o.me ? 'https://paypal.me/' + encodeURIComponent(o.me) + '/' + (o.amount / 100).toFixed(2) + String(o.currency || 'eur').toUpperCase() : '';
  const copy = (v, label) => '<button type="button" class="ppcopy" data-copy="' + esc(v) + '">Copiar ' + label + '</button>';
  box.innerHTML = '<h3>Pedido ' + esc(o.code) + ' · ' + fmtKr(o.px) + ' PX</h3><ol>' +
    '<li>Envía <b>' + esc(amt) + '</b> por PayPal a <b class="ppmail">' + esc(o.email) + '</b> ' + copy(o.email, 'correo') + (me ? ' o <a href="' + esc(me) + '" target="_blank" rel="noopener noreferrer">paga con PayPal.me</a>' : '') + '</li>' +
    '<li>En la nota del pago escribe el código <b class="ppcode">' + esc(o.code) + '</b> ' + copy(o.code, 'código') + '</li>' +
    '<li>Abre un ticket en nuestro Discord con el código y una captura del pago: <a class="ppdisc" href="' + esc(o.discord) + '" target="_blank" rel="noopener noreferrer">Abrir Discord</a></li>' +
    '<li>Un administrador comprueba el pago y te entrega los PX en tu cuenta.</li></ol>' +
    '<p class="note small">Guarda el código: si vuelves a pulsar el mismo paquete te sale el mismo pedido. Nunca te pediremos tu contraseña.</p>';
  box.hidden = false;
  for (const c of box.querySelectorAll('[data-copy]')) c.addEventListener('click', () => { try { navigator.clipboard.writeText(c.dataset.copy).then(() => { c.textContent = '¡Copiado!'; }, () => {}); } catch (e) { /* sin portapapeles */ } });
  box.scrollIntoView({ block: 'nearest' });
}
/* [MASCOTAS] Tienda de mascotas: se compran con PX (los cobra el servidor, que además comprueba que no la tengas ya) */
function petSvg(def) {
  const b = def.body, a = def.acc, e = def.eye, k = def.kind;
  const eye2 = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff"/><circle cx="' + x + '" cy="' + (y + 1) + '" r="' + (r * 0.55) + '" fill="' + e + '"/>';
  const svg = inner => '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' + inner + '</svg>';
  if (k === 'ball') return svg('<ellipse cx="32" cy="56" rx="14" ry="3" fill="rgba(0,0,0,.25)"/><circle cx="32" cy="34" r="19" fill="' + b + '"/><ellipse cx="37" cy="24" rx="8" ry="4" fill="' + a + '" opacity=".8"/>' + eye2(25, 32, 6) + eye2(39, 32, 6) + '<rect x="28" y="43" width="8" height="2" fill="#1b2038"/><circle cx="17" cy="40" r="3" fill="' + a + '"/><circle cx="47" cy="40" r="3" fill="' + a + '"/>');
  if (k === 'bird') return svg('<ellipse cx="32" cy="36" rx="15" ry="14" fill="' + b + '"/><ellipse cx="30" cy="40" rx="9" ry="8" fill="#fff"/><path d="M17 34 L4 26 L8 38 Z" fill="' + b + '"/><path d="M47 34 L60 26 L56 38 Z" fill="' + b + '"/><path d="M14 36 L20 44 L10 42 Z" fill="#1b2038"/><polygon points="44,33 54,36 44,39" fill="' + a + '"/><rect x="30" y="17" width="3" height="7" fill="' + b + '"/><rect x="34" y="19" width="3" height="5" fill="' + b + '"/>' + eye2(38, 30, 4) + '<rect x="27" y="49" width="2" height="7" fill="' + a + '"/><rect x="34" y="49" width="2" height="7" fill="' + a + '"/>');
  if (k === 'ufo') return svg('<polygon points="22,40 42,40 52,62 12,62" fill="' + e + '" opacity=".25"/><ellipse cx="32" cy="26" rx="11" ry="10" fill="#bff6ff" opacity=".6"/><circle cx="32" cy="27" r="5" fill="' + a + '"/><ellipse cx="30" cy="27" rx="1.3" ry="2" fill="#0b1020"/><ellipse cx="34" cy="27" rx="1.3" ry="2" fill="#0b1020"/><ellipse cx="32" cy="35" rx="27" ry="7" fill="' + b + '"/><ellipse cx="32" cy="38" rx="20" ry="4" fill="#8a93b8"/>' + [10, 20, 32, 44, 54].map((x, i) => '<circle cx="' + x + '" cy="35" r="2.2" fill="' + (i % 2 ? '#ffd23a' : e) + '"/>').join(''));
  if (k === 'drone') return svg('<rect x="8" y="33" width="48" height="3" fill="' + b + '" transform="rotate(-14 32 34)"/><rect x="8" y="33" width="48" height="3" fill="' + b + '" transform="rotate(14 32 34)"/><rect x="20" y="28" width="24" height="12" rx="3" fill="' + b + '"/><rect x="24" y="24" width="16" height="6" rx="2" fill="' + a + '"/>' + [[9, 28], [55, 28], [9, 40], [55, 40]].map(([x, y]) => '<rect x="' + (x - 7) + '" y="' + (y - 1) + '" width="14" height="2" fill="#e9edf5"/><rect x="' + (x - 2) + '" y="' + y + '" width="4" height="4" fill="#1b2038"/>').join('') + '<circle cx="32" cy="42" r="4" fill="#1b2038"/><circle cx="32" cy="42" r="2" fill="' + e + '"/>');
  let x = '<rect x="18" y="22" width="28" height="26" fill="' + b + '"/><rect x="18" y="28" width="28" height="5" fill="' + a + '"/>';
  if (k === 'drone') x = '<rect x="12" y="30" width="40" height="10" fill="' + b + '"/><rect x="24" y="24" width="16" height="7" fill="' + a + '"/><rect x="6" y="26" width="16" height="3" fill="#e9edf5"/><rect x="42" y="26" width="16" height="3" fill="#e9edf5"/>';
  else if (k === 'ghost') x = '<rect x="18" y="18" width="28" height="30" fill="' + b + '"/><rect x="18" y="18" width="28" height="4" fill="' + a + '"/><rect x="18" y="48" width="7" height="6" fill="' + b + '"/><rect x="29" y="48" width="7" height="6" fill="' + b + '"/><rect x="40" y="48" width="6" height="6" fill="' + b + '"/>';
  else if (k === 'fox') x = '<rect x="20" y="22" width="24" height="22" fill="' + b + '"/><rect x="21" y="14" width="6" height="9" fill="' + b + '"/><rect x="37" y="14" width="6" height="9" fill="' + b + '"/><rect x="27" y="34" width="10" height="7" fill="' + a + '"/><rect x="44" y="38" width="12" height="6" fill="' + a + '"/>';
  else if (k === 'dragon') x = '<rect x="20" y="22" width="24" height="24" fill="' + b + '"/><rect x="6" y="24" width="14" height="4" fill="' + a + '" transform="rotate(-20 13 26)"/><rect x="44" y="24" width="14" height="4" fill="' + a + '" transform="rotate(20 51 26)"/><rect x="24" y="16" width="4" height="7" fill="' + a + '"/><rect x="36" y="16" width="4" height="7" fill="' + a + '"/>';
  const ey = k === 'drone' ? 33 : k === 'fox' || k === 'dragon' ? 27 : 32;
  return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' + x + '<rect x="' + (k === 'drone' ? 29 : 25) + '" y="' + ey + '" width="' + (k === 'drone' ? 6 : 4) + '" height="5" fill="' + e + '"/>' + (k === 'drone' ? '' : '<rect x="35" y="' + ey + '" width="4" height="5" fill="' + e + '"/>') + '</svg>';
}
/* [TRAJES] Tienda de trajes: miniatura 3D de cada traje (se dibuja una vez con un renderizador pequeño y se guarda) */
const OUTFIT_THUMB = {}; let thumbR = null;
function outfitThumb(def) {
  if (OUTFIT_THUMB[def.id]) return OUTFIT_THUMB[def.id];
  try {
    if (!thumbR) thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    if (!thumbR.domElement || !thumbR.domElement.toDataURL) return '';
    thumbR.setSize(120, 150);
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0xa9b6ff, 1.3)); const d = new THREE.DirectionalLight(0xfff1c9, 1.1); d.position.set(3, 5, -4); sc.add(d);
    const g = new THREE.Group(); g.userData.outfit = def.id; fillCharacter(g, TEAMS[0].c, 0, 3, 0); g.userData.guns.forEach(x => { x.visible = false; }); g.rotation.y = 0.45; sc.add(g);
    const cam = new THREE.PerspectiveCamera(30, 120 / 150, 0.1, 20); cam.position.set(0, 1.1, -4.2); cam.lookAt(0, 0.95, 0);
    thumbR.render(sc, cam); return (OUTFIT_THUMB[def.id] = thumbR.domElement.toDataURL());
  } catch (e) { return ''; }
}
/* [RULETA] Evento de la ruleta de cuchillos: la tirada la resuelve el servidor (cobra y elige); aquí solo se anima la cinta hasta el premio */
const KNIFE_THUMB = {};
function knifeThumb(def) {
  if (KNIFE_THUMB[def.id]) return KNIFE_THUMB[def.id];
  try {
    if (!thumbR) thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    if (!thumbR.domElement || !thumbR.domElement.toDataURL) return '';
    thumbR.setSize(150, 96);
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x8a96c8, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(4, 3, 2); sc.add(d);
    const k = knifeMesh(def); k.rotation.set(0, Math.PI / 2, -0.35); sc.add(k);   // de perfil, con la punta hacia la derecha y algo inclinado
    const cam = new THREE.PerspectiveCamera(30, 150 / 96, 0.05, 10); cam.position.set(0.05, 0.02, 1.25); cam.lookAt(0.05, 0.02, 0);
    thumbR.render(sc, cam); return (KNIFE_THUMB[def.id] = thumbR.domElement.toDataURL());
  } catch (e) { return ''; }
}
/* [RULETA] Ruletas de la tienda (cuchillos y trajes): misma cinta, mismas reglas; cambia el catálogo, la miniatura y la ranura que se equipa */
const ROULETTES = {
  knife: { box: '#knivesBox', title: 'Ruleta de cuchillos', sub: 'Siempre un cuchillo nuevo: nunca repetidos.', slot: 'knife', spin: 'api/bp/knife-spin',
    list: () => S.KNIFE_SKINS, thumb: k => knifeThumb(k), tw: 110, th: 70, cw: 120, ch: 77, fxc: k => k.fx && k.fx.col,
    on: 'Equipado ✓', put: 'Equipar', okOn: 'Cuchillo equipado', okOff: 'Vuelves al cuchillo clásico', extra: 'Pulsa F con el cuchillo en la mano para inspeccionarlo.' },
  outfit: { box: '#outfitRoulBox', title: 'Ruleta de trajes', sub: 'Trajes con efectos de luz: nunca repetidos.', slot: 'outfit', spin: 'api/bp/outfit-spin',
    list: () => S.OUTFITS, thumb: o => outfitThumb(o), tw: 72, th: 90, cw: 96, ch: 120, fxc: o => ({ neon: '#ff2bd6', yakuza: '#d9a43a', dragon: '#ff7a1a', spectre: '#9fe8ff' })[o.kind],
    on: 'Puesto ✓', put: 'Ponerme', okOn: 'Traje puesto', okOff: 'Traje quitado', extra: 'Todos los jugadores ven tu traje y sus efectos.' }
};
const roulBusy = {};
function renderKnives() { renderRoulette('knife'); renderRoulette('outfit'); }
function renderRoulette(kind) {
  const C = ROULETTES[kind], box = $(C.box); if (!box || roulBusy[kind]) return;
  const D = S.rouletteDef(kind), R = D.R, P = window.PPR_BP, st = P.state, eq = (P.equipped || {})[C.slot] || '', px = krTotal();
  const all = C.list().filter(k => k.ru), own = new Set(st && st.inventory ? st.inventory.filter(i => i.t === D.t).map(i => i.id) : []);
  const odds = S.rouletteOdds(remote ? [...own] : [], kind), pOf = id => (odds.find(o => o.id === id) || {}).p || 0, left = all.filter(k => !own.has(k.id)).length;
  const pct = p => (p * 100 >= 10 ? Math.round(p * 100) : (p * 100).toFixed(1).replace('.', ',')) + ' %';
  const glow = k => (C.fxc(k) ? ';--kc:' + C.fxc(k) : '');
  const item = k => '<div class="ritem" style="--rc:' + (S.RARITY[k.r] || { c: '#9aa4b8' }).c + '"><img src="' + C.thumb(k) + '" width="' + C.tw + '" height="' + C.th + '" alt=""><span>' + esc(k.n) + '</span></div>';
  const spinBtn = !remote ? '<button type="button" class="roul-spin" disabled>Girar · ' + fmtKr(R.px) + ' PX</button>'
    : !left ? '<button type="button" class="roul-spin" disabled>¡Los tienes todos!</button>'
    : '<button type="button" class="roul-spin"' + (px < R.px ? ' disabled title="Te faltan ' + (R.px - px) + ' PX"' : '') + '>Girar · ' + fmtKr(R.px) + ' PX</button>';
  box.innerHTML = '<div class="storehead"><b><em class="evtag">Evento</em> ' + C.title + '</b><span>' + C.sub + '</span></div>' +
    (!remote ? '<p class="note warn">Inicia sesión con una cuenta online para girar la ruleta.</p>' : '') +
    '<div class="roul"><div class="roul-reel">' + (() => { const v = all.filter(k => !own.has(k.id) || !left), out = []; for (let i = 0; v.length && i < Math.max(8, v.length); i++) out.push(v[i % v.length]); return out.map(item).join(''); })() + '</div><i class="roul-mark"></i></div>' +
    '<div class="roul-act">' + spinBtn + (remote ? '<span>Tienes ' + (all.length - left) + ' de ' + all.length + '</span>' : '') + '</div><div class="roul-winbox" role="status"></div>' +
    '<div class="pets outfits">' + all.map(k => {
      const rar = S.RARITY[k.r] || { n: '', c: '#9aa4b8' }, has = own.has(k.id), on = eq === k.id;
      const btn = !remote || !has ? '<button type="button" disabled>' + (remote ? 'Probabilidad: ' + pct(pOf(k.id)) : pct(pOf(k.id))) + '</button>'
        : on ? '<button type="button" class="on" data-rq="' + k.id + '">' + C.on + '</button>' : '<button type="button" data-re="' + k.id + '">' + C.put + '</button>';
      return '<div class="petcard' + (on ? ' on' : '') + (C.fxc(k) ? ' kfx' : '') + (remote && !has ? ' locked' : '') + '" style="--rc:' + rar.c + glow(k) + '"><span class="prar">' + esc(rar.n) + '</span><img src="' + C.thumb(k) + '" width="' + C.cw + '" height="' + C.ch + '" alt=""><b>' + esc(k.n) + '</b>' + btn + '</div>';
    }).join('') + '</div><p class="note small">Las probabilidades son las de tu próxima tirada y cambian según lo que te falta: ' +
    Object.entries(R.weights).map(([r, w]) => (S.RARITY[r] || { n: r }).n + ' ' + w + ' %').join(' · ') + ' (repartido entre lo que te falta de cada rareza). Con ' + all.length + ' tiradas los consigues todos.</p><p class="note small">' + C.extra + '</p><p class="note roul-msg" role="status"></p>';
  const msg = t => { const m = box.querySelector('.roul-msg'); if (m) m.textContent = t; };
  const run = async (path, body, okMsg) => {
    try { const j = await acctPost(path, body); if (j.state && P.applyState) P.applyState(j.state); renderRoulette(kind); if (kind === 'outfit') updatePreview(); if (okMsg) toast(okMsg); } catch (e) { msg(e.message); }
  };
  for (const b of box.querySelectorAll('[data-re]')) b.addEventListener('click', () => run('api/bp/equip', { slot: C.slot, item: b.dataset.re }, C.okOn));
  for (const b of box.querySelectorAll('[data-rq]')) b.addEventListener('click', () => run('api/bp/equip', { slot: C.slot, item: null }, C.okOff));
  const sb = box.querySelector('.roul-spin'); if (sb && !sb.disabled) sb.addEventListener('click', async () => {
    if (!window.confirm('¿Girar la ruleta por ' + fmtKr(R.px) + ' PX?')) return;
    sb.disabled = true; msg(''); roulBusy[kind] = true;
    let j; try { j = await acctPost(C.spin, {}); } catch (e) { roulBusy[kind] = false; msg(e.message); sb.disabled = false; return; }
    const win = all.find(k => k.id === j.item), pool = all.filter(k => !own.has(k.id)), reel = box.querySelector('.roul-reel');
    const W = 118, AT = 36, strip = []; for (let i = 0; i < AT + 4; i++) strip.push(i === AT ? win : pool[Math.floor(Math.random() * pool.length)]);   // cinta de relleno con el premio en la posición AT
    const done = () => {
      if (!roulBusy[kind]) return; roulBusy[kind] = false;
      if (j.state && P.applyState) P.applyState(j.state); const bal = $('#storeBal'); if (bal) bal.textContent = fmtKr(krTotal()) + ' PX';
      renderRoulette(kind); sfx.gold();
      const wb = box.querySelector('.roul-winbox'); if (wb) { wb.innerHTML = '<div class="roul-win' + (C.fxc(win) ? ' kfx' : '') + '" style="--rc:' + S.RARITY[win.r].c + glow(win) + '"><img src="' + C.thumb(win) + '" width="' + Math.round(C.cw * 1.25) + '" height="' + Math.round(C.ch * 1.25) + '" alt=""><div><small>' + esc(S.RARITY[win.r].n) + '</small><b>¡Te ha tocado ' + esc(win.n) + '!</b><button type="button" data-re2="' + win.id + '">' + (kind === 'outfit' ? 'Ponérmelo ahora' : 'Equipar ahora') + '</button></div></div>';
        const eb = wb.querySelector('[data-re2]'); if (eb) eb.addEventListener('click', () => run('api/bp/equip', { slot: C.slot, item: win.id }, C.okOn)); }
      toast('¡Te ha tocado ' + win.n + '!');
    };
    if (!reel) return done();
    reel.innerHTML = strip.map(item).join(''); reel.style.transition = 'none'; reel.style.transform = 'translateX(0)';
    const vw = (reel.parentNode && reel.parentNode.clientWidth) || 600, reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, T = reduce ? 0.6 : 4.6;
    void reel.offsetWidth;
    reel.style.transition = 'transform ' + T + 's cubic-bezier(.1,.75,.18,1)';
    reel.style.transform = 'translateX(' + -(AT * W + W / 2 - vw / 2 + (Math.random() - 0.5) * W * 0.6) + 'px)';
    let tick = 0; const tk = setInterval(() => { if (!roulBusy[kind] || ++tick > T * 9) return clearInterval(tk); if (tick % 2 === 0 || tick < T * 5) sfx.draw(); }, 110);   // «clic» de la ruleta que se va frenando
    setTimeout(done, T * 1000 + 250);
  });
}
function renderOutfits() {
  const box = $('#outfitsBox'); if (!box) return;
  const P = window.PPR_BP, st = P.state, eq = (P.equipped || {}).outfit || '', px = krTotal();
  const own = new Set(st && st.inventory ? st.inventory.filter(i => i.t === 'outfit').map(i => i.id) : []);
  box.innerHTML = '<div class="storehead"><b>Trajes</b><span>Cambian tu personaje y todos lo ven.</span></div>' +
    (!remote ? '<p class="note warn">Inicia sesión con una cuenta online para tener trajes.</p>' : '') +
    '<div class="pets outfits">' + S.OUTFITS.filter(o => !o.ru).map(o => {   // los de la ruleta van en su propia sección
      const rar = S.RARITY[o.r] || { n: '', c: '#9aa4b8' }, has = own.has(o.id), on = eq === o.id, img = outfitThumb(o);
      const btn = !remote ? '<button type="button" disabled>' + fmtKr(o.px) + ' PX</button>'
        : on ? '<button type="button" class="on" data-oq="' + o.id + '">Puesto ✓</button>'
        : has ? '<button type="button" data-oe="' + o.id + '">Ponerme</button>'
        : '<button type="button" data-ob="' + o.id + '"' + (px < o.px ? ' disabled title="Te faltan ' + (o.px - px) + ' PX"' : '') + '>Comprar · ' + fmtKr(o.px) + ' PX</button>';
      return '<div class="petcard' + (on ? ' on' : '') + '" style="--rc:' + rar.c + '"><span class="prar">' + esc(rar.n) + '</span>' + (img ? '<img src="' + img + '" width="96" height="120" alt="">' : '') + '<b>' + esc(o.n) + '</b>' + btn + '</div>';
    }).join('') + '</div><p id="outfitMsg" class="note" role="status"></p>';
  const run = async (path, body, okMsg) => {
    try { const j = await acctPost(path, body); if (j.state && P.applyState) P.applyState(j.state); renderOutfits(); updatePreview(); const bal = $('#storeBal'); if (bal) bal.textContent = fmtKr(krTotal()) + ' PX'; if (okMsg) toast(okMsg); }
    catch (e) { const m = $('#outfitMsg'); if (m) m.textContent = e.message; }
  };
  for (const b of box.querySelectorAll('[data-ob]')) b.addEventListener('click', () => {
    const d = outfitDef(b.dataset.ob); if (!d || !window.confirm('¿Comprar el traje ' + d.n + ' por ' + fmtKr(d.px) + ' PX?')) return;
    b.disabled = true; run('api/bp/outfit-buy', { id: d.id }, '¡Traje ' + d.n + ' comprado! Pulsa «Ponerme» para llevarlo.');
  });
  for (const b of box.querySelectorAll('[data-oe]')) b.addEventListener('click', () => run('api/bp/equip', { slot: 'outfit', item: b.dataset.oe }, 'Traje puesto'));
  for (const b of box.querySelectorAll('[data-oq]')) b.addEventListener('click', () => run('api/bp/equip', { slot: 'outfit', item: null }, 'Traje quitado'));
}
function renderPets() {
  const box = $('#petsBox'); if (!box) return;
  const P = window.PPR_BP, st = P.state, eq = (P.equipped || {}).pet || '', px = krTotal();
  const own = new Set(st && st.inventory ? st.inventory.filter(i => i.t === 'pet').map(i => i.id) : []);
  box.innerHTML = '<div class="storehead"><b>Mascotas</b><span>Te siguen en la partida y todos las ven.</span></div>' +
    (!remote ? '<p class="note warn">Inicia sesión con una cuenta online para tener mascotas.</p>' : '') +
    '<div class="pets">' + S.PETS.map(p => {
      const rar = S.RARITY[p.r] || { n: '', c: '#9aa4b8' }, has = own.has(p.id), on = eq === p.id;
      const btn = !remote ? '<button type="button" disabled>' + fmtKr(p.px) + ' PX</button>'
        : on ? '<button type="button" class="on" data-pq="' + p.id + '">Equipada ✓</button>'
        : has ? '<button type="button" data-pe="' + p.id + '">Equipar</button>'
        : '<button type="button" data-pb="' + p.id + '"' + (px < p.px ? ' disabled title="Te faltan ' + (p.px - px) + ' PX"' : '') + '>Comprar · ' + fmtKr(p.px) + ' PX</button>';
      return '<div class="petcard' + (on ? ' on' : '') + '" style="--rc:' + rar.c + '"><span class="prar">' + esc(rar.n) + '</span>' + petSvg(p) + '<b>' + esc(p.n) + '</b>' + btn + '</div>';
    }).join('') + '</div><p id="petMsg" class="note" role="status"></p>';
  const run = async (path, body, okMsg) => {
    try { const j = await acctPost(path, body); if (j.state && P.applyState) P.applyState(j.state); renderPets(); const bal = $('#storeBal'); if (bal) bal.textContent = fmtKr(krTotal()) + ' PX'; if (okMsg) toast(okMsg); }
    catch (e) { const m = $('#petMsg'); if (m) m.textContent = e.message; }
  };
  for (const b of box.querySelectorAll('[data-pb]')) b.addEventListener('click', () => {
    const d = petDef(b.dataset.pb); if (!d || !window.confirm('¿Comprar ' + d.n + ' por ' + fmtKr(d.px) + ' PX?')) return;
    b.disabled = true; run('api/bp/pet-buy', { id: d.id }, '¡' + d.n + ' ya es tuya! Pulsa «Equipar» para llevarla.');
  });
  for (const b of box.querySelectorAll('[data-pe]')) b.addEventListener('click', () => run('api/bp/equip', { slot: 'pet', item: b.dataset.pe }, 'Mascota equipada'));
  for (const b of box.querySelectorAll('[data-pq]')) b.addEventListener('click', () => run('api/bp/equip', { slot: 'pet', item: null }, 'Mascota quitada'));
}
function checkPaymentReturn() { // al volver de Stripe (?px=ok) se espera a que el servidor acredite el pago
  const q = new URLSearchParams(location.search), st = q.get('px'); if (!st) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* nada */ }
  if (st !== 'ok') { toast('Pago cancelado. No se ha cobrado nada.'); return; }
  toast('¡Pago recibido! Tus PX llegan en unos segundos…'); const before = krTotal(); let n = 0;
  const t = setInterval(async () => { await syncRemote(); if (krTotal() > before || ++n > 15) { clearInterval(t); if (krTotal() > before) toast('¡PX acreditados!'); } }, 2000);
}
function renderRanks() {
  const box = $('#ranksBox'); if (!box) return;
  const pts = statsNow().points || 0, cur = tierOf(pts), r = RANKS[cur], nx = RANKS[cur + 1], claimed = claimedNow();
  const frac = nx ? clamp((pts - r.pts) / (nx.pts - r.pts), 0, 1) : 1;
  let html = '<div class="rankhead" style="--rk:' + r.col + '"><div class="rb">' + (cur + 1) + '</div><div style="flex:1"><b>' + r.n + '</b><small>' + fmtKr(pts) + ' puntos' + (nx ? ' · faltan ' + fmtKr(nx.pts - pts) + ' para ' + nx.n : ' · rango máximo') + '</small><div class="rankbar"><i style="width:' + Math.round(frac * 100) + '%"></i></div></div></div>';
  html += RANKS.map((t, i) => {
    const got = claimed.includes(i), can = pts >= t.pts && !got;
    return '<div class="tier' + (pts >= t.pts ? ' ok' : '') + (i === cur ? ' now' : '') + '" style="--rk:' + t.col + '"><div class="rb">' + (i + 1) + '</div><div>' + t.n + '<small>' + (t.pts ? fmtKr(t.pts) + ' puntos · ' : 'Rango inicial · ') + rewardText(t) + '</small></div>' +
      (can ? '<button type="button" data-claim="' + i + '">Reclamar</button>' : got ? '<span class="st done">✓ Reclamado</span>' : '<span class="st">Bloqueado</span>') + '</div>';
  }).join('');
  box.innerHTML = html;
  for (const b of box.querySelectorAll('[data-claim]')) b.addEventListener('click', () => claimRank(+b.dataset.claim));
}
function renderMenuStats() {
  const st = statsNow();
  $('#stG').textContent = st.games; $('#stK').textContent = st.kills; $('#stW').textContent = st.wins; $('#stS').textContent = st.streak || 0;
  const pts = st.points || 0, L = levelOf(pts);
  $('#lvlN').textContent = 'NIVEL ' + L.lvl + ' · ' + RANKS[tierOf(pts)].n.toUpperCase(); $('#lvlBar').style.width = L.frac * 100 + '%'; $('#lvlTxt').textContent = pts + ' / ' + L.next;
  renderKr();
}
function lobbyRefresh() { renderMenuStats(); renderEvent(); renderDaily(); buildCustom(); updateLobby(); updatePreview(); }

/* --- Vista previa 3D del personaje (se dibuja en la misma pantalla, sobre el hueco del panel) --- */
const pv = { scene: null, cam: null, mesh: null, ang: Math.PI + 0.5, drag: false, lastX: 0, on: false };
function updatePreview() { if (pv.mesh) { pv.mesh.userData.skins = Object.fromEntries(WEAPONS.map(w => [w.id, mySkin(w.id)])); pv.mesh.userData.outfit = (window.PPR_BP.equipped || {}).outfit || ''; }   // [TRAJES] tu traje en la lobby   // [SKINS VISIBLES] tu personaje de la lobby lleva tus skins
  if (pv.mesh) fillCharacter(pv.mesh, COLORS[cfg.look.col].c, cfg.cls, 1, cfg.look.skin, cfg.optics[WEAPONS[cfg.cls].id]); updateEquip(); }
function initPreview() {
  if (!renderer || !renderer.setScissorTest) return;
  pv.scene = new THREE.Scene(); pv.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  pv.cam.position.set(0, 1.05, 4.5); pv.cam.lookAt(0, 0.9, 0);
  pv.scene.add(new THREE.HemisphereLight(0xffffff, 0xa9b6ff, 1.35));
  const d = new THREE.DirectionalLight(0xfff1c9, 1.2); d.position.set(3, 5, 4); pv.scene.add(d);
  const back = pv.back = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ color: 0x070a16, transparent: true, opacity: 0.66, depthWrite: false }));
  back.position.set(0, 1, -2.4); pv.scene.add(back);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.98, 0.06, 28), new THREE.MeshLambertMaterial({ color: 0x1a2350 })); disc.position.y = -0.03; pv.scene.add(disc);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.05, 28), new THREE.MeshBasicMaterial({ color: 0xffdc3a })); ring.position.y = -0.06; pv.scene.add(ring);
  pv.mesh = buildBot(COLORS[cfg.look.col].c, cfg.cls, 1, cfg.look.skin); pv.scene.add(pv.mesh);
  const view = $('#charView');
  view.addEventListener('mousedown', e => { pv.drag = true; pv.lastX = e.clientX; e.preventDefault(); });
  window.addEventListener('mousemove', e => { if (pv.drag) { pv.ang += (e.clientX - pv.lastX) * 0.012; pv.lastX = e.clientX; } });
  window.addEventListener('mouseup', () => { pv.drag = false; });
  pv.on = true; placeCharView(false); setPreviewPet();   // [LOBBY] al arrancar, el personaje ya está abajo a la derecha, sin recuadro
}
function renderPreview(dt) {
  if (!pv.on) return;
  const r = $('#charView').getBoundingClientRect(); if (r.width < 40 || r.height < 40) return;
  if (!pv.drag) pv.ang += dt * 0.55;
  pv.mesh.rotation.y = pv.ang; pv.cam.aspect = r.width / r.height; pv.cam.updateProjectionMatrix();
  const H = window.innerHeight, W = window.innerWidth, ac = renderer.autoClear;
  renderer.setScissorTest(true); renderer.setViewport(r.left, H - r.bottom, r.width, r.height); renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
  renderer.autoClear = false; renderer.clearDepth(); renderer.render(pv.scene, pv.cam); renderer.autoClear = ac;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
}

/* --- Chat: lobby (sin partida) y sala (en línea) --- */
const chatEl = { box: $('#chat'), tab: $('#chatTab'), badge: $('#chatBadge'), log: $('#chatLog'), input: $('#chatIn'), ch: $('#chatCh') };
let chatUnread = 0;
function applyChatHidden() {
  chatEl.box.classList.toggle('off', !!cfg.chatHidden); chatEl.tab.hidden = !cfg.chatHidden;
  if (!cfg.chatHidden) { chatUnread = 0; chatEl.tab.classList.remove('new'); }
}
let lobbyWs = null;
let chatIdleT = 0;
function chatAdd(kind, name, text, rl, mid) {
  const li = document.createElement('li'); li.className = kind + (rl ? ' from-' + rl : ''); if (mid) li.dataset.mid = mid;
  li.innerHTML = (name ? '<b>' + nameHtml(name, rl) + '</b>' : '') + esc(text);
  chatEl.log.appendChild(li);
  /* [NUEVO] durante la partida el chat se atenúa solo a los 7 s sin mensajes nuevos (deja ver el juego) y vuelve a verse al llegar uno */
  chatEl.box.classList.remove('idle'); clearTimeout(chatIdleT); chatIdleT = setTimeout(() => chatEl.box.classList.add('idle'), 7000);
  if (cfg.chatHidden && kind !== 'me' && !document.body.classList.contains('chat-peek')) { chatUnread++; chatEl.badge.textContent = chatUnread > 9 ? '9+' : chatUnread; chatEl.tab.classList.add('new'); }
  while (chatEl.log.children.length > 8) chatEl.log.firstChild.remove();
  if (state === 'playing' || state === 'paused') { setTimeout(() => li.classList.add('old'), 9000); setTimeout(() => li.remove(), 9600); }
}
function updateChatCh() { chatEl.ch.textContent = (online && net.joined) ? 'SALA' : (state === 'menu' && lobbyWs && lobbyWs.readyState === 1) ? 'LOBBY' : 'LOCAL'; }
function chatSend(raw) {
  const text = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120); if (!text) return;
  if (/^\/reportar(\s|$)/i.test(text)) return chatReport(text);
  if (online && net.joined) return netSend({ t: 'chat', m: text });
  if (state === 'menu' && lobbyWs && lobbyWs.readyState === 1) return lobbyWs.send(JSON.stringify({ t: 'chat', m: text }));
  chatAdd('me', cfg.name, text); chatAdd('sys', '', 'Sin conexión con el servidor: solo tú ves este mensaje.');
}
/* ===== [GRUPOS] Panel del grupo en la lobby, invitaciones y jugar juntos. El servidor decide todo (quién está, quién manda, a qué sala
   se va); aquí solo se pinta y se piden cosas por la conexión de la lobby. ===== */
const partyC = { st: null, tok: null, invs: [] };
function lobbySend(m) { if (lobbyWs && lobbyWs.readyState === 1) { lobbyWs.send(JSON.stringify(m)); return true; } if (online && net.ws && net.ws.readyState === 1) { net.ws.send(JSON.stringify(m)); return true; } return false; }
function partyInvite(name) { if (!acctToken()) return toast('Inicia sesión con una cuenta online para jugar en grupo con tus amigos.'); if (!lobbySend({ t: 'pinv', u: name })) toast('Sin conexión con el servidor.'); else toast('Invitación enviada a ' + name); }
const partyIsLead = () => !!(partyC.st && partyC.st.id && partyC.st.lead === cfg.name);
function renderParty() {
  const box = $('#partyBox'); if (!box) return; const p = partyC.st;
  if (!p || !p.id) { box.innerHTML = '<button type="button" class="pt-inv" data-pt="friends">＋ Jugar con amigos</button>'; box.classList.remove('on'); return; }
  box.classList.add('on');
  const lead = partyIsLead(), me = (p.members.find(x => x.u === cfg.name) || {});
  box.innerHTML = '<div class="pt-head"><b>Grupo</b><span>' + p.members.length + '/' + p.max + '</span></div><div class="pt-list">' +
    p.members.map(x => '<div class="pt-row' + (x.ready || x.lead ? ' rdy' : '') + '">' + (x.lead ? '<i class="pt-crown" title="Jefe del grupo">👑</i>' : '') + '<span class="pt-av">' + esc(x.u[0].toUpperCase()) + '</span><span class="pt-n"><span class="pt-nm">' + nameHtml(x.u, x.rl) + '</span><small>' + esc(x.rank || '') + (x.ready && !x.lead ? ' · <em>Listo</em>' : '') + '</small></span>' +
      (lead && x.u !== cfg.name ? '<button type="button" class="pt-kick" data-pt="kick" data-u="' + esc(x.u) + '" title="Sacar del grupo">✕</button>' : '') + '</div>').join('') + '</div>' +
    (p.pending && p.pending.length ? '<p class="pt-pend">Invitado: ' + p.pending.map(esc).join(', ') + '</p>' : '') +
    '<div class="pt-acts">' + (lead ? '<button type="button" data-pt="friends">＋ Invitar</button>' : '<button type="button" data-pt="ready" class="' + (me.ready ? 'on' : '') + '">' + (me.ready ? 'Listo ✓' : 'Listo') + '</button>') + '<button type="button" data-pt="leave" class="alt">Salir</button></div>' +
    (lead ? '<p class="pt-hint">Eres el jefe: al pulsar Jugar entráis todos juntos.</p>' : '<p class="pt-hint">El jefe empieza la partida.</p>');
}
function showPartyInvite(m) {
  partyC.invs = partyC.invs.filter(i => i.id !== m.id); partyC.invs.push(m);
  const box = $('#ptInvite'); if (!box) return;
  box.innerHTML = '<p><b>' + nameHtml(m.from.u, m.from.rl) + '</b> te invita a su grupo</p><div><button type="button" data-pi="acc" data-id="' + m.id + '">Aceptar</button><button type="button" data-pi="dec" data-id="' + m.id + '" class="alt">Rechazar</button></div>';
  box.hidden = false; clearTimeout(showPartyInvite.t); showPartyInvite.t = setTimeout(() => { box.hidden = true; }, m.exp || 60000);
}
function onPartyMsg(m) {
  if (m.t === 'party') { partyC.st = m.id ? m : null; renderParty(); return true; }
  if (m.t === 'pinvite') { showPartyInvite(m); try { sfx.hit(); } catch (e) { /* sin sonido */ } return true; }
  if (m.t === 'pnote') { toast(m.m); return true; }
  if (m.t === 'pgo') {   // el jefe ha empezado: todos a jugar con el billete del grupo
    partyC.tok = m.tok; if (S.MODES[m.mode]) cfg.mode = m.mode; if (Number.isInteger(m.map)) cfg.map = m.map;
    if (state === 'menu' && !online) { document.body.classList.remove('eqopen'); startOnline(); }
    return true;
  }
  return false;
}
function lobbyConnect() {
  if (lobbyWs || !serverOK || state !== 'menu' || online || typeof WebSocket === 'undefined') return;
  let ws; try { ws = new WebSocket(wsUrl()); } catch (e) { return; }
  lobbyWs = ws;
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'lobby', n: cfg.name, adm: admToken(), inf: cfg.infKey || '', acct: acctToken() })); updateChatCh(); };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'chat') chatAdd(m.n === cfg.name ? 'me' : '', m.n, m.m, m.rl, m.i);
    else if (m.t === 'chatdel') chatDel(m.i);
    else if (m.t === 'notice') showNotice(m);
    else if (m.t === 'err') chatAdd('sys', '', m.m);
    else if (onPartyMsg(m)) return;   // [GRUPOS]
    else if (m.t === 'lobbyok') { lobbySend({ t: 'pget' }); document.body.classList.toggle('verified', !!m.rl); chatDel('lobbyok'); chatAdd('sys', '', 'Chat del lobby conectado · ' + m.n + (m.n === 1 ? ' persona' : ' personas') + ' en línea.', 0, 'lobbyok'); }   // [CORREGIDO] al reconectar (p. ej. al iniciar sesión) sustituye al aviso anterior en vez de repetirlo
  };
  ws.onclose = () => { if (lobbyWs === ws) { lobbyWs = null; updateChatCh(); } };
  ws.onerror = () => {};
}
function lobbyClose() { const ws = lobbyWs; lobbyWs = null; if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch (e) { /* ya cerrado */ } } updateChatCh(); }
function chatDel(i) { for (const li of chatEl.log.querySelectorAll('li[data-mid="' + i + '"]')) li.remove(); }
const noticeEl = $('#notice'); let noticeT = 0;
function showNotice(m) { // avisos de la moderación y anuncios del servidor
  const text = String(m.m || ''); if (!text) return;
  chatAdd('sys', '', (m.kind === 'announce' ? '📢 ' : m.kind === 'warn' ? '⚠ ' : '') + text);
  if (m.kind === 'sys' || !noticeEl) return;
  noticeEl.textContent = text; noticeEl.className = 'on ' + (m.kind || ''); clearTimeout(noticeT); noticeT = setTimeout(() => { noticeEl.className = ''; }, 8000);
}
/* Reportar jugadores: desde el menú de pausa o con /reportar nombre motivo */
function openReport() {
  const sel = $('#repTarget'); sel.replaceChildren();
  for (const f of net.remotes.values()) { const o = document.createElement('option'); o.value = f.id; o.textContent = f.name; sel.appendChild(o); }
  $('#repMsg').textContent = sel.children.length ? '' : 'No hay más jugadores en tu sala.'; $('#repSend').disabled = !sel.children.length; $('#repText').value = '';
  $('#reportModal').hidden = false;
}
function closeReport() { $('#reportModal').hidden = true; }
function reportResult(m) { chatAdd('sys', '', m.m); const msg = $('#repMsg'); if (msg) msg.textContent = m.m; if (m.ok) setTimeout(closeReport, 900); }
function chatReport(text) {
  if (!(online && net.joined)) return chatAdd('sys', '', 'Solo puedes reportar durante una partida online.');
  const m = /^\/reportar\s+(\S+)\s*(.*)$/i.exec(text); if (!m) return chatAdd('sys', '', 'Uso: /reportar nombre motivo');
  const f = [...net.remotes.values()].find(x => x.name.toLowerCase() === m[1].toLowerCase());
  if (!f) return chatAdd('sys', '', 'No hay ningún jugador llamado «' + m[1] + '» en tu sala.');
  netSend({ t: 'report', id: f.id, cat: 'otro', text: m[2] });
}
function initReport() {
  $('#reportBtn').addEventListener('click', openReport); $('#repCancel').addEventListener('click', closeReport);
  $('#reportForm').addEventListener('submit', e => { e.preventDefault(); netSend({ t: 'report', id: +$('#repTarget').value, cat: $('#repCat').value, text: $('#repText').value }); });
}
function openChat() { chatEl.box.classList.remove('idle'); Object.keys(keys).forEach(k => { keys[k] = false; }); mouseL = mouseR = false; if (cfg.chatHidden) document.body.classList.add('chat-peek'); chatEl.input.focus(); }
function initChat() {
  initReport(); initEnd();
  applyChatHidden();
  $('#chatX').addEventListener('click', () => { cfg.chatHidden = true; saveCfg(); document.body.classList.remove('chat-peek'); chatEl.input.blur(); applyChatHidden(); });
  chatEl.tab.addEventListener('click', () => { cfg.chatHidden = false; saveCfg(); applyChatHidden(); });
  chatEl.input.addEventListener('blur', () => document.body.classList.remove('chat-peek'));
  chatEl.input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const t = chatEl.input.value; chatEl.input.value = ''; chatSend(t); if (state === 'playing') chatEl.input.blur(); }
    else if (e.key === 'Escape') { chatEl.input.value = ''; chatEl.input.blur(); }
  });
  chatEl.input.addEventListener('focus', () => { if (state === 'playing') { Object.keys(keys).forEach(k => { keys[k] = false; }); mouseL = mouseR = false; } });
  chatAdd('sys', '', 'Bienvenido a Krunxa. Durante la partida, pulsa Enter para escribir.');
  setInterval(updateChatCh, 600); updateChatCh();
}

function initMenu() {
  window.addEventListener('ppr-session', () => { syncRemote(); }); syncRemote().then(checkPaymentReturn);
  const ik = $('#infKey'); ik.value = cfg.infKey || '';
  ik.addEventListener('change', () => { cfg.infKey = ik.value.trim().toUpperCase().slice(0, 24); ik.value = cfg.infKey; saveCfg(); $('#infO').textContent = cfg.infKey ? 'guardado' : ''; lobbyClose(); lobbyConnect(); });
  $('#name').value = cfg.name;
  buildClassButtons(); buildMapButtons(); buildCustom(); updateLobby();
  $('#classes').addEventListener('click', e => { const b = e.target.closest('.cls'); if (!b) return; if (quickSwapMode) quickSwapPick(+b.dataset.i); else selectClass(+b.dataset.i); });
  $('#optics').addEventListener('click', e => { const b = e.target.closest('.opt'); if (!b) return; cfg.optics[WEAPONS[cfg.cls].id] = b.dataset.k; saveCfg(); renderOptics(); updatePreview(); });
  renderOptics();
  $('#maps').addEventListener('click', e => { const b = e.target.closest('.mapc'); if (b) selectMap(+b.dataset.i); });
  $('#swColors').addEventListener('click', e => { const b = e.target.closest('.cs'); if (b) pickColor(+b.dataset.i); });
  $('#swSkins').addEventListener('click', e => { const b = e.target.closest('.cs'); if (b) pickSkin(+b.dataset.i); });
  $('#mapBtn').addEventListener('click', () => showTab('maps'));
  /* Inicio: cajón de bando y equipamiento antes de jugar, noticia del mapa y acceso al Pase */
  const closeEq = () => { if (quickSwapMode) { closeQuickSwap(); return; } document.body.classList.remove('eqopen'); placeCharView(false); updateLkChar(); };
  $('#lkCustom').addEventListener('click', openCustomize);
  /* [NUEVO] Tienda de armas de la pantalla de reaparición */
  $('#shopToggle').addEventListener('click', () => $('#shop').classList.toggle('off'));
  $('#shopBack').addEventListener('click', () => $('#shop').classList.add('off'));
  $('#shopGrid').addEventListener('click', e => { const b = e.target.closest('button[data-si]'); if (b && !b.disabled) buy(+b.dataset.si); });
  $('#shopGo').addEventListener('click', () => { if (!online && player && !player.alive) player.respawnAt = simTime; });   // entrenamiento: reaparece ya; online: el servidor manda el tiempo
  $('#eqClose').addEventListener('click', closeEq);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeEq(); });
  $('#newsMap').addEventListener('click', () => showTab('maps'));
  $('#newsThumb').style.backgroundImage = 'url(' + mapImg(0) + ')';
  $('#passRow').addEventListener('click', () => { const b = document.querySelector('.nav button[data-tab=pass]'); if (b) b.click(); });
  const setDiff = d => { cfg.diff = d; saveCfg(); $$('#diff button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.d === d))); };
  $('#diff').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setDiff(+b.dataset.d); });
  setDiff(cfg.diff);
  $$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#lbMap').innerHTML = '<option value="-1">Todos los mapas</option>' + MAPS.map((m, i) => '<option value="' + i + '">' + esc(m.name) + '</option>').join('');
  $('#lbMap').addEventListener('change', renderLeaderboard);
  const bind = (id, key, fmt) => {
    const i = $('#' + id), o = $('#' + id + 'O'); i.value = cfg[key]; o.textContent = fmt(cfg[key]);
    i.addEventListener('input', () => { cfg[key] = +i.value; o.textContent = fmt(cfg[key]); saveCfg(); if (key === 'vol' && master) master.gain.value = cfg.vol; });
  };
  bind('sens', 'sens', v => v.toFixed(2)); bind('fov', 'fov', v => v + '°'); bind('vol', 'vol', v => Math.round(v * 100) + '%');
  const hq = $('#hq'); if (hq) { hq.checked = HQ; $('#hqO').textContent = HQ ? 'Sí' : 'No'; hq.addEventListener('change', () => { cfg.hq = hq.checked; $('#hqO').textContent = hq.checked ? 'Sí' : 'No'; saveCfg(); toast('Se aplica al recargar la página'); }); }   // [GRÁFICOS]
  const sh = $('#shadows'); sh.checked = !!cfg.shadows; $('#shadowsO').textContent = cfg.shadows ? 'Sí' : 'No';
  sh.addEventListener('change', () => { cfg.shadows = sh.checked; cfg.shadowsSet = true; $('#shadowsO').textContent = cfg.shadows ? 'Sí' : 'No'; saveCfg(); applyShadows(); });
  /* [NUEVO] Ajustes de la rueda del ratón y de la sacudida de pantalla */
  const ws = $('#wheelSwap'); ws.checked = !!cfg.wheelSwap; $('#wheelSwapO').textContent = cfg.wheelSwap ? 'Sí' : 'No';
  ws.addEventListener('change', () => { cfg.wheelSwap = ws.checked; $('#wheelSwapO').textContent = cfg.wheelSwap ? 'Sí' : 'No'; saveCfg(); });
  bind('shake', 'shake', v => (v ? v + '%' : 'Desactivada'));
  bind('recoilCam', 'recoilCam', v => (v ? v + '%' : 'Desactivado'));   // [NUEVO] retroceso visual de la cámara
  bind('fovSpeed', 'fovSpeed', v => (v ? '+' + v + '°' : 'Desactivado'));   // [NUEVO] FOV dinámico por velocidad
  /* [NUEVO] HUD: tamaño (80–120 %) y modo compacto */
  bind('hudScale', 'hudScale', v => v + '%'); $('#hudScale').addEventListener('input', applyHudPrefs);
  const hc = $('#hudCompact'); hc.checked = !!cfg.hudCompact; $('#hudCompactO').textContent = cfg.hudCompact ? 'Sí' : 'No';
  hc.addEventListener('change', () => { cfg.hudCompact = hc.checked; $('#hudCompactO').textContent = cfg.hudCompact ? 'Sí' : 'No'; saveCfg(); applyHudPrefs(); });
  applyHudPrefs();
  /* [NUEVO] Cambiar el nombre de la cuenta: solo cambia la etiqueta; PX, estadísticas y pase siguen ligados al ID */
  $('#renameBtn').addEventListener('click', () => { const r = $('#renameRow'); r.hidden = !r.hidden; if (!r.hidden && remote) { $('#renameIn').value = remote.username; $('#renameMsg').textContent = ''; $('#renameIn').focus(); } });
  $('#renameOk').addEventListener('click', async () => {
    const msg = $('#renameMsg'), b = $('#renameOk'); b.disabled = true; msg.textContent = '';
    try {
      const j = await acctPost('api/me/rename', { username: $('#renameIn').value.trim() }); remote = j.profile; applyAccountName();
      $('#renameRow').hidden = true; toast('Ahora te llamas ' + remote.username);
    } catch (e) { msg.textContent = e.message + (e.suggestions && e.suggestions.length ? ' Prueba: ' + e.suggestions.join(', ') : ''); }
    b.disabled = false;
  });
  let clearT = 0;
  $('#clearLb').addEventListener('click', e => {
    const b = e.currentTarget;
    if (b.dataset.armed) { store.set(K.scores, []); store.set(K.stats, { games: 0, kills: 0, wins: 0, streak: 0, points: 0, best: 0 }); delete b.dataset.armed; b.textContent = 'Borrar clasificación'; b.classList.remove('danger'); renderLeaderboard(); renderMenuStats(); clearTimeout(clearT); }
    else { b.dataset.armed = '1'; b.textContent = 'Pulsa otra vez para confirmar'; b.classList.add('danger'); clearT = setTimeout(() => { delete b.dataset.armed; b.textContent = 'Borrar clasificación'; b.classList.remove('danger'); }, 3000); }
  });
  $('#play').addEventListener('click', () => openLoadout('train'));
  $('#playOnline').addEventListener('click', () => openLoadout('online'));
  $('#eqPlay').addEventListener('click', () => {
    if (pendingPlay === 'online' && partyC.st && partyC.st.id) {   // [GRUPOS] en grupo: el jefe empieza para todos; los demás esperan
      if (!partyIsLead()) return toast('Estás en un grupo: la partida la empieza el jefe.');
      closeEq(); lobbySend({ t: 'pplay', mode: S.MODES[cfg.mode] ? cfg.mode : 'duelo', map: cfg.map }); return;
    }
    closeEq(); if (pendingPlay === 'online') startOnline(); else startMatch();
  });
  $('#partyBox').addEventListener('click', e => { const b = e.target.closest('[data-pt]'); if (!b) return; const a = b.dataset.pt;
    if (a === 'friends') { if (!acctToken()) return toast('Inicia sesión con una cuenta online para jugar en grupo con tus amigos.'); return showTab('profile'); }
    if (a === 'leave') return lobbySend({ t: 'pleave' });
    if (a === 'kick') return lobbySend({ t: 'pkick', u: b.dataset.u });
    if (a === 'ready') { const me = partyC.st && partyC.st.members.find(x => x.u === cfg.name); return lobbySend({ t: 'pready', r: !(me && me.ready) }); }
  });
  $('#ptInvite').addEventListener('click', e => { const b = e.target.closest('[data-pi]'); if (!b) return; lobbySend({ t: b.dataset.pi === 'acc' ? 'pacc' : 'pdec', id: b.dataset.id }); $('#ptInvite').hidden = true; });
  renderParty();
  $('#teamPick').addEventListener('click', e => { const b = e.target.closest('.tm'); if (b) pickTeam(b.dataset.tm); });
  $('#lbScope').addEventListener('change', renderLeaderboard);
  $('#lbScope').value = 'local';
  $('#resume').addEventListener('click', resumeGame);
  $('#quit').addEventListener('click', leaveToMenu);
  $('#again').addEventListener('click', startMatch);
  $('#toMenu').addEventListener('click', leaveToMenu);
  $('#name').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') (serverOK ? startOnline : startMatch)(); });
  $('#name').addEventListener('change', () => { cfg.name = sanitizeName($('#name').value) || cfg.name; $('#name').value = cfg.name; saveCfg(); updateLobby(); lobbyClose(); lobbyConnect(); });
  if (!window.matchMedia('(any-pointer: fine)').matches) { $('#touchWarn').hidden = false; $('#play').disabled = true; noPointer = true; }   // sin ratón (móviles) no se puede jugar: los controles táctiles son para pantallas táctiles CON ratón conectado
  if (!renderer) noPointer = true;
  $('#playOnline').disabled = true;
  initServerBtn(); renderMenuStats(); renderEvent(); renderDaily(); renderLeaderboard(); initPreview(); initChat(); checkServer();
}

let lbToken = 0;
async function renderLeaderboard() {
  const f = +$('#lbMap').value, scope = $('#lbScope').value, tok = ++lbToken;
  let list = [];
  if (scope === 'global') {
    try {
      const r = await fetch(apiUrl('api/leaderboard?map=' + f), { cache: 'no-store' });
      if (!r.ok) throw new Error('http');
      list = (await r.json()).entries || [];
    } catch (e) {
      if (tok === lbToken) $('#lbBox').innerHTML = '<p class="empty">No se pudo cargar la clasificación global. Prueba «Mis partidas» o inténtalo más tarde.</p>';
      return;
    }
  } else {
    list = store.get(K.scores, []);
    if (f >= 0) list = list.filter(e => e.m === f);
  }
  if (tok !== lbToken) return;
  const dn = ['Fácil', 'Normal', 'Difícil'];
  if (!list.length) { $('#lbBox').innerHTML = '<p class="empty">Aún no hay partidas guardadas' + (f >= 0 ? ' en este mapa' : '') + '. Juega una y aparecerás aquí.</p>'; return; }
  $('#lbBox').innerHTML = '<table class="tbl"><thead><tr><th>#</th><th>Jugador</th><th>Clase</th><th>Mapa</th><th class="r">Bajas</th><th class="r">K/D</th><th class="r">Puntos</th></tr></thead><tbody>' +
    list.slice(0, 15).map((e, i) => '<tr class="' + (e.n === cfg.name ? 'me ' : '') + (i === 0 ? 'first' : '') + '"' + (dn[e.df] ? ' title="Dificultad: ' + dn[e.df] + '"' : '') + '><td class="pos">' + (i + 1) + '</td><td><a class="plink" href="#" data-profile="' + esc(e.n) + '">' + nameHtml(e.n, e.r || 0) + '</a></td><td>' + esc(e.c) + '</td><td>' + esc(MAPS[e.m] ? MAPS[e.m].name : '-') + '</td><td class="r">' + e.k + '</td><td class="r">' + (e.d ? (e.k / e.d).toFixed(1) : e.k.toFixed(1)) + '</td><td class="r">' + e.p + '</td></tr>').join('') + '</tbody></table>';
}
/* =====================================================================
   Entrada
   ===================================================================== */
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) { fallback = false; clearTimeout(lockTimer); }
  else if (state === 'playing' && !fallback && el.death.hidden) pauseGame();   // [NUEVO] perder el bloqueo por la tienda no debe abrir la pausa
});
document.addEventListener('pointerlockerror', () => { fallback = true; });
document.addEventListener('mousemove', e => {
  if (state !== 'playing' || !player || !player.alive || !(locked || fallback)) return;
  const k = 0.0022 * cfg.sens * (player.aim > 0.3 ? aimFovOf(WEAPONS[player.wi]) + 0.15 : 1);
  player.yaw -= (e.movementX || 0) * k; player.pitch -= (e.movementY || 0) * k;
});
document.addEventListener('mousedown', e => {
  if (state !== 'playing') return;
  if (e.button === 0) mouseL = true; if (e.button === 2) mouseR = true;
  if (!locked && !fallback && el.death.hidden) requestLock();   // [NUEVO] mientras se ve la tienda, un clic no vuelve a capturar el ratón
});
document.addEventListener('mouseup', e => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
document.addEventListener('contextmenu', e => { if (state === 'playing' || state === 'paused') e.preventDefault(); });
document.addEventListener('wheel', onWheel, { passive: false });   // [MEJORA] antes solo bloqueaba el scroll; ahora cambia de arma
document.addEventListener('keydown', e => {
  if (state !== 'playing') return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); openChat(); return; }
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Tab') { el.board.hidden = false; updateHudSlow(); }
  if (e.code === 'Escape' && !locked && el.death.hidden) pauseGame();   // [NUEVO] con la tienda abierta el cursor ya está libre: Escape no debe abrir la pausa encima
  if (e.code === 'KeyR' && player.alive && slot === 0) startReload();   // con el cuchillo en mano no se recarga
  if (e.code === 'Digit1') setSlot(0); else if (e.code === 'Digit2' || e.code === 'Digit3') setSlot(1); else if (e.code === 'KeyE') setSlot(0);   // [CONTROLES] 1/E = arma principal, 2/3 = cuchillo
  if (e.code === 'KeyQ') { if (slot !== 1) setSlot(1); else playerMelee(); }   // [CONTROLES] Q: si no tienes el cuchillo en la mano, lo saca; si ya lo tienes, golpea
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && player.alive && S.startSlide(player)) sfx.slide();   // [CONTROLES] agacharse en marcha (ahora con Mayús) = deslizarse (reglas en S.MOVE)
  if (e.code === 'Space' && player.alive) jumpQueued = true;   // [CONTROLES] salto de pulsación única: se arma aquí (una vez) y se consume en el siguiente paso de física
  if (e.code === 'KeyB' && player.alive) cycleOptic();
  if (e.code === 'KeyC' && player.alive && performance.now() - spawnAt < QUICK_SWAP_MS && !quickSwapMode) openQuickSwap();   // [NUEVO] cambio rápido de arma, solo los primeros segundos tras reaparecer
  // [NUEVO] el arma para el próximo respawn se elige y se paga en la tienda (#shop); ya no se cambia gratis con 1-9 al morir.
  if (e.code === 'KeyV') playerMelee();
  if (e.code === 'KeyF' && player.alive && slot === 1 && slashT === 0 && knifeT === 0 && inspectT === 0) inspectT = 0.0001;   // [CUCHILLOS] inspeccionar el cuchillo
});
document.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab') el.board.hidden = true; });
window.addEventListener('blur', () => { Object.keys(keys).forEach(k => keys[k] = false); mouseL = mouseR = false; if (state === 'playing') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (renderer) renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* =====================================================================
   Bucle principal
   ===================================================================== */
/* Efecto dorado neón de las bajas de administradores e influencers */
const goldFx = [], goldEl = $('#goldflash'); let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient ? g.createRadialGradient(32, 32, 0, 32, 32, 32) : null;
  if (gr && gr.addColorStop) { gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(0.35, 'rgba(255,200,60,.7)'); gr.addColorStop(1, 'rgba(255,180,0,0)'); g.fillStyle = gr; } else g.fillStyle = 'rgba(255,200,60,.8)';
  g.fillRect(0, 0, 64, 64); return (_glow = new THREE.CanvasTexture(c));
}
function goldKillFx(pos) {
  burst(pos, '#ffd23f', 26, 7); burst(pos, '#fff3b0', 12, 4);
  const add = (m, o) => { m.position.copy(pos); scene.add(m); goldFx.push(Object.assign({ m, t: 0 }, o)); return m; };
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.34, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  add(ring, { kind: 'ring' }).lookAt(camera.position);
  add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffc933, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })), { kind: 'glow' });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  add(beam, { kind: 'beam' }).position.y += 3.2;
}
function updateGoldFx(dt) {
  for (let i = goldFx.length - 1; i >= 0; i--) {
    const f = goldFx[i]; f.t += dt; const k = f.t / 0.75;
    if (k >= 1) { scene.remove(f.m); if (f.m.geometry) f.m.geometry.dispose(); f.m.material.dispose(); goldFx.splice(i, 1); continue; }
    if (f.kind === 'ring') { f.m.scale.setScalar(1 + k * 8); f.m.material.opacity = (1 - k) * 0.95; f.m.lookAt(camera.position); }
    else if (f.kind === 'glow') { f.m.scale.setScalar(2 + k * 4); f.m.material.opacity = (1 - k) * 0.95; }
    else { f.m.scale.x = f.m.scale.z = 1 + k * 3; f.m.material.opacity = (1 - k) * 0.85; }
  }
}
function goldFlash() { if (!goldEl) return; goldEl.classList.remove('on'); void goldEl.offsetWidth; goldEl.classList.add('on'); }
function updateFx(dt) {
  updateGoldFx(dt);
  updateDying(dt);
  for (const t of tracerPool) if (t.life > 0) { t.life -= dt; t.l.material.opacity = Math.max(0, t.life / 0.07) * 0.9; }
  for (const p of partPool) if (p.life > 0) {
    p.life -= dt; p.vel.y -= 14 * dt; p.m.position.addScaledVector(p.vel, dt);
    if (p.m.position.y < 0.07) { p.m.position.y = 0.07; p.vel.multiplyScalar(0.4); }
    p.m.material.opacity = clamp(p.life * 2, 0, 1); p.m.scale.setScalar(clamp(p.life * 2, 0.2, 1));
    if (p.life <= 0) p.m.visible = false;
  }
}
function step(dt) {
  if (online) return stepOnline(dt);
  simTime += dt; timeLeft -= dt;
  updatePlayer(dt);
  for (const b of bots) updateBot(b, dt);
  updateFx(dt);
  for (const b of bots) if (b.alive && b.label) { b.label.position.set(b.pos.x, b.pos.y + 2.3, b.pos.z); }
  if (timeLeft <= 0) { timeLeft = 0; endMatch(); }
}
/* =====================================================================
   [NUEVO] Calidad adaptativa
   Si durante la partida el FPS medio queda por debajo de 40 en dos mediciones seguidas (2 s cada una), baja un escalón: resolución interna
   ×2 → ×1,5 → ×1 → ×0,75 y, agotados esos, apaga las sombras (que dibujan dos veces los objetos que las proyectan). Solo baja, nunca sube sola
   (así no hay parpadeos de calidad) y no toca los ajustes guardados: al recargar la página se vuelve a empezar. Desactivable con cfg.autoQuality = false.
   ===================================================================== */
const QUALITY_RATIOS = [2, 1.5, 1, 0.75];
let curRatio = Math.min(window.devicePixelRatio || 1, 2), qShadowsOff = false, qAcc = 0, qN = 0, qLow = 0;
function adaptQuality(rawDt) {
  if (!renderer || cfg.autoQuality === false || state !== 'playing' || document.hidden || rawDt > 0.5) { qAcc = qN = 0; return; }   // pausas y pestañas ocultas no cuentan
  qAcc += rawDt; qN++; if (qAcc < 2) return;
  const fps = qN / qAcc; qAcc = qN = 0; qLow = fps < 40 ? qLow + 1 : 0; if (qLow < 2) return; qLow = 0;
  const next = QUALITY_RATIOS.find(r => r < curRatio - 0.01);
  if (next) { curRatio = next; renderer.setPixelRatio(next); resize(); toast('Calidad ajustada para ir más fluido'); }
  else if (cfg.shadows && !qShadowsOff) { qShadowsOff = true; applyShadows(); toast('Sombras desactivadas para ir más fluido'); }
}
let orbitA = 0, last = performance.now();
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  adaptQuality(raw);
  tickKnives(dt);   // [CUCHILLOS] luces que recorren las hojas con efecto
  fpsAcc += raw; fpsN++; if (fpsAcc >= 0.5) { el.fps.textContent = Math.round(fpsN / fpsAcc) + ' FPS'; fpsAcc = 0; fpsN = 0; }
  if (online && state === 'paused') stepOnline(dt);
  if (state === 'playing') {
    let rem = dt; while (rem > 1e-5) { const s = Math.min(rem, 1 / 60); step(s); rem -= s; if (state !== 'playing') break; }
    if (state === 'playing') {
      hudAcc += dt; updateHudFast();
      if (hudAcc > 0.4) { hudAcc = 0; updateHudSlow(); }
      if (player && !player.alive && deathLook) {   // [NUEVO] cámara de muerte: se ve a quien te eliminó desde detrás, con suavidad, hasta reaparecer
        const k = deathLook, tp = new THREE.Vector3(k.pos.x + Math.sin(k.yaw || 0) * 3.4, k.pos.y + 2.2, k.pos.z + Math.cos(k.yaw || 0) * 3.4);
        if (!net.kc) { net.kc = true; camera.position.set(player.pos.x, player.pos.y + 1.6, player.pos.z); }
        camera.position.lerp(tp, Math.min(1, dt * 4)); camera.lookAt(k.pos.x, k.pos.y + 1.3, k.pos.z);
      } else net.kc = false;
    }
  } else if (state === 'spectate') {   // [NUEVO] espectador
    simTime += dt; updateRemotes(dt); updateFx(dt); specCam(dt);
    net.pingAcc += dt; if (net.pingAcc > 2) { net.pingAcc = 0; netSend({ t: 'ping', ts: performance.now() }); }
  } else if (state === 'menu' || state === 'ended') {
    orbitA += dt * (reduce ? 0.02 : 0.09);
    camera.position.set(Math.cos(orbitA) * mapHalf, 17, Math.sin(orbitA) * mapHalf);
    camera.lookAt(0, 2.5, 0);
    if (online && state === 'ended') updateEndCountdown();
    gun.visible = false;
  }
  sky.position.copy(camera.position); cloudRoot.rotation.y += dt * 0.004;
  if (renderer) renderer.render(scene, camera);
  animPets(dt);   // [MASCOTAS]
  animMap(dt);   // [MAPAS 2]
  animXmas(dt);   // [NAVIDAD]
  pulseNeon();   // [NEÓN]
  if (state === 'menu') renderPreview(dt);
}

if (!cfg.shadowsSet && renderer && isSoftwareGL()) cfg.shadows = false;
buildMap(cfg.map); applyShadows(); initMenu(); resize(); setInterval(() => { if (state === 'menu') checkServer(); }, 15000); buildGun(WEAPONS[cfg.cls]); gun.visible = false;
/* Puente para la pantalla del pase de batalla (bp.js) */
Object.assign(window.PPR_BP, { partyInvite, petSvg, unlockedColors: () => unlocked(), pickColor, currentColor: () => cfg.look.col,   // [INVENTARIO]
  gunPreview: (wid, skinId) => { const w = WEAPONS.find(x => x.id === wid); return w ? gunModel(w, 0, null, skinId) : null; },   // [3D] el arma con su skin, igual que en la partida
  limit: () => teamLimit, cfg, saveCfg, net: () => net, player: () => player, camera: () => camera, scene: () => scene, THREE, startSpectate, stopSpectate, specCycle, setSpecView: v => { net.specView = v; }, gunsOK, setCr: n => { if (remote) { remote.credits = n; renderCr(); } }, S, fmt: fmtKr, esc, toast, acctToken, apiUrl, acctPost, remote: () => remote, showTab, syncRemote, setPx: n => { if (remote) { remote.px = n; renderKr(); } },
  rebuild() { buildKnifeModel(); if (player && state !== 'menu') buildGun(WEAPONS[player.wi]); setPreviewPet(); updatePreview(); if ($('#petsBox')) renderPets(); if ($('#outfitsBox')) renderOutfits(); if ($('#knivesBox')) renderKnives(); }, weaponName: id => (WEAPONS.find(w => w.id === id) || {}).name || id });
requestAnimationFrame(frame);
})();
