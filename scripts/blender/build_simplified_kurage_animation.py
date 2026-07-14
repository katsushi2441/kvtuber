#!/usr/bin/env python3
"""Build and render a deliberately simple, rigged Kurage mascot."""

import math
import os
import sys

import bpy
from mathutils import Vector


def arg_value(name, default):
    if "--" not in sys.argv:
        return default
    args = sys.argv[sys.argv.index("--") + 1 :]
    if name not in args:
        return default
    index = args.index(name)
    return args[index + 1]


OUTPUT_DIR = os.path.abspath(arg_value("--output-dir", "outputs/simplified-kurage"))
BLEND_PATH = os.path.join(OUTPUT_DIR, "simplified-kurage-wave.blend")
VIDEO_PATH = os.path.join(OUTPUT_DIR, "simplified-kurage-wave.mp4")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        if collection is bpy.data.materials:
            continue
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def material(name, color, roughness=0.65, metallic=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color[:3], color[3])
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def add_uv_sphere(name, location, scale, mat, segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return smooth(obj)


def add_cylinder_between(name, start, end, radius, mat, vertices=24):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    midpoint = (start + end) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=direction.length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.data.materials.append(mat)
    return smooth(obj)


def add_capsule(name, start, end, radius, mat):
    pieces = [add_cylinder_between(name, start, end, radius, mat)]
    pieces.append(add_uv_sphere(f"{name}.start", start, (radius, radius, radius), mat, 24, 16))
    pieces.append(add_uv_sphere(f"{name}.end", end, (radius, radius, radius), mat, 24, 16))
    return pieces


def add_cone(name, location, radius_bottom, radius_top, depth, mat):
    bpy.ops.mesh.primitive_cone_add(
        vertices=48,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Soft edges", "BEVEL")
    bevel.width = 0.06
    bevel.segments = 3
    return smooth(obj)


def add_torus(name, location, major_radius, minor_radius, mat):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=48,
        minor_segments=12,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return smooth(obj)


def add_bow(name, location, scale, mat):
    parts = []
    for side in (-1, 1):
        piece = add_uv_sphere(
            f"{name}.loop.{side}",
            (location[0] + side * scale * 0.45, location[1], location[2]),
            (scale * 0.55, scale * 0.20, scale * 0.34),
            mat,
            24,
            16,
        )
        parts.append(piece)
    parts.append(add_uv_sphere(f"{name}.knot", location, (scale * 0.22,) * 3, mat, 24, 16))
    return parts


def create_armature():
    armature_data = bpy.data.armatures.new("KurageSimpleRig")
    armature = bpy.data.objects.new("KurageSimpleRig", armature_data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None):
        edit_bone = armature.data.edit_bones.new(name)
        edit_bone.head = head
        edit_bone.tail = tail
        if parent:
            edit_bone.parent = armature.data.edit_bones[parent]
        return edit_bone

    bone("root", (0, 0, 0.15), (0, 0, 1.0))
    bone("torso", (0, 0, 1.75), (0, 0, 3.35), "root")
    bone("head", (0, 0, 3.35), (0, 0, 4.45), "torso")

    arm_points = {
        "L": ((0.58, 0, 3.08), (1.12, 0, 2.67), (1.42, 0, 2.15)),
        "R": ((-0.58, 0, 3.08), (-1.12, 0, 2.67), (-1.42, 0, 2.15)),
    }
    for side, (shoulder, elbow, hand) in arm_points.items():
        bone(f"upper_arm.{side}", shoulder, elbow, "torso")
        bone(f"forearm.{side}", elbow, hand, f"upper_arm.{side}")
        bone(f"hand.{side}", hand, (hand[0], hand[1], hand[2] - 0.28), f"forearm.{side}")

    leg_points = {
        "L": ((0.33, 0, 1.75), (0.33, 0, 0.92), (0.33, 0, 0.18)),
        "R": ((-0.33, 0, 1.75), (-0.33, 0, 0.92), (-0.33, 0, 0.18)),
    }
    for side, (hip, knee, ankle) in leg_points.items():
        bone(f"thigh.{side}", hip, knee, "root")
        bone(f"shin.{side}", knee, ankle, f"thigh.{side}")

    tentacle_x = (-0.55, -0.18, 0.18, 0.55)
    for index, x in enumerate(tentacle_x, 1):
        first = f"tentacle.{index}.1"
        second = f"tentacle.{index}.2"
        third = f"tentacle.{index}.3"
        bone(first, (x, 0.24, 3.85), (x, 0.28, 3.13), "head")
        bone(second, (x, 0.28, 3.13), (x, 0.31, 2.47), first)
        bone(third, (x, 0.31, 2.47), (x, 0.30, 1.95), second)

    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.show_in_front = True
    return armature


def parent_to_bone(obj, armature, bone_name):
    world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world


def parent_all(objects, armature, bone_name):
    for obj in objects:
        parent_to_bone(obj, armature, bone_name)


def build_character(armature, mats):
    skin = mats["skin"]
    white = mats["white"]
    aqua = mats["aqua"]
    blue = mats["blue"]
    dark = mats["dark"]
    blush = mats["blush"]

    body = add_cone("Simple white dress", (0, 0, 2.35), 0.82, 0.48, 1.55, white)
    parent_to_bone(body, armature, "torso")
    hem = add_torus("Aqua dress hem", (0, 0, 1.61), 0.72, 0.055, aqua)
    hem.scale.y = 0.92
    parent_to_bone(hem, armature, "torso")
    parent_all(add_bow("Chest bow", (0, -0.50, 2.82), 0.34, aqua), armature, "torso")

    head = add_uv_sphere("Head", (0, -0.02, 3.92), (0.72, 0.62, 0.76), skin)
    parent_to_bone(head, armature, "head")

    cap = add_uv_sphere("Jellyfish cap", (0, 0.02, 4.48), (0.91, 0.79, 0.43), blue)
    parent_to_bone(cap, armature, "head")
    for index in range(8):
        angle = math.radians(index * 45)
        scallop = add_uv_sphere(
            f"Cap scallop {index + 1}",
            (0.70 * math.sin(angle), 0.60 * math.cos(angle), 4.24),
            (0.22, 0.18, 0.16),
            blue,
            24,
            16,
        )
        parent_to_bone(scallop, armature, "head")

    hair_positions = (
        (-0.55, -0.02, 4.00, -10, (0.25, 0.24, 0.50), True),
        (-0.24, -0.43, 4.18, -5, (0.21, 0.18, 0.34), False),
        (0.00, -0.47, 4.21, 0, (0.22, 0.17, 0.35), False),
        (0.24, -0.43, 4.18, 5, (0.21, 0.18, 0.34), False),
        (0.55, -0.02, 4.00, 10, (0.25, 0.24, 0.50), True),
        (0.00, 0.42, 4.02, 0, (0.32, 0.24, 0.52), True),
    )
    for index, (x, y, z, tilt, scale, has_tip) in enumerate(hair_positions, 1):
        hair = add_uv_sphere(f"Hair clump {index}", (x, y, z), scale, white)
        hair.rotation_euler.y = math.radians(tilt)
        parent_to_bone(hair, armature, "head")
        if has_tip:
            tip = add_uv_sphere(f"Hair tip {index}", (x, y - 0.01, z - 0.39), (0.19, 0.18, 0.16), aqua)
            tip.rotation_euler.y = math.radians(tilt)
            parent_to_bone(tip, armature, "head")

    eyes = []
    for side, x in (("L", 0.28), ("R", -0.28)):
        eye = add_uv_sphere(f"Eye.{side}", (x, -0.603, 3.96), (0.17, 0.055, 0.23), aqua)
        parent_to_bone(eye, armature, "head")
        pupil = add_uv_sphere(f"Pupil.{side}", (x, -0.653, 3.97), (0.070, 0.025, 0.13), dark, 24, 16)
        parent_to_bone(pupil, armature, "head")
        highlight = add_uv_sphere(f"Eye shine.{side}", (x - 0.035, -0.677, 4.04), (0.026, 0.012, 0.038), white, 16, 12)
        parent_to_bone(highlight, armature, "head")
        eyes.extend((eye, pupil, highlight))

    for side, x in (("L", 0.42), ("R", -0.42)):
        cheek = add_uv_sphere(f"Cheek.{side}", (x, -0.596, 3.75), (0.12, 0.022, 0.045), blush, 20, 12)
        parent_to_bone(cheek, armature, "head")

    mouth = add_uv_sphere("Mouth", (0, -0.635, 3.70), (0.10, 0.020, 0.055), dark, 20, 12)
    parent_to_bone(mouth, armature, "head")

    arm_points = {
        "L": ((0.58, 0, 3.08), (1.12, 0, 2.67), (1.42, 0, 2.15)),
        "R": ((-0.58, 0, 3.08), (-1.12, 0, 2.67), (-1.42, 0, 2.15)),
    }
    for side, (shoulder, elbow, hand) in arm_points.items():
        parent_all(add_capsule(f"Upper arm.{side}", shoulder, elbow, 0.16, skin), armature, f"upper_arm.{side}")
        parent_all(add_capsule(f"Forearm.{side}", elbow, hand, 0.145, skin), armature, f"forearm.{side}")
        hand_obj = add_uv_sphere(f"Hand.{side}", (hand[0], hand[1] - 0.01, hand[2] - 0.15), (0.18, 0.13, 0.24), skin)
        parent_to_bone(hand_obj, armature, f"hand.{side}")

    leg_points = {
        "L": ((0.33, 0, 1.75), (0.33, 0, 0.92), (0.33, 0, 0.18)),
        "R": ((-0.33, 0, 1.75), (-0.33, 0, 0.92), (-0.33, 0, 0.18)),
    }
    for side, (hip, knee, ankle) in leg_points.items():
        parent_all(add_capsule(f"Thigh.{side}", hip, knee, 0.22, skin), armature, f"thigh.{side}")
        parent_all(add_capsule(f"Shin.{side}", knee, ankle, 0.20, skin), armature, f"shin.{side}")
        boot = add_uv_sphere(f"Boot.{side}", (ankle[0], -0.09, 0.30), (0.27, 0.38, 0.36), white)
        parent_to_bone(boot, armature, f"shin.{side}")

    tentacle_x = (-0.55, -0.18, 0.18, 0.55)
    for index, x in enumerate(tentacle_x, 1):
        points = ((x, 0.24, 3.85), (x, 0.28, 3.13), (x, 0.31, 2.47), (x, 0.30, 1.95))
        for segment in range(3):
            pieces = add_capsule(
                f"Tentacle {index}.{segment + 1}",
                points[segment],
                points[segment + 1],
                0.13 - segment * 0.018,
                blue,
            )
            parent_all(pieces, armature, f"tentacle.{index}.{segment + 1}")

    return eyes


def keyframe_rotation(pose_bone, frame, rotation):
    pose_bone.rotation_euler = rotation
    pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)


def animate(armature, eyes):
    pose = armature.pose.bones

    for frame, angle in ((1, 0), (30, -0.035), (60, 0.035), (90, -0.035), (120, 0)):
        keyframe_rotation(pose["torso"], frame, (0, 0, angle))

    for frame, angle in ((1, 0), (24, 0.08), (48, -0.04), (72, 0.08), (96, -0.04), (120, 0)):
        keyframe_rotation(pose["head"], frame, (angle, 0, -angle * 0.35))

    # A world-space IK target makes the wave obvious and avoids local-axis ambiguity.
    ik_target = bpy.data.objects.new("Right hand wave target", None)
    bpy.context.collection.objects.link(ik_target)
    ik_target.empty_display_type = "SPHERE"
    ik_target.empty_display_size = 0.12
    ik_target.hide_render = True
    constraint = pose["forearm.R"].constraints.new("IK")
    constraint.target = ik_target
    constraint.chain_count = 2
    constraint.use_stretch = False
    for frame, location in (
        (1, (-1.42, -0.02, 2.15)),
        (18, (-1.05, -0.05, 4.20)),
        (34, (-1.42, -0.05, 4.28)),
        (50, (-0.92, -0.05, 4.18)),
        (66, (-1.42, -0.05, 4.28)),
        (82, (-0.92, -0.05, 4.18)),
        (102, (-1.22, -0.05, 4.15)),
        (120, (-1.42, -0.02, 2.15)),
    ):
        ik_target.location = location
        ik_target.keyframe_insert(data_path="location", frame=frame)
    for frame, angle in ((1, 0), (34, 0.45), (50, -0.45), (66, 0.45), (82, -0.45), (102, 0), (120, 0)):
        keyframe_rotation(pose["hand.R"], frame, (0, angle, 0))

    for index in range(1, 5):
        phase = (index - 1) * 7
        direction = -1 if index % 2 else 1
        for segment in range(1, 4):
            bone = pose[f"tentacle.{index}.{segment}"]
            amount = direction * (0.05 + segment * 0.025)
            for frame, multiplier in ((1, 0), (30 + phase, 1), (60 + phase, -1), (90 + phase, 1), (120, 0)):
                if frame <= 120:
                    keyframe_rotation(bone, frame, (amount * multiplier, amount * 0.5 * multiplier, 0))

    for eye in eyes:
        eye.scale = (1, 1, 1)
        eye.keyframe_insert(data_path="scale", frame=1)
        for blink_frame in (46, 94):
            eye.scale = (1, 1, 1)
            eye.keyframe_insert(data_path="scale", frame=blink_frame - 2)
            eye.scale = (1, 1, 0.08)
            eye.keyframe_insert(data_path="scale", frame=blink_frame)
            eye.scale = (1, 1, 1)
            eye.keyframe_insert(data_path="scale", frame=blink_frame + 2)

    if armature.animation_data and armature.animation_data.action:
        for curve in armature.animation_data.action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = "BEZIER"


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_studio(mats):
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.18))
    floor = bpy.context.object
    floor.name = "White Studio Floor"
    floor.data.materials.append(mats["studio"])

    bpy.ops.object.light_add(type="AREA", location=(-4.5, -4.0, 8.0))
    key = bpy.context.object
    key.name = "Key Light"
    key.data.energy = 1050
    key.data.shape = "DISK"
    key.data.size = 5.0
    look_at(key, (0, 0, 2.5))

    bpy.ops.object.light_add(type="AREA", location=(5.0, -1.0, 5.5))
    fill = bpy.context.object
    fill.name = "Fill Light"
    fill.data.energy = 800
    fill.data.size = 4.0
    look_at(fill, (0, 0, 2.7))

    bpy.ops.object.light_add(type="AREA", location=(0, 4.0, 6.0))
    rim = bpy.context.object
    rim.name = "Rim Light"
    rim.data.energy = 900
    rim.data.size = 3.0
    look_at(rim, (0, 0, 3.0))

    bpy.ops.object.camera_add(location=(0, -13.8, 4.8))
    camera = bpy.context.object
    camera.name = "Animation Camera"
    camera.data.lens = 56
    look_at(camera, (0, 0, 2.35))
    bpy.context.scene.camera = camera


def configure_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.filepath = VIDEO_PATH
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 120
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.96, 0.985, 1.0, 1.0)
    background.inputs["Strength"].default_value = 0.8
    scene.view_settings.look = "AgX - Medium High Contrast"


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    clear_scene()
    mats = {
        "skin": material("Skin", (1.0, 0.77, 0.66, 1.0)),
        "white": material("Soft White", (0.94, 0.97, 1.0, 1.0)),
        "aqua": material("Kurage Aqua", (0.20, 0.80, 0.82, 1.0)),
        "blue": material("Jellyfish Blue", (0.38, 0.66, 0.95, 1.0)),
        "dark": material("Face Ink", (0.015, 0.075, 0.13, 1.0)),
        "blush": material("Blush", (1.0, 0.39, 0.45, 1.0)),
        "studio": material("Studio White", (0.86, 0.95, 0.98, 1.0)),
    }
    armature = create_armature()
    eyes = build_character(armature, mats)
    animate(armature, eyes)
    build_studio(mats)
    configure_render()
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    bpy.ops.render.render(animation=True)
    print(f"BLEND={BLEND_PATH}")
    print(f"VIDEO={VIDEO_PATH}")


if __name__ == "__main__":
    main()
