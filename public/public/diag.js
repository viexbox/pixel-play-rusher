/* Aviso visible si el juego no llega a cargar bien (así no hace falta abrir la consola del navegador). */
(function () {
  'use strict';
  var box = null;
  function show(msg) {
    if (!box) {
      box = document.createElement('div'); box.setAttribute('role', 'alert');
      box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#7a0f22;color:#fff;font:14px/1.45 system-ui,Arial,sans-serif;padding:10px 14px;white-space:pre-wrap;max-height:45vh;overflow:auto;border-top:3px solid #ff5a6e';
      box.textContent = '⚠ Pixel Play Rusher no se ha cargado bien. Vuelve a subir los archivos de la carpeta «public» (sobre todo shared.js y client.js) y comprueba que no haya un package.json dentro de ella.';
      (document.body || document.documentElement).appendChild(box);
    }
    box.textContent += '\n• ' + msg;
  }
  var same = function (u) { try { return new URL(u, location.href).origin === location.origin; } catch (e) { return false; } };
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) { var u = t.src || t.href; if (same(u)) show('No se pudo cargar ' + u.replace(location.origin, '')); return; }
    show((String(e.filename || '').split('/').pop() || 'la página') + (e.lineno ? ':' + e.lineno : '') + ' → ' + e.message);
  }, true);
  window.addEventListener('unhandledrejection', function (e) { show('Error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)); });
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (!window.THREE) show('three.js no se cargó (vendor/three.min.js).');
      else if (!window.VoltShared) show('shared.js no se cargó bien: no define VoltShared.');
    }, 800);
  });
})();
