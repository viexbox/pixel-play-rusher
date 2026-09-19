'use strict';
/* Pixel Play Rusher · servidor online
   - Sirve la carpeta /public
   - WebSocket en /ws (salas por mapa, combate validado por el servidor)
   - API: /api/status y /api/leaderboard
   Configuración por variables de entorno: ver README.md */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const S = require('./public/shared.js');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MATCH_TIME = +process.env.MATCH_TIME || S.CONST.MATCH_TIME;
const KILL_LIMIT = +process.env.KILL_LIMIT || S.CONST.KILL_LIMIT;
const MAX_PER_ROOM = +process.env.MAX_PLAYERS_PER_ROOM || 10;
const BREAK_SECS = +process.env.BREAK_SECS || 12;
const MAX_CONN_PER_IP = +process.env.MAX_CONN_PER_IP || 8;
const TRUST_PROXY = process.env.TRUST_PROXY; // '1' = confiar siempre, '0' = nunca, sin definir = solo si la conexión llega desde una red privada (proxy)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const PUBLIC_DIR = path.join(__dirname, 'public');
const RESPAWN_MS = 5 * 1000; 
const PROTOCOL = 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = v => Math.round(v * 1000) / 1000;
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* =====================================================================
   Clasificación global (archivo JSON)
   ===================================================================== */
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');
let lb = { entries: [] };
try { const d = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); if (d && Array.isArray(d.entries)) lb = d; } catch (e) { /* primera ejecución */ }
let lbTimer = null;
function lbSaveSoon() {
  if (lbTimer) return;
  lbTimer = setTimeout(() => { lbTimer = null; lbSave(); }, 2000);
}
function lbSave() {
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
  const i = lb.entries.findIndex(x => x.m === e.m && x.n.toLowerCase() === key);
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
  return list.sort((a, b) => b.p - a.p || b.k - a.k).slice(0, 50);
}

/* =====================================================================
   Mundos y salas
   ===================================================================== */
const worlds = [].MAPS.map((_, i) => S.buildWorld(i));
const rooms = new Map();
let roomSeq = 1, playerSeq = 1;

function sanitizeName(s) { return String(s || '').replace(/[^\p{L}\p{N}_ \-]/gu, '').trim().slice(0, 14); }

