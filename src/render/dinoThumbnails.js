import * as THREE from 'three';
import { SPECIES, BUILDERS, lighten, BELLY_LIGHTEN } from '../world/dinos.js';
import { createDinoMaterial } from './dinoMaterial.js';

// Miniatura de cada dino pros cards de objetivo do HUD — em vez de um ícone
// genérico, renderiza o MODELO 3D de verdade (a mesma silhueta que anda
// pela ilha) uma vez, num canto escondido, e congela o resultado num PNG.
// Roda uma única vez no início; o renderer temporário é descartado depois.
const SIZE = 128;

export function makeDinoThumbnails(mainRenderer){
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445044, 1.05));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
  sun.position.set(2.2, 3.4, 2.6);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const size3 = new THREE.Vector3();

  const out = {};
  for (const def of SPECIES){
    const key = def.key;
    const mat = createDinoMaterial(mainRenderer, def.color);
    const bellyMat = createDinoMaterial(mainRenderer, lighten(def.color, BELLY_LIGHTEN));
    const built = BUILDERS[key](mat, bellyMat);
    scene.add(built.group);

    box.setFromObject(built.group);
    box.getCenter(center);
    box.getSize(size3);
    const radius = Math.max(size3.x, size3.y, size3.z, 0.2) * 0.5;
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.15;

    camera.position.set(center.x + dist*0.62, center.y + dist*0.55, center.z + dist*0.72);
    camera.near = Math.max(0.01, dist*0.05);
    camera.far = dist*5;
    camera.updateProjectionMatrix();
    camera.lookAt(center);

    renderer.render(scene, camera);
    out[key] = canvas.toDataURL('image/png');

    scene.remove(built.group);
  }

  renderer.dispose();
  return out;
}
