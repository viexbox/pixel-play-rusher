'use strict';
/* El servidor debe arrancar aunque exista un public/package.json con "type": "module" (error visto en Railway) y aunque shared.js termine con un module.exports sin protección. */
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'), TMP = '/tmp/ppr_esm_guard';
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'server.js'), path.join(TMP, 'server.js')); fs.cpSync(path.join(ROOT, 'server'), path.join(TMP, 'server'), { recursive: true }); fs.cpSync(path.join(ROOT, 'public'), path.join(TMP, 'public'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(TMP, 'package.json')); fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(TMP, 'node_modules'));
fs.writeFileSync(path.join(TMP, 'public', 'package.json'), '{ "type": "module" }');
const sh = path.join(TMP, 'public', 'shared.js'); fs.writeFileSync(sh, fs.readFileSync(sh, 'utf8').replace("if (typeof module !== 'undefined' && module.exports) module.exports = api;", 'module.exports = api;'));
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const p = spawn('node', ['server.js'], { cwd: TMP, env: Object.assign({}, process.env, { PORT: 3177, DATA_DIR: path.join(TMP, 'data'), ADMIN_PASSWORD: 'Guard-Prueba-2026x' }), stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
let exited = false; p.on('exit', () => { exited = true; });
setTimeout(async () => {
  try {
    ok(!exited && !/ReferenceError|ERR_REQUIRE_ESM/.test(out), 'con public/package.json «type: module» y module.exports sin proteger, el servidor arranca');
    const h = await fetch('http://127.0.0.1:3177/healthz').then(r => r.text()).catch(() => ''); ok(h === 'ok', '/healthz responde');
    const st = await fetch('http://127.0.0.1:3177/api/status').then(r => r.json()).catch(() => null); ok(st && st.protocol === 1, 'y el servidor de juego funciona (' + JSON.stringify(st) + ')');
    const sj = await fetch('http://127.0.0.1:3177/shared.js').then(r => r.text()).catch(() => ''); ok(/VoltShared/.test(sj), 'el navegador sigue recibiendo shared.js');
  } catch (e) { console.log('EXCEPCIÓN', e); failed++; }
  p.kill(); console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
}, 2500);
