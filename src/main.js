import './style.css';
import * as THREE from 'three';
import { cells, kcell, GRID_R, SQ3, SIZE, MAXH, BOTTOM, WATER_Y, worldToHex, newIsland, newPangea, clearAll, PANGEA_MODE } from './world/grid.js';
import { createMeshSystem } from './world/mesh.js';
import { createScatterSystem } from './world/scatter.js';
import { createVolcanoSystem } from './world/volcano.js';
import { createDinoSystem, SPECIES } from './world/dinos.js';
import { createNestSystem } from './world/nests.js';
import { createAudioSystem } from './audio/audio.js';
import { createTerrainMaterial } from './render/terrainMaterial.js';
import { createWaterMaterial } from './render/waterMaterial.js';
import { makeDinoThumbnails } from './render/dinoThumbnails.js';
import { makeVolcanoThumbnail } from './render/volcanoThumbnail.js';
import { createCameraControls } from './input/camera.js';
import { createHud } from './ui/hud.js';

/* ═══════════════════════════════════════════════════════
   Cena
   ═══════════════════════════════════════════════════════ */
// "Modo PC Jurássico": antialias e resolução só podem ser fixados na criação
// do contexto WebGL, por isso a preferência fica salva e um toggle recarrega
// a página em vez de tentar trocar isso em tempo real.
const JURASSIC_KEY = 'ilhaDosDinos:pcJurassico';
let pcJurassico = false;
try { pcJurassico = localStorage.getItem(JURASSIC_KEY) === '1'; } catch (e) {}
// mesma chave que grid.js lê pra decidir GRID_R — duplicada aqui só porque
// é o toggle (em main.js/hud.js) quem precisa gravar nela
const PANGEA_KEY = 'ilhaDosDinos:pangea';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas:canvas, antialias: !pcJurassico });
renderer.setPixelRatio(pcJurassico ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = !pcJurassico; // sombra é o que mais pesa em tablet antigo — desliga por padrão no modo jurássico
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// ACES Filmic custava fill-rate extra e só deixava tudo mais claro/menos
// saturado (as luzes daqui nunca foram calibradas pro fluxo HDR que o ACES
// espera) — sem tone mapping a cor do material vai direto pra tela, mais
// viva e mais barata, então nem precisa variar com o Modo PC Jurássico
renderer.toneMapping = THREE.NoToneMapping;

// mapa Pangeia tem raio maior — névoa, sombra e teto de zoom foram
// calibrados pro mapa padrão (GRID_R=9) e precisam crescer junto, senão o
// contorno maior fica encoberto antes de dar pra ver a ilha inteira
const MAP_SCALE = GRID_R / 9;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbe8f1);
scene.fog = new THREE.Fog(0xdbe8f1, 30, 78 * MAP_SCALE);

const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 220);

const hemi = new THREE.HemisphereLight(0xdff0ff, 0x8f8468, 0.66);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2da, 0.92); // vira "luar" à noite, ver applyDayNight()
sun.position.set(16, 24, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -24 * MAP_SCALE; sun.shadow.camera.right = 24 * MAP_SCALE;
sun.shadow.camera.top = 24 * MAP_SCALE;   sun.shadow.camera.bottom = -24 * MAP_SCALE;
sun.shadow.camera.near = 4;   sun.shadow.camera.far = 74 * MAP_SCALE;
sun.shadow.bias = -0.0014;
scene.add(sun);
scene.add(sun.target);

// dia/noite: só troca cor/intensidade das luzes e o fundo — nenhum material
// precisa saber disso, a iluminação Phong já reage sozinha. `isNight` fica
// exposto pra mais tarde ligar/desligar dinos noturnos.
const DAY_SKY   = { bg:0xdbe8f1, hemiSky:0xdff0ff, hemiGround:0x8f8468, hemiI:0.66, sunColor:0xfff2da, sunI:0.92 };
const NIGHT_SKY = { bg:0x0c1830, hemiSky:0x24335c, hemiGround:0x11141f, hemiI:0.24, sunColor:0xaec8ff, sunI:0.30 };
let isNight = false;
function applyDayNight(){
  const p = isNight ? NIGHT_SKY : DAY_SKY;
  scene.background.setHex(p.bg);
  scene.fog.color.setHex(p.bg);
  hemi.color.setHex(p.hemiSky);
  hemi.groundColor.setHex(p.hemiGround);
  hemi.intensity = p.hemiI;
  sun.color.setHex(p.sunColor);
  sun.intensity = p.sunI;
}

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
const terrainMaterial = createTerrainMaterial(renderer, pcJurassico);
const scatter = createScatterSystem(scene);
const volcano = createVolcanoSystem(scene, lavaLight);
const mesh = createMeshSystem(scene, terrainMaterial.material, scatter, volcano);
const nests = createNestSystem(scene);
const audio = createAudioSystem();

const generateIsland = PANGEA_MODE ? newPangea : newIsland;

// miniaturas dos modelos 3D de verdade pros cards de objetivo — geradas uma
// vez, num renderer descartável à parte (ver render/dinoThumbnails.js)
const dinoThumbs = makeDinoThumbnails(renderer);

// lista unificada dos cards de objetivo: um por dino + o vulcão (que não é
// um bicho, mas segue o mesmo mecanismo de card — imagem + instrução +
// selo verde quando a meta é atingida)
const objectives = SPECIES.map(function(def){
  return { key: def.key, label: def.label, img: dinoThumbs[def.key], howTo: def.howTo };
});
objectives.push({
  key: 'vulcao', label: 'Vulcão', img: makeVolcanoThumbnail(),
  howTo: 'Levante sete hexágonos até o topo do mapa — um no centro e seis ao redor — para formar um vulcão com lava.'
});

const hud = createHud({
  objectives: objectives,
  onNewIsland: function(){ audio.unlock(); audio.playClick(); generateIsland(); nests.clear(); dinos.resetUnlocked(); rebuild(); },
  onClear: function(){ audio.unlock(); audio.playClick(); clearAll(); nests.clear(); dinos.resetUnlocked(); rebuild(); },
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
  },
  onToggleDig: function(on){ audio.unlock(); audio.playClick(); digMode = on; },
  onToggleFullscreen: function(){ audio.unlock(); audio.playClick(); },
  onToggleNight: function(on){ audio.unlock(); audio.playClick(); isNight = on; applyDayNight(); },
  shadowsOn: !pcJurassico,
  jurassic: pcJurassico,
  onToggleJurassic: function(on){
    audio.unlock(); audio.playClick();
    try { localStorage.setItem(JURASSIC_KEY, on ? '1' : '0'); } catch (e) {}
    location.reload();
  },
  pangea: PANGEA_MODE,
  onTogglePangea: function(on){
    audio.unlock(); audio.playClick();
    try { localStorage.setItem(PANGEA_KEY, on ? '1' : '0'); } catch (e) {}
    location.reload();
  }
});

