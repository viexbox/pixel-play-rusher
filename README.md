# Krunxa · versión online

Shooter en primera persona por bloques con **partidas online**, un mapa táctico de cuatro niveles (**Nexus Outpost**), 8 clases, cuchillo y **clasificación global**.
Este paquete contiene el juego (navegador) y un servidor Node.js pequeño que hace de sala de juego.

```
krunxa/
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

- **Con bots, en cualquier sitio:** abre `public/index.html` con doble clic (o sube la carpeta `public/` a tu hosting) y pulsa «Entrenar con bots». También tienes `krunxa.html`, la misma versión en un solo archivo.
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
- **Tienda (pestaña «Tienda» del lobby):** usa **Stripe Checkout**; nunca se guarda ninguna tarjeta. Para activarla: crea tu cuenta de Stripe, define `STRIPE_SECRET_KEY` y `PUBLIC_URL`, añade en Stripe → Desarrolladores → Webhooks el destino `https://tudominio.com/api/store/webhook` con el evento `checkout.session.completed` (y `checkout.session.async_payment_succeeded` si aceptas métodos diferidos) y copia su secreto en `STRIPE_WEBHOOK_SECRET`. **La tienda solo se abre con las tres variables** (`STRIPE_SECRET_KEY`, `PUBLIC_URL` y `STRIPE_WEBHOOK_SECRET`); para comprobarlo abre `/api/status` (debe salir `"store":true`) o mira el registro del servidor (`Tienda: ACTIVADA` o `Tienda: DESACTIVADA. Faltan las variables: …`). PayPal se activa en Stripe → Ajustes → Métodos de pago (cuentas de la UE, Reino Unido, Suiza y Noruega). La tienda ofrece **solo tarjeta y PayPal** (`STRIPE_PAYMENT_METHODS`); para que PayPal funcione hay que activarlo en Stripe → Ajustes → Métodos de pago (disponible para cuentas de Stripe de la UE salvo Hungría, Noruega, Liechtenstein, Reino Unido y Suiza, con una cuenta PayPal Business en esa zona). Sin activarlo, la tienda sigue funcionando solo con tarjeta. El importe lo fija el servidor y los PX solo se acreditan con un aviso de pago firmado, con el importe correcto y una sola vez. **Los reembolsos no descuentan PX automáticamente**: hazlo a mano desde el panel. Vender moneda virtual tiene implicaciones fiscales y de consumo según tu país: revísalas antes de cobrar. Si algún día usas Stripe en modo prueba, recuerda que la tarjeta de prueba es `4242 4242 4242 4242`.
- **Voto de mapa:** con más de un mapa, al acabar una ronda online todos votan el siguiente mapa (con uno solo no aparece); gana el más votado (empate al azar). En el entrenamiento se elige el mapa en la pantalla final.

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

## Cuentas por ID único (UUID)

Cada cuenta se guarda con un **UUID permanente**; el nombre de usuario es solo una etiqueta. Los PX, las estadísticas, los colores, los rangos, las sesiones, los pedidos de la tienda y el progreso del pase de batalla cuelgan del ID, así que cambiar de nombre (o que dos jugadores quieran el mismo) no toca nada de eso.

- **Migración automática.** Las cuentas de versiones anteriores (clave = nombre, id numérico) pasan a UUID en el primer arranque conservando sesiones, PX, pase y pedidos; el id antiguo queda en `legacyId`. En PostgreSQL, además, la migración `002_uuid_users.sql` cambia `user_id` a texto y el servidor reasigna las filas del pase al UUID. **Haz una copia de tus datos (`accounts.json` o la base) antes de la primera vez que arranques esta versión.**
- **Nombres.** Siguen siendo únicos entre cuentas registradas (sin distinguir mayúsculas ni acentos): evita suplantar a otro jugador, sobre todo a administradores e influencers. Si eliges uno ocupado, el registro responde con un error claro y **3 alternativas libres**.
- **Cambiar de nombre.** Botón **Cambiar nombre** junto a «Cerrar sesión» (`POST /api/me/rename`). El primer cambio es libre y los siguientes cada `NAME_CHANGE_DAYS` días. La clasificación sigue a la cuenta por su ID. Un nombre baneado o reservado no se puede usar ni abandonar.
- **Entrar a jugar.** Un invitado (o alguien con la sesión caducada) que pide el nombre de una cuenta **ya no se rechaza**: juega con un nombre libre parecido (`Nombre_482`) y se le avisa. Una cuenta = una sesión de juego: si se abre en otra pestaña, la nueva sustituye a la anterior.
- **Limitación conocida.** Los baneos, el tic de influencer y el rango de administrador del panel siguen siendo por **nombre** (así se gestionan desde el panel); los baneos por IP no cambian.

## Controles, HUD y sensaciones de combate

