'use strict';
/* Pixel Play Rusher · páginas legales (/privacidad y /terminos), con los datos del titular tomados de las variables LEGAL_OWNER, LEGAL_EMAIL y LEGAL_COUNTRY.
   AVISO: son textos base pensados para un juego pequeño. No son asesoramiento legal: revísalos con un profesional antes de abrir el juego al público (sobre todo si cobras o si hay menores). */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VERSION = '1', DATE = '21 de septiembre de 2026';

function page(title, body) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + ' · Pixel Play Rusher</title>' +
    '<style>body{margin:0;background:#0a0e1c;color:#e8ecff;font:16px/1.65 system-ui,Segoe UI,Roboto,sans-serif}main{max-width:780px;margin:0 auto;padding:28px 18px 60px}h1{font-size:28px;margin:.2em 0}h2{font-size:19px;margin:1.6em 0 .3em;color:#ffdc3a}a{color:#38e4ff}small,.aviso{opacity:.75}.aviso{border:1px solid #3a4470;border-radius:10px;padding:10px 14px;background:#111733}li{margin:.25em 0}</style></head><body><main><p><a href="./">← Volver al juego</a></p>' + body + '</main></body></html>';
}
function data(env) {
  const owner = env.LEGAL_OWNER || 'el titular de este servidor', email = env.LEGAL_EMAIL || 'el correo de contacto que indique el titular', country = env.LEGAL_COUNTRY || 'España';
  return { owner: esc(owner), email: esc(email), country: esc(country), mail: env.LEGAL_EMAIL ? '<a href="mailto:' + esc(env.LEGAL_EMAIL) + '">' + esc(env.LEGAL_EMAIL) + '</a>' : esc(email) };
}

function privacy(env) {
  const d = data(env);
  return page('Política de privacidad', `<h1>Política de privacidad</h1><p><small>Versión ${VERSION} · ${DATE}</small></p>
<p class="aviso">Texto base para un juego pequeño. Si vas a abrirlo al público, cobrar o admitir menores, revísalo con un profesional.</p>
<h2>1. Quién es el responsable</h2><p>${d.owner} (${d.country}). Contacto para cualquier asunto de privacidad: ${d.mail}.</p>
<h2>2. Qué datos guardamos y para qué</h2><ul>
<li><b>Cuenta:</b> nombre de usuario, correo electrónico y contraseña (guardada cifrada, nunca en claro). Sirven para que tengas tu cuenta, recuperarla si olvidas la contraseña y avisarte de cambios de seguridad.</li>
<li><b>Juego:</b> estadísticas, PX y Créditos, objetos, amigos, clasificación, foto de perfil y estado. Sirven para que el juego funcione.</li>
<li><b>Técnicos:</b> dirección IP y registros del servidor (temporales) para evitar abusos, trampas y ataques.</li>
<li><b>Pagos:</b> si compras PX, el pago lo gestiona Stripe. No vemos ni guardamos los datos de tu tarjeta.</li></ul>
<h2>3. Base legal</h2><p>La ejecución del servicio que pides al crear tu cuenta, el interés legítimo en la seguridad y el juego limpio, y tu consentimiento al aceptar estos textos.</p>
<h2>4. Con quién se comparten</h2><p>Solo con los proveedores necesarios para que funcione: el alojamiento del servidor, el servicio de correo que envía los códigos y Stripe para los pagos. No vendemos tus datos ni mostramos publicidad.</p>
<h2>5. Cuánto tiempo</h2><p>Mientras tengas la cuenta. Si la eliminas, se borra por completo pasado el plazo de arrepentimiento (7 días por defecto). Las copias de seguridad caducan solas en unos días.</p>
<h2>6. Tus derechos</h2><p>Puedes acceder a tus datos, corregirlos y pedir su supresión. La mayoría puedes hacerla tú desde el juego: <b>Ajustes → Mi cuenta</b> (cambiar correo, contraseña o eliminar la cuenta). Para lo demás, escribe a ${d.mail}. Si crees que tus derechos no se respetan, puedes reclamar ante la autoridad de protección de datos de tu país.</p>
<h2>7. Almacenamiento en tu navegador</h2><p>Guardamos en tu navegador ajustes del juego y tu sesión (almacenamiento local, no cookies de seguimiento). Son técnicos, necesarios para que el juego funcione, y no se usan para publicidad.</p>
<h2>8. Menores</h2><p>El juego está pensado para mayores de 14 años. Si eres menor, usa el juego con permiso de tus padres o tutores.</p>
<h2>9. Cambios</h2><p>Si cambiamos esta política de forma relevante, lo avisaremos en el juego.</p>`);
}

function terms(env) {
  const d = data(env);
  return page('Términos de uso', `<h1>Términos de uso</h1><p><small>Versión ${VERSION} · ${DATE}</small></p>
<p class="aviso">Texto base para un juego pequeño. Revísalo con un profesional antes de abrir el juego al público.</p>
<h2>1. El servicio</h2><p>Pixel Play Rusher es un juego gratuito de disparos en línea ofrecido por ${d.owner}. Al crear una cuenta aceptas estos términos y la <a href="privacidad">política de privacidad</a>.</p>
<h2>2. Tu cuenta</h2><p>Eres responsable de tu contraseña y de lo que se haga con tu cuenta. Vincula un correo verificado para poder recuperarla. Una cuenta por persona.</p>
<h2>3. Juego limpio</h2><ul><li>No se permiten trampas, programas que alteren el juego, explotar fallos ni abusar de otros sistemas (por ejemplo, crear cuentas para vender objetos).</li><li>No se permiten nombres, fotos, estados ni mensajes ofensivos, discriminatorios, sexuales o que suplanten a otras personas.</li><li>El administrador puede avisar, silenciar, expulsar o cerrar cuentas que incumplan estas normas.</li></ul>
<h2>4. Objetos y monedas</h2><p>PX, Créditos, skins, colores y demás objetos son elementos virtuales del juego, sin valor real ni derecho a reembolso ni a cambiarlos por dinero. Los Créditos solo se ganan jugando. Las compras de PX se rigen por las condiciones que se muestren al comprar y por la ley de consumidores aplicable. El mercado y los intercambios son entre jugadores y se pueden limitar o revertir si se detecta abuso.</p>
<h2>5. Disponibilidad</h2><p>El servicio se ofrece «tal cual», sin garantía de estar siempre disponible. Podemos cambiar, pausar o cerrar el juego, y reiniciar temporadas.</p>
<h2>6. Responsabilidad</h2><p>En la medida que permita la ley, no respondemos de pérdidas indirectas derivadas del uso del juego.</p>
<h2>7. Contacto</h2><p>${d.mail}.</p>`);
}
module.exports = { privacy, terms };
