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

- Sin servidor (archivo único) o si el servidor no tiene cuentas, los datos (cuentas, sesión y perfil) se guardan **en el navegador** con contraseñas protegidas con PBKDF2. Es una simulación para probar el flujo: no es segura ni se comparte entre dispositivos. Antes de abrir el juego al público hay que sustituir `public/src/api/authService.js` por una API real en el servidor.
- «Recordarme» guarda la sesión 30 días (localStorage); sin marcarlo solo dura la pestaña (sessionStorage). El invitado (`Guest_XXXX`) se conserva al recargar y se borra al cerrar sesión (pide confirmar).
- Estructura del código: `public/src/{api,state,ui,game}`; más detalles en `public/src/README.md`.

## Cuentas online, PX y tienda

Con el servidor Node desplegado, **Registro** crea una cuenta online (`server/accounts.js`, datos en `DATA_DIR/accounts.json`: **usa un volumen persistente** en Render/Railway o se perderán al reiniciar).

- **Nombres únicos:** no se distingue entre mayúsculas, tildes ni guiones (`Pepe_1`, `pepe-1` y `Pépé_1` son el mismo). Un invitado no puede usar un nombre registrado y la cuenta entra siempre con el suyo. Los nombres reservados (administrador, influencers, baneados, `Guest…`) no se pueden registrar.
- **PX (moneda del juego):** el servidor reparte los PX al terminar cada ronda online (mínimo 2 jugadores) con la misma fórmula y eventos diarios que ya veías, y cobra los colores y las recompensas de rango. Tope diario: `PX_DAILY_CAP`. Las cuentas online no ganan PX en el entrenamiento contra bots ni con los desafíos diarios; los invitados y las cuentas locales antiguas siguen con PX en su navegador.
- **Niveles y rangos:** se calculan con los puntos que la cuenta acumula en el servidor.
- **Panel → Economía (PX):** busca cuentas y suma o resta PX a mano (cantidad + motivo). Nunca deja el saldo por debajo de 0 y cada ajuste queda en la auditoría y en «Ajustes manuales de PX». También lista los pedidos de la tienda.
- **Tienda (pestaña «Tienda» del lobby):** usa **Stripe Checkout**; nunca se guarda ninguna tarjeta. Para activarla: crea tu cuenta de Stripe, define `STRIPE_SECRET_KEY` y `PUBLIC_URL`, añade en Stripe → Desarrolladores → Webhooks el destino `https://tudominio.com/api/store/webhook` con el evento `checkout.session.completed` (y `checkout.session.async_payment_succeeded` si aceptas métodos diferidos) y copia su secreto en `STRIPE_WEBHOOK_SECRET`. El importe lo fija el servidor y los PX solo se acreditan con un aviso de pago firmado, con el importe correcto y una sola vez. **Los reembolsos no descuentan PX automáticamente**: hazlo a mano desde el panel. Vender moneda virtual tiene implicaciones fiscales y de consumo según tu país: revísalas antes de cobrar. Si algún día usas Stripe en modo prueba, recuerda que la tarjeta de prueba es `4242 4242 4242 4242`.
- **Voto de mapa:** al acabar una ronda online todos votan el siguiente mapa; gana el más votado (empate al azar). En el entrenamiento se elige el mapa en la pantalla final.

## Pase de batalla (Temporada 1) y PostgreSQL

**Qué es.** Botón **Pase** del lobby: pantalla completa con 50 niveles y dos filas de recompensas (**Gratis** y **VIP**, bloqueada con candado hasta comprar el pase). Cada tarjeta enseña una vista previa del objeto, su nombre, su rareza con color (Común, Poco común, Raro, Épico, Legendario) y el botón **Reclamar**; las skins reclamadas se **equipan** desde la misma tarjeta. Hay 15 skins de armas, 7 de cuchillos, el banner exclusivo **S1** y PX. Botones: **Comprar Pase VIP**, **Regalar Pase**, **Saltar Niveles** y **Reclamar todo**.

