// 
// 3D Medical Viewer Core Script
// Built using Three.js — Handles scene setup, model loading, slicing, and UI.
// 


let scene, camera, renderer, controls;
let selectedMeshId = null;
let raycaster, mouse;

// Array to hold all meshes loaded into the scene
// Each entry: { id: string, mesh: THREE.Mesh }
let meshes = [];

// Object managing slicing planes (for X, Y, Z axes)
let clipping = {
  x: { enabled: false, plane: new THREE.Plane(new THREE.Vector3(-1,0,0), 0) },
  y: { enabled: false, plane: new THREE.Plane(new THREE.Vector3(0,-1,0), 0) },
  z: { enabled: false, plane: new THREE.Plane(new THREE.Vector3(0,0,-1), 0) }
};

// Initialize and start render
init();
animate();

/* 
 *  Initializes the entire 3D environment, UI bindings, and event listeners.
 * 
 *   - Creates scene, camera, renderer, and controls
 *   - Adds lighting and mouse interaction
 *   - Connects UI controls for slicing, theme, and file upload
 *   - Sets initial render size and window resize listener
 * */
function init() {
  // ----- Scene and Camera -----
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  camera.position.set(0, 0, 250);

  // ----- Renderer -----
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.localClippingEnabled = true;

  // Initialize renderer size
  resizeModels();

  // ----- Orbit Controls -----
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // smoother rotation and zoom

  // ----- Lighting -----
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(100, 100, 150);
  scene.add(ambient, dir);

  // ----- Mouse Interaction usinf Raycaster -----
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  window.addEventListener('mousemove', onMouseMove);

  // ----- UI Buttons -----
  document.getElementById('reset-btn').addEventListener('click', resetView);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('file-input').addEventListener('change', handleFileUpload);

  // ----- Clipping Controls -----
  ['x','y','z'].forEach(axis => {
    const checkbox = document.getElementById(`slice-${axis}`);
    const range = document.getElementById(`slice-${axis}-pos`);
    if (checkbox) {
      checkbox.addEventListener('change', (e)=> {
        clipping[axis].enabled = e.target.checked;
        updateClippingPlanes();
      });
    }
    if (range) {
      range.addEventListener('input', (e)=> {
        clipping[axis].plane.constant = parseFloat(e.target.value);
        updateClippingPlanes();
      });
    }
  });

  // ----- Window Resize -----
  window.addEventListener('resize', resizeModels);
}

/* 
 *  Loads and parses an STL file uploaded by the user.
 *   - Uses FileReader to read the file
 *   - Parses STL file using THREE.STLLoader
 *   - Creates a MeshPhongMaterial with basic lighting and transparency
 *   - Adds the mesh to the scene and UI
 * */
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(ev) {
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
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = file.name.replace('.stl','') || `Object ${meshes.length+1}`;
    scene.add(mesh);

    const id = addMeshToList(mesh);
    selectMesh(id); // Automatically make visible and active

    // ----- Set slicing slider limits -----
    const bbox = new THREE.Box3().setFromObject(mesh);
    const min = bbox.min;
    const max = bbox.max;

    ['x','y','z'].forEach(axis => {
      const rangeEl = document.getElementById(`slice-${axis}-pos`);
      if (!rangeEl) return;
      rangeEl.min = min[axis];
      rangeEl.max = max[axis];
      rangeEl.value = (max[axis] + min[axis]) / 2 + (max[axis] - min[axis]) * 0.25;

      // Create new clipping plane for this axis
      clipping[axis].plane = new THREE.Plane(
        axis === 'x' ? new THREE.Vector3(-1,0,0)
        : axis === 'y' ? new THREE.Vector3(0,-1,0)
        : new THREE.Vector3(0,0,-1),
        0
      );
    });

    cameraPosition();
  };
  reader.readAsArrayBuffer(file);

  // Reset file input so same file can be uploaded again if needed
  e.target.value = '';
}

/* 
 *   Adds a new mesh entry to the sidebar models list.
 *   - Creates a element for the models in the sidebar
 *   - Binds click event to allow selection of that models
 * */
