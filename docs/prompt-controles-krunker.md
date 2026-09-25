# Prompt de referencia: mapeo de controles (estándar Krunker)

Especificación tal como se recibió, que dio lugar al remapeo de controles y al salto de pulsación única
implementados en `public/client.js` y `public/index.html`. Se conserva aquí, sin editar, para que quede constancia
de qué se pidió exactamente y por qué el juego se comporta así.

## 1. Mapeo de Controles (Krunker Standard)

- **W, A, S, D:** Movimiento del jugador.
- **Espacio:** Saltar.
- **Shift Izquierdo:** Agacharse / Deslizarse (Slide).
- **Clic Izquierdo:** Disparar.
- **Clic Derecho:** Apuntar con la mirilla (ADS).
- **R:** Recargar arma.
- **E:** Cambiar a arma secundaria.
- **Q:** Ataque o cambio a arma cuerpo a cuerpo (Cuchillo).

## 2. Comportamiento del Salto (Espacio)

Pulsación Única (Sin Salto Automático): Elimina el salto continuo al mantener presionada la barra espaciadora.
El evento debe registrarse estrictamente en `keydown` una sola vez. El jugador debe soltar la tecla Espacio y
volver a presionarla para ejecutar un nuevo salto.

## 3. Física de Movimiento y Slide-Hopping (Estilo Krunker.io)

- **Slide-Hopping Mecánico:** Implementa la conservación del impulso lineal. Al estar en movimiento y presionar
  Shift Izquierdo mientras se toca el suelo, el personaje realiza un deslizamiento (slide).
- **Cadencia e Impulso:** Si el jugador presiona Espacio en el momento preciso en que termina el deslizamiento
  o mientras se desliza, gana impulso hacia adelante (speed boost).
- **Control en el Aire (Air Strafe):** Permite cierta maniobrabilidad en el aire al cambiar la vista y la
  dirección sin perder la velocidad acumulada, permitiendo encadenar múltiples saltos y deslizamientos para
  acelerar progresivamente, tal como funciona la física clásica de Krunker.io.

---

## Cómo se implementó (resumen; el detalle está en el resto de `docs/` y en el README)

- **1 y 2** eran cambios reales: antes Mayús era «correr» y C era «agachar/deslizar»; el salto se podía mantener
  pulsado y encadenaba saltos solo. Se remapeó Mayús a agachar/deslizar (ya no hay una tecla de correr aparte:
  se corre siempre a la velocidad que antes era la de «sprint», como en Krunker), y el salto pasó a ser de
  pulsación única (`jumpQueued`, armado en `keydown` y consumido una vez por fotograma de física).
- **Q** pasó de alternar arma↔cuchillo a: si no tienes el cuchillo, lo saca; si ya lo tienes, golpea (no vuelve
  al arma). **E** es el camino de vuelta al arma principal. El juego no tiene un arma secundaria de verdad
  (un segundo arma de fuego además de la principal): solo hay un arma de clase + un cuchillo, así que «E: arma
  secundaria» se traduce aquí como «E: arma principal», que es lo más parecido que existe en el modelo actual.
- **3** ya estaba implementado casi al completo (slide-hop, air strafe y encadenar saltos con impulso creciente
  llevan varias sesiones construidos en `public/shared.js`, funciones `startSlide`/`moveStep`); el único cambio
  fue que ahora se dispara con Mayús en vez de con C, reutilizando exactamente la misma física.

Prueba dedicada: `test/controls-remap.test.js`.
