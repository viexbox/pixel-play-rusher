'use strict';
/* [RAILWAY] Aviso de «los datos se borran al redesplegar». En Railway el Dockerfile pone DATA_DIR=/data, así que antes el aviso no saltaba
   nunca aunque no hubiera un volumen montado ahí. Ahora mira RAILWAY_VOLUME_MOUNT_PATH. Con PostgreSQL nunca avisa. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function status(port, extra) {
  const dir = fs.mkdtempSync('/tmp/ppr-sw-');
  const env = Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, REQUIRE_TERMS: '0', FILL_BOTS: '0', DATABASE_URL: '', RAILWAY_ENVIRONMENT: '', RAILWAY_VOLUME_MOUNT_PATH: '' }, typeof extra === 'function' ? extra(dir) : extra);
  const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; p.stdout.on('data', d => { out += d; });
  await sleep(1300); const j = await (await fetch('http://127.0.0.1:' + port + '/api/status')).json(); p.kill(); await sleep(200);
  return { st: j.storage, log: out };
}
(async () => {
  let r = await status(3940, { RAILWAY_ENVIRONMENT: 'production' });
  ok(r.st.warn === true && /ATENCIÓN/.test(r.log), 'en Railway con DATA_DIR puesta pero SIN volumen: avisa (en el panel y en los registros del servidor)');
  r = await status(3941, dir => ({ RAILWAY_ENVIRONMENT: 'production', RAILWAY_VOLUME_MOUNT_PATH: dir }));
  ok(r.st.warn === false && !/ATENCIÓN/.test(r.log), 'en Railway con un volumen montado justo en la carpeta de datos: no avisa');
  r = await status(3942, { RAILWAY_ENVIRONMENT: 'production', RAILWAY_VOLUME_MOUNT_PATH: '/otra/carpeta' });
  ok(r.st.warn === true, 'en Railway con un volumen montado en OTRA carpeta: sigue avisando (los datos no van a ese volumen)');
  r = await status(3943, {});
  ok(r.st.warn === false, 'en tu ordenador (sin Railway): no avisa, como antes');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
