import * as THREE from 'three';
import { cells, cxOf, czOf, cellAt, heightAt, WATER_Y, MAXH, STEP, GRID_R, SQ3, SIZE } from './grid.js';
import { createDinoMaterial } from '../render/dinoMaterial.js';

/* ═══════════════════════════════════════════════════════
   Ajustes — mexa aqui
   ═══════════════════════════════════════════════════════ */
// bioma: 'terrestre' anda no chão, 'aquatico' nada no mar, 'voador' plana no
// ar num nível fixo (ignora o relevo — só pousa em picos nível PEAK_MIN_LEVEL+).
// food: chave do world/scatter.js que a espécie procura pra comer; null =
// sem planta alvo (o aquático "caça" um ponto qualquer só pra ciclar os
// estados vagar → procurarComida → comer → ocioso; o voador procura picos).
// cores escolhidas perto da paleta que o terreno/água já usam (ver
// render/terrainMaterial.js e render/waterMaterial.js), pra não destoar.
// herd: true faz a espécie tender a ficar perto dos outros da mesma espécie
// (ver pickWanderTarget) — só entra em jogo enquanto o bicho está vagando
// à toa; procurando comida, ele se afasta da manada se precisar.
// label: nome de exibição, usado só na mensagem de "descobriu um fóssil"
// (ver createDinoSystem() mais abaixo) — o pterossauro não passa por
// fóssil, mas ganha um label também pra manter a lista uniforme.
export const SPECIES = [
  { key:'braquiossauro', label:'Braquiossauro', bioma:'terrestre', food:'tall', count:2, herd:true,
    speedMin:0.35, speedMax:0.55, sizeMin:1.00, sizeMax:1.25,
    color:[0.44, 0.53, 0.38] },
  { key:'pequeno', label:'Compsognato', bioma:'terrestre', food:'bush', count:3,
    speedMin:1.10, speedMax:1.60, sizeMin:0.75, sizeMax:1.05,
    color:[0.58, 0.45, 0.31] },
  { key:'pterossauro', label:'Pterossauro', bioma:'voador', food:null, count:2,
    speedMin:1.40, speedMax:2.00, sizeMin:0.85, sizeMax:1.10,
    color:[0.50, 0.52, 0.57] },
  { key:'aquatico', label:'Plesiossauro', bioma:'aquatico', food:null, count:2,
    speedMin:0.80, speedMax:1.20, sizeMin:0.90, sizeMax:1.20,
    color:[0.19, 0.40, 0.50] },
  { key:'triceratopo', label:'Triceratopo', bioma:'terrestre', food:'cycad', count:2, herd:true,
    speedMin:0.55, speedMax:0.75, sizeMin:0.85, sizeMax:1.05,
    color:[0.50, 0.46, 0.34] }
];

const WANDER_RADIUS      = 5;    // raio (m) do próximo ponto ao vagar
const FOOD_SEARCH_RADIUS = 11;   // raio (m) em que uma espécie enxerga comida
const ARRIVE_EPS         = 0.15; // distância pra considerar "chegou"
const EAT_DURATION       = 4;    // segundos parado comendo (ou pousado, no voador)
const IDLE_MIN           = 2.5;  // segundos ocioso, mínimo
const IDLE_MAX           = 5.5;  // segundos ocioso, máximo
const FLY_Y              = MAXH * STEP; // altitude de cruzeiro: nível 9, sempre — não segue o relevo
const AQUA_SUBMERGE      = 0.12; // quanto o aquático fica abaixo da linha d'água
const BOB_AMOUNT         = 0.10; // amplitude do balanço vertical (voo/natação)
const BOB_SPEED          = 1.6;
const MAP_RADIUS         = GRID_R * SQ3 * SIZE; // mesmo limite do pan da câmera
const COLOR_JITTER       = 0.30; // variação de cor entre indivíduos da mesma espécie
export const BELLY_LIGHTEN = 0.45; // quanto a barriga clareia em relação ao dorso
const LEG_SWING_AMP      = 0.45; // rad — quanto a perna balança pra frente/trás
const LEG_SWING_FREQ     = 6;    // cadência do passo, multiplicada pela velocidade do bicho
const WING_FLAP_AMP      = 0.55; // rad — quanto a asa bate pra cima/baixo
const WING_FLAP_FREQ     = 5;    // cadência do batimento (fixa: voa sempre no mesmo ritmo)
const TAIL_SWAY_AMP      = 0.35; // rad — quanto a cauda balança nadando
const TAIL_SWAY_FREQ     = 3.2;  // cadência da nadada, multiplicada pela velocidade do bicho
const PEAK_MIN_LEVEL     = 8;    // a partir de que altura uma célula conta como "montanha" pro voador
const HERD_RADIUS        = 7;    // até quão longe do centro da manada um bicho "de manada" pode vagar
const NEST_CHANCE        = 0.15; // chance de botar um ninho ao acabar de comer, em terreno bom