**Cómo se progresa.** Al acabar cada partida online el servidor da XP (`40 + 25 % de tus puntos + 60 si ganas`, máximo 600 por partida y `BP_XP_DAILY_CAP` al día). Del nivel 1 al 50 hacen falta 35.770 XP. El pase, los niveles saltados y el regalo se pagan con **PX**, la moneda que ya se compra con dinero real en la Tienda, así que no hay una segunda pasarela de pago. Los precios están en `BP_VIP_PX` y `BP_SKIP_PX`. El VIP devuelve unos 875 PX repartidos por el camino (un 58 % de su precio) para que comprarlo nunca salga rentable.

**Dónde se guarda (PostgreSQL).** Define `DATABASE_URL` y al arrancar se crean las tablas solas (`server/migrations/001_init.sql`, con registro en `schema_migrations`):

| Tabla | Qué guarda |
|---|---|
| `bp_progress` | por usuario y temporada: XP, nivel, si tiene VIP, desde cuándo, quién se lo regaló y la XP ganada hoy |
| `bp_claims` | recompensas reclamadas (clave única por nivel y fila: es imposible reclamar dos veces) |
| `bp_inventory` | skins y banners que posee |
| `bp_equipped` | qué lleva puesto (por arma, cuchillo y banner) |
| `bp_gifts` | registro de regalos de pase |
| `app_docs` | cuentas, panel de administración y clasificación (documentos JSONB) |

Con `DATABASE_URL` también se guardan en la base las **cuentas, la contraseña del administrador y la clasificación**: por eso en **Render** basta con crear una base *PostgreSQL* (Dashboard → New → PostgreSQL), copiar su *Internal Database URL* en la variable `DATABASE_URL` del servicio web y redesplegar; ya no hace falta un disco de pago. Si tu proveedor rechaza la conexión por TLS, prueba `DATABASE_SSL=off`. Sin `DATABASE_URL` el pase funciona igual guardando en `DATA_DIR/battlepass.json`. Los datos de un despliegue sin PostgreSQL no se migran solos a PostgreSQL, salvo los archivos JSON que existan en `DATA_DIR` en el primer arranque, que se importan. `node scripts/admin-password.js` también funciona con PostgreSQL.

**Reglas que hace cumplir el servidor** (`server/battlepass.js`): no se reclama un nivel no alcanzado ni la fila VIP sin pase; nada se reclama ni se cobra dos veces (una operación a la vez por usuario y claves únicas en la base); si falla el guardado tras cobrar, se devuelven los PX; no se puede regalar a uno mismo ni a quien ya tiene el pase; una skin solo se equipa en su arma y si se posee. El panel puede conceder XP o VIP a mano: `POST /api/admin/bp/grant {username, xp, vip}` y consultar `GET /api/admin/bp/user?username=` (queda en la auditoría).

**Cambiar recompensas o crear otra temporada.** El catálogo (skins, niveles, rarezas, precios y XP) está en `public/shared.js` (bloque *Pase de batalla*), compartido por servidor y cliente. Para una temporada nueva, cambia `SEASON` en `server/battlepass.js` y el catálogo: el progreso se guarda por temporada.

**Limitaciones conocidas.** Las skins se ven en tu arma en primera persona y en tu cuchillo, pero **los demás jugadores no las ven** (no se envían por red todavía). Los PX viven en el documento de cuentas y el pase en sus tablas: la compra se hace en dos pasos con devolución automática si falla, pero si el servidor se cae justo entre ambos pasos podría perderse esa operación.

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

