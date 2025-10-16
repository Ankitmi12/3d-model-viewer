let scene, camera, renderer, controls;
let selectedMeshId = null; 
let raycaster, mouse;
let meshes = []; // { id, mesh }
let clipping = {
  x: { enabled: false, plane: new THREE.Plane(new THREE.Vector3(-1,0,0), 0) },
  y: { enabled: false, plane: new THREE.Plane(new THREE.Vector3(0,-1,0), 0) },
  z: { enabled: false, plane: new THREE.Plane(new THREE.Vector3(0,0,-1), 0) }
};

init();
animate();

/* ---------------- init ---------------- */
function init(){
  // Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  camera.position.set(0, 0, 250);

  // Renderer
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.localClippingEnabled = true;

  // initial size
  onWindowResize();

  // Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(100, 100, 150);
  scene.add(ambient, dir);

  // Raycaster & mouse
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  window.addEventListener('mousemove', onMouseMove);

  // UI hooks
  document.getElementById('reset-btn').addEventListener('click', resetView);
  // document.getElementById('collapse-btn').addEventListener('click', togglePanel);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('file-input').addEventListener('change', handleFileUpload);

  // clipping controls
  ['x','y','z'].forEach(axis => {
    const checkbox = document.getElementById(`slice-${axis}`);
    const range = document.getElementById(`slice-${axis}-pos`);
    if (checkbox) checkbox.addEventListener('change', (e)=> { clipping[axis].enabled = e.target.checked; updateClippingPlanes(); });
    if (range) range.addEventListener('input', (e)=> { clipping[axis].plane.constant = parseFloat(e.target.value); updateClippingPlanes(); });
  });

  // resize
  window.addEventListener('resize', onWindowResize);
}

/* ---------------- handle uploads ---------------- */
function handleFileUpload(e){
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(ev){
    const arrayBuffer = ev.target.result;
    const loader = new THREE.STLLoader();
    const geometry = loader.parse(arrayBuffer);

    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      color: 0xc8cfd6,
      shininess: 60,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      clippingPlanes: getActiveClippingPlanes()
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = file.name.replace('.stl','') || `Object ${meshes.length+1}`;
    scene.add(mesh);

    const id = addMeshToList(mesh);
    meshes.push({ id, mesh });

    fitCameraToObjects();
  };
  reader.readAsArrayBuffer(file);

  // reset input so same file can be uploaded again if needed
  e.target.value = '';
}

/* ---------------- object list UI ---------------- */
function addMeshToList(mesh){
  const list = document.getElementById('objects-list');
  const placeholder = list.querySelector('.muted');
  if (placeholder) placeholder.remove();

  const id = `obj-${Date.now()}-${Math.floor(Math.random()*1000)}`;

  const item = document.createElement('div');
  item.className = 'object-item';
  item.id = id;

  const info = document.createElement('div'); 
  info.className = 'object-info';
  const title = document.createElement('div'); 
  title.className = 'object-title'; 
  title.textContent = mesh.name;
  info.appendChild(title);

  const ctrl = document.createElement('div'); 
  ctrl.className = 'object-controls';

  // initially hidden
  mesh.visible = false;

  // when item clicked, select this mesh
  item.addEventListener('click', ()=>{ selectMesh(id); });

  // visibility toggle button
  const visBtn = document.createElement('button'); visBtn.className = 'icon-btn';
  const visImg = document.createElement('img'); visImg.className = 'icon-img';
  visImg.src = './icons/show-icon.svg';
  visBtn.appendChild(visImg);
  visBtn.title = 'Toggle visibility';
  visBtn.addEventListener('click', ()=>{
    mesh.userData.visible = !mesh.userData.visible;
    if(selectedMeshId === id){
      mesh.visible = !mesh.visible;
      visImg.src = mesh.visible ? './icons/show-icon.svg' : './icons/hide-icon.svg';
    }
  });

  // preset opacity buttons
  const fullBtn = document.createElement('button'); fullBtn.className = 'icon-btn';
  const fullImg = document.createElement('img'); fullImg.className = 'icon-img'; fullImg.src = './icons/full-visibal.svg';
  fullBtn.appendChild(fullImg);
  fullBtn.title = 'Opaque';
  fullBtn.addEventListener('click', ()=> { if(selectedMeshId===id){ mesh.material.opacity = 1; if(slider) slider.value=1; } });

  const halfBtn = document.createElement('button'); halfBtn.className = 'icon-btn';
  const halfImg = document.createElement('img'); halfImg.className = 'icon-img'; halfImg.src = './icons/half-transparent.svg';
  halfBtn.appendChild(halfImg);
  halfBtn.title = '50%';
  halfBtn.addEventListener('click', ()=> { if(selectedMeshId===id){ mesh.material.opacity = 0.5; if(slider) slider.value=0.5; } });

  const transBtn = document.createElement('button'); transBtn.className = 'icon-btn';
  const transImg = document.createElement('img'); transImg.className = 'icon-img'; transImg.src = './icons/full-transparent.svg';
  transBtn.appendChild(transImg);
  transBtn.title = 'Mostly transparent';
  transBtn.addEventListener('click', ()=> { if(selectedMeshId===id){ mesh.material.opacity = 0.15; if(slider) slider.value=0.15; } });

  // transparency slider
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = 0.1; slider.max = 1; slider.step = 0.05; slider.value = mesh.material.opacity || 1;
  slider.className = 'transparency';
  slider.addEventListener('input', ()=>{ if(selectedMeshId===id) mesh.material.opacity = parseFloat(slider.value); });

  ctrl.appendChild(visBtn);
  ctrl.appendChild(fullBtn);
  ctrl.appendChild(halfBtn);
  ctrl.appendChild(transBtn);
  ctrl.appendChild(slider);

  item.appendChild(info);
  item.appendChild(ctrl);
  list.appendChild(item);

  meshes.push({ id, mesh, slider });
  return id;
}


