'use strict';
/* Con DATABASE_URL (PostgreSQL) hay que conectar y cargar los datos ANTES de crear el resto (que es síncrono): se inicializa la base y se vuelve a ejecutar este archivo. */
if (process.env.DATABASE_URL && !global.__PPR_DB) {
  const dir = process.env.DATA_DIR || require('path').join(__dirname, 'data');
  require('./server/db.js').initDb({ url: process.env.DATABASE_URL, dataDir: dir, log: m => console.log(new Date().toISOString(), m) })
    .then(db => { global.__PPR_DB = db; delete require.cache[__filename]; require(__filename); })
    .catch(e => { console.error('No se pudo iniciar PostgreSQL:', e.message); process.exit(1); });
  return;
}
/* PixelPlayRusher · servidor online
   - Sirve la carpeta /public
   - WebSocket en /ws (salas por mapa, combate validado por el servidor)
   - API: /api/status y /api/leaderboard
   Configuración por variables de entorno: ver README.md */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
/* Se carga leyendo el archivo (no con require): así funciona aunque algún package.json de public/ lo marque como módulo ES. */
const S = (() => { const mod = { exports: {} }; new Function('module', 'exports', fs.readFileSync(path.join(__dirname, 'public', 'shared.js'), 'utf8')).call(globalThis, mod, mod.exports); return mod.exports; })();
const { createAdmin, Store } = require('./server/admin.js');
const PGDB = global.__PPR_DB || null;   // PostgreSQL (opcional)
if (PGDB) Store.db = PGDB;
const { createAccounts } = require('./server/accounts.js');
const { createBattlePass } = require('./server/battlepass.js');
const { createMarket } = require('./server/market.js');
const { createSocial } = require('./server/social.js');
const { createRanked } = require('./server/ranked.js');
const { createEvents } = require('./server/events.js');
const legal = require('./server/legal.js');
const { createAdminPlus } = require('./server/adminplus.js');
const { createBackup } = require('./server/backup.js');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MATCH_TIME = +process.env.MATCH_TIME || S.CONST.MATCH_TIME;
/* [NAVIDAD] Modo del evento: 10 min, duendes neutrales que huyen y sueltan regalos al caer; gana el equipo con más regalos */
const XMAS_TIME = +process.env.XMAS_TIME || 600;
const XMAS = { elves: 6, hp: 60, walk: 3.2, run: 5.6, flee: 9, drop: 3, killDrop: 1, ttl: 30000, respawn: 6000, pickR: 1.4 };
let elfSeq = 900000, giftSeq = 1;
const KILL_LIMIT = +process.env.KILL_LIMIT || S.CONST.KILL_LIMIT;
const MAX_PER_ROOM = +process.env.MAX_PLAYERS_PER_ROOM || 10;
const BREAK_SECS = +process.env.BREAK_SECS || 12;
/* Equipos: azul (0) y rojo (1). La ronda acaba cuando un equipo suma estas bajas (o al acabar el tiempo: gana quien tenga más). */
const TEAM_LIMIT = +process.env.TEAM_KILL_LIMIT || (process.env.KILL_LIMIT ? KILL_LIMIT : 60);   // [PARTIDAS] 40 → 60: con partidas de 5 min, que no terminen antes por bajas
const KNIFE_LIMIT = +process.env.KNIFE_KILL_LIMIT || 40;   // [NUEVO] bajas para ganar en «Solo cuchillos»
const ZONE_LIMIT = +process.env.ZONE_LIMIT || S.ZONE.LIMIT, ZONE_MOVE = +process.env.ZONE_MOVE_SECS || S.ZONE.MOVE_SECS;   // puntos para ganar en «Capturar zona» y cada cuánto cambia de sitio
const LADDER = S.GUN_LADDER.slice(0, +process.env.LADDER_LEVELS || S.GUN_LADDER.length);   // niveles de armas de la Carrera (acortable solo para pruebas)
/* [NUEVO] Colisiones con paredes: el servidor rechaza posiciones dentro de un muro o que lo atraviesan (WALL_CHECK=0 lo desactiva; solo para pruebas con bots que caminan en línea recta) */
const WALL_CHECK = process.env.WALL_CHECK !== '0';
const AIM_CHECK = process.env.AIM_CHECK === '1';   // [ANTITRAMPAS] 1 = descartar los disparos fuera de la mira; por defecto solo se cuentan (espectador y registro) para vigilar falsos positivos
const AIM_TURN_RATE = +process.env.AIM_TURN_RATE || 25;   // giro máximo (rad/s) que se tolera entre el último estado y el disparo
/* [NUEVO] Emparejamiento clasificatorio con poca gente: una sala con menos de 2 jugadores acepta ligas cada vez más lejanas cuanto más tiempo lleva esperando (+1 liga cada RANKED_WIDEN_SECS, tope 6) */
/* [NUEVO] Bots de relleno: una sala NO clasificatoria con al menos 1 jugador real se completa con bots hasta FILL_BOTS jugadores en total (0 = sin bots). Se van según entran personas reales.
   Los bots juegan con las mismas reglas (armas, daño, muros), pero una ronda con menos de 2 jugadores reales NO da PX, Créditos, XP del pase, estadísticas ni entrada en la clasificación (así no se pueden «granjear»). BOT_SKILL 0–1 (0,5 por defecto) sube su puntería. */
const FILL_BOTS = process.env.FILL_BOTS !== undefined && process.env.FILL_BOTS !== '' ? Math.max(0, +process.env.FILL_BOTS | 0) : 4, BOT_SKILL = Math.min(1, Math.max(0, process.env.BOT_SKILL !== undefined && process.env.BOT_SKILL !== '' ? +process.env.BOT_SKILL : 0.5));
const BOT_NAMES = ['Nova', 'Kraken', 'Pixel', 'Rayo', 'Ciclón', 'Sombra', 'Turbo', 'Cobra', 'Bruno', 'Volt', 'Zeta', 'Titán', 'Brasa', 'Cobalto'];
const BOT_CLASSES = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10];   // sin francotirador: frustra a quien juega solo
const WIDEN_MS = (+process.env.RANKED_WIDEN_SECS || 30) * 1000;
const LEAVE_MIN_MS = +process.env.RANKED_LEAVE_MS || 60000;   // tiempo mínimo jugado para que abandonar un clasificatorio penalice
const MAX_CONN_PER_IP = +process.env.MAX_CONN_PER_IP || 8;
const TRUST_PROXY = process.env.TRUST_PROXY; // '1' = confiar siempre, '0' = nunca, sin definir = solo si la conexión llega desde una red privada (proxy)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const FILE_ORIGIN = process.env.ALLOW_FILE_ORIGIN !== '0';   // [NUEVO] el juego abierto desde un archivo local (pixel-play-rusher.html) manda «Origin: null»: se acepta para poder jugar online desde él (la API usa tokens, no cookies)
const PUBLIC_DIR = path.join(__dirname, 'public');
const RESPAWN_MS = S.CONST.RESPAWN * 1000;
const PROTOCOL = 1;
const HIST_MIN = +process.env.HISTORY_MIN_SECS || 20; // segundos mínimos en una ronda para que cuente en el historial

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = v => Math.round(v * 1000) / 1000;
let admin = null, accounts = null, bp = null, market = null, social = null, ranked = null, events = null, backup = null;
const log = (...a) => { const line = new Date().toISOString() + ' ' + a.join(' '); console.log(line); if (admin) admin.onLog(line); };

/* =====================================================================
   Clasificación global (archivo JSON)
   ===================================================================== */
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');
let lb = { entries: [] };
try { const d = (PGDB && PGDB.get('leaderboard.json')) || JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); if (d && Array.isArray(d.entries)) lb = d; } catch (e) { /* primera ejecución */ }
{ const n0 = lb.entries.length; lb.entries = lb.entries.filter(e => Number.isInteger(e.m) && e.m >= 0 && e.m < S.MAPS.length); if (lb.entries.length !== n0) console.log('[clasificación] se descartaron ' + (n0 - lb.entries.length) + ' entradas de mapas que ya no existen'); }   // [NUEVO] solo queda «Nexus Outpost»
let lbTimer = null;
function lbSaveSoon() {
  if (lbTimer) return;
  lbTimer = setTimeout(() => { lbTimer = null; lbSave(); }, 2000);
}
function lbSave() {
  if (PGDB) { PGDB.put('leaderboard.json', lb); return; }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = LB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(lb));
    fs.renameSync(tmp, LB_FILE);
  } catch (e) { log('No se pudo guardar la clasificación:', e.message); }
}
function lbRecord(e) {
  if (!(e.p > 0)) return;
  const key = e.n.toLowerCase();
  /* [NUEVO] con cuenta (e.a = UUID) la entrada se busca por ID; el nombre solo sirve para jugadores sin cuenta */
  const i = lb.entries.findIndex(x => x.m === e.m && (e.a ? x.a === e.a || (!x.a && x.n.toLowerCase() === key) : !x.a && x.n.toLowerCase() === key));
  if (i >= 0) { if (lb.entries[i].p >= e.p) return; lb.entries[i] = e; } else lb.entries.push(e);
  // conservar como máximo 300 entradas por mapa
  const perMap = {};
  lb.entries.sort((a, b) => b.p - a.p);
  lb.entries = lb.entries.filter(x => (perMap[x.m] = (perMap[x.m] || 0) + 1) <= 300);
  lbSaveSoon();
}
function lbQuery(map) {
  let list;
  if (map >= 0) list = lb.entries.filter(e => e.m === map);
  else { // mejor partida de cada jugador entre todos los mapas
    const best = new Map();
    for (const e of lb.entries) { const k = e.n.toLowerCase(); if (!best.has(k) || best.get(k).p < e.p) best.set(k, e); }
    list = [...best.values()];
  }
  return list.sort((a, b) => b.p - a.p || b.k - a.k).slice(0, 50).map(({ a, ...pub }) => pub);   // [NUEVO] el ID de la cuenta no sale en la clasificación pública
}

/* =====================================================================
   Mundos y salas
   ===================================================================== */
const worlds = S.MAPS.map((_, i) => S.buildWorld(i));
const rooms = new Map();
let roomSeq = 1, playerSeq = 1, chatSeq = 0;

function sanitizeName(s) { return String(s || '').replace(/[^\p{L}\p{N}_ \-]/gu, '').trim().slice(0, 14); }