- **Rueda del ratón / `1` / `2` / `Q`:** cambian entre el arma y el cuchillo en unos 0,11 s. Con el cuchillo en mano el clic golpea (0,55 s entre golpes; el servidor exige 0,48 s), no se dispara, recarga ni apunta, y al reaparecer se vuelve al arma. `V` sigue siendo el golpe rápido desde el arma. Los giros de rueda durante el enfriamiento se descartan para que la inercia de un trackpad no haga rebotar el cambio. Se desactiva en *Ajustes → Cambiar arma con la rueda*.
- **HUD rediseñado:** vida con número grande, barra continua y un **rastro** blanco que enseña el daño recién recibido, alerta roja con vida baja; abajo a la derecha, ranuras de arma (la activa se ensancha y se ilumina), munición grande y barra de recarga.
- **Impacto y daño:** el marcador de impacto se anima (blanco = impacto, dorado = cabeza, rojo con aro = baja); la viñeta roja y la **sacudida de pantalla** son proporcionales al daño recibido, y hay un toque de sacudida al disparar y al golpear con el cuchillo. *Ajustes → Sacudida de pantalla* (0 % la desactiva; también se respeta la preferencia «reducir movimiento» del sistema).
- **Calidad adaptativa:** si el FPS medio queda por debajo de 40 en dos mediciones seguidas (2 s), baja la resolución interna (×2 → ×1,5 → ×1 → ×0,75) y, al final, apaga las sombras. Solo baja, no cambia los ajustes guardados y no actúa en pausa ni con la pestaña oculta.
- **Limitación conocida.** Los demás jugadores ven tu golpe de cuchillo, pero no el cuchillo en tu mano mientras no golpeas.

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

## Novedades: perfiles, Créditos, mercado y movimiento estilo Krunker

**Corrección para influencers.** Un influencer (o administrador) que jugaba con su cuenta quedaba desvinculado de ella y no recibía PX, estadísticas, XP del pase ni clasificación por ID. Ahora recibe todo igual que cualquier jugador (`test/influencer-benefits.test.js`).

**Movimiento y disparo rápidos.** Andar 7,4 · correr 8,8 · agachado 4,2 · salto 8,6 · gravedad 27, aceleración casi instantánea y más control en el aire. Salto con *buffer* (0,12 s), *coyote* (0,08 s) y **bunny hop** (mantén Espacio: cada salto al aterrizar suma impulso hasta ×1,25). Deslizamiento más ágil (espera 0,9 s), apuntado más rápido y recargas un 20 % más cortas. El servidor tolera hasta 13 m/s en horizontal; ningún movimiento legítimo lo supera (deslizamiento ≈ 12,4).

**Dos monedas.**
- **PX** (premium): se compra con dinero real en la tienda y sirve para el pase, colores y recompensas de rango.
- **Créditos (CR)**: solo se ganan jugando (`CR_DAILY_CAP` al día) y vendiendo en el mercado. Es la única moneda del mercado, así no se compran ni se venden objetos por dinero real entre jugadores.

**Mercado de cosméticos** (`server/market.js`, migración `003_market.sql`). Se venden los objetos del pase (skins de armas, cuchillos y banners). Al anunciar, el objeto sale del inventario y queda en depósito; al retirar el anuncio vuelve y al venderse pasa al comprador. Comisión del 10 % (se destruye: sumidero de Créditos), precio mínimo por rareza (común 20 · poco común 60 · raro 150 · épico 400 · legendario 1000) y máximo 8 anuncios por jugador. La compra es atómica (transacción en PostgreSQL) y se protege de dos compradores a la vez. Rutas: `GET /api/market`, `POST /api/market/{list,cancel,buy}`. Panel: `GET /api/admin/market`, `POST /api/admin/market/remove`, `POST /api/admin/credits` (ajuste manual).

**Perfiles y social** (`server/social.js`, migración `004_avatars.sql`). Perfil público con foto, estado, rango, nivel del pase, estadísticas y banner. **Insignia de verificado**: administradores e influencers (por nombre) y las cuentas que marque el administrador (`POST /api/admin/verify {username, verified}`). **Foto**: una de 16 predefinidas o una imagen propia (JPEG/PNG, máx. 60 KB y 512×512; el navegador la reduce a 128×128). Se valida por contenido (no por lo que diga el navegador), se guarda en PostgreSQL (`user_avatars`) o en `DATA_DIR/avatars` y se sirve con `nosniff` y CSP restrictiva. **Amigos**: solicitudes, aceptar, rechazar, cancelar, eliminar, bloquear y denunciar; la conexión (en línea / jugando) solo la ven tus amigos. Las denuncias de perfil las ve el panel (`GET /api/admin/social/reports`) y se puede retirar una foto ofensiva (`POST /api/admin/social/avatar-remove`). Rutas: `GET /api/profile?name=`, `GET /api/avatar?u=`, `GET /api/social`, `POST /api/social/{avatar,status,request,accept,decline,cancel,remove,block,unblock,report}`. Pulsa un nombre de la clasificación para abrir su perfil.

**HUD.** Nuevas opciones en Ajustes: *Tamaño del HUD* (80–120 %) y *HUD compacto* (menos elementos en pantalla). El chat se atenúa solo tras 7 s sin mensajes durante la partida. El menú muestra PX y Créditos.

**Límites conocidos.** Solo son comerciables los objetos del pase (no los colores comprados con PX); no hay bloqueo de intercambio para objetos recién conseguidos; las fotos se moderan a posteriori (denuncia + retirada desde el panel); las fotos se sirven desde el propio servidor, sin CDN.

## Novedades de esta actualización

**Modos de juego** (botón «Modo» del menú; todos por equipos y sin fuego amigo): *Duelo por equipos* (el de siempre), *Capturar zona* (una zona cambia de sitio cada 50 s; suma un punto por segundo el equipo que la controla en solitario), *Solo cuchillos* y *Carrera de armas* (cada baja te da el arma siguiente; en el nivel del cuchillo una baja más gana; si te matan a cuchillo bajas de nivel). La carrera es por equipos, no todos contra todos.