> **Railway:** crea un volumen montado en `/data` y define `RAILWAY_RUN_UID=0` (los volúmenes son de root y el contenedor arranca como usuario normal, si no falla al guardar), `TRUST_PROXY=1`, `ADMIN_PASSWORD` y `PUBLIC_URL`. Genera un dominio en *Settings → Networking*.

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
| `ADMIN_USER` | `Viexbox` | Nombre de la cuenta de administrador (hasta 14 caracteres). Si lo cambias, la cuenta se vuelve a crear con `ADMIN_PASSWORD` y el nombre anterior deja de ser administrador |
| `ADMIN_PASSWORD` | *(aleatoria)* | Contraseña inicial (12+ caracteres, letras y números). **Solo se usa al crear la cuenta**. Si no la defines, se crea con la contraseña inicial `Viexbox-2026` y se te obliga a cambiarla en el primer acceso |
| `ADMIN_EMAIL` | *(vacío)* | Correo del administrador: sirve para entrar y para «¿Has olvidado la contraseña?» |
| `ADMIN_ALLOWED_IPS` | *(todas)* | Lista de IP separadas por comas que pueden usar el panel. Muy recomendable en producción |
| `PUBLIC_URL` | *(vacío)* | Dirección pública de la web (`https://tudominio.com`). Se usa para el enlace del correo de restablecimiento |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | *(vacío)* | Correo saliente para el restablecimiento. Sin `SMTP_HOST`, el enlace sale por la consola del servidor |
| `ADMIN_RESET_TTL_MS` | `1800000` | Validez del enlace de restablecimiento (30 min) |
| `DATABASE_URL` | *(vacío)* | Conexión a **PostgreSQL** (`postgres://usuario:clave@host:5432/base`). Con ella, el pase de batalla usa sus tablas y las cuentas, el panel y la clasificación se guardan en la base de datos (sobreviven a reinicios). Sin ella, todo va a archivos en `DATA_DIR` |
| `DATABASE_SSL` | `auto` | `auto`: TLS salvo en `localhost`; `on` fuerza TLS; `off` lo desactiva (por si tu proveedor no lo admite en la red interna) |
| `DATABASE_POOL` | `8` | Conexiones máximas a PostgreSQL |
| `BP_VIP_PX` | `1500` | Precio del Pase VIP (y de regalarlo), en PX |
| `BP_SKIP_PX` | `120` | Precio por nivel al «Saltar niveles», en PX |
| `BP_XP_DAILY_CAP` | `8000` | XP máxima que una cuenta puede ganar jugando cada día |
| `ACCOUNTS_REG_MAX` | `5` | Cuentas nuevas por IP y hora |
| `PX_DAILY_CAP` | `5000` | PX máximos que una cuenta puede ganar jugando cada día (freno al granjeo entre cuentas) |
| `STRIPE_SECRET_KEY` | *(vacío)* | Clave secreta de Stripe (`sk_live_…`). Sin ella la tienda muestra los paquetes pero no se puede comprar |
| `STRIPE_WEBHOOK_SECRET` | *(vacío)* | Secreto de firma del webhook (`whsec_…`). Sin él se rechaza todo aviso de pago |
| `STORE_CURRENCY` | `eur` | Moneda de la tienda (código de 3 letras) |
| `STORE_PACKS` | *(4 paquetes)* | JSON opcional con tus paquetes: `[{"id":"px500","px":500,"price":99,"tag":""}]` (`price` en céntimos, mínimo 50) |
| `STRIPE_API_BASE` | `https://api.stripe.com` | Solo para pruebas con un Stripe simulado |
| `HISTORY_MIN_SECS` | `20` | Segundos mínimos en una ronda para que cuente en el historial de comportamiento |

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

- **Vistas previas de los mapas:** son capturas reales del juego en `public/maps/map0.jpg` … `map3.jpg` (512×288). Para cambiarlas, sustituye esos archivos manteniendo el nombre (el archivo único las lleva incrustadas al generarlo con `node scripts/build-single.js`).
- **Equipos y nombres:** al entrar te toca al azar el equipo azul o rojo (equilibrado: si un equipo tiene más gente entras en el otro) y sale un cartel grande con tu equipo; no hay fuego amigo. Los verificados (administrador e influencers) llevan el nombre dorado con brillo y el tic azul, visibles para todos; el resto, nombre azul sin brillo.

- **Colores y estilo:** variables CSS al inicio de `public/index.html`.
- **Armas:** lista `WEAPONS` en `public/shared.js` (daño, cadencia, cargador, dispersión, alcance…). Como el servidor usa el mismo archivo, los cambios valen para todos a la vez.
- **Mapas:** lista `MAPS` en `public/shared.js`. Cada mapa es una función que coloca cajas (`b.addBox`, `b.stairs`, `b.perimeter`…). Añade uno y aparecerá en el menú y en el servidor.
- **Reglas:** duración, límite de bajas y tamaño de sala con las variables de entorno de arriba.

## 9. Problemas frecuentes