class Player {
  constructor(ws, name, map, cls, ip, lk, ident) {
    this.role = ident.role; this.nameKey = ident.nameKey; this.ipKey = ident.ipKey; this.shots = 0; this.hits = 0; this.fixes = 0; this.rlv = 0; this.aimv = 0; this.roundStart = Date.now();
    this.lk = lk; this.ws = ws; this.ip = ip; this.id = playerSeq++; this.name = name; this.cls = cls; this.nextCls = cls; this.map = map; this.wantTeam = null;   // [NUEVO] bando elegido al entrar a partida (null = automático)
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.h = 1.8;
    this.hp = 100; this.alive = false; this.ep = 0;
    this.kills = 0; this.deaths = 0; this.points = 0; this.hs = 0; this.streak = 0; this.bestStreak = 0; this.acctUser = null; this.team = 0;
    this.protectUntil = 0; this.respawnAt = 0; this.lastHit = 0; this.lastSt = 0;
    this.cash = S.CONST.SHOP_START_CASH;   // [NUEVO] tienda de armas: dinero de partida, se reinicia cada ronda y se gana matando
    this.ammo = 0; this.reloadUntil = 0; this.nextFire = 0; this.nextMelee = 0;
    this.hist = []; this.ping = 60; this.joinedAt = Date.now(); this.room = null; this.gl = 0; this.mmr = 0;   // gl: nivel en la Carrera de armas · mmr: puntuación clasificatoria
  }
  send(str) {
    const ws = this.ws;
    if (ws.readyState !== 1) return;
    if (ws.bufferedAmount > 1e6) { ws.terminate(); return; }
    ws.send(str);
  }
  pub() {
    return { pt: this.pet || '', sk: this.sk || undefined, id: this.id, n: this.name, c: this.cls, lk: this.lk, k: this.kills, d: this.deaths, p: this.points, alive: this.alive, rl: this.role || 0, tm: this.team, x: r3(this.x), y: r3(this.y), z: r3(this.z), yaw: r3(this.yaw), pitch: r3(this.pitch), h: this.h };
  }
}

function posAt(p, T) {
  const h = p.hist;
  if (!h.length) return { x: p.x, y: p.y, z: p.z, h: p.h };
  if (T <= h[0].t) return h[0];
  for (let i = h.length - 1; i > 0; i--) {
    if (h[i - 1].t <= T) {
      const a = h[i - 1], b = h[i];
      if (T >= b.t) return b;
      const k = (T - a.t) / (b.t - a.t || 1);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, h: b.h };
    }
  }
  return h[h.length - 1];
}

