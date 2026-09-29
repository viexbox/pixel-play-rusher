# Krunxa (repo `pixel-play-rusher`)

Shooter FPS de bloques en el navegador (estilo Krunker.io), con servidor Node propio. Nombre público: **Krunxa**, dominio **https://www.krunxa.com**.

## Cómo está montado
- **Servidor**: `server.js` (HTTP + WebSocket `/ws`, salas, disparos con compensación de latencia) y `server/*.js` (cuentas, pase de batalla, mercado, admin, social, eventos…). Node ≥ 18, sin compilación.
- **Cliente**: `public/client.js` (Three.js r128 en `public/vendor`, un IIFE grande), `public/shared.js` (armas, mapas, física, catálogos; lo usan cliente y servidor), `public/index.html`, `public/i18n.js` (es → en).
- **Despliegue**: Railway desde la rama `main` de GitHub (Dockerfile). Base de datos **PostgreSQL** (`DATABASE_URL`); migraciones en `server/migrations/NNN_*.sql`, se aplican solas al arrancar.
- **Pagos**: solo **PayPal manual** (`PAYPAL_EMAIL`): el jugador paga con un código `KX-XXXXXX`, abre ticket en Discord y el admin entrega los PX en el panel (Monedas y ventas). Stripe existe en el código pero está desactivado (sin variables).
- Variables importantes en Railway: `PUBLIC_URL=https://www.krunxa.com`, `DATABASE_URL`, `PAYPAL_EMAIL`, `LEGAL_OWNER`, `LEGAL_EMAIL`. Documentadas en `README.md` (sección 6 y siguientes).

## Convenciones
- Todo en **español**: comentarios, mensajes de commit, textos de la interfaz. Los comentarios de cambios llevan etiqueta entre corchetes (`[MAPAS 2]`, `[TRAJES]`, `[ARMAS HD]`…).
- Cada texto nuevo de la interfaz necesita su traducción en `public/i18n.js` (hay un test que lo comprueba).
- Los objetos de pago (mascotas, trajes) los decide y cobra **el servidor**; el cliente nunca decide qué lleva un jugador.
- Mapas: se construyen con cajas en `shared.js` (colisiones del servidor y dibujo del cliente). El cliente los fusiona en lotes: cada mapa debe quedarse en ≤ 24 mallas (test `mapbatch`). Lo que se anima (gallinas, balón, agua) va en `mapLife`, aparte.

## Pruebas
- `npm test` ejecuta ~65 archivos de `test/` en cadena (tarda ~15 min). Para uno solo: `WALL_CHECK=0 REQUIRE_TERMS=0 FILL_BOTS=0 node test/<nombre>.test.js`.
- Varios tests también prueban PostgreSQL si hay uno en `127.0.0.1:5432` (usuario `ppr`, contraseña `ppr_test`, base `ppr_test`); si no, solo archivos.
- `test/fillbots.test.js` es intermitente (bots aleatorios): si falla, repetirlo.

