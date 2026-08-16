// Sons sintetizados via Web Audio, no mesmo espírito do resto do jogo (tudo
// gerado) — e, por cima disso, uma camada opcional de arquivos de verdade em
// public/sfx/ e public/music/. Cada efeito procura primeiro um arquivo com o
// nome certo (ver SFX_FILES/MUSIC_FILE abaixo); se não achar (ainda não foi
// adicionado, ou falhou o download), cai de volta pro som sintetizado — o
// jogo nunca fica mudo por causa de um arquivo que falta. Isso deixa trocar
// qualquer som por um de verdade só de colocar o arquivo na pasta, sem mexer
// em código nenhum.
//
// Dois barramentos independentes — sfxGain (tudo abaixo, cliques/cavar/
// fósseis/vulcão/etc.) e musicGain (só a trilha de fundo) — cada um com seu
// próprio volume e mudo, controlados pelo widget de volume no HUD (ver
// ui/hud.js). A preferência do jogador fica salva no localStorage, pra não
// precisar reajustar toda vez que recarregar a página.
//
// Nomes esperados em public/sfx/ (efeitos curtos, decodificados por inteiro
// na memória pra tocar sem atraso e poder sobrepor instâncias):
//   click.mp3            clique de botão/menu genérico
//   raise.mp3             levantar terra
//   dig.mp3                cavar/afundar terra
//   fossil-found.mp3      achou os primeiros ossos (1ª cavada no sítio)
//   fossil-complete.mp3   fóssil completo, dino desbloqueado (2ª cavada)
//   volcano-boom.mp3      vulcão acabou de se formar (evento único)
//   volcano-rumble.mp3    ronco contínuo em loop enquanto o vulcão existe
//   pterossauro.mp3       pterossauro aparece (montanha alta o suficiente)
//   splash.mp3             uma célula afundou até virar mar
//   celebrate.mp3         todas as metas batidas (toca junto dos fogos)
// E em public/music/:
//   theme.mp3              música de fundo, em loop, o jogo inteiro
//
// O contexto (e o carregamento de tudo isso) só pode começar depois de um
// gesto do usuário (política de autoplay dos navegadores), por isso fica
// tudo pendurado em unlock(), chamado no primeiro clique/toque do jogo.
const DEFAULT_SFX_VOLUME   = 0.5;
const DEFAULT_MUSIC_VOLUME = 0.35; // mais baixa que os efeitos, pra não abafar o resto
const VOL_KEY = 'ilhaDosDinos:volume';

const SFX_DIR = '/sfx/';
const SFX_FILES = {
  click: 'click.mp3',
  raise: 'raise.mp3',
  dig: 'dig.mp3',
  fossilFound: 'fossil-found.mp3',
  fossilComplete: 'fossil-complete.mp3',
  volcanoBoom: 'volcano-boom.mp3',
  volcanoRumble: 'volcano-rumble.mp3',
  pterossauro: 'pterossauro.mp3',
  splash: 'splash.mp3',
  celebrate: 'celebrate.mp3'
};
const MUSIC_FILE = '/music/theme.mp3';

const CLICK  = { freq:520, freqEnd:640, duration:0.08, type:'sine', gain:0.22 };
const RAISE  = { freq:260, freqEnd:460, duration:0.12, type:'triangle', gain:0.28 };
const DIG    = { filterFreq:220, duration:0.16, gain:0.32 };
const BOOM   = { filterFreq:90,  duration:0.5,  gain:0.40 };
const SPLASH = { filterFreq:900, duration:0.18, gain:0.22 };
const WING   = { freq:700, freqEnd:900, duration:0.22, type:'sine', gain:0.18 };
const CHIME_NOTES    = [523.25, 659.25, 783.99]; // dó-mi-sol: "achei!"
const CHIME_GAP      = 0.09;
const CHIME_DURATION = 0.18;
const CHIME_GAIN     = 0.24;
const FANFARE_NOTES  = [523.25, 659.25, 783.99, 1046.50]; // dó-mi-sol-dó: "consegui!"
const RUMBLE_FILTER_FREQ = 120;
const RUMBLE_GAIN        = 0.12;
const RUMBLE_RAMP        = 0.4;

