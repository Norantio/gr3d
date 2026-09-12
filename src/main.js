import * as THREE from 'three';
import './style.css';

const palette = [
  ['Red', '#e53935'], ['Orange', '#f57c00'], ['Yellow', '#fbc02d'], ['Green', '#43a047'],
  ['Blue', '#1e88e5'], ['Indigo', '#3949ab'], ['Violet', '#8e24aa'], ['Black', '#202124'],
  ['Rose', '#ef9a9a'], ['Peach', '#ffcc80'], ['Pale yellow', '#fff59d'], ['Mint', '#a5d6a7'],
  ['Sky', '#90caf9'], ['Periwinkle', '#9fa8da'], ['Lavender', '#ce93d8'], ['Light gray', '#c7c9cc'],
  ['Brick', '#9a4a3a'], ['Copper', '#b56a2a'], ['Gold', '#d4af37'], ['Grass', '#5b8a3c'],
  ['Water', '#3a6fb0'], ['Deep indigo', '#283593'], ['Purple', '#6a3d8f'], ['Gray', '#777b80'],
  ['Burgundy', '#6d2525'], ['Brown', '#6b4a2b'], ['Olive', '#827717'], ['Forest', '#2e5d34'],
  ['Navy', '#243b75'], ['Midnight', '#1a237e'], ['Plum', '#4a235a'], ['White', '#eef2f5'],
];
const keyOf = (x, y, z) => `${x},${y},${z}`;
const compose = (col, row, layer, axis) => axis === 'Y' ? { x: col, y: layer, z: -row } : axis === 'X' ? { x: layer, y: -row, z: col } : { x: col, y: -row, z: layer };
const decompose = (x, y, z, axis) => axis === 'Y' ? { col: x, row: -z, layer: y } : axis === 'X' ? { col: z, row: -y, layer: x } : { col: x, row: -y, layer: z };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

window.__gr3dDebug = {
  get compose() { return compose; },
  get decompose() { return decompose; },
  get state() { return state; },
};

const state = {
  blocks: new Map(), axis: 'Y', layer: 0, tool: 'paint', color: '#5b8a3c', theme: 'light',
  scale: 28, offsetX: 0, offsetY: 0, gridDirty: true, previewDirty: true, creationId: null, creationName: '', history: [], shape: 'square', shapeWidth: 5, shapeHeight: 5,
  selection: null,
};

const LIBRARY_KEY = 'voxel-foundry-creations';
const CREATIONS_API = `${import.meta.env.BASE_URL}api/creations`;
const library = () => JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
const saveLibrary = (creations) => { localStorage.setItem(LIBRARY_KEY, JSON.stringify(creations)); fetch(CREATIONS_API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creations) }).catch(() => {}); };
async function syncLibrary() { try { const response = await fetch(CREATIONS_API, { cache: 'no-store' }); if (!response.ok) throw new Error('Library unavailable'); const remoteCreations = await response.json(); const localCreations = library(); if (remoteCreations.length === 0 && localCreations.length > 0) { await fetch(CREATIONS_API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(localCreations) }); } else { localStorage.setItem(LIBRARY_KEY, JSON.stringify(remoteCreations)); } renderHome(); } catch { setStatus('Using local library cache'); } }

function seed() {
  state.blocks.set(keyOf(0, 0, 0), '#5b8a3c');
}

