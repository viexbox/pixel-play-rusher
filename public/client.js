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
cfg.cls = clamp(cfg.cls | 0, 0, window.VoltShared.WEAPONS.length - 1); if (!cfg.optics || typeof cfg.optics !== 'object') cfg.optics = {}; if (!Array.isArray(cfg.rankClaimed)) cfg.rankClaimed = []; cfg.infKey = String(cfg.infKey || '').slice(0, 40); cfg.map = clamp(cfg.map | 0, 0, window.VoltShared.MAPS.length - 1); cfg.diff = clamp(cfg.diff | 0, 0, 2);
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

const hemi = new THREE.HemisphereLight(0xffffff, 0x9fb0ff, 0.66); scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff1c9, 0.88);
sunLight.position.set(52, 92, 34); scene.add(sunLight, sunLight.target);
sunLight.shadow.mapSize.set(2048, 2048);
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
const texCache = {};
function getTex(name, arg) {
  const key = name + (arg || ''); if (texCache[key]) return texCache[key];
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  TEX[name].draw(c.getContext('2d'), S, rngSeed(strHash(key)), arg);
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
  worldUV(geo, w, h, d, TEX[type].tile, TEX[type].raw ? [0, 0] : [uvR(), uvR()]); shadeBox(geo, 0.8, (type === 'awning' || TEX[type].raw) ? WHITE : c);
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
  const geo = new THREE.BoxGeometry(w, h, d); shadeBox(geo, 1, colorOf(color)); geo.deleteAttribute('uv'); geo.translate(cx, y0 + h / 2, cz);
  queueBox(vcMat(basic ? 'basic' : 'lit'), !basic && !noCast && h > 0.9, false, geo);
};
function decorate(L, m) {
  const half = m.half, R = rngSeed(strHash(m.name));
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
    flag(-47.4, 1.5, '#ff3b48'); flag(-47.4, 18.5, '#ff3b48'); flag(47.4, 3.5, '#2f7bff'); flag(47.4, 10.5, '#2f7bff');
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
  setFloor(m, L);
  const world = S.buildWorld(i, addMesh);
  colliders = world.colliders; waypoints = world.waypoints; curSpawns = world.spawns; curNav = world.nav;
  decorate(L, m);
  flushBoxes();   // [NUEVO] fusiona los lotes: de ~300 mallas a ~10–15
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
function faceTex(skin, seed) {
  const key = skin + (seed % 3); if (faceCache[key]) return faceCache[key];
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  g.fillStyle = skin; g.fillRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 26, 32, 6);
  g.fillStyle = '#3b2a20'; g.fillRect(6, 10, 7, 2); g.fillRect(19, 10, 7, 2);
  g.fillStyle = '#ffffff'; g.fillRect(7, 13, 6, 5); g.fillRect(19, 13, 6, 5);
  g.fillStyle = seed % 3 === 0 ? '#2a6df4' : seed % 3 === 1 ? '#5a3a1e' : '#1f9d55'; g.fillRect(9, 14, 3, 4); g.fillRect(21, 14, 3, 4);
  g.fillStyle = '#0b0b12'; g.fillRect(10, 15, 2, 2); g.fillRect(22, 15, 2, 2);
  g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(15, 18, 2, 4);
  g.fillStyle = '#7a2e2e'; g.fillRect(11, 25, 10, 2); g.fillStyle = 'rgba(255,255,255,.65)'; g.fillRect(12, 25, 8, 1);
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
  if (style === 5 || style === 7 || style === 1 || style === 0) { // rayo de PixelPlayRusher
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

/* [NUEVO] Modelos 3D reales (Blender, public/models/weapons/*.glb), generados con scripts/generate_weapons.py.
   Solo para las 9 armas «normales» (no AK ni Lince, que tienen geometría propia hecha a mano: culata de madera
   y mira telescópica con zoom, respectivamente — cambiarlas de golpe es más delicado y se deja para más adelante).
   Si el modelo no ha cargado todavía (o falla la carga), el arma se sigue dibujando con cajas, como siempre. */
const GUN_GLTF = {}, GUN_GLB_IDS = ['asalto', 'rafaga', 'torrente', 'trueno', 'sheriff', 'precision', 'duo', 'vortice', 'centinela'];
function preloadGunModels() {
  if (typeof THREE.GLTFLoader !== 'function') return;   // el HTML de un solo archivo sin servidor no puede llegar a los .glb: se queda con las cajas
  const loader = new THREE.GLTFLoader();
  GUN_GLB_IDS.forEach(id => loader.load('models/weapons/' + id + '.glb', gltf => { GUN_GLTF[id] = gltf.scene.children[0]; if (player && WEAPONS[player.wi] && WEAPONS[player.wi].id === id) buildGun(WEAPONS[player.wi]); }, undefined, () => { /* sin conexión a los modelos: se queda con las cajas, sin más */ }));
}
/* Cada pieza del modelo (por su nombre, puesto en Blender) recibe el color que le tocaría en el sistema de cajas:
   «body_rail» es la franja del cajón (antes iba en `acc`); todo lo demás son piezas oscuras, como antes. */
function gunPartColor(partName, wcol, acc, dark) {
  if (partName === 'body') return wcol;
  if (partName === 'body_rail') return acc;
  return dark;
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
  const meshes = []; root.traverse(o => { if (o.isMesh && !o.userData.isOutline && o.material !== OUTLINE_MAT) meshes.push(o); });
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
  if (w.id === 'ak') {
    const steel = '#2b2f3f', wood = sk ? sk.acc : '#9a5522', woodDk = sk ? sk.dark : '#74400f', top = s[1] / 2, ty0 = top + 0.012, rail = '#20242f', zc = -0.16;
    g.add(box(s[0], s[1], 0.36, 0, 0, -0.18, wcol));                                  // cajón de mecanismo
    g.add(box(s[0] * 0.55, 0.012, 0.3, 0, top + 0.006, -0.18, steel));                  // tapa
    g.add(box(0.085, 0.078, 0.22, 0, -0.012, -0.47, wood)); g.add(box(0.066, 0.03, 0.22, 0, 0.045, -0.47, woodDk)); // guardamanos de madera
    g.add(cyl(0.012, 0.012, 0.26, 0, 0.038, -0.49, steel));                             // tubo de gases
    g.add(box(0.035, 0.035, bl, 0, 0.012, -s[2] - bl / 2 + 0.02, steel));               // cañón
    g.add(box(0.045, 0.045, 0.05, 0, 0.012, -s[2] - bl + 0.05, steel));                 // apagallamas
    g.add(box(0.06, 0.13, 0.07, 0, -top - 0.06, -0.08, wood));                          // empuñadura
    const m1 = box(0.05, 0.13, 0.08, 0, -top - 0.075, -0.25, steel); m1.rotation.x = 0.12; g.add(m1); // cargador curvo
    const m2 = box(0.05, 0.11, 0.08, 0, -top - 0.19, -0.27, steel); m2.rotation.x = 0.35; g.add(m2);
    sights(zc, -0.06, -s[2] - bl + 0.02);
  } else if (w.id !== 'lince' && GUN_GLTF[w.id]) {   // [NUEVO] modelo .glb real, ya cargado (nunca para Lince: su mira telescópica con zoom es geometría propia, no se toca esta sesión)
    const model = GUN_GLTF[w.id].clone(true);
    model.children.slice().forEach(part => { if (part.name.startsWith('sight_')) model.remove(part); });
    model.traverse(part => { if (part.isMesh) part.material = gunMat(gunPartColor(part.name, wcol, acc, dark), sk, wcol, acc, dark); });
    g.add(model);
    /* [CORREGIDO] Las miras y el destello se colocan con las medidas REALES del modelo 3D (su cuerpo y la boca del cañón), no con las del
       arma de cajas: en algunas armas (Precisión, Dúo, Centinela) el modelo es más corto y la mira quedaba flotando fuera del arma */
    model.updateMatrixWorld(true);
    const partBox = n => { let o = null; model.traverse(x => { if (!o && x.name === n) o = x; }); return o ? new THREE.Box3().setFromObject(o) : null; };
    const bb = partBox('body') || new THREE.Box3().setFromObject(model), tip = partBox('muzzle') || partBox('barrel') || bb;
    const f0 = bb.min.z, len = bb.max.z - bb.min.z; g.userData.tipZ = tip.min.z;
    if (L.scope) g.add(box(0.05, 0.05, Math.min(L.scope, len * 0.9), 0, bb.max.y + 0.045, f0 + len * 0.5, dark)); else if (opt) sights(f0 + len * 0.7, f0 + len * 0.88, tip.min.z + 0.02); else g.add(box(0.03, 0.04, 0.05, 0, bb.max.y + 0.02, f0 + len * 0.4, dark));
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
  if (!GUN_GLTF[w.id] && L.drum) g.add(box(0.075, 0.075, 0.09, 0, 0, -s[2] * 0.55, dark));
  if (!GUN_GLTF[w.id] && L.pump) g.add(box(0.1, 0.06, 0.16, 0, -0.06, -s[2] - 0.05, dark));
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
function fillCharacter(g, color, wi, seed, skinIdx, opticId, accent) {
  while (g.children.length) g.remove(g.children[0]);
  const shirt = new THREE.Color(color), dark = '#' + shirt.clone().multiplyScalar(0.5).getHexString(), light = '#' + shirt.clone().lerp(new THREE.Color('#ffffff'), 0.45).getHexString();
  const skin = SKINS[(skinIdx == null ? seed : skinIdx) % SKINS.length], pants = PANTS[seed % PANTS.length], boot = '#1c2033', glove = '#1c2236';
  const mk = (p, w, h, d, c, x, y, z, basic) => { const m = new THREE.Mesh(BG(w, h, d), basic ? basicMat(c) : mat(c)); m.position.set(x, y, z); m.castShadow = !basic; p.add(m); return m; };
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.14, 0.78, 0); legR.position.set(0.14, 0.78, 0);
  [legL, legR].forEach(l => { mk(l, 0.25, 0.6, 0.28, pants, 0, -0.3, 0); mk(l, 0.27, 0.06, 0.3, '#3d4566', 0, -0.52, -0.01); mk(l, 0.28, 0.2, 0.37, boot, 0, -0.68, -0.035); mk(l, 0.29, 0.03, 0.39, '#0d101c', 0, -0.775, -0.035); g.add(l); });
  mk(g, 0.58, 0.16, 0.33, pants, 0, 0.82, 0); mk(g, 0.6, 0.07, 0.35, '#3b2f2a', 0, 0.91, 0); mk(g, 0.1, 0.08, 0.02, '#ffdc3a', 0, 0.91, -0.18);
  const style = wi === 8 ? 2 : wi;
  const torso = new THREE.Mesh(BG(0.62, 0.52, 0.36), torsoMat(color, style)); torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  mk(g, 0.7, 0.12, 0.4, accent || dark, 0, 1.36, 0); // hombreras (con el color elegido en el lobby)
  const head = new THREE.Group(); head.position.set(0, 1.4, 0); g.add(head);
  const hm = new THREE.Mesh(BG(0.4, 0.4, 0.4), headMat(skin, seed)); hm.position.y = 0.2; hm.castShadow = true; head.add(hm);
  mk(head, 0.1, 0.1, 0.1, skin, 0, -0.02, 0); // cuello
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
  const aim = new THREE.Group(); aim.position.set(0, 1.25, 0); g.add(aim);
  const w = WEAPONS[wi] || WEAPONS[0];
  const arm = (x, ry, len) => { const a = new THREE.Group(); a.position.set(x, 0, 0); a.rotation.y = ry; mk(a, 0.16, 0.16, len, color, 0, 0, -len / 2 + 0.05); mk(a, 0.17, 0.17, 0.08, dark, 0, 0, -len * 0.55); mk(a, 0.14, 0.14, 0.14, glove, 0, 0, -len + 0.08); aim.add(a); };
  arm(0.38, 0.35, 0.56);
  if (!w.dual) arm(-0.38, -0.5, 0.66); else arm(-0.38, -0.2, 0.56);
  const guns = [];
  if (w.dual) { guns.push(gunModel(w, 0.32)); guns.push(gunModel(w, -0.14)); } else guns.push(gunModel(w, 0.12, opticId));
  guns.forEach(gm => { gm.position.y = -0.04; gm.position.z = -0.3; gm.traverse(o => { if (o.isMesh && o.material.color && o !== gm.userData.flash) o.castShadow = true; }); aim.add(gm); });
  const kn = new THREE.Group(); kn.visible = false; kn.position.set(0.1, -0.02, -0.34);
  { const kb = (x, y, z, px, py, pz, col) => { const m = new THREE.Mesh(BG(x, y, z), mat(col)); m.position.set(px, py, pz); kn.add(m); }; kb(0.03, 0.09, 0.42, 0, 0, -0.24, '#dfe8f7'); kb(0.11, 0.06, 0.04, 0, 0, 0, '#c9973a'); kb(0.05, 0.06, 0.16, 0, 0, 0.1, '#4a2f18'); }
  aim.add(kn); g.userData.knife = kn; g.userData.guns = guns;
  g.userData.legL = legL; g.userData.legR = legR; g.userData.aim = aim; g.userData.head = head; g.userData.flash = guns[0].userData.flash; g.userData.wi = wi;
}
function buildBot(color, wi, seed, skinIdx, accent) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  fillCharacter(g, color, wi || 0, seed || 0, skinIdx, undefined, accent); return g;
}
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
/* Cuchillo en primera persona: el arma baja, el cuchillo sube, corta en diagonal y todo vuelve (0,62 s) */
const knifeG = new THREE.Group(); camera.add(knifeG); knifeG.visible = false;
function buildKnifeModel() {   // hoja, guarda y mango según la skin de cuchillo equipada (por defecto, acero clásico)
  while (knifeG.children.length) knifeG.remove(knifeG.children[0]);
  const K = S.KNIFE_SKINS.find(k => k.id === window.PPR_BP.equipped.knife) || S.KNIFE_SKINS[0];
  { const kb = (x, y, z, px, py, pz, col, rx) => { const m = new THREE.Mesh(BG(x, y, z), mat(col)); m.position.set(px, py, pz); if (rx) m.rotation.x = rx; knifeG.add(m); return m; };
  kb(0.022, 0.07, 0.42, 0, 0, -0.27, K.blade); kb(0.024, 0.014, 0.42, 0, 0.03, -0.27, K.edge);   // hoja de acero y su filo brillante
  kb(0.022, 0.05, 0.05, 0, -0.005, -0.5, K.blade, 0.5); kb(0.02, 0.02, 0.12, 0, 0.032, -0.4, K.base ? '#8ea0bf' : K.edge);   // punta y canal
  kb(0.09, 0.05, 0.03, 0, 0, 0.0, K.guard); kb(0.04, 0.05, 0.16, 0, -0.005, 0.11, K.handle); kb(0.044, 0.02, 0.03, 0, 0.02, 0.09, K.guard); kb(0.044, 0.02, 0.03, 0, 0.02, 0.15, K.guard);   // guarda, mango y remaches
  kb(0.085, 0.085, 0.12, 0, -0.01, 0.12, '#1c2236'); kb(0.1, 0.1, 0.4, 0.01, -0.06, 0.4, '#ff7b00'); }   // guante y manga
}
buildKnifeModel();
knifeG.scale.setScalar(1.5);
let knifeT = 0, pendingMelee = 0, slideK = 0;   // slideK: 0..1 suaviza la cámara y el arma durante el deslizamiento

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
  slot = s; p.reload = 0; pendingMelee = 0; sfx.draw(); updateSlotHud();
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
  { const tk = tkNow(), tx = 'AZUL ' + tk[0] + ' – ' + tk[1] + ' ROJO'; if (hudCache.tk !== tx) { hudCache.tk = tx; el.leadName.innerHTML = '<span class="tsb t0">' + tk[0] + '</span><span class="tsep">–</span><span class="tsb t1">' + tk[1] + '</span>'; } setTxt(el.leadPts, 'lp', 'Tu equipo: ' + TEAMS[me.team].n + ' · meta ' + teamLimit); }
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
    const r = hitscan(origin, d, p, w.range);
    if (r.f) {
      let dm = (r.head && w.head) ? w.head : w.dmg * (r.head ? 2 : 1);
      if (w.fall) dm *= clamp(1 - (r.t - w.fall[0]) / (w.fall[1] - w.fall[0]), w.fall[2], 1);
      burst(r.point, r.head ? '#ff5a5f' : '#ffe9b0', 2, 2.5);
      if (!online) damage(r.f, Math.round(dm), p, r.head, w.name);
    } else if (r.t < w.range) burst(r.point, '#ffe9b0', 3, 2);
    if (i < 3 || w.pellets === 1) tracer(muzzle, r.point, online && player.rl ? '#ffd23f' : '#fff1b8');
  }
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
  p.meleeCd = 0.62; knifeT = 0.0001; pendingMelee = 0.22; p.reload = 0; sfx.draw();   // el golpe llega cuando el cuchillo ya está en mano
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
    knifeG.position.set(0.26 - sl * 0.5, -0.66 + sw * 0.4 + arc * 0.05 + idle, -0.4 - arc * 0.1);
    knifeG.rotation.set(0.3 - sl * 0.85 + arc * 0.2, 0.2 + sl * 0.45, 0.9 - sl * 1.8);
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
  b.textContent = CFG_SERVER ? CFG_SERVER.replace(/^https?:\/\//, '') : location.protocol === 'file:' ? 'Sin servidor' : 'Este equipo'; b.title = CFG_SERVER || 'Dirección del servidor online';
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
  ws.onopen = () => netSend({ t: 'hello', v: 1, n: cfg.name, map: cfg.map, c: cfg.cls, lk: [cfg.look.col, cfg.look.skin], adm: admToken(), inf: cfg.infKey || '', acct: acctToken(), mode: S.MODES[cfg.mode] ? cfg.mode : 'duelo', rk: cfg.ranked && cfg.mode === 'duelo' ? 1 : 0, tm: cfg.wantTeam });
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
    case 'pet': { const pf = net.remotes.get(m.id); if (pf) setPet(pf, m.pt); return; }   // [MASCOTAS] alguien equipó su mascota al entrar
    case 'leave': return removeRemote(m.id);
    case 'spawn': return onNetSpawn(m);
    case 'snap': return onSnap(m);
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
    player = newFighter('Espectador', true, '#ffffff'); player.alive = false; player.id = 0; fighters = [player]; bots = []; net.tk = m.tk || [0, 0]; teamLimit = m.lim || 60; m.players.forEach(addRemote);
    document.body.classList.remove('dead'); simTime = 0; timeLeft = m.tl; $('#menu').hidden = true; $('#end').hidden = true; $('#pause').hidden = true; hud.hidden = true; el.board.hidden = true; el.death.hidden = true; gun.visible = false; document.body.classList.remove('playing'); document.body.classList.add('spectating');
    state = 'spectate'; if (window.PPR_BP.onSpectate) window.PPR_BP.onSpectate(true); return;
  }
  player = newFighter(m.n || cfg.name, true, '#ffc857'); player.rl = m.rl || 0; player.team = m.tm === 1 ? 1 : 0; net.tk = m.tk || [0, 0]; teamLimit = m.lim || 60;
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
  if (def.kind === 'drone') {
    B(0.32, 0.09, 0.32, b, 0, 0, 0); B(0.14, 0.07, 0.14, a, 0, 0.08, 0);
    for (const [x, z] of [[0.21, 0.21], [-0.21, 0.21], [0.21, -0.21], [-0.21, -0.21]]) { B(0.05, 0.05, 0.05, a, x, 0.04, z); B(0.18, 0.015, 0.04, '#e9edf5', x, 0.08, z); }
    B(0.12, 0.06, 0.02, e, 0, 0, -0.17);
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
  g.userData.kind = def.kind; return g;
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
    o.position.y += Math.sin(tt * 3 + o.userData.phase) * 0.05; o.rotation.y = f.yaw + Math.sin(tt * 1.3 + o.userData.phase) * 0.25;
  }
  if (pv.pet) { pv.pet.position.set(0.8, 1.74 + Math.sin(tt * 3) * 0.05, 0.25); pv.pet.rotation.y = tt * 0.9; }   // en la vista previa: fija a la derecha del personaje (si girase con él, taparía la cabeza), girando sobre sí misma
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
  if (net.spec) { net.remotes.forEach(f => { f.alive = false; resetPose(f); f.mesh.visible = false; f.label.visible = false; }); timeLeft = m.tl; teamLimit = m.lim || teamLimit; net.zone = m.zone || null; return; }
  if (!player) return;
  if (m.nb > 0) toast('Sala con bots de relleno: no se dan premios ni estadísticas hasta que haya 2 jugadores reales.');   // [NUEVO]
  net.gl = 0; teamLimit = m.lim || teamLimit; net.zone = m.zone || null; { const ec = $('#endCr'), er = $('#endRank'); if (ec) ec.hidden = true; if (er) er.hidden = true; } if (window.PPR_BP.onMode) window.PPR_BP.onMode(net);
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
  if (net.pingAcc > 2) { net.pingAcc = 0; netSend({ t: 'ping', ts: performance.now(), rtt: net.ping }); }
}

