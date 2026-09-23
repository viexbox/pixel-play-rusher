'use strict';
const { spawn } = require('child_process'); const path = require('path'); const WebSocket = require('ws');
const PORT = 3113, HTTP = 'http://127.0.0.1:' + PORT, WSURL = 'ws://127.0.0.1:' + PORT + '/ws';
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, ALLOWED_ORIGINS: 'https://juego.ejemplo.com', DATA_DIR: '/tmp/voltarena_test_data3', MAX_CONN_PER_IP: 3, HELLO_TIMEOUT_MS: 5000 }), stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) {} });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = (origin, headers) => new Promise(res => { const ws = new WebSocket(WSURL, { origin, headers }); ws.on('open', () => res({ ws, ok: true })); ws.on('unexpected-response', (q, r) => res({ ws, ok: false, code: r.statusCode })); ws.on('error', () => {}); });
(async () => {
  await sleep(700);
  let r = await fetch(HTTP + '/api/status', { headers: { Origin: 'https://juego.ejemplo.com' } });
  ok(r.headers.get('access-control-allow-origin') === 'https://juego.ejemplo.com', 'CORS permitido para el origen configurado');
  r = await fetch(HTTP + '/api/status', { headers: { Origin: 'https://otro.com' } });
  ok(!r.headers.get('access-control-allow-origin'), 'CORS NO se concede a otros orígenes');
  let c = await open('https://otro.com'); ok(!c.ok && c.code === 403, 'WebSocket desde un origen no permitido → 403');
  c = await open('https://juego.ejemplo.com'); ok(c.ok, 'WebSocket desde el origen permitido conecta'); const conns = [c.ws];
  for (let i = 0; i < 2; i++) { const x = await open('https://juego.ejemplo.com'); if (x.ok) conns.push(x.ws); }
  const over = await open('https://juego.ejemplo.com'); ok(!over.ok && over.code === 429, 'el 4.º WebSocket desde la misma IP → 429 (límite 3)');
  // sin «hello» en 5 s se cierra
  const t0 = Date.now(); await new Promise(res => conns[0].on('close', res)); ok(Date.now() - t0 < 6500, 'una conexión que no saluda se cierra sola (' + (Date.now() - t0) + ' ms)');
  // mensajes basura no rompen el servidor
  const g = await open('https://juego.ejemplo.com'); g.ws.send('no es json'); g.ws.send(JSON.stringify({ t: 'st' })); g.ws.send(JSON.stringify({ t: 'shoot', d: 'x' })); g.ws.send(JSON.stringify([1, 2]));
  await sleep(300); r = await fetch(HTTP + '/healthz'); ok(r.status === 200, 'el servidor sigue vivo tras mensajes inválidos');
  // nombre con caracteres raros y desbordamiento
  const h = await open('https://juego.ejemplo.com'); let w; h.ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'welcome') w = m; });
  h.ws.send(JSON.stringify({ t: 'hello', v: 1, n: '<script>alert(1)</script>Nombre larguísimo de prueba', map: 99, c: -4 })); await sleep(300);
  ok(w && !/[<>]/.test(JSON.stringify(w)) && w.map === 0, 'nombre saneado y mapa/clase inválidos corregidos');
  const st = await (await fetch(HTTP + '/api/status')).json(); ok(st.players >= 1, 'estado coherente');
  srv.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