/* ---------------- clipping ---------------- */
function getActiveClippingPlanes(){
  const arr = [];
  if (clipping.x.enabled) arr.push(clipping.x.plane);
  if (clipping.y.enabled) arr.push(clipping.y.plane);
  if (clipping.z.enabled) arr.push(clipping.z.plane);
  return arr;
}
function updateClippingPlanes(){
  const active = getActiveClippingPlanes();
  const obj = meshes.find(m=>m.id===selectedMeshId);
  if(obj && obj.mesh && obj.mesh.material){
    obj.mesh.material.clippingPlanes = active;
    obj.mesh.material.needsUpdate = true;
  }
}


/* ---------------- tooltip ---------------- */
function onMouseMove(event){
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  mouse.x = (x / rect.width) * 2 - 1;
  mouse.y = - (y / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const pickables = meshes.map(m=>m.mesh).filter(Boolean);
  const intersects = raycaster.intersectObjects(pickables, true);

  const tooltip = document.getElementById('tooltip');
  if (intersects.length > 0){
    const obj = intersects[0].object;
    tooltip.classList.remove('hidden');
    tooltip.textContent = obj.name || obj.parent?.name || 'Unnamed';
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 8}px`;
  } else {
    tooltip.classList.add('hidden');
  }
}

/* ---------------- reset / fit ---------------- */
function resetView(){
  controls.reset();
  fitCameraToObjects();
}

function fitCameraToObjects(margin = 1.4){
  if (meshes.length === 0) {
    camera.position.set(0,0,250);
    controls.target.set(0,0,0);
    controls.update();
    return;
  }
  const bbox = new THREE.Box3();
  meshes.forEach(o => bbox.union(new THREE.Box3().setFromObject(o.mesh)));
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI/180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * margin;
  cameraZ = Math.max(cameraZ, 50);
  camera.position.set(center.x, center.y, center.z + cameraZ);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

/* ---------------- panel toggle & theme ---------------- */
function togglePanel(){
  const panel = document.getElementById('control-panel');
  panel.classList.toggle('collapsed');
  // update renderer size after transition
  setTimeout(onWindowResize, 260);
}

function toggleTheme(){
  document.body.classList.toggle('theme-dark');
  if (document.body.classList.contains('theme-dark')) renderer.setClearColor(0x05060a);
  else renderer.setClearColor(0xf0f2f5);
}

/* ---------------- resize ---------------- */
function onWindowResize(){
  const panel = document.getElementById('control-panel');
  const collapsed = panel.classList.contains('collapsed');
  // if screen narrow, panel may be absolutely positioned - use 0 width
  const panelWidth = (collapsed || window.innerWidth < 900) ? 0 : panel.offsetWidth;
  const width = window.innerWidth - panelWidth;
  const height = window.innerHeight - document.getElementById('topbar').offsetHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  // reposition renderer canvas container so topbar space is respected (canvas is full height in CSS)
  // (no additional DOM change required)
}

/* ---------------- animate ---------------- */
function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/* ---------------- optional helper: loadLocalSTL ---------------- */
function loadLocalSTL(path, name){
  const loader = new THREE.STLLoader();
  loader.load(path, (geometry) => {
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhongMaterial({
      color: 0xd1d7df, shininess: 60, transparent: true, opacity: 1, side: THREE.DoubleSide,
      clippingPlanes: getActiveClippingPlanes()
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name || path.split('/').pop();
    scene.add(mesh);
    const id = addMeshToList(mesh);
    meshes.push({ id, mesh });
    fitCameraToObjects();
  });
}

function selectMesh(id){
  meshes.forEach(o => {
    o.mesh.visible = (o.id === id) ? o.mesh.userData.visible : false;
    if(o.slider) o.slider.value = o.mesh.material.opacity;
    const dom = document.getElementById(o.id);
    if(dom) dom.classList.toggle('selected', o.id === id);
  });
  selectedMeshId = id;
  updateClippingPlanes(); // apply clipping only to selected
}



/* Optional initial model load (uncomment & adjust path) */
loadLocalSTL('./assets/models/Dragon 2.5_stl.stl', 'Dragon 2.5');
loadLocalSTL('./assets/models/car.stl', 'car');