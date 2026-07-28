import * as THREE from 'three';
import { hash, clamp01 } from '../world/grid.js';
import { makeRockTexture } from './rockTexture.js';

// Cor por altitude + inclinação + praia, sempre calculada POR CANTO,
// nunca por célula (senão o padrão hexagonal reaparece como manchas).
const STOPS = [
  [-0.80, [0.70, 0.63, 0.50]],
  [ 0.10, [0.86, 0.79, 0.60]],
  [ 0.52, [0.60, 0.72, 0.45]],
  [ 1.70, [0.42, 0.59, 0.33]],
  [ 2.90, [0.45, 0.53, 0.38]],
  [ 4.10, [0.60, 0.59, 0.54]],
  [ 4.90, [0.93, 0.92, 0.90]],
  [ 9.00, [0.98, 0.98, 0.97]]
];
const ROCK   = [0.520, 0.498, 0.458];
const SAND   = [0.885, 0.815, 0.625];
const BASALT = [0.175, 0.155, 0.150];

export function terrainColor(x, y, z, rock, beach, scorch, out){
  let i = 0;
  while (i < STOPS.length - 2 && y > STOPS[i+1][0]) i++;
  const a = STOPS[i], b = STOPS[i+1];
  let t = (y - a[0]) / (b[0] - a[0]);
  t = clamp01(t); t = t*t*(3 - 2*t);

  let r = a[1][0] + (b[1][0]-a[1][0])*t;
  let g = a[1][1] + (b[1][1]-a[1][1])*t;
  let l = a[1][2] + (b[1][2]-a[1][2])*t;

  r += (ROCK[0]-r)*rock;  g += (ROCK[1]-g)*rock;  l += (ROCK[2]-l)*rock;
  const bf = beach * (1 - rock*0.7);
  r += (SAND[0]-r)*bf;    g += (SAND[1]-g)*bf;    l += (SAND[2]-l)*bf;
  r += (BASALT[0]-r)*scorch; g += (BASALT[1]-g)*scorch; l += (BASALT[2]-l)*scorch;

  const n = hash(x*2.3, z*2.9)*0.62 + hash(x*8.7 + 3, z*7.1 - 5)*0.38;
  const k = 0.92 + n*0.15;
  out[0] = r*k; out[1] = g*k; out[2] = l*k;
}

// Rocha: textura procedural em canvas, projetada triplanar via onBeforeCompile.
// MeshPhongMaterial, não Lambert (Lambert não aceita flatShading).
// lowEnd (modo PC Jurássico) tira a segunda leva de amostras (detalhe fino),
// caindo de 6 pra 3 texture2D por fragmento — o fill-rate é o gargalo em
// GPU de tablet antigo, e a rocha cobre a tela inteira.
export function createTerrainMaterial(renderer, lowEnd){
  const rockTex = makeRockTexture(renderer, 256);
  let tShader = null;

  const material = new THREE.MeshPhongMaterial({
    vertexColors:true, shininess:5, specular:0x141412
  });
  material.onBeforeCompile = function(shader){
    shader.uniforms.uTex  = { value: rockTex };
    shader.uniforms.uTime = { value: 0 };
    tShader = shader;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'attribute float aRock;',
        'varying float vRock;',
        'varying vec3 vWPos;',
        'varying vec3 vWNrm;'
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vRock = aRock;',
        'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        'vWNrm = normalize(mat3(modelMatrix) * objectNormal);'
      ].join('\n'));

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform sampler2D uTex;',
        'uniform float uTime;',
        'varying float vRock;',
        'varying vec3 vWPos;',
        'varying vec3 vWNrm;'
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'vec3 bn = abs(normalize(vWNrm));',
        'bn = pow(bn, vec3(4.0));',
        'bn /= max(bn.x + bn.y + bn.z, 0.0001);',
        'float t1 = texture2D(uTex, vWPos.zy*0.40).r*bn.x + texture2D(uTex, vWPos.xz*0.40).r*bn.y + texture2D(uTex, vWPos.xy*0.40).r*bn.z;',
      ].concat(lowEnd ? [
        'float t2 = t1;', // PC Jurássico: reaproveita a amostra grossa em vez de buscar detalhe fino
        'float d = (t1 - 0.5)*0.74;',
      ] : [
        'float t2 = texture2D(uTex, vWPos.zy*1.75).r*bn.x + texture2D(uTex, vWPos.xz*1.75).r*bn.y + texture2D(uTex, vWPos.xy*1.75).r*bn.z;',
        'float d = (t1 - 0.5)*0.74 + (t2 - 0.5)*0.40;',
      ]).concat([
        'diffuseColor.rgb *= 1.0 + d * mix(0.20, 1.20, vRock);',
        'float strat = sin(vWPos.y*8.5 + t1*6.0)*0.5 + 0.5;',
        'diffuseColor.rgb *= 1.0 - (1.0 - bn.y) * vRock * strat * 0.16;',
        // linha d'água ondulando: duas senoides cruzadas deslocam a cota da espuma
        'float wv = sin(vWPos.x*1.15 + vWPos.z*0.85 + uTime*1.7)*0.5',
        '         + sin(vWPos.x*2.40 - vWPos.z*1.90 + uTime*2.6)*0.5;',
        'float wl = 0.055 + wv*0.030;',
        'float wet = smoothstep(0.34 + wv*0.03, wl - 0.02, vWPos.y) * (1.0 - vRock);',
        'diffuseColor.rgb *= mix(1.0, 0.76, wet);',
        'float foam = smoothstep(0.105, 0.015, abs(vWPos.y - wl))',
        '           * smoothstep(0.32, 0.52, t2 + wv*0.05) * bn.y;',
        'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.98, 0.99), foam*0.68);'
      ]).join('\n'));
  };

  return {
    material: material,
    setTime: function(t){ if (tShader) tShader.uniforms.uTime.value = t; }
  };
}
