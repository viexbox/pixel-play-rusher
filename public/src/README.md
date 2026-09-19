# Metajuego: acceso, lobby y perfil

Stack: **JavaScript con módulos ES nativos + CSS**, sin paso de compilación. La interfaz es HTML/DOM sobre el canvas del juego (Three.js r128, ya incluido en `public/vendor`), y el servidor es el Node + WebSocket que ya existe. Tailwind/React/TypeScript se pueden añadir más adelante, pero ahora solo añadirían un paso de compilación.

```
src/
├─ main.js            punto de entrada: arranca el acceso y hace de puente con el lobby actual
├─ app.js             raíz de composición (crea servicios y los conecta; se le pasan almacenes falsos en las pruebas)
├─ api/               servicios (hoy localStorage; después fetch a la API)
│  ├─ storage.js         localStorage/sessionStorage con respaldo en memoria
│  ├─ authService.js     registro, acceso, invitado, sesión (SIMULADO en el navegador)
│  └─ playerService.js   guardado y migración del perfil
├─ state/
│  ├─ eventBus.js        bus de eventos
│  └─ playerState.js     sesión + perfil con guardado automático y suscriptores
├─ ui/
│  ├─ UIManager.js       qué pantalla está abierta
│  ├─ screens/AuthScreen.js   Entrar | Registro | Invitado
│  ├─ modals/            (fase 2 en adelante: Jugar, Perfil, Tienda, Ranking, Ajustes)
│  └─ auth.css
└─ game/              (el motor actual vive en ../client.js y ../shared.js; se irá separando)
```

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Estructura, `playerState` con localStorage, Login / Registro / «Entrar como invitado» | hecha |
| 2 | Lobby: barra superior (nivel, oro, gemas, avatar), selectores de héroes y mascotas | pendiente |
| 3 | Modal «Jugar» (3 vs 3, 9 vs 9, todos contra todos) con «Buscando partida…» | pendiente (3 vs 3 y 9 vs 9 necesitan equipos en el motor) |
| 4 | Tienda (héroes, mascotas, monedas) | pendiente |
| 5 | Perfil, ranking (global / semanal) y ajustes | pendiente |

Decisión pendiente: el juego ya tiene su moneda (KR); el diseño pide oro y gemas. De momento el perfil los guarda como marcadores de posición.