function appTemplate() {
  return `
    <section class="home-view" id="homeView">
      <header class="home-topbar"><div class="brand"><span class="brand-mark">VOXEL</span><span class="brand-copy">a quiet place to build in three dimensions</span></div><button class="icon-button" id="homeThemeButton" title="Toggle color theme" aria-label="Toggle color theme">☼</button></header>
      <div class="home-content"><div class="home-heading"><div><h1 class="library-title">CREATIONS</h1></div><div class="home-actions"><button class="primary" id="newCreationButton">+ New creation</button><button id="homeImportButton">Import creation</button><input id="homeFileInput" type="file" accept="application/json" hidden /></div></div><div class="creation-grid" id="creationGrid"></div></div>
    </section>
    <div class="modal-backdrop" id="deleteModal" hidden><div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="deleteTitle"><span class="eyebrow">PERMANENT ACTION</span><h2 id="deleteTitle">Delete this creation?</h2><p>This removes the saved copy from your library. Export it first if you may want it later.</p><div class="modal-actions"><button id="cancelDelete">Keep creation</button><button id="exportDelete">Export first</button><button class="danger-fill" id="confirmDelete">Delete</button></div></div></div>
    <div id="editorView" hidden>
    <header class="topbar">
      <div class="brand"><button class="back-button" id="homeButton">← Library</button><span class="brand-mark">VOXEL</span><button class="editor-title-button" id="editorTitleButton" title="Rename creation"><span id="editorTitle">Untitled creation</span><span class="editor-title-icon">✎</span></button></div>
      <div class="top-actions"><span class="block-count" id="blockCount">64 blocks</span><button type="button" class="icon-button" id="themeButton" title="Toggle color theme" aria-label="Toggle color theme">☼</button><button type="button" class="icon-button delete-icon" id="editorDeleteButton" title="Delete creation" aria-label="Delete creation">🗑</button><button type="button" id="importButton">Import</button><button type="button" id="saveButton">Save</button><button type="button" class="primary" id="exportButton">Export build</button><input id="fileInput" type="file" accept="application/json" hidden /></div>
    </header>
    <main class="workspace">
      <aside class="inspector">
        <section class="control-section"><div class="section-heading"><div class="section-label">Material</div><span class="selected-material" id="selectedMaterial">Grass</span></div><div class="swatches" id="swatches"></div><label class="custom-color"><span>Custom</span><input id="customColor" type="color" value="#5b8a3c" /></label></section>
        <section class="control-section"><div class="section-heading"><div class="section-label">Current layer</div><span class="layer-readout" id="layerReadout">Y = 0</span></div><div class="layer-controls"><button class="step-button" id="layerDown" aria-label="Previous layer">−</button><div class="layer-track"><div class="layer-track-fill" id="layerFill"></div></div><button class="step-button" id="layerUp" aria-label="Next layer">+</button></div></section>
        <section class="control-section"><div class="section-label">Slice plane</div><div class="segmented" id="axisControls"><button data-axis="X">X axis</button><button data-axis="Y" class="active">Y axis</button><button data-axis="Z">Z axis</button></div></section>
        <section class="control-section"><div class="section-label">Tool</div><div class="segmented" id="toolControls"><button class="active" data-tool="paint">Paint</button><button data-tool="erase">Erase</button><button data-tool="shape">Shape</button><button data-tool="select">Select</button></div><div class="shape-controls" id="shapeControls"><div class="segmented shape-types"><button data-shape="circle">Circle</button><button class="active" data-shape="square">Square</button></div><div class="shape-fields"><label><span id="shapeWidthLabel">Width</span> <input id="shapeWidth" type="number" min="1" max="100" value="5" /></label><label id="shapeHeightField">Height <input id="shapeHeight" type="number" min="1" max="100" value="5" /></label></div><p class="help">Choose dimensions, then click the grid to stamp an outline.</p></div><p class="help" id="toolHelp">Right-click any cell to erase it.</p></section>
        <section class="control-section actions"><div class="section-label">Selection actions</div><div class="action-row"><button id="undoButton" disabled>Undo</button><button id="fillSelection" disabled>Fill</button><button id="deleteSelection" class="danger" disabled>Delete</button><button id="clearLayer">Clear layer</button><button class="danger" id="clearAll">Clear all</button></div><div class="status" id="status"></div></section>
        <div class="sidebar-footer"><button class="text-button" id="resetView">Reset view</button><span>drag canvas to pan · ctrl/cmd + scroll to zoom</span></div>
      </aside>
      <section class="stage" aria-label="Voxel editor">
        <canvas id="gridCanvas"></canvas>
        <div class="coordinate-readout" id="coordinateReadout">x 0 · y 0 · z 0</div>
        <div class="preview-panel" id="previewPanel"><div class="preview-heading"><span>Orbit preview</span><button class="icon-button" id="expandPreview" title="Expand preview" aria-label="Expand preview">⤢</button></div><canvas id="previewCanvas"></canvas><div id="emptyPreview" class="empty-preview">Your build will appear here.</div><div class="preview-resize-handle" id="previewResizeHandle" role="separator" aria-label="Resize orbit preview" title="Drag to resize"></div></div>
        <div class="stage-note"><span class="dot"></span><span>Slice editing active</span></div>
      </section>
    </main></div>`;
}

document.querySelector('#app').innerHTML = appTemplate();
const $ = (id) => document.getElementById(id);
const gridCanvas = $('gridCanvas');
const grid = gridCanvas.getContext('2d');
const stage = document.querySelector('.stage');
const previewCanvas = $('previewCanvas');