const STATE = { WANDER:'vagar', SEEK:'procurarComida', EAT:'comer', IDLE:'ocioso' };

/* ═══════════════════════════════════════════════════════
   Materiais — cada dino ganha um par dorso/barriga levemente
   sorteado, pra não sair uma leva de clones idênticos.
   ═══════════════════════════════════════════════════════ */
export function lighten(c, amt){
  return [c[0] + (1-c[0])*amt, c[1] + (1-c[1])*amt, c[2] + (1-c[2])*amt];
}
function jitterColor(c){
  const k = 1 - COLOR_JITTER/2 + Math.random()*COLOR_JITTER;
  return [Math.min(1, c[0]*k), Math.min(1, c[1]*k), Math.min(1, c[2]*k)];
}
const EYE_MAT = new THREE.MeshStandardMaterial({ color:0x161616, roughness:0.25, metalness:0.1 });

/* ═══════════════════════════════════════════════════════
   Silhuetas — formas geométricas simples, sem modelagem caprichada
   ═══════════════════════════════════════════════════════ */
function part(group, geo, mat){
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}
// perna pendurada num pivô no quadril, pra girar (balançar ao andar) em
// torno do ponto de encaixe com o corpo, e não do próprio centro do cilindro.
function addLeg(group, x, hipY, z, geo, mat, legLen){
  const pivot = new THREE.Group();
  pivot.position.set(x, hipY, z);
  group.add(pivot);
  const leg = new THREE.Mesh(geo, mat);
  leg.position.set(0, -legLen/2, 0);
  leg.castShadow = true; leg.receiveShadow = true;
  pivot.add(leg);
  return pivot;
}
// asa (interno + ponta) pendurada num pivô no ombro, pra bater — mesma
// lógica da perna, só que o pivô gira em torno do eixo que aponta pra
// frente (bate pra cima/baixo) em vez do que aponta pro lado.
function addWing(group, mat, side){
  const rootX = -0.05, rootY = 0.02, rootZ = side*0.05;
  const pivot = new THREE.Group();
  pivot.position.set(rootX, rootY, rootZ);
  group.add(pivot);
  const inner = part(pivot, new THREE.BoxGeometry(0.55, 0.02, 0.30), mat);
  inner.position.set(0, 0, side*0.15);
  inner.rotation.z = side*0.08;
  const outer = part(pivot, new THREE.BoxGeometry(0.42, 0.018, 0.20), mat);
  outer.position.set(-0.23, -0.03, side*0.37);
  outer.rotation.z = side*0.22;
  outer.rotation.y = side*0.10;
  return pivot;
}
// nadadeira caudal pendurada num pivô onde a cauda encontra o corpo, pra
// balançar de lado a lado (gira em torno do eixo vertical).
function addTailFin(group, mat, rootX){
  const pivot = new THREE.Group();
  pivot.position.set(rootX, 0, 0);
  group.add(pivot);
  const flukeGeo = new THREE.ConeGeometry(0.16, 0.26, 3);
  for (const side of [1, -1]){
    const fluke = part(pivot, flukeGeo, mat);
    fluke.rotation.z = Math.PI/2;
    fluke.rotation.y = side*0.55;
    fluke.position.set(-0.66 - rootX, 0, side*0.06);
  }
  return pivot;
}

