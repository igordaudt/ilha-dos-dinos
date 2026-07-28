// Grade hexagonal com cantos deslocados por ruído. O deslocamento é função
// da posição ORIGINAL do canto, para que as 3 células vizinhas concordem.

// "Mapa Pangeia": raio maior + geração com o contorno aproximado da Pangeia
// em vez de aleatória. O tamanho do grid é decidido na carga do módulo (a
// grade é montada logo abaixo), então a preferência fica salva e só entra
// em vigor com reload — mesmo padrão do Modo PC Jurássico em main.js.
const PANGEA_KEY = 'ilhaDosDinos:pangea';
let pangeaModeOn = false;
try { pangeaModeOn = localStorage.getItem(PANGEA_KEY) === '1'; } catch (e) {}
export const PANGEA_MODE = pangeaModeOn;

export const SQ3    = Math.sqrt(3);
export const SIZE   = 1;
export const STEP   = 0.5;
export const MAXH   = 9;
export const GRID_R = pangeaModeOn ? 13 : 9;
export const BOTTOM = -0.7;
export const WATER_Y = 0.03;
export const JITTER = 0.26;
export const TESS   = 3;     // subdivisões por triângulo grosseiro
export const ROUND  = 0.85;  // 0 = facetado, 1 = curvatura PN cheia

export const DIRS = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
export const CORNER = [];
for (let i = 0; i < 6; i++){
  const a = Math.PI/180 * (60*i - 30);
  CORNER.push([SIZE*Math.cos(a), SIZE*Math.sin(a)]);
}

export const kcell = (q,r) => q + ',' + r;
export const cxOf  = (q,r) => SQ3*SIZE*(q + r/2);
export const czOf  = (q,r) => 1.5*SIZE*r;
export const kcorn = (x,z) => Math.round(x*1000) + '|' + Math.round(z*1000);

