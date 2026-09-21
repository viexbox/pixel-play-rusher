'use strict';
/* viewmodel.js — Viewmodel (arma en 1ª persona) para Three.js u otro motor: weapon bobbing + ADS con lerp. Sin dependencias.
   Sacado de Pixel Play Rusher (public/shared.js). Funciona en el navegador (window.Viewmodel) y en Node (require).

   USO CON THREE.JS
     const vm = Viewmodel.createViewmodel();            // uno por jugador
     const gun = new THREE.Group(); camera.add(gun);      // el arma es hija de la cámara
     // cada fotograma:
     const pose = vm.update(dt, {
       speed: Math.hypot(player.vel.x, player.vel.z),     // velocidad horizontal (m/s): manda en el vaivén
       onGround: player.onGround,                         // en el aire el vaivén se apaga
       adsTarget: mouseRightDown,                         // apuntar: el factor se acerca con un lerp suave
       hip: { x: 0.2, y: -0.2, z: -0.35 },                // dónde va el arma "de cadera" respecto a la cámara
       sight: { x: 0, y: 0.06, z: 0 },                    // punto de mira del modelo, en coordenadas del arma (null si no tiene)
       extra: { py: 0, pz: recoilKick, rx: reloadTilt }   // otras animaciones que se suman (opcional)
     });
     gun.position.set(pose.px, pose.py, pose.pz); gun.rotation.set(pose.rx, pose.ry, pose.rz);

   Al apuntar del todo, el arma se desplaza justo lo necesario para que `sight` caiga en el centro de la pantalla (0, 0 en el espacio de la cámara).
   Todos los parámetros (frecuencia y amplitud del vaivén, velocidad del lerp…) están en Viewmodel.VIEWMODEL y se pueden cambiar:
     Viewmodel.createViewmodel({ BOB_Y: 0.01, ADS_RATE: 30 }) */
/* =========================================================================================================
   [NUEVO] VIEWMODEL (el arma en primera persona): vaivén según la velocidad y transición suave al apuntar (ADS).
   Módulo puro (sin THREE): calcula la POSICIÓN y la ROTACIÓN del arma respecto a la cámara; el motor solo las aplica (gun.position.set / gun.rotation.set).
   - WEAPON BOBBING con ondas senoidales que dependen de la velocidad: la FASE avanza con la distancia recorrida (phase += BOB_STRIDE · velocidad · dt), así que
     la frecuencia sube y baja con la velocidad del jugador; la AMPLITUD crece con la velocidad (hasta BOB_SPEED_REF m/s) y se suaviza al parar o al saltar.
     Vertical = sin(2·fase) (dos pasos por ciclo), lateral = sin(fase), con un poco de ladeo y cabeceo. En el aire la fase se congela y la amplitud se apaga.
     Al apuntar el vaivén se reduce a BOB_ADS (15 %) para que la mira no baile. Parado: una respiración muy suave.
   - ADS: el factor `ads` (0..1) se acerca a su objetivo con un lerp exponencial independiente del framerate (ADS_RATE) y la posición del arma es
     lerp(cadera, ADS, suavizado(ads)). La posición ADS se DERIVA del punto de mira del modelo (`sight`, en coordenadas del arma): el arma se desplaza justo lo
     necesario para que ese punto caiga en el centro de la pantalla (0, 0 en el espacio de la cámara), a la profundidad de la cadera. Sin `sight` (armas sin mira)
     sube ADS_FALLBACK_LIFT y se centra en X. Se puede pasar la posición ADS a mano (`ads`) o dirigir el factor desde fuera (`adsFactor`).
   - `extra` suma desplazamientos y giros de otras animaciones (retroceso del arma, recarga, cambio de arma, deslizamiento…).
   - viewmodelSight(pose, sight) da dónde está el punto de mira en el espacio de la cámara (en ADS y sin `extra` es (0, 0, z): sirve para comprobar la alineación).
   Convenciones de Three.js: la cámara mira hacia −Z; y arriba; los giros son Euler 'XYZ' (Object3D por defecto). ========================================================================================================= */