**Clasificatorio y temporadas** (`server/ranked.js`). Solo con cuenta y en Duelo por equipos. Puntuación tipo Elo (colocación en las 10 primeras partidas), 7 ligas (Hierro → Élite), emparejamiento por liga (la diferencia con la liga media de la sala no puede pasar de 1) y −15 puntos por abandonar una partida en marcha. Temporadas de `SEASON_DAYS` (30): al cerrar (sola o desde el panel, `POST /api/admin/ranked/close {confirm:true}`) se pagan Créditos/PX según la mejor liga (mínimo `RANKED_MIN_GAMES` = 5 partidas), se guarda una insignia en el perfil y la puntuación de todos se acerca a 1000.

**Más armas y mapas.** Dos armas nuevas: *Vórtice* (subfusil táctico) y *Centinela* (fusil de batalla: 3 disparos al cuerpo o 2 a la cabeza); entran en la Carrera de armas. Dos mapas nuevos: *Fábrica* y *Cañón*, simétricos, con todos los puntos de aparición alcanzables (comprobado en `test/content.test.js`). Las armas y mapas de siempre conservan su número.

**Eventos temporales** (`server/events.js`). Además del evento diario de PX por arma: un **modo destacado** que rota cada lunes (00:00 UTC) — zona → cuchillos → carrera → duelo — con +50 % de PX y Créditos (`EVENT_FEATURED_MULT`, 1 lo desactiva), y **eventos del administrador** (panel → *Eventos*): nombre, modo y/o arma opcionales, ×1 a ×3 de PX y de Créditos y duración limitada. Varios a la vez se multiplican con un tope de ×3; los topes diarios de PX y Créditos siguen valiendo. El menú enseña los activos con el tiempo que les queda y el resumen de la partida dice cuáles se aplicaron. Ruta pública: `GET /api/events`.

**Cámara de muerte y espectador.** Tras morir se ve a quien te eliminó desde detrás, con su arma, la distancia y la vida que le quedaba. En el panel, «Ver en vivo» en una sala abre `/?spec=<sala>` como espectador (solo administradores) con estadísticas por jugador (precisión, cabezas, correcciones de movimiento, cadencia anómala, ping) y avisos de posibles trampas.

**Mercado y economía** (`server/market.js`, migración `005_market_v2.sql`). Intercambio directo objeto por objeto entre **amigos** (caduca a las 48 h; en una sola transacción). **Historial de precios**: precio de referencia (media, mínimo, máximo y último de los últimos 30 días) al vender y en cada anuncio. **Bloqueo** de `TRADE_LOCK_HOURS` (24) para objetos recién conseguidos (pase, compra o intercambio); retirar un anuncio no reinicia el bloqueo. **Colores de PX** comerciables (los 4 gratuitos no). Los colores viven en la cuenta y no en la tabla de objetos: con PostgreSQL su transferencia no es una única transacción (una caída del servidor justo entre dos pasos podría duplicar o perder un color).

**Robustez.** Al apagar el servidor ahora se vacían también los almacenes de temporadas, eventos, ofertas de intercambio y denuncias de perfil (antes podían perder hasta 1,5 s de cambios).

**Jugar online desde el archivo HTML.** `krunxa.html` no lleva servidor: para el modo online hay que indicarle dónde está el tuyo. Pulsa el botón **«Servidor»** del menú y escribe su dirección (`https://mi-juego.onrender.com`), o abre el archivo con `…/krunxa.html?server=https://mi-juego.onrender.com` (se recuerda en ese navegador; `?server=` vacío lo borra). El servidor acepta las conexiones que vienen de un archivo local (`ALLOW_FILE_ORIGIN=0` lo desactiva) y sigue rechazando las de webs ajenas. La conexión espera hasta 25 s (un servidor gratuito dormido tarda en despertar) y el servidor da `HELLO_TIMEOUT_MS` (20 s) al cliente para saludar; si lo corta por tardar, el cliente reintenta solo. Una sala online necesita al menos 2 jugadores para empezar («Esperando rivales…»).

**Las cuentas no se pierden.** Altas, pagos, PX y Créditos se escriben a disco (o a PostgreSQL) **al instante**. Cada archivo de datos guarda además su última copia buena (`.bak`); si un archivo aparece dañado (corte de luz a mitad de escritura) **nunca se sobrescribe en silencio**: se aparta como `.corrupt-<fecha>`, se recupera la copia buena y el registro lo avisa. Ninguna parte del código borra cuentas. **Importante:** en plataformas que vacían el disco al reiniciar o redesplegar (Render, Railway, Fly…) las cuentas guardadas en archivos **se pierden** salvo que uses PostgreSQL (`DATABASE_URL`) o un disco persistente (`DATA_DIR`); el servidor lo detecta, lo avisa en el registro y en el resumen del panel. Comprobado apagando el servidor en seco (kill -9) en archivos y en PostgreSQL.

**Viewmodel: vaivén y apuntado** (`S.createViewmodel` y `S.viewmodelSight` en `public/shared.js`; script independiente en `viewmodel.js`). Módulo puro que calcula la posición y el giro del arma en primera persona; el motor solo los aplica. **Weapon bobbing senoidal según la velocidad:** la fase avanza con la distancia recorrida (`BOB_STRIDE`), así que la frecuencia sigue a la velocidad (a 7,4 m/s la vertical va a 1,77 Hz; a 3,7 m/s, a la mitad); la amplitud crece hasta `BOB_SPEED_REF` (5 m/s) y se suaviza al parar; vertical = sin(2·fase) y lateral = sin(fase) con un poco de ladeo y cabeceo; en el aire se apaga y al apuntar queda al 15 %. **ADS con lerp:** el factor se acerca a su objetivo con un lerp exponencial independiente del framerate (`ADS_RATE`, ≈ 0,1 s al 90 %) y la posición es `lerp(cadera, ADS, suavizado(ads))`. La posición ADS se **deriva del punto de mira del modelo** (`sight`, en coordenadas del arma): el arma se desplaza justo lo necesario para que ese punto caiga en el centro de la pantalla (error < 1 mm incluso corriendo). Las armas sin mira se centran y suben 3 cm con transición suave (antes daba un salto). `extra` suma retroceso, recarga, cambio de arma o deslizamiento. `test/viewmodel.test.js` lo comprueba, incluida la coincidencia con las matemáticas de Three.js y las 11 armas del juego.

