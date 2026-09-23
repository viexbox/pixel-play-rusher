'use strict';
/* Botón de Discord en la barra inferior del menú: debe existir, apuntar al servidor correcto, abrir en pestaña
   nueva sin dar acceso a la página de origen (rel=noopener), y no reventar el resto del menú. */
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };

const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const w = new JSDOM(html, { url: 'https://ejemplo.test/' }).window;
const d = w.document;

console.log('=== Botón de Discord ===');
const btn = d.getElementById('discordBtn');
ok(!!btn, 'existe #discordBtn en el menú');
ok(btn && btn.tagName === 'A', 'es un enlace de verdad (para abrir con clic derecho, arrastrar, etc., no solo con JS)');
ok(btn && btn.getAttribute('href') === 'https://discord.gg/UbfC5bBcp', 'apunta al servidor de Discord correcto (' + (btn && btn.getAttribute('href')) + ')');
ok(btn && btn.getAttribute('target') === '_blank', 'se abre en una pestaña nueva, no reemplaza el juego');
ok(btn && (btn.getAttribute('rel') || '').includes('noopener'), 'lleva rel="noopener" (la pestaña nueva no puede tocar la del juego)');
ok(btn && btn.classList.contains('iconbtn'), 'usa el mismo estilo que el resto de iconos de la barra (controles, ajustes)');
ok(btn && !!btn.getAttribute('aria-label'), 'tiene aria-label para lectores de pantalla (' + (btn && btn.getAttribute('aria-label')) + ')');
const svg = btn && btn.querySelector('svg path');
ok(!!svg && svg.getAttribute('d').length > 100, 'trae el icono real de Discord (no un cuadrado en blanco ni un emoji)');

// no debe haber quedado ningún otro elemento duplicado con el mismo id, ni haber roto los botones vecinos
ok(d.querySelectorAll('#discordBtn').length === 1, 'el id discordBtn no está duplicado');
ok(!!d.querySelector('[data-tab="controls"]') && !!d.querySelector('[data-tab="settings"]'), 'los botones de Controles y Ajustes, junto al de Discord, siguen ahí');

console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
