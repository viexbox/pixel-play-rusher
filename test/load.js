'use strict';
/* Carga simulada: N jugadores repartidos por salas moviéndose y disparando. Uso: node test/load.js [jugadores] [segundos] */
const { spawn } = require('child_process'); const path = require('path'); const WebSocket = require('ws'); const fs = require('fs');
const N = +process.argv[2] || 40, SECS = +process.argv[3] || 15, PORT = 3114;
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: '/tmp/voltarena_load', MAX_CONN_PER_IP: 500 }), stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) {} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bytes = 0, msgs = 0;
function cpu(pid) { const s = fs.readFileSync('/proc/' + pid + '/stat', 'utf8').split(' '); return (+s[13] + +s[14]) / 100; }
(async () => {
  await sleep(700);
  const bots = [];
  for (let i = 0; i < N; i++) {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws'); const b = { ws, x: 0, z: 0, ep: 0, alive: false, id: 0 };
    ws.on('message', d => { bytes += d.length; msgs++; const m = JSON.parse(d); if (m.t === 'welcome') b.id = m.id; if (m.t === 'spawn' && m.id === b.id) { b.x = m.x; b.z = m.z; b.ep = m.ep; b.alive = true; } if (m.t === 'kill' && m.v === b.id) b.alive = false; });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, n: 'Bot' + i, map: i % 4, c: i % 8 })));
    ws.on('error', () => {}); bots.push(b);
  }
  await sleep(1500);
  const c0 = cpu(srv.pid), t0 = Date.now(); let ang = 0;
  const iv = setInterval(() => {
    ang += 0.1;
    for (const b of bots) if (b.alive && b.ws.readyState === 1) {
      b.x = Math.max(-35, Math.min(35, b.x + Math.cos(ang + b.id) * 0.3)); b.z = Math.max(-35, Math.min(35, b.z + Math.sin(ang + b.id) * 0.3));
      b.ws.send(JSON.stringify({ t: 'st', ep: b.ep, x: b.x, y: 0, z: b.z, yaw: ang, pitch: 0, h: 1.8 }));
      if (Math.random() < 0.3) b.ws.send(JSON.stringify({ t: 'shoot', o: [b.x, 1.6, b.z], d: [[Math.cos(ang), 0, Math.sin(ang)]] }));
    }
  }, 50);
  await sleep(SECS * 1000); clearInterval(iv);
  const dt = (Date.now() - t0) / 1000, used = cpu(srv.pid) - c0;
  const st = await (await fetch('http://127.0.0.1:' + PORT + '/api/status')).json();
  console.log(`${N} jugadores en ${st.rooms.length} salas durante ${SECS} s → CPU del servidor: ${(used / dt * 100).toFixed(1)} % de un núcleo; tráfico recibido por los clientes: ${(bytes / dt / 1024 / 1024 * 8).toFixed(1)} Mbit/s total (${Math.round(msgs / dt)} msg/s)`);
  process.exit(0);
})();
