"""
generate_weapons.py — genera los modelos 3D de las armas de Krunxa, en bloques low-poly
estilizados (cel-shaded, como Krunker.io), con las partes separadas (cuerpo, cargador, cañón, mira),
y los exporta a .glb en public/models/weapons/.

Cómo ejecutarlo (necesita Blender; no hace falta abrir la interfaz):
    blender --background --python scripts/generate_weapons.py

Cada arma sale como un único .glb con varios nodos con nombre (body, magazine, barrel, sight, stock...),
para que Three.js pueda coger cada parte por separado y pintarla con el color de la skin.
Los materiales son planos (sin textura): el color de cada parte lo pone la skin al cargar el modelo,
así un mismo .glb sirve para todas las skins de esa arma.
"""
import bpy, bmesh, math, os, sys

# ---------------------------------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------------------------------
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models', 'weapons')

def clear_scene():
    """Solo borra objetos y mallas de la escena anterior. Los materiales NO se tocan: son solo 5,
    reutilizados por nombre en todas las armas, y borrarlos entre exportación y exportación
    (como hacía antes) los dejaba en el gris por defecto de Blender la siguiente vez que hacían falta."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.meshes):
        if m.users == 0: bpy.data.meshes.remove(m)

def mat(name, color=(0.6, 0.6, 0.6, 1), rough=0.55, metal=0.15):
    """Material plano: el color real lo pone la skin al cargar el modelo en Three.js (esto es solo la vista previa en Blender)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = color
        bsdf.inputs['Roughness'].default_value = rough
        if 'Metallic' in bsdf.inputs: bsdf.inputs['Metallic'].default_value = metal
    return m

def get_mat(mat_name):
    """Coge un material YA creado por su nombre (los 5 de la paleta). Si no existe, es un fallo real
    del script (un nombre mal escrito), así que mejor una excepción clara que una pieza gris silenciosa."""
    return bpy.data.materials[mat_name]

