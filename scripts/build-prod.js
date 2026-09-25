'use strict';
/* Genera la carpeta lista para producción, sin pruebas ni herramientas de desarrollo.
     npm run build:prod                 → dist/pixel-play-rusher/
     npm run build:prod -- --zip        → además dist/pixel-play-rusher.zip (necesita el comando «zip»)
     node scripts/build-prod.js ./salida
   No hay paso de compilación: el servidor es Node sin transpilar y el juego son archivos estáticos. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2), zip = args.includes('--zip');
const out = path.resolve(args.find(a => !a.startsWith('--')) || path.join(ROOT, 'dist', 'pixel-play-rusher'));
if (out === ROOT || ROOT.startsWith(out + path.sep)) { console.error('La carpeta de salida no puede ser el propio proyecto ni una carpeta que lo contenga.'); process.exit(1); }

const KEEP_FILES = ['server.js', 'package-lock.json', 'README.md', 'Dockerfile', '.dockerignore', 'Caddyfile.example', 'nginx.conf.example'];
const KEEP_DIRS = ['server', 'public'];
const skip = src => { const b = path.basename(src); return b.startsWith('.') && b !== '.dockerignore' || /\.(map|log|tmp)$/.test(b) || b === 'node_modules'; };

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of KEEP_FILES) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(out, f));
for (const d of KEEP_DIRS) fs.cpSync(path.join(ROOT, d), path.join(out, d), { recursive: true, filter: src => !skip(src) });
fs.mkdirSync(path.join(out, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'scripts', 'admin-password.js'), path.join(out, 'scripts', 'admin-password.js')); // para restablecer la contraseña del administrador
fs.copyFileSync(path.join(ROOT, 'scripts', 'restore-backup.js'), path.join(out, 'scripts', 'restore-backup.js')); // para restaurar una copia de seguridad

// package.json: se dejan las dependencias tal cual (así package-lock.json sigue coincidiendo) y solo queda el script de arranque
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
pkg.scripts = { start: 'node server.js' };
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

let files = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } })(out);
console.log('Carpeta de producción creada: ' + out + ' (' + files + ' archivos, ' + (bytes / 1048576).toFixed(1) + ' MB)');

if (zip) {
  const file = out + '.zip';
  try { fs.rmSync(file, { force: true }); execFileSync('zip', ['-rq', file, path.basename(out)], { cwd: path.dirname(out) }); console.log('Zip creado: ' + file); }
  catch (e) { console.error('No se pudo crear el zip (¿está instalado el comando «zip»?). Comprime la carpeta a mano.'); }
}
console.log('\nEn el servidor:\n  cd ' + path.basename(out) + '\n  npm ci --omit=dev\n  node server.js        (o: docker build -t pixel-play-rusher .)');
