import * as THREE from 'three';
import { makeRockTexture } from './rockTexture.js';

// Textura de pele: mesma técnica triplanar da rocha do terreno, mas
// projetada no espaço LOCAL do bicho (não no mundo) — se fosse no mundo,
// a pele "escorregaria" por cima do corpo enquanto ele anda, porque a
// posição no mundo muda a cada passo.
let skinTex = null;

function applySkinDetail(material){
  material.onBeforeCompile = function(shader){
    shader.uniforms.uSkinTex = { value: skinTex };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec3 vSkinPos;',
        'varying vec3 vSkinNrm;'
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vSkinPos = transformed;',
        'vSkinNrm = normalize(objectNormal);'
      ].join('\n'));

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform sampler2D uSkinTex;',
        'varying vec3 vSkinPos;',
        'varying vec3 vSkinNrm;'
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'vec3 bn = abs(normalize(vSkinNrm));',
        'bn = pow(bn, vec3(4.0));',
        'bn /= max(bn.x + bn.y + bn.z, 0.0001);',
        'float t1 = texture2D(uSkinTex, vSkinPos.zy*3.0).r*bn.x + texture2D(uSkinTex, vSkinPos.xz*3.0).r*bn.y + texture2D(uSkinTex, vSkinPos.xy*3.0).r*bn.z;',
        'float t2 = texture2D(uSkinTex, vSkinPos.zy*11.0).r*bn.x + texture2D(uSkinTex, vSkinPos.xz*11.0).r*bn.y + texture2D(uSkinTex, vSkinPos.xy*11.0).r*bn.z;',
        'float sk = (t1 - 0.5)*0.5 + (t2 - 0.5)*0.35;',
        'diffuseColor.rgb *= 1.0 + sk*0.35;'
      ].join('\n'));
  };
}

export function createDinoMaterial(renderer, color){
  if (!skinTex) skinTex = makeRockTexture(renderer, 128);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color[0], color[1], color[2]),
    flatShading:true, roughness:0.85, metalness:0.05
  });
  applySkinDetail(material);
  return material;
}