- **El menú dice «El modo online no está disponible en esta página»:** el navegador no llega al servidor. Comprueba que `https://tudominio/api/status` responde; si usas la opción C, revisa `config.js` y `ALLOWED_ORIGINS`.
- **Conecta y se corta enseguida (nginx):** falta la cabecera de actualización de WebSocket; usa `nginx.conf.example`.
- **`module is not defined in ES module scope` (shared.js):** hay un `package.json` con `"type": "module"` dentro de `public/`. Bórralo: solo debe existir `public/src/package.json`. El servidor ya tolera este caso, pero conviene limpiarlo.
- **«Too Many Requests» o no deja entrar a más de 8 personas:** el servidor ve a todos con la IP del proxy. Define `TRUST_PROXY=1`.
- **Error 403 al conectar el WebSocket:** el dominio desde el que se abre la web no coincide con el de `Host` del proxy, o no está en `ALLOWED_ORIGINS`.
- **Puerto ocupado:** cambia `PORT` o cierra el proceso que use el 3000.

## 9b. Administración del servidor (Viexbox)

El panel está en `/admin`. Solo entra el dueño: usuario `Viexbox` (o el correo del administrador) y su contraseña.

**Primer acceso.** Al arrancar por primera vez, el servidor crea la cuenta con usuario `Viexbox` y contraseña inicial `Viexbox-2026` (o la de `ADMIN_PASSWORD` si la defines, y entonces no se pide cambio). Al iniciar sesión, **desde la pantalla de acceso del propio juego** (escribe `Viexbox` y esa contraseña) o desde `/admin`, te obliga a elegir una definitiva de 12+ caracteres con letras y números. Hasta que la cambies, esa cuenta no tiene ningún poder de administrador. **Cámbiala antes de abrir el servidor al público**: la inicial es conocida. En disco solo se guarda un hash (`data/admin.json`, permisos 600).

**Contraseña perdida.** Tres formas:

1. **«¿Has olvidado la contraseña?»** en la pantalla de acceso. Pide el correo del administrador y envía un enlace de un solo uso, válido 30 minutos. Necesita `ADMIN_EMAIL` y, para que llegue por correo, SMTP. Sin SMTP el enlace y el código salen en la consola del servidor.
2. Desde el servidor: `node scripts/admin-password.js` (genera una nueva) o `node scripts/admin-password.js --password "TuClaveLarga123"`. Con `--email tu@correo.com` también fija el correo. En Docker: `docker exec -it <contenedor> node scripts/admin-password.js`.
3. Dentro del panel, en «Mi cuenta», si aún puedes entrar.

**Configurar el correo con Gmail** (ejemplo): activa la verificación en dos pasos, crea una «contraseña de aplicación» y arranca con

```
ADMIN_EMAIL=tu@gmail.com PUBLIC_URL=https://tudominio.com \
SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_SECURE=1 SMTP_USER=tu@gmail.com SMTP_PASS=la-contraseña-de-aplicación node server.js
```

Quien controle ese buzón controla el panel: protege el correo con verificación en dos pasos.

**Seguridad.** Usa HTTPS siempre (el acceso al panel viaja con un token). Limita el panel con `ADMIN_ALLOWED_IPS` o déjalo tras una VPN. Tras 5 intentos fallidos, la IP se bloquea 5 minutos. Todo lo que haces queda en la pestaña *Auditoría*.

**Qué incluye:** estadísticas generales, chat en directo con filtro, modo lento y bloqueo, baneos por nombre o IP anonimizada, silencios y avisos, reportes de jugadores, historial de partidas con análisis de comportamiento, influencers con tic azul, anuncios, modo mantenimiento, apagado programado, copia de seguridad y auditoría. El administrador aparece con el nombre en dorado neón y tic azul; los influencers, con tic azul (clave personal en Ajustes → «Código de influencer»); las bajas de ambos llevan un efecto dorado.

## 10. Pruebas automáticas

```bash
npm install          # incluye jsdom para las pruebas
npm test
npm run build:single     # genera pixel-play-rusher.html, todo el juego en un solo archivo
```

Incluyen: HUD y mira del francotirador con el cliente real, API y archivos estáticos, protocolo, combate con compensación de latencia, límite de cadencia, anti-teletransporte, fin de ronda y clasificación persistente, el cliente real conectado al servidor real, orígenes y límites por IP. Con `node test/load.js 40 15` simulas carga.
