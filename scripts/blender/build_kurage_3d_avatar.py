import argparse
import json
import sys
import bpy, math, bmesh, addon_utils
from mathutils import Vector, Euler
from pathlib import Path

def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--character', default='f_an01')
    return parser.parse_args(argv)


ARGS = parse_args()
OUT = Path(ARGS.output_dir).resolve()
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene

# Generate the anime base without GUI. MB-Lab's Blender 4.2 Eevee selector
# still uses the old BLENDER_EEVEE identifier, so initialization runs in
# Workbench and the final preview switches to Eevee Next.
addon_utils.enable('mb-lab', default_set=True, persistent=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene.mblab_character_name = ARGS.character
scene.mblab_use_ik = False
scene.mblab_use_muscle = False
scene.mblab_use_lamps = False
scene.mblab_use_eevee = False
scene.mblab_use_cycles = False
for label, operation in (
    ('initialize', bpy.ops.mbast.init_character),
    ('auto model', bpy.ops.mbast.auto_modelling),
    ('finalize', bpy.ops.mbast.finalize_character),
):
    result = operation()
    if 'FINISHED' not in result:
        raise RuntimeError(f'MB-Lab {label} failed: {result}')

arm = next(o for o in scene.objects if o.type == 'ARMATURE')
body = next(o for o in scene.objects if o.type == 'MESH')

def material(name, color, metallic=0.0, roughness=0.45):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = color
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if color[3] < 1:
        bsdf.inputs['Alpha'].default_value = color[3]
        m.surface_render_method = 'DITHERED'
    return m

hair = material('Kurage Aqua Hair', (0.28, 0.82, 0.92, 1), 0.05, 0.28)
hair_light = material('Kurage Pearl Hair', (0.78, 0.96, 1.0, 1), 0.02, 0.22)
white = material('Kurage Pearl Dress', (0.94, 0.99, 1.0, 1), 0.02, 0.30)
aqua = material('Kurage Aqua Accent', (0.10, 0.68, 0.82, 1), 0.08, 0.25)
navy = material('Kurage Ink Accent', (0.03, 0.18, 0.28, 1), 0.10, 0.30)

# MB-Lab's anime base uses a black generic material for underwear. Keep the
# geometry under the dress, but color it pearl white so it cannot puncture the
# outfit as two black artifacts.
for slot in body.material_slots:
    if slot.material and 'generic' in slot.material.name.lower():
        slot.material.diffuse_color = (0.94, 0.99, 1.0, 1)
        if slot.material.use_nodes:
            base = slot.material.node_tree.nodes.get('Principled BSDF')
            if base:
                base.inputs['Base Color'].default_value = (0.94, 0.99, 1.0, 1)

# Put arms into a relaxed portrait pose instead of MB-Lab's T pose.
for name, zdeg in [('upperarm_L', -112), ('upperarm_R', 112)]:
    pb = arm.pose.bones.get(name)
    if pb:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = Euler((0, 0, math.radians(zdeg)), 'XYZ')
for name, zdeg in [('lowerarm_L', -8), ('lowerarm_R', 8)]:
    pb = arm.pose.bones.get(name)
    if pb:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = Euler((math.radians(-7), 0, math.radians(zdeg)), 'XYZ')
bpy.context.view_layer.update()

# GLB exporters otherwise restore MB-Lab's T-pose as the bind pose. Make the
# relaxed portrait stance the new rest pose while retaining the armature.
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode='OBJECT')

def curve(name, points, mat, bevel=0.018, resolution=3):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = resolution
    data.bevel_depth = bevel
    data.bevel_resolution = 4
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for bp, co in zip(spline.bezier_points, points):
        bp.co = co
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

# Smooth hair shell. Delete the lower-front part of a UV sphere so the face
# stays visible while the top, sides, and back read as one coherent hairstyle.
bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, location=(0, 0.015, 1.65))
cap = bpy.context.object
cap.name = 'Kurage smooth hair shell'
cap.scale = (0.178, 0.132, 0.220)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
mesh = bmesh.new(); mesh.from_mesh(cap.data)
remove = [v for v in mesh.verts if v.co.z < -0.145 or (v.co.y < -0.025 and v.co.z < 0.095)]
bmesh.ops.delete(mesh, geom=remove, context='VERTS')
mesh.to_mesh(cap.data); mesh.free()
cap.data.materials.append(hair)
bevel = cap.modifiers.new('soft hair edge', 'BEVEL'); bevel.width = 0.004; bevel.segments = 3

