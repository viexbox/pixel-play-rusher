# Pixel Play Rusher · versión online

Shooter en primera persona por bloques con **partidas online**, 4 mapas, 8 clases, cuchillo y **clasificación global**.
Este paquete contiene el juego (navegador) y un servidor Node.js pequeño que hace de sala de juego.

```
pixel-play-rusher/
├─ server.js            Servidor: sirve la web, WebSocket (/ws) y API de clasificación
├─ package.json         Dependencias (solo «ws» en producción)
├─ public/              Todo lo que ve el navegador
│  ├─ index.html        Página del juego (menús, HUD, estilos)
│  ├─ client.js         Lógica del cliente (3D, controles, red)
│  ├─ shared.js         Armas, mapas y física, compartidos con el servidor
│  ├─ config.js         Dirección del servidor (solo si está en otro dominio)
│  └─ vendor/           three.js incluido (no depende de ningún CDN)
├─ test/                Pruebas automáticas (npm test)
├─ Dockerfile           Para desplegar con contenedores
├─ Caddyfile.example    HTTPS automático con Caddy
└─ nginx.conf.example   Alternativa con nginx
```

## 0. Jugar ya, sin instalar nada

- **Con bots, en cualquier sitio:** abre `public/index.html` con doble clic (o sube la carpeta `public/` a tu hosting) y pulsa «Entrenar con bots». También tienes `pixel-play-rusher.html`, la misma versión en un solo archivo.
- **Online con otros jugadores:** hace falta el servidor (secciones 1 a 5).

## Pantalla de inicio

- **Arriba a la izquierda:** tu nombre, nivel, estadísticas y el contador de **KR** (la moneda del juego).
- **Panel lateral izquierdo:** menú de navegación (Inicio, Mapas, Clasificación, Controles, Ajustes) y **eventos** (evento del día con bonus de KR y 3 desafíos diarios).
- **Abajo, en el centro:** botones de selección de modo (Online · Entrenar con bots), mapa y dificultad de los bots.
- **Panel derecho:** vista previa 3D del personaje (arrástrala para girarlo), **equipamiento** (las 8 clases) y **personalización** (color y tono de piel).
- **Abajo a la izquierda:** entrada de texto (**chat**). En el inicio es el chat del lobby; en partida, el de la sala (Enter para escribir). Sin servidor, solo lo ves tú.
- **KR:** se ganan con las bajas (10 KR por cada 100 puntos, +50 por victoria) y con los desafíos diarios; el evento del día los multiplica. Sirven para desbloquear colores. Los KR y los desbloqueos se guardan en el navegador, así que no son a prueba de manipulación.

## Cuenta y acceso (metajuego, fase 1)

Al abrir el juego aparece una pantalla con **Entrar | Registro | Entrar como invitado**. Se puede desactivar con `auth: false` en `public/config.js`.

- Los datos (cuentas, sesión y perfil) se guardan **en el navegador** con contraseñas protegidas con PBKDF2. Es una simulación para probar el flujo: no es segura ni se comparte entre dispositivos. Antes de abrir el juego al público hay que sustituir `public/src/api/authService.js` por una API real en el servidor.
- «Recordarme» guarda la sesión 30 días (localStorage); sin marcarlo solo dura la pestaña (sessionStorage). El invitado (`Guest_XXXX`) se conserva al recargar y se borra al cerrar sesión (pide confirmar).
- Estructura del código: `public/src/{api,state,ui,game}`; más detalles en `public/src/README.md`.

## AK, miras y chat

- **AK** (clase 9): mucho daño y retroceso marcado. Miras: hierro, punto rojo, holográfica y ACOG (zoom creciente, retícula propia y el arma sube para alinear la línea de mira). Se eligen en el lobby (panel «Mira») o en partida con **B**.
- **Lince** (francotirador): mira ×3 o ×6 a pantalla completa con retícula dúplex y telémetro; también con **B**.
- **Chat:** el botón «Ocultar ✕» lo reduce a una pestaña pequeña «CHAT» (con contador de mensajes nuevos); en partida, Enter lo muestra un momento. La zona de mensajes ya no bloquea los clics.

## Novedades del HUD

- Barra superior con tus puntos, reloj, progreso hacia el límite de bajas y líder de la partida.
- Clasificación en directo (arriba a la derecha), registro de bajas con icono de arma y disparo a la cabeza (arriba a la izquierda), FPS y ping.
- Vida segmentada con aviso de vida baja y etiqueta de protección al reaparecer; racha de bajas.
- Caja de arma con icono, cargador visual, barra de recarga y aviso «Pulsa R».
- Mira que se abre al moverte/disparar y se pone **roja sobre un rival**; marcador de impacto (amarillo en cabeza, rojo al eliminar), números de daño flotantes y tarjeta de eliminación (cabezazo, dobles/triples, racha).
- Indicador de daño en arco alrededor de la mira, clasificación completa con `Tab` y pantalla de eliminado.
- **Lince (francotirador):** mira telescópica a pantalla completa con retícula dúplex, zoom ×3, telémetro en metros, retroceso de la mira al disparar y sonido de cerrojo. Se abre con el clic derecho.

