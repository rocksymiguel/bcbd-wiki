import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export async function createHoseViewer(dialog) {
  const host = dialog.querySelector('#hose-viewport');
  const status = dialog.querySelector('#hose-status');
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','Modelo 3D de acoples de manguera. Arrastra o usa las flechas para rotar. Usa más y menos para acercar o alejar.');
  host.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38,1,0.001,20);
  const controls = new OrbitControls(camera,canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.18;
  controls.maxDistance = 1.7;
  controls.autoRotateSpeed = 1.2;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room,0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff,0x718096,1.8));
  const key = new THREE.DirectionalLight(0xffffff,2.6);
  key.position.set(0.1,0.4,0.5);
  scene.add(key);
  let gltf;
  let timeout;
  let abandoned = false;
  const disposeModel = model => model.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material.dispose());
  });
  try {
    const loading = new GLTFLoader().loadAsync(new URL('../assets/models/acoples/linea-acoplada.glb',import.meta.url).href);
    loading.then(result => { if (abandoned) disposeModel(result.scene); }, () => {});
    gltf = await Promise.race([loading,new Promise((_,reject) => {
      timeout = setTimeout(() => reject(new Error('El modelo tardó demasiado en responder.')),30000);
    })]);
    clearTimeout(timeout);
  } catch (error) {
    abandoned = true;
    clearTimeout(timeout);
    environment.dispose();
    controls.dispose();
    renderer.dispose();
    canvas.remove();
    throw error;
  }
  const model = gltf.scene;
  const male = model.getObjectByName('Linea_Macho');
  const female = model.getObjectByName('Linea_Hembra');
  if (!male || !female) {
    disposeModel(model);
    environment.dispose(); controls.dispose(); renderer.dispose(); canvas.remove();
    throw new Error('Faltan las dos piezas del modelo.');
  }
  scene.add(model);
  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  model.position.sub(center);
  const origins = [male.position.clone(),female.position.clone()];
  const originalMaterials = new Map();
  [male,female].forEach(root => root.traverse(object => {
    if (!object.isMesh || object.name.includes('Manguera')) return;
    object.material = object.material.clone();
    originalMaterials.set(object,{color:object.material.color.clone(),emissive:object.material.emissive.clone()});
  }));
  const explanation = dialog.querySelector('#hose-explanation');
  const viewButtons = [...dialog.querySelectorAll('[data-hose-view]')];
  const partButtons = [...dialog.querySelectorAll('[data-hose-part]')];
  const rotateButton = dialog.querySelector('#hose-rotate');
  let selected = '';
  let running = false;
  let framed = false;
  const resize = () => {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  };
  const resetCamera = () => {
    if (!host.clientWidth || !host.clientHeight) return;
    resize();
    const distance = Math.max(0.62,0.95 / Math.max(camera.aspect,0.55));
    controls.target.set(0,0,0);
    camera.position.set(distance*0.18,distance*0.38,distance);
    controls.update();
    framed = true;
  };
  const selectPart = part => {
    selected = selected === part ? '' : part;
    originalMaterials.forEach((original,object) => {
      object.material.color.copy(original.color);
      object.material.emissive.copy(original.emissive);
    });
    const root = selected === 'male' ? male : selected === 'female' ? female : null;
    root?.traverse(object => {
      if (!originalMaterials.has(object)) return;
      object.material.color.set(selected === 'male' ? 0x67a6ff : 0xf4bc62);
      object.material.emissive.set(selected === 'male' ? 0x10233e : 0x332109);
    });
    partButtons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.hosePart === selected)));
    explanation.textContent = selected === 'male'
      ? 'Macho resaltado en azul: rosca exterior y salientes longitudinales más largos en este modelo. Usa la vista separada para ver la rosca.'
      : selected === 'female'
        ? 'Hembra resaltada en ámbar: rosca interior y collar giratorio con salientes más cortos en este modelo.'
        : 'Selecciona una pieza para resaltarla y conocer sus características.';
  };
  const setView = mode => {
    male.position.copy(origins[0]);
    female.position.copy(origins[1]);
    if (mode === 'separated') { male.position.x -= 0.036; female.position.x += 0.036; }
    viewButtons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.hoseView === mode)));
    host.dataset.view = mode;
  };
  viewButtons.forEach(button => button.addEventListener('click',() => setView(button.dataset.hoseView)));
  partButtons.forEach(button => button.addEventListener('click',() => selectPart(button.dataset.hosePart)));
  rotateButton.addEventListener('click',() => {
    controls.autoRotate = !controls.autoRotate;
    rotateButton.setAttribute('aria-pressed',String(controls.autoRotate));
  });
  dialog.querySelector('#hose-reset').addEventListener('click',() => {
    controls.autoRotate = false;
    rotateButton.setAttribute('aria-pressed','false');
    setView('coupled');
    selected = '';
    selectPart('');
    resetCamera();
  });
  canvas.addEventListener('keydown',event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(event.key)) return;
    event.preventDefault();
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
    if (event.key === 'ArrowRight') spherical.theta += 0.12;
    if (event.key === 'ArrowUp') spherical.phi -= 0.12;
    if (event.key === 'ArrowDown') spherical.phi += 0.12;
    if (event.key === '+' || event.key === '=') spherical.radius *= 0.9;
    if (event.key === '-') spherical.radius *= 1.1;
    spherical.radius = THREE.MathUtils.clamp(spherical.radius,controls.minDistance,controls.maxDistance);
    spherical.makeSafe();
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
  });
  const updateTheme = () => {
    scene.background = new THREE.Color(document.documentElement.dataset.theme === 'dark' ? 0x182332 : 0xe5ebf2);
  };
  const themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  updateTheme();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  let previousTime;
  const frame = time => {
    const delta = previousTime === undefined ? 0 : Math.min((time-previousTime)/1000,0.05);
    previousTime = time;
    controls.update(delta);
    renderer.render(scene,camera);
  };
  const pause = () => { running = false; renderer.setAnimationLoop(null); previousTime = undefined; host.dataset.running = 'false'; };
  const resume = () => {
    if (running || !dialog.open || document.hidden) return;
    running = true;
    resize();
    if (!framed) resetCamera();
    renderer.setAnimationLoop(frame);
    host.dataset.running = 'true';
  };
  canvas.addEventListener('webglcontextlost',event => {
    event.preventDefault(); pause();
    status.hidden = false; status.textContent = 'El navegador suspendió el 3D. Espera a que se recupere o recarga la página.';
  });
  canvas.addEventListener('webglcontextrestored',() => { status.hidden = true; resume(); });
  window.addEventListener('pagehide',() => {
    pause();
    // A bfcache-restored page reuses the same canvas and observers.
  });
  window.addEventListener('pageshow',() => { if (dialog.open) resume(); });
  setView('coupled');
  resetCamera();
  dialog.querySelectorAll('.hose-controls button').forEach(button => { button.disabled = false; });
  status.hidden = true;
  host.setAttribute('aria-busy','false');
  host.dataset.ready = 'true';
  return {resume,pause};
}