class Room {
  constructor(map, mode, isRanked) {
    this.mode = mode || 'duelo'; this.ranked = !!isRanked; this.specs = new Set(); this.zone = null; this.zs = [0, 0]; this.zoneT = 0; this.zoneMoveAt = 0;   // [NUEVO] modo de juego y clasificatorio
    this.id = roomSeq++; this.map = map; this.world = worlds[map];
    this.tk = [0, 0]; this.chatLog = []; this.players = new Map(); this.tl = MATCH_TIME; this.phase = 'play'; this.breakLeft = 0; this.boardT = 0; this.wait = true;
    rooms.set(this.id, this); this.newZone(Date.now(), true);
    this.elves = new Map(); this.gifts = new Map();   // [NAVIDAD]
    if (this.mode === 'navidad') { this.tl = XMAS_TIME; this.spawnElves(Date.now()); }
  }
  broadcast(obj, except) {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    for (const p of this.players.values()) if (p !== except) p.send(s);
    for (const sp of this.specs) sp.send(s);   // los espectadores reciben todo
  }
  /* ---- [NUEVO] Modos de juego ---- */
  limit() { return this.mode === 'navidad' ? 0 : this.mode === 'zona' ? ZONE_LIMIT : this.mode === 'cuchillos' ? KNIFE_LIMIT : this.mode === 'carrera' ? LADDER.length + 1 : TEAM_LIMIT; }
  classFor(p) { return this.mode === 'carrera' ? LADDER[Math.min(p.gl, LADDER.length - 1)] : p.nextCls; }
  gunsAllowed(p) { return this.mode === 'cuchillos' ? false : this.mode === 'carrera' ? p.gl < LADDER.length : true; }
  /* ---- [NUEVO] Bots de relleno ---- */
  humanCount() { let n = 0; for (const p of this.players.values()) if (!p.isBot) n++; return n; }
  botCount() { return this.players.size - this.humanCount(); }
  fillBots(now) {
    if (this.ranked || !FILL_BOTS) return; const humans = this.humanCount(); if (!humans) return;
    const want = Math.max(0, FILL_BOTS - humans), have = this.botCount();
    if (have < want && now - (this.lastFill || 0) > 700) { this.lastFill = now; this.add(makeBot(this)); }
    else if (have > want) { const b = [...this.players.values()].filter(x => x.isBot).sort((a, c) => (a.alive ? 1 : 0) - (c.alive ? 1 : 0))[0]; if (b) this.remove(b); }   // sobra alguno: se va antes el que está muerto
  }
  los(a, b) { const o = { x: a.x, y: a.y + 1.6, z: a.z }, dx = b.x - o.x, dy = b.y + 1.1 - o.y, dz = b.z - o.z, l = Math.hypot(dx, dy, dz) || 1; return S.rayWorld(this.world.colliders, o, { x: dx / l, y: dy / l, z: dz / l }, l) >= l - 0.25; }
  botThink(b, now, dt) {
    if (this.phase !== 'play' || this.wait) return;
    const e = b.ent, half = this.world.half - 0.35, R = Math.random;
    if (b.epSeen !== b.ep) { b.epSeen = b.ep; e.pos.x = b.x; e.pos.y = b.y; e.pos.z = b.z; e.vel.x = e.vel.y = e.vel.z = 0; b.tgt = null; b.wp = null; b.stuckD = null; b.reactAt = now + 600 + R() * 600; }   // acaba de reaparecer
    if (now >= (b.scanAt || 0)) {   // cada 0,3 s: el rival vivo más cercano al que ve
      b.scanAt = now + 300; let best = null, bd = 55;
      for (const o of this.players.values()) if (o !== b && o.alive && o.team !== b.team && o.protectUntil <= now) { const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd && this.los(b, o)) { best = o; bd = d; } }
      if (best !== b.tgt) { b.tgt = best; b.reactAt = now + 350 + R() * 450 * (1.3 - BOT_SKILL); }   // tarda un poco en reaccionar al ver a alguien
    }
    const t = b.tgt && b.tgt.alive ? b.tgt : null, w = S.WEAPONS[b.cls], knife = !this.gunsAllowed(b);
    let gx = e.pos.x, gz = e.pos.z, gy = null, speed = S.CONST.WALK * (knife ? 0.95 : 0.8), strafe = false;   // [PR3] gy: altura del objetivo (null = suelo, como antes)
    if (t) { const d = Math.hypot(t.x - e.pos.x, t.z - e.pos.z); gx = t.x; gz = t.z; gy = t.y; if (!knife && d < 11) strafe = true; else if (!knife && d < 18 && now >= b.reactAt) speed *= 0.6; }
    else if (this.mode === 'zona' && this.zone) { gx = this.zone.x + Math.cos(b.id * 1.7) * 2; gz = this.zone.z + Math.sin(b.id * 1.7) * 2; gy = this.zone.y || null; if (Math.hypot(gx - e.pos.x, gz - e.pos.z) < 1.5 && Math.abs((this.zone.y || 0) - e.pos.y) < 1) speed = 0; }   // [PR3] la zona puede estar en una azotea: gy guía la subida por la escalera, y solo se para si además ya está a esa altura
    else {
      if (!b.wp || Math.hypot(b.wp[0] - e.pos.x, b.wp[1] - e.pos.z) < 2 || now > b.wpT) {
        const wps = this.world.waypoints; let pool = wps;
        if (R() < 0.7) {   // [NUEVO] casi siempre rondan cerca del rival vivo más cercano (oyen los disparos): así se encuentran aunque las bases estén lejos
          let foe = null, fd = Infinity; for (const o of this.players.values()) if (o !== b && o.alive && o.team !== b.team) { const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < fd) { fd = d; foe = o; } }
          if (foe) { const near = wps.filter(w => Math.hypot(w[0] - foe.x, w[1] - foe.z) < 16); if (near.length) pool = near; }
        }
        b.wp = pool[Math.floor(R() * pool.length)]; b.wpT = now + 6000 + R() * 5000;
      }
      gx = b.wp[0]; gz = b.wp[1];
    }
    let dx = gx - e.pos.x, dz = gz - e.pos.z;
    if (!t && this.world.nav) {
      const dir = S.navDir(this.world.nav, S.navField(this.world.nav, gx, gz, gy), e.pos.x, e.pos.z, e.pos.y); if (dir) { dx = dir[0]; dz = dir[1]; }
      /* [PR3] a veces, en el borde de una escalera, la ruta oscila entre dos celdas sin avanzar de verdad: si no se acerca en 1,2 s, se rompe el bucle saltando y desviando un poco */
      const d2 = Math.hypot(gx - e.pos.x, gz - e.pos.z) + Math.abs((gy || 0) - e.pos.y) * 2;
      if (b.stuckD == null || d2 < b.stuckD - 0.3) { b.stuckD = d2; b.stuckAt = now; }
      else if (now - (b.stuckAt || now) > 1200) { b.stuckAt = now; b.stuckD = d2; if (e.onGround) e.vel.y = S.CONST.JUMP * 0.9; const a = (R() - 0.5) * 2.4, ca = Math.cos(a), sa = Math.sin(a); const ndx = dx * ca - dz * sa, ndz = dx * sa + dz * ca; dx = ndx; dz = ndz; }
    }
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    if (strafe) { if (now >= (b.strafeT || 0)) { b.strafeDir = R() < 0.5 ? 1 : -1; b.strafeT = now + 700 + R() * 900; } const px = -dz * b.strafeDir, pz = dx * b.strafeDir; dx = px * 0.9 + dx * 0.15; dz = pz * 0.9 + dz * 0.15; }
    e.vel.x = dx * speed; e.vel.z = dz * speed;
    if (S.moveEntity(this.world.colliders, e, dt)) { b.wp = null; b.strafeDir = -(b.strafeDir || 1); if (e.onGround && R() < 0.6) e.vel.y = S.CONST.JUMP * 0.9; }   // chocó con una pared: cambia de camino y a veces salta
    b.x = clamp(e.pos.x, -half, half); b.y = e.pos.y; b.z = clamp(e.pos.z, -half, half); e.pos.x = b.x; e.pos.z = b.z;
    const fx = t ? t.x - b.x : e.vel.x, fz = t ? t.z - b.z : e.vel.z; if (Math.hypot(fx, fz) > 0.01) b.yaw = Math.atan2(-fx, -fz);
    b.pitch = t ? Math.atan2(t.y + 1.1 - (b.y + 1.6), Math.hypot(t.x - b.x, t.z - b.z)) : 0; b.h = 1.8;
    b.hist.push({ t: now, x: b.x, y: b.y, z: b.z, h: b.h }); while (b.hist.length && now - b.hist[0].t > 1500) b.hist.shift();
    if (!t || now < b.reactAt) return;
    const d3 = { x: t.x - b.x, y: t.y + 1.1 - (b.y + 1.6), z: t.z - b.z }, dist = Math.hypot(d3.x, d3.y, d3.z) || 1;
    if (knife) { if (dist < 2.3 && now >= b.nextMelee) this.onMelee(b, { d: [d3.x / dist, d3.y / dist, d3.z / dist] }, now); return; }
    if (b.ammo <= 0) { if (now >= b.reloadUntil) { b.reloadUntil = now + w.reload * 900; b.ammo = w.mag; } return; }
    if (now < b.reloadUntil || now < b.nextFire - 20 || R() > 0.55 + 0.35 * BOT_SKILL) return;
    const err = (1 - BOT_SKILL) * 0.05 + w.spread * (1 - 0.4 * BOT_SKILL), dirs = [];
    for (let k = 0; k < w.pellets; k++) { const ex = (R() - 0.5) * 2 * err, ey = (R() - 0.5) * 2 * err, dd = { x: d3.x / dist + ex, y: d3.y / dist + ey, z: d3.z / dist + (R() - 0.5) * 2 * err }, l = Math.hypot(dd.x, dd.y, dd.z); dirs.push([dd.x / l, dd.y / l, dd.z / l]); }
    this.onShoot(b, { d: dirs }, now);
  }
  noteLone() { if (this.players.size < 2) { if (!this.loneSince) this.loneSince = Date.now(); } else this.loneSince = 0; }   // desde cuándo espera rival
  tierSpan() { return this.players.size < 2 && this.loneSince ? Math.min(6, 1 + Math.floor((Date.now() - this.loneSince) / WIDEN_MS)) : 1; }
  /* [NUEVO] ¿Este movimiento es imposible por las paredes? 'dentro' = acaba dentro de un muro · 'muro' = lo atraviesa en un solo paso */
  wallViolation(p, x, y, z, h, dt) { const w = this.world; return S.wallViolation(w.colliders, w.inset || (w.inset = S.insetColliders(w.colliders, 0.3)), p, x, y, z, h); }
  tierAvg() { let n = 0, s = 0; for (const p of this.players.values()) { n++; s += S.leagueIdx(p.mmr); } return n ? s / n : 0; }
  gunLevel(p) { p.cls = p.nextCls = this.classFor(p); p.ammo = S.WEAPONS[p.cls].mag; p.reloadUntil = 0; p.send(JSON.stringify({ t: 'gg', lv: p.gl, c: p.cls })); }
  ladderScore() { this.tk = [0, 1].map(t => { let m = 0; for (const p of this.players.values()) if (p.team === t) m = Math.max(m, p.gl); return m; }); }
  newZone(now, first) {
    if (this.mode !== 'zona') { this.zone = null; return; }
    const wps = this.world.waypoints, half = this.world.half, zs = this.world.zones; let pick, py = 0, pn = '';
    if (zs && zs.length) {   // [NUEVO] mapa con zonas propias (Nexus Outpost): rota entre ellas; con bots en la sala solo las de suelo, porque ellos no suben a las azoteas
      const ground = this.botCount() > 0 ? zs.filter(z => !z.y) : zs, list = ground.length ? ground : zs;
      let z0; if (first || !this.zone) z0 = list[0]; else { const other = list.filter(z => z.x !== this.zone.x || z.z !== this.zone.z); const c = other.length ? other : list; z0 = c[Math.floor(Math.random() * c.length)]; }
      pick = [z0.x, z0.z]; py = z0.y || 0; pn = z0.n || '';
    } else if (first || !this.zone) pick = wps.reduce((b, w) => (Math.hypot(w[0], w[1]) < Math.hypot(b[0], b[1]) ? w : b), wps[0]);   // la primera, lo más cerca posible del centro
    else { const far = wps.filter(w => Math.hypot(w[0] - this.zone.x, w[1] - this.zone.z) >= 20 && Math.abs(w[0]) < half - 8 && Math.abs(w[1]) < half - 8); const pool = far.length ? far : wps; pick = pool[Math.floor(Math.random() * pool.length)]; }
    this.zone = { x: pick[0], z: pick[1], y: py, n: pn, r: S.ZONE.R, o: -1 }; this.zoneMoveAt = now + ZONE_MOVE * 1000; this.zoneT = 0;
    if (!first) this.broadcast({ t: 'zone', z: this.zoneMsg() });
  }
  zoneMsg() { return this.zone ? { x: r3(this.zone.x), z: r3(this.zone.z), y: this.zone.y || 0, n: this.zone.n || '', r: this.zone.r, o: this.zone.o, zs: [Math.floor(this.zs[0]), Math.floor(this.zs[1])], mv: Math.max(0, Math.round((this.zoneMoveAt - Date.now()) / 1000)) } : null; }
  zoneTick(now, dt) {
    const z = this.zone; if (!z) return;
    const inZ = p => p.alive && Math.hypot(p.x - z.x, p.z - z.z) <= z.r && Math.abs(p.y - (z.y || 0)) <= 2.6;   // [NUEVO] también cuenta la altura: quien está debajo de una azotea no captura
    const n = [0, 0]; for (const p of this.players.values()) if (inZ(p)) n[p.team]++;
    const o = n[0] && !n[1] ? 0 : n[1] && !n[0] ? 1 : n[0] && n[1] ? 2 : -1;   // 0/1 = la controla ese equipo · 2 = disputada · -1 = vacía
    if (o === 0 || o === 1) {
      this.zs[o] += dt; this.tk[o] = Math.floor(this.zs[o]);
      for (const p of this.players.values()) if (p.team === o && inZ(p)) { p.zt = (p.zt || 0) + dt; if (p.zt >= 1) { p.zt -= 1; p.points += 10; } }   // 10 puntos por segundo dentro
      if (this.tk[o] >= ZONE_LIMIT) { this.endRound(now); return; }
    }
    if (o !== z.o) { z.o = o; this.zoneT = 0; }
    this.zoneT -= dt; if (this.zoneT <= 0) { this.zoneT = 0.5; this.broadcast({ t: 'zone', z: this.zoneMsg() }); }
    if (now >= this.zoneMoveAt) this.newZone(now);
  }
  /* ---------- [NAVIDAD] duendes y regalos ---------- */
  spawnElves(now) {
    this.elves.clear();
    for (let i = 0; i < XMAS.elves; i++) { const e = { isElf: true, id: elfSeq++, alive: true, hp: XMAS.hp, yaw: 0, respawnAt: 0 }; this.placeElf(e); this.elves.set(e.id, e); }
    this.broadcast({ t: 'elves', e: [...this.elves.keys()] });
  }
  randomSpot() { const w = this.world.waypoints; const p = w[Math.floor(Math.random() * w.length)]; return [p[0], p[1]]; }
  placeElf(e) {
    const [x, z] = this.randomSpot(); e.x = x; e.y = 0; e.z = z; e.tgt = this.randomSpot(); e.best = Infinity; e.bestAt = 0; e.fleeAt = 0;
    e.ent = { pos: { x, y: 0, z }, vel: { x: 0, y: 0, z: 0 }, hw: 0.28, h: 1.1, onGround: true };
  }
  xmasTick(now, dt) {
    const nav = this.world.nav, alive = [...this.players.values()].filter(p => p.alive);
    for (const e of this.elves.values()) {
      if (!e.alive) { if (now >= e.respawnAt) { e.alive = true; e.hp = XMAS.hp; this.placeElf(e); } continue; }
      let near = null, nd = Infinity; for (const p of alive) { const d = Math.hypot(p.x - e.x, p.z - e.z); if (d < nd) { nd = d; near = p; } }
      const fleeing = nd < XMAS.flee;
      if (fleeing && now >= e.fleeAt) {   // huye hacia el punto más lejano del jugador entre unos cuantos al azar
        let best = null, bd = -1; for (let k = 0; k < 6; k++) { const c = this.randomSpot(), d = Math.hypot(c[0] - near.x, c[1] - near.z); if (d > bd) { bd = d; best = c; } }
        e.tgt = best; e.fleeAt = now + 1200; e.best = Infinity;
      }
      const dt2 = Math.hypot(e.tgt[0] - e.x, e.tgt[1] - e.z);
      if (dt2 < 1.4) { e.tgt = this.randomSpot(); e.best = Infinity; }
      if (dt2 < e.best - 0.4) { e.best = dt2; e.bestAt = now; } else if (now - e.bestAt > 2500) { e.tgt = this.randomSpot(); e.best = Infinity; e.bestAt = now; }   // atascado: otro destino
      let dir = nav ? S.navDir(nav, S.navField(nav, e.tgt[0], e.tgt[1], 0), e.x, e.z, e.y) : null;
      if (!dir) { const l = dt2 || 1; dir = [(e.tgt[0] - e.x) / l, (e.tgt[1] - e.z) / l]; }
      const sp = fleeing ? XMAS.run : XMAS.walk, l = Math.hypot(dir[0], dir[1]) || 1;
      e.ent.vel.x = dir[0] / l * sp; e.ent.vel.z = dir[1] / l * sp;
      S.moveEntity(this.world.colliders, e.ent, dt);
      e.x = e.ent.pos.x; e.y = e.ent.pos.y; e.z = e.ent.pos.z; e.yaw = Math.atan2(dir[0], dir[1]);
    }
    for (const g of this.gifts.values()) {
      if (now > g.exp) { this.gifts.delete(g.id); this.broadcast({ t: 'gdel', id: g.id }); continue; }
      for (const p of alive) if (Math.hypot(p.x - g.x, p.z - g.z) < XMAS.pickR && Math.abs(p.y - g.y) < 1.6) {
        this.gifts.delete(g.id); p.gifts = (p.gifts || 0) + 1; this.tk[p.team]++;
        this.broadcast({ t: 'gpick', id: g.id, p: p.id, n: p.gifts, tk: this.tk }); break;
      }
    }
  }
  dropGifts(x, y, z, n, now) {
    const add = [];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = n > 1 ? 0.6 + Math.random() * 0.6 : 0; const g = { id: giftSeq++, x: r3(x + Math.cos(a) * r), y: r3(y), z: r3(z + Math.sin(a) * r), exp: now + XMAS.ttl }; this.gifts.set(g.id, g); add.push([g.id, g.x, g.y, g.z]); }
    this.broadcast({ t: 'gadd', g: add });
  }
  giftList() { return [...this.gifts.values()].map(g => [g.id, g.x, g.y, g.z]); }
  elfDamage(e, a, amount, head, now) {
    if (!e.alive || this.phase !== 'play') return;
    e.hp -= amount; const killed = e.hp <= 0;
    a.send(JSON.stringify({ t: 'hit', v: e.id, h: head ? 1 : 0, d: amount, k: killed ? 1 : 0, elf: 1 }));
    if (!killed) return;
    e.alive = false; e.respawnAt = now + XMAS.respawn; a.points += 50;
    this.broadcast({ t: 'ekill', id: e.id, k: a.id });
    this.dropGifts(e.x, e.y, e.z, XMAS.drop, now);
  }
  onKill(a, v, wname, now) {
    if (this.mode === 'navidad') { this.dropGifts(v.x, v.y, v.z, XMAS.killDrop, now); return; }   // [NAVIDAD] las bajas no suman: suman los regalos
    if (this.mode === 'zona') return;                                    // en la zona mandan los puntos de zona, no las bajas
    if (this.mode === 'carrera') {
      const last = LADDER.length, knife = wname === 'Cuchillo';
      if (a.gl >= last && knife) { this.tk[a.team] = last + 1; this.endRound(now); return; }   // baja con el cuchillo en el último nivel: gana su equipo
      if (a.gl < last) { a.gl++; this.gunLevel(a); }
      if (knife && v.gl > 0) { v.gl--; v.send(JSON.stringify({ t: 'gg', lv: v.gl, c: this.classFor(v), down: 1 })); }   // te matan a cuchillo: bajas de nivel
      this.ladderScore(); return;
    }
    this.tk[a.team]++;
    if (this.tk[a.team] >= this.limit()) this.endRound(now);
  }
  assignTeam(p) {
    let c0 = 0, c1 = 0; for (const o of this.players.values()) { if (o === p) continue; if (o.team === 0) c0++; else c1++; }
    if (p.wantTeam === 0 || p.wantTeam === 1) { const want = p.wantTeam, other = 1 - want, wc = want === 0 ? c0 : c1, oc = want === 0 ? c1 : c0;
      if (wc <= oc + 1) { p.team = want; return; } }   // [NUEVO] se respeta el bando elegido, salvo que ya le saque más de un jugador de ventaja al otro
    p.team = c0 < c1 ? 0 : c1 < c0 ? 1 : (Math.random() < 0.5 ? 0 : 1);
  }
  /* Entre rondas se compensan los equipos si alguien se ha marchado (diferencia máxima de 1 jugador) */
  rebalance() {
    const t = [[], []]; for (const p of this.players.values()) t[p.team].push(p);
    while (Math.abs(t[0].length - t[1].length) >= 2) {
      const from = t[0].length > t[1].length ? 0 : 1, i = Math.floor(Math.random() * t[from].length), p = t[from].splice(i, 1)[0];
      p.team = 1 - from; t[1 - from].push(p); this.broadcast({ t: 'team', id: p.id, tm: p.team });
    }
  }
  add(p) {
    p.room = this; this.assignTeam(p); this.players.set(p.id, p); this.noteLone();
    p.send(JSON.stringify({ t: 'welcome', v: PROTOCOL, id: p.id, n: p.name, rl: p.role || 0, tm: p.team, lim: this.limit(), mode: this.mode, rk: this.ranked ? 1 : 0, zone: this.zoneMsg(), tk: this.tk, room: this.id, g: this.mode === 'navidad' ? this.giftList() : undefined, el: this.mode === 'navidad' ? [...this.elves.keys()] : undefined, map: this.map, cash: p.cash, shop: S.SHOP, tl: r3(this.tl), phase: this.phase, players: [...this.players.values()].filter(o => o !== p).map(o => o.pub()) }));
    this.broadcast({ t: 'join', p: p.pub() }, p);
    this.spawn(p, Date.now(), 1500);
    this.sendBoard();
  }
  remove(p) {
    if (!this.players.delete(p.id)) return; this.noteLone();
    if (this.votes) this.votes.delete(p.id);
    if (this.phase === 'play') { if (p.kills + p.deaths > 0 && Date.now() - p.joinedAt > 60000) this.record(p, Date.now()); this.history(p, Date.now()); }
    this.broadcast({ t: 'leave', id: p.id });
    if (this.ranked && this.phase === 'play' && this.players.size >= 2 && p.acctUser && Date.now() - p.roundStart > LEAVE_MIN_MS && this.tl > 20) { const m = ranked.onLeave(p); log('Clasificatorio: ' + p.name + ' abandona y pierde ' + S.RANKED.LEAVE_PENALTY + ' puntos (' + m + ')'); }
    if (this.humanCount() === 0 && this.specs.size === 0) rooms.delete(this.id);   // una sala solo con bots no tiene sentido
    else this.sendBoard();
  }
  record(p, now) {
    if (p.isBot) return;   // los bots no entran en la clasificación
    lbRecord({ n: p.name, p: p.points, k: p.kills, d: p.deaths, h: p.hs, c: S.WEAPONS[p.cls].name, m: this.map, t: now, r: p.role || 0, a: p.acctUser ? p.acctUser.id : undefined });
  }
  /* Historial de partidas para analizar el comportamiento (un registro por jugador y ronda) */
  history(p, now) {
    if (p.isBot) return;
    const dur = Math.round((now - p.roundStart) / 1000);
    if (dur < HIST_MIN || (p.shots === 0 && p.kills + p.deaths === 0 && p.fixes === 0 && p.rlv === 0)) return; // sin actividad: no se registra
    admin.recordMatch({ ts: now, room: this.id, map: this.map, name: p.name, nameKey: p.nameKey, ipKey: p.ipKey, cls: p.cls, cn: S.WEAPONS[p.cls].name, dur, k: p.kills, d: p.deaths, hs: p.hs, shots: p.shots, hits: p.hits, pts: p.points, fixes: p.fixes, rlv: p.rlv, role: p.role || 0 });
    p.shots = p.hits = p.fixes = p.rlv = 0; p.roundStart = now;
  }
  sendBoard() {
    this.broadcast({ t: 'board', tk: this.tk, b: [...this.players.values()].map(p => [p.id, p.kills, p.deaths, p.points]) });
  }
  spawn(p, now, protectMs) {
    const base = this.world.spawns && this.world.spawns[p.team], wps = base || this.world.waypoints;   // [NUEVO] con bases (Nexus Outpost) cada equipo aparece en la suya
    let best = wps[0], bs = -1;
    for (let i = 0; i < (base ? base.length * 2 : 40); i++) {
      const s = base ? base[i % base.length] : wps[Math.floor(Math.random() * wps.length)];
      let md = Infinity;
      for (const o of this.players.values()) if (o !== p && o.alive && (!base || o.team !== p.team)) md = Math.min(md, Math.hypot(o.x - s[0], o.z - s[1]));
      const score = Math.min(md, 60) + Math.random() * 10;
      if (score > bs) { bs = score; best = s; }
    }
    p.x = best[0]; p.y = 0; p.z = best[1]; p.yaw = Math.atan2(best[0], best[1]); p.pitch = 0; p.h = 1.8;
    p.hp = 100; p.alive = true; p.ep++; p.cls = this.classFor(p);
    const w = S.WEAPONS[p.cls];
    p.ammo = w.mag; p.reloadUntil = 0; p.nextFire = now + 300; p.protectUntil = now + (protectMs || 1500); p.lastHit = now; p.lastSt = now;
    p.hist = [{ t: now, x: p.x, y: p.y, z: p.z, h: p.h }];
    this.broadcast({ t: 'spawn', id: p.id, x: r3(p.x), y: 0, z: r3(p.z), yaw: r3(p.yaw), ep: p.ep, c: p.cls, hp: 100 });
  }
  tick(now, dt) {
    this.fillBots(now);
    if (this.phase === 'play') {
      this.wait = this.players.size < 2;
      if (!this.wait) { this.tl -= dt; this.zoneTick(now, dt); }
      if (this.mode === 'navidad') this.xmasTick(now, dt);   // [NAVIDAD]
      for (const p of this.players.values()) {
        if (!p.alive) { if (now >= p.respawnAt) this.spawn(p, now, 1500); }
        else if (now - p.lastHit > 4000 && p.hp < 100) p.hp = Math.min(100, p.hp + 18 * dt);
        if (p.isBot && p.alive) this.botThink(p, now, dt);
      }
      if (this.tl <= 0) this.endRound(now);
    } else {
      this.breakLeft -= dt;
      if (this.breakLeft <= 0) this.startRound(now);
    }
    // instantánea del estado (20 Hz)
    const arr = [];
    for (const p of this.players.values()) if (p.alive) arr.push([p.id, r3(p.x), r3(p.y), r3(p.z), r3(p.yaw), r3(p.pitch), r3(p.h)]);
    const sStr = JSON.stringify(arr), tl = Math.max(0, Math.round(this.tl * 10) / 10), w = this.wait ? 1 : 0;
    const eStr = this.mode === 'navidad' ? ',"e":' + JSON.stringify([...this.elves.values()].map(e => [e.id, r3(e.x), r3(e.y), r3(e.z), r3(e.yaw), e.alive ? 1 : 0])) : '';   // [NAVIDAD] duendes
    for (const p of this.players.values()) p.send('{"t":"snap","tl":' + tl + ',"w":' + w + ',"hp":' + Math.round(p.hp) + ',"s":' + sStr + eStr + '}');
    for (const sp of this.specs) sp.send('{"t":"snap","tl":' + tl + ',"w":' + w + ',"hp":0,"s":' + sStr + eStr + '}');
    if (this.specs.size && (this.specT = (this.specT || 0) + dt) >= 1) {   // cada segundo, estadísticas de cada jugador para el espectador: [id, disparos, aciertos, cabezas, correcciones, cadencia sospechosa, ping, vida, nivel de la Carrera, disparos fuera de la mira]
      this.specT = 0; const st = JSON.stringify({ t: 'sstats', p: [...this.players.values()].map(p => [p.id, p.shots, p.hits, p.hs, p.fixes, p.rlv, Math.round(p.ping), p.hp > 0 ? Math.round(p.hp) : 0, p.gl, p.aimv]) });
      for (const sp of this.specs) sp.send(st);
    }
    this.boardT += dt; if (this.boardT >= 1) { this.boardT = 0; this.sendBoard(); }
  }
  endRound(now) {
    if (this.phase !== 'play') return;
    this.phase = 'break'; this.breakLeft = BREAK_SECS;
    const tk = this.tk.slice(), winner = tk[0] === tk[1] ? -1 : (tk[0] > tk[1] ? 0 : 1);
    const rows = [...this.players.values()].sort((a, b) => b.points - a.points || b.kills - a.kills || a.deaths - b.deaths);
    const real = rows.filter(p => !p.isBot).length, nb = rows.length - real, rewarded = real >= 2;   // con menos de 2 jugadores reales no hay premios ni estadísticas
    for (const p of rows) { if (!rewarded) break; if (p.kills + p.deaths > 0) this.record(p, now); this.history(p, now); }
    if (this.ranked) for (const [p, r] of ranked.onRoundEnd(rows, winner)) p.send(JSON.stringify(Object.assign({ t: 'rank' }, r)));   // [NUEVO] puntuación clasificatoria
    rows.forEach((p, i) => { // progreso y PX de las cuentas online (mínimo 2 jugadores y algo de actividad)
      if (!p.acctUser || !rewarded || p.kills + p.deaths + p.points === 0) return;
      const r = accounts.awardMatch(p.acctUser, { points: p.points, kills: p.kills, deaths: p.deaths, won: winner >= 0 && p.team === winner, cls: p.cls, bestStreak: p.bestStreak, ev: events.multFor({ mode: this.mode, cls: p.cls }) });
      p.send(JSON.stringify({ t: 'award', px: r.px, balance: r.balance, prevBest: r.prevBest, stats: r.stats, mult: r.mult, cr: r.cr, crBalance: r.crBalance, ev: r.ev }));
      bp.awardMatch(p.acctUser, { points: p.points, won: winner >= 0 && p.team === winner }).then(x => { if (x) p.send(JSON.stringify({ t: 'bpxp', xp: x.added, total: x.xp, level: x.level, up: x.leveledUp })); }).catch(e => log('XP del pase: ' + e.message));
    });
    this.votes = new Map();
    this.broadcast({ t: 'end', maps: S.MAPS.map(m => m.name), cur: this.map, nb, rw: rewarded, next: BREAK_SECS, tw: winner, tk, res: rows.map(p => [p.id, p.name, p.kills, p.deaths, p.points, p.hs, p.cls, p.role || 0, p.team]) });
  }
  tally() { const v = S.MAPS.map(() => 0); for (const x of (this.votes || new Map()).values()) v[x]++; return v; }
  startRound(now) {
    const votes = this.tally(), top = Math.max(...votes);          // el mapa más votado gana; en empate, al azar entre los empatados
    if (top > 0) { const win = votes.map((n, i) => (n === top ? i : -1)).filter(i => i >= 0), pick = win[Math.floor(Math.random() * win.length)]; if (pick !== this.map) { this.map = pick; this.world = worlds[pick]; this.broadcast({ t: 'map', map: pick }); } }
    this.phase = 'play'; this.tl = MATCH_TIME; this.tk = [0, 0]; this.zs = [0, 0]; this.newZone(now, true); this.rebalance();
    if (this.mode === 'navidad') { this.tl = XMAS_TIME; this.gifts.clear(); this.broadcast({ t: 'gclr' }); this.spawnElves(now); }   // [NAVIDAD]
    for (const p of this.players.values()) { p.kills = p.deaths = p.points = p.hs = p.streak = p.bestStreak = p.gifts = 0; p.gl = 0; p.zt = 0; p.alive = false; p.roundStart = now; p.cash = S.CONST.SHOP_START_CASH; p.send(JSON.stringify({ t: 'cash', cash: p.cash })); }
    this.broadcast({ t: 'round', tl: this.tl, lim: this.limit(), zone: this.zoneMsg(), nb: this.botCount() });
    for (const p of this.players.values()) this.spawn(p, now, 4000);
    this.sendBoard();
  }

  /* --- Combate --- */
  hitscan(shooter, o, d, maxT, T, now) {
    let bestT = S.rayWorld(this.world.colliders, o, d, maxT), who = null, head = false;
    if (this.mode === 'navidad') for (const e of this.elves.values()) {   // [NAVIDAD] los duendes son neutrales: les puede dar cualquiera
      if (!e.alive) continue;
      const th = S.raySphere(o, d, { x: e.x, y: e.y + 0.92, z: e.z }, 0.22), tb = S.rayCyl(o, d, e.x, e.z, 0.3, e.y, e.y + 0.75);
      if (th < bestT && th <= tb + 0.05) { bestT = th; who = e; head = true; } else if (tb < bestT) { bestT = tb; who = e; head = false; }
    }
    for (const v of this.players.values()) {
      if (v === shooter || v.team === shooter.team || !v.alive || v.protectUntil > now) continue;   // sin fuego amigo: los disparos atraviesan a los compañeros
      const pp = posAt(v, T);
      const th = S.raySphere(o, d, { x: pp.x, y: pp.y + pp.h - 0.22, z: pp.z }, 0.27);
      const tb = S.rayCyl(o, d, pp.x, pp.z, 0.38, pp.y, pp.y + pp.h - 0.4);
      if (th < bestT && th <= tb + 0.05) { bestT = th; who = v; head = true; }
      else if (tb < bestT) { bestT = tb; who = v; head = false; }
    }
    return { t: bestT, who, head };
  }
  damage(v, a, amount, head, wname, now) {
    if (v.isElf) return this.elfDamage(v, a, amount, head, now);   // [NAVIDAD]
    if (!v.alive || this.phase !== 'play' || v.team === a.team) return;
    v.hp -= amount; v.lastHit = now;
    const killed = v.hp <= 0;
    if (killed) a.cash += S.CONST.SHOP_KILL_CASH;   // [NUEVO] recompensa de la tienda de armas por cada baja
    a.send(JSON.stringify({ t: 'hit', v: v.id, h: head ? 1 : 0, d: amount, k: killed ? 1 : 0, cash: killed ? a.cash : undefined }));
    v.send(JSON.stringify({ t: 'hurt', hp: Math.max(0, Math.round(v.hp)), d: Math.round(amount), ax: r3(a.x), az: r3(a.z) }));   // [NUEVO] d = daño recibido (para la viñeta y la sacudida)
    if (!killed) return;
    v.alive = false; v.hp = 0; v.deaths++; v.streak = 0; v.respawnAt = now + RESPAWN_MS;
    a.kills++; a.streak++; if (a.streak > a.bestStreak) a.bestStreak = a.streak;
    const pts = 100 + (head ? 50 : 0); a.points += pts; if (head) { a.hs++; }
    this.broadcast({ t: 'kill', kr: a.role || 0, k: a.id, v: v.id, w: wname, h: head ? 1 : 0, pts, streak: a.streak, rs: S.CONST.RESPAWN, ds: Math.round(Math.hypot(a.x - v.x, a.z - v.z)), ah: Math.round(a.hp) });   // ds = distancia (m) y ah = vida del autor, para la cámara de muerte
    this.onKill(a, v, wname, now);
    this.sendBoard();
  }
  onShoot(p, m, now) {
    if (!p.alive || this.phase !== 'play' || !this.gunsAllowed(p)) return;   // [NUEVO] sin armas de fuego en «Solo cuchillos» ni en el último nivel de la Carrera
    const w = S.WEAPONS[p.cls];
    if (now < p.reloadUntil || p.ammo <= 0) return;
    if (now + 40 < p.nextFire) { p.rlv++; return; }
    p.nextFire = Math.max(p.nextFire, now - 30) + w.interval * 1000;
    p.ammo--; p.shots++;
    if (!Array.isArray(m.d) || m.d.length < 1) return;
    const eye = { x: p.x, y: p.y + p.h - 0.2, z: p.z };
    let o = eye;
    if (Array.isArray(m.o) && m.o.length === 3 && m.o.every(Number.isFinite) && Math.hypot(m.o[0] - eye.x, m.o[1] - eye.y, m.o[2] - eye.z) < 2.5) o = { x: m.o[0], y: m.o[1], z: m.o[2] };
    if (!p.isBot && !this.aimOk(p, w, m.d.slice(0, w.pellets), now)) {   // [ANTITRAMPAS] disparo fuera del cono del arma respecto a donde mira el jugador (silent aim, sin dispersión forzada fuera de rango…)
      p.aimv++; if (p.aimv % 25 === 1) log('Posible disparo fuera de la mira: ' + p.name + ' · ' + p.aimv + ' veces');
      if (AIM_CHECK) return;
    }
    const T = now - clamp(p.ping / 2 + 100, 100, 450);
    const agg = new Map(); let firstEnd = null;
    for (const dd of m.d.slice(0, w.pellets)) {
      if (!Array.isArray(dd) || dd.length !== 3 || !dd.every(Number.isFinite)) continue;
      const len = Math.hypot(dd[0], dd[1], dd[2]); if (len < 1e-6) continue;
      const d = { x: dd[0] / len, y: dd[1] / len, z: dd[2] / len };
      const r = this.hitscan(p, o, d, w.range, T, now);
      if (!firstEnd) firstEnd = [r3(o.x + d.x * r.t), r3(o.y + d.y * r.t), r3(o.z + d.z * r.t)];
      if (r.who) {
        let dm = (r.head && w.head) ? w.head : w.dmg * (r.head ? 2 : 1);
        if (w.fall) dm *= clamp(1 - (r.t - w.fall[0]) / (w.fall[1] - w.fall[0]), w.fall[2], 1);
        const a = agg.get(r.who) || { dmg: 0, head: false };
        a.dmg += Math.round(dm); a.head = a.head || r.head; agg.set(r.who, a);
      }
    }
    if (agg.size) p.hits++;
    if (firstEnd) this.broadcast({ t: 'shot', id: p.id, rl: p.role || 0, o: [r3(o.x), r3(o.y), r3(o.z)], e: firstEnd, c: p.cls }, p);
    for (const [v, a] of agg) this.damage(v, p, a.dmg, a.head, w.name, now);
  }
  /* [ANTITRAMPAS] Cada perdigón debe salir dentro del cono máximo del arma alrededor de la mira (yaw/pitch del último estado).
     El cliente manda su estado justo antes de disparar; para clientes antiguos se añade un margen por el giro desde ese estado. */
  aimOk(p, w, dirs, now) {
    const cp = Math.cos(p.pitch), ax = -Math.sin(p.yaw) * cp, ay = Math.sin(p.pitch), az = -Math.cos(p.yaw) * cp;
    const cone = Math.atan(Math.max(w.spread * 2, w.scopedSpread || 0)) + 0.03 + AIM_TURN_RATE * clamp((now - p.lastSt) / 1000, 0, 0.1);
    for (const dd of dirs) {
      if (!Array.isArray(dd) || dd.length !== 3 || !dd.every(Number.isFinite)) continue;
      const len = Math.hypot(dd[0], dd[1], dd[2]); if (len < 1e-6) continue;
      if (Math.acos(clamp((dd[0] * ax + dd[1] * ay + dd[2] * az) / len, -1, 1)) > cone) return false;
    }
    return true;
  }
  onMelee(p, m, now) {
    if (!p.alive || this.phase !== 'play' || now < p.nextMelee) return;
    p.nextMelee = now + 480;
    this.broadcast({ t: 'melee', id: p.id }, p);   // los demás ven el cuchillo
    if (!Array.isArray(m.d) || m.d.length !== 3 || !m.d.every(Number.isFinite)) return;
    const len = Math.hypot(m.d[0], m.d[1], m.d[2]); if (len < 1e-6) return;
    const o = { x: p.x, y: p.y + p.h - 0.2, z: p.z }, d = { x: m.d[0] / len, y: m.d[1] / len, z: m.d[2] / len };
    const r = this.hitscan(p, o, d, 2.9, now - clamp(p.ping / 2 + 100, 100, 450), now);
    if (r.who) this.damage(r.who, p, 60, false, 'Cuchillo', now);
  }
  onState(p, m, now) {
    if (!p.alive || m.ep !== p.ep) return;
    const x = +m.x, y = +m.y, z = +m.z, yaw = +m.yaw, pitch = +m.pitch, h = +m.h;
    if (![x, y, z, yaw, pitch, h].every(Number.isFinite)) return;
    const half = this.world.half - 0.35;
    const dt = Math.max(0.02, (now - p.lastSt) / 1000);
    const dh = Math.hypot(x - p.x, z - p.z);
    if (dh > (S.MOVE.MAX_H + 0.5) * dt + 2 || y - p.y > 12 * dt + 2.5) {   // [AJUSTE] el tope horizontal sale de S.MOVE.MAX_H (slide hop incluido) // movimiento imposible: recolocar al jugador
      p.fixes++; p.ep++; p.send(JSON.stringify({ t: 'fix', x: r3(p.x), y: r3(p.y), z: r3(p.z), ep: p.ep })); return;
    }
    if (WALL_CHECK) {
      const why = this.wallViolation(p, clamp(x, -half, half), clamp(y, 0, 60), clamp(z, -half, half), clamp(h, 1.2, 1.8), dt);
      if (why) { p.fixes++; p.walls = (p.walls || 0) + 1; p.ep++; p.send(JSON.stringify({ t: 'fix', x: r3(p.x), y: r3(p.y), z: r3(p.z), ep: p.ep })); if (p.walls % 25 === 1) log('Posible atravesar paredes (' + why + '): ' + p.name + ' · ' + p.walls + ' veces'); return; }
    }
    p.lastSt = now;
    p.x = clamp(x, -half, half); p.z = clamp(z, -half, half); p.y = clamp(y, 0, 60);
    p.yaw = yaw; p.pitch = clamp(pitch, -1.6, 1.6); p.h = clamp(h, 1.2, 1.8);
    p.hist.push({ t: now, x: p.x, y: p.y, z: p.z, h: p.h });
    while (p.hist.length && now - p.hist[0].t > 1500) p.hist.shift();
  }
}
/* [NUEVO] Un bot de relleno: es un Player sin conexión (send no hace nada) al que la sala mueve y hace disparar */
function makeBot(room) {
  const used = new Set([...room.players.values()].map(p => p.name)), name = BOT_NAMES.find(n => !used.has(n)) || 'Bot' + (10 + Math.floor(Math.random() * 90));
  const b = new Player({ readyState: 3 }, name, room.map, BOT_CLASSES[Math.floor(Math.random() * BOT_CLASSES.length)], '0.0.0.0', [Math.floor(Math.random() * 4), Math.floor(Math.random() * 3)], { role: 0, nameKey: 'bot:' + name, ipKey: '' });
  b.isBot = true; b.ping = 0; b.epSeen = -1; b.strafeDir = 1; b.ent = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, hw: 0.35, h: 1.8, onGround: true };
  return b;
}
function findRoom(map, mode, isRanked, tier) {
  let best = null, bestD = 0; mode = mode || 'duelo'; isRanked = !!isRanked; const max = admin.settings.maxPerRoom || MAX_PER_ROOM;
  /* [NUEVO] Emparejamiento: mismo modo y, en clasificatorio, una liga media parecida (diferencia máxima de 1, que sube con la espera de una sala con menos de 2 jugadores).
     Entre las salas válidas se elige la de liga más cercana y, a igualdad, la más llena. */
  for (const r of rooms.values()) {
    if (r.map !== map || r.mode !== mode || r.ranked !== isRanked || r.humanCount() >= max) continue;   // los bots no ocupan sitio: se van si hace falta
    const d = isRanked && r.players.size ? Math.abs(r.tierAvg() - tier) : 0;
    if (isRanked && r.players.size && d > r.tierSpan()) continue;
    if (!best || d < bestD - 1e-9 || (Math.abs(d - bestD) < 1e-9 && r.humanCount() > best.humanCount())) { best = r; bestD = d; }
  }
  return best || new Room(map, mode, isRanked);
}

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
  for (const r of [...rooms.values()]) { try { r.tick(now, dt); } catch (e) { log('Error en sala', r.id, e); } }
}, 50);