## 1. Probarlo en tu ordenador (2 minutos)

Necesitas [Node.js 18 o superior](https://nodejs.org).

```bash
npm install
npm start
```

Abre `http://localhost:3000` en **dos pestañas**, pulsa «Jugar online» en ambas y verás a los dos jugadores en la misma sala.

## 2. Elegir dónde publicarlo

Los juegos online necesitan un programa que se quede encendido (el servidor Node). Las tres opciones habituales:

| Opción | Cuándo elegirla | Coste orientativo |
|---|---|---|
| **A. VPS propio** (Hetzner, DigitalOcean, OVH, Contabo…) | La mejor opción: control total, datos persistentes, sin «dormirse». | Desde ~4–6 €/mes |
| **B. Plataforma (Render, Railway, Fly.io…)** | No quieres administrar un servidor. Comprueba que admita WebSockets y disco persistente. | Gratis con limitaciones; de pago para uso serio |
| **C. Tu hosting compartido / cPanel** | Ya tienes un hosting con tu dominio. **No puede ejecutar el servidor** de este juego, pero sirve para la web: sube `public/` y apunta `config.js` a un servidor de la opción A o B. Sin servidor, solo funciona «Entrenar con bots». | El que ya pagas |

> El dominio que ya tienes vale para cualquiera de las tres: solo cambia a dónde apunta en el DNS (ver cada guía).

## 3. Opción A: VPS con Ubuntu 22.04/24.04 (paso a paso)

Supón que tu dominio es `midominio.com` y quieres jugar en `https://midominio.com` (o `juego.midominio.com`).

**1. DNS.** En el panel donde compraste el dominio crea un registro **A** que apunte a la IP de tu VPS (`midominio.com` → `203.0.113.10`). Para un subdominio, el registro A sería `juego`. Tarda desde minutos hasta unas horas en propagarse.

**2. Instala Node 20 y Caddy** (Caddy consigue y renueva el certificado HTTPS solo):

```bash
sudo apt update && sudo apt install -y curl debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

**3. Sube el proyecto** (por ejemplo a `/opt/pixel-play-rusher`) y prepara las dependencias:

```bash
cd /opt/pixel-play-rusher
npm install --omit=dev
```

**4. Déjalo funcionando siempre con PM2:**

```bash
sudo npm install -g pm2
pm2 start server.js --name pixel-play-rusher
pm2 save && pm2 startup     # ejecuta el comando que te muestre para arrancar al reiniciar
```

**5. Activa HTTPS con Caddy.** Copia `Caddyfile.example` a `/etc/caddy/Caddyfile`, cambia `midominio.com` por tu dominio y ejecuta `sudo systemctl reload caddy`.

**6. Abre los puertos 80 y 443** en el cortafuegos (`sudo ufw allow 80,443/tcp`). No abras el 3000: solo lo usa Caddy en local.

Comprueba `https://midominio.com`: el menú debe mostrar «N jugadores conectados». Salud del servidor: `https://midominio.com/healthz`.

**Actualizar más adelante:** sube los archivos nuevos y ejecuta `pm2 restart pixel-play-rusher`.

## 4. Opción B: plataformas (Render, Railway, Fly.io)

1. Sube este proyecto a un repositorio de GitHub.
2. Crea un «Web Service» desde ese repositorio. Comando de compilación: `npm install --omit=dev`. Comando de arranque: `npm start`.
3. **Disco persistente:** monta un volumen y pon la variable `DATA_DIR` con su ruta (por ejemplo `/data`). Sin él, la clasificación se borra en cada despliegue.
4. **Dominio propio:** en el panel de la plataforma añade tu dominio; te dará un registro **CNAME** (o A) para crear en tu DNS. El HTTPS lo pone la plataforma.
5. Los planes gratuitos suelen «dormir» el servicio tras un rato sin visitas, lo que interrumpe las partidas. Para jugar en serio usa un plan de pago o un VPS.

También hay un `Dockerfile` listo por si la plataforma o tu VPS trabajan con contenedores: `docker build -t pixel-play-rusher . && docker run -d -p 3000:3000 -v pixel-play-rusher-data:/data pixel-play-rusher`.

## 5. Opción C: web en tu hosting y servidor en otro sitio

1. Despliega el servidor con la opción A o B (por ejemplo en `https://juego.midominio.com`).
2. En el servidor define `ALLOWED_ORIGINS=https://www.midominio.com` (la dirección desde la que se verá la web; varias separadas por comas).
3. Edita `public/config.js`: `window.VOLT_CONFIG = { server: 'https://juego.midominio.com' };`
4. Sube el contenido de `public/` a tu hosting (normalmente a `public_html`).

## 6. Variables de entorno

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `DATA_DIR` | `./data` | Carpeta de `leaderboard.json` (haz copia de seguridad de este archivo) |
| `MATCH_TIME` | `180` | Duración de cada partida en segundos |
| `KILL_LIMIT` | `25` | Bajas necesarias para terminar antes de tiempo |
| `BREAK_SECS` | `12` | Pausa con resultados entre partidas |
| `MAX_PLAYERS_PER_ROOM` | `10` | Jugadores por sala (se crean salas nuevas al llenarse) |
| `ALLOWED_ORIGINS` | *(mismo dominio)* | Orígenes admitidos para WebSocket y API si la web está en otro dominio |
| `TRUST_PROXY` | *(automático)* | `1` confiar siempre en `X-Forwarded-For`, `0` nunca. Sin definir, se confía solo si la conexión llega desde una red privada (proxy) |
| `MAX_CONN_PER_IP` | `8` | Conexiones simultáneas por IP |

## 7. Cómo funciona y qué límites tiene (leer antes de abrirlo al público)

- **Salas:** cada mapa tiene sus propias salas. Con un solo jugador el reloj se detiene hasta que entra alguien más. Al terminar cada partida se guardan las puntuaciones y empieza otra.
- **Quién decide qué:** el servidor decide vida, daño, bajas, munición, cadencia y reapariciones, y comprueba cada disparo contra las posiciones de los rivales en el momento en que tú los veías (compensación de latencia de hasta ~450 ms). **El movimiento lo calcula el navegador de cada jugador**; el servidor rechaza movimientos imposibles (teletransportes o velocidad excesiva) y limita los límites del mapa, pero un tramposo decidido podría, por ejemplo, ir algo más rápido dentro de esos márgenes o atravesar paredes. Para un juego entre amigos y comunidad pequeña es un compromiso razonable; para competiciones con premios haría falta un servidor que simule también el movimiento.
- **Clasificación:** guarda tu mejor partida por mapa y nombre. **No hay cuentas ni contraseñas**: cualquiera puede usar el nombre de otro, y los nombres no se moderan (solo se limpian caracteres raros y se limita la longitud). Si abres el juego al público, plantéate revisar `data/leaderboard.json` de vez en cuando.
- **Carga:** en una prueba con 40 jugadores simulados repartidos en 4 salas, el servidor usó ~4 % de un núcleo y ~3 Mbit/s en total (en el entorno donde lo probé). No lo he probado con cientos de jugadores ni con conexiones reales de internet.
- **Chat:** los mensajes se limpian (sin `<` `>` ni caracteres de control, máx. 120 caracteres, un mensaje cada 0,7 s), pero **no hay filtro de insultos ni moderación**.
- **Un solo proceso:** no hay balanceo entre varios servidores; las salas viven en la memoria de esa instancia. Si se reinicia, las partidas en curso se cortan (la clasificación se conserva).
- **HTTPS:** si la web va por `https`, el WebSocket va por `wss` automáticamente. Sin HTTPS los navegadores modernos bloquearán algunas funciones.
- **Fuentes:** la página carga las fuentes desde Google Fonts. Si quieres evitar peticiones a terceros (por privacidad/RGPD), elimina el `<link>` de fuentes de `index.html`; el juego usa fuentes del sistema como alternativa.
- **Marca y contenido:** Pixel Play Rusher es un juego original: el código, los mapas y las armas están escritos desde cero y usan tipos de arma genéricos. No incluye recursos de Krunker.io ni de nadie más.

## 8. Personalizar

- **Colores y estilo:** variables CSS al inicio de `public/index.html`.
- **Armas:** lista `WEAPONS` en `public/shared.js` (daño, cadencia, cargador, dispersión, alcance…). Como el servidor usa el mismo archivo, los cambios valen para todos a la vez.
- **Mapas:** lista `MAPS` en `public/shared.js`. Cada mapa es una función que coloca cajas (`b.addBox`, `b.stairs`, `b.perimeter`…). Añade uno y aparecerá en el menú y en el servidor.
- **Reglas:** duración, límite de bajas y tamaño de sala con las variables de entorno de arriba.

## 9. Problemas frecuentes

- **El menú dice «El modo online no está disponible en esta página»:** el navegador no llega al servidor. Comprueba que `https://tudominio/api/status` responde; si usas la opción C, revisa `config.js` y `ALLOWED_ORIGINS`.
- **Conecta y se corta enseguida (nginx):** falta la cabecera de actualización de WebSocket; usa `nginx.conf.example`.
- **«Too Many Requests» o no deja entrar a más de 8 personas:** el servidor ve a todos con la IP del proxy. Define `TRUST_PROXY=1`.
- **Error 403 al conectar el WebSocket:** el dominio desde el que se abre la web no coincide con el de `Host` del proxy, o no está en `ALLOWED_ORIGINS`.
- **Puerto ocupado:** cambia `PORT` o cierra el proceso que use el 3000.

## 10. Pruebas automáticas

```bash
npm install          # incluye jsdom para las pruebas
npm test
npm run build:single     # genera pixel-play-rusher.html, todo el juego en un solo archivo
```

Incluyen: HUD y mira del francotirador con el cliente real, API y archivos estáticos, protocolo, combate con compensación de latencia, límite de cadencia, anti-teletransporte, fin de ronda y clasificación persistente, el cliente real conectado al servidor real, orígenes y límites por IP. Con `node test/load.js 40 15` simulas carga.
