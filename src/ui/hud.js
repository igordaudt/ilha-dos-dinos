export function createHud({ onNewIsland, onClear, onToggleVeg, onToggleSun, onToggleSound, onToggleDig, onToggleFullscreen, onToggleNight, shadowsOn, jurassic, onToggleJurassic, pangea, onTogglePangea }){
  const hud = document.getElementById('hud');
  const head = document.getElementById('head');
  const mapMenu = document.getElementById('mapMenu');
  const btnMap = document.getElementById('btn-map');
  // só um dos dois fica aberto por vez — o menu de mapa fica bem embaixo do
  // cabeçalho "Ilha dos Dinos", então os dois abertos ao mesmo tempo fariam
  // o painel principal cobrir o botão do mapa
  function closeMainPanel(){
    hud.classList.remove('open');
    head.setAttribute('aria-expanded', 'false');
  }
  function closeMapMenu(){
    mapMenu.classList.remove('open');
    btnMap.setAttribute('aria-expanded', 'false');
  }
  head.addEventListener('click', function(){
    const open = hud.classList.toggle('open');
    head.setAttribute('aria-expanded', String(open));
    if (open) closeMapMenu();
  });
  btnMap.addEventListener('click', function(){
    const open = mapMenu.classList.toggle('open');
    btnMap.setAttribute('aria-expanded', String(open));
    if (open) closeMainPanel();
  });
  document.getElementById('btn-clear').addEventListener('click', onClear);
  document.getElementById('btn-new').addEventListener('click', function(){
    onNewIsland();
    closeMapMenu();
  });

  const bVeg = document.getElementById('btn-veg');
  bVeg.addEventListener('click', function(){
    const on = bVeg.getAttribute('aria-pressed') !== 'true';
    bVeg.setAttribute('aria-pressed', String(on));
    onToggleVeg(on);
  });
  const bSun = document.getElementById('btn-sun');
  bSun.setAttribute('aria-pressed', String(shadowsOn)); // padrão muda no modo PC Jurássico
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

  const bNight = document.getElementById('btn-night');
  bNight.addEventListener('click', function(){
    const on = bNight.getAttribute('aria-pressed') !== 'true';
    bNight.setAttribute('aria-pressed', String(on));
    onToggleNight(on);
  });

  const bJur = document.getElementById('btn-jurassic');
  const bJurState = bJur.querySelector('.state');
  function paintJurassic(on){
    bJur.setAttribute('aria-pressed', String(on));
    bJurState.textContent = on ? 'ligado' : 'desligado';
  }
  paintJurassic(jurassic);
  bJur.addEventListener('click', function(){
    paintJurassic(bJur.getAttribute('aria-pressed') !== 'true');
    onToggleJurassic(bJur.getAttribute('aria-pressed') === 'true'); // troca antialias/resolução — só entra em vigor depois de recarregar
  });

  const bPangea = document.getElementById('btn-pangea');
  const bPangeaState = bPangea.querySelector('.state');
  function paintPangea(on){
    bPangea.setAttribute('aria-pressed', String(on));
    bPangeaState.textContent = on ? 'ligado' : 'desligado';
  }
  paintPangea(pangea);
  bPangea.addEventListener('click', function(){
    paintPangea(bPangea.getAttribute('aria-pressed') !== 'true');
    onTogglePangea(bPangea.getAttribute('aria-pressed') === 'true'); // muda o raio do mapa — só entra em vigor depois de recarregar
    closeMapMenu();
  });

  const bMode = document.getElementById('btn-mode');
  bMode.addEventListener('click', function(){
    const digging = bMode.getAttribute('aria-pressed') !== 'true';
    bMode.setAttribute('aria-pressed', String(digging));
    bMode.querySelector('.ico').textContent = digging ? '⛏️' : '⛰️';
    bMode.querySelector('.txt').textContent = digging ? 'descer' : 'subir';
    onToggleDig(digging);
  });

  const bFull = document.getElementById('btn-fullscreen');
  const root = document.documentElement;
  const requestFs = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!requestFs){
    bFull.hidden = true; // API não suportada (ex.: iPhone Safari) — sem botão inútil na tela
  } else {
    bFull.addEventListener('click', function(){
      onToggleFullscreen();
      if (document.fullscreenElement || document.webkitFullscreenElement){
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        requestFs.call(root);
      }
    });
    function syncFullscreenBtn(){
      const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      bFull.setAttribute('aria-pressed', String(on));
    }
    document.addEventListener('fullscreenchange', syncFullscreenBtn);
    document.addEventListener('webkitfullscreenchange', syncFullscreenBtn);
  }

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

  const elDiscovery = document.getElementById('discovery');
  let discoveryTimer = null;
  function showDiscovery(name){
    if (discoveryTimer) clearTimeout(discoveryTimer);
    elDiscovery.textContent = 'Parabéns, você descobriu o ' + name + '!';
    elDiscovery.classList.add('show');
    discoveryTimer = setTimeout(function(){ elDiscovery.classList.remove('show'); }, 4000);
  }

  return { setStats, removeBoot, showDiscovery };
}