function addMeshToList(mesh) {
  const list = document.getElementById('objects-list');
  const placeholder = list.querySelector('.muted');
  if (placeholder) placeholder.remove();

  const id = `obj-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // ----- Create UI item -----
  const item = document.createElement('div');
  item.className = 'object-item';
  item.id = id;

  const info = document.createElement('div');
  info.className = 'object-info';
  const title = document.createElement('div');
  title.className = 'object-title';
  title.textContent = mesh.name || `Object ${meshes.length + 1}`;
  info.appendChild(title);
  item.appendChild(info);
  list.appendChild(item);

  mesh.visible = false; // mesh stays hidden until selected

  // ----- On click: select this mesh -----
  item.addEventListener('click', () => selectMesh(id));

  meshes.push({ id, mesh });
  return id;
}

/* 
 * Updates slicing plane positions and applies them to materials.
 *   - Determines target meshes (selected or all)
 *   - Builds active planes for enabled axes (X/Y/Z)
 *   - Updates clipping planes for each mesh’s material
 * */
function updateClippingPlanes() {
  const targets = [];

  if (selectedMeshId) {
    const obj = meshes.find(m => m.id === selectedMeshId);
    if (obj) targets.push(obj);
  } else {
    targets.push(...meshes);
  }

  if (targets.length === 0) return;

  targets.forEach(({ mesh }) => {
    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = bbox.getCenter(new THREE.Vector3());
    const planes = [];

    if (clipping.x.enabled) {
      const val = parseFloat(document.getElementById('slice-x-pos').value);
      const normal = new THREE.Vector3(-1,0,0);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal, new THREE.Vector3(val, center.y, center.z)
      );
      planes.push(plane);
      clipping.x.plane = plane;
    }

    if (clipping.y.enabled) {
      const val = parseFloat(document.getElementById('slice-y-pos').value);
      const normal = new THREE.Vector3(0,-1,0);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal, new THREE.Vector3(center.x, val, center.z)
      );
      planes.push(plane);
      clipping.y.plane = plane;
    }

    if (clipping.z.enabled) {
      const val = parseFloat(document.getElementById('slice-z-pos').value);
      const normal = new THREE.Vector3(0,0,-1);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal, new THREE.Vector3(center.x, center.y, val)
      );
      planes.push(plane);
      clipping.z.plane = plane;
    }

    // Apply updated clipping planes to materials
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(mat => { mat.clippingPlanes = planes; mat.needsUpdate = true; });
    } else if (mesh.material) {
      mesh.material.clippingPlanes = planes;
      mesh.material.needsUpdate = true;
    }
  });
}

/* 
 *  Returns an array of currently active clipping .
 * */ 
function activeCliping() {
  const arr = [];
  if (clipping.x.enabled) arr.push(clipping.x.plane);
  if (clipping.y.enabled) arr.push(clipping.y.plane);
  if (clipping.z.enabled) arr.push(clipping.z.plane);
  return arr;
}

/* 
 *  Displays tooltip showing the name of the mesh under the cursor.
 *  Details :
 *   - Uses raycasting to detect intersected objects
 *   - Positions tooltip near cursor
 * */
function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  mouse.x = (x / rect.width) * 2 - 1;
  mouse.y = - (y / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const pickables = meshes.map(m => m.mesh).filter(Boolean);
  const intersects = raycaster.intersectObjects(pickables, true);

  const tooltip = document.getElementById('tooltip');
  if (intersects.length > 0) {
    const obj = intersects[0].object;
    tooltip.classList.remove('hidden');
    tooltip.textContent = obj.name || obj.parent?.name || 'Unnamed';
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 8}px`;
  } else {
    tooltip.classList.add('hidden');
  }
}

/* 
 *  Resets camera controls and fits view to current objects.
 * */
function resetView() {
  controls.reset();
  cameraPosition();
}

/* 
 *  Repositions and zooms camera so all loaded meshes fit the screen.
 *     margin (float): Optional multiplier to add space around objects.
 * */
