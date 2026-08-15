// Comemoração ao bater todas as metas — canvas 2D à parte, sobreposto à
// tela toda, sem nenhuma ligação com a cena three.js (não precisa de
// câmera/oclusão/iluminação, e assim não arrisca nenhum efeito colateral
// no jogo em si). Roda o próprio loop de animação, só enquanto há
// partículas vivas — fica ocioso (sem custo de CPU) o resto do tempo.
//
// Posição calculada direto pela equação do movimento (x0 + v*t, com
// gravidade constante), a partir do tempo real desde o lançamento — não
// por acúmulo de passos por quadro. Isso importa porque em quadros lentos
// (o "PC Jurássico" existe justamente pra tablets fracos) um acúmulo por
// quadro com dt limitado deixaria a animação em câmera lenta em vez de
// simplesmente ter menos quadros; assim ela sempre termina no tempo real
// certo, não importa quantos quadros o navegador conseguiu desenhar.
const GRAVITY = 340; // px/s²
const COLORS = ['#ff5a5a', '#ffd23f', '#5fd97e', '#5fb0ff', '#ff8bd6', '#ffffff'];
const BURST_TIMES = [0, 0.35, 0.7, 1.15, 1.6, 2.1]; // s, relativo ao lançamento
const PARTICLES_PER_BURST = 46;

export function createFireworks(canvas){
  const ctx = canvas.getContext('2d');
  let particles = []; // { x0, y0, vx, vy, spawnT, maxLife, size, color }
  let burstsFired = 0;
  let startMs = null;
  let running = false;

  function fit(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // mesmo teto usado pro renderer principal
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener('resize', fit);

  function spawnBurst(t){
    const w = window.innerWidth, h = window.innerHeight;
    const ox = w * (0.25 + Math.random()*0.5);
    const oy = h * (0.18 + Math.random()*0.28); // sempre na metade de cima da tela
    const mainColor = COLORS[Math.floor(Math.random()*COLORS.length)];
    for (let i = 0; i < PARTICLES_PER_BURST; i++){
      const a = (i / PARTICLES_PER_BURST) * Math.PI*2 + Math.random()*0.3;
      const speed = 90 + Math.random()*140;
      particles.push({
        x0: ox, y0: oy,
        vx: Math.cos(a)*speed, vy: Math.sin(a)*speed,
        spawnT: t, maxLife: 1 + Math.random()*0.5,
        size: 2 + Math.random()*1.6,
        color: Math.random() < 0.25 ? COLORS[Math.floor(Math.random()*COLORS.length)] : mainColor
      });
    }
  }

  function step(ms){
    if (!running) return;
    if (startMs === null) startMs = ms;
    const t = (ms - startMs) * 0.001;

    while (burstsFired < BURST_TIMES.length && t >= BURST_TIMES[burstsFired]){
      spawnBurst(t);
      burstsFired++;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let anyAlive = false;
    for (let i = 0; i < particles.length; i++){
      const p = particles[i];
      const age = t - p.spawnT;
      const life = 1 - age/p.maxLife;
      if (life <= 0) continue;
      anyAlive = true;
      const x = p.x0 + p.vx*age;
      const y = p.y0 + p.vy*age + 0.5*GRAVITY*age*age;
      ctx.globalAlpha = life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!anyAlive && burstsFired >= BURST_TIMES.length){
      running = false;
      particles = [];
      canvas.style.opacity = '0';
      return;
    }
    requestAnimationFrame(step);
  }

  function launch(){
    particles = [];
    burstsFired = 0;
    startMs = null;
    canvas.style.opacity = '1';
    if (!running){
      running = true;
      requestAnimationFrame(step);
    }
  }

  return { launch };
}