/* =====================================================================
   Servidor HTTP
   ===================================================================== */
const MIME = { '.webmanifest': 'application/manifest+json; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
let CDN_ORIGIN = ''; try { if (process.env.AVATAR_CDN_URL) CDN_ORIGIN = ' ' + new URL(process.env.AVATAR_CDN_URL).origin; } catch (e) { /* dirección no válida: se ignora */ }   // [NUEVO] el CDN de las fotos de perfil también puede servir imágenes
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:" + CDN_ORIGIN + "; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

function isPrivateAddr(a) {
  a = String(a || '').replace(/^::ffff:/, '');
  return a === '::1' || /^127\./.test(a) || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a) || /^f[cd]/i.test(a);
}
function clientIp(req) {
  const remote = req.socket.remoteAddress || '?';
  const trust = TRUST_PROXY === '1' || (TRUST_PROXY !== '0' && isPrivateAddr(remote));
  if (trust) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
  return remote;
}
const apiHits = new Map();
setInterval(() => apiHits.clear(), 60000).unref();

/* [SEO] Dirección pública del juego para canonical, Open Graph, robots.txt y sitemap: PUBLIC_URL si está definida (recomendado),
   si no, el dominio con el que se ha pedido la página */
const SITE_URL = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
function siteUrl(req) {
  if (SITE_URL) return SITE_URL;
  const host = String(req.headers.host || '').replace(/[^A-Za-z0-9.:\-\[\]]/g, '') || 'localhost';
  const https = req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  return (https ? 'https' : 'http') + '://' + host;
}
function json(res, obj, code, origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (origin && (ALLOWED_ORIGINS.includes(origin) || (FILE_ORIGIN && origin === 'null'))) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
  res.writeHead(code || 200, h);
  res.end(JSON.stringify(obj));
}
/* [NUEVO] Aviso de almacenamiento: en plataformas que borran el disco al reiniciar o redesplegar (Render, Railway, Fly…) las cuentas guardadas en archivos se PIERDEN si no hay PostgreSQL ni un disco persistente (DATA_DIR) */
/* [RAILWAY] ¿Se pierden los datos al redesplegar? En Railway, el Dockerfile ya pone DATA_DIR=/data, así que antes este aviso no saltaba
   nunca: /data solo se conserva si hay un volumen montado ahí. Railway lo indica en RAILWAY_VOLUME_MOUNT_PATH. */
