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
function addMeshToList(mesh) {
  const list = document.getElementById('objects-list');
  const placeholder = list.querySelector('.muted');
  if (placeholder) placeholder.remove();

  // create a unique ID for this mesh
  const id = `obj-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // main list item
  const item = document.createElement('div');
  item.className = 'object-item';
  item.id = id;

  // info section (name/title)
  const info = document.createElement('div');
  info.className = 'object-info';

  const title = document.createElement('div');
  title.className = 'object-title';
  title.textContent = mesh.name || `Object ${meshes.length + 1}`;
  info.appendChild(title);

  item.appendChild(info);
  list.appendChild(item);

  // initially hidden until selected
  mesh.visible = false;

  // when item is clicked, select this mesh
  item.addEventListener('click', () => {
    selectMesh(id);
  });

  // store mesh reference
  meshes.push({ id, mesh });

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
  const obj = meshes.find(m => m.id === selectedMeshId);
  if(!obj || !obj.mesh || !obj.mesh.material) return;

  const bbox = new THREE.Box3().setFromObject(obj.mesh);
  const center = bbox.getCenter(new THREE.Vector3());

  const planes = [];

  if(clipping.x.enabled){
    planes.push(new THREE.Plane(new THREE.Vector3(-1,0,0), clipping.x.plane.constant - center.x));
  }
  if(clipping.y.enabled){
    planes.push(new THREE.Plane(new THREE.Vector3(0,-1,0), clipping.y.plane.constant - center.y));
  }
  if(clipping.z.enabled){
    planes.push(new THREE.Plane(new THREE.Vector3(0,0,-1), clipping.z.plane.constant - center.z));
  }

  obj.mesh.material.clippingPlanes = planes;
  obj.mesh.material.needsUpdate = true;
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
    o.mesh.visible = (o.id === id) ? true : false;
    const dom = document.getElementById(o.id);
    if(dom) dom.classList.toggle('selected', o.id === id);
  });
  selectedMeshId = id;
  updateClippingPlanes();

  // update static UI to match current mesh
  const obj = meshes.find(m => m.id === id);
  if (obj) {
    const visImg = document.querySelector('#vis-btn img');
    visImg.src = obj.mesh.visible ? './icons/show-icon.svg' : './icons/hide-icon.svg';
    document.getElementById('opacity-slider').value = obj.mesh.material.opacity || 1;
  }
}


// static controls
const visBtn = document.getElementById('vis-btn');
const fullBtn = document.getElementById('full-btn');
const halfBtn = document.getElementById('half-btn');
const transBtn = document.getElementById('trans-btn');
const opacitySlider = document.getElementById('opacity-slider');

visBtn.addEventListener('click', () => {
  if (!selectedMeshId) return;
  const obj = meshes.find(m => m.id === selectedMeshId);
  if (!obj) return;
  obj.mesh.visible = !obj.mesh.visible;
  const img = visBtn.querySelector('img');
  img.src = obj.mesh.visible ? './icons/show-icon.svg' : './icons/hide-icon.svg';
});

fullBtn.addEventListener('click', () => setOpacityForSelected(1));
halfBtn.addEventListener('click', () => setOpacityForSelected(0.5));
transBtn.addEventListener('click', () => setOpacityForSelected(0.15));

opacitySlider.addEventListener('input', (e) => {
  setOpacityForSelected(parseFloat(e.target.value));
});

function setOpacityForSelected(value){
  if (!selectedMeshId) return;
  const obj = meshes.find(m => m.id === selectedMeshId);
  if (!obj) return;
  obj.mesh.material.opacity = value;
  opacitySlider.value = value;
}




/* Optional initial model load (uncomment & adjust path) */
loadLocalSTL('./assets/models/Dragon 2.5_stl.stl', 'Dragon 2.5');
loadLocalSTL('./assets/models/car.stl', 'car');