**Mapa en lotes (menos draw calls)** (`public/client.js`, bloque «MAPA EN LOTES»). Antes cada caja del mapa y de la decoración era su propia `THREE.Mesh`: 204–416 por mapa (1.771 en los seis), hasta 99 materiales distintos en un mapa y otras tantas mallas en el pase de sombras. Ahora cada caja se convierte en geometría ya colocada, se agrupa por **material y tipo de sombra** y al terminar el mapa cada grupo se fusiona en **una sola malla** con `mergeGeometries` (propio: esta versión de Three.js no trae `BufferGeometryUtils`). El color de cada caja pasa a **color por vértice** (el shader ya multiplica color de material × color de vértice, así que es idéntico): un material por textura en vez de uno por color. Resultado: **1.771 → 45 mallas** en los seis mapas (5–10 por mapa), 4–9 materiales por mapa y los mismos 21.192 triángulos. No se usa `InstancedMesh` porque las cajas tienen tamaños distintos y su textura se repite según el tamaño (UV en metros). Medido con WebGL real: draw calls por fotograma de 75–144 a 27–32 (incluye cielo, bots y arma) y coste de envío en CPU −55 % a −82 %; el aspecto es idéntico salvo un 0,009 % de píxeles (bordes y caras coplanares que ya hacían z-fighting). **Compromiso:** al fusionar se pierde el descarte por objeto de Three.js, así que se procesan siempre todos los triángulos del mapa (2.400–5.000); en una GPU real es irrelevante, pero un renderizador por software lo nota. `test/mapbatch.test.js` lo comprueba (recuentos, esquinas y color caja a caja, fusión y liberación de memoria).

**Game Feel: retroceso visual de cámara y FOV dinámico** (`public/client.js`, bloque «GAME FEEL»). **Retroceso procedural:** cada disparo da un impulso a la cámara (arriba, un poco de lado, ladeo y un pequeño tirón hacia atrás). El suavizado es en dos etapas con `slerp`/`lerp` independientes del framerate: la cámara **sube rápido** hacia el impulso (`RECOIL_RISE`) y el impulso **vuelve despacio** a cero (`RECOIL_RETURN`), sin rebotes; con fuego automático se acumula hasta `RECOIL_MAX` (8°) y `BACK_MAX` (7 cm). Un disparo del Asalto sube la cámara ≈1,1° y vuelve en menos de 1 s. **Es solo visual:** se aplica al final del fotograma y las balas y los golpes de cuchillo salen de `p.yaw/p.pitch` (no de la cámara), así que nunca desvía un disparo. Al apuntar baja un 40 %. **FOV dinámico:** por encima de `FOV_SPEED_MIN` (9 m/s) el campo de visión se abre hasta «FOV dinámico» grados (por defecto +8°; 5,5° a 11,2 m/s) y llega al máximo a `FOV_SPEED_FULL` (12,5 m/s); sumado al del deslizamiento no pasa de +10° y no actúa al apuntar. Ajustes → «Retroceso de cámara» (0–100 %) y «FOV dinámico al ir rápido» (0–10°); ambos se desactivan con «reducir movimiento» del sistema.

**Movimiento: deslizamiento y slide hop** (`S.MOVE`, `S.startSlide`, `S.moveStep` en `public/shared.js`). Agacharse (C) corriendo empieza un deslizamiento con impulso de entrada (11–12,4 m/s, nunca te frena). **Fricción:** en suelo normal la velocidad se ajusta a la deseada a 95 m/s² (casi instantáneo); al deslizarse solo hay un rozamiento suave (≈ 6 m/s², unas **15 veces menos**) y no se puede corregir el rumbo. **Slide hop:** saltar durante el deslizamiento, o hasta `SLIDE_GRACE` (0,22 s) después de que termine, **mantiene la dirección de la velocidad horizontal** y la multiplica por `SLIDE_JUMP` (×1,2), con tope `MAX_H` (15,5 m/s). En el aire de ese salto casi no hay rozamiento (`AIR_DRAG`) y se puede girar sin perder velocidad (`AIR_TURN`); salir por un borde deslizándose también conserva el impulso; al aterrizar vuelve la fricción normal. **Coyote time** de `COYOTE` (0,1 s) y buffer de salto de `JUMP_BUF` (0,12 s). Todos los parámetros están en la tabla `S.MOVE`; el cliente, las pruebas y el servidor (que vigila la velocidad con `MAX_H + 0,5`) usan las mismas funciones. `test/movement.test.js` lo comprueba con la física real, sin navegador.

