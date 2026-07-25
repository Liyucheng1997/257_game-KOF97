// audio.js —— WebAudio 程序化音效与 BGM（不依赖任何外部音频文件）
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.bgmOn = true;
    this.noiseBuf = null;
    this.bgmTimer = null;
    this.step = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = 0.30; this.bgmBus.connect(this.master);

    // 噪声缓冲
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // —— 原语 ——
  noise(dur, freq, q, vol, type = 'bandpass', sweep = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + .02);
  }

  tone(dur, f0, f1, vol, type = 'square', delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + .02);
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'swing':     this.noise(.11, 2400, 1.1, .18, 'bandpass', .25); break;
      case 'hitL':      this.noise(.09, 1700, .7, .5, 'bandpass', .35); this.tone(.07, 320, 90, .18, 'square'); break;
      case 'hitM':      this.noise(.14, 950, .6, .62, 'bandpass', .28); this.tone(.11, 240, 60, .26, 'square'); break;
      case 'hitH':      this.noise(.2, 620, .5, .75, 'lowpass', .2); this.tone(.16, 170, 40, .34, 'sawtooth');
                        this.tone(.09, 900, 200, .16, 'square'); break;
      case 'guard':     this.noise(.09, 4200, 2.5, .3, 'bandpass', .6); this.tone(.06, 1300, 700, .1, 'square'); break;
      case 'fireball':  this.noise(.42, 700, .8, .34, 'bandpass', 2.6); this.tone(.3, 130, 420, .12, 'sawtooth'); break;
      case 'flame':     this.noise(.3, 900, .6, .35, 'bandpass', .35); this.tone(.16, 200, 70, .2, 'sawtooth'); break;
      case 'flameBig':  this.noise(.55, 520, .45, .5, 'lowpass', .3); this.tone(.36, 150, 45, .28, 'sawtooth'); break;
      case 'claw':      this.noise(.16, 3200, 3.2, .34, 'bandpass', .3); break;
      case 'wave':      this.noise(.3, 480, .6, .4, 'lowpass', 1.8); this.tone(.26, 90, 260, .2, 'square'); break;
      case 'jump':      this.noise(.07, 1400, 1.2, .12, 'bandpass', .5); break;
      case 'land':      this.noise(.12, 300, .8, .26, 'lowpass', .5); break;
      case 'dash':      this.noise(.15, 1800, 1.4, .22, 'bandpass', .3); break;
      case 'roll':      this.noise(.22, 800, .8, .24, 'bandpass', .5); break;
      case 'down':      this.noise(.3, 220, .5, .5, 'lowpass', .4); this.tone(.24, 110, 34, .28, 'sawtooth'); break;
      case 'grab':      this.noise(.1, 900, 1.0, .3, 'bandpass', .4); this.tone(.12, 400, 120, .18, 'square'); break;
      case 'burst':
        this.noise(.5, 900, .5, .5, 'bandpass', .25);
        this.tone(.5, 120, 900, .22, 'sawtooth');
        this.tone(.4, 300, 1400, .14, 'square', .04); break;
      case 'super':
        this.tone(.9, 900, 90, .3, 'sawtooth');
        this.tone(.9, 452, 45, .24, 'square', .01);
        this.noise(.85, 1200, .5, .38, 'lowpass', .2); break;
      case 'stock':     this.tone(.1, 880, 1320, .18, 'square'); this.tone(.12, 1320, 1760, .14, 'square', .07); break;
      case 'ko':
        this.tone(1.3, 420, 40, .4, 'sawtooth');
        this.noise(1.1, 800, .4, .45, 'lowpass', .12);
        this.tone(.7, 180, 30, .3, 'square', .06); break;
      case 'round':
        this.tone(.16, 660, 660, .22, 'square');
        this.tone(.16, 880, 880, .2, 'square', .16);
        this.tone(.34, 1320, 1320, .24, 'square', .32); break;
      case 'select':    this.tone(.07, 1200, 1600, .18, 'square'); break;
      case 'cursor':    this.tone(.05, 700, 900, .12, 'square'); break;
    }
  }

  hitByPower(p) { this.play(p >= 2 ? 'hitH' : (p >= 1 ? 'hitM' : 'hitL')); }

  // ═══════════ BGM ═══════════
  // 简易 8-bit 摇滚循环（贝斯 + 主旋律 + 鼓）
  startBGM(tempo = 152) {
    if (!this.ctx || this.bgmTimer) return;
    this.step = 0;
    const spb = 60 / tempo / 4;   // 16 分音符
    this.bgmTimer = setInterval(() => this.tick(), spb * 1000);
  }
  stopBGM() { if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; } }

  bgmNote(f, dur, type, vol, det = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.value = f; o.detune.value = det;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .008);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g); g.connect(this.bgmBus);
    o.start(t); o.stop(t + dur + .02);
  }

  tick() {
    if (!this.bgmOn || !this.ctx) return;
    const s = this.step % 64;
    const N = f => 440 * Math.pow(2, f / 12);
    // 小调进行： Am - F - C - G
    const roots = [-3, -8, -1, -6];               // A F C G （相对 A4 的半音）
    const chord = roots[(s >> 4) & 3];
    // 贝斯（八分音符推进）
    if (s % 2 === 0) {
      const pat = [0, 0, 7, 0, 0, 0, 10, 7];
      const n = pat[(s >> 1) % 8];
      this.bgmNote(N(chord - 24 + n), .13, 'square', .16);
    }
    // 鼓
    if (s % 8 === 0) this.noise(.1, 140, .6, .3, 'lowpass', .3);        // kick
    if (s % 8 === 4) this.noise(.11, 1600, .8, .22, 'bandpass', .4);    // snare
    if (s % 2 === 0) this.noise(.03, 7000, 1.2, .07, 'highpass', 1);    // hat
    // 主旋律
    const mel = [
      0, null, 3, null, 5, null, 7, null, 5, null, 3, null, 0, null, null, null,
      -2, null, 0, null, 3, null, 5, null, 3, null, 0, null, -2, null, null, null,
      7, null, 5, null, 3, null, 0, null, 3, null, 5, null, 7, null, 10, null,
      12, null, 10, null, 7, null, 5, null, 3, null, 0, null, null, null, null, null,
    ];
    const m = mel[s];
    if (m !== null && m !== undefined) {
      this.bgmNote(N(-3 + m), .17, 'square', .09);
      this.bgmNote(N(-3 + m), .17, 'sawtooth', .04, 8);
    }
    this.step++;
  }
}
