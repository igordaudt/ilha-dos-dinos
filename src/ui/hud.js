export function createHud({ onNewIsland, onClear, onToggleVeg, onToggleSun, onToggleSound, onToggleDig }){
  const hud = document.getElementById('hud');
  const head = document.getElementById('head');
  head.addEventListener('click', function(){
    const open = hud.classList.toggle('open');
    head.setAttribute('aria-expanded', String(open));
  });
  document.getElementById('btn-new').addEventListener('click', onNewIsland);
  document.getElementById('btn-clear').addEventListener('click', onClear);

  const bVeg = document.getElementById('btn-veg');
  bVeg.addEventListener('click', function(){
    const on = bVeg.getAttribute('aria-pressed') !== 'true';
    bVeg.setAttribute('aria-pressed', String(on));
    onToggleVeg(on);
  });
  const bSun = document.getElementById('btn-sun');
  bSun.addEventListener('click', function(){
    const on = bSun.getAttribute('aria-pressed') !== 'true';
    bSun.setAttribute('aria-pressed', String(on));
    onToggleSun(on);
  });
  const bSound = document.getElementById('btn-sound');
  bSound.addEventListener('click', function(){
    const on = bSound.getAttribute('aria-pressed') !== 'true';
    bSound.setAttribute('aria-pressed', String(on));
    onToggleSound(on);
  });

  const bMode = document.getElementById('btn-mode');
  bMode.addEventListener('click', function(){
    const digging = bMode.getAttribute('aria-pressed') !== 'true';
    bMode.setAttribute('aria-pressed', String(digging));
    bMode.querySelector('.ico').textContent = digging ? '⛏️' : '⛰️';
    bMode.querySelector('.txt').textContent = digging ? 'descer' : 'subir';
    onToggleDig(digging);
  });

  const elN = document.getElementById('n');
  const elP = document.getElementById('p');
  const elVc = document.getElementById('vc');
  function setStats({ n, peak, volcanoCount }){
    elN.textContent = n;
    elP.textContent = peak;
    elVc.textContent = volcanoCount ? ' · vulcões: ' + volcanoCount : '';
  }

  function removeBoot(){
    const boot = document.getElementById('boot');
    if (boot) boot.remove();
  }

  return { setStats, removeBoot };
}