function buildBraquiossauro(mat, bellyMat){
  const g = new THREE.Group();
  const body = part(g, new THREE.BoxGeometry(1.3, 0.55, 0.6), mat);
  body.position.set(0, 0.55, 0);
  const belly = part(g, new THREE.BoxGeometry(1.1, 0.16, 0.5), bellyMat);
  belly.position.set(0, 0.30, 0);
  // pescoço em dois segmentos, pra uma curva mais natural que um cilindro reto
  const neck1 = part(g, new THREE.CylinderGeometry(0.13, 0.16, 0.7, 7), mat);
  neck1.position.set(0.55, 1.00, 0);
  neck1.rotation.z = -Math.PI*0.28;
  const neck2 = part(g, new THREE.CylinderGeometry(0.09, 0.13, 0.72, 7), mat);
  neck2.position.set(1.02, 1.55, 0);
  neck2.rotation.z = -Math.PI*0.16;
  const head = part(g, new THREE.BoxGeometry(0.28, 0.20, 0.22), mat);
  head.position.set(1.42, 1.90, 0);
  const eyeGeo = new THREE.SphereGeometry(0.025, 6, 5);
  for (const ez of [0.10, -0.10]){
    const eye = part(g, eyeGeo, EYE_MAT);
    eye.position.set(1.50, 1.93, ez);
  }
  const tail = part(g, new THREE.CylinderGeometry(0.05, 0.16, 1.2, 7), mat);
  tail.position.set(-0.95, 0.45, 0);
  tail.rotation.z = Math.PI*0.42;
  const legGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.62, 7);
  const legs = [];
  for (const lx of [0.45, -0.45]) for (const lz of [0.22, -0.22]){
    const pivot = addLeg(g, lx, 0.62, lz, legGeo, mat, 0.62);
    legs.push({ pivot: pivot, phase: (lx*lz > 0) ? 0 : Math.PI }); // trote diagonal
  }
  return { group: g, legs: legs, wings: [], tail: null };
}

function buildPequeno(mat, bellyMat){
  const g = new THREE.Group();
  const body = part(g, new THREE.BoxGeometry(0.46, 0.24, 0.22), mat);
  body.position.set(0, 0.30, 0);
  body.rotation.z = 0.12;
  const belly = part(g, new THREE.BoxGeometry(0.36, 0.08, 0.18), bellyMat);
  belly.position.set(0.02, 0.20, 0);
  belly.rotation.z = 0.12;
  const neck = part(g, new THREE.CylinderGeometry(0.045, 0.06, 0.28, 6), mat);
  neck.position.set(0.23, 0.44, 0);
  neck.rotation.z = -0.7;
  const head = part(g, new THREE.SphereGeometry(0.09, 7, 6), mat);
  head.position.set(0.38, 0.58, 0);
  const eyeGeo = new THREE.SphereGeometry(0.018, 6, 5);
  for (const ez of [0.06, -0.06]){
    const eye = part(g, eyeGeo, EYE_MAT);
    eye.position.set(0.44, 0.60, ez);
  }
  const tail = part(g, new THREE.CylinderGeometry(0.02, 0.07, 0.42, 6), mat);
  tail.position.set(-0.32, 0.32, 0);
  tail.rotation.z = 0.55;
  // bracinhos curtos — a marca registrada dos terópodes pequenos
  const armGeo = new THREE.CylinderGeometry(0.014, 0.018, 0.13, 5);
  for (const az of [0.07, -0.07]){
    const arm = part(g, armGeo, mat);
    arm.position.set(0.14, 0.28, az);
    arm.rotation.z = -0.5;
  }
  const legGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.30, 6);
  const legs = [];
  for (const lz of [0.09, -0.09]){
    const pivot = addLeg(g, 0.05, 0.30, lz, legGeo, mat, 0.30);
    legs.push({ pivot: pivot, phase: (lz > 0) ? 0 : Math.PI }); // bípede: pernas alternadas
  }
  return { group: g, legs: legs, wings: [], tail: null };
}

function buildPterossauro(mat){
  const g = new THREE.Group();
  const body = part(g, new THREE.SphereGeometry(0.14, 7, 6), mat);
  body.scale.set(1.6, 0.8, 0.8);
  const head = part(g, new THREE.ConeGeometry(0.075, 0.28, 6), mat);
  head.rotation.z = Math.PI/2;
  head.position.set(0.31, 0.04, 0);
  const crest = part(g, new THREE.ConeGeometry(0.05, 0.16, 4), mat);
  crest.position.set(0.26, 0.16, 0);
  crest.rotation.z = -0.5;
  const eyeGeo = new THREE.SphereGeometry(0.018, 6, 5);
  for (const ez of [0.045, -0.045]){
    const eye = part(g, eyeGeo, EYE_MAT);
    eye.position.set(0.34, 0.06, ez);
  }
  // asa em dois segmentos (interno + ponta), pra sugerir um leve diedro,
  // pendurada num pivô no ombro pra poder bater
  const wings = [];
  for (const side of [1, -1]){
    const pivot = addWing(g, mat, side);
    wings.push({ pivot: pivot, signX: -side }); // sinal invertido: os dois lados batem juntos, não em gangorra
  }
  return { group: g, legs: [], wings: wings, tail: null };
}

