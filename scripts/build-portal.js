'use strict';
/* [PORTALES] Paquete para subir el juego a Poki o a CrazyGames (como archivos, no como dirección):
   un index.html con todo dentro (three.js incluido), el SDK del portal activado y la dirección del servidor online fija.
   Uso:  node scripts/build-portal.js poki https://krunxa.up.railway.app      → dist/poki/index.html
         node scripts/build-portal.js crazygames https://krunxa.up.railway.app → dist/crazygames/index.html
   El servidor ya acepta conexiones desde los dominios de CrazyGames y Poki (portalOrigin en server/accounts.js). */
const fs = require('fs');
const path = require('path');
const { build } = require('./build-single.js');
const [portal, server] = process.argv.slice(2);
if (!['poki', 'crazygames'].includes(portal) || !/^https:\/\/[^\s/?#]+$/.test(String(server || ''))) {
  console.error('Uso: node scripts/build-portal.js poki|crazygames https://tu-servidor'); process.exit(1);
}
const dir = path.join(__dirname, '..', 'dist', portal), out = path.join(dir, 'index.html');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(out, build({ inlineThree: true, portal, server }));
console.log('Generado ' + path.relative(process.cwd(), out) + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB) · portal ' + portal + ' · servidor ' + server);