function cameraPosition(margin = 1.4) {
  if (meshes.length === 0) {
    camera.position.set(0, 0, 250);
    controls.target.set(0, 0, 0);
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


// function togglePanel() {
//   const panel = document.getElementById('control-panel');
//   panel.classList.toggle('collapsed');
//   setTimeout(resizeModels, 260); 
// }

/* 
 *  Switches between light and dark themes and adjusts background color.
 * */
function toggleTheme() {
  document.body.classList.toggle('theme-dark');
  if (document.body.classList.contains('theme-dark')) renderer.setClearColor(0x05060a);
  else renderer.setClearColor(0xf0f2f5);
}

/* 
 *  Adjusts renderer and camera aspect ratio on models resize.
 * */
function resizeModels() {
  const panel = document.getElementById('control-panel');
  const collapsed = panel.classList.contains('collapsed');
  const panelWidth = (collapsed || window.innerWidth < 900) ? 0 : panel.offsetWidth;
  const width = window.innerWidth - panelWidth;
  const height = window.innerHeight - document.getElementById('topbar').offsetHeight;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/* 
 *  Main render loop; updates controls and re-renders the scene.
 * */
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/* 
 *  Loads STL files from ./assets/models folder.
 *  Used for initializing default models at startup.
 * */
function loadLocalSTL(path, name) {
  const loader = new THREE.STLLoader();
  loader.load(path, (geometry) => {
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhongMaterial({
      color: 0xd1d7df, shininess: 60, transparent: true, opacity: 1,
      side: THREE.DoubleSide, clippingPlanes: activeCliping()
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name || path.split('/').pop();
    scene.add(mesh);
    const id = addMeshToList(mesh);
    meshes.push({ id, mesh });
    cameraPosition();
  });
}

/* 
 *  Sets one mesh as active and hides all others.
 *   - Updates sidebar highlight
 *   - visibility and opacity controls
 *   - Applies clipping 
 * */
function selectMesh(id) {
  meshes.forEach(o => {
    o.mesh.visible = (o.id === id);
    const dom = document.getElementById(o.id);
    if (dom) dom.classList.toggle('selected', o.id === id);
  });
  selectedMeshId = id;
  updateClippingPlanes();

  const obj = meshes.find(m => m.id === id);
  if (obj) {
    const visImg = document.querySelector('#vis-btn img');
    visImg.src = obj.mesh.visible ? './icons/show-icon.svg' : './icons/hide-icon.svg';
    document.getElementById('opacity-slider').value = obj.mesh.material.opacity || 1;
  }
}

//  Static Controls — Visibility and Opacity Buttons
const visBtn = document.getElementById('vis-btn');
const fullBtn = document.getElementById('full-btn');
const halfBtn = document.getElementById('half-btn');
const transBtn = document.getElementById('trans-btn');
const opacitySlider = document.getElementById('opacity-slider');

// Toggle visibility of selected mesh
visBtn.addEventListener('click', () => {
  if (!selectedMeshId) return;
  const obj = meshes.find(m => m.id === selectedMeshId);
  if (!obj) return;
  obj.mesh.visible = !obj.mesh.visible;
  const img = visBtn.querySelector('img');
  img.src = obj.mesh.visible ? './icons/show-icon.svg' : './icons/hide-icon.svg';
});

// opacity 
fullBtn.addEventListener('click', () => dynamicSelectedOpacity(1));
halfBtn.addEventListener('click', () => dynamicSelectedOpacity(0.5));
transBtn.addEventListener('click', () => dynamicSelectedOpacity(0.15));

// opacity control slider
opacitySlider.addEventListener('input', (e) => {
  dynamicSelectedOpacity(parseFloat(e.target.value));
});

/* 
 *  Updates opacity 
 * */
function dynamicSelectedOpacity(value) {
  if (!selectedMeshId) return;
  const obj = meshes.find(m => m.id === selectedMeshId);
  if (!obj) return;
  obj.mesh.material.opacity = value;
  opacitySlider.value = value;
}

//  Load default models at startup
loadLocalSTL('./assets/models/Dragon 2.5_stl.stl', 'Dragon 2.5');
loadLocalSTL('./assets/models/car.stl', 'car');
