'use strict';
/* Antitrampas: el ping lo mide el servidor (no el cliente) y los disparos fuera de la mira se cuentan y, con AIM_CHECK=1, se descartan. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const PORT = 3191, HTTP = 'http://127.0.0.1:' + PORT, WSU = 'ws://127.0.0.1:' + PORT + '/ws';
const DATA = '/tmp/ppr_anticheat_test', PASS = 'Prueba-Clave-2026x';
fs.rmSync(DATA, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* aún no */ } await sleep(20); } return false; }
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: DATA, ADMIN_PASSWORD: PASS, MATCH_TIME: 120, KILL_LIMIT: 99, BREAK_SECS: 2, FILL_BOTS: 0, WALL_CHECK: 0, AIM_CHECK: 1 }), stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } });

function client(hello) {
  const c = { msgs: [] };
  c.ws = new WebSocket(WSU);
  c.send = o => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); };
  c.ws.on('open', () => c.send(hello));
  c.ws.on('message', d => {
    const m = JSON.parse(d); c.msgs.push(m);
    if (m.t === 'welcome') { c.id = m.id; c.room = m.room; }
    if (m.t === 'spawn' && m.id === c.id) { c.pos = { x: m.x, y: 0, z: m.z }; c.ep = m.ep; }
  });
  return c;
}

(async () => {
  try {
    await sleep(700);
    const r = await fetch(HTTP + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.1' }, body: JSON.stringify({ user: 'Viexbox', password: PASS }) });
    const T = (await r.json()).token; ok(!!T, 'el administrador inicia sesión');
    const A = client({ t: 'hello', v: 1, n: 'Tirador', map: 0, c: 0 }), B = client({ t: 'hello', v: 1, n: 'Blanco', map: 0, c: 0 });
    ok(await until(() => A.pos && B.pos && A.room === B.room), 'los dos jugadores aparecen en la misma sala');
    const spec = client({ t: 'hello', v: 1, spec: 1, adm: T, room: A.room });
    const stats = () => { const s = spec.msgs.filter(m => m.t === 'sstats').pop(); return s && s.p.find(x => x[0] === A.id); };

    /* 1. Ping: el cliente declara 1000 ms, el servidor mide el de verdad (localhost ≈ 0) */
    for (let i = 0; i < 5; i++) { A.send({ t: 'ping', ts: i, rtt: 1000 }); await sleep(100); }
    ok(await until(() => A.msgs.some(m => m.t === 'pong')), 'el servidor sigue respondiendo al ping del cliente (pong)');
    await sleep(2600);
    ok(await until(() => stats() && stats()[6] < 200), 'el ping que usa el servidor es el medido, no el «rtt: 1000» que declara el cliente (' + (stats() && stats()[6]) + ' ms)');

    /* 2. Disparos fuera de la mira */
    const eye = () => [A.pos.x, 1.6, A.pos.z];
    A.send({ t: 'st', ep: A.ep, x: A.pos.x, y: 0, z: A.pos.z, yaw: 0, pitch: 0, h: 1.8 });   // mira hacia -z
    A.send({ t: 'shoot', o: eye(), d: [[0, 0, -1]] });
    ok(await until(() => stats() && stats()[1] >= 1), 'el disparo en la dirección de la mira cuenta');
    await sleep(1100);
    ok(stats()[9] === 0, 'un disparo alineado con la mira no se marca como sospechoso');
    await sleep(200);
    A.send({ t: 'st', ep: A.ep, x: A.pos.x, y: 0, z: A.pos.z, yaw: 0, pitch: 0, h: 1.8 });
    A.send({ t: 'shoot', o: eye(), d: [[0, 0, 1]] });   // hacia atrás sin girar: silent aim
    ok(await until(() => stats() && stats()[9] === 1), 'un disparo a la espalda sin girar la cámara se marca como fuera de la mira');
    A.send({ t: 'st', ep: A.ep, x: A.pos.x, y: 0, z: A.pos.z, yaw: Math.PI, pitch: 0, h: 1.8 });   // ahora gira de verdad
    await sleep(150);
    A.send({ t: 'shoot', o: eye(), d: [[0, 0, 1]] });
    await sleep(1200);
    ok(stats()[9] === 1, 'el mismo disparo tras girar la cámara es legítimo');
    const sp = 0.011, off = Math.tan(sp * 1.5);   // Asalto: dentro del cono máximo (dispersión ×2 en el aire)
    A.send({ t: 'st', ep: A.ep, x: A.pos.x, y: 0, z: A.pos.z, yaw: Math.PI, pitch: 0, h: 1.8 });
    A.send({ t: 'shoot', o: eye(), d: [[off, 0, 1]] });
    await sleep(1200);
    ok(stats()[9] === 1, 'la dispersión normal del arma no da falsos positivos');
    ok(/Posible disparo fuera de la mira: Tirador/.test(srvLog), 'queda en el registro del servidor');
    for (const c of [A, B, spec]) c.ws.close();
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); srv.kill(); process.exit(failed ? 1 : 0);
})();