**Panel de administración renovado** (`server/adminplus.js`, `public/admin.js`). **Verificados ✔**: escribes el nombre de la cuenta y pulsas «Verificar ahora»; al instante (incluso si está jugando) tiene el tic azul, el efecto dorado en las bajas, el chat aunque esté bloqueado por la moderación y los beneficios que configures (bono de PX y Créditos por partida, +20 % por defecto y con los topes diarios de siempre; regalo único al verificar). **No hay ningún código.** La persona tiene que haberse registrado antes. Las claves de influencer antiguas siguen funcionando y se pueden pasar a verificación por cuenta. **Monedas y ventas**: dar, quitar o fijar **PX y Créditos** por nombre (nunca saldo negativo, con motivo y en la auditoría), **ingresos con dinero real** (hoy, 7 y 30 días, total, gráfico de 30 días, mejores compradores, compra media), registrar **ventas manuales** (Bizum, PayPal…) que entregan los PX, **reembolsos** (retira los PX; el dinero se devuelve desde tu pasarela de pago), pedidos en CSV y el registro de movimientos de ambas monedas. **Cuentas**: búsqueda, saldos, correo verificado o no, monedas, verificar, código de recuperación para quien perdió el acceso y eliminar (con plazo o al instante). **Antes de lanzar**: lista de comprobaciones (almacenamiento permanente, correo, datos legales, términos, HTTPS, copias, antitrampas…) que dice qué falta y qué variable configurar.

**Cuenta ligada al correo y recuperable** (`server/accountsec.js`, `public/account.js`). Al registrarse hay que aceptar los Términos y la Privacidad (`/terminos`, `/privacidad`, con los datos de `LEGAL_OWNER`, `LEGAL_EMAIL` y `LEGAL_COUNTRY`; son textos base: revísalos con un profesional). Se envía un código de 6 cifras al correo (15 min, 5 intentos, un envío por minuto, límites por cuenta e IP). **Solo un correo verificado sirve para recuperar la cuenta**, así nadie puede quedarse con una registrada con un correo ajeno. En el juego, **Ajustes → Mi cuenta** (o el perfil): verificar el correo, cambiarlo (código al correo nuevo y aviso al antiguo), cambiar la contraseña (cierra las otras sesiones) y **eliminar la cuenta con `ACCOUNT_DELETE_DAYS` (7) días para arrepentirse**; pasado el plazo se borra todo (cuenta, foto, amigos, anuncios, pase, clasificación). En la pantalla de acceso: «¿Has olvidado tu contraseña?» (código por correo; la respuesta es igual exista o no la cuenta). **Necesita SMTP** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; sirve Brevo, Resend, Mailgun o Gmail con contraseña de aplicación). **Sin SMTP** no hay verificación ni recuperación por correo: el administrador puede dar a un jugador un código de recuperación (panel → cuentas, `POST /api/admin/accounts/reset-code`) y marcar un correo como verificado. Las cuentas anteriores quedan «sin verificar» y el menú les avisa. `REQUIRE_TERMS=0` desactiva la casilla obligatoria (solo para pruebas). `/healthz` responde «ok» para el control de salud del hosting.

**Bots de relleno** (`FILL_BOTS`, 4; 0 = sin bots · `BOT_SKILL`, 0,5). Una sala **no clasificatoria** con al menos 1 jugador real se completa con bots hasta `FILL_BOTS` jugadores en total; se van según entran personas. Juegan con las mismas reglas (armas, daño, muros), también a cuchillo y capturando la zona. **Una ronda con menos de 2 jugadores reales no da PX, Créditos, XP del pase ni estadísticas, y los bots no entran en la clasificación**: así nadie puede «granjear» contra ellos. En clasificatorio nunca hay bots.

**Antitrampas: paredes** (`WALL_CHECK`, activo por defecto). Además de la velocidad, los saltos y los límites, el servidor rechaza cualquier posición que deje el cuerpo dentro de un muro o que lo atraviese en un solo paso (comprobado con la misma física del cliente: jugadores legítimos en tres mapas, 0 correcciones; saltos a través de un muro de 2 m, 12 de 12 rechazados). Al tramposo se le devuelve a su sitio (no se le expulsa: un lag legítimo no debe echar a nadie); cada corrección cuenta en «Corr.» del espectador y queda una línea en el registro cada 25 intentos.

**Clasificatorio con poca gente** (`RANKED_WIDEN_SECS`, 30). Una sala con menos de 2 jugadores acepta ligas cada vez más lejanas cuanto más espera (+1 liga cada 30 s, hasta 6), y entre las salas válidas se elige la de liga más cercana. Una sala con 2 o más jugadores no se ensancha.

**Copias de seguridad automáticas** (`server/backup.js`). Cada `BACKUP_EVERY_HOURS` (24; 0 = desactivadas) se guarda una copia completa en `BACKUP_DIR` (por defecto `DATA_DIR/backups`), conservando `BACKUP_KEEP` (7). Con PostgreSQL vuelca todas las tablas (y el valor de cada contador de ids); con archivos, todo `DATA_DIR`. `BACKUP_PASSPHRASE` las cifra (AES-256-GCM). Panel → *Copias de seguridad*: crear, descargar (auditado) y borrar. Restaurar con el servidor parado: `node scripts/restore-backup.js <copia> --yes` (`DATABASE_URL` para PostgreSQL o `DATA_DIR` para archivos). Una copia en el mismo servidor no protege si ese servidor se pierde: usa otro volumen o descarga copias.

