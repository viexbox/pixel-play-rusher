/* Idiomas de PixelPlayRusher.
   - El español es el idioma base: todo el juego está escrito en español y este archivo lo traduce.
   - Idioma al entrar: el que el jugador eligió en Ajustes (se guarda en el navegador) o, si no eligió ninguno,
     el del dispositivo (navigator.languages). Si el dispositivo está en un idioma que aún no tenemos, inglés.
   - Traduce la página al cargar y, con un MutationObserver, todo lo que el juego añade o cambia después (HUD,
     menús, avisos…): así no hace falta tocar cada línea de código que escribe un texto. Solo se traducen textos
     que están en el diccionario (búsqueda exacta), el resto se deja tal cual (nombres de jugador, números…).
   - Para añadir un idioma: una entrada nueva en LANGS y su diccionario en DICT. */
(function () {
  'use strict';
  const LANGS = { es: 'Español', en: 'English' };
  const STORE_KEY = 'ppr.lang';

  const DICT = {
    en: {
      /* --- página fija (index.html) --- */
      '0 / 250 XP': '0 / 250 XP', '0 pts': '0 pts', 'Abandonar': 'Leave',
      'Agacharte; corriendo, te deslizas (siempre corres: no hay una tecla aparte para correr)': 'Crouch; while running you slide (you always run: there is no separate sprint key)',
      'Ajustes': 'Settings', 'Amigos': 'Friends', 'Anterior (Q o ←)': 'Previous (Q or ←)', 'Apuntar': 'Aim',
      'Apuntar (con el Lince: mira telescópica ×3 con retícula y medidor de metros)': 'Aim (with the Lince: ×3 scope with reticle and range meter)',
      'Arena de disparos por bloques': 'Blocky shooting arena', 'Arma principal': 'Primary weapon', 'Armas en venta': 'Weapons for sale',
      'Asalto': 'Assault', 'Automático': 'Automatic',
      'Avisa a la moderación de un comportamiento que rompa las normas. Se guardará el chat reciente y las estadísticas del jugador.': 'Tell the moderators about behaviour that breaks the rules. The recent chat and the player’s stats will be saved.',
      'Avisos': 'Notifications', 'Azul': 'Blue', 'Volver': 'Back', 'Bajas': 'Kills', 'Bando': 'Team', 'Banners': 'Banners',
      'Bloqueados': 'Blocked', 'Borrar clasificación': 'Clear leaderboard', 'Bots': 'Bots', 'Buscar jugador por nombre': 'Search player by name',
      'Buscar objeto o vendedor': 'Search item or seller', 'CAMBIAR': 'SWITCH', 'CHAT': 'CHAT', 'CLASIFICACIÓN': 'LEADERBOARD', 'CR': 'CR',
      'Cab.': 'HS', 'Cambiar arma con la rueda': 'Switch weapon with the mouse wheel', 'Cambiar de clase al reaparecer': 'Change class on respawn',
      'Cambiar de mira (AK y Lince)': 'Change sight (AK and Lince)',
      'Cambiar entre arma y cuchillo (con el cuchillo en mano, el clic golpea)': 'Switch between weapon and knife (with the knife out, click stabs)',
      'Cambiar nombre': 'Change name', 'Cambiar vista (V)': 'Change view (V)', 'Campo de visión': 'Field of view', 'Cancelar': 'Cancel',
      'Cerrar': 'Close', 'Cerrar el equipamiento': 'Close loadout', 'Cerrar sesión': 'Log out', 'Clase': 'Class', 'Clasificación': 'Leaderboard',
      'Clasificación de la partida': 'Match scoreboard', 'Clic der.': 'Right click', 'Clic izq.': 'Left click', 'Color del equipo': 'Team colour',
      'Colores': 'Colours', 'Comprar Pase VIP': 'Buy VIP Pass', 'Común': 'Common', 'Contra bots': 'Against bots', 'Controles': 'Controls',
      'Controles y ayuda': 'Controls and help', 'Corr.': 'Run', 'Correo, contraseña y eliminación': 'Email, password and deletion',
      'Créditos: se ganan jugando y sirven en el Mercado.': 'Credits: earned by playing and used in the Market.',
      'Cuchillo': 'Knife', 'Cuchillo (Q: lo saca; si ya lo tienes, golpea)': 'Knife (Q: draws it; if you already have it out, stabs)',
      'Cuchillos': 'Knives', 'Cuéntanos qué ha pasado': 'Tell us what happened', 'Código de influencer': 'Influencer code',
      'Desafíos diarios': 'Daily challenges', 'Detalles (opcional)': 'Details (optional)', 'Dificultad de los bots': 'Bot difficulty',
      'Difícil': 'Hard', 'Dirección del servidor online': 'Online server address', 'Disparar': 'Shoot', 'Duelo por equipos': 'Team deathmatch',
      'ENTRENAR': 'TRAINING', 'EQUIPOS': 'TEAMS', 'ESPECTADOR': 'SPECTATOR', 'ESPERANDO RIVALES…': 'WAITING FOR OPPONENTS…',
      'Elegir bando': 'Choose team', 'Elige el próximo mapa': 'Vote for the next map', 'Eliminado': 'Eliminated', 'Enter': 'Enter',
      'Enviar reporte': 'Send report', 'Equipamiento': 'Loadout', 'Esc': 'Esc', 'Escribe un mensaje…  (Enter)': 'Type a message…  (Enter)',
      'Escribir en el chat': 'Write in the chat', 'Espacio': 'Space', 'Espectador': 'Spectator', 'Este equipo': 'This PC',
      'Evento de hoy': 'Today’s event', 'FOV dinámico al ir rápido': 'Dynamic FOV at speed', 'Fin de la partida': 'Match over', 'Fácil': 'Easy',
      'GOLPE': 'STAB', 'GRATIS': 'FREE',
      'Gana XP jugando partidas online (hasta el nivel 50). Las recompensas VIP se desbloquean al comprar el pase; las de niveles ya alcanzados se pueden reclamar en cuanto lo tengas.': 'Earn XP by playing online matches (up to level 50). VIP rewards unlock when you buy the pass; rewards for levels you have already reached can be claimed as soon as you have it.',
      'Global (online)': 'Global (online)', 'Golpe rápido de cuchillo (sin cambiar de arma)': 'Quick knife stab (without switching weapon)',
      'Guardar': 'Save', 'HUD compacto': 'Compact HUD', 'Haz clic en Reanudar para volver a la arena.': 'Click Resume to go back to the arena.',
      'INF-XXXX-XXXX-XXXX': 'INF-XXXX-XXXX-XXXX', 'Inicio': 'Home', 'Insultos o acoso': 'Insults or harassment', 'Intercambios': 'Trades',
      'Jugador': 'Player', 'Jugar': 'Play', 'Jugar otra vez': 'Play again', 'LOBBY': 'LOBBY',
      'La clasificación global se guarda en el servidor y muestra tu mejor partida por mapa. «Mis partidas» solo existe en este navegador.': 'The global leaderboard is stored on the server and shows your best match on each map. “My matches” only exists in this browser.',
      'Legendario': 'Legendary', 'MERCADO': 'MARKET', 'MIRA': 'SIGHT', 'MONEDA': 'CURRENCY', 'Mapa': 'Map', 'Mapas': 'Maps', 'Mayús': 'Shift',
      'Mensaje de chat': 'Chat message', 'Mercado': 'Market', 'Mi cuenta': 'My account', 'Mira': 'Sight', 'Mis anuncios': 'My listings',
      'Mis partidas (este navegador)': 'My matches (this browser)', 'Modo de juego': 'Game mode', 'Modos de juego': 'Game modes',
      'Mostrar el chat': 'Show chat', 'Motivo': 'Reason', 'Moverte': 'Move', 'Muertes': 'Deaths', 'Más recientes': 'Newest',
      'Más secciones': 'More sections', 'NIVEL': 'LEVEL', 'NUEVO': 'NEW', 'Nexus Outpost': 'Nexus Outpost',
      'Nexus Outpost, el nuevo mapa': 'Nexus Outpost, the new map', 'Nivel 1': 'Level 1', 'Nombre nuevo': 'New name',
      'Nombre ofensivo': 'Offensive name', 'Normal': 'Normal', 'Noticias': 'News', 'Nv 1': 'Lv 1', 'ONLINE': 'ONLINE',
      'Ocultar el chat': 'Hide chat', 'Ocultar ✕': 'Hide ✕', 'Orden': 'Sort by', 'Otro': 'Other', 'PASE DE BATALLA': 'BATTLE PASS',
      'PASE GRATIS': 'FREE PASS', 'PIXEL PLAY': 'PIXEL PLAY', 'PROTEGIDO': 'PROTECTED', 'PX': 'PX',
      'PX: la moneda del juego. Se gana jugando.': 'PX: the game currency. Earned by playing.', 'Partida en pausa': 'Game paused',
      'Partidas': 'Matches', 'Pase': 'Pass', 'Pase de Batalla · Temporada 1': 'Battle Pass · Season 1', 'Pase de batalla': 'Battle pass',
      'Pausa': 'Pause', 'Perfil': 'Profile', 'Perfil del jugador': 'Player profile', 'Personaje': 'Character', 'Personalizar': 'Customise',
      'Ping': 'Ping', 'PixelPlayRusher se juega con teclado y ratón. Ábrelo desde un ordenador.': 'PixelPlayRusher is played with keyboard and mouse. Open it on a computer.',
      'PixelPlayRusher · Arena de disparos por bloques': 'PixelPlayRusher · Blocky shooting arena', 'PixelPlay': 'PixelPlay', 'Rusher': 'Rusher', 'Poco común': 'Uncommon',
      'Prec.': 'Acc.', 'Precio: mayor a menor': 'Price: high to low', 'Precio: menor a mayor': 'Price: low to high', 'Privacidad': 'Privacy',
      'Puntos': 'Points', 'RACHA': 'STREAK', 'RUEDA': 'WHEEL', 'RUSHER': 'RUSHER', 'Racha': 'Streak', 'Rangos': 'Ranks', 'Rareza': 'Rarity',
      'Raro': 'Rare', 'Ratón': 'Mouse', 'Reanudar': 'Resume', 'Reaparecer': 'Respawn', 'Recargar': 'Reload', 'Reclamar todo': 'Claim all',
      'Regalar Pase': 'Gift Pass', 'Reportar jugador': 'Report player', 'Retroceso de cámara': 'Camera recoil', 'Rojo': 'Red', 'Rueda': 'Wheel',
      'Sacudida de pantalla': 'Screen shake', 'Salir': 'Exit',
      'Saltar (una pulsación = un salto; suelta y vuelve a pulsar para el siguiente)': 'Jump (one press = one jump; release and press again for the next)',
      'Saltar Niveles': 'Skip Levels', 'Se paga en Créditos · comisión del 10 % al vender': 'Paid in Credits · 10% fee when selling',
      'Secciones': 'Sections', 'Sección': 'Section', 'Sensibilidad': 'Sensitivity', 'Servidor': 'Server', 'Servidor y modo de juego': 'Server and game mode',
      'Si eres influencer, escribe aquí la clave que te dio el dueño de la web: tu nombre saldrá con el tic azul y tus bajas con el efecto dorado.': 'If you are an influencer, enter the key the site owner gave you: your name will show the blue tick and your kills the gold effect.',
      'Siguiente (E o →)': 'Next (E or →)', 'Skins de armas': 'Weapon skins', 'Solicitudes': 'Requests', 'Sombras': 'Shadows', 'Spam': 'Spam',
      'TEMPORADA 1': 'SEASON 1', 'TUS PUNTOS': 'YOUR POINTS', 'Tab': 'Tab', 'Tamaño del HUD': 'HUD size', 'Tienda': 'Store',
      'Tienda de armas': 'Weapon shop', 'TIENDA DE ARMAS': 'WEAPON SHOP', 'Tipo': 'Type', 'Toda rareza': 'Any rarity', 'Todos los tipos': 'All types',
      'Tono de piel': 'Skin tone', 'Trampas': 'Cheating',
      'Tu navegador no puede mostrar gráficos 3D (WebGL). Prueba con otro navegador o activa la aceleración por hardware.': 'Your browser can’t show 3D graphics (WebGL). Try another browser or turn on hardware acceleration.',
      'Tu nombre': 'Your name', 'Términos': 'Terms', 'VIDA': 'HEALTH', 'VIP': 'VIP', 'Vender un objeto': 'Sell an item', 'Ver': 'View',
      'Ver la clasificación de la partida': 'View the match scoreboard', 'Victorias': 'Wins', 'Vista': 'View',
      'Vista previa del personaje (arrastra para girarlo)': 'Character preview (drag to rotate)', 'Volumen': 'Volume', 'Volver al menú': 'Back to menu',
      'Épico': 'Epic', 'Únete a nuestro Discord': 'Join our Discord', '— FPS': '— FPS', '✕ Cerrar': '✕ Close',
      'Idioma': 'Language', 'Personalizar ✎': 'Customise ✎', 'Duelo': 'Duel', 'Zona': 'Zone', 'Carrera': 'Gun Game', 'Clasificatorio': 'Ranked', 'Detalles ›': 'Details ›', 'Detalles': 'Details', 'Antes de jugar': 'Before playing', 'Entrenar': 'Training', 'Jugar online': 'Play online'
    }
  };
  /* Textos con números (nivel, cuenta atrás…): «patrón en español» → «plantilla traducida» */
  const PATTERNS = {
    en: [
      [/^Nivel (\d+)$/, 'Level $1'], [/^NIVEL (\d+)$/, 'LEVEL $1'], [/^Nv (\d+)$/, 'Lv $1'],
      [/^Cambiar de arma \((\d+)s\)$/, 'Change weapon ($1s)']
    ]
  };

  function detect() {
    try { const s = localStorage.getItem(STORE_KEY); if (s && LANGS[s]) return s; } catch (e) { /* navegador sin almacenamiento */ }
    const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'es'];
    for (const l of list) { const base = String(l || '').toLowerCase().split('-')[0]; if (LANGS[base]) return base; }
    return 'en';   // idioma que aún no tenemos: inglés, el más entendido
  }
  const lang = detect();
  const dict = DICT[lang] || null, pats = PATTERNS[lang] || [];
  const lower = {}, produced = new Set();
  if (dict) for (const k in dict) { lower[k.toLowerCase()] = dict[k]; produced.add(dict[k]); }

  function t(s) {
    if (!dict || typeof s !== 'string') return s;
    const core = s.trim(); if (!core) return s;
    let out = dict[core];
    if (out === undefined && !produced.has(core)) {
      const l = lower[core.toLowerCase()];
      if (l !== undefined) out = core === core.toUpperCase() ? l.toUpperCase() : l;   // «CLASIFICACIÓN» en mayúsculas → «LEADERBOARD»
      else for (const [re, rep] of pats) if (re.test(core)) { out = core.replace(re, rep); break; }
    }
    if (out === undefined || out === core) return s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + out + trail;
  }
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1 };
  function trNode(n) {
    if (n.nodeType === 3) { const p = n.parentNode; if (p && SKIP[p.nodeName]) return; const v = t(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
    if (n.nodeType !== 1 || SKIP[n.nodeName] || n.hasAttribute('data-noi18n')) return;
    for (const a of ATTRS) if (n.hasAttribute(a)) { const v0 = n.getAttribute(a), v = t(v0); if (v !== v0) n.setAttribute(a, v); }
    if (n.nodeName === 'INPUT' && (n.type === 'button' || n.type === 'submit') && n.value) { const v = t(n.value); if (v !== n.value) n.value = v; }
    for (let c = n.firstChild; c; c = c.nextSibling) trNode(c);
  }
  function apply(root) { if (dict) trNode(root || document.documentElement); }

  function start() {
    document.documentElement.lang = lang;
    if (dict) {
      document.title = t(document.title);
      apply(document.body);
      new MutationObserver(recs => {
        for (const r of recs) {
          if (r.type === 'characterData') trNode(r.target);
          else if (r.type === 'attributes') trNode(r.target);
          else for (const n of r.addedNodes) trNode(n);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    const sel = document.getElementById('lang');
    if (sel) {
      sel.innerHTML = Object.keys(LANGS).map(k => '<option value="' + k + '">' + LANGS[k] + '</option>').join('');
      sel.value = lang;
      sel.addEventListener('change', () => { try { localStorage.setItem(STORE_KEY, sel.value); } catch (e) { /* nada */ } location.reload(); });
    }
  }
  window.PPR_I18N = { lang, langs: LANGS, t, apply, detect };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
