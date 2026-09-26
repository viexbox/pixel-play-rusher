'use strict';
/* Genera un único archivo HTML con todo el juego (JS, CSS y módulos incluidos).
   Uso:  node scripts/build-single.js [salida.html] [--inline-three]
   Por defecto carga three.js desde cdnjs; con --inline-three lo incrusta (funciona sin internet). */
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, '..', 'public');
const read = f => fs.readFileSync(path.join(PUB, f), 'utf8');
/* Módulos en orden de dependencias. Solo se admiten imports de una línea y exports con nombre. */
const MODULES = ['src/state/eventBus.js', 'src/api/storage.js', 'src/api/playerService.js', 'src/api/authService.js', 'src/state/playerState.js', 'src/ui/UIManager.js', 'src/api/adminService.js', 'src/api/accountService.js', 'src/ui/screens/AuthScreen.js', 'src/app.js', 'src/main.js'];

function stripModule(src, file) {
  const IMPORT = /^\s*import\s[^;]*?from\s+'[^']+';[ \t]*$/gm;
  src = src.replace(IMPORT, '');
  if (/^\s*import\s/m.test(src)) throw new Error('import no soportado por el empaquetado en ' + file);
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s/gm, '$1 ');
  if (/^\s*export\s/m.test(src)) throw new Error('export no soportado por el empaquetado en ' + file);
  return src;
}
function bundleModules() {
  const seen = new Map(), parts = [];
  for (const f of MODULES) {
    const code = stripModule(read(f), f);
    for (const m of code.matchAll(/^(?:async\s+)?function\s+(\w+)|^(?:const|let|class)\s+(\w+)/gm)) {
      const n = m[1] || m[2]; if (seen.has(n)) throw new Error('Nombre repetido «' + n + '» en ' + f + ' y ' + seen.get(n));
      seen.set(n, f);
    }
    parts.push('/* ' + f + ' */\n' + code);
  }
  return parts.join('\n');
}
function replaceOnce(html, from, to) {
  if (html.split(from).length !== 2) throw new Error('No se encontró (o está repetido) en index.html: ' + from);
  return html.split(from).join(to);
}
function build(opts = {}) {
  let html = read('index.html').replace('<script src="diag.js"></script>\n', '');   // el aviso de errores de carga solo hace falta con servidor
  html = html.replace(/<!-- SEO:[\s\S]*?<!-- \/SEO -->\n/, '');   // canonical, Open Graph y manifiesto solo tienen sentido servidos desde el dominio
  if (html.includes('__SITE_URL__')) throw new Error('Quedan marcadores __SITE_URL__ fuera del bloque SEO de index.html');
  const guard = (name, code) => { if (/<\/script/i.test(code)) throw new Error('«</script» dentro de ' + name); return code; };
  const three = opts.inlineThree ? '<script>\n' + guard('three', read('vendor/three.min.js')) + '\n</script>' : '<script src="' + (opts.three || 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js') + '"></script>';
  html = replaceOnce(html, '<script src="vendor/three.min.js"></script>', three);
  html = replaceOnce(html, '<script src="vendor/GLTFLoader.js"></script>', '<script>\n' + guard('gltf', read('vendor/GLTFLoader.js')) + '\n</script>');
  html = replaceOnce(html, '<script src="i18n.js"></script>', '<script>\n' + guard('idiomas', read('i18n.js')) + '\n</script>');
  html = replaceOnce(html, '<script src="config.js"></script>', '<script>\n' + guard('config', read('config.js')) + '\n</script>');
  html = replaceOnce(html, '<script src="shared.js"></script>', '<script>\n' + guard('shared', read('shared.js')) + '\n</script>');
  html = replaceOnce(html, '<script src="client.js"></script>', '<script>\n' + guard('client', read('client.js')) + '\n</script>');
  html = replaceOnce(html, '<script src="bp.js"></script>', '<script>\n' + guard('pase', read('bp.js')) + '\n</script>');
  html = replaceOnce(html, '<script src="social.js"></script>', '<script>\n' + guard('social', read('social.js')) + '\n</script>');
  html = replaceOnce(html, '<script src="modes.js"></script>', '<script>\n' + guard('modos', read('modes.js')) + '\n</script>');
  html = replaceOnce(html, '<script src="account.js"></script>', '<script>\n' + guard('cuenta', read('account.js')) + '\n</script>');
  html = replaceOnce(html, '<script type="module" src="src/main.js"></script>', '<script>\n(function () {\n' + guard('módulos', bundleModules()) + '\n})();\n</script>');
  html = replaceOnce(html, '<link rel="stylesheet" href="src/ui/auth.css">', '<style>\n' + read('src/ui/auth.css') + '\n</style>');
  const uri = (f, type) => 'data:' + type + ';base64,' + fs.readFileSync(path.join(PUB, f)).toString('base64');
  html = html.replace('<link rel="icon" href="favicon.png" type="image/png">', '<link rel="icon" href="' + uri('favicon.png', 'image/png') + '" type="image/png">');
  html = html.replace('<link rel="apple-touch-icon" href="apple-touch-icon.png">\n', '');
  const mapImgs = require('../public/shared.js').MAPS.map((_, i) => i).map(i => uri('maps/map' + i + '.jpg', 'image/jpeg'));
  html = html.replace('</head>', '<script>window.MAP_IMGS = ' + JSON.stringify(mapImgs) + ';</script>\n</head>');
  html = html.split('src="logo.jpg"').join('src="' + uri('logo.jpg', 'image/jpeg') + '"'); // el logo va incrustado
  return html;
}
module.exports = { build };
if (require.main === module) {
  const args = process.argv.slice(2), out = args.find(a => !a.startsWith('--')) || 'pixel-play-rusher.html';
  fs.writeFileSync(out, build({ inlineThree: args.includes('--inline-three') }));
  console.log('Generado ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
}
