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
      cor:null, mid:null, volcano:false, scorch:0, fossilStage:0, region:null,
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
    c.region = null; // sem marca de Pangeia sobrevivendo numa ilha aleatória
    c.fossilStage = 0; // ilha nova, fósseis pra descobrir de novo
    c.caveDir = -1;    // e paredões novos pra talvez esconder uma caverna
  });
}

// Sete "regiões" grosseiras (coordenadas normalizadas, ~-1..1) que juntas
// formam o contorno da Pangeia — o "C" com a baía do mar de Tétis mordendo
// o lado leste, entre a Eurásia e a África/Índia. Não é geografia real, é
// só pra dar uma ideia reconhecível de como era. As bordas entre regiões
// que colidiram (América do Norte↔Eurásia, América do Sul↔África,
// África↔Antártida, África↔Índia, Índia↔Austrália, Antártida↔Austrália)
// ficam desenhadas propositalmente perto uma da outra — é essa proximidade
// que gera a cordilheira, ver inflatePoly() abaixo. A borda entre Eurásia
// e África/Índia fica bem mais afastada, pra manter o golfo de Tétis aberto.
const REGIONS = [
  { name:'northAmerica', poly:[
    [-0.82,-0.90],[-0.45,-0.95],[-0.12,-0.80],[-0.08,-0.55],
    [-0.14,-0.32],[-0.30,-0.16],[-0.55,-0.14],[-0.78,-0.30],[-0.88,-0.60]
  ]},
  { name:'eurasia', poly:[
    [-0.12,-0.85],[0.20,-0.95],[0.55,-0.88],[0.80,-0.65],
    [0.85,-0.35],[0.62,-0.32],[0.35,-0.30],[0.15,-0.40],[-0.02,-0.42],[-0.14,-0.62]
  ]},
  { name:'southAmerica', poly:[
    [-0.80,-0.18],[-0.55,-0.15],[-0.32,0.02],[-0.24,0.28],
    [-0.28,0.55],[-0.42,0.72],[-0.62,0.68],[-0.78,0.45],[-0.85,0.15]
  ]},
  { name:'africa', poly:[
    [-0.24,0.10],[0.05,0.20],[0.28,0.28],[0.32,0.32],
    [0.20,0.48],[-0.02,0.50],[-0.20,0.35],[-0.26,0.20]
  ]},
  { name:'india', poly:[
    [0.28,0.28],[0.48,0.24],[0.58,0.22],[0.52,0.34],[0.36,0.34],[0.26,0.24]
  ]},
  { name:'antarctica', poly:[
    [-0.42,0.48],[-0.10,0.44],[0.20,0.47],[0.38,0.58],
    [0.28,0.80],[-0.02,0.92],[-0.30,0.86],[-0.48,0.68]
  ]},
  { name:'australia', poly:[
    [0.32,0.38],[0.55,0.32],[0.76,0.42],[0.80,0.60],[0.64,0.72],[0.42,0.68],[0.28,0.55]
  ]}
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
// distância (em unidades normalizadas) até a borda de UM polígono —
// positiva dentro dele, negativa fora, igual em espírito ao "-d*0.55" que
// newIsland() usa com a distância radial do centro
function regionSignedDist(x, z, poly){
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    d = Math.min(d, distToSeg(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  }
  return pointInPoly(x, z, poly) ? d : -d;
}
// versão "inflada" de cada região, escalada pra fora a partir do próprio
// centro — onde a versão inflada de duas regiões vizinhas se sobrepõe é
// onde nasce a cordilheira (ver newPangea()). Calculada uma vez só, na
// carga do módulo, porque os polígonos são constantes.
const INFLATE_K = 0.18;
function inflatePoly(poly, k){
  let cx = 0, cz = 0;
  poly.forEach(function(p){ cx += p[0]; cz += p[1]; });
  cx /= poly.length; cz /= poly.length;
  return poly.map(function(p){ return [cx + (p[0]-cx)*(1+k), cz + (p[1]-cz)*(1+k)]; });
}
REGIONS.forEach(function(reg){ reg.inflated = inflatePoly(reg.poly, INFLATE_K); });

// sobreposições incidentais (costas não-relacionadas se tocando de raspão)
// ficam bem menores que sobreposições de verdade (regiões desenhadas perto
// de propósito) — esse limiar separa uma coisa da outra
const RIDGE_MIN = 0.018;

export function newPangea(){
  const s = Math.floor(Math.random()*997);
  const R = GRID_R * SQ3 * SIZE; // raio físico do mapa, pra normalizar as coordenadas
  cells.forEach(function(c){
    const x = cxOf(c.q, c.r) / R, z = czOf(c.q, c.r) / R;

    let ownerIdx = -1, ownerDist = -Infinity;
    let d1 = -Infinity, d2 = -Infinity; // as duas maiores distâncias infladas
    for (let i = 0; i < REGIONS.length; i++){
      const db = regionSignedDist(x, z, REGIONS[i].poly);
      if (db > ownerDist){ ownerDist = db; ownerIdx = i; }
      const di = regionSignedDist(x, z, REGIONS[i].inflated);
      if (di > d1){ d2 = d1; d1 = di; } else if (di > d2){ d2 = di; }
    }
    const ridgeStrength = Math.max(0, Math.min(d1, d2) - RIDGE_MIN);

    const edge = ownerDist * GRID_R;       // ~quantos hexágonos até a beira da região dona
    const ridgeHex = ridgeStrength * GRID_R;
    // a cordilheira só entra em terra que já é "de verdade" (perto o
    // bastante da sua própria região) — sem isso, a sobreposição inflada
    // de duas regiões distantes podia criar uma ponte de terra artificial
    // atravessando um golfo que devia continuar aberto
    const ridgeBoost = ownerDist > -0.15 ? Math.min(3.5, ridgeHex * 1.3) : 0;
    const n1 = hash(c.q + s, c.r - s);
    const n2 = hash(c.q*3 + 7 + s, c.r*3 - 5 - s);
    c.h = Math.max(0, Math.min(MAXH, Math.round(
      2.6 + edge*1.3 + ridgeBoost + (n1-0.5)*2.6 + (n2-0.5)*1.5
    )));
    c.region = ownerDist > 0 ? REGIONS[ownerIdx].name : null; // pronta pro filtro de dinos por região, mais tarde
    c.fossilStage = 0;
    c.caveDir = -1;
  });
}
export function clearAll(){ cells.forEach(function(c){ c.h = 0; c.region = null; c.fossilStage = 0; c.caveDir = -1; }); }

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