## Hecho recientemente
- Antitrampas: ping medido por el servidor; disparos fuera de la mira contados (`AIM_CHECK=1` los descarta).
- SEO (meta, Open Graph, robots, sitemap), PayPal + Discord, armas detalladas por código (`GUN_BUILDERS`), mascotas nuevas, trajes (`S.OUTFITS`, migración 007), calidad gráfica alta (`cfg.hq`).
- Salas: `findRoom` une a un jugador con una sala del mismo modo aunque haya elegido otro mapa, si no hay nadie en el suyo.
- Cuchillos nuevos (`KNIFE_SKINS` con `kind`, `ru` y `fx`): mariposa, karambit, bayoneta, daga, machete; `knifeMesh()` en client.js (perfiles extruidos, largo por modelo en `BLADE_LEN`), luces animadas en `tickKnives()`, inspección con F. Se consiguen en el **evento de la ruleta** (`S.KNIFE_ROULETTE`: precio por tirada y peso por rareza; `S.rouletteOdds()`; `/api/bp/knife-spin`, nunca repetidos). Los demás ven tu cuchillo (`equippedLook().knife`).
- Panel admin → Cuentas → «Objetos»: regalar o quitar cuchillos, trajes, mascotas, skins y banners (`/api/admin/bp/items|give|take`, queda en la auditoría).
- Trajes con efectos (`OUTFITS` con `ru: 1`: Neón, Oro Yakuza, Dragón Imperial, Espectro Ártico; `fxOutfitBody()`/`fxMats()` en client.js) en la **Ruleta de trajes** (`S.OUTFIT_ROULETTE`, `/api/bp/outfit-spin`). Las dos ruletas usan `spin()` en battlepass.js y `renderRoulette(kind)` en el cliente. El karambit gira sobre la anilla al sacarlo (`setKnifeDraw`).
- Móvil: controles táctiles (`TOUCH`, `initTouch()` en client.js: joystick, mirar arrastrando, botones; sin bloqueo de puntero) y la interfaz se reduce con `zoom` (`--uiz`) para que quepa. Test `touch.test.js`.
- Móvil: `public/shell.js` (en `<head>`) convierte la página en un marco: el juego va en un iframe `?embed=1` de al menos 720 px de alto, escalado y girado 90° si el móvil está en vertical. La página de fuera no arranca el juego (`window.__PPR_SHELL`: cada script lo comprueba). No se usa con ratón ni para buscadores. Test `shell.test.js`.
- Invitaciones: botón «🎁 Invita y gana PX» (`openReferral()` en client.js), enlace `?ref=CÓDIGO` que se guarda en `ppr.ref` y se manda al registrarse; `GET /api/me/referral`; premio en `awardMatch` al jugar `REF_GAMES` (3) partidas con premio: `REF_PX_INVITER` (300) y `REF_PX_FRIEND` (200). No cuenta con la misma conexión ni más de `REF_DAY_MAX` (5) al día. Test `referral.test.js`.
- SEO: `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` ponen la etiqueta de verificación en la página (marcador `<!--__VERIFY__-->` en index.html). Test `seo-verify.test.js`. La web pública es `https://www.krunxa.com` (Railway Pro; DNS en Cloudflare, SSL «Full»); `https://krunxa.up.railway.app` sigue funcionando y es la que usa el paquete de CrazyGames.
- Premio diario (`dailyInfo/dailyClaim` en accounts.js, `POST /api/me/daily`, `DAILY_PX`; ventana `openDaily()` al entrar) y tutorial de la primera partida (`TUT`, `tickTutorial()` en client.js; `cfg.tutDone`, se repite desde Ajustes). Test `daily-tutorial.test.js`.
- Anuncios (`ADS_PROVIDER=h5|test`, `ADS_CLIENT`, `ADS_SLOT`): banner y botón «Ver anuncio · +PX» en la pantalla de muerte (`onDeathAds()`/`watchAd()` en client.js; H5 Games Ads `adBreak({type:'reward'})`); premio en `POST /api/me/adreward` con tope diario y espera. La CSP abre los dominios de Google solo con `h5`. Test `ads.test.js`. Para activarlo de verdad hace falta dominio propio + cuenta de AdSense aprobada. Con `ADS_CLIENT` (aunque `ADS_PROVIDER` esté vacío) se sirve `/ads.txt` y la etiqueta `google-adsense-account` para que AdSense verifique la web (test `seo-verify.test.js`). La web ya va en `https://www.krunxa.com` (Railway Pro, DNS en Cloudflare con SSL «Full»).

- Miras estilo Krunker: visor negro con dos líneas finas (`#scope`, igual para francotirador, ACOG, Precisión y Centinela); punto rojo y holo = lente redonda con aro oscuro en HTML (`#optic .orf`) y el arma algo más baja (`adsSightY`). Antes: el punto rojo y la holográfica van en un grupo (`gun.userData.sight`) que se oculta al apuntar y queda la retícula `#optic`; la mira de hierro pone un punto blanco pequeño (`#optic[data-k="iron"]`); Precisión y Centinela (`look.scope` sin `optics`) usan la vista de visor ACOG (`scopeKind`). Test en `optics.test.js`. Enlace de Discord: `https://discord.gg/zwz5xzG9M`.

- Mapas: **Tormenta de Arena** (0) y **Base Glaciar** (1). Castillo Real, Barrio Arcoíris y Puerto Industrial se quitaron (`LB_VERSION = 3`; su decoración y sus miniaturas también); las gallinas y el balón (`mapLife`) están ahora en la plaza de Tormenta de Arena. Miniatura `public/maps/map0.jpg` (512×288). Los nombres de las zonas (`areas`, `zones`) van en español con su traducción en i18n.js. Test general de mapas: `maps.test.js`.

- Modo **Desactivar bomba** (`bomba`): rondas sin reaparecer, plantar/desactivar manteniendo E (botón BOMBA en el móvil), puntos A/B por mapa (`bomb`), `S.BOMB` (+ variables `BOMB_*`), `bombStart/bombTick/bombEnd` en server.js, `drawBomb()` en modes.js. Tests `bomb.test.js` y `bomb-ui.test.js`.

- Rampas para deslizarse (`b.ramp()` en shared.js: escalones finos de 0,25 m con `rp`; `moveEntity` pega a la rampa, `moveStep` acelera con `MOVE.RAMP_ACC` hasta `MAX_H`; el cliente dibuja una cuña con `rampGeo`). Tormenta de Arena: plaza → terraza de la torre y largo norte → nidos. Test `ramps.test.js`.

- Portales **CrazyGames/Poki**: `public/portal.js` (solo con `?portal=` o `PPR_PORTAL_NAME`): SDK, `gameplay()` desde el bucle `frame`, anuncio entre partidas (`portalBreak`) y con premio (ADS provider 'portal'), esconde Discord/Tienda/invitaciones (`html.portal`). Servidor: `portalOrigin()`, `PORTAL_ANCESTORS`, `CSP_PORTAL`, `portalAds` en `/api/status`. Paquete: `node scripts/build-portal.js poki|crazygames https://servidor` → `dist/`. Test `portal.test.js`.