**Incluido pero desactivado por defecto:** moderación de fotos de perfil (`AVATAR_MODERATION=hold|auto`, con `AVATAR_MODERATION_URL`) y dirección de CDN para las fotos (`AVATAR_CDN_URL`). Sin configurar, las fotos se ven al momento como siempre.

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `KNIFE_KILL_LIMIT` | `40` | Bajas para ganar en «Solo cuchillos» |
| `ZONE_LIMIT` / `ZONE_MOVE_SECS` | `160` / `50` | Puntos para ganar en «Capturar zona» y cada cuánto cambia de sitio |
| `SEASON_DAYS` | `30` | Duración de una temporada clasificatoria |
| `RANKED_MIN_GAMES` | `5` | Partidas clasificatorias para cobrar el premio de temporada |
| `TRADE_LOCK_HOURS` | `24` | Bloqueo de objetos recién conseguidos antes de venderlos o intercambiarlos |
| `EVENT_FEATURED_MULT` | `1.5` | Bonificación del modo destacado de la semana (1 = desactivado) |
| `EVENT_MAX_HOURS` | `168` | Duración máxima de un evento lanzado desde el panel |
| `ALLOW_FILE_ORIGIN` | `1` | Aceptar conexiones de una página abierta desde un archivo local (0 = no) |
| `HELLO_TIMEOUT_MS` | `20000` | Tiempo que se da al cliente para saludar tras conectar |
| `REQUIRE_TERMS` | `1` | Exigir aceptar términos y privacidad al crear la cuenta |
| `ACCOUNT_DELETE_DAYS` | `7` | Días de plazo para arrepentirse al eliminar una cuenta |
| `LEGAL_OWNER` / `LEGAL_EMAIL` / `LEGAL_COUNTRY` | (vacío) / (vacío) / `España` | Datos del titular en las páginas legales |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | (vacío) | Correo para códigos de verificación y recuperación |
| `FILL_BOTS` / `BOT_SKILL` | `4` / `0.5` | Bots de relleno en salas no clasificatorias |
| `WALL_CHECK` | `1` | Rechazar movimientos que atraviesan paredes (0 = desactivar, solo para pruebas con bots) |
| `RANKED_WIDEN_SECS` | `30` | Segundos de espera para ampliar una liga el emparejamiento clasificatorio |
| `BACKUP_EVERY_HOURS` / `BACKUP_KEEP` / `BACKUP_DIR` / `BACKUP_PASSPHRASE` | `24` / `7` / `DATA_DIR/backups` / (vacío) | Copias de seguridad automáticas |

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

**3. Sube el proyecto** (por ejemplo a `/opt/krunxa`) y prepara las dependencias:

```bash
cd /opt/krunxa
npm install --omit=dev
```

**4. Déjalo funcionando siempre con PM2:**

```bash
sudo npm install -g pm2
pm2 start server.js --name krunxa
pm2 save && pm2 startup     # ejecuta el comando que te muestre para arrancar al reiniciar
```

**5. Activa HTTPS con Caddy.** Copia `Caddyfile.example` a `/etc/caddy/Caddyfile`, cambia `midominio.com` por tu dominio y ejecuta `sudo systemctl reload caddy`.

**6. Abre los puertos 80 y 443** en el cortafuegos (`sudo ufw allow 80,443/tcp`). No abras el 3000: solo lo usa Caddy en local.

Comprueba `https://midominio.com`: el menú debe mostrar «N jugadores conectados». Salud del servidor: `https://midominio.com/healthz`.

**Actualizar más adelante:** sube los archivos nuevos y ejecuta `pm2 restart krunxa`.

## 4. Opción B: plataformas (Render, Railway, Fly.io)

> **Railway:** crea un volumen montado en `/data` y define `RAILWAY_RUN_UID=0` (los volúmenes son de root y el contenedor arranca como usuario normal, si no falla al guardar), `TRUST_PROXY=1`, `ADMIN_PASSWORD` y `PUBLIC_URL`. Genera un dominio en *Settings → Networking*.

1. Sube este proyecto a un repositorio de GitHub.
2. Crea un «Web Service» desde ese repositorio. Comando de compilación: `npm install --omit=dev`. Comando de arranque: `npm start`.
3. **Disco persistente:** monta un volumen y pon la variable `DATA_DIR` con su ruta (por ejemplo `/data`). Sin él, la clasificación se borra en cada despliegue.
4. **Dominio propio:** en el panel de la plataforma añade tu dominio; te dará un registro **CNAME** (o A) para crear en tu DNS. El HTTPS lo pone la plataforma.
5. Los planes gratuitos suelen «dormir» el servicio tras un rato sin visitas, lo que interrumpe las partidas. Para jugar en serio usa un plan de pago o un VPS.

