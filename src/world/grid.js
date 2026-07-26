// Grade hexagonal com cantos deslocados por ruído. O deslocamento é função
// da posição ORIGINAL do canto, para que as 3 células vizinhas concordem.

export const SQ3    = Math.sqrt(3);
export const SIZE   = 1;
export const STEP   = 0.5;
export const MAXH   = 9;
export const GRID_R = 9;
export const BOTTOM = -0.7;
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
      cor:null, mid:null, volcano:false, scorch:0
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
  });
}
export function clearAll(){ cells.forEach(function(c){ c.h = 0; }); }