function buildAquatico(mat, bellyMat){
  const g = new THREE.Group();
  const body = part(g, new THREE.CylinderGeometry(0.14, 0.20, 1.0, 9), mat);
  body.rotation.z = Math.PI/2;
  const belly = part(g, new THREE.BoxGeometry(0.7, 0.10, 0.16), bellyMat);
  belly.position.set(0.05, -0.14, 0);
  const head = part(g, new THREE.ConeGeometry(0.14, 0.36, 9), mat);
  head.rotation.z = -Math.PI/2;
  head.position.set(0.66, 0, 0);
  const eyeGeo = new THREE.SphereGeometry(0.02, 6, 5);
  for (const ez of [0.09, -0.09]){
    const eye = part(g, eyeGeo, EYE_MAT);
    eye.position.set(0.72, 0.03, ez);
  }
  // cauda em leque (duas nadadeiras), pendurada num pivô onde encontra o
  // corpo, pra poder balançar de lado a lado ao nadar
  const tail = addTailFin(g, mat, -0.45);
  const dorsal = part(g, new THREE.ConeGeometry(0.10, 0.20, 3), mat);
  dorsal.position.set(0.05, 0.20, 0);
  const flipperGeo = new THREE.BoxGeometry(0.06, 0.02, 0.28);
  for (const fz of [0.20, -0.20]){
    const fin = part(g, flipperGeo, mat);
    fin.position.set(0.15, -0.05, fz);
  }
  return { group: g, legs: [], wings: [], tail: tail };
}

function buildTriceratopo(mat, bellyMat){
  const g = new THREE.Group();
  const body = part(g, new THREE.BoxGeometry(0.95, 0.42, 0.56), mat);
  body.position.set(-0.05, 0.42, 0);
  const belly = part(g, new THREE.BoxGeometry(0.75, 0.12, 0.46), bellyMat);
  belly.position.set(-0.05, 0.22, 0);
  const head = part(g, new THREE.BoxGeometry(0.34, 0.28, 0.38), mat);
  head.position.set(0.56, 0.50, 0);
  const beak = part(g, new THREE.ConeGeometry(0.10, 0.20, 5), mat);
  beak.rotation.z = -Math.PI/2;
  beak.position.set(0.78, 0.44, 0);
  // folho atrás da cabeça
  const frill = part(g, new THREE.CylinderGeometry(0.34, 0.30, 0.05, 8), mat);
  frill.rotation.x = Math.PI/2;
  frill.rotation.z = 0.15;
  frill.position.set(0.30, 0.58, 0);
  // três chifres: dois na testa, um no focinho
  const browHornGeo = new THREE.ConeGeometry(0.035, 0.30, 5);
  for (const ez of [0.11, -0.11]){
    const horn = part(g, browHornGeo, mat);
    horn.position.set(0.62, 0.68, ez);
    horn.rotation.z = -Math.PI*0.42;
    horn.rotation.y = ez > 0 ? -0.15 : 0.15;
  }
  const noseHorn = part(g, new THREE.ConeGeometry(0.03, 0.14, 5), mat);
  noseHorn.position.set(0.76, 0.52, 0);
  noseHorn.rotation.z = -Math.PI*0.38;
  const eyeGeo = new THREE.SphereGeometry(0.022, 6, 5);
  for (const ez of [0.13, -0.13]){
    const eye = part(g, eyeGeo, EYE_MAT);
    eye.position.set(0.62, 0.52, ez);
  }
  // cauda curta — ceratopsídeos não têm cauda longa como os saurópodes
  const tailPart = part(g, new THREE.CylinderGeometry(0.05, 0.10, 0.32, 6), mat);
  tailPart.position.set(-0.62, 0.36, 0);
  tailPart.rotation.z = Math.PI*0.46;
  // pernas — quadrúpede, mesmo trote diagonal do braquiossauro
  const legGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.46, 7);
  const legs = [];
  for (const lx of [0.32, -0.32]) for (const lz of [0.20, -0.20]){
    const pivot = addLeg(g, lx, 0.46, lz, legGeo, mat, 0.46);
    legs.push({ pivot: pivot, phase: (lx*lz > 0) ? 0 : Math.PI });
  }
  return { group: g, legs: legs, wings: [], tail: null };
}

