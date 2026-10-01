"""Educational hose couplings, approximate reference proportions, dimensions in metres.

Run inside Blender. Creates a dedicated scene; never removes existing user objects.
No external textures or paid generators. GLB export excludes the presentation studio.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

OUTPUT = Path(__file__).resolve().parents[2] / "assets/models/acoples"
OUTPUT.mkdir(parents=True, exist_ok=True)
if bpy.data.scenes.get("BCBD_Acoples"):
    raise RuntimeError("BCBD_Acoples already exists; inspect it before rebuilding.")
scene = bpy.data.scenes.new("BCBD_Acoples")
bpy.context.window.scene = scene
models = bpy.data.collections.new("Acoples - modelo exportable")
studio = bpy.data.collections.new("Estudio - solo presentacion")
scene.collection.children.link(models)
scene.collection.children.link(studio)

def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    mat.diffuse_color = (*color, 1)
    return mat

aluminium = material("Aluminio satinado", (0.56, 0.61, 0.65), 0.88, 0.29)
collar_mat = material("Aluminio - collar", (0.44, 0.49, 0.53), 0.88, 0.33)
rubber = material("Junta interior de goma", (0.019, 0.025, 0.032), 0, 0.75)
floor_mat = material("Estudio grafito", (0.032, 0.043, 0.059), 0, 0.78)

def mesh_object(name, vertices, faces, mat, parent=None, collection=models):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj

def lathe(name, profile, mat, parent, segments=64):
    vertices = [(r*math.cos(j*2*math.pi/segments), r*math.sin(j*2*math.pi/segments), z)
                for r, z in profile for j in range(segments)]
    faces = []
    for k in range(len(profile)):
        nxt = (k+1) % len(profile)
        for j in range(segments):
            faces.append((k*segments+j, k*segments+(j+1)%segments,
                          nxt*segments+(j+1)%segments, nxt*segments+j))
    obj = mesh_object(name, vertices, faces, mat, parent)
    for k in range(len(profile)):
        smooth = abs(profile[k][1]-profile[(k+1)%len(profile)][1]) > 0.00001
        for polygon in obj.data.polygons[k*segments:(k+1)*segments]:
            polygon.use_smooth = smooth
    return obj

def thread(name, radius, z0, pitch, turns, depth, parent):
    # One continuous helix, not a stack of decorative rings. Ends taper gently.
    steps = int(turns*64)
    vertices, faces = [], []
    for i in range(steps+1):
        angle = 2*math.pi*turns*i/steps
        z = z0+pitch*turns*i/steps
        taper = min(1, i/12, (steps-i)/12)
        for dr, dz in ((0,-pitch*0.32), (depth*taper,0), (0,pitch*0.32), (-depth*0.12,0)):
            vertices.append(((radius+dr)*math.cos(angle), (radius+dr)*math.sin(angle), z+dz))
        if i:
            for j in range(4):
                faces.append(((i-1)*4+j, (i-1)*4+(j+1)%4, i*4+(j+1)%4, i*4+j))
    faces.extend([(3,2,1,0), tuple(steps*4+j for j in range(4))])
    obj = mesh_object(name, vertices, faces, aluminium, parent)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj

def lugs(parent, radius, z, length, width, depth, count=4):
    for i in range(count):
        angle = i*2*math.pi/count
        verts = [(x*depth/2, y*width/2, zz*length/2)
                 for zz in (-1,1) for y in (-1,1) for x in (-1,1)]
        faces = [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
        obj = mesh_object(parent.name+"_Saliente_"+str(i+1), verts, faces, collar_mat, parent)
        obj.location = (radius*math.cos(angle), radius*math.sin(angle), z)
        obj.rotation_euler.z = angle
        bevel = obj.modifiers.new("Bordes suaves", "BEVEL")
        bevel.width = 0.0018
        bevel.segments = 3
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        obj.select_set(False)

male = bpy.data.objects.new("Acople_Macho", None)
female = bpy.data.objects.new("Acople_Hembra", None)
for obj, x in ((male,-0.065),(female,0.065)):
    models.objects.link(obj)
    obj.location.x = x
    obj["educational_approximation"] = True
    obj["axis"] = "Z; coupling opening faces +Z"

lathe("Macho_Cuerpo", [(0.029,0.001),(0.039,0.001),(0.041,0.003),
      (0.041,0.039),(0.039,0.043),(0.035,0.045),(0.035,0.067),
      (0.034,0.069),(0.029,0.069)], aluminium, male)
thread("Macho_Rosca_exterior",0.035,0.047,0.0046,4,0.00155,male)
lugs(male,0.0418,0.023,0.028,0.012,0.006)
male["part"] = "male; external thread; longer axial lugs"

lathe("Hembra_Cuerpo", [(0.029,0.001),(0.039,0.001),(0.041,0.003),
      (0.041,0.047),(0.039,0.050),(0.0355,0.050),(0.029,0.047)], aluminium, female)
lathe("Hembra_Collar_giratorio",[(0.0355,0.047),(0.0435,0.047),
      (0.045,0.0485),(0.045,0.071),(0.0435,0.0725),
      (0.0355,0.0725)],collar_mat,female)
thread("Hembra_Rosca_interior",0.0355,0.051,0.0046,4,-0.00155,female)
lathe("Hembra_Junta",[(0.029,0.045),(0.0355,0.045),(0.0355,0.047),
      (0.029,0.047)],rubber,female)
lugs(female,0.0455,0.060,0.018,0.012,0.006)
female["part"] = "female; internal thread; swivel collar; shorter lugs"

mesh_object("Suelo de estudio",[(-2,-2,0),(2,-2,0),(2,2,0),(-2,2,0)],
            [(0,1,2,3)],floor_mat,collection=studio)
world = bpy.data.worlds.new("BCBD_Studio_World")
world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs["Color"].default_value = (0.21,0.25,0.32,1)
next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs["Strength"].default_value = 0.45
scene.world = world

target = Vector((0,0,0.032))
def aim(obj):
    obj.rotation_euler = (target-obj.location).to_track_quat('-Z','Y').to_euler()
for name, location, energy, size, color in [
    ("Softbox principal",(-0.16,-0.12,0.26),3.5,0.20,(0.90,0.95,1)),
    ("Softbox relleno",(0.19,-0.04,0.18),2.25,0.16,(1,0.94,0.85)),
    ("Luz de contorno",(0.04,0.16,0.23),4.5,0.13,(0.79,0.88,1))]:
    data = bpy.data.lights.new(name,"AREA")
    data.energy, data.size, data.color = energy, size, color
    obj = bpy.data.objects.new(name,data)
    studio.objects.link(obj)
    obj.location = location
    aim(obj)
camera_data = bpy.data.cameras.new("Camara de revision")
camera = bpy.data.objects.new("Camara de revision",camera_data)
studio.objects.link(camera)
camera.location = (0.12,-0.31,0.19)
camera_data.lens = 52
camera_data.clip_start = 0.001
aim(camera)
scene.camera = camera
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x,scene.render.resolution_y = 1400,900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUTPUT/"acoples-preview.png")
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.clip_start = 0.001
            area.spaces.active.shading.type = "MATERIAL"
            area.spaces.active.overlay.show_floor = False
            area.spaces.active.overlay.show_extras = False
            area.spaces.active.overlay.show_overlays = False
            region = area.spaces.active.region_3d
            region.view_rotation = camera.rotation_euler.to_quaternion()
            region.view_location = target
            region.view_distance = 0.32
for obj in bpy.context.selected_objects:
    obj.select_set(False)
bpy.context.view_layer.objects.active = male
scene["purpose"] = "Visual educational reference, not a certified/manufacturing model. No exact thread standard claimed."
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/"acoples-bomberos.blend"))
print("Created two independent coupling roots. Source saved:", OUTPUT)