let showVeg = true;
let digMode = true; // já começa ativo — o jeito mais fácil de topar com um fóssil é cavando
function rebuild(){
  const stats = mesh.rebuild(showVeg);
  hud.setStats(stats);
  dinos.onTerrainChanged();
  const discovered = dinos.getDiscovered();
  if (stats.volcanoCount > 0) discovered.push('vulcao');
  hud.updateDiscovered(discovered);
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
const FOSSIL_CHANCE = 0.12;  // chance de achar um fóssil ao cavar, só pra ser divertido
const FOSSIL_MAX_STAGE = 3;  // no estágio 3 o fóssil aparece por completo
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
    if (c.fossilStage === 0 && dinos.hasLockedSpecies() && Math.random() < FOSSIL_CHANCE){
      c.fossilStage = 1; // achou — ainda são só alguns ossos
      c.fossilSpecies = dinos.pickLockedSpecies(); // trava a espécie deste sítio agora
      audio.playFossil();
    } else if (c.fossilStage > 0 && c.fossilStage < FOSSIL_MAX_STAGE){
      c.fossilStage++; // cavando mais fundo no mesmo lugar, aparece mais fóssil
      audio.playFossil();
      if (c.fossilStage === FOSSIL_MAX_STAGE){
        const label = dinos.unlockSpecies(c.fossilSpecies);
        if (label) hud.showDiscovery(label, dinos.hasLockedSpecies());
      }
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
const { cam, applyCamera } = createCameraControls({
  canvas: canvas, camera: camera, gridR: GRID_R, sq3: SQ3, size: SIZE, maxDist: 64 * MAP_SCALE,
  onTap: function(px, py, d){ edit(px, py, digMode ? -1 : d); }, onHover: hover
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
// a ondulação é sutil (não recalcula normais, então nem afeta o brilho) —
// de longe dá pra nem mexer nela, e isso poupa um loop de 2000 senos/frame
const WATER_ANIM_MAX_DIST = 40;
let lastMs = null;
function animate(ms){
  const t = ms*0.001;
  const dt = lastMs === null ? 0 : (ms - lastMs)*0.001;
  lastMs = ms;
  if (cam.dist < WATER_ANIM_MAX_DIST){
    for (let i = 0; i < wpos.count; i++){
      const x = waterBase[i*3], y = waterBase[i*3+1];
      wpos.array[i*3+2] = Math.sin(x*0.35 + t*0.9)*0.055 + Math.cos(y*0.42 - t*1.2)*0.045;
    }
    wpos.needsUpdate = true;
  }
  terrainMaterial.setTime(t);
  volcano.update(t);
  nests.update(t);
  dinos.update(dt, t);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

generateIsland();
const dinos = createDinoSystem(scene, scatter, renderer, nests, pcJurassico);
rebuild();
resize();
applyCamera();
hud.removeBoot();
hud.showModal('🎯 Estes são seus objetivos.', { point: true });
hud.showModal('🦴 Escave para encontrar fósseis e liberar dinos!');
requestAnimationFrame(animate);