class Player {
  constructor(ws, name, map, cls, ip, lk) {
    this.lk = lk; this.ws = ws; this.ip = ip; this.id = playerSeq++; this.name = name; this.cls = cls; this.nextCls = cls; this.map = map;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.h = 1.8;
    this.hp = 100; this.alive = false; this.ep = 0;
    this.kills = 0; this.deaths = 0; this.points = 0; this.hs = 0; this.streak = 0;
    this.protectUntil = 0; this.respawnAt = 0; this.lastHit = 0; this.lastSt = 0;
    this.ammo = 0; this.reloadUntil = 0; this.nextFire = 0; this.nextMelee = 0;
    this.hist = []; this.ping = 60; this.joinedAt = Date.now(); this.room = null;
  }
  send(str) {
    const ws = this.ws;
    if (ws.readyState !== 1) return;
    if (ws.bufferedAmount > 1e6) { ws.terminate(); return; }
    ws.send(str);
  }
  pub() {
    return { id: this.id, n: this.name, c: this.cls, lk: this.lk, k: this.kills, d: this.deaths, p: this.points, alive: this.alive, x: r3(this.x), y: r3(this.y), z: r3(this.z), yaw: r3(this.yaw), pitch: r3(this.pitch), h: this.h };
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
  constructor(map) {
    this.id = roomSeq++; this.map = map; this.world = worlds[map];
    this.players = new Map(); this.tl = MATCH_TIME; this.phase = 'play'; this.breakLeft = 0; this.boardT = 0; this.wait = true;
    rooms.set(this.id, this);
  }
  broadcast(obj, except) {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    for (const p of this.players.values()) if (p !== except) p.send(s);
  }
  add(p) {
    p.room = this; this.players.set(p.id, p);
    p.send(JSON.stringify({ t: 'welcome', v: PROTOCOL, id: p.id, room: this.id, map: this.map, tl: r3(this.tl), phase: this.phase, players: [...this.players.values()].filter(o => o !== p).map(o => o.pub()) }));
    this.broadcast({ t: 'join', p: p.pub() }, p);
    this.spawn(p, Date.now(), 1500);
    this.sendBoard();
  }
  remove(p) {
    if (!this.players.delete(p.id)) return;
    if (this.phase === 'play' && p.kills + p.deaths > 0 && Date.now() - p.joinedAt > 60000) this.record(p, Date.now());
    this.broadcast({ t: 'leave', id: p.id });
    if (this.players.size === 0) rooms.delete(this.id);
    else this.sendBoard();
  }
  record(p, now) {
    lbRecord({ n: p.name, p: p.points, k: p.kills, d: p.deaths, h: p.hs, c: S.WEAPONS[p.cls].name, m: this.map, t: now });
  }
  sendBoard() {
    this.broadcast({ t: 'board', b: [...this.players.values()].map(p => [p.id, p.kills, p.deaths, p.points]) });
  }
  spawn(p, now, protectMs) {
    const wps = this.world.waypoints;
    let best = wps[0], bs = -1;
    for (let i = 0; i < 40; i++) {
      const s = wps[Math.floor(Math.random() * wps.length)];
      let md = Infinity;
      for (const o of this.players.values()) if (o !== p && o.alive) md = Math.min(md, Math.hypot(o.x - s[0], o.z - s[1]));
      const score = Math.min(md, 60) + Math.random() * 10;
      if (score > bs) { bs = score; best = s; }
    }
    p.x = best[0]; p.y = 0; p.z = best[1]; p.yaw = Math.atan2(best[0], best[1]); p.pitch = 0; p.h = 1.8;
    p.hp = 100; p.alive = true; p.ep++; p.cls = p.nextCls;
    const w = S.WEAPONS[p.cls];
    p.ammo = w.mag; p.reloadUntil = 0; p.nextFire = now + 300; p.protectUntil = now + (protectMs || 1500); p.lastHit = now; p.lastSt = now;
    p.hist = [{ t: now, x: p.x, y: p.y, z: p.z, h: p.h }];
    this.broadcast({ t: 'spawn', id: p.id, x: r3(p.x), y: 0, z: r3(p.z), yaw: r3(p.yaw), ep: p.ep, c: p.cls, hp: 100 });
  }
  tick(now, dt) {
    if (this.phase === 'play') {
      this.wait = this.players.size < 2;
      if (!this.wait) this.tl -= dt;
      for (const p of this.players.values()) {
        if (!p.alive) { if (now >= p.respawnAt) this.spawn(p, now, 1500); }
        else if (now - p.lastHit > 4000 && p.hp < 100) p.hp = Math.min(100, p.hp + 18 * dt);
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
    for (const p of this.players.values()) p.send('{"t":"snap","tl":' + tl + ',"w":' + w + ',"hp":' + Math.round(p.hp) + ',"s":' + sStr + '}');
    this.boardT += dt; if (this.boardT >= 1) { this.boardT = 0; this.sendBoard(); }
  }
  endRound(now) {
    if (this.phase !== 'play') return;
    this.phase = 'break'; this.breakLeft = BREAK_SECS;
    const rows = [...this.players.values()].sort((a, b) => b.points - a.points || b.kills - a.kills || a.deaths - b.deaths);
    for (const p of rows) if (p.kills + p.deaths > 0) this.record(p, now);
    this.broadcast({ t: 'end', next: BREAK_SECS, res: rows.map(p => [p.id, p.name, p.kills, p.deaths, p.points, p.hs, p.cls]) });
  }
  startRound(now) {
    this.phase = 'play'; this.tl = MATCH_TIME;
    for (const p of this.players.values()) { p.kills = p.deaths = p.points = p.hs = p.streak = 0; p.alive = false; }
    this.broadcast({ t: 'round', tl: MATCH_TIME });
    for (const p of this.players.values()) this.spawn(p, now, 4000);
    this.sendBoard();
  }

  /* --- Combate --- */
  hitscan(shooter, o, d, maxT, T, now) {
    let bestT = S.rayWorld(this.world.colliders, o, d, maxT), who = null, head = false;
    for (const v of this.players.values()) {
      if (v === shooter || !v.alive || v.protectUntil > now) continue;
      const pp = posAt(v, T);
      const th = S.raySphere(o, d, { x: pp.x, y: pp.y + pp.h - 0.22, z: pp.z }, 0.27);
      const tb = S.rayCyl(o, d, pp.x, pp.z, 0.38, pp.y, pp.y + pp.h - 0.4);
      if (th < bestT && th <= tb + 0.05) { bestT = th; who = v; head = true; }
      else if (tb < bestT) { bestT = tb; who = v; head = false; }
    }
    return { t: bestT, who, head };
  }
  damage(v, a, amount, head, wname, now) {
    if (!v.alive || this.phase !== 'play') return;
    v.hp -= amount; v.lastHit = now;
    const killed = v.hp <= 0;
    a.send(JSON.stringify({ t: 'hit', v: v.id, h: head ? 1 : 0, d: amount, k: killed ? 1 : 0 }));
    v.send(JSON.stringify({ t: 'hurt', hp: Math.max(0, Math.round(v.hp)), ax: r3(a.x), az: r3(a.z) }));
    if (!killed) return;
    v.alive = false; v.hp = 0; v.deaths++; v.streak = 0; v.respawnAt = now + RESPAWN_MS;
    a.kills++; a.streak++;
    const pts = 100 + (head ? 50 : 0); a.points += pts; if (head) { a.hs++; }
    this.broadcast({ t: 'kill', k: a.id, v: v.id, w: wname, h: head ? 1 : 0, pts, streak: a.streak, rs: S.CONST.RESPAWN });
    this.sendBoard();
    if (a.kills >= KILL_LIMIT) this.endRound(now);
  }
  onShoot(p, m, now) {
    if (!p.alive || this.phase !== 'play') return;
    const w = S.WEAPONS[p.cls];
    if (now < p.reloadUntil || p.ammo <= 0) return;
    if (now + 40 < p.nextFire) return;
    p.nextFire = Math.max(p.nextFire, now - 30) + w.interval * 1000;
    p.ammo--;
    if (!Array.isArray(m.d) || m.d.length < 1) return;
    const eye = { x: p.x, y: p.y + p.h - 0.2, z: p.z };
    let o = eye;
    if (Array.isArray(m.o) && m.o.length === 3 && m.o.every(Number.isFinite) && Math.hypot(m.o[0] - eye.x, m.o[1] - eye.y, m.o[2] - eye.z) < 2.5) o = { x: m.o[0], y: m.o[1], z: m.o[2] };
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
    if (firstEnd) this.broadcast({ t: 'shot', id: p.id, o: [r3(o.x), r3(o.y), r3(o.z)], e: firstEnd, c: p.cls }, p);
    for (const [v, a] of agg) this.damage(v, p, a.dmg, a.head, w.name, now);
  }
  onMelee(p, m, now) {
    if (!p.alive || this.phase !== 'play' || now < p.nextMelee) return;
    p.nextMelee = now + 480;
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
    if (dh > 13 * dt + 2 || y - p.y > 12 * dt + 2.5) { // movimiento imposible: recolocar al jugador
      p.ep++; p.send(JSON.stringify({ t: 'fix', x: r3(p.x), y: r3(p.y), z: r3(p.z), ep: p.ep })); return;
    }
    p.lastSt = now;
    p.x = clamp(x, -half, half); p.z = clamp(z, -half, half); p.y = clamp(y, 0, 60);
    p.yaw = yaw; p.pitch = clamp(pitch, -1.6, 1.6); p.h = clamp(h, 1.2, 1.8);
    p.hist.push({ t: now, x: p.x, y: p.y, z: p.z, h: p.h });
    while (p.hist.length && now - p.hist[0].t > 1500) p.hist.shift();
  }
}
function findRoom(map) {
  let best = null;
  for (const r of rooms.values()) if (r.map === map && r.players.size < MAX_PER_ROOM && (!best || r.players.size > best.players.size)) best = r;
  return best || new Room(map);
}

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
  for (const r of [...rooms.values()]) { try { r.tick(now, dt); } catch (e) { log('Error en sala', r.id, e); } }
}, 50);

/* =====================================================================
   Servidor HTTP
   ===================================================================== */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

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

function json(res, obj, code, origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
  res.writeHead(code || 200, h);
  res.end(JSON.stringify(obj));
}
function status() {
  return { protocol: PROTOCOL, players: [...connections].filter(w => w.player).length, lobby: lobby.size, rooms: [...rooms.values()].map(r => ({ id: r.id, map: r.map, players: r.players.size })) };
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); return res.end(); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const p = url.pathname;
  if (p.startsWith('/api/')) {
    const ip = clientIp(req), n = (apiHits.get(ip) || 0) + 1; apiHits.set(ip, n);
    const origin = req.headers.origin;
    if (n > 120) return json(res, { error: 'demasiadas peticiones' }, 429, origin);
    if (p === '/api/status') return json(res, status(), 200, origin);
    if (p === '/api/leaderboard') {
      const map = url.searchParams.get('map'); const m = map === null ? -1 : parseInt(map, 10);
      return json(res, { entries: lbQuery(Number.isInteger(m) && m >= 0 && m < S.MAPS.length ? m : -1) }, 200, origin);
    }
    return json(res, { error: 'no encontrado' }, 404, origin);
  }
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  // archivos estáticos de /public (sin salir de la carpeta)
  let rel = p === '/' ? '/index.html' : p;
  rel = path.normalize(decodeURIComponent(rel)).replace(/^([/\\])+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || rel.split(/[/\\]/).some(s => s.startsWith('.'))) { res.writeHead(404); return res.end('No encontrado'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    headers['Cache-Control'] = rel.startsWith('vendor') ? 'public, max-age=86400' : 'no-cache';
    if (ext === '.html') headers['Content-Security-Policy'] = CSP;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

/* =====================================================================
   WebSocket
   ===================================================================== */
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
const connections = new Set();
const lobby = new Set();
const perIp = new Map();
const cleanChat = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
const lobbyBroadcast = obj => { const str = JSON.stringify(obj); for (const w of lobby) if (w.readyState === 1) w.send(str); };

server.on('upgrade', (req, socket, head) => {
  const reject = code => { socket.write('HTTP/1.1 ' + code + '\r\nConnection: close\r\n\r\n'); socket.destroy(); };
  if (!/^\/ws(\?|$)/.test(req.url)) return reject('404 Not Found');
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { ok = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.includes(origin) : new URL(origin).host === req.headers.host; } catch (e) { ok = false; }
    if (!ok) return reject('403 Forbidden');
  }
  const ip = clientIp(req);
  if ((perIp.get(ip) || 0) >= MAX_CONN_PER_IP) return reject('429 Too Many Requests');
  wss.handleUpgrade(req, socket, head, ws => { ws.ip = ip; wss.emit('connection', ws, req); });
});

wss.on('connection', ws => {
  const ip = ws.ip;
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  connections.add(ws);
  ws.alive = true; ws.player = null; ws.rl = { t: Date.now(), n: 0 };
  ws.on('pong', () => { ws.alive = true; });
  const helloTimer = setTimeout(() => { if (!ws.player && !ws.lobbyName) ws.close(1008, 'hello'); }, 5000);
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
  });
  ws.on('error', () => {});
});
setInterval(() => {
  for (const ws of connections) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) { /* cerrado */ } }
}, 20000).unref();

