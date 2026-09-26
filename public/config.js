/* Configuración opcional de Voltarena.
   Déjalo tal cual si el juego y el servidor Node están en el mismo dominio.
   Si subes la carpeta public/ a un hosting estático y el servidor vive en otra dirección,
   escribe aquí su URL (con https), por ejemplo: 'https://juego.midominio.com' */
window.VOLT_CONFIG = { server: '', auth: true };  // auth: false desactiva la pantalla de acceso (login / registro / invitado)
/* Servidor elegido por el jugador (sin tocar este archivo): se escribe con el botón «Servidor» del menú o abriendo el juego con  ?server=https://mi-servidor.com
   (se recuerda en este navegador; ?server= vacío lo borra). Útil sobre todo con krunxa.html abierto desde el ordenador. */
(function () {
  try {
    const ok = v => /^https?:\/\/[^\s/?#]+(:\d+)?(\/[^\s?#]*)?$/i.test(v), q = new URLSearchParams(location.search).get('server');
    if (q !== null) { const v = q.trim().replace(/\/+$/, ''); if (ok(v)) localStorage.setItem('ppr.server', v); else localStorage.removeItem('ppr.server'); }
    const s = (localStorage.getItem('ppr.server') || '').trim().replace(/\/+$/, '');
    if (!window.VOLT_CONFIG.server && ok(s)) window.VOLT_CONFIG.server = s;
  } catch (e) { /* sin almacenamiento: se usa el servidor de esta misma dirección */ }
})();