let pendingDeleteId = null;
let pendingDeleteEditor = false;
let thumbnailRenderers = [];
function blocksAsList() { return [...state.blocks].map(([key, color]) => { const [x, y, z] = key.split(',').map(Number); return { x, y, z, color }; }); }
function buildPayload() { return { blocks: blocksAsList() }; }
function downloadPayload(payload, filename) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }
function formatDate(timestamp) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp); }
function requestDelete(id = state.creationId) { pendingDeleteId = id || null; pendingDeleteEditor = id === state.creationId; $('deleteModal').hidden = false; }
function renderHome() {
  const creations = library().sort((a, b) => b.updatedAt - a.updatedAt);
  thumbnailRenderers.forEach((renderer) => renderer.dispose());
  thumbnailRenderers = [];
  $('creationGrid').innerHTML = creations.length ? creations.map((creation) => `<article class="creation-card"><button class="creation-open" data-open-id="${creation.id}"><div class="creation-preview"><canvas class="creation-thumb" data-thumb-id="${creation.id}"></canvas><div class="thumb-count"><span class="preview-blocks">${creation.blocks.length}</span><span>BLOCKS</span></div></div><div class="creation-info"><h2>${creation.name.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))}</h2><span>Edited ${formatDate(creation.updatedAt)}</span></div></button><button class="delete-creation" data-delete-id="${creation.id}" aria-label="Delete ${creation.name}" title="Delete creation">🗑</button></article>`).join('') : '<div class="empty-library"><span class="empty-mark">＋</span><h2>No creations yet</h2><p>Create your first voxel world or import one from a JSON file.</p></div>';
  renderCreationThumbnails(creations);
  $('creationGrid').querySelectorAll('[data-open-id]').forEach((button) => button.addEventListener('click', () => openCreation(button.dataset.openId)));
  $('creationGrid').querySelectorAll('[data-delete-id]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); requestDelete(button.dataset.deleteId); }));
}
function renderCreationThumbnails(creations) {
  creations.forEach((creation) => {
    const canvas = document.querySelector(`[data-thumb-id="${creation.id}"]`);
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(280, 190, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(4, 7, 5);
    scene.add(light);
    const group = new THREE.Group();
    scene.add(group);
    const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x18201d, transparent: true, opacity: 0.25 });
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    creation.blocks.forEach(({ x, y, z, color }) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
      mesh.position.set(x, y, z);
      const outline = new THREE.LineSegments(edges, edgeMaterial);
      outline.position.copy(mesh.position);
      group.add(mesh, outline);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    });
    if (creation.blocks.length) {
      group.position.set(-(minX + maxX) / 2, -(minY + maxY) / 2, -(minZ + maxZ) / 2);
      const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1) + 2;
      const camera = new THREE.PerspectiveCamera(32, 280 / 190, 0.1, 1000);
      camera.position.set(span * 1.2, span * 0.9, span * 1.2);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    thumbnailRenderers.push({ dispose: () => { renderer.dispose(); geometry.dispose(); edges.dispose(); edgeMaterial.dispose(); scene.traverse((object) => object.material?.dispose()); } });
  });
}
function beginRename(id) {
  const creation = library().find((item) => item.id === id);
  const card = document.querySelector(`[data-rename-id="${id}"]`)?.closest('.creation-card');
  const title = card?.querySelector('.creation-info h2');
  if (!creation || !card || !title) return;
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = creation.name;
  input.maxLength = 80;
  const controls = document.createElement('div');
  controls.className = 'rename-controls';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'rename-save';
  saveButton.textContent = 'Save';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'rename-cancel';
  cancelButton.textContent = 'Cancel';
  controls.append(saveButton, cancelButton);
  title.replaceWith(input);
  card.querySelector('.rename-creation').hidden = true;
  card.querySelector('.creation-open').classList.add('renaming');
  input.parentElement.appendChild(controls);
  input.focus();
  input.select();
  const finish = (save) => {
    const nextName = input.value.trim();
    if (save && nextName) {
      const creations = library();
      const match = creations.find((item) => item.id === id);
      if (match) { match.name = nextName; match.updatedAt = Date.now(); saveLibrary(creations); }
      if (state.creationId === id) { state.creationName = nextName; $('editorTitle').textContent = nextName; }
    }
    renderHome();
  };
  saveButton.addEventListener('click', () => finish(true));
  cancelButton.addEventListener('click', () => finish(false));
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') finish(true); if (event.key === 'Escape') finish(false); });
}
function showEditor() { $('homeView').hidden = true; $('editorView').hidden = false; $('editorTitle').textContent = state.creationName || 'Untitled creation'; requestAnimationFrame(() => { resizeGrid(); resizePreview(); resetView(); }); }
function showHome() { $('editorView').hidden = true; $('homeView').hidden = false; renderHome(); }
function loadBlocks(blocks) { state.blocks = new Map((blocks || []).map((block) => [keyOf(block.x | 0, block.y | 0, block.z | 0), block.color || '#5b8a3c'])); state.history = []; state.selection = null; state.layer = 0; resetView(); markGrid(); }
function openCreation(id) { const creation = library().find((item) => item.id === id); if (!creation) return; state.creationId = creation.id; state.creationName = creation.name; loadBlocks(creation.blocks); showEditor(); }
function createNewCreation() { state.blocks = new Map(); seed(); state.history = []; state.selection = null; state.creationId = crypto.randomUUID(); state.creationName = 'Untitled creation'; state.layer = 0; resetView(); markGrid(); showEditor(); }
function saveCreation() { state.creationName = state.creationName || 'Untitled creation'; const creations = library().filter((creation) => creation.id !== state.creationId); const creation = { id: state.creationId || crypto.randomUUID(), name: state.creationName, updatedAt: Date.now(), blocks: blocksAsList() }; creations.push(creation); state.creationId = creation.id; saveLibrary(creations); $('editorTitle').textContent = state.creationName; setStatus('Creation saved'); }
function renameEditorCreation() {
  const button = $('editorTitleButton');
  const input = document.createElement('input');
  input.className = 'editor-title-input';
  input.value = state.creationName || 'Untitled creation';
  input.maxLength = 80;
  button.replaceWith(input);
  input.focus();
  input.select();
  const finish = (save) => {
    const nextName = input.value.trim();
    if (save && nextName) {
      state.creationName = nextName;
      if (state.creationId) {
        const creations = library();
        const match = creations.find((creation) => creation.id === state.creationId);
        if (match) { match.name = nextName; match.updatedAt = Date.now(); saveLibrary(creations); }
      }
      setStatus('Creation renamed');
    }
    const replacement = document.createElement('button');
    replacement.className = 'editor-title-button';
    replacement.id = 'editorTitleButton';
    replacement.title = 'Rename creation';
    replacement.innerHTML = `<span id="editorTitle">${(state.creationName || 'Untitled creation').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))}</span><span class="editor-title-icon">✎</span>`;
    input.replaceWith(replacement);
    replacement.addEventListener('click', renameEditorCreation);
  };
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') finish(true); if (event.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true), { once: true });
}
function importFile(file, onDone) { const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result); onDone(data); } catch { setStatus('Could not read that file'); } }; reader.readAsText(file); }
function snapshotBlocks() { return new Map(state.blocks); }
function recordHistory() { state.history.push(snapshotBlocks()); if (state.history.length > 50) state.history.shift(); updateUndoButton(); }
function updateUndoButton() { $('undoButton').disabled = state.history.length === 0; }
function undo() { const previous = state.history.pop(); if (!previous) return; state.blocks = previous; markGrid(); updateUndoButton(); setStatus('Undid last action'); }

