'use strict';
/* [ESTADÍSTICAS] Jugadores por día en el panel: únicos, nuevos y que repiten, origen (web / CrazyGames / Poki), sesiones y minutos,
   y «vuelven al día siguiente». Servidor real con jugadores por WebSocket; el día anterior se prepara en stats.json. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const crypto = require('crypto'); const WebSocket = require('ws');
const { nameKey } = require('../server/admin.js');
const PORT = 3361, D = '/tmp/ppr_pstats', B = 'http://127.0.0.1:' + PORT, APASS = 'Stats-Admin-2026xyz';
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ipn = 10; const ip = () => '10.9.4.' + (ipn++);
const call = async (m, p, b, tk) => { const r = await fetch(B + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip() }, tk ? { Authorization: 'Bearer ' + tk } : {}), body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const huella = k => crypto.createHash('sha1').update(String(k)).digest('base64').slice(0, 10);
const day = t => new Date(t).toISOString().slice(0, 10);
function join(name, src) {
  return new Promise(res => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { headers: { 'X-Forwarded-For': ip() } });
    ws.on('open', () => ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, n: name, map: 0, c: 0 }, src !== undefined ? { src } : {}))));
    ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'welcome') res(ws); if (m.t === 'err') res(null); });
    ws.on('error', () => res(null));
  });
}

(async () => {
  fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
  /* ayer jugó «Ana» por primera vez (desde CrazyGames) y también «Zoe», que hoy no vuelve */
  const ayer = day(Date.now() - 86400000), hA = huella('n:' + nameKey('Ana')), hZ = huella('n:' + nameKey('Zoe'));
  fs.writeFileSync(path.join(D, 'stats.json'), JSON.stringify({ since: Date.now(), matches: 0, kills: 0, shots: 0, hits: 0, joins: 0, messages: 0, blocked: 0, reports: 0, bans: 0, kicks: 0, peak: 0, perMap: {}, perClass: {}, seen: {},
    first: { [hA]: ayer, [hZ]: ayer }, days: { [ayer]: { u: { [hA]: 11, [hZ]: 10 }, n: 2, r: 0, src: { web: 1, crazygames: 1, poki: 0 }, sess: 2, secs: 600, ssrc: { web: 1, crazygames: 1, poki: 0 } } } }));
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: D, DATABASE_URL: '', ADMIN_PASSWORD: APASS, WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '0', MAX_CONN_PER_IP: '50' }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill('SIGKILL'); } catch (e) { /* nada */ } });
  try {
    let up = false; for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(B + '/healthz')).ok; } catch (e) { await sleep(100); } }
    ok(up, 'el servidor arranca');
    const AT = (await call('POST', '/api/admin/login', { user: 'Viexbox', password: APASS })).j.token;
    ok((await call('GET', '/api/admin/player-stats')).s === 401, 'las estadísticas solo las ve el administrador');

    const a = await join('Ana', 'crazygames'), b = await join('Beto', 'web'), c = await join('Cris', 'raro'), p = await join('Pia', 'poki'), n = await join('Nico');
    const a2 = await join('Ana', 'crazygames');   // Ana entra dos veces el mismo día: cuenta una
    ok(a && b && c && p && n && a2, 'seis conexiones de jugadores (Ana dos veces)');
    await sleep(1200); for (const w of [a, b, c, p, n, a2]) w.close(); await sleep(2500);

    const st = (await call('GET', '/api/admin/player-stats', null, AT)).j, hoy = st.days && st.days[st.days.length - 1], prev = st.days && st.days[st.days.length - 2];
    ok(Array.isArray(st.days) && st.days.length === 30 && hoy.d === day(Date.now()) && prev.d === ayer, '30 días, el último es hoy (' + (hoy && hoy.d) + ')');
    ok(hoy.uniques === 5, 'hoy: 5 jugadores únicos, Ana cuenta una vez aunque entró dos veces (' + hoy.uniques + ')');
    ok(hoy.src.crazygames === 1 && hoy.src.poki === 1 && hoy.src.web === 3, 'de dónde vienen: 1 CrazyGames, 1 Poki y 3 web — un origen desconocido o sin origen cuenta como web (' + JSON.stringify(hoy.src) + ')');
    ok(hoy.r === 1 && hoy.n === 4, 'Ana ya había jugado ayer: 1 repite y 4 nuevos (' + hoy.r + ' / ' + hoy.n + ')');
    ok(hoy.d1 === 0.5, 'de los 2 nuevos de ayer (Ana y Zoe) volvió hoy la mitad: ' + hoy.d1);
    { const secs = JSON.parse(fs.readFileSync(path.join(D, 'stats.json'), 'utf8')).days[hoy.d].secs; ok(hoy.sess === 6 && secs >= 6 && secs < 60 && hoy.avgMin < 1, 'cada conexión cuenta como sesión con su tiempo jugado (' + hoy.sess + ' sesiones, ' + secs + ' s en total)'); }
    ok(prev.uniques === 2 && prev.avgMin === 5, 'el día anterior sale con sus datos (2 jugadores, 5 min por sesión)');
    ok(st.week && st.week.uniques === 7 && st.week.src.crazygames === 2 && st.week.d1 === 0.5, 'resumen de 7 días: 7 jugadores-día, 2 desde CrazyGames y «vuelven al día siguiente» 50 % (' + JSON.stringify(st.week) + ')');
    const raw = fs.readFileSync(path.join(D, 'stats.json'), 'utf8');
    ok(!/Ana|Beto|Cris|Pia|Nico|10\.9\.4\./.test(raw), 'en el archivo no se guardan nombres ni IPs, solo huellas');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  try { srv.kill(); } catch (e) { /* nada */ }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