- CrazyGames: cuenta del portal = cuenta del servidor (`POST /api/auth/crazygames`, `cgLogin` en accounts.js, JWT RS256 con `CRAZYGAMES_PUBLIC_KEY`; `P.account()` en portal.js, `link()` y botón `#cgLinkBtn` «Guardar progreso» en src/main.js). Test en `portal.test.js`.

- Revisión de modos: las barras de los modos, el aviso de espera y «Eliminado» se colocan bajo el marcador con `--mbb` (lo mide client.js con un ResizeObserver sobre `#matchbar`); sin tienda de armas en Carrera y Solo cuchillos (`#death.noshop`, y el servidor rechaza `buy` con `reason: 'mode'`).

- Estadísticas de jugadores (panel → Resumen → «Jugadores por día»): el cliente manda `src` (web/crazygames/poki) en el `hello`; `admin.visit()` y `admin.playTime()` guardan por día en `stats.json` (`ST.days`, `ST.first`, solo huellas sha1, 35 días); `GET /api/admin/player-stats`. Test `player-stats.test.js`.

- Portales: la Tienda se ve dentro de CrazyGames/Poki pero sin pagos con dinero (renderStore enseña solo ruleta de cuchillos, trajes y mascotas, que se pagan con PX). Los avisos de «inicia sesión» dentro del portal los da `portalLogin(key)` (client.js, también `window.pprPortalLogin` en bp.js y social.js) con un botón «Entrar con CrazyGames» (`[data-cglogin]` → `#cgLinkBtn`).

- [ARMAS HD] Armas realistas «sin cubos»: `profGeo()` (perfil lateral con esquinas redondeadas extruido con bisel) y `buildRifleHD/buildAkHD/buildSniperHD/buildSmgHD/buildLmgHD/buildShotgunHD/buildRevolverHD/buildPistolHD` en client.js. Sin skin: tonos reales por arma (`REAL_BODY`, `REAL_PARTS`) y `realMat()` (MeshStandard: metal que brilla, polímero mate); con skin: sus colores y patrones (toon) sobre el mismo modelo. Miras redondeadas en `sights()` (mismas alturas: el apuntado sigue alineado). `gunLOD = 0` para las armas de los demás personajes (menos polígonos). Cuchillos estilo Krunker: hoja corta y gruesa (`BLADE_LEN`, `thick`), facetada (flatShading) y mango +12 %.
- [ARMAS KRUNKER] Números de Krunker (daño, cadencia, cargador, recarga, velocidad) en las 11 armas, mismos nombres e índices. Tres nuevas al final (índices 11-13, en la tienda de partida, no en bots ni en la Carrera): **Tríada** (ráfaga: `burst`, `burstCd`; el servidor usa un «cubo» de cadencia media en `onShoot`), **Cometa** (lanzacohetes) y **Arpón** (ballesta), ambas con `proj` ({v, g, splash, life}): el servidor los mueve en `projTick()` (tramos con `hitscan` y compensación de latencia) y `explode()` (daño en área con pared que protege); mensajes `proj` y `boom`. Cliente: `spawnProj/updateProjs/projImpact/explodeFx`, modelos `buildBullpupHD/buildLauncherHD/buildCrossbowHD`, miras en `SIGHT_AT`. Test `krunker-weapons.test.js`.

- [MAPAS KRUNKER 2] **Tormenta de Arena** (0, `decor: 'desert'`, inspirado en Sandstorm): NO es un cuadrado; `open(x, z)` dice qué suelo se pisa y el resto se rellena con edificios de pisos (rectángulos fundidos por filas, 6-12 m). Plaza con torre (terraza a 3,2 m, rampas de 8 m), largo norte con balcón y nidos (rampas), meseta sur a 2,4 m con túnel por debajo. Texturas `adobe` y `pave`; en el cliente, ventanas con contraventanas/balcones/toldos, puertas, trastos y cúpulas en los tejados, cuerdas con banderines, palmeras y lámparas del túnel (todo decoración). Con poco suelo libre, `buildWorld` usa rejilla de 2 m para los puntos de paso.

- [MAPAS KRUNKER 3] **Base Glaciar** (1, `decor: 'snow'`, inspirado en Subzero): también con `open(x, z)` y riscos de roca nevada alrededor. Lago helado con la plataforma del radar (2,8 m, rampas de 8 m), bosque con cresta a 2,4 m (rampa) y torres de vigilancia (4,4 m), hangar con entreplanta, tanques y contenedores, cabañas de troncos en las bases. Texturas `snow`, `rock`, `ice`, `logs`; en el cliente, nieve encima de todo, pinos (los troncos de 0,6 × 0,6 × 2,2 m llevan copa), carámbanos y nieve al pie de los riscos; en `mapLife`, el radar que gira y los copos que caen.

## Pendiente / ideas
- (Dueño) Cambiar la contraseña del admin `Viexbox`, configurar correo SMTP (Railway Hobby puede bloquear SMTP → alternativa: API de Resend/Brevo).
- (Dueño) Dar de alta el juego en CrazyGames y Poki (pasos en README). 
- Los `.glb` de `public/models/weapons` y `scripts/generate_weapons.py` ya no se usan.