const VIEWMODEL = {
  BOB_STRIDE: 0.75,       // rad de fase por metro recorrido (a 7,4 m/s el vaivén vertical va a ~11 rad/s)
  BOB_SPEED_REF: 5,       // m/s a partir de los cuales el vaivén ya tiene toda su amplitud
  BOB_Y: 0.006, BOB_X: 0.005, BOB_ROLL: 0.012, BOB_PITCH: 0.006,   // amplitudes: metros (Y, X) y radianes (ladeo, cabeceo)
  BOB_FADE: 8,            // 1/s: con qué rapidez aparece y desaparece la amplitud al empezar o dejar de moverse
  BOB_ADS: 0.15,          // fracción del vaivén que queda al apuntar del todo
  IDLE_Y: 0.0015, IDLE_HZ: 0.18,   // respiración parado (metros y Hz)
  ADS_RATE: 22,           // 1/s: velocidad del lerp hacia/desde el apuntado (≈ 0,1 s al 90 %)
  ADS_FALLBACK_LIFT: 0.03 // armas sin mira: cuánto sube el arma al apuntar
};
const _vmLerp = (a, b, t) => a + (b - a) * t;
function createViewmodel(params) {
  const P = Object.assign({}, VIEWMODEL, params), st = { ads: 0, phase: 0, amp: 0, idleT: 0 }, pose = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, ads: 0 };
  /* dt en s. inp: { speed (m/s horizontal), onGround, adsTarget (bool) | adsFactor (0..1, lo dirige el motor), hip {x,y,z}, sight {x,y,z}|null, ads {x,y,z}?, extra {px,py,pz,rx,ry,rz}? }
     Devuelve (y reutiliza) el objeto `pose`: { px, py, pz, rx, ry, rz, ads } */
  function update(dt, inp) {
    const hip = inp.hip || { x: 0.2, y: -0.2, z: -0.35 }, ex = inp.extra || {}, target = inp.adsTarget ? 1 : 0;
    if (inp.adsFactor != null) st.ads = Math.max(0, Math.min(1, inp.adsFactor));
    else { st.ads += (target - st.ads) * (1 - Math.exp(-P.ADS_RATE * dt)); if (Math.abs(st.ads - target) < 1e-4) st.ads = target; }
    const e = st.ads * st.ads * (3 - 2 * st.ads);                               // suavizado: arranca y llega despacio
    const s = inp.sight, adsP = inp.ads || (s ? { x: -s.x, y: -s.y, z: hip.z } : { x: 0, y: hip.y + P.ADS_FALLBACK_LIFT, z: hip.z });
    const speed = inp.onGround === false ? 0 : Math.max(0, +inp.speed || 0);
    st.amp += (Math.min(1, speed / P.BOB_SPEED_REF) - st.amp) * (1 - Math.exp(-P.BOB_FADE * dt));
    st.phase += P.BOB_STRIDE * speed * dt; st.idleT += dt;
    const k = 1 - (1 - P.BOB_ADS) * e, a = st.amp * k, w1 = Math.sin(st.phase), w2 = Math.sin(2 * st.phase);
    const idle = Math.sin(st.idleT * 2 * Math.PI * P.IDLE_HZ) * P.IDLE_Y * (1 - st.amp) * k;
    pose.px = _vmLerp(hip.x, adsP.x, e) + w1 * P.BOB_X * a + (ex.px || 0);
    pose.py = _vmLerp(hip.y, adsP.y, e) + w2 * P.BOB_Y * a + idle + (ex.py || 0);
    pose.pz = _vmLerp(hip.z, adsP.z, e) + (ex.pz || 0);
    pose.rx = Math.cos(2 * st.phase) * P.BOB_PITCH * a + (ex.rx || 0); pose.ry = ex.ry || 0; pose.rz = w1 * P.BOB_ROLL * a + (ex.rz || 0);
    pose.ads = st.ads; return pose;
  }
  return { params: P, state: st, pose, update, reset() { st.ads = st.phase = st.amp = st.idleT = 0; } };
}
/* Dónde queda el punto de mira `sight` (coordenadas del arma) en el espacio de la cámara con esa pose. En ADS y sin `extra` es (0, 0, z): el centro de la pantalla. */
function viewmodelSight(pose, sight) {
  let x = sight.x, y = sight.y, z = sight.z || 0, t;
  const cz = Math.cos(pose.rz), sz = Math.sin(pose.rz); t = x * cz - y * sz; y = x * sz + y * cz; x = t;   // Rz
  const cy = Math.cos(pose.ry), sy = Math.sin(pose.ry); t = x * cy + z * sy; z = -x * sy + z * cy; x = t;   // Ry
  const cx = Math.cos(pose.rx), sx = Math.sin(pose.rx); t = y * cx - z * sx; z = y * sx + z * cx; y = t;   // Rx
  return { x: x + pose.px, y: y + pose.py, z: z + pose.pz };
}


const api = { VIEWMODEL, createViewmodel, viewmodelSight };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else (typeof window !== 'undefined' ? window : globalThis).Viewmodel = api;
