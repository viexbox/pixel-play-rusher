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
- SEO (meta, Open Graph, robots, sitemap), PayPal + Discord, armas detalladas por código (`GUN_BUILDERS`), mascotas nuevas, trajes (`S.OUTFITS`, migración 007), mapas **Pueblo Duna** y **Villa Piscina**, calidad gráfica alta (`cfg.hq`).
- Salas: `findRoom` une a un jugador con una sala del mismo modo aunque haya elegido otro mapa, si no hay nadie en el suyo.
- Cuchillos nuevos (`KNIFE_SKINS` con `kind`, `ru` y `fx`): mariposa, karambit, bayoneta, daga, machete; `knifeMesh()` en client.js (perfiles extruidos, largo por modelo en `BLADE_LEN`), luces animadas en `tickKnives()`, inspección con F. Se consiguen en el **evento de la ruleta** (`S.KNIFE_ROULETTE`: precio por tirada y peso por rareza; `S.rouletteOdds()`; `/api/bp/knife-spin`, nunca repetidos). Los demás ven tu cuchillo (`equippedLook().knife`).
- Panel admin → Cuentas → «Objetos»: regalar o quitar cuchillos, trajes, mascotas, skins y banners (`/api/admin/bp/items|give|take`, queda en la auditoría).
- Trajes con efectos (`OUTFITS` con `ru: 1`: Neón, Oro Yakuza, Dragón Imperial, Espectro Ártico; `fxOutfitBody()`/`fxMats()` en client.js) en la **Ruleta de trajes** (`S.OUTFIT_ROULETTE`, `/api/bp/outfit-spin`). Las dos ruletas usan `spin()` en battlepass.js y `renderRoulette(kind)` en el cliente. El karambit gira sobre la anilla al sacarlo (`setKnifeDraw`).
- Móvil: controles táctiles (`TOUCH`, `initTouch()` en client.js: joystick, mirar arrastrando, botones; sin bloqueo de puntero) y la interfaz se reduce con `zoom` (`--uiz`) para que quepa. Test `touch.test.js`.
- Móvil: `public/shell.js` (en `<head>`) convierte la página en un marco: el juego va en un iframe `?embed=1` de al menos 720 px de alto, escalado y girado 90° si el móvil está en vertical. La página de fuera no arranca el juego (`window.__PPR_SHELL`: cada script lo comprueba). No se usa con ratón ni para buscadores. Test `shell.test.js`.
- Invitaciones: botón «🎁 Invita y gana PX» (`openReferral()` en client.js), enlace `?ref=CÓDIGO` que se guarda en `ppr.ref` y se manda al registrarse; `GET /api/me/referral`; premio en `awardMatch` al jugar `REF_GAMES` (3) partidas con premio: `REF_PX_INVITER` (300) y `REF_PX_FRIEND` (200). No cuenta con la misma conexión ni más de `REF_DAY_MAX` (5) al día. Test `referral.test.js`.

## Pendiente / ideas
- (Dueño) Cambiar la contraseña del admin `Viexbox`, configurar correo SMTP (Railway Hobby puede bloquear SMTP → alternativa: API de Resend/Brevo).
- Tutorial para jugadores nuevos, adaptar a CrazyGames/Poki, modo "plantar la bomba", estadísticas de jugadores en el panel.
- Los `.glb` de `public/models/weapons` y `scripts/generate_weapons.py` ya no se usan.