export const BUILDERS = {
  braquiossauro: buildBraquiossauro,
  pequeno: buildPequeno,
  pterossauro: buildPterossauro,
  aquatico: buildAquatico,
  triceratopo: buildTriceratopo
};

/* ═══════════════════════════════════════════════════════
   Consultas de bioma
   ═══════════════════════════════════════════════════════ */
function isLand(x, z){ const c = cellAt(x, z); return !!c && c.h > 0; }
function isWater(x, z){ const c = cellAt(x, z); return !!c && c.h === 0; }
function randRange(a, b){ return a + Math.random()*(b - a); }

function hasPeak(){
  for (const c of cells.values()) if (c.h >= PEAK_MIN_LEVEL) return true;
  return false;
}

function randomStart(def){
  const pool = [];
  cells.forEach(function(c){
    if (def.bioma === 'terrestre' && c.h <= 0) return;
    if (def.bioma === 'aquatico'  && c.h !== 0) return;
    pool.push(c);
  });
  const c = pool.length ? pool[Math.floor(Math.random()*pool.length)] : cells.values().next().value;
  return new THREE.Vector3(cxOf(c.q, c.r), 0, czOf(c.q, c.r));
}

/* ═══════════════════════════════════════════════════════
   Máquina de estados: vagar → procurar comida → comer → ocioso
   ═══════════════════════════════════════════════════════ */
// centro da manada: média da posição dos outros da mesma espécie, sem
// limite de distância (com só 2-3 indivíduos por espécie, "o resto da
// manada" é sempre relevante, não só quem está por perto).
function herdCentroid(d, allDinos){
  let sx = 0, sz = 0, n = 0;
  for (let i = 0; i < allDinos.length; i++){
    const o = allDinos[i];
    if (o === d || o.def.key !== d.def.key) continue;
    sx += o.pos.x; sz += o.pos.z; n++;
  }
  return n ? { x: sx/n, z: sz/n } : null;
}

function pickWanderTarget(d, allDinos){
  const def = d.def;
  if (def.herd){
    const centroid = herdCentroid(d, allDinos);
    if (centroid){
      const dx = centroid.x - d.pos.x, dz = centroid.z - d.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > HERD_RADIUS){
        // longe demais da manada: anda na direção dela em vez de vagar à toa
        const step = Math.min(WANDER_RADIUS, dist - HERD_RADIUS*0.5);
        const nx = d.pos.x + (dx/dist)*step, nz = d.pos.z + (dz/dist)*step;
        if (isLand(nx, nz)) return new THREE.Vector3(nx, 0, nz);
        // ponto direto caiu na água ou fora do mapa: cai pro sorteio normal
      }
    }
  }
  for (let i = 0; i < 8; i++){
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * WANDER_RADIUS;
    const x = d.pos.x + Math.cos(a)*r, z = d.pos.z + Math.sin(a)*r;
    if (def.bioma === 'terrestre' && !isLand(x, z)) continue;
    if (def.bioma === 'aquatico'  && !isWater(x, z)) continue;
    if (def.bioma === 'voador'    && Math.hypot(x, z) > MAP_RADIUS) continue;
    return new THREE.Vector3(x, 0, z);
  }
  return d.pos.clone(); // não achou ponto válido: fica onde está
}

function pickPeakTarget(){
  const peaks = [];
  cells.forEach(function(c){ if (c.h >= PEAK_MIN_LEVEL) peaks.push(c); });
  if (!peaks.length) return null;
  const c = peaks[Math.floor(Math.random()*peaks.length)];
  return new THREE.Vector3(cxOf(c.q, c.r), 0, czOf(c.q, c.r));
}

