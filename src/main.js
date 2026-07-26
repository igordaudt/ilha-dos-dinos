import './style.css';
import * as THREE from 'three';
import { cells, kcell, GRID_R, SQ3, SIZE, MAXH, BOTTOM, WATER_Y, worldToHex, newIsland, clearAll } from './world/grid.js';
import { createMeshSystem } from './world/mesh.js';
import { createScatterSystem } from './world/scatter.js';
import { createVolcanoSystem } from './world/volcano.js';
import { createDinoSystem } from './world/dinos.js';
import { createNestSystem } from './world/nests.js';
import { createAudioSystem } from './audio/audio.js';
import { createTerrainMaterial } from './render/terrainMaterial.js';
import { createWaterMaterial } from './render/waterMaterial.js';
import { createCameraControls } from './input/camera.js';
import { createHud } from './ui/hud.js';

/* ═══════════════════════════════════════════════════════
   Cena
   ═══════════════════════════════════════════════════════ */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas:canvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // contraste mais "cinematográfico", sem mexer nas cores dos materiais

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbe8f1);
scene.fog = new THREE.Fog(0xdbe8f1, 30, 78);

const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 220);

scene.add(new THREE.HemisphereLight(0xdff0ff, 0x8f8468, 0.66));
const sun = new THREE.DirectionalLight(0xfff2da, 0.92);
sun.position.set(16, 24, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;   sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 4;   sun.shadow.camera.far = 74;
sun.shadow.bias = -0.0014;
scene.add(sun);
scene.add(sun.target);

// luz do vulcão — criada sempre, para nunca recompilar shaders em tempo de jogo
const lavaLight = new THREE.PointLight(0xff7a2a, 0, 11, 2);
scene.add(lavaLight);

const SPAN = (GRID_R + 4) * SQ3 * SIZE * 2;
const BUILD_RADIUS = GRID_R * SQ3 * SIZE; // até onde dá pra ter terreno; daí em diante é alto-mar
const waterGeo = new THREE.PlaneGeometry(SPAN, SPAN, 44, 44);
const water = new THREE.Mesh(waterGeo, createWaterMaterial(BUILD_RADIUS, SPAN/2));
water.rotation.x = -Math.PI/2;
water.position.y = WATER_Y;
water.receiveShadow = true;
scene.add(water);
const waterBase = waterGeo.attributes.position.array.slice();

const floor = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN),
  new THREE.MeshPhongMaterial({ color:0x3d7096, shininess:0 }));
floor.rotation.x = -Math.PI/2;
floor.position.y = BOTTOM - 0.05;
scene.add(floor);

const ringGeo = new THREE.BufferGeometry();
ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
const ring = new THREE.LineLoop(ringGeo,
  new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9 }));
ring.frustumCulled = false;
ring.visible = false;
scene.add(ring);

/* ═══════════════════════════════════════════════════════
   Sistemas do mundo
   ═══════════════════════════════════════════════════════ */
const terrainMaterial = createTerrainMaterial(renderer);
const scatter = createScatterSystem(scene);
const volcano = createVolcanoSystem(scene, lavaLight);
const mesh = createMeshSystem(scene, terrainMaterial.material, scatter, volcano);
const nests = createNestSystem(scene);
const audio = createAudioSystem();

const hud = createHud({
  onNewIsland: function(){ audio.unlock(); audio.playClick(); newIsland(); nests.clear(); rebuild(); },
  onClear: function(){ audio.unlock(); audio.playClick(); clearAll(); nests.clear(); rebuild(); },
  onToggleVeg: function(on){ audio.unlock(); audio.playClick(); showVeg = on; rebuild(); },
  onToggleSun: function(on){
    audio.unlock(); audio.playClick();
    renderer.shadowMap.enabled = on;
    scene.traverse(function(o){ if (o.material) o.material.needsUpdate = true; });
  },
  onToggleSound: function(on){
    audio.unlock();
    audio.setMuted(!on);
    audio.playClick(); // só toca se "on" for true — playClick já respeita o mudo
  }
});

let showVeg = true;
function rebuild(){
  const stats = mesh.rebuild(showVeg);
  hud.setStats(stats);
  dinos.onTerrainChanged();
  audio.setVolcanoRumble(stats.volcanoCount > 0);
}

/* ═══════════════════════════════════════════════════════
   Seleção
   ═══════════════════════════════════════════════════════ */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(px, py){
  const rect = canvas.getBoundingClientRect();
  ndc.x =  ((px - rect.left)/rect.width )*2 - 1;
  ndc.y = -((py - rect.top )/rect.height)*2 + 1;
  ray.setFromCamera(ndc, camera);
  const terrain = mesh.getTerrain();
  if (terrain){
    const hit = ray.intersectObject(terrain, false);
    if (hit.length) return mesh.getFaceCell()[hit[0].faceIndex] || null;
  }
  const hw = ray.intersectObject(water, false);
  if (hw.length){
    const qr = worldToHex(hw[0].point.x, hw[0].point.z);
    return cells.get(kcell(qr[0], qr[1])) || null;
  }
  return null;
}
function showRing(c){
  if (!c || !c.cor){ ring.visible = false; return; }
  const a = ringGeo.attributes.position.array;
  for (let i = 0; i < 6; i++){
    a[i*3]   = c.cor[i].p[0];
    a[i*3+1] = Math.max(c.cor[i].p[1] + 0.05, 0.10);  // sobre a água também
    a[i*3+2] = c.cor[i].p[2];
  }
  ringGeo.attributes.position.needsUpdate = true;
  ring.visible = true;
}
function hover(px, py){ showRing(pick(px, py)); }
const FOSSIL_CHANCE = 0.12; // chance de achar um fóssil ao cavar, só pra ser divertido
function edit(px, py, d){
  const c = pick(px, py);
  if (!c) return;
  const h = Math.max(0, Math.min(MAXH, c.h + d));
  if (h === c.h) return;
  const dug = h < c.h;
  c.h = h;
  audio.unlock();
  if (dug){
    audio.playDig();
    if (!c.fossil && Math.random() < FOSSIL_CHANCE){
      c.fossil = true;
      audio.playFossil();
    }
  } else {
    audio.playRaise();
  }
  rebuild();
  showRing(c);
}

/* ═══════════════════════════════════════════════════════
   Câmera
   ═══════════════════════════════════════════════════════ */
const { applyCamera } = createCameraControls({
  canvas: canvas, camera: camera, gridR: GRID_R, sq3: SQ3, size: SIZE,
  onTap: edit, onHover: hover
});

/* ═══════════════════════════════════════════════════════
   Loop e interface
   ═══════════════════════════════════════════════════════ */
function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const wpos = waterGeo.attributes.position;
let lastMs = null;
function animate(ms){
  const t = ms*0.001;
  const dt = lastMs === null ? 0 : (ms - lastMs)*0.001;
  lastMs = ms;
  for (let i = 0; i < wpos.count; i++){
    const x = waterBase[i*3], y = waterBase[i*3+1];
    wpos.array[i*3+2] = Math.sin(x*0.35 + t*0.9)*0.055 + Math.cos(y*0.42 - t*1.2)*0.045;
  }
  wpos.needsUpdate = true;
  terrainMaterial.setTime(t);
  volcano.update(t);
  nests.update(t);
  dinos.update(dt, t);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

newIsland();
const dinos = createDinoSystem(scene, scatter, renderer, nests);
rebuild();
resize();
applyCamera();
hud.removeBoot();
requestAnimationFrame(animate);
