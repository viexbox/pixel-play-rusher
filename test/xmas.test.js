'use strict';
/* [NAVIDAD] Modo del evento: 10 min sin límite de bajas, 6 duendes neutrales que se mueven y huyen, que al caer sueltan 3 regalos;
   un jugador eliminado suelta 1; los regalos se recogen pasando por encima y suman al equipo. Todo lo decide el servidor. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const S = require('../public/shared.js');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms)); let ipn = 150;
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: 3938, DATA_DIR: fs.mkdtempSync('/tmp/ppr-xm-'), REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: '', WALL_CHECK: '0' }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } });
  await sleep(1400);
  const conn = (name, mode, tm) => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:3938/ws', { headers: { 'X-Forwarded-For': '10.3.3.' + (ipn++) } }); const c = { ws, msgs: [], me: null, ep: 0 };
    ws.on('message', d => { const m = JSON.parse(d); c.msgs.push(m); if (m.t === 'welcome') c.id = m.id; if (m.t === 'spawn' && m.id === c.id) { c.me = { x: m.x, y: m.y, z: m.z }; c.ep = m.ep; } if (m.t === 'snap') c.snap = m; if (m.t === 'fix') { c.me = { x: m.x, y: m.y, z: m.z }; c.ep = m.ep; c.fixed = true; } });   // corrección del servidor: como el juego real, se acepta su posición y su nuevo ep
    ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', v: 1, n: name, map: 0, c: 0, mode, tm })); res(c); }); });
  const A = await conn('Ana', 'navidad', 0), B = await conn('Beto', 'navidad', 1);   // equipos distintos (sin fuego amigo)
  await sleep(2500);
  const wA = A.msgs.find(m => m.t === 'welcome'), wB = B.msgs.find(m => m.t === 'welcome');
  ok(S.MODES.navidad && wA.mode === 'navidad' && wA.room === wB.room, 'existe el modo Navidad y los dos jugadores entran en la misma sala');
  ok(wA.tl === 600 && wA.lim === 0, 'la partida dura 10 minutos (' + wA.tl + ' s) y no tiene límite de bajas');
  ok((wA.el || []).length === 6 && A.snap && A.snap.e.length === 6, 'hay 6 duendes');
  const e0 = JSON.stringify(A.snap.e.map(e => [e[1], e[3]])); await sleep(1500);
  ok(JSON.stringify(A.snap.e.map(e => [e[1], e[3]])) !== e0, 'los duendes se mueven por el mapa');
  const W = S.buildWorld(0);
  for (let k = 0; k < 400 && !A.msgs.some(m => m.t === 'ekill'); k++) {
    const eye = { x: A.me.x, y: A.me.y + 1.6, z: A.me.z };
    const c = A.snap.e.filter(e => e[5]).map(e => { const dx = e[1] - eye.x, dy = e[2] + 0.5 - eye.y, dz = e[3] - eye.z, L = Math.hypot(dx, dy, dz); return { d: [dx / L, dy / L, dz / L], L }; })
      .filter(e => e.L < 60 && S.rayWorld(W.colliders, eye, { x: e.d[0], y: e.d[1], z: e.d[2] }, e.L) >= e.L - 0.3).sort((a, b) => a.L - b.L)[0];
    if (c) A.ws.send(JSON.stringify({ t: 'shoot', o: [eye.x, eye.y, eye.z], d: [c.d] }));
    await sleep(160);
  }
  const ek = A.msgs.find(m => m.t === 'ekill'), ga = A.msgs.find(m => m.t === 'gadd');
  ok(A.msgs.some(m => m.t === 'hit' && m.elf) && !!ek, 'disparar a un duende le hace daño y lo elimina');
  ok(!!ga && ga.g.length === 3, 'el duende suelta 3 regalos');
  ok(B.msgs.some(m => m.t === 'gadd'), 'el otro jugador también ve los regalos');
  if (ga) { const g = ga.g[0]; let p = { x: A.me.x, y: A.me.y, z: A.me.z };
    for (let k = 0; k < 400 && !A.msgs.some(m => m.t === 'gpick'); k++) { const dx = g[1] - p.x, dz = g[3] - p.z, L = Math.hypot(dx, dz), st = Math.min(L, 0.35); p = { x: p.x + dx / (L || 1) * st, y: g[2], z: p.z + dz / (L || 1) * st }; A.ws.send(JSON.stringify({ t: 'st', ep: A.ep, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, h: 1.8 })); await sleep(50); }
    A.me = p;   // Ana está ahora junto al regalo
    const gp = A.msgs.find(m => m.t === 'gpick'), team = wA.tm;
    ok(!!gp && gp.p === A.id && gp.n === 1, 'pasando por encima se recoge el regalo');
    ok(!!gp && gp.tk[team] === 1 && gp.tk[1 - team] === 0, 'y suma un punto a su equipo (marcador ' + (gp && JSON.stringify(gp.tk)) + ')');
    ok(B.msgs.some(m => m.t === 'gpick' && m.id === gp.id), 'el otro jugador ve que ese regalo ya no está');
  }
  /* eliminar a un jugador suelta 1 regalo: Ana camina hacia Beto siguiendo la navegación del mapa hasta verlo, y dispara */
  const nG = A.msgs.filter(m => m.t === 'gadd').length;
  { const nav = W.nav; let p = { x: A.me.x, y: A.me.y, z: A.me.z }, best = Infinity, bestK = 0, side = 0;
    for (let k = 0; k < 900 && !A.msgs.some(m => m.t === 'kill' && m.v === B.id); k++) {
      if (A.fixed) { A.fixed = false; p = { x: A.me.x, y: A.me.y, z: A.me.z }; }
      const bp = B.me, eye = { x: p.x, y: p.y + 1.6, z: p.z }, dx = bp.x - eye.x, dy = bp.y + 1.2 - eye.y, dz = bp.z - eye.z, L = Math.hypot(dx, dy, dz);
      const d = { x: dx / L, y: dy / L, z: dz / L };
      if (L < 40 && S.rayWorld(W.colliders, eye, d, L) >= L - 0.5) { A.ws.send(JSON.stringify({ t: 'shoot', o: [eye.x, eye.y, eye.z], d: [[d.x, d.y, d.z]] })); await sleep(140); continue; }
      let dir = S.navDir(nav, S.navField(nav, bp.x, bp.z, 0), p.x, p.z, p.y) || [dx, dz]; const hd = Math.hypot(bp.x - p.x, bp.z - p.z);
      if (hd < best - 0.3) { best = hd; bestK = k; } else if (k - bestK > 20) { bestK = k; side = 10; }   // atascada: se desvía un momento, como los bots
      if (side > 0) { side--; dir = [-dir[1] + dir[0] * 0.3, dir[0] + dir[1] * 0.3]; }
      const l = Math.hypot(dir[0], dir[1]) || 1;
      const e = { pos: { x: p.x, y: p.y, z: p.z }, vel: { x: dir[0] / l * 6.5, y: 0, z: dir[1] / l * 6.5 }, hw: 0.35, h: 1.8, onGround: true }; S.moveEntity(W.colliders, e, 0.05);
      p = { x: e.pos.x, y: e.pos.y, z: e.pos.z }; A.me = p; A.ws.send(JSON.stringify({ t: 'st', ep: A.ep, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, h: 1.8 })); await sleep(50);
    } }
  const killed = A.msgs.some(m => m.t === 'kill' && m.v === B.id);
  if (process.env.DBG) console.log('DBG correcciones:', A.msgs.filter(m => m.t === 'fix' || m.t === 'pos').length, '| tipos:', [...new Set(A.msgs.map(m => m.t))].join(','), '| Ana:', JSON.stringify(A.me), '| Beto:', JSON.stringify(B.me), '| disparos con impacto:', A.msgs.filter(m => m.t === 'hit' && !m.elf).length);
  ok(killed, 'Ana llega hasta Beto y lo elimina');
  if (killed) { await sleep(300); const after = A.msgs.filter(m => m.t === 'gadd').slice(nG); ok(after.some(m => m.g.length === 1), 'eliminar a un jugador suelta 1 regalo'); }
  /* una sala normal no tiene ni duendes ni regalos */
  const C = await conn('Carla', 'duelo'); await sleep(1500);
  const wC = C.msgs.find(m => m.t === 'welcome');
  ok(wC.mode === 'duelo' && !wC.el && !wC.g && C.snap && C.snap.e === undefined, 'en una sala de Duelo no hay ni duendes ni regalos');
  for (const c of [A, B, C]) try { c.ws.close(); } catch (e) { /* nada */ }
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
