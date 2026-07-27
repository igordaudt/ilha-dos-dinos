import * as THREE from 'three';
import {
  cells, DIRS, CORNER, cxOf, czOf, cornerAt, kcell,
  STEP, MAXH, BOTTOM, hash, rng, smooth, clamp01, TESS, ROUND
} from './grid.js';
import { terrainColor } from '../render/terrainMaterial.js';

const CAVE_MIN_DIFF = 7;    // diferença mínima de altura entre os dois lados pra virar parede de caverna
const CAVE_CHANCE   = 0.28; // chance de uma aresta íngreme virar caverna — rolada só uma vez

// Superfície curva via triângulos PN. Cada triângulo grosseiro (centro + dois
// cantos) vira um retalho de Bézier cúbico definido pelas normais dos
// vértices. Como a borda do retalho depende só dos dois vértices que ela
// liga, retalhos vizinhos casam exatos.
function ctrlP(Pi, Pj, Ni){
  const w = (Pj[0]-Pi[0])*Ni[0] + (Pj[1]-Pi[1])*Ni[1] + (Pj[2]-Pi[2])*Ni[2];
  return [(2*Pi[0] + Pj[0] - w*Ni[0])/3,
          (2*Pi[1] + Pj[1] - w*Ni[1])/3,
          (2*Pi[2] + Pj[2] - w*Ni[2])/3];
}
function ctrlN(Pi, Pj, Ni, Nj){
  const dx = Pj[0]-Pi[0], dy = Pj[1]-Pi[1], dz = Pj[2]-Pi[2];
  const dd = dx*dx + dy*dy + dz*dz;
  const sx = Ni[0]+Nj[0], sy = Ni[1]+Nj[1], sz = Ni[2]+Nj[2];
  const v = dd > 1e-9 ? 2*(dx*sx + dy*sy + dz*sz)/dd : 0;
  let nx = sx - v*dx, ny = sy - v*dy, nz = sz - v*dz;
  const L = Math.hypot(nx, ny, nz) || 1;
  return [nx/L, ny/L, nz/L];
}

const G = [];
for (let i = 0; i <= TESS; i++){
  G[i] = [];
  for (let j = 0; j <= TESS - i; j++) G[i][j] = { p:[0,0,0], n:[0,0,0], rk:0, bc:0, sc:0 };
}

function evalPatch(P1,P2,P3, N1,N2,N3, A1,A2,A3){
  const b210 = ctrlP(P1,P2,N1), b120 = ctrlP(P2,P1,N2);
  const b021 = ctrlP(P2,P3,N2), b012 = ctrlP(P3,P2,N3);
  const b102 = ctrlP(P3,P1,N3), b201 = ctrlP(P1,P3,N1);
  const b111 = [0,0,0];
  for (let k = 0; k < 3; k++){
    const E = (b210[k]+b120[k]+b021[k]+b012[k]+b102[k]+b201[k])/6;
    const V = (P1[k]+P2[k]+P3[k])/3;
    b111[k] = E + (E - V)/2;
  }
  const n110 = ctrlN(P1,P2,N1,N2), n011 = ctrlN(P2,P3,N2,N3), n101 = ctrlN(P1,P3,N1,N3);

  for (let i = 0; i <= TESS; i++){
    for (let j = 0; j <= TESS - i; j++){
      const u = i/TESS, v = j/TESS, w = 1 - u - v;
      const u2 = u*u, v2 = v*v, w2 = w*w;
      const g = G[i][j];
      for (let k = 0; k < 3; k++){
        const pn = P1[k]*u2*u + P2[k]*v2*v + P3[k]*w2*w
          + 3*(b210[k]*u2*v + b120[k]*u*v2 + b021[k]*v2*w
             + b012[k]*v*w2 + b102[k]*u*w2 + b201[k]*u2*w)
          + 6*b111[k]*u*v*w;
        const lin = P1[k]*u + P2[k]*v + P3[k]*w;
        g.p[k] = lin + (pn - lin)*ROUND;
        g.n[k] = N1[k]*u2 + N2[k]*v2 + N3[k]*w2 + n110[k]*u*v + n011[k]*v*w + n101[k]*u*w;
      }
      const L = Math.hypot(g.n[0], g.n[1], g.n[2]) || 1;
      g.n[0] /= L; g.n[1] /= L; g.n[2] /= L;
      g.rk = A1[0]*u + A2[0]*v + A3[0]*w;
      g.bc = A1[1]*u + A2[1]*v + A3[1]*w;
      g.sc = A1[2]*u + A2[2]*v + A3[2]*w;
    }
  }
}

