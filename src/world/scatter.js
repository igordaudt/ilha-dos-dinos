import * as THREE from 'three';
import { hash } from './grid.js';

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
// fóssil: achado raro ao cavar — costelas meio enterradas e um crânio,
// num tom osso que não se confunde com pedra nem com madeira
function fossilGeo(){
  const parts = [];
  const rib1 = new THREE.TorusGeometry(0.16, 0.018, 5, 8, Math.PI*0.85);
  rib1.rotateX(Math.PI/2); rib1.translate(0, 0.02, 0.02);
  parts.push({ geo:rib1, col:[0.86,0.82,0.72], jit:0.12 });
  const rib2 = new THREE.TorusGeometry(0.12, 0.015, 5, 7, Math.PI*0.8);
  rib2.rotateX(Math.PI/2); rib2.translate(0.10, 0.015, -0.05);
  parts.push({ geo:rib2, col:[0.84,0.80,0.70], jit:0.12 });
  const skull = new THREE.IcosahedronGeometry(0.09, 0);
  skull.scale(1.3, 0.7, 1.0);
  skull.translate(-0.16, 0.03, 0.04);
  parts.push({ geo:skull, col:[0.88,0.85,0.76], jit:0.10 });
  const shard = new THREE.CylinderGeometry(0.015, 0.02, 0.22, 5);
  shard.rotateZ(Math.PI*0.45);
  shard.translate(0.02, 0.02, -0.14);
  parts.push({ geo:shard, col:[0.82,0.78,0.68], jit:0.14 });
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
    rockA  : makeIM(rockGeo([0.50,0.48,0.45]), 1400, true),
    rockB  : makeIM(rockGeo([0.40,0.38,0.35]), 1000, true),
    pebble : makeIM(rockGeo([0.80,0.74,0.60], 0.30), 900, false),
    shell  : makeIM(rockGeo([0.93,0.88,0.80], 0.34), 300, false),
    tall   : makeIM(tallTreeGeo(), 260, true),
    conif  : makeIM(coniferGeo(),  700, true),
    cycad  : makeIM(cycadGeo(),    500, true),
    bush   : makeIM(bushGeo(),     900, true),
    log    : makeIM(logGeo(),      220, true),
    tuft   : makeIM(tuftGeo(),    2600, false),
    flowerA: makeIM(flowerGeo([0.94,0.80,0.34]), 450, false),
    flowerB: makeIM(flowerGeo([0.88,0.55,0.68]), 350, false),
    fossil : makeIM(fossilGeo(), 60, false)
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