/* =====================================================================
   Flujo de la partida
   ===================================================================== */
function clearFighters() {
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
const TABS = ['maps', 'rank', 'ranks', 'store', 'controls', 'settings'];
function showTab(name) {
  $$('.nav button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.tab === name)));
  TABS.forEach(t => { $('#tab-' + t).hidden = t !== name; });
  $('#lobbyC').hidden = !TABS.includes(name); document.body.classList.toggle('tabopen', TABS.includes(name));   // con un panel abierto se oculta el logo para que no lo tape
  if (name === 'rank') renderLeaderboard();
  if (name === 'ranks') renderRanks();
  if (name === 'store') renderStore();
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
  const can = info.enabled && !!remote, why = !remote ? 'Inicia sesión con una cuenta online (Registro) para comprar PX.' : (!info.enabled ? info.reason : '');
  box.innerHTML = '<div class="storehead"><b>Tienda de PX</b><span>Saldo: <em id="storeBal">' + fmtKr(krTotal()) + ' PX</em></span></div>' + (why ? '<p class="note warn">' + esc(why) + '</p>' : '') +
    '<div class="packs">' + info.packs.map(p => '<div class="pack"><div class="pxn">' + fmtKr(p.px) + '<small>PX</small></div>' + (p.tag ? '<span class="ptag">' + esc(p.tag) + '</span>' : '') + '<button type="button" data-pack="' + esc(p.id) + '"' + (can ? '' : ' disabled') + '>' + fmt.format(p.price / 100) + '</button></div>').join('') + '</div>' +
    '<div id="petsBox"></div>' +
    '<p class="note small">El pago se hace en la página segura de Stripe (tarjeta o PayPal); nunca guardamos tus datos de pago. Los PX solo sirven dentro del juego (colores y recompensas).</p><p id="storeMsg" class="note" role="status"></p>';
  for (const b of box.querySelectorAll('[data-pack]')) b.addEventListener('click', async () => {
    b.disabled = true; $('#storeMsg').textContent = 'Abriendo el pago seguro…';
    try { const j = await acctPost('api/store/checkout', { pack: b.dataset.pack }); (window.__pprNav || (u => { location.href = u; }))(j.url); } catch (e) { $('#storeMsg').textContent = e.message; b.disabled = false; }
  });
  renderPets();   // [MASCOTAS]
}
/* [MASCOTAS] Tienda de mascotas: se compran con PX (los cobra el servidor, que además comprueba que no la tengas ya) */
function petSvg(def) {
  const b = def.body, a = def.acc, e = def.eye, k = def.kind;
  let x = '<rect x="18" y="22" width="28" height="26" fill="' + b + '"/><rect x="18" y="28" width="28" height="5" fill="' + a + '"/>';
  if (k === 'drone') x = '<rect x="12" y="30" width="40" height="10" fill="' + b + '"/><rect x="24" y="24" width="16" height="7" fill="' + a + '"/><rect x="6" y="26" width="16" height="3" fill="#e9edf5"/><rect x="42" y="26" width="16" height="3" fill="#e9edf5"/>';
  else if (k === 'ghost') x = '<rect x="18" y="18" width="28" height="30" fill="' + b + '"/><rect x="18" y="18" width="28" height="4" fill="' + a + '"/><rect x="18" y="48" width="7" height="6" fill="' + b + '"/><rect x="29" y="48" width="7" height="6" fill="' + b + '"/><rect x="40" y="48" width="6" height="6" fill="' + b + '"/>';
  else if (k === 'fox') x = '<rect x="20" y="22" width="24" height="22" fill="' + b + '"/><rect x="21" y="14" width="6" height="9" fill="' + b + '"/><rect x="37" y="14" width="6" height="9" fill="' + b + '"/><rect x="27" y="34" width="10" height="7" fill="' + a + '"/><rect x="44" y="38" width="12" height="6" fill="' + a + '"/>';
  else if (k === 'dragon') x = '<rect x="20" y="22" width="24" height="24" fill="' + b + '"/><rect x="6" y="24" width="14" height="4" fill="' + a + '" transform="rotate(-20 13 26)"/><rect x="44" y="24" width="14" height="4" fill="' + a + '" transform="rotate(20 51 26)"/><rect x="24" y="16" width="4" height="7" fill="' + a + '"/><rect x="36" y="16" width="4" height="7" fill="' + a + '"/>';
  const ey = k === 'drone' ? 33 : k === 'fox' || k === 'dragon' ? 27 : 32;
  return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' + x + '<rect x="' + (k === 'drone' ? 29 : 25) + '" y="' + ey + '" width="' + (k === 'drone' ? 6 : 4) + '" height="5" fill="' + e + '"/>' + (k === 'drone' ? '' : '<rect x="35" y="' + ey + '" width="4" height="5" fill="' + e + '"/>') + '</svg>';
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
function updatePreview() { if (pv.mesh) fillCharacter(pv.mesh, COLORS[cfg.look.col].c, cfg.cls, 1, cfg.look.skin, cfg.optics[WEAPONS[cfg.cls].id]); updateEquip(); }
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
    else if (m.t === 'lobbyok') { document.body.classList.toggle('verified', !!m.rl); chatAdd('sys', '', 'Chat del lobby conectado · ' + m.n + (m.n === 1 ? ' persona' : ' personas') + ' en línea.'); }
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
  chatAdd('sys', '', 'Bienvenido a PixelPlayRusher. Durante la partida, pulsa Enter para escribir.');
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
  $('#eqPlay').addEventListener('click', () => { closeEq(); if (pendingPlay === 'online') startOnline(); else startMatch(); });
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
    net.pingAcc += dt; if (net.pingAcc > 2) { net.pingAcc = 0; netSend({ t: 'ping', ts: performance.now(), rtt: net.ping }); }
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
  pulseNeon();   // [NEÓN]
  if (state === 'menu') renderPreview(dt);
}

if (!cfg.shadowsSet && renderer && isSoftwareGL()) cfg.shadows = false;
buildMap(cfg.map); applyShadows(); initMenu(); resize(); setInterval(() => { if (state === 'menu') checkServer(); }, 15000); buildGun(WEAPONS[cfg.cls]); gun.visible = false;
preloadGunModels();   // [NUEVO] modelos .glb reales: mientras cargan (o si fallan) el arma sigue viéndose con las cajas de siempre
/* Puente para la pantalla del pase de batalla (bp.js) */
Object.assign(window.PPR_BP, { limit: () => teamLimit, cfg, saveCfg, net: () => net, player: () => player, camera: () => camera, scene: () => scene, THREE, startSpectate, stopSpectate, specCycle, setSpecView: v => { net.specView = v; }, gunsOK, setCr: n => { if (remote) { remote.credits = n; renderCr(); } }, S, fmt: fmtKr, esc, toast, acctToken, apiUrl, acctPost, remote: () => remote, showTab, syncRemote, setPx: n => { if (remote) { remote.px = n; renderKr(); } },
  rebuild() { buildKnifeModel(); if (player && state !== 'menu') buildGun(WEAPONS[player.wi]); setPreviewPet(); if ($('#petsBox')) renderPets(); }, weaponName: id => (WEAPONS.find(w => w.id === id) || {}).name || id });
requestAnimationFrame(frame);
})();