También hay un `Dockerfile` listo por si la plataforma o tu VPS trabajan con contenedores: `docker build -t krunxa . && docker run -d -p 3000:3000 -v krunxa-data:/data krunxa`.

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
| `MATCH_TIME` | `300` | Duración de cada partida en segundos (5 min) |
| `KILL_LIMIT` / `TEAM_KILL_LIMIT` | `40` / `60` | Bajas para terminar antes de tiempo (entrenamiento / duelo por equipos) |
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
| `NAME_CHANGE_DAYS` | `7` | Días de espera entre cambios de nombre de una cuenta (el primer cambio es libre; `0` = sin espera) |
| `BP_VIP_PX` | `1500` | Precio del Pase VIP (y de regalarlo), en PX |
| `BP_SKIP_PX` | `120` | Precio por nivel al «Saltar niveles», en PX |
| `BP_XP_DAILY_CAP` | `8000` | XP máxima que una cuenta puede ganar jugando cada día |
| `ACCOUNTS_REG_MAX` | `5` | Cuentas nuevas por IP y hora |
| `PX_DAILY_CAP` | `5000` | PX máximos que una cuenta puede ganar jugando cada día (freno al granjeo entre cuentas) |
| `CR_DAILY_CAP` | `4000` | Créditos máximos que una cuenta puede ganar jugando cada día |
| `AVATAR_GAP_MS` | `20000` | Espera mínima entre dos cambios de foto de perfil de la misma cuenta |
| `STRIPE_SECRET_KEY` | *(vacío)* | Clave secreta de Stripe (`sk_live_…`). Sin ella la tienda muestra los paquetes pero no se puede comprar |
| `STRIPE_WEBHOOK_SECRET` | *(vacío)* | Secreto de firma del webhook (`whsec_…`). Sin él se rechaza todo aviso de pago |
| `STRIPE_PAYMENT_METHODS` | `card,paypal` | Métodos de pago que ofrece la tienda: **solo tarjeta (incluye Apple Pay y Google Pay) y PayPal**, aunque tengas otros activados en Stripe. Pon `auto` para que decida el panel de Stripe. Si Stripe rechaza PayPal (aún sin activar en tu cuenta), la tienda cobra solo con tarjeta y lo anota en el registro |
| `STRIPE_PAYMENT_METHODS` | `card,paypal` | Métodos de pago que ofrece la tienda: por defecto **solo tarjeta (con Apple Pay y Google Pay) y PayPal**, sin depender de lo activado en el panel de Stripe. `auto` = los que tengas activados en Stripe. Si tu cuenta de Stripe aún no tiene PayPal activado, la tienda no se cae: cobra solo con tarjeta y lo avisa en el registro |
| `STORE_CURRENCY` | `eur` | Moneda de la tienda (código de 3 letras) |
| `STORE_PACKS` | *(4 paquetes)* | JSON opcional con tus paquetes: `[{"id":"px500","px":500,"price":99,"tag":""}]` (`price` en céntimos, mínimo 50) |
| `STRIPE_API_BASE` | `https://api.stripe.com` | Solo para pruebas con un Stripe simulado |
| `HISTORY_MIN_SECS` | `20` | Segundos mínimos en una ronda para que cuente en el historial de comportamiento |

## 7. Cómo funciona y qué límites tiene (leer antes de abrirlo al público)

- **Salas:** cada mapa tiene sus propias salas. Con un solo jugador el reloj se detiene hasta que entra alguien más. Al terminar cada partida se guardan las puntuaciones y empieza otra.
- **Quién decide qué:** el servidor decide vida, daño, bajas, munición, cadencia y reapariciones, y comprueba cada disparo contra las posiciones de los rivales en el momento en que tú los veías (compensación de latencia de hasta ~450 ms). **El movimiento lo calcula el navegador de cada jugador**; el servidor rechaza movimientos imposibles (teletransportes o velocidad excesiva) y limita los límites del mapa, pero un tramposo decidido podría, por ejemplo, ir algo más rápido dentro de esos márgenes o atravesar paredes. Para un juego entre amigos y comunidad pequeña es un compromiso razonable; para competiciones con premios haría falta un servidor que simule también el movimiento.
- **Clasificación:** guarda tu mejor partida por mapa y nombre (al arrancar se descartan las entradas de mapas que ya no existen). **No hay cuentas ni contraseñas**: cualquiera puede usar el nombre de otro, y los nombres no se moderan (solo se limpian caracteres raros y se limita la longitud). Si abres el juego al público, plantéate revisar `data/leaderboard.json` de vez en cuando.
- **Carga:** en una prueba con 40 jugadores simulados repartidos en 4 salas, el servidor usó ~4 % de un núcleo y ~3 Mbit/s en total (en el entorno donde lo probé). No lo he probado con cientos de jugadores ni con conexiones reales de internet.
- **Chat:** los mensajes se limpian (sin `<` `>` ni caracteres de control, máx. 120 caracteres, un mensaje cada 0,7 s), pero **no hay filtro de insultos ni moderación**.
- **Un solo proceso:** no hay balanceo entre varios servidores; las salas viven en la memoria de esa instancia. Si se reinicia, las partidas en curso se cortan (la clasificación se conserva).
- **HTTPS:** si la web va por `https`, el WebSocket va por `wss` automáticamente. Sin HTTPS los navegadores modernos bloquearán algunas funciones.
- **Fuentes:** la página carga las fuentes desde Google Fonts. Si quieres evitar peticiones a terceros (por privacidad/RGPD), elimina el `<link>` de fuentes de `index.html`; el juego usa fuentes del sistema como alternativa.
- **Marca y contenido:** Krunxa es un juego original: el código, los mapas y las armas están escritos desde cero y usan tipos de arma genéricos. No incluye recursos de Krunker.io ni de nadie más.

## 8. Personalizar

- **Vista previa del mapa:** es una captura real del juego en `public/maps/map0.jpg` (512×288). Para cambiarlas, sustituye esos archivos manteniendo el nombre (el archivo único las lleva incrustadas al generarlo con `node scripts/build-single.js`).
- **Equipos y nombres:** al entrar te toca al azar el equipo azul o rojo (equilibrado: si un equipo tiene más gente entras en el otro) y sale un cartel grande con tu equipo; no hay fuego amigo. Los verificados (administrador e influencers) llevan el nombre dorado con brillo y el tic azul, visibles para todos; el resto, nombre azul sin brillo.

