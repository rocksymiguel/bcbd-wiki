"""Assemble a copy of the reference pair, preserving the original Blender scene."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

output = Path(__file__).resolve().parents[2] / 'assets/models/acoples'
source = bpy.data.collections.get('Acoples - modelo exportable')
if source is None or bpy.data.scenes.get('BCBD_Linea_Acoplada'):
    raise RuntimeError('Load the original pair; do not overwrite an existing assembled scene.')
scene = bpy.data.scenes.new('BCBD_Linea_Acoplada')
bpy.context.window.scene = scene
parts = bpy.data.collections.new('Linea - modelo exportable')
studio = bpy.data.collections.new('Linea - estudio')
scene.collection.children.link(parts)
scene.collection.children.link(studio)
copies = {}
for original in source.objects:
    copy = original.copy()
    if original.data:
        copy.data = original.data.copy()
    parts.objects.link(copy)
    copies[original] = copy
for original, copy in copies.items():
    copy.parent = copies.get(original.parent)
male = copies[bpy.data.objects['Acople_Macho']]
female = copies[bpy.data.objects['Acople_Hembra']]
male.name, female.name = 'Linea_Macho', 'Linea_Hembra'
male.location = (-0.057, 0, 0.05)
male.rotation_euler = (0, math.pi/2, 0)
female.location = (0.0595, 0, 0.05)
female.rotation_euler = (0, -math.pi/2, 0)

fabric = bpy.data.materials.new('Manguera - lona marfil')
fabric.use_nodes = True
shader = next(n for n in fabric.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
shader.inputs['Base Color'].default_value = (0.55, 0.48, 0.33, 1)
shader.inputs['Roughness'].default_value = 0.88
fabric.diffuse_color = (0.55, 0.48, 0.33, 1)
profile = [(0.025,-0.18),(0.027,-0.18),(0.028,-0.178),
           (0.028,-0.09),(0.028,0.01),(0.025,0.01)]
for root in (male, female):
    vertices = [(r*math.cos(j*2*math.pi/64), r*math.sin(j*2*math.pi/64), z)
                for r,z in profile for j in range(64)]
    faces = [(k*64+j,k*64+(j+1)%64,((k+1)%len(profile))*64+(j+1)%64,
              ((k+1)%len(profile))*64+j) for k in range(len(profile)) for j in range(64)]
    mesh = bpy.data.meshes.new(root.name+'_Manguera')
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    hose = bpy.data.objects.new(root.name+'_Manguera',mesh)
    parts.objects.link(hose)
    hose.parent = root
    mesh.materials.append(fabric)
    for polygon in mesh.polygons:
        k = polygon.index//64
        polygon.use_smooth = profile[k][1] != profile[(k+1)%len(profile)][1]

scene.world = bpy.data.worlds['BCBD_Studio_World']
floor = bpy.data.objects['Suelo de estudio'].copy()
studio.objects.link(floor)
target = Vector((0,0,0.05))
for original_name, position, energy in [
    ('Softbox principal',(-0.2,-0.25,0.42),12),
    ('Softbox relleno',(0.28,-0.08,0.32),8),
    ('Luz de contorno',(0.06,0.3,0.36),14)]:
    lamp = bpy.data.objects[original_name].copy()
    lamp.data = lamp.data.copy()
    lamp.data.energy = energy
    studio.objects.link(lamp)
    lamp.location = position
    lamp.rotation_euler = (target-lamp.location).to_track_quat('-Z','Y').to_euler()
camera = bpy.data.objects['Camara de revision'].copy()
camera.data = camera.data.copy()
studio.objects.link(camera)
camera.location = (0.12,-0.60,0.35)
camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.lens = 52
scene.camera = camera
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x,scene.render.resolution_y = 1400,850
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(output/'linea-acoplada-preview.png')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            region = area.spaces.active.region_3d
            region.view_rotation = camera.rotation_euler.to_quaternion()
            region.view_location = target
            region.view_distance = 0.65
scene['purpose'] = 'Approximate coupled hose line for visual exploration; no operational direction asserted.'
bpy.ops.wm.save_as_mainfile(filepath=str(output/'linea-acoplada.blend'))
bpy.ops.render.render(write_still=True)
# Lightweight homepage thumbnail, separately rendered; original PNG is preserved.
scene.render.resolution_x,scene.render.resolution_y = 900,550
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 85
scene.render.filepath = str(output/'linea-acoplada-preview.jpg')
bpy.ops.render.render(write_still=True)
scene.render.resolution_x,scene.render.resolution_y = 1400,850
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(output/'linea-acoplada-preview.png')
print('Assembled copy saved; original separate-pair scene preserved.')