function pickFoodTarget(d, scatter, allDinos){
  const def = d.def;
  if (def.bioma === 'voador') return pickPeakTarget() || pickWanderTarget(d, allDinos);
  if (!def.food) return pickWanderTarget(d, allDinos); // sem planta alvo: simula forrageio

  let best = null, bestD2 = FOOD_SEARCH_RADIUS * FOOD_SEARCH_RADIUS;
  const spots = scatter.getPositions(def.food);
  for (let i = 0; i < spots.length; i++){
    const p = spots[i];
    const dx = p.x - d.pos.x, dz = p.z - d.pos.z;
    const d2 = dx*dx + dz*dz;
    if (d2 < bestD2){ bestD2 = d2; best = p; }
  }
  return best ? new THREE.Vector3(best.x, 0, best.z) : pickWanderTarget(d, allDinos);
}

function arrived(d){
  if (!d.target) return false;
  return Math.hypot(d.target.x - d.pos.x, d.target.z - d.pos.z) < ARRIVE_EPS;
}

function moveToward(d, dt){
  if (!d.target) return;
  const dx = d.target.x - d.pos.x, dz = d.target.z - d.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return;
  const step = Math.min(dist, d.speed*dt);
  d.pos.x += (dx/dist)*step;
  d.pos.z += (dz/dist)*step;
  d.group.rotation.y = Math.atan2(-dz, dx); // silhuetas olham pro eixo +X local
}

function placeDino(d, time){
  const bioma = d.def.bioma;
  let y;
  if (bioma === 'terrestre'){
    y = heightAt(d.pos.x, d.pos.z);
  } else if (bioma === 'aquatico'){
    y = WATER_Y - AQUA_SUBMERGE + Math.sin(time*BOB_SPEED + d.pos.x)*BOB_AMOUNT*0.3;
  } else {
    // voador: sempre no nível de cruzeiro, não segue o relevo — exceto
    // quando "comer" representa ter pousado num pico (nível 8 ou 9,
    // alturas diferentes), aí desce até o topo de verdade daquele lugar
    const landed = d.state === STATE.EAT;
    y = landed
      ? heightAt(d.pos.x, d.pos.z)
      : FLY_Y + Math.sin(time*BOB_SPEED + d.pos.z)*BOB_AMOUNT;
  }
  d.group.position.set(d.pos.x, y, d.pos.z);
}

function animateLegs(d, time){
  if (!d.legs || !d.legs.length) return;
  const moving = d.state === STATE.WANDER || d.state === STATE.SEEK;
  for (let i = 0; i < d.legs.length; i++){
    const leg = d.legs[i];
    leg.pivot.rotation.z = moving
      ? Math.sin(time*LEG_SWING_FREQ*d.speed + leg.phase) * LEG_SWING_AMP
      : 0;
  }
}

function animateWings(d, time){
  if (!d.wings || !d.wings.length) return;
  const landed = d.state === STATE.EAT; // pousado num pico: asas dobradas, paradas
  const angle = landed ? 0 : Math.sin(time*WING_FLAP_FREQ) * WING_FLAP_AMP;
  for (let i = 0; i < d.wings.length; i++){
    d.wings[i].pivot.rotation.x = d.wings[i].signX * angle;
  }
}

function animateTail(d, time){
  if (!d.tail) return;
  const swimming = d.state === STATE.WANDER || d.state === STATE.SEEK;
  d.tail.rotation.y = swimming ? Math.sin(time*TAIL_SWAY_FREQ*d.speed) * TAIL_SWAY_AMP : 0;
}

// ao acabar de comer, num bicho terrestre, chance de deixar um ninho ali —
// só em terreno bom (mesma faixa de altura em que a vegetação cresce)
function maybeLayNest(d, time, nests){
  if (!nests || d.def.bioma !== 'terrestre') return;
  if (Math.random() > NEST_CHANCE) return;
  const y = heightAt(d.pos.x, d.pos.z);
  if (y < 0.30 || y > 3.2) return;
  nests.layNest(d.pos.x, d.pos.z, time);
}

function stepDino(d, dt, time, scatter, allDinos, nests){
  switch (d.state){
    case STATE.WANDER:
      if (!d.target) d.target = pickWanderTarget(d, allDinos);
      moveToward(d, dt);
      if (arrived(d)){ d.target = null; d.state = STATE.SEEK; }
      break;
    case STATE.SEEK:
      if (!d.target) d.target = pickFoodTarget(d, scatter, allDinos);
      moveToward(d, dt);
      if (arrived(d)){ d.target = null; d.state = STATE.EAT; d.timer = EAT_DURATION; }
      break;
    case STATE.EAT:
      d.timer -= dt;
      if (d.timer <= 0){
        maybeLayNest(d, time, nests);
        d.state = STATE.IDLE; d.timer = randRange(IDLE_MIN, IDLE_MAX);
      }
      break;
    case STATE.IDLE:
      d.timer -= dt;
      if (d.timer <= 0) d.state = STATE.WANDER;
      break;
  }
  placeDino(d, time);
  animateLegs(d, time);
  animateWings(d, time);
  animateTail(d, time);
}

