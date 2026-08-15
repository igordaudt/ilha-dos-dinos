export function createHud({ onNewIsland, onClear, onToggleVeg, onToggleSun, onToggleSound, onToggleDig, onToggleFullscreen, onToggleNight, shadowsOn, jurassic, onToggleJurassic, pangea, onTogglePangea, objectives }){
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
    bMode.querySelector('.txt').textContent = digging ? 'escavar' : 'subir';
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

  // popup com "OK" pra garantir que a criança viu — usado pro aviso
  // inicial, descoberta de dino, e (com imagem) pro clique num card de
  // objetivo. Fila simples: se chegar uma mensagem nova enquanto outra
  // ainda está na tela, ela só aparece depois que a atual for fechada,
  // nenhuma se perde.
  const elModal = document.getElementById('modal');
  const elModalImg = document.getElementById('modal-img');
  const elModalText = document.getElementById('modal-text');
  const elModalOk = document.getElementById('modal-ok');
  const elObjectives = document.getElementById('objectives');
  const modalQueue = [];
  function showNextModal(){
    if (!modalQueue.length){ elModal.classList.remove('show'); elObjectives.classList.remove('point'); return; }
    const item = modalQueue[0];
    elModalText.textContent = item.text;
    if (item.img){ elModalImg.src = item.img; elModalImg.alt = item.alt || ''; elModalImg.hidden = false; }
    else { elModalImg.hidden = true; elModalImg.src = ''; }
    elModal.classList.add('show');
    elObjectives.classList.toggle('point', !!item.point);
  }
  // opts.img: mostra uma imagem maior acima do texto (cards de objetivo).
  // opts.point: enquanto essa mensagem está na tela, os cards de objetivo
  // ficam realçados por cima do fundo escurecido do popup — usado só na
  // mensagem de boas-vindas, pra deixar claro que é deles que ela fala.
  function showModal(text, opts){
    opts = opts || {};
    modalQueue.push({ text: text, img: opts.img, alt: opts.alt, point: !!opts.point });
    if (modalQueue.length === 1) showNextModal();
  }
  elModalOk.addEventListener('click', function(){
    modalQueue.shift();
    showNextModal();
  });
  function showDiscovery(name, moreToFind){
    let msg = '🦴 Parabéns! Você descobriu o ' + name + '!';
    if (moreToFind) msg += ' Continue procurando outros dinos!';
    showModal(msg);
  }

  // cards de objetivo — um por dino (miniatura do modelo 3D de verdade) +
  // o vulcão (ver render/dinoThumbnails.js e render/volcanoThumbnail.js).
  // Ganham um selo verde quando a meta é atingida; o quadrado em si nunca
  // muda, só o selo aparece/some, então dá pra ver de cara o que falta.
  // Clicar em qualquer card (feito ou não) mostra a imagem maior e a
  // instrução de como atingir aquela meta.
  const cardEls = {};
  objectives.forEach(function(o){
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'obj-card';
    card.title = o.label;
    const img = document.createElement('img');
    img.src = o.img || '';
    img.alt = o.label;
    card.appendChild(img);
    const check = document.createElement('span');
    check.className = 'obj-check';
    check.textContent = '✓';
    card.appendChild(check);
    card.addEventListener('click', function(){
      const done = card.classList.contains('done');
      const text = done
        ? '✅ ' + o.label + (o.key === 'vulcao' ? ' formado! Continue de olho na lava escorrendo.' : ' encontrado! Ele já vive na ilha.')
        : '🔍 ' + o.label + ': ' + o.howTo;
      showModal(text, { img: o.img, alt: o.label });
    });
    elObjectives.appendChild(card);
    cardEls[o.key] = card;
  });
  function updateDiscovered(keys){
    const found = new Set(keys);
    objectives.forEach(function(o){
      const card = cardEls[o.key];
      if (card) card.classList.toggle('done', found.has(o.key));
    });
  }

  return { setStats, removeBoot, showModal, showDiscovery, updateDiscovered };
}