export function hash(a, b){
  const n = Math.sin(a*127.1 + b*311.7) * 43758.5453;
  return n - Math.floor(n);
}
export function rng(seed){
  let s = (seed >>> 0) || 1;
  return function(){ s = (s*1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function smooth(e0, e1, x){
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return t*t*(3 - 2*t);
}
export function clamp01(v){ return v < 0 ? 0 : (v > 1 ? 1 : v); }

export function worldToHex(x, z){
  const fq = (SQ3/3*x - z/3) / SIZE;
  const fr = (2/3*z) / SIZE;
  const Y = -fq - fr;
  let rx = Math.round(fq), ry = Math.round(Y), rz = Math.round(fr);
  const dx = Math.abs(rx-fq), dy = Math.abs(ry-Y), dz = Math.abs(rz-fr);
  if (dx > dy && dx > dz)      rx = -ry - rz;
  else if (dy > dz)            ry = -rx - rz;
  else                         rz = -rx - ry;
  return [rx, rz];
}

export const cells = new Map();
for (let q = -GRID_R; q <= GRID_R; q++){
  const r1 = Math.max(-GRID_R, -q-GRID_R), r2 = Math.min(GRID_R, -q+GRID_R);
  for (let r = r1; r <= r2; r++){
    cells.set(kcell(q,r), {
      q:q, r:r, h:0, seed:(q+512)*7919 + (r+512)*104729,
      cor:null, mid:null, volcano:false, scorch:0, fossilStage:0,
      caveDir:-1 // -1 = ainda não avaliado, -2 = avaliado e não rolou, 0-5 = tem caverna nessa direção
    });
  }
}

const cornerXZ = new Map();
export function cornerAt(bx, bz){
  const k = kcorn(bx, bz);
  let e = cornerXZ.get(k);
  if (!e){
    const a = hash(bx*3.71, bz*5.13) * Math.PI * 2;
    const d = hash(bx*7.33 + 11, bz*2.91 - 4) * JITTER;
    e = { k:k, x: bx + Math.cos(a)*d, z: bz + Math.sin(a)*d };
    cornerXZ.set(k, e);
  }
  return e;
}
cells.forEach(function(c){
  const x0 = cxOf(c.q,c.r), z0 = czOf(c.q,c.r);
  for (let i = 0; i < 6; i++) cornerAt(x0 + CORNER[i][0], z0 + CORNER[i][1]);
});

export function newIsland(){
  const s = Math.floor(Math.random()*997);
  cells.forEach(function(c){
    const d  = (Math.abs(c.q) + Math.abs(c.q+c.r) + Math.abs(c.r)) / 2;
    const n1 = hash(c.q + s, c.r - s);
    const n2 = hash(c.q*3 + 7 + s, c.r*3 - 5 - s);
    c.h = Math.max(0, Math.min(MAXH, Math.round(4.4 - d*0.55 + (n1-0.5)*2.7 + (n2-0.5)*1.6)));
    c.fossilStage = 0; // ilha nova, fósseis pra descobrir de novo
    c.caveDir = -1;    // e paredões novos pra talvez esconder uma caverna
  });
}

// Contorno grosseiro da Pangeia (coordenadas normalizadas, ~-1..1), só a
// silhueta reconhecível — o "C" com a baía do mar de Tétis mordendo o lado
// leste. Não é geografia de verdade, é só pra ser divertido de reconhecer.
const PANGEA_POLY = [
  [ 0.05, -0.95], [ 0.32, -0.86], [ 0.50, -0.60],
  [ 0.40, -0.28], [ 0.62, -0.10], [ 0.78,  0.12],
  [ 0.52,  0.30], [ 0.28,  0.22], [ 0.16,  0.48],
  [ 0.00,  0.80], [-0.30,  0.92], [-0.56,  0.66],
  [-0.68,  0.30], [-0.54, -0.02], [-0.66, -0.36],
  [-0.46, -0.70], [-0.20, -0.90]
];
function pointInPoly(x, z, poly){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
function distToSeg(x, z, ax, az, bx, bz){
  const dx = bx-ax, dz = bz-az;
  const len2 = dx*dx + dz*dz;
  let t = len2 > 1e-9 ? ((x-ax)*dx + (z-az)*dz) / len2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return Math.hypot(x - (ax+dx*t), z - (az+dz*t));
}
// distância (em unidades normalizadas) até a borda do contorno — positiva
// dentro da Pangeia, negativa fora, igual em espírito ao "-d*0.55" que
// newIsland() usa com a distância radial do centro
function pangeaSignedDist(x, z){
  let d = Infinity;
  for (let i = 0, j = PANGEA_POLY.length - 1; i < PANGEA_POLY.length; j = i++){
    d = Math.min(d, distToSeg(x, z, PANGEA_POLY[j][0], PANGEA_POLY[j][1], PANGEA_POLY[i][0], PANGEA_POLY[i][1]));
  }
  return pointInPoly(x, z, PANGEA_POLY) ? d : -d;
}

export function newPangea(){
  const s = Math.floor(Math.random()*997);
  const R = GRID_R * SQ3 * SIZE; // raio físico do mapa, pra normalizar as coordenadas
  cells.forEach(function(c){
    const x = cxOf(c.q, c.r) / R, z = czOf(c.q, c.r) / R;
    const edge = pangeaSignedDist(x, z) * GRID_R; // ~quantos hexágonos até a beira
    const n1 = hash(c.q + s, c.r - s);
    const n2 = hash(c.q*3 + 7 + s, c.r*3 - 5 - s);
    c.h = Math.max(0, Math.min(MAXH, Math.round(2.6 + edge*0.85 + (n1-0.5)*2.6 + (n2-0.5)*1.5)));
    c.fossilStage = 0;
    c.caveDir = -1;
  });
}
export function clearAll(){ cells.forEach(function(c){ c.h = 0; c.fossilStage = 0; c.caveDir = -1; }); }

export function cellAt(x, z){
  const qr = worldToHex(x, z);
  return cells.get(kcell(qr[0], qr[1])) || null;
}

// Altura aproximada do terreno em (x,z): usa o topo já calculado da célula
// hexagonal mais próxima (c.mid é preenchido por world/mesh.js a cada
// rebuild()). Não tem a precisão dos retalhos PN da malha visual, mas é
// suficiente pra apoiar os pés dos dinos.
export function heightAt(x, z){
  const c = cellAt(x, z);
  return (c && c.mid) ? c.mid.topY : WATER_Y;
}
