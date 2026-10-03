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
  renderer.toneMappingExposure = 1.0;
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
    const loading = new GLTFLoader().loadAsync(new URL('../assets/models/acoples/linea-acoplada.glb?v=20260930b',import.meta.url).href);
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
    if (!object.isMesh) return;
    object.material = object.material.clone();
    originalMaterials.set(object,{color:object.material.color.clone(),emissive:object.material.emissive.clone()});
  }));
  // Only the swivel, its thread and its lugs turn; the hose and female body stay fixed.
  const swivel = new THREE.Group();
  female.add(swivel);
  [...female.children].filter(object => object !== swivel &&
    /Collar|Rosca_interior|Saliente/.test(object.name)).forEach(object => swivel.add(object));
  const explanation = dialog.querySelector('#hose-explanation');
  const label = dialog.querySelector('#hose-label');
  const gestureText = dialog.querySelector('#hose-gesture');
  const viewButtons = [...dialog.querySelectorAll('[data-hose-view]')];
  const partButtons = [...dialog.querySelectorAll('[data-hose-part]')];
  const modeButtons = [...dialog.querySelectorAll('[data-hose-mode]')];
  const rotateButton = dialog.querySelector('#hose-rotate');
  const slider = dialog.querySelector('#hose-thread');
  const threadValue = dialog.querySelector('#hose-thread-value');
  const challengeButton = dialog.querySelector('#hose-challenge');
  const question = dialog.querySelector('#hose-question');
  const answers = dialog.querySelector('#hose-answers');
  const feedback = dialog.querySelector('#hose-feedback');
  const answerButtons = [...dialog.querySelectorAll('[data-hose-answer]')];
  const explore = dialog.querySelector('#hose-explore');
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const touches = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let selected = '';
  let mode = 'orbit';
  let progress = 0;
  let separationAnimation;
  let phase = 'idle';
  let destination;
  let spinElapsed = 0;
  let spinAngle = 0;
  let twisting;
  let running = false;
  let framed = false;
  const updateGestureText = () => {
    gestureText.textContent = phase === 'question'
      ? 'Escoge un acople o su tramo en el 3D, o usa los botones de respuesta.'
      : mode === 'thread'
        ? 'Ratón: arrastra una pieza hacia arriba para desenroscar; abajo para acoplar. Táctil: sostén una pieza y mueve el segundo dedo sobre la otra en círculo antihorario para separar, horario para unir. También puedes usar la barra.'
        : 'Toca una pieza para identificarla. Arrastra para girar; rueda o pellizca para acercar. Flechas del teclado: rotar.';
  };
  const resize = () => {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    const previousFit = 1/Math.min(1,camera.aspect);
    camera.aspect = width/height;
    camera.fov = 38/Math.min(1.5,Math.max(1,camera.aspect));
    if (framed) camera.position.sub(controls.target).multiplyScalar((1/Math.min(1,camera.aspect))/previousFit).add(controls.target);
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  };
  const resetCamera = () => {
    if (!host.clientWidth || !host.clientHeight) return;
    resize();
    const distance = (0.32 + progress*0.17) / Math.min(1,camera.aspect);
    controls.target.set(progress*0.04,0,0);
    camera.position.set(controls.target.x + distance*0.1,distance*0.26,distance);
    controls.update();
    framed = true;
  };
  const selectPart = (part,object = null) => {
    selected = part;
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
    const defaultText = selected === 'male'
      ? 'Macho resaltado en azul: rosca exterior y salientes longitudinales más largos en este modelo. Usa la vista separada para ver la rosca.'
      : selected === 'female'
        ? 'Hembra resaltada en ámbar: rosca interior y collar giratorio con salientes más cortos en este modelo.'
        : 'Selecciona una pieza para resaltarla y conocer sus características.';
    let name = selected === 'male' ? 'Acople macho' : 'Acople hembra';
    let detail = defaultText;
    if (object?.name.includes('Manguera')) { name = 'Manguera'; detail = 'Tramo de manguera unido al cuerpo del acople seleccionado.'; }
    else if (object?.name.includes('Rosca')) { name = selected === 'male' ? 'Rosca exterior · macho' : 'Rosca interior · hembra'; detail = 'Las roscas exterior e interior se unen al girar el collar de la hembra.'; }
    else if (object?.name.includes('Saliente')) { name = 'Salientes de agarre · ' + (selected === 'male' ? 'macho' : 'hembra'); }
    else if (object?.name.includes('Collar')) { name = 'Collar giratorio · hembra'; detail = 'Gira de forma independiente del cuerpo y la manguera para unir o separar los acoples.'; }
    else if (object?.name.includes('Junta')) { name = 'Junta de goma · hembra'; detail = 'La junta interior permite sellar la unión entre ambos acoples.'; }
    explanation.textContent = detail;
    label.textContent = name;
    label.hidden = !selected;
    host.dataset.selected = selected;
  };
  const applySeparation = value => {
    const previousProgress = progress;
    const offset = camera.position.clone().sub(controls.target);
    progress = THREE.MathUtils.clamp(value,0,1);
    // Follow the centre and widen the framing as the two pieces move apart.
    controls.target.x += (progress-previousProgress)*0.04;
    camera.position.copy(controls.target).add(offset.multiplyScalar((0.32+progress*0.17)/(0.32+previousProgress*0.17)));
    male.position.copy(origins[0]);
    female.position.copy(origins[1]);
    // Four thread turns, then enough clearance to inspect the two openings.
    const turns = Math.min(progress/0.7,1)*4;
    female.position.x += turns*0.0046 + Math.max(0,(progress-0.7)/0.3)*0.0616;
    swivel.rotation.y = -turns*Math.PI*2;
    slider.value = String(Math.round(progress*100));
    threadValue.textContent = `${Math.round(progress*100)}%`;
    host.dataset.separation = String(Math.round(progress*100));
    host.dataset.view = progress < 0.001 ? 'coupled' : progress > 0.999 ? 'separated' : 'partial';
    viewButtons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.hoseView === host.dataset.view)));
  };
  const stopRotation = () => {
    controls.autoRotate = false;
    rotateButton.setAttribute('aria-pressed','false');
  };
  const setMode = next => {
    touches.clear(); twisting = null;
    if (mode !== next) {
      if (next === 'thread') controls.disconnect();
      else controls.connect(canvas);
    }
    mode = next;
    controls.enabled = mode === 'orbit' && phase !== 'spinning';
    if (mode === 'thread') stopRotation();
    modeButtons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.hoseMode === mode)));
    host.dataset.mode = mode;
    updateGestureText();
  };
  const setView = next => {
    stopRotation();
    separationAnimation = {from:progress,to:next === 'separated' ? 1 : 0,elapsed:0};
    if (reducedMotion.matches) { applySeparation(separationAnimation.to); separationAnimation = null; }
  };
  const setPhase = next => {
    phase = next;
    host.dataset.phase = phase;
    const testing = phase === 'spinning' || phase === 'question';
    explore.hidden = testing;
    answers.hidden = phase !== 'question' && phase !== 'answered';
    answerButtons.forEach(button => { button.disabled = phase !== 'question'; });
    challengeButton.disabled = phase === 'spinning';
    challengeButton.textContent = phase === 'spinning' ? 'Girando…' : phase === 'idle' ? 'Iniciar ejercicio' : 'Nuevo ejercicio';
    controls.enabled = phase !== 'spinning' && mode === 'orbit';
    updateGestureText();
  };
  const answer = part => {
    if (phase !== 'question') return;
    const expected = destination === 'unit' ? 'male' : 'female';
    const correct = part === expected;
    feedback.hidden = false;
    feedback.dataset.correct = String(correct);
    feedback.textContent = `${correct ? 'Correcto.' : 'Revisa la dirección.'} En esta unión intermedia, la manguera detrás del cuerpo macho continúa hacia la unidad; la manguera detrás del cuerpo hembra continúa hacia el pitón. ${destination === 'unit' ? 'Para volver a la unidad, elige el lado del macho.' : 'Para avanzar al pitón, elige el lado de la hembra.'}`;
    setPhase('answered');
    selectPart(expected);
    label.textContent = destination === 'unit' ? 'Macho → unidad' : 'Hembra → pitón';
    feedback.focus({preventScroll:true});
  };
  feedback.tabIndex = -1;
  challengeButton.addEventListener('click',() => {
    stopRotation();
    setMode('orbit');
    separationAnimation = null;
    applySeparation(0);
    selectPart('');
    resetCamera();
    destination = Math.random() < 0.5 ? 'unit' : 'nozzle';
    spinElapsed = 0;
    spinAngle = Math.random()*Math.PI*2;
    feedback.hidden = true;
    question.textContent = 'Observa la unión: se está cambiando su orientación…';
    dialog.querySelector('.hose-note').open = false;
    setPhase('spinning');
    host.scrollIntoView({block:'nearest',behavior:'instant'});
  });
  answerButtons.forEach(button => button.addEventListener('click',() => answer(button.dataset.hoseAnswer)));
  viewButtons.forEach(button => button.addEventListener('click',() => setView(button.dataset.hoseView)));
  partButtons.forEach(button => button.addEventListener('click',() => selectPart(selected === button.dataset.hosePart ? '' : button.dataset.hosePart)));
  modeButtons.forEach(button => button.addEventListener('click',() => setMode(button.dataset.hoseMode)));
  slider.addEventListener('input',() => {
    separationAnimation = null; stopRotation();
    applySeparation(Number(slider.value)/100);
  });
  rotateButton.addEventListener('click',() => {
    if (mode !== 'orbit') setMode('orbit');
    controls.autoRotate = !controls.autoRotate;
    rotateButton.setAttribute('aria-pressed',String(controls.autoRotate));
  });
  dialog.querySelector('#hose-reset').addEventListener('click',() => {
    stopRotation();
    setMode('orbit');
    separationAnimation = null;
    applySeparation(0);
    setPhase('idle');
    feedback.hidden = true;
    question.textContent = 'La unión girará durante 4 segundos. Después, elige el lado que te llevaría al destino indicado.';
    selectPart('');
    resetCamera();
  });
  const pick = (x,y) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer,camera);
    const hit = raycaster.intersectObjects([male,female],true)[0];
    if (!hit) return null;
    let root = hit.object;
    while (root && root !== male && root !== female) root = root.parent;
    return {part:root === male ? 'male' : 'female',object:hit.object};
  };
  const releaseTouches = () => {
    touches.forEach((_,id) => { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); });
    touches.clear(); twisting = null;
  };
  canvas.addEventListener('pointerdown',event => {
    if (phase === 'spinning') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const hit = pick(event.clientX,event.clientY);
    touches.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,hit,moved:false});
    if (touches.size > 1) touches.forEach(touch => { touch.moved = true; });
    if (mode !== 'thread') return;
    event.preventDefault(); event.stopImmediatePropagation();
    canvas.setPointerCapture(event.pointerId);
    separationAnimation = null;
    if (event.pointerType === 'mouse' && hit) {
      twisting = {mouse:event.pointerId};
      selectPart(hit.part,hit.object);
    } else if (touches.size === 2) {
      const [first,second] = [...touches.entries()];
      if (first[1].hit && second[1].hit && first[1].hit.part !== second[1].hit.part) {
        twisting = {anchor:first[0],moving:second[0]};
        selectPart(second[1].hit.part,second[1].hit.object);
      }
    }
  },{capture:true});
  canvas.addEventListener('pointermove',event => {
    const touch = touches.get(event.pointerId);
    if (!touch) return;
    const previousX = touch.x, previousY = touch.y;
    touch.x = event.clientX; touch.y = event.clientY;
    if (Math.hypot(touch.x-touch.startX,touch.y-touch.startY) > 6) touch.moved = true;
    if (mode !== 'thread') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (twisting?.mouse === event.pointerId) applySeparation(progress + (previousY-touch.y)/240);
    else if (twisting?.moving === event.pointerId) {
      const anchor = touches.get(twisting.anchor);
      if (!anchor) return;
      const oldAngle = Math.atan2(previousY-anchor.y,previousX-anchor.x);
      const newAngle = Math.atan2(touch.y-anchor.y,touch.x-anchor.x);
      const delta = Math.atan2(Math.sin(oldAngle-newAngle),Math.cos(oldAngle-newAngle));
      applySeparation(progress + delta/(Math.PI*2));
    }
  },{capture:true});
  const endPointer = event => {
    const touch = touches.get(event.pointerId);
    if (touch && event.type !== 'pointercancel' && !touch.moved && !twisting) {
      const hit = pick(event.clientX,event.clientY);
      if (hit) { if (phase === 'question') answer(hit.part); else selectPart(hit.part,hit.object); }
    }
    touches.delete(event.pointerId);
    if (twisting && [twisting.mouse,twisting.anchor,twisting.moving].includes(event.pointerId)) twisting = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup',endPointer,{capture:true});
  canvas.addEventListener('pointercancel',endPointer,{capture:true});
  canvas.addEventListener('lostpointercapture',event => { touches.delete(event.pointerId); twisting = null; });
  canvas.addEventListener('keydown',event => {
    if (phase === 'spinning') return;
    if (mode === 'thread' && ['ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); separationAnimation = null;
      applySeparation(progress + (event.key === 'ArrowUp' ? 0.05 : -0.05));
      return;
    }
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
    // Keep the studio dark even in light mode: ivory hose and aluminium need contrast.
    scene.background = new THREE.Color(0x111923);
  };
  const themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  updateTheme();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  let previousTime;
  const frame = time => {
    const elapsed = previousTime === undefined ? 0 : (time-previousTime)/1000;
    const delta = Math.min(elapsed,0.05);
    previousTime = time;
    if (separationAnimation) {
      separationAnimation.elapsed += elapsed;
      const t = Math.min(separationAnimation.elapsed/1.4,1);
      applySeparation(THREE.MathUtils.lerp(separationAnimation.from,separationAnimation.to,t*t*(3-2*t)));
      if (t === 1) separationAnimation = null;
    }
    if (phase === 'spinning') {
      spinElapsed += elapsed;
      const angle = spinAngle + spinElapsed*1.8;
      const distance = 0.34 / Math.min(1,camera.aspect);
      if (!reducedMotion.matches) camera.position.set(Math.sin(angle)*distance,distance*0.25,Math.cos(angle)*distance);
      camera.lookAt(controls.target);
      if (spinElapsed >= 4) {
        // Stop at a readable, unpredictable left/right orientation, without labels.
        camera.position.set(Math.sin(angle)*distance*0.35,distance*0.25,distance*(Math.random()<0.5 ? -1 : 1));
        camera.lookAt(controls.target);
        question.textContent = destination === 'unit'
          ? 'Necesitas volver a la unidad. ¿Qué tramo seguirías desde esta unión?'
          : 'Necesitas avanzar hacia el pitón para atacar. ¿Qué tramo seguirías desde esta unión?';
        label.textContent = question.textContent;
        label.hidden = false;
        setPhase('question');
      }
    }
    controls.update(delta);
    renderer.render(scene,camera);
  };
  const pause = () => {
    running = false; renderer.setAnimationLoop(null); previousTime = undefined; host.dataset.running = 'false';
    releaseTouches();
    if (phase === 'spinning') {
      setPhase('idle');
      question.textContent = 'El giro se interrumpió. Inicia de nuevo el ejercicio cuando quieras.';
    }
  };
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
  applySeparation(0);
  resetCamera();
  dialog.querySelectorAll('.hose-controls button').forEach(button => { button.disabled = false; });
  slider.disabled = false;
  setPhase('idle');
  setMode('orbit');
  status.hidden = true;
  host.setAttribute('aria-busy','false');
  host.dataset.ready = 'true';
  return {resume,pause};
}
