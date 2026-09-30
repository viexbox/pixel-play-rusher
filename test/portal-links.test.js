'use strict';
/* [PORTALES] PORTAL_LINKS: dentro de CrazyGames/Poki el botón de Discord y el aviso de la web propia están APAGADOS por defecto
   (las normas del portal suelen prohibir enlaces externos) y se encienden con PORTAL_LINKS=1 en el servidor, sin volver a subir el juego. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function status(env, port) {
  const D = '/tmp/ppr_plinks_' + port; fs.rmSync(D, { recursive: true, force: true });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: D, WALL_CHECK: '0', REQUIRE_TERMS: '0', FILL_BOTS: '0' }, env), stdio: 'ignore' });
  try { for (let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/api/status'); if (r.ok) return await r.json(); } catch (e) { await sleep(100); } } return null; } finally { srv.kill(); }
}
(async () => {
  const off = await status({}, 3795), on = await status({ PORTAL_LINKS: '1', PUBLIC_URL: 'https://www.krunxa.com' }, 3796);
  ok(off && off.portalLinks === null, 'por defecto el servidor NO permite enlaces en el portal (portalLinks: null)');
  ok(on && on.portalLinks && on.portalLinks.site === 'https://www.krunxa.com' && /discord\.gg\//.test(on.portalLinks.discord), 'con PORTAL_LINKS=1 manda la web (PUBLIC_URL) y el Discord');
  const cli = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8'), html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  ok(/if \(ok && j && window\.PPR_PORTAL\) portalLinks\(j\.portalLinks\)/.test(cli) && /html\.portal #discordBtn[^{]*\{display:none!important\}/.test(html) && /html\.portal\.portal-links #discordBtn\{display:grid!important\}/.test(html), 'el cliente esconde Discord en el portal salvo que el servidor lo permita (clase portal-links)');
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
