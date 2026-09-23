'use strict';
/* Conexión online: origen de archivo local, orígenes ajenos, plazo del saludo y elección de servidor (?server= y botón «Servidor»). */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws'); const { JSDOM } = require('jsdom');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
const start = async (port, env) => { fs.rmSync('/tmp/ppr_conn_' + port, { recursive: true, force: true }); const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: '/tmp/ppr_conn_' + port, ADMIN_PASSWORD: 'Con-Admin-2026xyz', DATABASE_URL: '', MAX_CONN_PER_IP: 60 }, env), stdio: 'ignore' }); procs.push(p); await sleep(1600); return p; };
const hello = { t: 'hello', v: 1, n: 'Conecta', map: 0, c: 0, lk: [0, 0], adm: '', inf: '', acct: '', mode: 'duelo', rk: 0 };
function tryWs(port, origin, path2, send, delay) {
  return new Promise(res => {
    const out = { open: false, first: null, closed: null }; const ws = new WebSocket('ws://127.0.0.1:' + port + (path2 || '/ws'), origin === undefined ? {} : { headers: { Origin: origin } });
    ws.on('open', () => { out.open = true; if (send) setTimeout(() => { try { ws.send(JSON.stringify(hello)); } catch (e) { /* cerrado */ } }, delay || 0); });
    ws.on('message', d => { if (!out.first) out.first = JSON.parse(d).t; }); ws.on('unexpected-response', (rq, rs) => { out.status = rs.statusCode; }); ws.on('error', () => {});
    ws.on('close', c => { out.closed = c; });
    setTimeout(() => { try { ws.close(); } catch (e) { /* nada */ } res(out); }, (delay || 0) + 1800);
  });
}
(async () => {
  console.log('=== Servidor: orígenes ===');
  await start(3380, {});
  let r = await tryWs(3380, 'null', '/ws', true); ok(r.open && r.first === 'welcome', 'una partida abierta desde un archivo local (Origin: null) entra: welcome');
  r = await tryWs(3380, 'http://127.0.0.1:3380', '/ws', true); ok(r.first === 'welcome', 'y desde la propia página del servidor');
  r = await tryWs(3380, 'https://sitio-ajeno.com', '/ws', true); ok(!r.open && r.status === 403, 'desde una web ajena se rechaza (403)');
  r = await tryWs(3380, 'null', '/admin-ws', false); ok(!r.open && r.status === 403, 'el canal del panel de administración NO acepta origen de archivo (403)');
  const cors = async (o, m, p) => { const x = await fetch('http://127.0.0.1:3380' + p, { method: m, headers: { Origin: o, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } }); return { s: x.status, h: x.headers.get('access-control-allow-origin') }; };
  let c = await cors('null', 'GET', '/api/status'); ok(c.s === 200 && c.h === 'null', '/api/status responde con CORS para un archivo local (así el juego ve el servidor)');
  c = await cors('null', 'OPTIONS', '/api/auth/login'); ok(c.s === 204 && c.h === 'null', 'y los inicios de sesión (con su comprobación previa) también');
  c = await cors('https://sitio-ajeno.com', 'GET', '/api/status'); ok(c.h === null, 'una web ajena no recibe permiso CORS');
  const st = (await (await fetch('http://127.0.0.1:3380/api/status')).json()); ok(st.storage && st.storage.mode === 'archivos' && st.storage.warn === false, '/api/status informa de dónde se guardan los datos (archivos, sin aviso: no es una plataforma efímera)');
  procs.pop().kill(); await sleep(300);
  await start(3381, { ALLOW_FILE_ORIGIN: '0' }); r = await tryWs(3381, 'null', '/ws', true); ok(!r.open && r.status === 403, 'ALLOW_FILE_ORIGIN=0 vuelve a rechazar el origen de archivo'); procs.pop().kill(); await sleep(300);
  console.log('\n=== Servidor: plazo del saludo ===');
  await start(3383, { HELLO_TIMEOUT_MS: 2500 });
  r = await tryWs(3383, undefined, '/ws', true, 1500); ok(r.first === 'welcome', 'un saludo que llega a 1,5 s (equipo lento) se acepta');
  r = await tryWs(3383, undefined, '/ws', true, 3500); ok(r.closed === 1008 && r.first === null, 'sin saludo dentro del plazo se cierra con 1008 (no se quedan conexiones colgadas)');
  procs.pop().kill(); await sleep(300);
  await start(3384, {}); r = await tryWs(3384, undefined, '/ws', true, 7000); ok(r.first === 'welcome', 'con el plazo por defecto un saludo a 7 s (antes de este arreglo se cortaba a los 5) entra');

  console.log('\n=== Cliente: elección de servidor ===');
  const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'utf8');
  const run = (url, store) => { const w = new JSDOM('<html></html>', { url, runScripts: 'outside-only' }).window; for (const [k, v] of Object.entries(store || {})) w.localStorage.setItem(k, v); w.eval(cfgSrc); return { srv: w.VOLT_CONFIG.server, saved: w.localStorage.getItem('ppr.server') }; };
  let x = run('http://localhost/juego.html'); ok(x.srv === '' && x.saved === null, 'sin nada configurado: mismo servidor que la página (vacío)');
  x = run('http://localhost/juego.html?server=https://mi-juego.onrender.com/'); ok(x.srv === 'https://mi-juego.onrender.com' && x.saved === 'https://mi-juego.onrender.com', '?server=https://… se usa (sin la barra final) y se recuerda');
  x = run('http://localhost/juego.html', { 'ppr.server': 'http://192.168.1.20:3000' }); ok(x.srv === 'http://192.168.1.20:3000', 'la próxima vez (sin ?server=) se usa el recordado, también con IP y puerto');
  x = run('http://localhost/juego.html?server=javascript:alert(1)', { 'ppr.server': 'https://viejo.com' }); ok(x.srv === '' && x.saved === null, 'una dirección peligrosa o inválida se descarta y borra la recordada');
  x = run('http://localhost/juego.html?server=', { 'ppr.server': 'https://viejo.com' }); ok(x.srv === '' && x.saved === null, '?server= vacío borra la recordada');
  x = run('http://localhost/juego.html?server=ftp://x.com'); ok(x.srv === '', 'solo se aceptan direcciones http:// y https://');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
