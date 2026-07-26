import * as THREE from 'three';

export function createCameraControls({ canvas, camera, gridR, sq3, size, onTap, onHover }){
  const cam = { theta: Math.PI*0.25, phi: 0.82, dist: 30, target: new THREE.Vector3(0,1,0) };
  function applyCamera(){
    cam.phi  = Math.max(0.16, Math.min(1.40, cam.phi));
    cam.dist = Math.max(6, Math.min(64, cam.dist));
    const s = Math.sin(cam.phi), y = Math.cos(cam.phi);
    camera.position.set(
      cam.target.x + cam.dist*s*Math.cos(cam.theta),
      cam.target.y + cam.dist*y,
      cam.target.z + cam.dist*s*Math.sin(cam.theta));
    camera.lookAt(cam.target);
  }

  const pointers = new Map();
  let moved = 0, pinchDist = 0, pinchMid = null, mode = '';
  function panBy(dx, dy){
    const k = cam.dist * 0.0016;
    const right   = new THREE.Vector3(-Math.sin(cam.theta), 0,  Math.cos(cam.theta));
    const forward = new THREE.Vector3(-Math.cos(cam.theta), 0, -Math.sin(cam.theta));
    cam.target.addScaledVector(right, -dx*k);
    cam.target.addScaledVector(forward, -dy*k);
    const lim = gridR * sq3 * size;
    cam.target.x = Math.max(-lim, Math.min(lim, cam.target.x));
    cam.target.z = Math.max(-lim, Math.min(lim, cam.target.z));
  }
  canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  canvas.addEventListener('pointerdown', function(e){
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x:e.clientX, y:e.clientY, btn:e.button, shift:e.shiftKey });
    moved = 0;
    if (pointers.size === 2){
      const p = Array.from(pointers.values());
      pinchDist = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
      pinchMid  = { x:(p[0].x+p[1].x)/2, y:(p[0].y+p[1].y)/2 };
      mode = 'pinch';
    } else mode = (e.button === 0 && !e.shiftKey) ? 'orbit' : 'pan';
  });
  canvas.addEventListener('pointermove', function(e){
    const p = pointers.get(e.pointerId);
    if (!p){ onHover(e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (mode === 'pinch' && pointers.size === 2){
      const q = Array.from(pointers.values());
      const d = Math.hypot(q[0].x-q[1].x, q[0].y-q[1].y);
      const m = { x:(q[0].x+q[1].x)/2, y:(q[0].y+q[1].y)/2 };
      if (pinchDist > 0) cam.dist *= pinchDist / Math.max(d, 1);
      panBy(m.x - pinchMid.x, m.y - pinchMid.y);
      pinchDist = d; pinchMid = m;
    } else if (mode === 'orbit'){ cam.theta -= dx*0.006; cam.phi -= dy*0.006; }
    else if (mode === 'pan'){ panBy(dx, dy); }
    applyCamera();
  });
  function endPointer(e){
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!p) return;
    if (pointers.size === 0 && moved < 8) onTap(e.clientX, e.clientY, (p.btn === 2 || p.shift) ? -1 : 1);
    if (pointers.size < 2) mode = pointers.size ? 'orbit' : '';
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', function(e){
    e.preventDefault();
    cam.dist *= 1 + Math.sign(e.deltaY)*0.09;
    applyCamera();
  }, { passive:false });

  return { cam, applyCamera };
}