const ON_RAILWAY = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
const railVolOk = () => { const v = process.env.RAILWAY_VOLUME_MOUNT_PATH; if (!v) return false; const d = path.resolve(DATA_DIR), m = path.resolve(v); return d === m || d.startsWith(m + path.sep); };
const EPHEMERAL_HOST = PGDB ? '' : ON_RAILWAY ? (railVolOk() ? '' : 'RAILWAY_ENVIRONMENT')
  : !process.env.DATA_DIR ? ['RENDER', 'DYNO', 'FLY_APP_NAME', 'K_SERVICE', 'VERCEL', 'NETLIFY'].find(k => process.env[k]) || '' : '';
if (EPHEMERAL_HOST) console.log(new Date().toISOString(), '¡ATENCIÓN! Detectada la plataforma (' + EPHEMERAL_HOST + ') sin DATABASE_URL ni un disco persistente montado en ' + DATA_DIR + ': las cuentas, los PX y las compras se guardan en un disco que allí se BORRA al reiniciar o redesplegar. Configura DATABASE_URL (PostgreSQL) o un disco persistente con DATA_DIR.');
function status() {
  return { mail: accounts.mailOn(), terms: process.env.REQUIRE_TERMS !== '0', storage: { mode: PGDB ? 'postgres' : 'archivos', warn: !!EPHEMERAL_HOST, platform: EPHEMERAL_HOST }, protocol: PROTOCOL, admin: admin.adminUser, accounts: true, store: accounts.storeInfo().enabled, bp: true, market: true, social: true, db: PGDB ? 'postgres' : 'archivos', players: [...connections].filter(w => w.player).length, lobby: lobby.size, rooms: [...rooms.values()].map(r => ({ id: r.id, map: r.map, players: r.players.size })) };
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); return res.end(); }
  if (url.pathname.startsWith('/api/admin/')) { admin.handleHttp(req, res, url, clientIp(req)); return; } // API de administración (GET y POST)
  if (accounts.handles(url.pathname)) { accounts.handleHttp(req, res, url, clientIp(req)); return; }       // cuentas, PX y tienda
  if (bp.handles(url.pathname)) { bp.handleHttp(req, res, url, clientIp(req)); return; }                   // pase de batalla
  if (market.handles(url.pathname)) { market.handleHttp(req, res, url, clientIp(req)); return; }           // [NUEVO] mercado
  if (events.handles(url.pathname)) { events.handleHttp(req, res, url, clientIp(req)); return; }           // [NUEVO] eventos activos
  if (ranked.handles(url.pathname)) { ranked.handleHttp(req, res, url, clientIp(req)); return; }           // [NUEVO] clasificatorio
  if (social.handles(url.pathname)) { social.handleHttp(req, res, url, clientIp(req)); return; }           // [NUEVO] perfiles y amigos
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const p = url.pathname;
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('ok'); }   // [NUEVO] para el control de salud del hosting
  if (p === '/robots.txt') {   // [SEO] los buscadores pueden indexar el juego, pero no el panel ni la API
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    return res.end('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ' + siteUrl(req) + '/sitemap.xml\n');
  }
  if (p === '/sitemap.xml') {
    const base = siteUrl(req), u = (loc, pr) => '<url><loc>' + base + loc + '</loc><priority>' + pr + '</priority></url>';
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + u('/', '1.0') + u('/privacidad', '0.3') + u('/terminos', '0.3') + '</urlset>\n');
  }
  if (p === '/privacidad' || p === '/terminos') {   // [NUEVO] páginas legales (con los datos del titular de LEGAL_OWNER / LEGAL_EMAIL)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
    return res.end(p === '/privacidad' ? legal.privacy(process.env) : legal.terms(process.env));
  }
  if (p.startsWith('/api/')) {
    const ip = clientIp(req), n = (apiHits.get(ip) || 0) + 1; apiHits.set(ip, n);
    const origin = req.headers.origin;
    if (n > 120) return json(res, { error: 'demasiadas peticiones' }, 429, origin);
  if (p === '/api/status') return json(res, status(), 200, origin);
    if (p === '/api/leaderboard') {
      const map = url.searchParams.get('map'); const m = map === null ? -1 : parseInt(map, 10);
      // el tic de verificado se calcula al servir la lista: así lo ven todos, también en partidas antiguas
      return json(res, { entries: lbQuery(Number.isInteger(m) && m >= 0 && m < S.MAPS.length ? m : -1).map(e => Object.assign({}, e, { r: admin.roleOf(e.n) || e.r || 0 })) }, 200, origin);
    }
    return json(res, { error: 'no encontrado' }, 404, origin);
  }
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  // archivos estáticos de /public (sin salir de la carpeta)
  let rel = p === '/' ? '/index.html' : p === '/admin' ? '/admin.html' : p;
  rel = path.normalize(decodeURIComponent(rel)).replace(/^([/\\])+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || rel.split(/[/\\]/).some(s => s.startsWith('.'))) { res.writeHead(404); return res.end('No encontrado'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    headers['Cache-Control'] = rel.startsWith('vendor') ? 'public, max-age=86400' : 'no-cache';
    if (ext === '.html') headers['Content-Security-Policy'] = CSP;
    if (rel === 'admin.html') headers['X-Robots-Tag'] = 'noindex, nofollow';
    if (rel === 'index.html') data = Buffer.from(data.toString('utf8').split('__SITE_URL__').join(siteUrl(req)));   // [SEO] direcciones absolutas de canonical, Open Graph y Twitter
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

/* =====================================================================
   WebSocket
   ===================================================================== */
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
const connections = new Set();

/* [NUEVO] Identidad de los jugadores sin cuenta: nombre libre para invitados y sesión única por cuenta */
function freeGuestName(base) {
  base = String(base || 'Jugador').slice(0, 10);
  for (let i = 0; i < 40; i++) { const n = base + '_' + (100 + Math.floor(Math.random() * 900)); if (!accounts.nameTaken(n) && !admin.isReserved(n)) return n; }
  return 'Jugador' + (Date.now() % 100000);
}
function kickOtherSessions(acctId, except) {
  for (const w of connections) if (w !== except && w.acctId === acctId && w.readyState === 1) { try { w.send(JSON.stringify({ t: 'err', m: 'Tu cuenta se ha abierto en otra pestaña o dispositivo.' })); w.close(); } catch (e) { /* ya cerrado */ } }
}
const lobby = new Set();
const perIp = new Map();
const cleanChat = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
const lobbyBroadcast = obj => { const str = JSON.stringify(obj); for (const w of lobby) if (w.readyState === 1) w.send(str); };
const allPlayers = () => [...connections].filter(w => w.player).map(w => w.player);
function chatEmit(scope, msg) { // envía un mensaje de chat al lobby, a una sala o a todos
  if (scope === 'lobby' || scope === 'all') lobbyBroadcast(msg);
  if (scope === 'all') { for (const r of rooms.values()) r.broadcast(msg); return; }
  if (scope.startsWith('room:')) { const r = rooms.get(+scope.slice(5)); if (r) r.broadcast(msg); }
}
admin = createAdmin({
  dataDir: DATA_DIR, log, S,
  rt: {
    players: allPlayers, playerCount: () => allPlayers().length, lobbyCount: () => lobby.size, lobbyClients: () => [...lobby], connectionCount: () => connections.size, rooms: () => [...rooms.values()],
    findPlayer: (id, name) => allPlayers().find(p => p.id === +id) || (name ? allPlayers().find(p => p.nameKey === admin.nameKey(name)) : null) || null,
    kick(target, msg) { const w = target.ws || target; try { if (w.readyState === 1) w.send(JSON.stringify({ t: 'err', m: msg })); } catch (e) { /* cerrado */ } setTimeout(() => { try { w.close(); } catch (e) { /* cerrado */ } }, 60); },
    notify(target, obj) { const w = target.ws || target; if (w.readyState === 1) w.send(JSON.stringify(obj)); },
    broadcast(obj) { lobbyBroadcast(obj); for (const r of rooms.values()) r.broadcast(obj); },
    endRound: id => { const r = rooms.get(id); if (r) r.endRound(Date.now()); },
    closeRoom(id, msg) { const r = rooms.get(id); if (r) for (const p of [...r.players.values()]) this.kick(p, msg); },
    roomChat: id => { const r = rooms.get(id); return r ? r.chatLog.slice() : []; },
    chatDelete: m => chatEmit(m.scope, { t: 'chatdel', i: m.id }),
    adminSay(name, text, scope) { const id = ++chatSeq, msg = { t: 'chat', i: id, n: name, m: text, rl: 'admin' }; chatEmit(scope, msg); admin.onChat({ id, ts: Date.now(), scope, name, role: 'admin', text, shown: text, flagged: false }); return id; },
    lbAll: () => lb.entries.slice(),
    lbRemove(name) { const k = String(name).toLowerCase(), n = lb.entries.length; lb.entries = lb.entries.filter(e => e.n.toLowerCase() !== k); lbSaveSoon(); return n - lb.entries.length; },
    lbClear() { const n = lb.entries.length; lb.entries = []; lbSaveSoon(); return n; },
    exit(code) { lbSave(); admin.flushAll(); accounts.flush(); bp.flush(); finish(code); }
  }
});
accounts = createAccounts({ dataDir: DATA_DIR, log, S, admin });
bp = createBattlePass({ S, accounts, admin, db: PGDB, dataDir: DATA_DIR, log });
market = createMarket({ S, accounts, bp, admin, dataDir: DATA_DIR, log });   // [NUEVO] mercado de cosméticos (Créditos)
/* [NUEVO] Presencia de una cuenta: 'game' si está en una partida, 'lobby' si está en el menú, 'off' si no está conectada */
function presence(uid) { let best = 'off'; for (const w of connections) if (w.acctId === uid && w.readyState === 1) { if (w.player) return 'game'; best = 'lobby'; } return best; }
social = createSocial({ S, accounts, admin, bp, db: PGDB, dataDir: DATA_DIR, log, presence, rankedOf: u => (ranked ? ranked.publicOf(u) : null) });
ranked = createRanked({ S, accounts, admin, dataDir: DATA_DIR, log });   // [NUEVO] clasificatorio y temporadas
events = createEvents({ S, accounts, admin, dataDir: DATA_DIR, log });   // [NUEVO] eventos temporales
/* [NUEVO] Al eliminar una cuenta (pasado su plazo) se limpia todo lo suyo en los demás módulos */
/* [NUEVO] Panel: verificados por nombre, monedas, ventas, cuentas y «antes de lanzar». Al verificar (o quitar) a alguien conectado, su rol cambia al instante. */
createAdminPlus({ admin, accounts, S, log, env: process.env, getStatus: () => status(), onVerified: u => { for (const w of connections) if (w.acctId === u.id) { const nm = w.player ? w.player.name : w.lobbyName, r = w.role === 'admin' ? 'admin' : admin.roleOf(nm) || 0; w.role = r; if (w.player) w.player.role = r; } } });
accounts.onRemove(async u => { await bp.store.deleteUser(u.id); await social.removeAvatar(u); market.removeUser(u); lb.entries = lb.entries.filter(e => e.a !== u.id); lbSaveSoon(); });
backup = createBackup({ db: PGDB, dataDir: DATA_DIR, admin, log, flush: async () => { lbSave(); admin.flushAll(); await accounts.flush(); await bp.flush(); } });   // [NUEVO] copias de seguridad automáticas
/* [NUEVO] Si una cuenta cambia de nombre, sus entradas de la clasificación cambian con ella (siguen a su ID; las antiguas, sin ID, se reconocen por el nombre viejo) */
accounts.hooks.onRename = (u, old) => { const ok = old.toLowerCase(); let n = 0; for (const e of lb.entries) if (e.a === u.id || (!e.a && e.n.toLowerCase() === ok)) { e.a = u.id; e.n = u.username; n++; } if (n) lbSaveSoon(); };
if (PGDB) { admin.flushAll(); accounts.flush(); lbSave(); }   // primer arranque con PostgreSQL: lo importado de archivos pasa ya a la base de datos

server.on('upgrade', (req, socket, head) => {
  const reject = code => { socket.write('HTTP/1.1 ' + code + '\r\nConnection: close\r\n\r\n'); socket.destroy(); };
  const isAdminWs = /^\/admin-ws(\?|$)/.test(req.url);
  if (!isAdminWs && !/^\/ws(\?|$)/.test(req.url)) return reject('404 Not Found');
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { ok = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.includes(origin) : new URL(origin).host === req.headers.host; } catch (e) { ok = false; }
    if (!ok && FILE_ORIGIN && origin === 'null' && !isAdminWs) ok = true;   // partida desde un archivo local (no el panel de administración)
    if (!ok) return reject('403 Forbidden');
  }
  const ip = clientIp(req);
  if (isAdminWs) return admin.handleUpgrade(req, socket, head, ip);
  if ((perIp.get(ip) || 0) >= MAX_CONN_PER_IP) return reject('429 Too Many Requests');
  wss.handleUpgrade(req, socket, head, ws => { ws.ip = ip; wss.emit('connection', ws, req); });
});

wss.on('connection', ws => {
  const ip = ws.ip;
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  connections.add(ws);
  ws.alive = true; ws.player = null; ws.rl = { t: Date.now(), n: 0 };
  ws.pingSeq = 0; ws.pingSent = new Map();
  ws.on('pong', data => {
    ws.alive = true;
    const t = ws.pingSent.get(String(data)); if (t === undefined) return;   // solo cuentan los pings de medición que envió el servidor
    ws.pingSent.delete(String(data));
    if (ws.player) { const rtt = clamp(Date.now() - t, 0, 1000); ws.player.ping = ws.player.pingMeasured ? ws.player.ping * 0.7 + rtt * 0.3 : rtt; ws.player.pingMeasured = true; }
  });
  const helloTimer = setTimeout(() => { if (!ws.player && !ws.lobbyName) ws.close(1008, 'hello'); }, +process.env.HELLO_TIMEOUT_MS || 20000);   // [AJUSTE] 20 s (antes 5): un equipo lento tarda en enviar el saludo mientras carga los gráficos
  ws.on('message', data => {
    const now = Date.now();
    if (now - ws.rl.t > 1000) { ws.rl.t = now; ws.rl.n = 0; }
    if (++ws.rl.n > 200) return ws.terminate();
    let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    try { onMessage(ws, m, now); } catch (e) { log('Error procesando mensaje:', e.message); }
  });
  ws.on('close', () => {
    clearTimeout(helloTimer); connections.delete(ws); lobby.delete(ws);
    const n = (perIp.get(ip) || 1) - 1; if (n <= 0) perIp.delete(ip); else perIp.set(ip, n);
    if (ws.player && ws.player.room) ws.player.room.remove(ws.player);
    if (ws.spec) { const r = ws.spec.room; r.specs.delete(ws.spec); if (!r.players.size && !r.specs.size) rooms.delete(r.id); }
  });
  ws.on('error', () => {});
});
setInterval(() => {
  for (const ws of connections) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) { /* cerrado */ } }
}, 20000).unref();
/* [ANTITRAMPAS] Ping medido por el servidor (antes lo decía el cliente y un tramposo podía declarar 1000 ms para rebobinar más los impactos).
   Los navegadores responden solos a los ping del protocolo WebSocket; el contenido es un número de secuencia que solo conoce el servidor. */