def ribbon(name, points, widths, mat):
    verts=[]; faces=[]
    for (x,y,z), width in zip(points, widths):
        verts.extend([(x-width,y,z), (x+width,y,z)])
    for i in range(len(points)-1):
        j=i*2; faces.append((j,j+1,j+3,j+2))
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    ob=bpy.data.objects.new(name,me); scene.collection.objects.link(ob); me.materials.append(mat)
    solid=ob.modifiers.new('hair thickness','SOLIDIFY'); solid.thickness=0.006
    bevel=ob.modifiers.new('soft hair edge','BEVEL'); bevel.width=0.004; bevel.segments=3
    return ob

# Flat tapered bangs avoid the pipe-like look of the first prototype.
for i in range(7):
    u=(i-3)/3
    ribbon(f'front_bang_{i}', [
        (0.105*u,-0.135,1.785-0.008*abs(u)),
        (0.115*u,-0.151,1.705),
        (0.090*u,-0.154,1.625+0.020*abs(u)),
    ], [0.030,0.027,0.006], hair_light if i in (2,4) else hair)

# Broad side locks and a few thin aqua tendrils carry the jellyfish motif
# without turning into insect antennae.
for side in (-1,1):
    ribbon(f'side_lock_{side}', [
        (side*0.115,-0.105,1.75),
        (side*0.162,-0.115,1.57),
        (side*0.175,-0.100,1.36),
        (side*0.155,-0.070,1.18),
    ], [0.035,0.050,0.046,0.010], hair)
    curve(f'jelly_tendril_{side}', [
        (side*0.145,0.055,1.68),
        (side*0.205,0.060,1.48),
        (side*0.225,0.045,1.28),
        (side*0.195,0.020,1.12),
    ], aqua, 0.010)

# Simple commercial-looking white/aqua outfit covering the base underwear.
def cone(name, radius1, radius2, depth, z, mat):
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=radius1, radius2=radius2, depth=depth, location=(0, 0, z))
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    return o

bodice = cone('Kurage dress bodice', 0.225, 0.205, 0.39, 1.16, white)
skirt = cone('Kurage bell skirt', 0.34, 0.225, 0.45, 0.86, white)
waist = cone('Kurage aqua waist', 0.226, 0.226, 0.055, 1.00, aqua)
# Collar and brand pearl.
bpy.ops.mesh.primitive_torus_add(major_radius=0.190, minor_radius=0.017, major_segments=48, minor_segments=12, location=(0, -0.005, 1.36))
collar = bpy.context.object
collar.name = 'Kurage aqua collar'
collar.data.materials.append(aqua)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.035, location=(0, -0.235, 1.315))
pearl = bpy.context.object
pearl.name = 'Kurage pearl brooch'
pearl.data.materials.append(navy)

# White Studio environment.
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (0.92, 0.98, 1.0, 1)
bg.inputs['Strength'].default_value = 0.55
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
floor = bpy.context.object
floor.name = 'WhiteStudioFloor'
floor.data.materials.append(material('White Studio Floor', (0.89,0.96,0.98,1), 0, 0.7))

def look(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z','Y').to_euler()

def area(name, loc, energy, size, color):
    d=bpy.data.lights.new(name,'AREA'); d.energy=energy; d.shape='DISK'; d.size=size; d.color=color
    o=bpy.data.objects.new(name,d); scene.collection.objects.link(o); o.location=loc; look(o,(0,0,1.35))

area('Key', (2.2,-3.0,3.5), 850, 3.0, (1.0,0.96,0.92))
area('Fill', (-2.4,-2.0,2.4), 650, 2.5, (0.72,0.91,1.0))
area('Rim', (0,2.0,3.0), 900, 2.0, (0.55,0.88,1.0))

camd=bpy.data.cameras.new('Camera'); cam=bpy.data.objects.new('Camera',camd); scene.collection.objects.link(cam); scene.camera=cam
cam.location=(0,-2.45,1.42); camd.lens=72; look(cam,(0,0,1.42))
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=720; scene.render.resolution_y=960; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(OUT/'kurage-3d-avatar-preview.png')
scene.view_settings.look='AgX - Medium High Contrast'

bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'kurage-3d-avatar.blend'))
bpy.ops.render.render(write_still=True)
# Export all model geometry but not studio environment.
for o in scene.objects: o.select_set(o.type in {'MESH','ARMATURE'} and o.name != 'WhiteStudioFloor')
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(OUT/'kurage-3d-avatar.glb'), export_format='GLB', use_selection=True, export_skins=True, export_morph=True, export_animations=True)

manifest = {
    'generator': 'kvtuber MB-Lab headless pipeline',
    'characterPreset': ARGS.character,
    'model': 'kurage-3d-avatar.glb',
    'preview': 'kurage-3d-avatar-preview.png',
    'modelLicense': 'AGPL-3.0 (derived from MB-Lab database)',
    'renderLicense': 'Project-selected; MB-Lab license permits commercial 2D renders and videos',
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('DONE', OUT/'kurage-3d-avatar-preview.png', OUT/'kurage-3d-avatar.glb')