export function createMeshSystem(scene, terrainMaterial, scatter, volcano){
  let terrain = null, faceCell = [];
  const _c = [0,0,0];
  let POS, COL, NRM, RKA;

  function emitVert(g, topY){
    POS.push(g.p[0], g.p[1], g.p[2]);
    NRM.push(g.n[0], g.n[1], g.n[2]);
    RKA.push(g.rk);
    terrainColor(g.p[0], g.p[1], g.p[2], g.rk, g.bc, g.sc, _c);
    let ao = 1 - 0.30 * Math.min(1, Math.max(0, topY - g.p[1]) / 1.8);
    COL.push(_c[0]*ao, _c[1]*ao, _c[2]*ao);
  }
  function emitFlat(v0, v1, v2, rock, scorch, topY){
    const ax = v1[0]-v0[0], ay = v1[1]-v0[1], az = v1[2]-v0[2];
    const bx = v2[0]-v0[0], by = v2[1]-v0[1], bz = v2[2]-v0[2];
    let nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    const vs = [v0, v1, v2];
    for (let k = 0; k < 3; k++){
      const v = vs[k];
      POS.push(v[0], v[1], v[2]);
      NRM.push(nx, ny, nz);
      RKA.push(rock);
      terrainColor(v[0], v[1], v[2], rock, 0, scorch, _c);
      let ao = 1 - 0.30 * Math.min(1, Math.max(0, topY - v[1]) / 1.8);
      if (v[1] <= BOTTOM + 0.001) ao *= 0.55;
      COL.push(_c[0]*ao, _c[1]*ao, _c[2]*ao);
    }
  }

  function rebuild(showVeg){
    /* vulcões */
    volcano.beginBuild();
    cells.forEach(function(c){
      c.volcano = false;
      if (c.h !== MAXH) return;
      let all = true;
      for (let i = 0; i < 6; i++){
        const nb = cells.get(kcell(c.q + DIRS[i][0], c.r + DIRS[i][1]));
        if (!nb || nb.h !== MAXH){ all = false; break; }
      }
      c.volcano = all;
    });
    cells.forEach(function(c){
      if (c.volcano){ c.scorch = 1; return; }
      c.scorch = 0;
      for (let i = 0; i < 6; i++){
        const nb = cells.get(kcell(c.q + DIRS[i][0], c.r + DIRS[i][1]));
        if (nb && nb.volcano){ c.scorch = 0.55; break; }
      }
    });

    /* cantos: altura, rochosidade, praia, queimado */
    const info = new Map();
    cells.forEach(function(c){
      const x0 = cxOf(c.q,c.r), z0 = czOf(c.q,c.r);
      for (let i = 0; i < 6; i++){
        const e = cornerAt(x0 + CORNER[i][0], z0 + CORNER[i][1]);
        const it = info.get(e.k);
        if (!it) info.set(e.k, { mn:c.h, mx:c.h, n:1, sc:c.scorch, x:e.x, z:e.z });
        else {
          if (c.h < it.mn) it.mn = c.h;
          if (c.h > it.mx) it.mx = c.h;
          if (c.scorch > it.sc) it.sc = c.scorch;
          it.n++;
        }
      }
    });
    const CY = new Map();
    info.forEach(function(it, k){
      const mn = it.n < 3 ? Math.min(it.mn, 0) : it.mn;
      const steep = Math.min(0.92, 0.30 + 0.085*it.mx);
      const spread = (it.mx - mn) * STEP;
      const rock = clamp01(smooth(0.34, 1.15, spread)*0.92 + smooth(3.1, 4.7, it.mx*STEP)*0.45);
      const wob = (hash(it.x*13.1, it.z*7.7) - 0.5) * (0.09 + rock*0.20);
      const beach = (mn === 0) ? smooth(2.6, 0.9, it.mx) : 0;
      CY.set(k, { y:(mn + (it.mx - mn)*steep)*STEP + wob,
                  rock:rock, beach:beach, scorch:it.sc, n:[0,0,0] });
    });

    /* malha grosseira e normais compartilhadas */
    cells.forEach(function(c){
      const x0 = cxOf(c.q,c.r), z0 = czOf(c.q,c.r);
      let mx = 0, mz = 0, lowest = Infinity;
      const cor = [];
      for (let i = 0; i < 6; i++){
        const e = cornerAt(x0 + CORNER[i][0], z0 + CORNER[i][1]);
        const d = CY.get(e.k);
        cor[i] = { p:[e.x, d.y, e.z], d:d };
        mx += e.x; mz += e.z;
        if (d.y < lowest) lowest = d.y;
      }
      c.cor = cor;
      c.midXZ = [mx/6, mz/6];
      c.lowest = lowest;

      if (c.h <= 0){ c.mid = null; return; }

      let touchesWater = false;
      for (let i = 0; i < 6; i++){
        const nb = cells.get(kcell(c.q + DIRS[i][0], c.r + DIRS[i][1]));
        if (!nb || nb.h === 0){ touchesWater = true; break; }
      }
      let topY = c.h*STEP + (hash(c.q*5.3, c.r*9.1) - 0.5)*0.09;
      if (c.volcano) topY = MAXH*STEP - 0.68;                    // cratera
      const drop = topY - lowest;
      const rock = c.volcano ? 1 :
        clamp01(smooth(0.34, 1.15, drop)*0.92 + smooth(3.1, 4.7, topY)*0.45);
      const beach = touchesWater ? smooth(2.6, 0.9, c.h) : 0;
      c.mid = { p:[mx/6, topY, mz/6], rock:rock, beach:beach, scorch:c.scorch,
                n:[0,0,0], topY:topY, drop:drop, water:touchesWater };

      // normais grosseiras acumuladas por vértice compartilhado
      for (let i = 0; i < 6; i++){
        const a = c.mid.p, b = cor[(i+1)%6].p, d = cor[i].p;
        const ax = b[0]-a[0], ay = b[1]-a[1], az = b[2]-a[2];
        const bx = d[0]-a[0], by = d[1]-a[1], bz = d[2]-a[2];
        const nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx;
        c.mid.n[0]+=nx; c.mid.n[1]+=ny; c.mid.n[2]+=nz;
        cor[(i+1)%6].d.n[0]+=nx; cor[(i+1)%6].d.n[1]+=ny; cor[(i+1)%6].d.n[2]+=nz;
        cor[i].d.n[0]+=nx; cor[i].d.n[1]+=ny; cor[i].d.n[2]+=nz;
      }
    });
    function fix(n){
      const L = Math.hypot(n[0], n[1], n[2]);
      if (L < 1e-9){ n[0]=0; n[1]=1; n[2]=0; } else { n[0]/=L; n[1]/=L; n[2]/=L; }
    }
    CY.forEach(function(d){ fix(d.n); });
    cells.forEach(function(c){ if (c.mid) fix(c.mid.n); });

    /* retalhos curvos, saias e espalhamento */
    POS = []; COL = []; NRM = []; RKA = [];
    faceCell = [];
    scatter.beginBuild();

    cells.forEach(function(c){
      if (!c.mid) return;
      const cor = c.mid, C = c.cor;
      const A1 = [cor.rock, cor.beach, cor.scorch];
      const topY = cor.topY;

      for (let i = 0; i < 6; i++){
        const B = C[(i+1)%6], Dd = C[i];
        evalPatch(cor.p, B.p, Dd.p, cor.n, B.d.n, Dd.d.n,
                  A1, [B.d.rock, B.d.beach, B.d.scorch], [Dd.d.rock, Dd.d.beach, Dd.d.scorch]);
        for (let a = 0; a < TESS; a++){
          for (let b = 0; b < TESS - a; b++){
            emitVert(G[a][b], topY); emitVert(G[a+1][b], topY); emitVert(G[a][b+1], topY);
            faceCell.push(c);
            if (a + b < TESS - 1){
              emitVert(G[a+1][b], topY); emitVert(G[a+1][b+1], topY); emitVert(G[a][b+1], topY);
              faceCell.push(c);
            }
          }
        }
      }

      for (let i = 0; i < 6; i++){
        const nb = cells.get(kcell(c.q + DIRS[i][0], c.r + DIRS[i][1]));
        if (nb && nb.h > 0) continue;
        const a = C[i].p, b = C[(i+1)%6].p;
        const aB = [a[0], BOTTOM, a[2]], bB = [b[0], BOTTOM, b[2]];
        emitFlat(a, bB, aB, 1, cor.scorch, topY); faceCell.push(c);
        emitFlat(a, b,  bB, 1, cor.scorch, topY); faceCell.push(c);
      }

      if (c.volcano) volcano.addVolcano(cor.p[0], topY, cor.p[2]);

      /* ── espalhamento ── */
      const R = rng(c.seed);
      const mid = cor.p, drop = cor.drop;
      function spot(i, t, jx){
        return [mid[0] + (C[i].p[0]-mid[0])*t + (jx ? (R()-0.5)*jx : 0),
                mid[1] + (C[i].p[1]-mid[1])*t,
                mid[2] + (C[i].p[2]-mid[2])*t + (jx ? (R()-0.5)*jx : 0)];
      }
      if (c.fossilStage > 0){
        const p = spot(Math.floor(R()*6), 0.15 + R()*0.5, 0.10);
        const s = 0.75 + R()*0.5;
        scatter.add('fossil' + c.fossilStage, p[0], p[1] - 0.02, p[2], s, s, s, R()*6.28, 0);
      }

      // caverna: paredão íngreme (diferença de altura pro vizinho ≥
      // CAVE_MIN_DIFF, não importa se o lado baixo é água ou terra) sorteia
      // UMA vez se vira caverna; o resultado (sim ou não) fica valendo pra
      // sempre pra essa célula, não sorteia de novo
      if (c.caveDir === -1){
        for (let i = 0; i < 6; i++){
          const nb = cells.get(kcell(c.q + DIRS[i][0], c.r + DIRS[i][1]));
          if (!nb) continue;
          if (c.h - nb.h >= CAVE_MIN_DIFF){
            c.caveDir = (Math.random() < CAVE_CHANCE) ? i : -2;
            break;
          }
        }
      }
      if (c.caveDir >= 0){
        const nb = cells.get(kcell(c.q + DIRS[c.caveDir][0], c.r + DIRS[c.caveDir][1]));
        if (nb){
          const a = C[c.caveDir].p, b = C[(c.caveDir+1)%6].p;
          const ex = (a[0]+b[0])/2, ez = (a[2]+b[2])/2;
          const loY = nb.h*STEP, hiY = topY;
          const ey = loY + (hiY - loY)*0.35; // parte de baixo do paredão, não na crista
          const dx = cxOf(nb.q,nb.r) - cxOf(c.q,c.r), dz = czOf(nb.q,nb.r) - czOf(c.q,c.r);
          const ry = Math.atan2(-dz, dx); // vira a boca pra fora do paredão
          const s = 0.9 + R()*0.5;
          scatter.add('cave', ex, ey, ez, s, s, s, ry, 0);
        }
      }
      if (c.volcano || c.scorch > 0.3){
        for (let j = 0; j < 3; j++){
          if (R() > 0.5) continue;
          const s = 0.12 + R()*0.22;
          const p = spot(Math.floor(R()*6), 0.4 + R()*0.5, 0.12);
          scatter.add('rockB', p[0], p[1] - s*0.25, p[2],
              s*(0.9+R()*0.4), s*(0.7+R()*0.4), s*(0.9+R()*0.4), R()*6.28, (R()-0.5)*0.4);
        }
        return;
      }

      for (let i = 0; i < 6; i++){
        const d = topY - C[i].p[1];
        if (d < 0.32) continue;
        const many = 1 + (d > 1.1 ? 1 : 0);
        for (let j = 0; j < many; j++){
          if (R() > 0.52) continue;
          const s = 0.11 + R()*0.20 + d*0.05;
          const p = spot(i, 0.48 + R()*0.44, 0.12);
          scatter.add(R() > 0.45 ? 'rockA' : 'rockB', p[0], p[1] - s*0.22, p[2],
              s*(0.8+R()*0.5), s*(0.7+R()*0.5), s*(0.8+R()*0.5), R()*6.28, (R()-0.5)*0.5);
        }
      }
      if (topY > 2.6 && R() < 0.34){
        const s = 0.14 + R()*0.22;
        const p = spot(Math.floor(R()*6), R()*0.55, 0);
        scatter.add(R() > 0.5 ? 'rockA' : 'rockB', p[0], p[1] - s*0.25, p[2],
            s*(0.9+R()*0.4), s*(0.7+R()*0.4), s*(0.9+R()*0.4), R()*6.28, (R()-0.5)*0.4);
      }

      const isBeach = cor.beach > 0.55;
      if (isBeach){
        const nP = 2 + Math.floor(R()*4);
        for (let j = 0; j < nP; j++){
          const s = 0.035 + R()*0.055;
          const p = spot(Math.floor(R()*6), R()*0.85, 0.10);
          scatter.add('pebble', p[0], p[1] - s*0.3, p[2], s*1.3, s*0.6, s*1.1, R()*6.28, (R()-0.5)*0.3);
        }
        if (R() < 0.35){
          const s = 0.03 + R()*0.03;
          const p = spot(Math.floor(R()*6), 0.3 + R()*0.5, 0.08);
          scatter.add('shell', p[0], p[1] - s*0.2, p[2], s*1.5, s*0.5, s*1.2, R()*6.28, (R()-0.5)*0.4);
        }
        if (showVeg && R() < 0.16){
          const p = spot(Math.floor(R()*6), 0.15 + R()*0.4, 0);
          const s = 0.85 + R()*0.4;
          scatter.add('cycad', p[0], p[1] - 0.03, p[2], s, s*(0.85+R()*0.3), s, R()*6.28, (R()-0.5)*0.12);
        }
        if (showVeg && R() < 0.30){
          const p = spot(Math.floor(R()*6), 0.2 + R()*0.6, 0.1);
          const s = 0.55 + R()*0.35;
          scatter.add('tuft', p[0], p[1] - 0.02, p[2], s, s*(0.7+R()*0.5), s, R()*6.28, (R()-0.5)*0.2);
        }
      } else if (showVeg && topY > 0.30 && topY < 3.2 && drop < 1.15){
        const lush = 1 - smooth(1.7, 3.2, topY);

        // araucárias: raras, em terreno plano e fértil
        if (drop < 0.75 && topY < 2.4 && R() < 0.13*lush){
          const p = spot(Math.floor(R()*6), 0.05 + R()*0.35, 0);
          const s = 0.85 + R()*0.45;
          scatter.add('tall', p[0], p[1] - 0.04, p[2], s, s*(0.9+R()*0.35), s, R()*6.28, (R()-0.5)*0.05);
        }

        const nT = R() < 0.30*lush ? 2 : (R() < 0.62*lush ? 1 : 0);
        for (let j = 0; j < nT; j++){
          const p = spot(Math.floor(R()*6), 0.10 + R()*0.58, 0);
          const s = 0.80 + R()*0.55;
          const coast = topY < 1.30 && R() < 0.5;
          scatter.add(coast ? 'cycad' : 'conif', p[0], p[1] - 0.03, p[2],
              s, s*(0.88+R()*0.42), s, R()*6.28, (R()-0.5)*0.09);
        }
        const nB = R() < 0.40*lush ? 2 : (R() < 0.68*lush ? 1 : 0);
        for (let j = 0; j < nB; j++){
          const p = spot(Math.floor(R()*6), 0.12 + R()*0.68, 0);
          const s = 0.70 + R()*0.70;
          scatter.add('bush', p[0], p[1] - 0.04, p[2], s, s*(0.8+R()*0.4), s, R()*6.28, (R()-0.5)*0.12);
        }
        const nG = 3 + Math.floor(R()*5*lush);
        for (let j = 0; j < nG; j++){
          const p = spot(Math.floor(R()*6), 0.10 + R()*0.75, 0.14);
          const s = 0.65 + R()*0.60;
          scatter.add('tuft', p[0], p[1] - 0.02, p[2], s, s*(0.7+R()*0.6), s, R()*6.28, (R()-0.5)*0.22);
        }
        const nF = R() < 0.26*lush ? 3 : (R() < 0.5*lush ? 1 : 0);
        for (let j = 0; j < nF; j++){
          const p = spot(Math.floor(R()*6), 0.12 + R()*0.7, 0.12);
          const s = 0.8 + R()*0.6;
          scatter.add(R() > 0.45 ? 'flowerA' : 'flowerB', p[0], p[1] - 0.01, p[2],
              s, s, s, R()*6.28, (R()-0.5)*0.15);
        }
        if (R() < 0.07){
          const p = spot(Math.floor(R()*6), 0.15 + R()*0.4, 0);
          const s = 0.8 + R()*0.5;
          scatter.add('log', p[0], p[1] - 0.01, p[2], s, s, s, R()*6.28, (R()-0.5)*0.10);
        }
      }
    });

    scatter.endBuild();
    volcano.endBuild();

    if (terrain){ scene.remove(terrain); terrain.geometry.dispose(); terrain = null; }
    if (POS.length){
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(POS, 3));
      g.setAttribute('normal',   new THREE.Float32BufferAttribute(NRM, 3));
      g.setAttribute('color',    new THREE.Float32BufferAttribute(COL, 3));
      g.setAttribute('aRock',    new THREE.Float32BufferAttribute(RKA, 1));
      terrain = new THREE.Mesh(g, terrainMaterial);
      terrain.castShadow = true;
      terrain.receiveShadow = true;
      scene.add(terrain);
    }

    let n = 0, peak = 0;
    cells.forEach(function(c){ if (c.h > 0){ n++; if (c.h > peak) peak = c.h; } });
    return { n:n, peak:peak, volcanoCount: volcano.count };
  }

  return {
    rebuild,
    getTerrain: function(){ return terrain; },
    getFaceCell: function(){ return faceCell; }
  };
}