function markGrid() { state.gridDirty = true; state.previewDirty = true; updateLabels(); }
function updateLabels() {
  $('layerReadout').textContent = `${state.axis} = ${state.layer}`;
  $('blockCount').textContent = `${state.blocks.size} ${state.blocks.size === 1 ? 'block' : 'blocks'}`;
  $('selectedMaterial').textContent = palette.find((item) => item[1] === state.color)?.[0] ?? 'Custom';
  $('layerFill').style.transform = `scaleX(${clamp((state.layer + 8) / 16, 0.05, 1)})`;
}
function renderPalette() {
  $('swatches').innerHTML = palette.map(([name, color]) => `<button class="swatch ${color === state.color ? 'selected' : ''}" title="${name}" aria-label="${name}" data-color="${color}" style="--swatch:${color}"></button>`).join('');
  $('swatches').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { state.color = button.dataset.color; state.tool = 'paint'; updateToolButtons(); renderPalette(); updateLabels(); }));
}
function updateToolButtons() { document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === state.tool)); $('shapeControls').hidden = state.tool !== 'shape'; $('toolHelp').hidden = state.tool === 'select'; $('toolHelp').textContent = 'Right-click any cell to erase it.'; updateSelectionActions(); }
function updateShapeButtons() { document.querySelectorAll('[data-shape]').forEach((button) => button.classList.toggle('active', button.dataset.shape === state.shape)); $('shapeHeightField').hidden = state.shape === 'circle'; $('shapeWidthLabel').textContent = state.shape === 'circle' ? 'Diameter' : 'Width'; }
function selectionBounds() { if (!state.selection) return null; return { left: Math.min(state.selection.start.col, state.selection.end.col), right: Math.max(state.selection.start.col, state.selection.end.col), top: Math.min(state.selection.start.row, state.selection.end.row), bottom: Math.max(state.selection.start.row, state.selection.end.row) }; }
function updateSelectionActions() { const disabled = !state.selection; $('fillSelection').disabled = disabled; $('deleteSelection').disabled = disabled; }
function selectedKeys() { const bounds = selectionBounds(); if (!bounds) return []; const keys = []; state.blocks.forEach((color, key) => { const [x, y, z] = key.split(',').map(Number); const cell = decompose(x, y, z, state.axis); if (cell.layer === state.layer && cell.col >= bounds.left && cell.col <= bounds.right && cell.row >= bounds.top && cell.row <= bounds.bottom) keys.push(key); }); return keys; }
function moveSelection(dx, dy) { const bounds = selectionBounds(); if (!bounds) return; recordHistory(); const moved = []; selectedKeys().forEach((key) => { const [x, y, z] = key.split(',').map(Number); const cell = decompose(x, y, z, state.axis); const world = compose(cell.col + dx, cell.row + dy, state.layer, state.axis); moved.push({ key, nextKey: keyOf(world.x, world.y, world.z), color: state.blocks.get(key) }); }); moved.forEach(({ key }) => state.blocks.delete(key)); moved.forEach(({ nextKey, color }) => state.blocks.set(nextKey, color)); state.selection.start.col += dx; state.selection.end.col += dx; state.selection.start.row += dy; state.selection.end.row += dy; markGrid(); }
function fillSelectionArea() { const bounds = selectionBounds(); if (!bounds) return; recordHistory(); for (let row = bounds.top; row <= bounds.bottom; row += 1) for (let col = bounds.left; col <= bounds.right; col += 1) { const world = compose(col, row, state.layer, state.axis); state.blocks.set(keyOf(world.x, world.y, world.z), state.color); } markGrid(); }
function deleteSelected() { if (!state.selection) return; recordHistory(); selectedKeys().forEach((key) => state.blocks.delete(key)); state.selection = null; updateSelectionActions(); markGrid(); }
function resizeGrid() { const ratio = Math.min(devicePixelRatio || 1, 2); gridCanvas.width = stage.clientWidth * ratio; gridCanvas.height = stage.clientHeight * ratio; state.gridDirty = true; }
function resetView() { state.scale = 28; state.offsetX = stage.clientWidth / 2 - state.scale / 2; state.offsetY = stage.clientHeight / 2 - state.scale / 2; state.gridDirty = true; }
function zoomAt(x, y, factor) { const worldX = (x - state.offsetX) / state.scale; const worldY = (y - state.offsetY) / state.scale; state.scale = clamp(state.scale * factor, 3, 120); state.offsetX = x - worldX * state.scale; state.offsetY = y - worldY * state.scale; state.gridDirty = true; }
function drawGrid() {
  const ratio = Math.min(devicePixelRatio || 1, 2); grid.setTransform(ratio, 0, 0, ratio, 0, 0); const width = stage.clientWidth; const height = stage.clientHeight; grid.clearRect(0, 0, width, height);
  const colStart = Math.floor(-state.offsetX / state.scale) - 1; const colEnd = Math.ceil((width - state.offsetX) / state.scale) + 1; const rowStart = Math.floor(-state.offsetY / state.scale) - 1; const rowEnd = Math.ceil((height - state.offsetY) / state.scale) + 1;
  for (let row = rowStart; row <= rowEnd; row += 1) for (let col = colStart; col <= colEnd; col += 1) { grid.fillStyle = (row + col) % 2 === 0 ? getCss('--grid-a') : getCss('--grid-b'); grid.fillRect(col * state.scale + state.offsetX, row * state.scale + state.offsetY, state.scale, state.scale); }
  state.blocks.forEach((color, key) => { const [x, y, z] = key.split(',').map(Number); const cell = decompose(x, y, z, state.axis); if (cell.col < colStart || cell.col > colEnd || cell.row < rowStart || cell.row > rowEnd) return; const px = cell.col * state.scale + state.offsetX; const py = cell.row * state.scale + state.offsetY; if (cell.layer === state.layer) { grid.fillStyle = color; grid.fillRect(px + 1, py + 1, state.scale - 2, state.scale - 2); } else if (cell.layer === state.layer - 1) { grid.globalAlpha = 0.2; grid.fillStyle = color; grid.fillRect(px, py, state.scale, state.scale); grid.globalAlpha = 1; } });
  const bounds = selectionBounds(); if (bounds) { grid.fillStyle = 'rgba(220,112,46,.12)'; grid.fillRect(bounds.left * state.scale + state.offsetX, bounds.top * state.scale + state.offsetY, (bounds.right - bounds.left + 1) * state.scale, (bounds.bottom - bounds.top + 1) * state.scale); grid.strokeStyle = getCss('--accent'); grid.lineWidth = 2; grid.setLineDash([5, 4]); grid.strokeRect(bounds.left * state.scale + state.offsetX + 1, bounds.top * state.scale + state.offsetY + 1, (bounds.right - bounds.left + 1) * state.scale - 2, (bounds.bottom - bounds.top + 1) * state.scale - 2); grid.setLineDash([]); }
  if (state.scale >= 8) { grid.strokeStyle = getCss('--grid-line'); grid.lineWidth = 1; for (let col = colStart; col <= colEnd + 1; col += 1) { const x = Math.round(col * state.scale + state.offsetX) + 0.5; grid.beginPath(); grid.moveTo(x, 0); grid.lineTo(x, height); grid.stroke(); } for (let row = rowStart; row <= rowEnd + 1; row += 1) { const y = Math.round(row * state.scale + state.offsetY) + 0.5; grid.beginPath(); grid.moveTo(0, y); grid.lineTo(width, y); grid.stroke(); } }
}
function getCss(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function cellAt(clientX, clientY) { const rect = gridCanvas.getBoundingClientRect(); return { col: Math.floor((clientX - rect.left - state.offsetX) / state.scale), row: Math.floor((clientY - rect.top - state.offsetY) / state.scale) }; }
function paint(clientX, clientY, forceErase = false) { const { col, row } = cellAt(clientX, clientY); const { x, y, z } = compose(col, row, state.layer, state.axis); const key = keyOf(x, y, z); recordHistory(); if (forceErase || state.tool === 'erase' || state.blocks.get(key) === state.color) state.blocks.delete(key); else state.blocks.set(key, state.color); markGrid(); }
function stampShape(clientX, clientY) { const { col, row } = cellAt(clientX, clientY); const width = clamp(Number(state.shapeWidth) || 1, 1, 100); const height = state.shape === 'circle' ? width : clamp(Number(state.shapeHeight) || 1, 1, 100); const startCol = col - Math.floor((width - 1) / 2); const startRow = row - Math.floor((height - 1) / 2); recordHistory(); const outline = new Set(); if (state.shape === 'circle') { const radius = (width - 1) / 2; const center = radius; const samples = Math.max(64, Math.ceil(radius * Math.PI * 8)); for (let sample = 0; sample < samples; sample += 1) { const angle = (sample / samples) * Math.PI * 2; const dx = Math.round(center + Math.cos(angle) * radius); const dy = Math.round(center + Math.sin(angle) * radius); outline.add(`${dx},${dy}`); } } else { for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) if (dx === 0 || dx === width - 1 || dy === 0 || dy === height - 1) outline.add(`${dx},${dy}`); } outline.forEach((cell) => { const [dx, dy] = cell.split(',').map(Number); const world = compose(startCol + dx, startRow + dy, state.layer, state.axis); state.blocks.set(keyOf(world.x, world.y, world.z), state.color); }); markGrid(); }

