import * as THREE from 'three';

// Além do raio onde dá pra ter terreno começa o "alto-mar": a mesma água,
// só que escurecendo bem devagar até uma cor mais funda — nunca uma borda
// dura, porque não existe uma borda de verdade, é só onde a ilha não alcança.
const SHALLOW_COLOR = 0x74b1dc;
const DEEP_COLOR    = 0x2f6690;

export function createWaterMaterial(nearR, farR){
  const material = new THREE.MeshPhongMaterial({
    color:SHALLOW_COLOR, transparent:true, opacity:0.80, shininess:70, specular:0xa8d6f0
  });
  material.onBeforeCompile = function(shader){
    shader.uniforms.uDeepColor = { value: new THREE.Color(DEEP_COLOR) };
    shader.uniforms.uNearR = { value: nearR };
    shader.uniforms.uFarR  = { value: farR };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec3 vWaterPos;'
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      ].join('\n'));

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform vec3 uDeepColor;',
        'uniform float uNearR;',
        'uniform float uFarR;',
        'varying vec3 vWaterPos;'
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'float distFromCenter = length(vWaterPos.xz);',
        'float deepT = smoothstep(uNearR, uFarR, distFromCenter);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, uDeepColor, deepT);'
      ].join('\n'));
  };
  return material;
}
