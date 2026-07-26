import * as THREE from 'three';

export function createVolcanoSystem(scene, lavaLight){
  let volcanoes = [];
  const lavaGroup = new THREE.Group();
  scene.add(lavaGroup);
  const lavaGeo = new THREE.CircleGeometry(0.66, 16);
  lavaGeo.rotateX(-Math.PI/2);
  const lavaMat = new THREE.MeshBasicMaterial({ color:0xff7a2a });

  const SMOKE_MAX = 96, PUFFS = 12;
  const smoke = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.5, 0),
    new THREE.MeshBasicMaterial({ color:0xc2c7cb, transparent:true, opacity:0.24, depthWrite:false }),
    SMOKE_MAX);
  smoke.frustumCulled = false;
  smoke.count = 0;
  scene.add(smoke);

  const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion();
  const _E = new THREE.Euler(), _V = new THREE.Vector3(), _S = new THREE.Vector3();

  function beginBuild(){ volcanoes = []; }
  function addVolcano(x, y, z){ volcanoes.push({ x:x, y:y, z:z }); }
  function endBuild(){
    while (lavaGroup.children.length) lavaGroup.remove(lavaGroup.children[0]);
    for (let i = 0; i < volcanoes.length; i++){
      const m = new THREE.Mesh(lavaGeo, lavaMat);
      m.position.set(volcanoes[i].x, volcanoes[i].y + 0.12, volcanoes[i].z);
      lavaGroup.add(m);
    }
  }

  function update(time){
    const pulse = 0.5 + 0.5*Math.sin(time*3.1) * 0.5 + 0.25*Math.sin(time*7.7);
    lavaMat.color.setRGB(1.0, 0.36 + pulse*0.22, 0.10 + pulse*0.10);

    if (volcanoes.length){
      lavaLight.position.set(volcanoes[0].x, volcanoes[0].y + 0.5, volcanoes[0].z);
      lavaLight.intensity = 1.5 + pulse*0.7;
    } else lavaLight.intensity = 0;

    let n = 0;
    for (let v = 0; v < volcanoes.length && n < SMOKE_MAX; v++){
      const V = volcanoes[v];
      for (let p = 0; p < PUFFS && n < SMOKE_MAX; p++){
        const ph = (time*0.15 + p/PUFFS + v*0.37) % 1;
        const s = Math.sin(ph*Math.PI) * (0.20 + ph*0.70);
        _E.set(p*1.3, ph*3.0, p*0.7);
        _Q.setFromEuler(_E);
        _V.set(V.x + Math.sin(ph*4.1 + p)*ph*1.0,
               V.y + 0.25 + ph*3.6,
               V.z + Math.cos(ph*3.3 + p*1.7)*ph*1.0);
        _S.set(s, s*0.88, s);
        _M.compose(_V, _Q, _S);
        smoke.setMatrixAt(n++, _M);
      }
    }
    smoke.count = n;
    smoke.instanceMatrix.needsUpdate = true;
  }

  return {
    beginBuild, addVolcano, endBuild, update,
    get count(){ return volcanoes.length; }
  };
}