const pScene = new THREE.Scene(); const pCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000); const pRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true }); pRenderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); pScene.add(new THREE.AmbientLight(0xffffff, 0.75)); const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(4, 7, 5); pScene.add(light); const previewGroup = new THREE.Group(); pScene.add(previewGroup); const cubeGeometry = new THREE.BoxGeometry(1, 1, 1); const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x18201d, transparent: true, opacity: 0.55 }); let theta = Math.PI / 4; let phi = 1; let previewDistance = 10; let previewZoom = 1;
const FACE_DEFS = [
  { name: 'x+', axes: [1, 0, 0], edges: [[[1, 0, 0], [1, 1, 0]], [[1, 1, 0], [1, 1, 1]], [[1, 1, 1], [1, 0, 1]], [[1, 0, 1], [1, 0, 0]]] },
  { name: 'x-', axes: [-1, 0, 0], edges: [[[0, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 1, 1]], [[0, 1, 1], [0, 0, 1]], [[0, 0, 1], [0, 0, 0]]] },
  { name: 'y+', axes: [0, 1, 0], edges: [[[0, 1, 0], [1, 1, 0]], [[1, 1, 0], [1, 1, 1]], [[1, 1, 1], [0, 1, 1]], [[0, 1, 1], [0, 1, 0]]] },
  { name: 'y-', axes: [0, -1, 0], edges: [[[0, 0, 0], [1, 0, 0]], [[1, 0, 0], [1, 0, 1]], [[1, 0, 1], [0, 0, 1]], [[0, 0, 1], [0, 0, 0]]] },
  { name: 'z+', axes: [0, 0, 1], edges: [[[0, 0, 1], [1, 0, 1]], [[1, 0, 1], [1, 1, 1]], [[1, 1, 1], [0, 1, 1]], [[0, 1, 1], [0, 0, 1]]] },
  { name: 'z-', axes: [0, 0, -1], edges: [[[0, 0, 0], [1, 0, 0]], [[1, 0, 0], [1, 1, 0]], [[1, 1, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, 0]]] },
];
function createOutlineForBlock(x, y, z, color) {
  const points = [];
  const sameColorNeighbor = (dx, dy, dz) => {
    const neighbor = state.blocks.get(keyOf(x + dx, y + dy, z + dz));
    return neighbor && neighbor === color;
  };
  FACE_DEFS.forEach((face) => {
    const [dx, dy, dz] = face.axes;
    if (sameColorNeighbor(dx, dy, dz)) return;
    face.edges.forEach(([start, end]) => {
      const tangentAxis = start.findIndex((value, axis) => value !== end[axis]);
      const normalAxis = face.axes.findIndex((value) => value !== 0);
      const acrossAxis = [0, 1, 2].find((axis) => axis !== tangentAxis && axis !== normalAxis);
      const across = [0, 0, 0];
      across[acrossAxis] = start[acrossAxis] === 0 ? -1 : 1;
      if (sameColorNeighbor(...across)) return;
      points.push(
        new THREE.Vector3(start[0] - 0.5, start[1] - 0.5, start[2] - 0.5),
        new THREE.Vector3(end[0] - 0.5, end[1] - 0.5, end[2] - 0.5),
      );
    });
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const outline = new THREE.LineSegments(geometry, edgeMaterial.clone());
  outline.position.set(x, y, z);
  return outline;
}
function updateCamera() { const radius = previewDistance * previewZoom; pCamera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.cos(theta)); pCamera.lookAt(0, 0, 0); }
function makeAxisLabel(text, color, position, size) { const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96; const context = canvas.getContext('2d'); context.font = 'bold 64px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color; context.fillText(text, 48, 48); const texture = new THREE.CanvasTexture(canvas); texture.minFilter = THREE.LinearFilter; const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }); const sprite = new THREE.Sprite(material); sprite.position.copy(position); sprite.scale.set(size, size, 1); return sprite; }
function rebuildPreview() { while (previewGroup.children.length) { const child = previewGroup.children.pop(); child.material?.map?.dispose(); child.material?.dispose(); } if (!state.blocks.size) { $('emptyPreview').hidden = false; return; } $('emptyPreview').hidden = true; let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity; state.blocks.forEach((color, key) => { const [x, y, z] = key.split(',').map(Number); const mesh = new THREE.Mesh(cubeGeometry, new THREE.MeshStandardMaterial({ color, roughness: 0.82 })); mesh.position.set(x, y, z); const outline = createOutlineForBlock(x, y, z, color); previewGroup.add(mesh, outline); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }); const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2; const centerZ = (minZ + maxZ) / 2; const axisLength = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1) * 0.8; const axes = new THREE.AxesHelper(axisLength); previewGroup.add(axes); const labelSize = Math.max(axisLength * 0.22, 0.35); previewGroup.add(makeAxisLabel('X', '#d85c4a', new THREE.Vector3(axisLength + labelSize * 0.35, 0, 0), labelSize)); previewGroup.add(makeAxisLabel('Y', '#438c63', new THREE.Vector3(0, axisLength + labelSize * 0.35, 0), labelSize)); previewGroup.add(makeAxisLabel('Z', '#4b78b4', new THREE.Vector3(0, 0, axisLength + labelSize * 0.35), labelSize)); const sliceSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1) + 2; const slice = new THREE.Mesh(new THREE.PlaneGeometry(sliceSize, sliceSize), new THREE.MeshBasicMaterial({ color: 0x7a8085, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); slice.renderOrder = -1; if (state.axis === 'Y') { slice.rotation.x = -Math.PI / 2; slice.position.set(0, state.layer, 0); } else if (state.axis === 'X') { slice.rotation.y = Math.PI / 2; slice.position.set(state.layer, 0, 0); } else { slice.position.set(0, 0, state.layer); } previewGroup.add(slice); previewGroup.position.set(-centerX, -centerY, -centerZ); previewDistance = (Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1) + 2) * 1.6; updateCamera(); }
function resizePreview() { const panel = previewCanvas.parentElement; const width = panel.clientWidth; const height = panel.clientHeight; pRenderer.setSize(width, height, false); pCamera.aspect = width / height; pCamera.updateProjectionMatrix(); }

function exportBuild() { const filename = `${(state.creationName || 'voxel-build').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'voxel-build'}.json`; downloadPayload(buildPayload(), filename); }
function setStatus(message) { $('status').textContent = message; window.setTimeout(() => { $('status').textContent = ''; }, 2600); }

$('axisControls').addEventListener('click', (event) => { const button = event.target.closest('[data-axis]'); if (!button) return; state.axis = button.dataset.axis; state.layer = 0; document.querySelectorAll('[data-axis]').forEach((item) => item.classList.toggle('active', item === button)); markGrid(); });
$('toolControls').addEventListener('click', (event) => { const button = event.target.closest('[data-tool]'); if (!button) return; state.tool = button.dataset.tool; if (state.tool !== 'select') state.selection = null; updateToolButtons(); markGrid(); }); $('shapeControls').addEventListener('click', (event) => { const button = event.target.closest('[data-shape]'); if (!button) return; state.shape = button.dataset.shape; updateShapeButtons(); }); $('shapeWidth').addEventListener('input', (event) => { state.shapeWidth = clamp(Number(event.target.value) || 1, 1, 100); }); $('shapeHeight').addEventListener('input', (event) => { state.shapeHeight = clamp(Number(event.target.value) || 1, 1, 100); });
$('undoButton').addEventListener('click', undo);
$('fillSelection').addEventListener('click', fillSelectionArea); $('deleteSelection').addEventListener('click', deleteSelected);
$('layerUp').addEventListener('click', () => { state.layer += 1; markGrid(); }); $('layerDown').addEventListener('click', () => { state.layer -= 1; markGrid(); }); $('resetView').addEventListener('click', resetView); $('clearLayer').addEventListener('click', () => { const previous = snapshotBlocks(); [...state.blocks.keys()].forEach((key) => { const [x, y, z] = key.split(',').map(Number); if (decompose(x, y, z, state.axis).layer === state.layer) state.blocks.delete(key); }); if (state.blocks.size !== previous.size) { state.history.push(previous); updateUndoButton(); } markGrid(); setStatus('Layer cleared'); }); $('clearAll').addEventListener('click', () => { if (!state.blocks.size) return; recordHistory(); state.blocks.clear(); markGrid(); setStatus('Build cleared'); }); $('exportButton').addEventListener('click', exportBuild); $('importButton').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', () => { const [file] = $('fileInput').files; if (!file) return; importFile(file, (data) => { loadBlocks(data.blocks); state.creationId = crypto.randomUUID(); state.creationName = file.name.replace(/\.json$/i, '') || 'Imported creation'; showEditor(); setStatus('Build imported'); }); $('fileInput').value = ''; });
$('customColor').addEventListener('input', (event) => { state.color = event.target.value; state.tool = 'paint'; updateToolButtons(); renderPalette(); updateLabels(); }); $('themeButton').addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = state.theme; state.gridDirty = true; }); $('editorDeleteButton').addEventListener('click', () => requestDelete(state.creationId)); $('expandPreview').addEventListener('click', () => { const panel = $('previewPanel'); panel.classList.toggle('expanded'); if (!panel.classList.contains('expanded')) { panel.style.removeProperty('width'); panel.style.removeProperty('height'); } $('expandPreview').textContent = panel.classList.contains('expanded') ? '⤡' : '⤢'; resizePreview(); });
$('editorTitleButton').addEventListener('click', renameEditorCreation);
document.addEventListener('click', (event) => { if (event.target.closest('#editorDeleteButton')) { event.preventDefault(); event.stopPropagation(); requestDelete(state.creationId); } });
$('newCreationButton').addEventListener('click', createNewCreation); $('homeButton').addEventListener('click', showHome); $('saveButton').addEventListener('click', saveCreation); $('homeImportButton').addEventListener('click', () => $('homeFileInput').click()); $('homeFileInput').addEventListener('change', () => { const [file] = $('homeFileInput').files; if (!file) return; importFile(file, (data) => { state.creationId = crypto.randomUUID(); state.creationName = file.name.replace(/\.json$/i, '') || 'Imported creation'; loadBlocks(data.blocks); saveCreation(); showHome(); }); $('homeFileInput').value = ''; }); $('homeThemeButton').addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = state.theme; state.gridDirty = true; }); $('cancelDelete').addEventListener('click', () => { $('deleteModal').hidden = true; pendingDeleteId = null; pendingDeleteEditor = false; }); $('exportDelete').addEventListener('click', () => { const creation = library().find((item) => item.id === pendingDeleteId); if (creation) downloadPayload({ blocks: creation.blocks }, `${creation.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'voxel-build'}.json`); $('deleteModal').hidden = true; pendingDeleteId = null; pendingDeleteEditor = false; }); $('confirmDelete').addEventListener('click', () => { const deletingCurrent = pendingDeleteEditor || pendingDeleteId === state.creationId; saveLibrary(library().filter((creation) => creation.id !== pendingDeleteId)); $('deleteModal').hidden = true; pendingDeleteId = null; pendingDeleteEditor = false; if (deletingCurrent) { state.creationId = null; state.creationName = ''; showHome(); } else renderHome(); });

