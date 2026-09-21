/* =====================================================================================================================================================
   KRUNKER-STYLE VIEW MODEL / FPS RIG  ·  Three.js (r128 o posterior)  ·  sin dependencias
   =====================================================================================================================================================
   Un arma en primera persona hecha de BLOQUES (estilo voxel / low-poly), con paleta vibrante, CEL-SHADING (MeshToonMaterial de 4 tonos) y CONTORNO oscuro
   (casco invertido), con dos MANOS y MANGAS low-poly, y las animaciones que dan el «tacto Krunker»:

     · WEAPON BOBBING  senoidal según la velocidad (la fase avanza con la distancia recorrida: la frecuencia sigue a la velocidad; amplitud hasta un tope).
     · SWAY / INERCIA  al girar la cámara rápido el arma se inclina (roll) hacia el lado contrario, se retrasa y cabecea, con un muelle amortiguado.
     · ADS (clic derecho) transición ultra rápida con lerp exponencial; el punto de mira del modelo queda EXACTAMENTE en el centro de la pantalla.
     · RECOIL (disparo) tirón rápido hacia atrás con un pequeño giro hacia arriba; un muelle críticamente amortiguado lo devuelve a su sitio casi al instante.
     · Fogonazo de boca, respiración parado, inclinación al deslizarse y pequeño rebote al aterrizar.

   ESTRUCTURA DEL ARCHIVO
     1. PALETA y PARÁMETROS (DEFAULTS)        todo lo ajustable en un solo sitio
     2. DEFINICIÓN DEL ARMA (WEAPONS.ak)      lista de bloques, manos y puntos de referencia: cambia los datos para otra arma
     3. UTILIDADES                            clamp, lerp, muelle exacto de segundo orden
     4. class ViewModel                       modelo (build*), animación (update), entrada (bindMouse), dibujo (render) y limpieza (dispose)

   USO RÁPIDO
     const vm = new KrunkerViewModel.ViewModel(THREE, { aspect: innerWidth / innerHeight });   // modo 'overlay' (recomendado): se dibuja aparte, sin atravesar paredes
     vm.bindMouse(renderer.domElement);                    // clic derecho = apuntar (ADS), clic izquierdo = disparar (mantener = ráfaga)
     // en cada fotograma:
     vm.update(dt, { camera, velocity: player.velocity, onGround: player.onGround, sprinting: keys.Shift, sliding: player.sliding });
     renderer.render(scene, camera);                       // el mundo...
     vm.render(renderer);                                  // ...y encima el arma (limpia solo el buffer de profundidad)
     // al redimensionar:  vm.resize(innerWidth / innerHeight);
     // disparo desde tu lógica:  vm.fire();      apuntar por código:  vm.setAds(true);
   Modo 'attach' (sin pase aparte):  new ViewModel(THREE, { overlay: false });  scene.add(camera); camera.add(vm.root);

   OPCIONES (todas opcionales; valores por defecto en DEFAULTS)
     overlay: true|false      pase aparte del arma (recomendado) o colgarla de tu cámara.       fov: 58   FOV propio del arma (no lo afecta el de tu juego).
     merge: true|false        fusiona los bloques rígidos por color (~15 draw calls en vez de ~100, idéntico a la vista). false = un objeto por bloque (vm.parts) para editar.
     hip / adsDistance        pose «de cadera» (ajustada sobre una captura de Krunker) y distancia de la cámara al alza trasera al apuntar.
     bob* / sway* / recoil*   frecuencia, amplitud y muelles de cada animación.               palette: { orange: '#...' }   cambia los colores.
   PROPIEDADES ÚTILES:  vm.ads (0..1) · vm.fovScale (zoom sugerido al apuntar: multiplícalo por el FOV de tu cámara) · vm.pose · vm.getSightPoint() · vm.onFire = fn
   OTRA ARMA: añade una entrada a WEAPONS (lista de bloques, `sight`, `muzzle` y `hands`) y crea el rig con { weapon: 'nombre' }.
   ===================================================================================================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.KrunkerViewModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===================================================================================================================================================
     1. PALETA Y PARÁMETROS
     =================================================================================================================================================== */
  const PALETTE = {
    orange: '#f2841c', blue: '#2b7be4', yellow: '#f7c21b', gray: '#9aa3ae', lightGray: '#c9d0d8', dark: '#2a3246', red: '#ff5a36',
    skin: '#f0b28a', sleeve: '#2a55cf', cuff: '#1f3f9e', outline: '#131829'
  };

  const DEFAULTS = {
    weapon: 'ak',
    merge: true,                                                   // fusiona los bloques (que son rígidos) por color: ~15 draw calls en vez de ~110. false = un objeto por bloque (útil para editar el modelo)
    overlay: true, fov: 58, aspect: 16 / 9, near: 0.01, far: 10,   // pase aparte del arma: su propio FOV, no lo afecta el del juego ni se hunde en las paredes
    outlineWidth: 0.0034,                                          // grosor del contorno en metros
    toonTones: [120, 168, 212, 255],                                // los 4 escalones del cel-shading
    lights: true, ambient: 0.46, sun: 0.54,                        // luces propias del rig (solo en modo overlay). ambient + sun = 1: el tono más claro no satura
    palette: {},

    /* Posición del arma respecto a la cámara (la cámara mira hacia −Z, +X a la derecha, +Y arriba). rot en radianes (Euler XYZ). */
    hip: { pos: [0.05, -0.06, -0.555], rot: [0.07, 0.6, -0.11] },     // «de cadera»: ajustada sobre una captura de Krunker (boca a la izquierda del centro, empuñadura abajo a la derecha)
    adsDistance: 0.32,                                             // distancia de la cámara al alza trasera al apuntar (m)
    adsRate: 30,                                                   // 1/s: lerp exponencial del ADS (90 % en ≈ 77 ms: «ultra rápido»)
    adsHideAt: 0.45,                                               // por encima de este ADS se ocultan los bloques marcados con ads:'hide' (la culata)
    adsFovScale: 0.86,                                             // sugerencia de zoom para tu cámara (vm.fovScale)

    /* Bobbing */
    bobStride: 0.75, bobSpeedRef: 5, bobY: 0.0065, bobX: 0.0055, bobRoll: 0.014, bobPitch: 0.007, bobFade: 8, bobAds: 0.14, sprintBob: 1.3, idleY: 0.0016, idleHz: 0.2,
    /* Sway / inercia (muelle amortiguado) */
    swayOmega: 15, swayZeta: 0.72, swayLowpass: 32,
    swayRoll: 0.0085, swayRollMax: 0.10, swayX: 0.0016, swayXMax: 0.035, swayYaw: 0.0036, swayYawMax: 0.09, swayPitch: 0.0032, swayPitchMax: 0.09, swayY: 0.0009, swayYMax: 0.03, swayAds: 0.28,
    /* Recoil (muelle críticamente amortiguado: vuelve sin rebotar) */
    recoilOmega: 40, recoilBack: 0.05, recoilUp: 0.1, recoilSide: 0.012, recoilRoll: 0.03, recoilMaxBack: 0.085, recoilMaxUp: 0.17, recoilMaxSide: 0.035, recoilMaxRoll: 0.06, recoilAds: 0.55, flashTime: 0.05,
    fireInterval: 0.1,                                             // segundos entre disparos al mantener el clic izquierdo
    /* Poses extra */
    sprintDrop: 0.012, slideRoll: 0.16, slideDrop: 0.05, airDrop: 0.0035, airMax: 0.03, landKick: 0.018
  };

  /* ===================================================================================================================================================
     2. DEFINICIÓN DEL ARMA
        Bloque: { t: 'box'|'cyl', p: [x, y, z], s: tamaño, r: [rx, ry, rz], c: color }
        · box: s = [ancho, alto, largo]   · cyl (eje Z, 8 lados): s = [radio, largo]
        Origen del arma = centro del cajón de mecanismos; el cañón apunta a −Z y la culata a +Z. Unidades: metros.
     =================================================================================================================================================== */
  const WEAPONS = {
    ak: {
      blocks: [
        // cajón y tapa
        { n: 'receiver', t: 'box', p: [0, 0, -0.02], s: [0.05, 0.07, 0.3], c: 'gray' },
        { n: 'cover', t: 'box', p: [0, 0.046, -0.03], s: [0.046, 0.024, 0.24], c: 'blue' },
        { n: 'coverStripe', t: 'box', p: [0, 0.06, -0.03], s: [0.028, 0.008, 0.2], c: 'yellow' },
        { n: 'sideL', t: 'box', p: [-0.027, 0, -0.035], s: [0.005, 0.048, 0.22], c: 'orange' },
        { n: 'sideR', t: 'box', p: [0.027, 0, -0.035], s: [0.005, 0.048, 0.22], c: 'orange' },
        { n: 'port', t: 'box', p: [0.0275, 0.014, 0.03], s: [0.006, 0.022, 0.07], c: 'dark' },
        { n: 'knob', t: 'box', p: [0.036, 0.014, -0.005], s: [0.016, 0.012, 0.03], c: 'red' },
        // guardamanos
        { n: 'handguard', t: 'box', p: [0, -0.004, -0.31], s: [0.058, 0.056, 0.25], c: 'orange' },
        { n: 'handguardTop', t: 'box', p: [0, 0.036, -0.31], s: [0.046, 0.016, 0.22], c: 'blue' },
        { n: 'bandA', t: 'box', p: [0, -0.004, -0.2], s: [0.062, 0.06, 0.018], c: 'yellow' },
        { n: 'bandB', t: 'box', p: [0, -0.004, -0.42], s: [0.062, 0.06, 0.018], c: 'blue' },
        // cañón, tubo de gases y boca
        { n: 'barrel', t: 'cyl', p: [0, 0.008, -0.6], s: [0.011, 0.36], c: 'lightGray' },
        { n: 'gas', t: 'box', p: [0, 0.03, -0.47], s: [0.03, 0.03, 0.055], c: 'gray' },
        { n: 'muzzle', t: 'cyl', p: [0, 0.008, -0.78], s: [0.018, 0.075], c: 'gray' },
        { n: 'muzzleCap', t: 'cyl', p: [0, 0.008, -0.822], s: [0.013, 0.012], c: 'dark' },
        // alzas: el punto de mira (y = 0.075) coincide en la alza delantera y la trasera
        { n: 'frontBase', t: 'box', p: [0, 0.036, -0.7], s: [0.024, 0.036, 0.032], c: 'gray' },
        { n: 'frontPost', t: 'box', p: [0, 0.062, -0.7], s: [0.009, 0.026, 0.008], c: 'dark' },
        { n: 'frontWingL', t: 'box', p: [-0.0135, 0.064, -0.7], s: [0.005, 0.03, 0.01], c: 'gray' },
        { n: 'frontWingR', t: 'box', p: [0.0135, 0.064, -0.7], s: [0.005, 0.03, 0.01], c: 'gray' },
        { n: 'rearBase', t: 'box', p: [0, 0.04, 0.1], s: [0.036, 0.012, 0.05], c: 'gray' },
        { n: 'rearL', t: 'box', p: [-0.0115, 0.0575, 0.1], s: [0.015, 0.035, 0.016], c: 'dark' },
        { n: 'rearR', t: 'box', p: [0.0115, 0.0575, 0.1], s: [0.015, 0.035, 0.016], c: 'dark' },
        // cargador curvo (dos tramos), empuñadura y guardamonte
        { n: 'magTop', t: 'box', p: [0, -0.078, -0.01], s: [0.04, 0.09, 0.062], c: 'orange' },
        { n: 'magBottom', t: 'box', p: [0, -0.158, -0.04], s: [0.04, 0.09, 0.062], r: [0.3, 0, 0], c: 'orange' },
        { n: 'magBase', t: 'box', p: [0, -0.205, -0.06], s: [0.044, 0.012, 0.068], r: [0.3, 0, 0], c: 'dark' },
        { n: 'grip', t: 'box', p: [0, -0.088, 0.135], s: [0.038, 0.1, 0.045], r: [-0.35, 0, 0], c: 'blue' },
        { n: 'guardBottom', t: 'box', p: [0, -0.05, 0.062], s: [0.008, 0.006, 0.08], c: 'dark' },
        { n: 'guardFront', t: 'box', p: [0, -0.06, 0.02], s: [0.008, 0.03, 0.006], c: 'dark' },
        { n: 'trigger', t: 'box', p: [0, -0.04, 0.065], s: [0.006, 0.024, 0.006], c: 'yellow' },
        // culata
        { n: 'stock', t: 'box', p: [0, -0.008, 0.3], s: [0.042, 0.072, 0.2], r: [-0.1, 0, 0], c: 'orange', ads: 'hide' },
        { n: 'stockStripe', t: 'box', p: [0, 0.03, 0.295], s: [0.03, 0.012, 0.18], r: [-0.1, 0, 0], c: 'blue', ads: 'hide' },
        { n: 'buttPlate', t: 'box', p: [0, -0.018, 0.405], s: [0.046, 0.092, 0.014], r: [-0.1, 0, 0], c: 'yellow', ads: 'hide' }
      ],
      sight: [0, 0.075, 0.1],          // punto de mira (alza trasera): al apuntar cae en el centro de la pantalla
      muzzle: [0, 0.008, -0.835],      // punta del cañón (fogonazo)
      /* Manos y mangas (coordenadas del arma). Cada mano: palma + dedos + pulgar; la manga va del puño hasta fuera de la pantalla. */
      hands: {
        right: {   // empuñadura
          palm: { p: [0.004, -0.078, 0.148], s: [0.056, 0.06, 0.058], r: [-0.35, 0, 0] },
          fingers: [ { p: [0.03, -0.062, 0.112], s: [0.02, 0.014, 0.05] }, { p: [0.03, -0.079, 0.112], s: [0.02, 0.014, 0.05] }, { p: [0.03, -0.096, 0.114], s: [0.02, 0.014, 0.048] }, { p: [0.029, -0.112, 0.118], s: [0.019, 0.014, 0.044] } ],
          thumb: { p: [-0.026, -0.05, 0.11], s: [0.016, 0.018, 0.06], r: [0.2, 0.25, 0] },
          wrist: [0.012, -0.11, 0.185], elbow: [0.19, -0.5, 0.78], width: 0.078
        },
        left: {    // guardamanos
          palm: { p: [-0.006, -0.05, -0.305], s: [0.064, 0.04, 0.078] },
          fingers: [ { p: [-0.038, -0.03, -0.275], s: [0.014, 0.02, 0.026] }, { p: [-0.038, -0.03, -0.302], s: [0.014, 0.02, 0.026] }, { p: [-0.038, -0.03, -0.329], s: [0.014, 0.02, 0.026] }, { p: [-0.038, -0.028, -0.354], s: [0.014, 0.018, 0.024] } ],
          thumb: { p: [0.036, 0.004, -0.29], s: [0.016, 0.02, 0.06], r: [0, -0.2, 0] },
          wrist: [-0.012, -0.075, -0.235], elbow: [-0.36, -0.42, 0.28], width: 0.078
        }
      }
    }
  };

  /* ===================================================================================================================================================
     3. UTILIDADES
     =================================================================================================================================================== */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  /* Muelle amortiguado de segundo orden con solución EXACTA (estable con cualquier dt). s = { x, v }.  zeta < 1: subamortiguado (un poco de rebote, «inercia»);
     zeta >= 1: crítico (vuelve sin rebotar). */
  function spring(s, target, omega, zeta, dt) {
    const x0 = s.x - target, v0 = s.v;
    if (zeta >= 1) { const e = Math.exp(-omega * dt), k = v0 + omega * x0; s.x = target + e * (x0 + k * dt); s.v = e * (v0 - omega * k * dt); return s; }
    const wd = omega * Math.sqrt(1 - zeta * zeta), e = Math.exp(-zeta * omega * dt), c = Math.cos(wd * dt), n = Math.sin(wd * dt);
    s.x = target + e * (x0 * c + ((v0 + zeta * omega * x0) / wd) * n);
    s.v = e * (v0 * c - ((zeta * omega * v0 + omega * omega * x0) / wd) * n);
    return s;
  }
  const S = () => ({ x: 0, v: 0 });

  /* Une varias geometrías indexadas con los mismos atributos (position, normal, uv) en una sola, desplazando los índices. */
  function mergeGeometries(THREE, geos) {
    const first = geos[0], names = Object.keys(first.attributes); let vCount = 0, iCount = 0;
    for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
    const out = new THREE.BufferGeometry();
    for (const n of names) { const a = first.attributes[n], arr = new Float32Array(vCount * a.itemSize); let off = 0; for (const g of geos) { arr.set(g.attributes[n].array, off); off += g.attributes[n].array.length; } out.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize)); }
    const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount); let io = 0, vo = 0;
    for (const g of geos) { const src = g.index.array; for (let i = 0; i < src.length; i++) idx[io++] = src[i] + vo; vo += g.attributes.position.count; }
    out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere(); out.computeBoundingBox(); return out;
  }

  /* ===================================================================================================================================================
     4. ViewModel
     =================================================================================================================================================== */
  class ViewModel {
    constructor(THREE, options) {
      this.THREE = THREE; const o = this.opt = Object.assign({}, DEFAULTS, options || {}); this.palette = Object.assign({}, PALETTE, o.palette);
      this.def = WEAPONS[o.weapon] || WEAPONS.ak;
      /* Jerarquía: root (se cuelga de la cámara o de la escena overlay) → holder (recibe la pose animada) → gun (arma, manos y mangas) */
      this.root = new THREE.Group(); this.root.name = 'ViewModelRoot'; this.holder = new THREE.Group(); this.gun = new THREE.Group();
      this.root.add(this.holder); this.holder.add(this.gun);
      this._mats = {}; this._geos = {}; this._owned = []; this.parts = [];
      this._makeShared(); this._buildWeapon(); this._buildHands(); if (o.merge) this._mergeStatic(); this._buildFlash();
      this.scene = null; this.camera = null;
      if (o.overlay) this._makeOverlay();
      /* Estado de animación */
      this.ads = 0; this.fovScale = 1; this._adsInput = false; this._firing = false; this._fireCd = 0; this._flash = 0;
      this.bob = { phase: 0, amp: 0, idle: 0 }; this.sprintK = 0; this.slideK = 0; this.airK = 0; this._wasGround = true;
      this._lag = { yaw: 0, pitch: 0 }; this._prev = null; this._euler = new THREE.Euler(0, 0, 0, 'YXZ'); this._v = new THREE.Vector3();
      this.sway = { roll: S(), x: S(), yaw: S(), pitch: S(), y: S() }; this.recoil = { z: S(), pitch: S(), yaw: S(), roll: S() }; this.land = S();
      this.pose = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 }; this._listeners = [];
      this.onFire = null;
      this._applyPose(); this.root.updateMatrixWorld(true);
    }

    /* ---------- MODELO ---------- */
    _color(c) { return this.palette[c] || c; }
    _makeShared() {
      const T = this.THREE, o = this.opt, tones = o.toonTones, data = new Uint8Array(tones.length);
      for (let i = 0; i < tones.length; i++) data[i] = tones[i];
      const gm = new T.DataTexture(data, tones.length, 1, T.LuminanceFormat); gm.minFilter = gm.magFilter = T.NearestFilter; gm.generateMipmaps = false; gm.needsUpdate = true;
      this._gradient = gm; this._owned.push(gm);
      this._geos.box = new T.BoxGeometry(1, 1, 1);
      const cyl = new T.CylinderGeometry(1, 1, 1, 8, 1); cyl.rotateX(Math.PI / 2); this._geos.cyl = cyl;   // eje Z, radio 1, largo 1
      this._geos.box.name = 'box'; this._owned.push(this._geos.box, cyl);
      this._outlineMat = new T.MeshBasicMaterial({ color: this._color('outline'), side: T.BackSide }); this._owned.push(this._outlineMat);
    }
    _toon(color) {
      const hex = this._color(color); if (this._mats[hex]) return this._mats[hex];
      const m = new this.THREE.MeshToonMaterial({ color: hex, gradientMap: this._gradient }); this._owned.push(m); return (this._mats[hex] = m);
    }
    /* Un bloque con su contorno. La malla es una geometría unitaria escalada; el contorno es un hijo con la misma geometría, cara trasera y un poco más grande
       (grosor constante en metros: escala local = (tamaño + 2·grosor) / tamaño en cada eje). */
    _block(parent, spec) {
      const T = this.THREE, geo = this._geos[spec.t === 'cyl' ? 'cyl' : 'box'], w = this.opt.outlineWidth;
      const size = spec.t === 'cyl' ? [spec.s[0], spec.s[0], spec.s[1]] : spec.s;
      const mesh = new T.Mesh(geo, this._toon(spec.c)); mesh.name = spec.n || 'block'; mesh.position.set(spec.p[0], spec.p[1], spec.p[2]);
      if (spec.r) mesh.rotation.set(spec.r[0], spec.r[1], spec.r[2]); mesh.scale.set(size[0], size[1], size[2]);
      const line = new T.Mesh(geo, this._outlineMat); line.name = 'outline'; line.scale.set((size[0] + 2 * w) / size[0], (size[1] + 2 * w) / size[1], (size[2] + 2 * w) / size[2]);
      mesh.add(line); mesh.userData.outline = line; parent.add(mesh); this.parts.push(mesh); return mesh;
    }
    /* Prisma entre dos puntos (mangas): se orienta con su eje Z a lo largo del segmento a→b */
    _limb(parent, a, b, width, color, name) {
      const T = this.THREE, A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]), d = B.clone().sub(A), len = d.length(), mid = A.clone().add(B).multiplyScalar(0.5);
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), d.normalize()), e = new T.Euler().setFromQuaternion(q);
      return this._block(parent, { n: name, t: 'box', p: [mid.x, mid.y, mid.z], s: [width, width * 0.9, len], r: [e.x, e.y, e.z], c: color });
    }
    _buildWeapon() {
      const g = new this.THREE.Group(); g.name = 'weapon'; this.weapon = g; this.gun.add(g);
      this._adsHide = []; for (const b of this.def.blocks) { const m = this._block(g, b); if (b.ads === 'hide') this._adsHide.push(m); }
      const T = this.THREE; this.sightAnchor = new T.Object3D(); this.sightAnchor.position.fromArray(this.def.sight); g.add(this.sightAnchor);
      this.muzzleAnchor = new T.Object3D(); this.muzzleAnchor.position.fromArray(this.def.muzzle); g.add(this.muzzleAnchor);
    }
    _buildHands() {
      const g = new this.THREE.Group(); g.name = 'hands'; this.hands = g; this.gun.add(g);
      for (const side of ['right', 'left']) {
        const h = this.def.hands[side], grp = new this.THREE.Group(); grp.name = 'hand-' + side; g.add(grp); this[side + 'Hand'] = grp;
        this._block(grp, Object.assign({ n: 'palm', t: 'box', c: 'skin' }, h.palm));
        h.fingers.forEach((f, i) => this._block(grp, Object.assign({ n: 'finger' + i, t: 'box', c: 'skin' }, f)));
        this._block(grp, Object.assign({ n: 'thumb', t: 'box', c: 'skin' }, h.thumb));
        const w = new this.THREE.Vector3().fromArray(h.wrist), e = new this.THREE.Vector3().fromArray(h.elbow), dir = e.clone().sub(w).normalize(), cuffEnd = w.clone().add(dir.clone().multiplyScalar(0.05));
        this._limb(grp, h.wrist, cuffEnd.toArray(), h.width * 0.86, 'skin', 'wrist');             // muñeca
        this._limb(grp, cuffEnd.toArray(), cuffEnd.clone().add(dir.clone().multiplyScalar(0.035)).toArray(), h.width * 1.08, 'cuff', 'cuff');   // puño de la manga
        this._limb(grp, cuffEnd.clone().add(dir.clone().multiplyScalar(0.035)).toArray(), h.elbow, h.width * 1.05, 'sleeve', 'sleeve');       // manga hasta fuera de la pantalla
      }
    }
    _buildFlash() {
      const T = this.THREE, g = new T.Group(); g.name = 'muzzleFlash'; g.position.copy(this.muzzleAnchor.position); this.weapon.add(g);
      const mk = (w, h, d, c) => { const m = new T.Mesh(this._geos.box, new T.MeshBasicMaterial({ color: this._color(c) })); m.scale.set(w, h, d); this._owned.push(m.material); g.add(m); return m; };
      mk(0.07, 0.012, 0.04, 'yellow'); mk(0.012, 0.07, 0.04, 'yellow'); const core = mk(0.03, 0.03, 0.05, 'lightGray'); core.rotation.z = Math.PI / 4; const star = mk(0.05, 0.05, 0.03, 'orange'); star.rotation.z = Math.PI / 4;
      g.visible = false; this.flash = g;
    }
    /* Fusión de los bloques rígidos: se agrupan por material (y por «se oculta al apuntar») y cada grupo pasa a ser UNA malla con la transformación ya aplicada;
       todos los contornos de cada grupo, a su vez, en una sola malla. Es lo mismo que dibujar el arma bloque a bloque, con ~110 draw calls menos. */
    _mergeStatic() {
      const T = this.THREE; this.gun.updateMatrixWorld(true); const inv = new T.Matrix4().copy(this.gun.matrixWorld).invert(), groups = new Map(), lines = { keep: [], hide: [] };
      const hidden = new Set(this._adsHide), bake = (mesh) => mesh.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      for (const m of this.parts) {
        m.updateMatrixWorld(true); const hide = hidden.has(m), key = m.material.uuid + (hide ? 'h' : 'k'); let g = groups.get(key); if (!g) groups.set(key, g = { material: m.material, hide, geos: [] });
        g.geos.push(bake(m)); (hide ? lines.hide : lines.keep).push(bake(m.userData.outline));
      }
      for (const m of this.parts) if (m.parent) m.parent.remove(m);
      this._adsHide = []; this.parts = []; this.batches = [];
      const add = (geos, material, name, hide) => { if (!geos.length) return; const geo = mergeGeometries(T, geos); geos.forEach(g => g.dispose()); this._owned.push(geo); const mesh = new T.Mesh(geo, material); mesh.name = name; this.gun.add(mesh); this.batches.push(mesh); if (hide) this._adsHide.push(mesh); return mesh; };
      for (const g of groups.values()) add(g.geos, g.material, 'batch-' + g.material.color.getHexString() + (g.hide ? '-ads' : ''), g.hide);
      add(lines.keep, this._outlineMat, 'batch-outline', false); add(lines.hide, this._outlineMat, 'batch-outline-ads', true);
    }
    _makeOverlay() {
      const T = this.THREE, o = this.opt; this.scene = new T.Scene(); this.camera = new T.PerspectiveCamera(o.fov, o.aspect, o.near, o.far);
      if (o.lights) { const a = new T.AmbientLight(0xffffff, o.ambient), s = new T.DirectionalLight(0xffffff, o.sun); s.position.set(0.5, 1, 0.7); this.scene.add(a, s); this.lights = [a, s]; }
      this.scene.add(this.root);   // la cámara del overlay está en el origen mirando a −Z: las coordenadas del rig son las del espacio de cámara
    }

    /* ---------- ENTRADA ---------- */
    setAds(on) { this._adsInput = !!on; }
    setFiring(on) { this._firing = !!on; }
    /* Clic derecho = ADS, clic izquierdo = disparar (mantener = ráfaga). Devuelve una función para quitar los eventos. */
    bindMouse(el) {
      const down = e => { if (e.button === 2) this._adsInput = true; else if (e.button === 0) { this._firing = true; this._fireCd = 0; } };
      const up = e => { if (e.button === 2) this._adsInput = false; else if (e.button === 0) this._firing = false; };
      const menu = e => e.preventDefault();
      const w = typeof window !== 'undefined' ? window : el;   // el botón se suelta fuera del canvas: se escucha en window
      el.addEventListener('mousedown', down); w.addEventListener('mouseup', up); el.addEventListener('contextmenu', menu);
      const off = () => { el.removeEventListener('mousedown', down); w.removeEventListener('mouseup', up); el.removeEventListener('contextmenu', menu); };
      this._listeners.push(off); return off;
    }
    /* Un disparo: impulso al muelle de retroceso (atrás + giro hacia arriba + un poco de lado y ladeo aleatorios) y fogonazo. */
    fire() {
      const o = this.opt, k = lerp(1, o.recoilAds, this.ads), w = o.recoilOmega, E = Math.E, r = this.recoil;
      // impulso inicial v0 para un desplazamiento máximo D en un muelle crítico: D = v0 / (ω·e)  →  v0 = D·ω·e
      const cap = (s, D, max) => { if (s.x < max) s.v += Math.max(0, Math.min(D * w * E, (max - s.x) * w * E)); };
      cap(r.z, o.recoilBack * k, o.recoilMaxBack); cap(r.pitch, o.recoilUp * k, o.recoilMaxUp);
      const taper = (s, max) => Math.max(0, 1 - Math.abs(s.x) / max);   // cerca del tope el impulso aleatorio se apaga: en una ráfaga no se acumula sin límite
      r.yaw.v += (Math.random() - 0.5) * 2 * o.recoilSide * w * E * k * taper(r.yaw, o.recoilMaxSide); r.roll.v += (Math.random() - 0.5) * 2 * o.recoilRoll * w * E * k * taper(r.roll, o.recoilMaxRoll);   // desvío lateral y ladeo aleatorios (rad)
      this._flash = o.flashTime; this.flash.visible = true; this.flash.rotation.z = Math.random() * Math.PI; const sc = 0.85 + Math.random() * 0.4; this.flash.scale.set(sc, sc, sc);
      if (typeof this.onFire === 'function') this.onFire(this);
    }

    /* ---------- ANIMACIÓN ---------- */
    /* dt en segundos. s (todo opcional): { camera, look: {yaw, pitch}, velocity: {x,y,z}, speed, onGround, sprinting, sliding, ads } */
    update(dt, s) {
      const o = this.opt; s = s || {}; dt = clamp(dt, 0, 0.05); if (dt <= 0) return this.pose;
      /* ADS: lerp exponencial (independiente del framerate) hacia el objetivo; a 30/s llega al 90 % en ≈ 77 ms */
      const adsT = (s.ads !== undefined ? s.ads : this._adsInput) ? 1 : 0;
      this.ads += (adsT - this.ads) * (1 - Math.exp(-o.adsRate * dt)); if (Math.abs(this.ads - adsT) < 1e-4) this.ads = adsT;
      const e = this.ads * this.ads * (3 - 2 * this.ads); this.fovScale = lerp(1, o.adsFovScale, e);
      const seeStock = this.ads < o.adsHideAt; for (const m of this._adsHide) m.visible = seeStock;   // la culata queda entre la cámara y el alza: al apuntar se oculta
      /* Disparo automático al mantener el clic */
      if (this._firing) { this._fireCd -= dt; let n = 0; while (this._fireCd <= 0 && n++ < 4) { this.fire(); this._fireCd += o.fireInterval; } }
      if (this._flash > 0) { this._flash -= dt; if (this._flash <= 0) this.flash.visible = false; }
      /* Velocidad horizontal y estado de suelo */
      const v = s.velocity, grounded = s.onGround !== false, speed = grounded ? (s.speed !== undefined ? s.speed : v ? Math.hypot(v.x, v.z) : 0) : 0, vy = v ? v.y || 0 : 0;
      /* BOBBING senoidal: la fase avanza con la distancia recorrida (frecuencia ∝ velocidad); amplitud hasta bobSpeedRef m/s */
      const b = this.bob, sprint = s.sprinting ? o.sprintBob : 1;
      b.amp += (Math.min(1, speed / o.bobSpeedRef) - b.amp) * (1 - Math.exp(-o.bobFade * dt)); b.phase += o.bobStride * speed * dt; b.idle += dt;
      const ka = b.amp * sprint * lerp(1, o.bobAds, e), w1 = Math.sin(b.phase), w2 = Math.sin(2 * b.phase), idle = Math.sin(b.idle * 2 * Math.PI * o.idleHz) * o.idleY * (1 - b.amp) * lerp(1, o.bobAds, e);
      /* SWAY / INERCIA: velocidad angular de la cámara (suavizada) → objetivos del muelle amortiguado */
      let yaw = 0, pitch = 0, has = false;
      if (s.look) { yaw = s.look.yaw; pitch = s.look.pitch; has = true; }
      else if (s.camera) { this._euler.setFromQuaternion(s.camera.quaternion, 'YXZ'); yaw = this._euler.y; pitch = this._euler.x; has = true; }
      if (has) { if (this._prev) { const ry = wrapPi(yaw - this._prev.yaw) / dt, rp = (pitch - this._prev.pitch) / dt, k = 1 - Math.exp(-o.swayLowpass * dt); this._lag.yaw += (ry - this._lag.yaw) * k; this._lag.pitch += (rp - this._lag.pitch) * k; } this._prev = { yaw, pitch }; }
      const sk = lerp(1, o.swayAds, e), sw = this.sway, yr = this._lag.yaw, pr = this._lag.pitch;   // yaw>0: la cámara gira a la izquierda (convención Three.js)
      spring(sw.roll, clamp(-yr * o.swayRoll, -o.swayRollMax, o.swayRollMax) * sk, o.swayOmega, o.swayZeta, dt);   // gira a la derecha → el arma se inclina a la izquierda
      spring(sw.x, clamp(yr * o.swayX, -o.swayXMax, o.swayXMax) * sk, o.swayOmega, o.swayZeta, dt);                 // y se RETRASA hacia el lado contrario
      spring(sw.yaw, clamp(-yr * o.swayYaw, -o.swayYawMax, o.swayYawMax) * sk, o.swayOmega, o.swayZeta, dt);
      spring(sw.pitch, clamp(-pr * o.swayPitch, -o.swayPitchMax, o.swayPitchMax) * sk, o.swayOmega, o.swayZeta, dt);   // mirar arriba → el cañón se queda abajo
      spring(sw.y, clamp(-pr * o.swayY, -o.swayYMax, o.swayYMax) * sk, o.swayOmega, o.swayZeta, dt);
      /* RECOIL: muelles críticos (vuelven sin rebotar) */
      const r = this.recoil, w = o.recoilOmega; spring(r.z, 0, w, 1, dt); spring(r.pitch, 0, w, 1, dt); spring(r.yaw, 0, w, 1, dt); spring(r.roll, 0, w, 1, dt);
      /* Poses extra suavizadas: correr, deslizarse, aire y aterrizaje */
      this.sprintK += ((s.sprinting && speed > 1 ? 1 : 0) * (1 - e) - this.sprintK) * (1 - Math.exp(-10 * dt));
      this.slideK += ((s.sliding ? 1 : 0) - this.slideK) * (1 - Math.exp(-12 * dt));
      this.airK += ((grounded ? 0 : clamp(-vy * o.airDrop, -o.airMax, o.airMax)) - this.airK) * (1 - Math.exp(-14 * dt));
      if (grounded && !this._wasGround) this.land.v -= clamp(-this._lastVy * o.landKick * 6, 0, 0.35);
      this._wasGround = grounded; this._lastVy = vy; spring(this.land, 0, 22, 0.6, dt);
      /* Composición: pose = lerp(cadera, ADS, e) + bobbing + sway + recoil + extras */
      const hip = o.hip, adsPos = this._adsPose(), P = this.pose;
      P.px = lerp(hip.pos[0], adsPos.pos[0], e) + w1 * o.bobX * ka + sw.x.x;
      P.py = lerp(hip.pos[1], adsPos.pos[1], e) + w2 * o.bobY * ka + idle + sw.y.x + this.land.x - this.sprintK * o.sprintDrop - this.slideK * o.slideDrop + this.airK;
      P.pz = lerp(hip.pos[2], adsPos.pos[2], e) + r.z.x;
      P.rx = lerp(hip.rot[0], adsPos.rot[0], e) + Math.cos(2 * b.phase) * o.bobPitch * ka + sw.pitch.x + r.pitch.x - this.airK * 1.5;
      P.ry = lerp(hip.rot[1], adsPos.rot[1], e) + sw.yaw.x + r.yaw.x + this.sprintK * 0.22;
      P.rz = lerp(hip.rot[2], adsPos.rot[2], e) + w1 * o.bobRoll * ka + sw.roll.x + r.roll.x + this.slideK * o.slideRoll;
      this._applyPose(); return P;
    }
    /* Pose de ADS: se calcula desde el punto de mira del modelo para que caiga en (0, 0) del espacio de cámara, a `adsDistance` de la cámara. */
    _adsPose() {
      const sp = this.def.sight, d = this.opt.adsDistance; return { pos: [-sp[0], -sp[1], -d - sp[2]], rot: [0, 0, 0] };
    }
    _applyPose() { const P = this.pose; this.holder.position.set(P.px, P.py, P.pz); this.holder.rotation.set(P.rx, P.ry, P.rz); }

    /* Dónde está el punto de mira en el espacio de la cámara (en ADS y en reposo es (0, 0, −adsDistance)). */
    getSightPoint(out) {
      const T = this.THREE; out = out || new T.Vector3(); this.root.updateMatrixWorld(true); this.sightAnchor.getWorldPosition(out);
      const inv = new T.Matrix4().copy(this.root.matrixWorld).invert(); return out.applyMatrix4(inv);
    }

    /* ---------- DIBUJO Y LIMPIEZA ---------- */
    resize(aspect) { if (this.camera) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); } }
    /* Dibuja el arma encima del mundo (modo overlay): limpia solo la profundidad para que no se hunda en las paredes. */
    render(renderer) {
      if (!this.scene) return; const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.scene, this.camera); renderer.autoClear = ac;
    }
    dispose() {
      for (const off of this._listeners) off(); this._listeners = [];
      for (const it of this._owned) if (it && it.dispose) it.dispose();
      this._owned = []; if (this.root.parent) this.root.parent.remove(this.root); this.parts = [];
    }
  }

  return { ViewModel, PALETTE, DEFAULTS, WEAPONS, spring, VERSION: '1.0' };
});