/* ═══════════════════════════════════════════════════════
   Sistema
   ═══════════════════════════════════════════════════════ */
export function createDinoSystem(scene, scatter, renderer, nests, lowEnd){
  const dinos = [];
  // modo PC Jurássico: metade dos bichos por espécie (mínimo 1) — menos
  // draw calls e menos animação procedural de perna por frame
  function speciesCount(def){
    return lowEnd ? Math.max(1, Math.ceil(def.count / 2)) : def.count;
  }

  function spawnOne(def){
    const baseColor = jitterColor(def.color);
    const mat = createDinoMaterial(renderer, baseColor);
    const bellyMat = createDinoMaterial(renderer, lighten(baseColor, BELLY_LIGHTEN));
    const built = BUILDERS[def.key](mat, bellyMat);
    const size = randRange(def.sizeMin, def.sizeMax);
    built.group.scale.setScalar(size);
    scene.add(built.group);
    dinos.push({
      def: def, group: built.group, legs: built.legs, wings: built.wings, tail: built.tail, size: size,
      speed: randRange(def.speedMin, def.speedMax),
      pos: randomStart(def), target: null,
      state: STATE.WANDER, timer: 0
    });
  }
  function spawnSpecies(def){
    for (let i = 0; i < speciesCount(def); i++) spawnOne(def);
  }
  function removeSpecies(key){
    for (let i = dinos.length - 1; i >= 0; i--){
      if (dinos[i].def.key !== key) continue;
      scene.remove(dinos[i].group);
      dinos.splice(i, 1);
    }
  }

  // ninguém nasce sozinho mais — só o pterossauro (por pico) e o resto
  // (por fóssil desenterrado, ver unlockSpecies() abaixo)
  const NON_FLYING = SPECIES.filter(function(s){ return s.bioma !== 'voador'; });
  const unlocked = new Set();

  function hasLockedSpecies(){ return unlocked.size < NON_FLYING.length; }
  function pickLockedSpecies(){
    const pool = NON_FLYING.filter(function(s){ return !unlocked.has(s.key); });
    return pool.length ? pool[Math.floor(Math.random()*pool.length)].key : null;
  }
  function unlockSpecies(key){
    if (!key || unlocked.has(key)) return null;
    const def = NON_FLYING.find(function(s){ return s.key === key; });
    if (!def) return null;
    unlocked.add(key);
    spawnSpecies(def);
    return def.label;
  }
  function resetUnlocked(){
    unlocked.forEach(function(key){ removeSpecies(key); });
    unlocked.clear();
  }

  // o voador só existe enquanto houver pelo menos uma montanha nível 8+ —
  // como isso normalmente só acontece quando o jogador constrói um vulcão,
  // reavaliamos a cada rebuild() (chamado de main.js), não só na criação.
  // Não passa pelo esquema de fóssil acima — sem relação com `unlocked`.
  let flying = false;
  function syncFlyers(){
    const can = hasPeak();
    if (can === flying) return;
    flying = can;
    const def = SPECIES.find(function(s){ return s.bioma === 'voador'; });
    if (flying) spawnSpecies(def); else removeSpecies(def.key);
  }
  syncFlyers();

  function update(dt, time){
    for (let i = 0; i < dinos.length; i++) stepDino(dinos[i], dt, time, scatter, dinos, nests);
  }

  // chaves de todas as espécies visíveis agora — fósseis desenterrados +
  // pterossauro se estiver voando. Usado pelos cards de objetivo no HUD.
  function getDiscovered(){
    const out = Array.from(unlocked);
    if (flying) out.push('pterossauro');
    return out;
  }

  return {
    update, onTerrainChanged: syncFlyers,
    hasLockedSpecies, pickLockedSpecies, unlockSpecies, resetUnlocked, getDiscovered
  };
}
