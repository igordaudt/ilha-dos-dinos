// Sons sintetizados via Web Audio — nada de arquivo, no mesmo espírito do
// resto do jogo (tudo gerado). O contexto só pode ser criado depois de um
// gesto do usuário (política de autoplay dos navegadores), por isso o
// unlock() precisa ser chamado dentro de um handler de clique.
const MASTER_VOLUME = 0.5;

const CLICK  = { freq:520, freqEnd:640, duration:0.08, type:'sine', gain:0.22 };
const RAISE  = { freq:260, freqEnd:460, duration:0.12, type:'triangle', gain:0.28 };
const DIG    = { filterFreq:220, duration:0.16, gain:0.32 };
const CHIME_NOTES    = [523.25, 659.25, 783.99]; // dó-mi-sol: "achei!"
const CHIME_GAP      = 0.09;
const CHIME_DURATION = 0.18;
const CHIME_GAIN     = 0.24;
const RUMBLE_FILTER_FREQ = 120;
const RUMBLE_GAIN        = 0.12;
const RUMBLE_RAMP        = 0.4;

export function createAudioSystem(){
  let ctx = null, masterGain = null, muted = false, noiseBuffer = null;
  let rumbleSrc = null, rumbleGain = null, rumbleOn = false;

  function ensureContext(){
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // navegador sem Web Audio: fica em silêncio, sem quebrar nada
    ctx = new Ctx();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
    masterGain.connect(ctx.destination);
  }

  function unlock(){
    const hadCtx = !!ctx;
    ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!hadCtx) setVolcanoRumble(rumbleOn); // aplica rumor pendente, se um vulcão já existia
  }

  function setMuted(m){
    muted = m;
    if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.05);
  }
  function isMuted(){ return muted; }

  function getNoiseBuffer(){
    if (noiseBuffer) return noiseBuffer;
    const len = ctx.sampleRate; // 1s de ruído branco, reaproveitado
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random()*2 - 1;
    return noiseBuffer;
  }

  function blip(o, delay){
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
    osc.connect(g); g.connect(masterGain);
    osc.start(t0); osc.stop(t0 + o.duration + 0.02);
  }

  function noiseBurst(o){
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(o.filterFreq, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
    src.connect(filter); filter.connect(g); g.connect(masterGain);
    src.start(t0); src.stop(t0 + o.duration + 0.02);
  }

  function playClick(){ blip(CLICK); }
  function playRaise(){ blip(RAISE); }
  function playDig(){ noiseBurst(DIG); }
  function playFossil(){
    for (let i = 0; i < CHIME_NOTES.length; i++){
      blip({ freq:CHIME_NOTES[i], duration:CHIME_DURATION, type:'sine', gain:CHIME_GAIN }, i*CHIME_GAP);
    }
  }

  function ensureRumbleNode(){
    if (rumbleSrc) return;
    rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = getNoiseBuffer();
    rumbleSrc.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = RUMBLE_FILTER_FREQ;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleSrc.connect(filter); filter.connect(rumbleGain); rumbleGain.connect(masterGain);
    rumbleSrc.start();
  }
  function setVolcanoRumble(active){
    rumbleOn = active;
    if (!ctx) return; // sem contexto ainda: unlock() reaplica isso depois
    ensureRumbleNode();
    rumbleGain.gain.setTargetAtTime(active ? RUMBLE_GAIN : 0, ctx.currentTime, RUMBLE_RAMP);
  }

  return { unlock, setMuted, isMuted, playClick, playRaise, playDig, playFossil, setVolcanoRumble };
}
