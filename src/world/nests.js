import * as THREE from 'three';
import { heightAt } from './grid.js';

// Ninhos: aparecem quando um dino terrestre descansa num lugar bom, ficam um
// tempo como enfeite e depois "eclodem" sumindo sozinhos — sem gerar
// população nova (o filhote é pequeno demais pra aparecer, já foi embora).
const NEST_DURATION    = 50; // segundos até sumir (eclodir)
const NEST_MAX         = 6;  // no máximo isso de ninhos ativos ao mesmo tempo
const NEST_MIN_SPACING = 3;  // não bota outro ninho mais perto que isso de um já existente

const mudMat = new THREE.MeshStandardMaterial({ color:0x6b5a3e, flatShading:true, roughness:0.95 });
const eggMat = new THREE.MeshStandardMaterial({ color:0xe8ddb8, flatShading:true, roughness:0.7 });

function buildNestGeo(){
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.10, 9), mudMat);
  mound.position.set(0, 0.05, 0);
  mound.castShadow = true; mound.receiveShadow = true;
  g.add(mound);
  const eggGeo = new THREE.SphereGeometry(0.075, 7, 6);
  const spots = [[0.09, 0.02], [-0.08, 0.06], [-0.02, -0.10], [0.10, -0.09]];
  for (const [ex, ez] of spots){
    const egg = new THREE.Mesh(eggGeo, eggMat);
    egg.scale.set(0.85, 1.05, 0.85);
    egg.position.set(ex, 0.13, ez);
    egg.rotation.y = Math.random()*Math.PI*2;
    egg.castShadow = true; egg.receiveShadow = true;
    g.add(egg);
  }
  return g;
}

export function createNestSystem(scene){
  const nests = []; // { group, x, z, hatchAt }

  function hasNestNear(x, z, radius){
    for (let i = 0; i < nests.length; i++){
      const dx = nests[i].x - x, dz = nests[i].z - z;
      if (dx*dx + dz*dz < radius*radius) return true;
    }
    return false;
  }

  function layNest(x, z, time){
    if (nests.length >= NEST_MAX) return false;
    if (hasNestNear(x, z, NEST_MIN_SPACING)) return false;
    const group = buildNestGeo();
    group.position.set(x, heightAt(x, z), z);
    group.rotation.y = Math.random()*Math.PI*2;
    scene.add(group);
    nests.push({ group:group, x:x, z:z, hatchAt: time + NEST_DURATION });
    return true;
  }

  function update(time){
    for (let i = nests.length - 1; i >= 0; i--){
      const n = nests[i];
      if (time >= n.hatchAt){
        scene.remove(n.group);
        nests.splice(i, 1);
        continue;
      }
      n.group.position.y = heightAt(n.x, n.z); // acompanha o terreno se ele mudar embaixo
    }
  }

  function clear(){
    for (let i = 0; i < nests.length; i++) scene.remove(nests[i].group);
    nests.length = 0;
  }

  return { layNest, update, clear };
}