function measurePing() {
  const now = Date.now();
  for (const ws of connections) {
    if (!ws.player || ws.readyState !== 1) continue;
    for (const [k, t] of ws.pingSent) if (now - t > 10000) ws.pingSent.delete(k);   // pongs perdidos
    const k = String(++ws.pingSeq); ws.pingSent.set(k, now);
    try { ws.ping(k); } catch (e) { ws.pingSent.delete(k); }
  }
}
setInterval(measurePing, 2000).unref();

function onMessage(ws, m, now) {
  if (m.t === 'hello') {
    if (ws.player || ws.spec) return;
    if (m.v !== PROTOCOL) { ws.send(JSON.stringify({ t: 'err', m: 'Versión antigua del juego. Recarga la página.' })); return ws.close(); }
    if (m.spec === 1) {   // [NUEVO] Espectador (solo administrador): ve una sala en directo sin jugar, con estadísticas para detectar trampas
      if (admin.roleOfToken(typeof m.adm === 'string' ? m.adm.slice(0, 80) : '') !== 'admin') { ws.send(JSON.stringify({ t: 'err', m: 'Solo un administrador puede espectar.' })); return ws.close(); }
      const room = rooms.get(+m.room); if (!room) { ws.send(JSON.stringify({ t: 'err', m: 'Esa sala ya no existe.' })); return ws.close(); }
      const sp = { spec: true, ws, name: 'Espectador', room, send: s => { if (ws.readyState === 1 && ws.bufferedAmount < 1e6) ws.send(s); } };
      ws.spec = sp; room.specs.add(sp); admin.count('spec');
      sp.send(JSON.stringify({ t: 'welcome', v: PROTOCOL, spec: 1, id: 0, n: 'Espectador', rl: 'admin', tm: 0, lim: room.limit(), mode: room.mode, rk: room.ranked ? 1 : 0, zone: room.zoneMsg(), tk: room.tk, room: room.id, map: room.map, tl: r3(room.tl), phase: room.phase, players: [...room.players.values()].map(o => o.pub()) }));
      return;
    }
    const acct = accounts.fromToken(typeof m.acct === 'string' ? m.acct : '');   // con cuenta online el nombre mostrado es el actual de la cuenta; la identidad real es su ID
    const wanted = acct ? acct.username : (sanitizeName(m.n) || 'Jugador' + (100 + Math.floor(Math.random() * 900)));
    const who = { adm: typeof m.adm === 'string' ? m.adm.slice(0, 80) : '', inf: typeof m.inf === 'string' ? m.inf.slice(0, 40) : '', ip: ws.ip };
    let idt = admin.resolveIdentity(Object.assign({ name: wanted }, who));
    if (!idt.ok) { ws.send(JSON.stringify({ t: 'err', m: idt.error })); return ws.close(); }
    /* [MEJORA] Un invitado (o alguien con la sesión caducada) que pide el nombre de una cuenta registrada YA NO se rechaza ni se le cierra la conexión:
       juega con un nombre libre parecido y se le avisa. Así el nombre registrado sigue siendo de su dueño y nadie se queda sin poder entrar. */
    let renamedNote = '';
    if (!acct && !idt.role && accounts.nameTaken(idt.name)) { const g = freeGuestName(idt.name); idt = admin.resolveIdentity(Object.assign({ name: g }, who)); if (!idt.ok) { ws.send(JSON.stringify({ t: 'err', m: idt.error })); return ws.close(); } renamedNote = '«' + wanted + '» es el nombre de una cuenta registrada. Juegas como «' + idt.name + '». Inicia sesión para usar el tuyo.'; }
    if (acct) kickOtherSessions(acct.id, ws);   // [NUEVO] una cuenta = una sesión de juego: la más reciente sustituye a la anterior
    ws.acctId = acct ? acct.id : null;
    const map = Number.isInteger(m.map) && m.map >= 0 && m.map < S.MAPS.length ? m.map : 0;
    const cls = Number.isInteger(m.c) && m.c >= 0 && m.c < S.WEAPONS.length ? m.c : 0;
    const lk = Array.isArray(m.lk) && m.lk.length === 2 && m.lk.every(Number.isInteger) ? [clamp(m.lk[0], 0, 15), clamp(m.lk[1], 0, 4)] : null;
    if (lk) {   // [RANGOS] el color que ven los demás: con cuenta, solo uno que tengas; sin cuenta, nunca uno exclusivo de rango
      const c = lk[0], exclusive = c >= S.COLOR_COSTS.length || S.COLOR_COSTS[c] === null;
      if (acct ? !(acct.unlocked || []).includes(c) : exclusive) lk[0] = 0;
    }
    if (acct && acct.verified && !idt.role) idt = Object.assign({}, idt, { role: 'inf' });   // [NUEVO] cuenta verificada por el administrador: tic azul y beneficios sin clave
    const p = new Player(ws, idt.name, map, cls, ws.ip, lk, idt);
    p.wantTeam = m.tm === 0 || m.tm === 1 ? m.tm : null;   // [NUEVO] bando elegido al entrar a partida
    p.acctUser = acct || null;   // [CORREGIDO] antes era `acct && !idt.role`: un influencer o administrador con cuenta jugaba desvinculado y no recibía PX, estadísticas, XP del pase ni clasificación por ID
    admin.count('join'); admin.count('class', cls); admin.count('map', map);
    const mode = S.MODES[m.mode] ? m.mode : 'duelo', wantRanked = m.rk === 1 && mode === 'duelo'; admin.count('mode', wantRanked ? 'clasificatorio' : mode);
    if (m.rk === 1 && !wantRanked) { ws.send(JSON.stringify({ t: 'err', m: 'El clasificatorio solo se juega en Duelo por equipos.' })); return ws.close(); }
    if (wantRanked && !acct) { ws.send(JSON.stringify({ t: 'err', m: 'Para jugar el clasificatorio necesitas una cuenta online.' })); return ws.close(); }
    p.mmr = acct ? ranked.mmrOf(acct) : 0;
    ws.player = p; lobby.delete(ws);
    const joinedRoom = findRoom(map, mode, wantRanked, S.leagueIdx(p.mmr)); joinedRoom.add(p);
    if (acct && bp && bp.equippedLook) bp.equippedLook(acct.id).then(sk => { if (!sk || !Object.keys(sk).length || !p.room) return; p.sk = sk; p.room.broadcast({ t: 'look', id: p.id, sk }); }).catch(() => {});   // [SKINS VISIBLES] las skins las decide el inventario, no el cliente
    if (acct && bp && bp.equippedPet) bp.equippedPet(acct.id).then(pet => { if (!pet || !p.room) return; p.pet = pet; p.room.broadcast({ t: 'pet', id: p.id, pt: pet }); }).catch(() => {});   // [NUEVO] mascota: la decide el inventario de la cuenta, no el cliente
    if (renamedNote) ws.send(JSON.stringify({ t: 'notice', kind: 'sys', m: renamedNote }));
    return;
  }
  if (m.t === 'lobby') { // canal de chat de la pantalla de inicio (sin partida)
    if (ws.player || ws.lobbyName || lobby.size >= 400) return;
    const acct = accounts.fromToken(typeof m.acct === 'string' ? m.acct : '');
    const who = { adm: typeof m.adm === 'string' ? m.adm.slice(0, 80) : '', inf: typeof m.inf === 'string' ? m.inf.slice(0, 40) : '', ip: ws.ip };
    let idt = admin.resolveIdentity(Object.assign({ name: acct ? acct.username : (sanitizeName(m.n) || 'Anónimo') }, who));
    if (!idt.ok) { ws.send(JSON.stringify({ t: 'err', m: idt.error })); return ws.close(); }
    if (!acct && !idt.role && accounts.nameTaken(idt.name)) { idt = admin.resolveIdentity(Object.assign({ name: freeGuestName(idt.name) }, who)); if (!idt.ok) return ws.close(); }   // [MEJORA] nombre libre en vez de expulsar
    if (acct && acct.verified && !idt.role) idt = Object.assign({}, idt, { role: 'inf' });
    ws.acctId = acct ? acct.id : null;   // [NUEVO] para saber quién está en línea
    ws.lobbyName = idt.name; ws.role = idt.role; ws.nameKey = idt.nameKey; ws.ipKey = idt.ipKey; lobby.add(ws);
    return ws.send(JSON.stringify({ t: 'lobbyok', n: lobby.size, rl: idt.role || 0 }));
  }
  if (m.t === 'chat') {
    const sender = ws.player || (ws.lobbyName ? ws : null); if (!sender) return;
    const txt = cleanChat(m.m); if (!txt) return;
    const r = admin.checkChat(sender, txt, now);
    if (!r.ok) { if (r.notice) ws.send(JSON.stringify({ t: 'notice', kind: 'sys', m: r.notice })); return; }
    const name = ws.player ? ws.player.name : ws.lobbyName, role = sender.role || 0, room = ws.player ? ws.player.room : null;
    const id = ++chatSeq, scope = room ? 'room:' + room.id : 'lobby', msg = { t: 'chat', i: id, id: ws.player ? ws.player.id : 0, n: name, m: r.text, rl: role };
    if (room) { room.broadcast(msg); room.chatLog.push({ n: name, m: txt, ts: now }); if (room.chatLog.length > 30) room.chatLog.shift(); } else lobbyBroadcast(msg);
    admin.onChat({ id, ts: now, scope, name, role, text: txt, shown: r.text, flagged: !!r.flagged, ip: sender.ipKey });
    return;
  }
  const p = ws.player; if (!p || !p.room) return;
  const room = p.room;
  switch (m.t) {
    case 'st': return room.onState(p, m, now);
    case 'shoot': return room.onShoot(p, m, now);
    case 'melee': return room.onMelee(p, m, now);
    case 'reload': {
      if (!p.alive || now < p.reloadUntil) return;
      const w = S.WEAPONS[p.cls]; if (p.ammo >= w.mag) return;
      p.reloadUntil = now + w.reload * 900; p.ammo = w.mag; return;
    }
    case 'report': { const r = admin.makeReport({ player: p, name: p.name, nameKey: p.nameKey, ipKey: p.ipKey }, m); return p.send(JSON.stringify({ t: 'reportok', ok: r.ok, m: r.ok ? 'Reporte enviado. Gracias por avisar.' : r.error })); }
    case 'vote': { if (room.phase !== 'break' || !Number.isInteger(m.m) || m.m < 0 || m.m >= S.MAPS.length) return; room.votes.set(p.id, m.m); return room.broadcast({ t: 'votes', v: room.tally() }); }
    case 'cls': if (Number.isInteger(m.c) && m.c >= 0 && m.c < S.WEAPONS.length) p.nextCls = m.c; return;
    case 'buy': {   // [NUEVO] tienda de armas de la pantalla de reaparición
      const item = S.SHOP[m.i];
      if (!Number.isInteger(m.i) || !item) return p.send(JSON.stringify({ t: 'buy', ok: false, i: m.i, reason: 'weapon' }));
      if (p.cash < item.price) return p.send(JSON.stringify({ t: 'buy', ok: false, i: m.i, reason: 'cash', cash: p.cash }));
      p.cash -= item.price; p.nextCls = item.wi;
      return p.send(JSON.stringify({ t: 'buy', ok: true, i: m.i, wi: item.wi, cash: p.cash }));
    }
    case 'ping':   // [ANTITRAMPAS] el «rtt» que manda el cliente ya no se usa: el ping lo mide el servidor (ver measurePing)
      return p.send(JSON.stringify({ t: 'pong', ts: m.ts }));
  }
}

admin.ready.then(() => { if (admin.credentialsNotice) console.log(admin.credentialsNotice); }); // la contraseña generada solo va a la consola (no al registro del panel)
server.listen(PORT, HOST, () => log('PixelPlayRusher escuchando en http://' + HOST + ':' + PORT + ' (partidas de ' + MATCH_TIME + ' s, ' + MAX_PER_ROOM + ' jugadores por sala)'));

function finish(code) { if (PGDB) PGDB.close().finally(() => process.exit(code)); else process.exit(code); }   // con PostgreSQL se espera a que terminen los guardados
function shutdown() { log('Cerrando…'); lbSave(); admin.flushAll(); accounts.flush(); bp.flush(); finish(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