- **Colores y estilo:** variables CSS al inicio de `public/index.html`.
- **Armas:** lista `WEAPONS` en `public/shared.js` (daño, cadencia, cargador, dispersión, alcance…). Como el servidor usa el mismo archivo, los cambios valen para todos a la vez.
- **Mapas:** lista `MAPS` en `public/shared.js` (hoy solo **Nexus Outpost**). Cada mapa es una función que coloca cajas: `b.addBox`, `b.box(x0, x1, z0, z1, y0, y1, color, tag)` por rangos y `b.run(dir, a, c, w, n, y0, rise, color, tag)` para escaleras rectas (`tag` fija la textura: `glass`, `helipad`, `crate`…). Un mapa puede declarar además `spawns` (apariciones por equipo), `zones` (zonas del modo captura, con altura) y `areas` (nombres para el rótulo «estás en…»). Añade uno y aparecerá en el menú y en el servidor; con varios mapas vuelve el voto de fin de ronda.
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
npm run build:single     # genera krunxa.html, todo el juego en un solo archivo
```

Incluyen: HUD y mira del francotirador con el cliente real, API y archivos estáticos, protocolo, combate con compensación de latencia, límite de cadencia, anti-teletransporte, fin de ronda y clasificación persistente, el cliente real conectado al servidor real, orígenes y límites por IP. Con `node test/load.js 40 15` simulas carga.


## Controles (estándar Krunker)

WASD mover, Espacio saltar (una pulsación = un salto: hay que soltar y volver a pulsar), Mayús agacharte/deslizarte (ya no hay una tecla de correr aparte: se corre siempre), clic izquierdo disparar, clic derecho apuntar, R recargar, Q sacar el cuchillo o golpear si ya lo tienes, E volver al arma principal. El slide-hop, el control en el aire y el bunny hop con impulso creciente (`public/shared.js`, `startSlide`/`moveStep`) no cambiaron: solo el mando que los dispara. El encargo original que dio lugar a este remapeo está guardado tal cual en [`docs/prompt-controles-krunker.md`](docs/prompt-controles-krunker.md). Prueba: `test/controls-remap.test.js`.

## Bloqueo del puntero: libre en la tienda, recuperado al reaparecer

Al morir se libera el cursor (`document.exitPointerLock()`), para poder usar la tienda con el ratón; al reaparecer se vuelve a pedir el bloqueo automáticamente, sin que el jugador tenga que hacer clic. Mientras se ve la tienda, ni un clic ni la tecla Escape vuelven a capturar el ratón o abren la pausa por accidente; estando vivo, perder el bloqueo (p. ej. Alt+Tab) sigue abriendo la pausa, como antes. Prueba: `test/pointerlock.test.js` (11 comprobaciones, con una simulación fiel de la API del navegador, no solo de que se llame a una función).

## Tienda de armas en la pantalla de reaparición

Al morir aparece la tienda (`#shop` en `public/index.html`): 8 tarjetas con icono, precio en **Cash**, estadísticas (DMG, RPM, RNG, ACC) y botón de compra. Es la única forma de cambiar de arma tras morir — ya no se puede con las teclas 1-9.
- **Cash:** dinero de la partida (`S.CONST.SHOP_START_CASH`, 800 al empezar cada ronda), se gana matando (`S.CONST.SHOP_KILL_CASH`, 350 por baja) y se descuenta al comprar. No es PX ni Créditos: no se guarda entre partidas.
- **Servidor:** valida el precio y el dinero (mensaje `buy`); el cliente nunca decide si una compra es válida. El arma comprada se equipa en el próximo respawn (`nextCls`), igual que ya hacía el cambio de clase gratuito.
- **`S.SHOP`** (en `public/shared.js`): ocho armas ya existentes del juego con su precio; `S.shopStats(arma)` calcula DMG/RPM/RNG/ACC a partir de los números reales del arma. Añadir un arma a la tienda es una línea.
- **Pruebas:** `test/shop.test.js` (27 comprobaciones): economía en el servidor real (dinero inicial, recompensa por baja, compras válidas e inválidas, reinicio por ronda) y la tienda en el cliente (8 tarjetas, botón deshabilitado sin dinero suficiente, sin atajo de teclado).

## Nexus Outpost (mapa único)

Complejo táctico amurallado de 100 × 100 m con cuatro niveles (suelo, plaza a 1,8 m, cubierta central y azoteas a 3,6 m, tejados a 5,4 m) unidos por escaleras de peldaño 0,45 m (la física ya sube hasta 0,55 m: no hace falta saltar). Zonas: **Spawn Red** y **Spawn Blue** (cada equipo aparece en su base), **South Alley** y **Tunnel Passage**, **Main Plaza** con **Sniper Perch** y **Office Block**, **Central Courtyard** y **Lower Plaza** (cajas y contenedores), **Reactor Complex** (cubierta central con pasarela alta), **East Roof** (Helipad A), **Rooftop Network** (puentes), **Helipad B**, **West Tower Roof**, **Tech Hub**, **Armory** (con interior) y **Capture Point** (azotea con bandera).
- **Rótulo «estás en…»:** bajo el reloj aparece el nombre de la zona donde estás (`S.areaAt`, definido por `areas` en el mapa).
- **Capturar zona:** rota entre Central Courtyard, Main Plaza, Lower Plaza, Reactor Complex y Capture Point. La zona tiene altura: quien está debajo de una azotea no captura. Con bots en la sala solo se usan las zonas a ras de suelo.
- **Bots:** siguen una rejilla de navegación de 1 m con capas por altura (`S.buildNav`, `S.navField`, `S.navDir`) para rodear paredes, cruzar puertas y túneles, y **subir escaleras hacia zonas elevadas** (Main Plaza, Reactor Complex, Capture Point); sin objetivo, rondan cerca de los rivales. Si se quedan un momento sin avanzar de verdad hacia su objetivo (borde de una escalera), saltan y desvían la dirección para no quedarse en bucle.
- **Pruebas:** `test/nexus.test.js` comprueba las zonas nombradas, las alturas, que se llegue caminando (sin saltar) a todas desde las dos bases sin trampas, las apariciones por equipo, las zonas con altura en el servidor real, la limpieza de la clasificación y la navegación de los bots.