def box(name, size, loc, mat_name, parent=None, rot=(0, 0, 0), bevel=0.014):
    """Caja centrada en `loc`, tamaño `size` = (ancho X, alto Y, largo Z). Devuelve el objeto.
    Lleva un chaflán pequeño por defecto (bevel, en metros): ninguna pieza queda con aristas 100% rectas,
    aunque la forma de base siga siendo un bloque — es lo que más cambia el aspecto de «cubo» sin
    complicar la malla ni salirse del estilo low-poly."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], size[2])   # [CORREGIDO] primitive_cube_add(size=1) ya tiene arista de longitud 1: dividir entre 2 dejaba cada pieza a mitad de tamaño
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel and bevel > 0:
        m = o.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'ANGLE'; m.angle_limit = 0.4
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)
    o.data.materials.append(get_mat(mat_name))
    if parent: o.parent = parent
    return o

def cyl(name, r, length, loc, mat_name, parent=None, rot=(0, 0, 0), verts=8):   # [CORREGIDO] Blender ya extruye el cilindro a lo largo de Z por defecto: girarlo pi/2 en X lo dejaba apuntando hacia arriba en vez de hacia delante
    """Cilindro (por defecto tumbado, eje Z del arma) con pocos lados: aspecto voxel, no redondo de verdad."""
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=length, location=loc, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.append(get_mat(mat_name))
    if parent: o.parent = parent
    return o

def new_empty(name, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.empty_display_size = 0.01
    return o

def group(objs, into):
    for o in objs:
        if o.parent is None: o.parent = into

# Paleta de vista previa (no es la del juego: solo para que el .glb no salga en blanco si alguien lo abre sin skin)
C_BODY, C_ACC, C_DARK, C_GLASS, C_WOOD = 'body', 'acc', 'dark', 'glass', 'wood'
mat(C_BODY, (0.22, 0.24, 0.29, 1))
mat(C_ACC, (0.55, 0.58, 0.64, 1))
mat(C_DARK, (0.10, 0.10, 0.13, 1))
mat(C_GLASS, (0.15, 0.55, 0.95, 1), rough=0.15, metal=0.0)
mat(C_WOOD, (0.42, 0.27, 0.13, 1))

# ---------------------------------------------------------------------------------------------------
# Generadores por arquetipo (uno por cada uno de los 10 tipos pedidos). Cada uno recibe las medidas
# reales del arma (public/shared.js → WEAPONS[i].size = [ancho, alto, largo del cajón]) para que el
# modelo quede a la escala del arma en primera persona del juego.
# ---------------------------------------------------------------------------------------------------

def make_rifle(root_name, size, barrel_len, has_scope=False, wood=False, stock_len=0.18):
    """Fusil (base común para Asalto, AK, Centinela): cajón, cargador curvo, cañón, culata, mira."""
    w, h, l = size
    root = new_empty(root_name)
    body = box('body', (w, h, l), (0, 0, 0), C_WOOD if wood else C_BODY, root)
    box('body_rail', (w * 0.5, 0.012, l * 0.85), (0, h / 2 + 0.006, 0), C_DARK, body)
    cyl('barrel', 0.012, barrel_len, (0, 0.01, -l / 2 - barrel_len / 2), C_DARK, root)
    cyl('muzzle', 0.017, 0.05, (0, 0.01, -l / 2 - barrel_len - 0.02), C_DARK, root)
    mag_mat = C_WOOD if wood else C_ACC
    mag = box('magazine', (0.05, 0.16, 0.06), (0, -h / 2 - 0.07, l * 0.08), mag_mat, root, rot=(0.28, 0, 0))
    box('grip', (0.05, 0.11, 0.045), (0, -h / 2 - 0.045, l * 0.32), C_DARK, root, rot=(-0.32, 0, 0))
    stock = box('stock', (w * 0.62, h * 0.85, stock_len), (0, -0.01, l / 2 + stock_len / 2), mag_mat, root)
    if has_scope:
        mnt = box('sight_mount', (0.03, 0.03, 0.16), (0, h / 2 + 0.03, -0.02), C_DARK, root)
        scope = cyl('sight_scope', 0.026, 0.22, (0, h / 2 + 0.07, -0.02), C_DARK, root)
        cyl('sight_glass_front', 0.018, 0.006, (0, h / 2 + 0.07, -0.13), C_GLASS, root)
        cyl('sight_glass_rear', 0.018, 0.006, (0, h / 2 + 0.07, 0.09), C_GLASS, root)
    else:
        box('sight_front', (0.014, 0.03, 0.014), (0, h / 2 + 0.02, -l / 2 - 0.05), C_DARK, root)
        box('sight_rear', (0.05, 0.014, 0.02), (0, h / 2 + 0.015, l * 0.3), C_DARK, root)
    return root

def make_smg(root_name, size, barrel_len):
    """Subfusil (Ráfaga, Vórtice): cajón corto, cargador recto largo, guardamanos corto."""
    w, h, l = size
    root = new_empty(root_name)
    box('body', (w, h, l), (0, 0, 0), C_BODY, root)
    box('handguard', (w * 0.8, h * 0.7, barrel_len * 0.7), (0, -0.01, -l / 2 - barrel_len * 0.35), C_DARK, root)
    cyl('barrel', 0.011, barrel_len * 0.4, (0, 0.005, -l / 2 - barrel_len - 0.06), C_DARK, root)
    box('magazine', (0.045, 0.22, 0.05), (0, -h / 2 - 0.1, l * 0.05), C_ACC, root, rot=(0.06, 0, 0))
    box('grip', (0.045, 0.1, 0.04), (0, -h / 2 - 0.04, l * 0.36), C_DARK, root, rot=(-0.3, 0, 0))
    box('stock', (w * 0.4, h * 0.35, 0.14), (0, 0, l / 2 + 0.07), C_ACC, root)
    box('sight_front', (0.012, 0.024, 0.012), (0, h / 2 + 0.016, -l / 2 - 0.02), C_DARK, root)
    box('sight_rear', (0.045, 0.012, 0.018), (0, h / 2 + 0.012, l * 0.32), C_DARK, root)
    return root

def make_lmg(root_name, size, barrel_len):
    """Ametralladora ligera (Torrente): cajón grande, tambor de munición, bípode."""
    w, h, l = size
    root = new_empty(root_name)
    box('body', (w, h, l), (0, 0, 0), C_BODY, root)
    cyl('barrel', 0.016, barrel_len, (0, 0.015, -l / 2 - barrel_len / 2), C_DARK, root)
    cyl('drum', 0.09, 0.07, (0, -h / 2 - 0.07, l * 0.18), C_ACC, root, rot=(0, math.pi / 2, 0), verts=10)   # [CORREGIDO] el tambor debe verse de canto (eje hacia el lado, no hacia delante)
    box('bipod_l', (0.012, 0.16, 0.012), (-0.05, -h / 2 - 0.08, -l / 2 - barrel_len * 0.6), C_DARK, root, rot=(0, 0, 0.35))
    box('bipod_r', (0.012, 0.16, 0.012), (0.05, -h / 2 - 0.08, -l / 2 - barrel_len * 0.6), C_DARK, root, rot=(0, 0, -0.35))
    box('grip', (0.05, 0.11, 0.045), (0, -h / 2 - 0.045, l * 0.33), C_DARK, root, rot=(-0.32, 0, 0))
    box('stock', (w * 0.6, h * 0.8, 0.16), (0, -0.01, l / 2 + 0.08), C_ACC, root)
    box('sight_front', (0.016, 0.032, 0.016), (0, h / 2 + 0.02, -l / 2 - 0.04), C_DARK, root)
    box('sight_rear', (0.06, 0.016, 0.02), (0, h / 2 + 0.016, l * 0.3), C_DARK, root)
    return root

def make_shotgun(root_name, size, barrel_len):
    """Escopeta (Trueno): cañón ancho, guardamanos deslizante (pump), sin cargador visible."""
    w, h, l = size
    root = new_empty(root_name)
    box('body', (w, h, l), (0, 0, 0), C_DARK, root)
    cyl('barrel', 0.022, barrel_len, (0, 0.01, -l / 2 - barrel_len / 2), C_ACC, root)
    box('pump', (w * 0.85, h * 0.75, barrel_len * 0.35), (0, -0.005, -l / 2 - barrel_len * 0.4), C_WOOD, root)
    box('magazine_tube', (0.03, 0.03, barrel_len * 0.9), (0, -h / 2 + 0.02, -l / 2 - barrel_len * 0.45), C_DARK, root)
    box('grip', (0.05, 0.1, 0.045), (0, -h / 2 - 0.04, l * 0.34), C_WOOD, root, rot=(-0.3, 0, 0))
    box('stock', (w * 0.7, h * 0.85, 0.2), (0, -0.01, l / 2 + 0.1), C_WOOD, root)
    box('sight_front', (0.016, 0.03, 0.016), (0, h / 2 + 0.018, -l / 2 - 0.06), C_DARK, root)
    return root

def make_revolver(root_name, size, barrel_len):
    """Revólver (Sheriff): tambor giratorio, cañón corto, martillo."""
    w, h, l = size
    root = new_empty(root_name)
    box('body', (w, h, l * 0.55), (0, 0, l * 0.1), C_DARK, root)
    cyl('cylinder', 0.045, 0.06, (0, 0, -l * 0.05), C_ACC, root, rot=(0, math.pi / 2, 0), verts=6)   # [CORREGIDO] el tambor del revólver debe verse de canto (eje hacia el lado, no hacia delante)
    cyl('barrel', 0.014, barrel_len, (0, 0, -l * 0.2 - barrel_len / 2), C_DARK, root)
    box('hammer', (0.014, 0.03, 0.02), (0, h / 2 + 0.012, l * 0.28), C_ACC, root, rot=(-0.4, 0, 0))
    box('grip', (0.045, 0.13, 0.05), (0, -h / 2 - 0.05, l * 0.42), C_WOOD, root, rot=(-0.35, 0, 0))
    box('sight_front', (0.01, 0.018, 0.01), (0, h * 0.4, -l * 0.2 - barrel_len - 0.01), C_ACC, root)
    return root

def make_pistol(root_name, size, barrel_len, secondary=False):
    """Pistola semiautomática (Precisión) o pistola secundaria (Dúo): corredera, cargador recto."""
    w, h, l = size
    root = new_empty(root_name)
    box('body', (w, h * 0.6, l), (0, h * 0.2, 0), C_DARK, root)
    box('slide', (w * 0.92, h * 0.42, l * 0.8), (0, h * 0.42, -l * 0.05), C_ACC, root)
    cyl('barrel', 0.01, barrel_len * 0.5, (0, h * 0.42, -l / 2 - 0.02), C_DARK, root)
    box('magazine', (0.038, 0.13, 0.045), (0, -h / 2, l * 0.08), C_ACC, root, rot=(0.08, 0, 0))
    box('grip', (0.045, 0.15, 0.05), (0, -h / 2 - 0.02, l * 0.3), C_WOOD if not secondary else C_DARK, root, rot=(-0.28, 0, 0))
    box('sight_front', (0.012, 0.014, 0.012), (0, h * 0.62, -l / 2 - 0.01), C_ACC, root)
    box('sight_rear', (0.03, 0.014, 0.014), (0, h * 0.62, l * 0.28), C_ACC, root)
    return root

def make_rocket(root_name, size, barrel_len):
    """Lanzacohetes (Rocketeer): tubo ancho, mira óptica montada encima. [NO conectado a la partida: el
    juego solo tiene armas de trayectoria instantánea; un cohete necesita física de proyectil aparte]."""
    w, h, l = size
    root = new_empty(root_name)
    cyl('tube', 0.09, l, (0, 0, 0), C_DARK, root, verts=10)
    cyl('tube_front', 0.1, 0.03, (0, 0, -l / 2 - 0.015), C_ACC, root, verts=10)
    box('grip_front', (0.05, 0.12, 0.045), (0, -0.1, -l * 0.2), C_ACC, root, rot=(-0.2, 0, 0))
    box('grip_rear', (0.045, 0.11, 0.045), (0, -0.1, l * 0.28), C_DARK, root, rot=(-0.3, 0, 0))
    box('sight_mount', (0.02, 0.05, 0.1), (0, 0.11, -0.05), C_DARK, root)
    cyl('sight_scope', 0.022, 0.16, (0, 0.16, -0.05), C_DARK, root)
    cyl('sight_glass', 0.015, 0.005, (0, 0.16, -0.13), C_GLASS, root)
    return root

def make_crossbow(root_name, size, barrel_len):
    """Ballesta (Bowman): arcos laterales, cuerpo central, riel de virotes. [NO conectada a la partida:
    necesita física de proyectil, igual que el lanzacohetes]."""
    w, h, l = size
    root = new_empty(root_name)
    box('body', (w, h, l), (0, 0, 0), C_WOOD, root)
    box('rail', (0.012, 0.012, l * 0.7), (0, h / 2 + 0.01, 0), C_DARK, root)
    box('limb_l', (0.16, 0.014, 0.03), (-0.1, 0, -l * 0.1), C_ACC, root, rot=(0, 0.5, 0))
    box('limb_r', (0.16, 0.014, 0.03), (0.1, 0, -l * 0.1), C_ACC, root, rot=(0, -0.5, 0))
    box('string_l', (0.012, 0.012, 0.24), (-0.155, 0, -l * 0.1), C_DARK, root)   # [CORREGIDO] una caja ya usa Z como su eje largo: la rotación de pi/2 en X (copiada del cilindro) la dejaba vertical
    box('string_r', (0.012, 0.012, 0.24), (0.155, 0, -l * 0.1), C_DARK, root)
    box('grip', (0.045, 0.12, 0.045), (0, -h / 2 - 0.04, l * 0.32), C_WOOD, root, rot=(-0.3, 0, 0))
    box('sight_front', (0.012, 0.024, 0.012), (0, h / 2 + 0.02, -l * 0.1), C_DARK, root)
    return root

# ---------------------------------------------------------------------------------------------------
# Catálogo: una entrada por arma. `fn` es el generador y `args` sus medidas (de public/shared.js).
# Las 9 primeras son armas reales del juego (id = W.id en WEAPONS); las 2 últimas son modelos nuevos
# (lanzacohetes y ballesta) que cubren las 2 clases de Krunker sin equivalente hoy en el juego: se
# generan igualmente, pero no están conectadas a ninguna mecánica de disparo todavía.
# ---------------------------------------------------------------------------------------------------
WEAPONS = [
    ('asalto',    make_rifle,    dict(size=(0.07, 0.10, 0.50), barrel_len=0.22)),
    ('ak',        make_rifle,    dict(size=(0.07, 0.10, 0.56), barrel_len=0.22, wood=True)),
    ('centinela', make_rifle,    dict(size=(0.07, 0.10, 0.62), barrel_len=0.26, has_scope=True, stock_len=0.22)),
    ('rafaga',    make_smg,      dict(size=(0.07, 0.10, 0.34), barrel_len=0.16)),
    ('vortice',   make_smg,      dict(size=(0.07, 0.10, 0.40), barrel_len=0.18)),
    ('torrente',  make_lmg,      dict(size=(0.10, 0.12, 0.55), barrel_len=0.28)),
    ('lince',     make_rifle,    dict(size=(0.06, 0.08, 0.80), barrel_len=0.36, has_scope=True, stock_len=0.20)),
    ('trueno',    make_shotgun,  dict(size=(0.09, 0.12, 0.46), barrel_len=0.24)),
    ('sheriff',   make_revolver, dict(size=(0.055, 0.09, 0.22), barrel_len=0.09)),
    ('precision', make_pistol,   dict(size=(0.06, 0.09, 0.20), barrel_len=0.08)),
    ('duo',       make_pistol,   dict(size=(0.05, 0.08, 0.16), barrel_len=0.06, secondary=True)),
    ('rocketeer_bonus', make_rocket,   dict(size=(0.10, 0.10, 0.55), barrel_len=0)),
    ('bowman_bonus',    make_crossbow, dict(size=(0.09, 0.05, 0.32), barrel_len=0)),
]


def export_one(weapon_id, fn, kwargs):
    clear_scene()
    root = fn('root', **kwargs)
    root.name = weapon_id
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.collection.objects:
        obj.select_set(True)
    out_path = os.path.join(OUT_DIR, weapon_id + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        use_selection=True,
        export_format='GLB',
        export_apply=True,
        export_yup=False,         # [CORREGIDO] mis piezas ya usan Y=alto, Z=largo, igual que el juego; con export_yup=True
                                   # el exportador daba por hecho que Z era "arriba" (el criterio propio de Blender) y giraba
                                   # el arma 90°, dejándola vertical en vez de apuntando hacia delante
        export_animations=False,
        export_materials='EXPORT',
    )
    n_objs = len(bpy.context.collection.objects)
    n_tris = sum(len(o.data.polygons) for o in bpy.context.collection.objects if o.type == 'MESH')
    size_kb = os.path.getsize(out_path) / 1024 if os.path.exists(out_path) else 0
    print('EXPORTADO %-20s objetos=%-3d triángulos≈%-4d %6.1f KB -> %s' % (weapon_id, n_objs, n_tris, size_kb, out_path))
    return n_objs, n_tris, size_kb


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    results = []
    for weapon_id, fn, kwargs in WEAPONS:
        results.append((weapon_id,) + export_one(weapon_id, fn, kwargs))
    print('\n== %d armas exportadas a %s ==' % (len(results), OUT_DIR))
    return results


if __name__ == '__main__':
    # Blender pasa sus propios argumentos antes de "--": los ignoramos, este script no necesita ninguno.
    main()