let drag = null; gridCanvas.addEventListener('pointerdown', (event) => { gridCanvas.setPointerCapture(event.pointerId); const cell = cellAt(event.clientX, event.clientY); drag = { x: event.clientX, y: event.clientY, cell, offsetX: state.offsetX, offsetY: state.offsetY, button: event.button, moved: false }; if (state.tool === 'select') { state.selection = { start: cell, end: cell }; updateSelectionActions(); markGrid(); } }); gridCanvas.addEventListener('pointermove', (event) => { const { col, row } = cellAt(event.clientX, event.clientY); const world = compose(col, row, state.layer, state.axis); $('coordinateReadout').textContent = `x ${world.x} · y ${world.y} · z ${world.z}`; if (!drag) return; const dx = event.clientX - drag.x; const dy = event.clientY - drag.y; if (Math.hypot(dx, dy) > 5) drag.moved = true; if (state.tool === 'select') { state.selection.end = { col, row }; updateSelectionActions(); markGrid(); } else if (drag.moved) { state.offsetX = drag.offsetX + dx; state.offsetY = drag.offsetY + dy; state.gridDirty = true; } }); gridCanvas.addEventListener('pointerup', (event) => { if (!drag) return; if (state.tool !== 'select' && !drag.moved) { if (state.tool === 'shape' && event.button !== 2) stampShape(event.clientX, event.clientY); else paint(event.clientX, event.clientY, drag.button === 2); } drag = null; }); gridCanvas.addEventListener('contextmenu', (event) => event.preventDefault()); stage.addEventListener('wheel', (event) => { event.preventDefault(); const rect = gridCanvas.getBoundingClientRect(); zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
let previewDrag = null; previewCanvas.addEventListener('pointerdown', (event) => { previewCanvas.setPointerCapture(event.pointerId); previewDrag = { x: event.clientX, y: event.clientY, theta, phi }; }); previewCanvas.addEventListener('pointermove', (event) => { if (!previewDrag) return; theta = previewDrag.theta - (event.clientX - previewDrag.x) * 0.008; phi = clamp(previewDrag.phi - (event.clientY - previewDrag.y) * 0.008, 0.1, Math.PI - 0.1); updateCamera(); }); previewCanvas.addEventListener('pointerup', () => { previewDrag = null; }); document.addEventListener('wheel', (event) => { if (!event.target.closest('.preview-panel')) return; event.preventDefault(); event.stopPropagation(); previewZoom = clamp(previewZoom * (event.deltaY < 0 ? 0.9 : 1.1), 0.25, 4); updateCamera(); }, { passive: false, capture: true });
let previewResize = null;
$('previewResizeHandle').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  const panel = $('previewPanel');
  if (!panel.classList.contains('expanded')) return;
  event.currentTarget.setPointerCapture(event.pointerId);
  const bounds = panel.getBoundingClientRect();
  previewResize = { x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height };
  panel.classList.add('resizing');
});
$('previewResizeHandle').addEventListener('pointermove', (event) => {
  if (!previewResize) return;
  const maxWidth = Math.max(300, stage.clientWidth - 36);
  const maxHeight = Math.max(300, stage.clientHeight - 36);
  $('previewPanel').style.width = `${clamp(previewResize.width + previewResize.x - event.clientX, 300, maxWidth)}px`;
  $('previewPanel').style.height = `${clamp(previewResize.height + event.clientY - previewResize.y, 300, maxHeight)}px`;
  resizePreview();
});
$('previewResizeHandle').addEventListener('pointerup', () => { previewResize = null; $('previewPanel').classList.remove('resizing'); });
document.addEventListener('keydown', (event) => { if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; if (state.tool === 'select' && state.selection && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0; const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0; moveSelection(dx, dy); return; } if (event.key === 'ArrowUp' || event.key === 'PageUp') { state.layer += 1; markGrid(); } if (event.key === 'ArrowDown' || event.key === 'PageDown') { state.layer -= 1; markGrid(); } if (event.key === '+' || event.key === '=') zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.25); if (event.key === '-') zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 0.8); });

function loop() { requestAnimationFrame(loop); if (state.gridDirty) { drawGrid(); state.gridDirty = false; } if (state.previewDirty) { rebuildPreview(); state.previewDirty = false; } pRenderer.render(pScene, pCamera); }
seed(); renderPalette(); updateLabels(); updateToolButtons(); updateShapeButtons(); updateUndoButton(); renderHome(); syncLibrary(); new ResizeObserver(resizeGrid).observe(stage); new ResizeObserver(resizePreview).observe($('previewPanel')); resizeGrid(); resizePreview(); requestAnimationFrame(() => { resetView(); state.previewDirty = true; }); loop();
