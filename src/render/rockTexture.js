import * as THREE from 'three';
import { hash } from '../world/grid.js';

function lattice(n, seed){
  const a = new Float32Array(n*n);
  for (let i = 0; i < n*n; i++) a[i] = hash(i*1.37 + seed, i*0.79 - seed*2);
  return a;
}
function sampleLattice(a, n, u, v){
  const x = u*n, y = v*n;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy);
  const X0 = ((x0 % n) + n) % n, X1 = ((x0+1) % n + n) % n;
  const Y0 = ((y0 % n) + n) % n, Y1 = ((y0+1) % n + n) % n;
  const a0 = a[Y0*n + X0] + (a[Y0*n + X1] - a[Y0*n + X0])*sx;
  const a1 = a[Y1*n + X0] + (a[Y1*n + X1] - a[Y1*n + X0])*sx;
  return a0 + (a1 - a0)*sy;
}

export function makeRockTexture(renderer, size){
  const oct = [[4,0.50,11],[8,0.26,37],[16,0.14,71],[32,0.07,113],[64,0.035,191]];
  const grids = oct.map(function(o){ return { n:o[0], a:o[1], g:lattice(o[0], o[2]) }; });
  const crack = lattice(12, 401);
  let amp = 0;
  for (let i = 0; i < grids.length; i++) amp += grids[i].a;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const dat = img.data;
  for (let y = 0; y < size; y++){
    const v = y/size;
    for (let x = 0; x < size; x++){
      const u = x/size;
      let s = 0;
      for (let k = 0; k < grids.length; k++)
        s += sampleLattice(grids[k].g, grids[k].n, u, v) * grids[k].a;
      s /= amp;
      const rg = 1 - Math.abs(sampleLattice(crack, 12, u, v)*2 - 1);
      s *= 1 - Math.pow(rg, 7)*0.55;
      const val = Math.max(0, Math.min(255, Math.round(s*255)));
      const i = (y*size + x)*4;
      dat[i] = dat[i+1] = dat[i+2] = val; dat[i+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
