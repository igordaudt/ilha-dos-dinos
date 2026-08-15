import * as THREE from 'three';

// Miniatura pro card de objetivo "Vulcão" — mesma técnica do
// dinoThumbnails.js (renderer descartável, snapshot único em PNG), mas o
// vulcão em si não tem um "modelo" reaproveitável (é relevo de terreno,
// não uma silhueta como os dinos), então aqui é um cone simplificado só
// pra ilustrar o card, nas mesmas cores da lava/rocha/basalto do jogo
// (ver render/terrainMaterial.js) — não precisa do renderer principal
// porque não usa a textura triplanar dos dinos/terreno de verdade.
const SIZE = 128;
const ROCK   = [0.520, 0.498, 0.458];
const BASALT = [0.175, 0.155, 0.150];
const LAVA   = [0.97, 0.32, 0.06];

export function makeVolcanoThumbnail(){
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
  const glow = new THREE.PointLight(0xff7a2a, 1.6, 4, 2);
  glow.position.set(0, 1.05, 0.15);
  scene.add(glow);

  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(...ROCK), flatShading: true, shininess: 4 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.15, 8), bodyMat);
  body.position.y = 0.575;
  group.add(body);

  const rimMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(...BASALT), flatShading: true, shininess: 4 });
  const rim = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.22, 8), rimMat);
  rim.position.y = 1.04;
  group.add(rim);

  const lava = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(...LAVA) }));
  lava.rotation.x = -Math.PI/2;
  lava.position.y = 1.10;
  group.add(lava);

  // fumacinha — mesmas esferas baixo-poli do volcano.js, só que estáticas
  const smokeGeo = new THREE.IcosahedronGeometry(0.16, 0);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xc2c7cb, transparent: true, opacity: 0.55 });
  for (const p of [[0.05, 1.32, 0.03], [-0.10, 1.58, -0.06], [0.03, 1.86, 0.09]]){
    const puff = new THREE.Mesh(smokeGeo, smokeMat);
    puff.position.set(p[0], p[1], p[2]);
    puff.scale.setScalar(0.55 + (p[1] - 1.1)*0.3);
    group.add(puff);
  }
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const box = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3(); box.getCenter(center);
  const size3 = new THREE.Vector3(); box.getSize(size3);
  const radius = Math.max(size3.x, size3.y, size3.z, 0.2) * 0.5;
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.15;
  camera.position.set(center.x + dist*0.62, center.y + dist*0.42, center.z + dist*0.72);
  camera.near = Math.max(0.01, dist*0.05);
  camera.far = dist*5;
  camera.updateProjectionMatrix();
  camera.lookAt(center);

  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/png');
  renderer.dispose();
  return url;
}
