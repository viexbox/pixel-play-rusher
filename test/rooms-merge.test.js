'use strict';
/* [SALAS] Con un solo mapa (Tormenta de Arena), quien pide un mapa que ya no existe entra en el 0 con los que ya juegan en su modo;
   modos distintos no se mezclan. (Con varios mapas, findRoom juntaba en otro mapa a quien iba a esperar solo, con un aviso.) */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const WebSocket = require('ws');
const PORT = 3195, WSU = 'ws://127.0.0.1:' + PORT + '/ws', DATA = '/tmp/ppr_rooms_merge';
fs.rmSync(DATA, { recursive: true, force: true });
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return false; }
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: DATA, FILL_BOTS: 0, WALL_CHECK: 0, DATABASE_URL: '' }), stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) { /* nada */ } });
let ipn = 20;
const join = (name, map, mode) => new Promise(res => { const ws = new WebSocket(WSU, { headers: { 'X-Forwarded-For': '10.8.1.' + (ipn++) } }), c = { ws, msgs: [] };
  ws.on('message', d => c.msgs.push(JSON.parse(d))); ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', v: 1, n: name, map, c: 0, mode })); res(c); }); });
const welcome = c => c.msgs.find(m => m.t === 'welcome');
(async () => {
  try {
    await sleep(1200);
    const A = await join('Ana', 0, 'duelo'); await until(() => welcome(A));
    const B = await join('Beto', 1, 'duelo'); await until(() => welcome(B));
    ok(welcome(B).room === welcome(A).room && welcome(B).map === 0, 'Beto pidió un mapa que ya no existe (el 1): juega en Tormenta de Arena con Ana');
    ok(!A.msgs.some(m => m.t === 'notice' && /no esperes solo/.test(m.m)), 'Ana (que ya estaba en su mapa) no recibe ningún aviso');
    const C = await join('Cris', 0, 'cuchillos'); await until(() => welcome(C));
    ok(welcome(C).room !== welcome(A).room && welcome(C).map === 0, 'otro modo (Solo cuchillos) no se mezcla: Cris abre su propia sala');
    const D = await join('Dani', 0, 'cuchillos'); await until(() => welcome(D));
    ok(welcome(D).room === welcome(C).room && !D.msgs.some(m => m.t === 'notice' && /no esperes solo/.test(m.m)), 'y quien elige ese mismo modo va con Cris, sin aviso');
    for (const x of [A, B, C, D]) x.ws.close();
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); srv.kill(); process.exit(failed ? 1 : 0);
})();