function onMessage(ws, m, now) {
  if (m.t === 'hello') {
    if (ws.player) return;
    if (m.v !== PROTOCOL) { ws.send(JSON.stringify({ t: 'err', m: 'Versión antigua del juego. Recarga la página.' })); return ws.close(); }
    const name = sanitizeName(m.n) || 'Jugador' + (100 + Math.floor(Math.random() * 900));
    const map = Number.isInteger(m.map) && m.map >= 0 && m.map < S.MAPS.length ? m.map : 0;
    const cls = Number.isInteger(m.c) && m.c >= 0 && m.c < S.WEAPONS.length ? m.c : 0;
    const lk = Array.isArray(m.lk) && m.lk.length === 2 && m.lk.every(Number.isInteger) ? [clamp(m.lk[0], 0, 15), clamp(m.lk[1], 0, 4)] : null;
    const p = new Player(ws, name, map, cls, ws.ip, lk);
    ws.player = p; lobby.delete(ws);
    findRoom(map).add(p);
    return;
  }
  if (m.t === 'lobby') { // canal de chat de la pantalla de inicio (sin partida)
    if (ws.player || ws.lobbyName || lobby.size >= 400) return;
    ws.lobbyName = sanitizeName(m.n) || 'Anónimo'; lobby.add(ws);
    return ws.send(JSON.stringify({ t: 'lobbyok', n: lobby.size }));
  }
  if (m.t === 'chat') {
    if (now - (ws.chatT || 0) < 700) return; // máximo un mensaje cada 0,7 s
    const txt = cleanChat(m.m); if (!txt) return;
    ws.chatT = now;
    if (ws.player && ws.player.room) return ws.player.room.broadcast({ t: 'chat', id: ws.player.id, n: ws.player.name, m: txt });
    if (ws.lobbyName) return lobbyBroadcast({ t: 'chat', n: ws.lobbyName, m: txt });
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
    case 'cls': if (Number.isInteger(m.c) && m.c >= 0 && m.c < S.WEAPONS.length) p.nextCls = m.c; return;
    case 'ping':
      if (Number.isFinite(m.rtt)) p.ping = clamp(m.rtt, 0, 1000);
      return p.send(JSON.stringify({ t: 'pong', ts: m.ts }));
  }
}

server.listen(PORT, HOST, () => log('Pixel Play Rusher escuchando en http://' + HOST + ':' + PORT + ' (partidas de ' + MATCH_TIME + ' s, ' + MAX_PER_ROOM + ' jugadores por sala)'));

function shutdown() { log('Cerrando…'); lbSave(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
