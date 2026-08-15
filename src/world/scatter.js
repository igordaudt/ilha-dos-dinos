import * as THREE from 'three';
import { hash, clamp01, cells } from './grid.js';

// os limites abaixo foram calibrados pro mapa padrão (271 células); em mapas
// maiores (ex.: Pangeia) escalamos junto, senão a vegetação simplesmente
// some perto das bordas quando o limite estoura, sem erro nem aviso
const CAP_SCALE = cells.size / 271;
function scaleCap(n){ return Math.ceil(n * CAP_SCALE); }

// Vegetação e pedras em InstancedMesh, posições por PRNG semeado em (q,r)
// para não teleportarem quando o terreno muda em outro lugar.
function bake(parts){
  const P = [], C = [];
  for (let p = 0; p < parts.length; p++){
    const part = parts[p];
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    const arr = g.attributes.position.array;
    for (let i = 0; i < arr.length; i += 9){
      const v = 1 + (hash(arr[i]*41.3 + p, arr[i+2]*29.7 - p) - 0.5) * part.jit;
      for (let k = 0; k < 9; k++) P.push(arr[i+k]);
      for (let k = 0; k < 3; k++) C.push(part.col[0]*v, part.col[1]*v, part.col[2]*v);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('color',    new THREE.Float32BufferAttribute(C, 3));
  out.computeVertexNormals();
  return out;
}
function rockGeo(col, jit){
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 3){
    const f = 1 + (hash(p[i]*93.1 + p[i+1]*17.7, p[i+2]*53.3 + p[i+1]*7.9) - 0.5) * 0.72;
    p[i] *= f; p[i+1] *= f*0.78; p[i+2] *= f;
  }
  return bake([{ geo:g, col:col, jit:jit || 0.22 }]);
}
function coniferGeo(){
  const parts = [];
  const t = new THREE.CylinderGeometry(0.042, 0.072, 0.30, 6); t.translate(0, 0.15, 0);
  parts.push({ geo:t, col:[0.40,0.32,0.24], jit:0.16 });
  const tiers = [[0.27,0.36,0.35],[0.215,0.32,0.56],[0.145,0.27,0.75]];
  const greens = [[0.24,0.42,0.24],[0.28,0.47,0.26],[0.32,0.52,0.29]];
  for (let i = 0; i < 3; i++){
    const c = new THREE.ConeGeometry(tiers[i][0], tiers[i][1], 7);
    c.translate(0, tiers[i][2], 0);
    parts.push({ geo:c, col:greens[i], jit:0.22 });
  }
  return bake(parts);
}
// araucária: tronco longo e nu, copa em guarda-chuva — a comida do braquiossauro
function tallTreeGeo(){
  const parts = [];
  const t = new THREE.CylinderGeometry(0.048, 0.105, 1.60, 7); t.translate(0, 0.80, 0);
  parts.push({ geo:t, col:[0.38,0.31,0.24], jit:0.15 });
  for (let i = 0; i < 3; i++){
    const b = new THREE.ConeGeometry(0.035, 0.30, 4);
    b.translate(0, 0.15, 0);
    b.rotateZ(Math.PI*0.42);
    b.rotateY(i*2.1 + 0.5);
    b.translate(0, 1.05 + i*0.14, 0);
    parts.push({ geo:b, col:[0.27,0.44,0.25], jit:0.20 });
  }
  const crown = [[0.46,0.26,1.66],[0.35,0.24,1.85],[0.19,0.22,2.02]];
  const greens = [[0.23,0.41,0.23],[0.27,0.46,0.26],[0.31,0.51,0.29]];
  for (let i = 0; i < 3; i++){
    const c = new THREE.ConeGeometry(crown[i][0], crown[i][1], 9);
    c.translate(0, crown[i][2], 0);
    parts.push({ geo:c, col:greens[i], jit:0.20 });
  }
  return bake(parts);
}
function cycadGeo(){
  const parts = [];
  const t = new THREE.CylinderGeometry(0.055, 0.085, 0.34, 6); t.translate(0, 0.17, 0);
  parts.push({ geo:t, col:[0.36,0.30,0.23], jit:0.16 });
  for (let i = 0; i < 7; i++){
    const f = new THREE.ConeGeometry(0.062, 0.34, 4);
    f.translate(0, 0.17, 0);
    f.rotateZ(Math.PI*0.40);
    f.rotateY(i * Math.PI*2/7 + 0.3);
    f.translate(0, 0.36, 0);
    parts.push({ geo:f, col:[0.30,0.50,0.27], jit:0.24 });
  }
  return bake(parts);
}
function bushGeo(){
  const a = new THREE.IcosahedronGeometry(0.17, 0); a.scale(1, 0.72, 1);
  const b = new THREE.IcosahedronGeometry(0.12, 0); b.scale(1, 0.70, 1); b.translate(0.12, 0.02, 0.07);
  const g = bake([{ geo:a, col:[0.31,0.46,0.26], jit:0.26 },
                  { geo:b, col:[0.35,0.50,0.29], jit:0.26 }]);
  g.translate(0, 0.10, 0);
  return g;
}
function tuftGeo(){
  const parts = [];
  for (let i = 0; i < 4; i++){
    const b = new THREE.ConeGeometry(0.022, 0.17, 3);
    b.translate(0, 0.085, 0);
    b.rotateZ((hash(i*3.1, 7.7) - 0.5) * 0.7);
    b.rotateY(i * Math.PI/2 + 0.4);
    b.translate((hash(i, 2)-0.5)*0.05, 0, (hash(i, 9)-0.5)*0.05);
    parts.push({ geo:b, col:[0.39,0.56,0.27], jit:0.28 });
  }
  return bake(parts);
}
function flowerGeo(col){
  const s = new THREE.CylinderGeometry(0.008, 0.010, 0.11, 3); s.translate(0, 0.055, 0);
  const h = new THREE.IcosahedronGeometry(0.030, 0); h.scale(1, 0.7, 1); h.translate(0, 0.115, 0);
  return bake([{ geo:s, col:[0.36,0.50,0.26], jit:0.14 },
               { geo:h, col:col, jit:0.18 }]);
}
function logGeo(){
  const t = new THREE.CylinderGeometry(0.055, 0.048, 0.52, 6);
  t.rotateZ(Math.PI/2); t.translate(0, 0.05, 0);
  return bake([{ geo:t, col:[0.36,0.29,0.22], jit:0.20 }]);
}
// fóssil, em dois estágios de escavação (1 e 3 — o 3 vem logo depois do 1,
// ver main.js) — cavar mais um nível no mesmo lugar revela o fóssil por
// completo, como se estivéssemos escavando de verdade. Tom osso que não se
// confunde com pedra nem com madeira.

// estágio 1: "alguns ossos" — a descoberta, bem discreta
function fossilGeo1(){
  const parts = [];
  const rib = new THREE.TorusGeometry(0.14, 0.016, 5, 7, Math.PI*0.7);
  rib.rotateX(Math.PI/2); rib.translate(0, 0.02, 0);
  parts.push({ geo:rib, col:[0.85,0.81,0.71], jit:0.12 });
  const shard = new THREE.CylinderGeometry(0.014, 0.018, 0.18, 5);
  shard.rotateZ(Math.PI*0.4);
  shard.translate(0.10, 0.02, -0.10);
  parts.push({ geo:shard, col:[0.82,0.78,0.68], jit:0.14 });
  return bake(parts);
}
// estágio 3: esqueleto completo, desenhado como um estegossauro de propósito
// — placas nas costas e os quatro espinhos na cauda (thagomizo) são as duas
// marcas que dão pra reconhecer de cara qual dinossauro é, mesmo só de osso.
function fossilGeo3(){
  const parts = [];
  const boneA = [0.85,0.81,0.71], boneB = [0.83,0.79,0.69], boneC = [0.88,0.85,0.76];
  const HEAD_X = 0.42, TAIL_X = -0.48;
  function spineY(x){
    const t = clamp01((HEAD_X - x) / (HEAD_X - TAIL_X)); // 0 na cabeça, 1 na cauda
    return 0.03 + Math.sin(t*Math.PI)*0.10; // arco subindo sobre o quadril
  }

  // crânio pequeno e baixo — o estegossauro tinha uma cabecinha desproporcional
  const skull = new THREE.IcosahedronGeometry(0.075, 0);
  skull.scale(1.5, 0.55, 0.8);
  skull.translate(HEAD_X, spineY(HEAD_X) + 0.01, 0);
  parts.push({ geo:skull, col:boneC, jit:0.08 });

  // coluna em arco, seguindo a corcunda sobre o quadril
  const SPINE_N = 7;
  for (let i = 0; i < SPINE_N; i++){
    const x = HEAD_X + (TAIL_X - HEAD_X)*(i/(SPINE_N-1));
    const vert = new THREE.SphereGeometry(0.026, 5, 4);
    vert.translate(x, spineY(x), 0);
    parts.push({ geo:vert, col:boneB, jit:0.10 });
  }

  // costelas, só na metade da frente (onde fica a caixa torácica)
  for (const side of [1, -1]){
    for (let i = 0; i < 3; i++){
      const x = 0.18 - i*0.14;
      const rib = new THREE.TorusGeometry(0.095 - i*0.008, 0.011, 5, 6, Math.PI*0.7);
      rib.rotateX(Math.PI/2);
      rib.rotateY(side*0.2);
      rib.translate(x, spineY(x) - 0.02, side*0.03);
      parts.push({ geo:rib, col:boneA, jit:0.10 });
    }
  }

  // placas nas costas — duas fileiras alternadas, em cima do arco da coluna
  const plateX = [0.22, 0.08, -0.06, -0.20, -0.34];
  for (let i = 0; i < plateX.length; i++){
    const side = (i % 2 === 0) ? 1 : -1;
    const plate = new THREE.ConeGeometry(0.065, 0.16, 4);
    plate.scale(1, 1, 0.32); // achata pra virar uma placa fina, não um cone gordo
    plate.translate(plateX[i], spineY(plateX[i]) + 0.09, side*0.045);
    plate.rotateY(side*0.35);
    parts.push({ geo:plate, col:boneC, jit:0.06 });
  }

  // pernas traseiras mais compridas que as dianteiras — postura arqueada
  const backLeg = new THREE.CylinderGeometry(0.024, 0.030, 0.28, 6);
  backLeg.translate(-0.28, -0.08, 0.14);
  parts.push({ geo:backLeg, col:boneA, jit:0.10 });
  const frontLeg = new THREE.CylinderGeometry(0.018, 0.024, 0.18, 6);
  frontLeg.translate(0.26, -0.06, 0.13);
  parts.push({ geo:frontLeg, col:boneA, jit:0.10 });

  // cauda com os quatro espinhos — a outra marca registrada do bicho
  for (let i = 0; i < 4; i++){
    const side = i < 2 ? 1 : -1;
    const spike = new THREE.ConeGeometry(0.022, 0.16, 5);
    spike.rotateZ(side*Math.PI*0.32);
    spike.rotateY((i % 2)*0.3);
    spike.translate(TAIL_X - 0.05, 0.02, side*0.05);
    parts.push({ geo:spike, col:boneC, jit:0.08 });
  }

  return bake(parts);
}

// boca de caverna: um vazio escuro emoldurado por pedra, encaixado numa
// parede íngreme — decoração colocada na aresta entre dois hexágonos, não
// um espaço navegável de verdade (o terreno aqui é uma superfície contínua,
// não dá pra "cavar" um interior nele). Construída com a face virada pro
// eixo +X local — quem posiciona (world/mesh.js) gira isso pra fora do
// paredão, do jeito que os dinos já viram na direção que andam.
function caveGeo(){
  const parts = [];
  const rockCol = [0.46,0.44,0.41], darkCol = [0.045,0.045,0.05];
  // vazio escuro, achatado e um pouco recuado — a "boca"
  const voidGeo = new THREE.IcosahedronGeometry(0.32, 1);
  voidGeo.scale(0.30, 1.0, 0.85);
  voidGeo.translate(-0.06, 0, 0);
  parts.push({ geo:voidGeo, col:darkCol, jit:0.04 });
  // moldura de pedra em arco ao redor da boca
  const arch = new THREE.TorusGeometry(0.36, 0.11, 6, 10, Math.PI*1.35);
  arch.rotateY(Math.PI/2);
  arch.rotateZ(-Math.PI*0.18);
  parts.push({ geo:arch, col:rockCol, jit:0.18 });
  // blocos caídos na base, tipo entulho de desmoronamento
  const rubble = [[0.10,-0.28,0.20,0.13], [0.16,-0.32,-0.16,0.11], [0.04,-0.34,0.02,0.10]];
  for (let i = 0; i < rubble.length; i++){
    const [rx, ry, rz, rs] = rubble[i];
    const rGeo = new THREE.IcosahedronGeometry(rs, 0);
    rGeo.translate(rx, ry, rz);
    parts.push({ geo:rGeo, col:rockCol, jit:0.26 });
  }
  return bake(parts);
}

const decoMat = new THREE.MeshPhongMaterial({
  vertexColors:true, flatShading:true, shininess:2, specular:0x0a0a0a
});

export function createScatterSystem(scene){
  function makeIM(geo, max, shadow){
    const im = new THREE.InstancedMesh(geo, decoMat, max);
    im.castShadow = !!shadow; im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = 0;
    scene.add(im);
    return im;
  }
  const D = {
    rockA  : makeIM(rockGeo([0.50,0.48,0.45]), scaleCap(1400), true),
    rockB  : makeIM(rockGeo([0.40,0.38,0.35]), scaleCap(1000), true),
    pebble : makeIM(rockGeo([0.80,0.74,0.60], 0.30), scaleCap(900), false),
    shell  : makeIM(rockGeo([0.93,0.88,0.80], 0.34), scaleCap(300), false),
    tall   : makeIM(tallTreeGeo(), scaleCap(260), true),
    conif  : makeIM(coniferGeo(),  scaleCap(700), true),
    cycad  : makeIM(cycadGeo(),    scaleCap(500), true),
    bush   : makeIM(bushGeo(),     scaleCap(900), true),
    log    : makeIM(logGeo(),      scaleCap(220), true),
    tuft   : makeIM(tuftGeo(),    scaleCap(2600), false),
    flowerA: makeIM(flowerGeo([0.94,0.80,0.34]), scaleCap(450), false),
    flowerB: makeIM(flowerGeo([0.88,0.55,0.68]), scaleCap(350), false),
    fossil1: makeIM(fossilGeo1(), scaleCap(40), false),
    fossil3: makeIM(fossilGeo3(), scaleCap(24), false),
    cave   : makeIM(caveGeo(), scaleCap(20), false)
  };
  const DKEYS = Object.keys(D);
  const N = {};
  // posições atuais de cada tipo — os dinos usam pra procurar comida
  // (araucária, arbusto...); refeitas a cada rebuild(), nunca ficam velhas.
  const positions = {};

  const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion();
  const _E = new THREE.Euler(), _V = new THREE.Vector3(), _S = new THREE.Vector3();
  function add(k, x, y, z, sx, sy, sz, ry, tilt){
    const im = D[k], i = N[k];
    if (i >= im.instanceMatrix.count) return;
    _E.set(tilt, ry, tilt*0.7);
    _Q.setFromEuler(_E);
    _V.set(x, y, z); _S.set(sx, sy, sz);
    _M.compose(_V, _Q, _S);
    im.setMatrixAt(i, _M);
    N[k] = i + 1;
    positions[k].push({ x:x, y:y, z:z });
  }
  function beginBuild(){
    for (let i = 0; i < DKEYS.length; i++){
      N[DKEYS[i]] = 0;
      positions[DKEYS[i]] = [];
    }
  }
  function endBuild(){
    for (let i = 0; i < DKEYS.length; i++){
      const k = DKEYS[i];
      D[k].count = N[k];
      D[k].instanceMatrix.needsUpdate = true;
    }
  }
  function getPositions(k){ return positions[k] || []; }

  return { add, beginBuild, endBuild, getPositions };
}