function clamp01(v){ return Math.max(0, Math.min(1, v)); }

function loadVolumePrefs(){
  try {
    const raw = localStorage.getItem(VOL_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return {
      sfxVolume: typeof p.sfxVolume === 'number' ? clamp01(p.sfxVolume) : DEFAULT_SFX_VOLUME,
      musicVolume: typeof p.musicVolume === 'number' ? clamp01(p.musicVolume) : DEFAULT_MUSIC_VOLUME,
      sfxMuted: !!p.sfxMuted,
      musicMuted: !!p.musicMuted
    };
  } catch (e) {
    return { sfxVolume: DEFAULT_SFX_VOLUME, musicVolume: DEFAULT_MUSIC_VOLUME, sfxMuted: false, musicMuted: false };
  }
}

export function createAudioSystem(){
  let ctx = null, sfxGain = null, musicGain = null, noiseBuffer = null;
  let rumbleSrc = null, rumbleGain = null, rumbleOn = false;
  let samples = {}; // key -> AudioBuffer, só as que já carregaram com sucesso
  let musicEl = null, musicStarted = false;
  const vol = loadVolumePrefs();

  function persistVolume(){
    try { localStorage.setItem(VOL_KEY, JSON.stringify(vol)); } catch (e) {}
  }

  function ensureContext(){
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // navegador sem Web Audio: fica em silêncio, sem quebrar nada
    ctx = new Ctx();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = vol.sfxMuted ? 0 : vol.sfxVolume;
    sfxGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = vol.musicMuted ? 0 : vol.musicVolume;
    musicGain.connect(ctx.destination);
  }

  function loadSample(key, filename){
    fetch(SFX_DIR + filename)
      .then(function(res){ return res.ok ? res.arrayBuffer() : Promise.reject(); })
      .then(function(buf){ return ctx.decodeAudioData(buf); })
      .then(function(decoded){ samples[key] = decoded; })
      .catch(function(){}); // arquivo ainda não existe (ou falhou): segue no som sintetizado
  }
  function loadAllSamples(){
    Object.keys(SFX_FILES).forEach(function(key){ loadSample(key, SFX_FILES[key]); });
  }

  function startMusic(){
    if (musicStarted) return;
    musicStarted = true;
    musicEl = new Audio(MUSIC_FILE);
    musicEl.loop = true;
    const src = ctx.createMediaElementSource(musicEl);
    src.connect(musicGain);
    musicEl.play().catch(function(){}); // sem arquivo ainda, ou autoplay bloqueado: sem quebrar nada
  }

  function unlock(){
    const hadCtx = !!ctx;
    ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!hadCtx){
      setVolcanoRumble(rumbleOn); // aplica rumor pendente, se um vulcão já existia
      loadAllSamples();
      startMusic();
    }
  }

  function getVolumePrefs(){
    return { sfxVolume: vol.sfxVolume, musicVolume: vol.musicVolume, sfxMuted: vol.sfxMuted, musicMuted: vol.musicMuted };
  }
  function setSfxVolume(v){
    vol.sfxVolume = clamp01(v);
    persistVolume();
    if (sfxGain && !vol.sfxMuted) sfxGain.gain.setTargetAtTime(vol.sfxVolume, ctx.currentTime, 0.05);
  }
  function setMusicVolume(v){
    vol.musicVolume = clamp01(v);
    persistVolume();
    if (musicGain && !vol.musicMuted) musicGain.gain.setTargetAtTime(vol.musicVolume, ctx.currentTime, 0.05);
  }
  function setSfxMuted(m){
    vol.sfxMuted = !!m;
    persistVolume();
    if (sfxGain) sfxGain.gain.setTargetAtTime(vol.sfxMuted ? 0 : vol.sfxVolume, ctx.currentTime, 0.05);
  }
  function setMusicMuted(m){
    vol.musicMuted = !!m;
    persistVolume();
    if (musicGain) musicGain.gain.setTargetAtTime(vol.musicMuted ? 0 : vol.musicVolume, ctx.currentTime, 0.05);
  }

  function getNoiseBuffer(){
    if (noiseBuffer) return noiseBuffer;
    const len = ctx.sampleRate; // 1s de ruído branco, reaproveitado
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random()*2 - 1;
    return noiseBuffer;
  }

  // toca um arquivo já carregado (se existir) no barramento de efeitos —
  // mesmo volume/mudo dos sons sintetizados, nunca o da música.
  function playSample(key){
    const buf = samples[key];
    if (!buf || !ctx || vol.sfxMuted) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(sfxGain);
    src.start();
    return true;
  }

  function blip(o, delay){
    if (!ctx || vol.sfxMuted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t0); osc.stop(t0 + o.duration + 0.02);
  }

  function noiseBurst(o){
    if (!ctx || vol.sfxMuted) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(o.filterFreq, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
    src.connect(filter); filter.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + o.duration + 0.02);
  }

  function playClick(){ if (!playSample('click')) blip(CLICK); }
  function playRaise(){ if (!playSample('raise')) blip(RAISE); }
  function playDig(){ if (!playSample('dig')) noiseBurst(DIG); }
  function playFossilFound(){
    if (playSample('fossilFound')) return;
    blip({ freq:CHIME_NOTES[0], duration:CHIME_DURATION, type:'sine', gain:CHIME_GAIN });
  }
  function playFossilComplete(){
    if (playSample('fossilComplete')) return;
    for (let i = 0; i < CHIME_NOTES.length; i++){
      blip({ freq:CHIME_NOTES[i], duration:CHIME_DURATION, type:'sine', gain:CHIME_GAIN }, i*CHIME_GAP);
    }
  }
  function playVolcanoBoom(){ if (!playSample('volcanoBoom')) noiseBurst(BOOM); }
  function playPterossauro(){ if (!playSample('pterossauro')) blip(WING); }
  function playSplash(){ if (!playSample('splash')) noiseBurst(SPLASH); }
  function playCelebrate(){
    if (playSample('celebrate')) return;
    for (let i = 0; i < FANFARE_NOTES.length; i++){
      blip({ freq:FANFARE_NOTES[i], duration:0.16, type:'triangle', gain:0.26 }, i*0.1);
    }
  }

  function ensureRumbleNode(){
    if (rumbleSrc) return;
    rumbleSrc = ctx.createBufferSource();
    // se volcano-rumble.mp3 já tiver carregado a tempo, usa ele; senão fica
    // no ruído sintetizado pro resto da sessão (o nó só é criado uma vez —
    // não vale a pena trocar o buffer de um loop já tocando)
    rumbleSrc.buffer = samples.volcanoRumble || getNoiseBuffer();
    rumbleSrc.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = RUMBLE_FILTER_FREQ;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleSrc.connect(filter); filter.connect(rumbleGain); rumbleGain.connect(sfxGain);
    rumbleSrc.start();
  }
  function setVolcanoRumble(active){
    rumbleOn = active;
    if (!ctx) return; // sem contexto ainda: unlock() reaplica isso depois
    ensureRumbleNode();
    rumbleGain.gain.setTargetAtTime(active ? RUMBLE_GAIN : 0, ctx.currentTime, RUMBLE_RAMP);
  }

  return {
    unlock,
    playClick, playRaise, playDig, playFossilFound, playFossilComplete,
    playVolcanoBoom, playPterossauro, playSplash, playCelebrate,
    setVolcanoRumble,
    getVolumePrefs, setSfxVolume, setMusicVolume, setSfxMuted, setMusicMuted
  };
}
