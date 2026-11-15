import type { ZoneId } from '../shared/world';

class Soundscape {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  generated: GainNode | null = null;
  filter: BiquadFilterNode | null = null;
  noise: AudioBuffer | null = null;
  music: HTMLAudioElement | null = null;
  musicGain: GainNode | null = null;
  spaMusic: HTMLAudioElement | null = null;
  private spaMusicGain: GainNode | null = null;
  private spaMusicSource: MediaElementAudioSourceNode | null = null;
  private spaMusicRequest = 0;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private musicRequest = 0;
  muted = false; background = true; volume = .35;
  assets: { ambience?: Partial<Record<ZoneId, string>> } = {};
  ambience: HTMLAudioElement | null = null;
  zone: ZoneId = 'courtyard';
  private birdTimer: number | null = null;
  /** False after dusk so chirps stop at night. */
  private birdsOk = true;
  private crackleGain: GainNode | null = null;
  private crackleSource: AudioBufferSourceNode | null = null;

  bindMusic = (element: HTMLAudioElement | null) => {
    if (element === this.music) return;
    this.pauseMusic();
    this.musicSource?.disconnect(); this.musicSource = null;
    this.music = element;
    this.connectMusic();
  };
  bindSpaMusic = (element: HTMLAudioElement | null) => {
    if (element === this.spaMusic) return;
    this.pauseSpaMusic(); this.spaMusicSource?.disconnect(); this.spaMusicSource = null; this.spaMusic = element; this.connectSpaMusic();
  };
  private connectSpaMusic() {
    if (!this.context || !this.spaMusic || !this.spaMusicGain || this.spaMusicSource) return;
    this.spaMusicSource = this.context.createMediaElementSource(this.spaMusic); this.spaMusicSource.connect(this.spaMusicGain);
  }

  private connectMusic() {
    if (!this.context || !this.music || !this.musicGain || this.musicSource) return;
    this.musicSource = this.context.createMediaElementSource(this.music);
    this.musicSource.connect(this.musicGain);
  }

  async unlock() {
    // Clear narration left by a tab running the previous version.
    window.speechSynthesis?.cancel();
    try {
      if (!this.context) {
        this.context = new AudioContext(); this.master = this.context.createGain(); this.master.connect(this.context.destination);
        this.generated = this.context.createGain(); this.generated.connect(this.master);
        this.musicGain = this.context.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.master);
        this.spaMusicGain = this.context.createGain(); this.spaMusicGain.gain.value = 0; this.spaMusicGain.connect(this.master); this.connectSpaMusic();
        this.connectMusic();
        const buffer = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate); const values = buffer.getChannelData(0);
        let brown = 0; for (let i = 0; i < values.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .02) / 1.02; values[i] = brown * 3; }
        this.noise = buffer;
        const source = this.context.createBufferSource(); source.buffer = buffer; source.loop = true;
        this.filter = this.context.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 750;
        const gain = this.context.createGain(); gain.gain.value = .32; source.connect(this.filter); this.filter.connect(gain); gain.connect(this.generated); source.start();
        fetch('/audio/manifest.json').then(r => r.ok ? r.json() : {}).then(json => { this.assets = json; this.setZone(this.zone); }).catch(() => {});
      }
      await this.context.resume(); this.apply(); return this.context.state === 'running';
    } catch { return false; }
  }

  configure(settings: { muted: boolean; background: boolean; volume: number }) { Object.assign(this, settings); this.apply(); this.scheduleBirds(); if (this.zone === 'campfire') this.setCrackle(true); else this.setCrackle(false); }
  apply() {
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted || !this.background ? 0 : this.volume * .45, this.context.currentTime, .3);
    if (this.ambience) this.ambience.volume = this.muted || !this.background ? 0 : this.volume * .4;
  }
  private mixEnvironment() {
    if (this.generated && this.context) this.generated.gain.setTargetAtTime(this.assets.ambience?.[this.zone] ? 0 : this.music && !this.music.paused || this.spaMusic && !this.spaMusic.paused ? .22 : 1, this.context.currentTime, .5);
  }
  private birdZones: ZoneId[] = ['courtyard', 'yoga', 'tea', 'campfire', 'onsen'];
  setDayPart(nightness: number) {
    const next = nightness < .65;
    if (next === this.birdsOk) return;
    this.birdsOk = next;
    this.scheduleBirds();
  }
  private scheduleBirds() {
    if (this.birdTimer) { window.clearTimeout(this.birdTimer); this.birdTimer = null; }
    if (!this.birdsOk || !this.birdZones.includes(this.zone) || this.muted || !this.background) return;
    const wait = 1800 + Math.random() * 5200;
    this.birdTimer = window.setTimeout(() => { this.chirp(); this.scheduleBirds(); }, wait);
  }
  private chirp() {
    if (!this.context || !this.master || !this.birdsOk || this.muted || !this.background || !this.birdZones.includes(this.zone)) return;
    const t = this.context.currentTime;
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    const freq = 1800 + Math.random() * 1400;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * (1.15 + Math.random() * .3), t + .08);
    osc.frequency.exponentialRampToValueAtTime(freq * .7, t + .18);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(.045 + Math.random() * .03, t + .02);
    gain.gain.exponentialRampToValueAtTime(.001, t + .22);
    osc.connect(gain); gain.connect(this.master); osc.start(t); osc.stop(t + .25);
  }
  private setCrackle(on: boolean) {
    if (!this.context || !this.generated || !this.noise) return;
    if (!on) {
      this.crackleSource?.stop(); this.crackleSource = null;
      if (this.crackleGain) { this.crackleGain.disconnect(); this.crackleGain = null; }
      return;
    }
    if (this.crackleSource) return;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = .8;
    this.crackleGain = this.context.createGain(); this.crackleGain.gain.value = .08;
    this.crackleSource = this.context.createBufferSource(); this.crackleSource.buffer = this.noise; this.crackleSource.loop = true;
    this.crackleSource.connect(filter); filter.connect(this.crackleGain); this.crackleGain.connect(this.generated); this.crackleSource.start();
  }
  setZone(zone: ZoneId) {
    this.zone = zone;
    if (zone !== 'floating') this.pauseMusic(true);
    if (this.context && this.filter) {
      const freq = zone === 'spa' || zone === 'floating' || zone === 'onsen' ? 380 : zone === 'sauna' ? 420 : zone === 'campfire' ? 720 : zone === 'tea' ? 600 : 950;
      this.filter.frequency.setTargetAtTime(freq, this.context.currentTime, 2);
    }
    this.setCrackle(zone === 'campfire');
    this.scheduleBirds();
    this.ambience?.pause(); this.ambience = null;
    const path = this.assets.ambience?.[zone]; this.mixEnvironment();
    if (path) { this.ambience = new Audio(path); this.ambience.loop = true; this.apply(); void this.ambience.play().catch(() => {}); }
  }

  async playMusic() {
    const request = ++this.musicRequest;
    if (!await this.unlock() || request !== this.musicRequest || this.zone !== 'floating' || !this.music || !this.musicGain || !this.context) return false;
    try {
      await this.music.play();
      if (request !== this.musicRequest) return false;
      this.musicGain.gain.setTargetAtTime(.9, this.context.currentTime, .8);
      this.mixEnvironment(); return true;
    } catch { return false; }
  }
  pauseMusic(reset = false) {
    ++this.musicRequest; this.music?.pause();
    if (reset && this.music) this.music.currentTime = 0;
    if (this.musicGain && this.context) { this.musicGain.gain.cancelScheduledValues(this.context.currentTime); this.musicGain.gain.setValueAtTime(0, this.context.currentTime); }
    this.mixEnvironment();
  }
  /** Spa/sauna → Gymnopédie; tea → Arabesque. Swaps the soft-piano element src when needed. */
  setSoftTrack(src: string) {
    if (!this.spaMusic) return;
    if (this.spaMusic.getAttribute('src') === src || this.spaMusic.src.endsWith(src)) return;
    this.spaMusic.pause();
    this.spaMusic.currentTime = 0;
    this.spaMusic.setAttribute('src', src);
    this.spaMusic.src = src;
    this.spaMusic.load();
  }
  async playSpaMusic() {
    const request = ++this.spaMusicRequest;
    if (!await this.unlock() || request !== this.spaMusicRequest || !['spa', 'sauna', 'tea'].includes(this.zone) || !this.spaMusic || !this.spaMusicGain || !this.context) return false;
    try {
      await this.spaMusic.play(); if (request !== this.spaMusicRequest) return false;
      // Tea matches floating (.9); spa/sauna stay a touch softer.
      this.spaMusicGain.gain.setTargetAtTime(this.zone === 'tea' ? .9 : .65, this.context.currentTime, .9); this.mixEnvironment(); return true;
    } catch { return false; }
  }
  pauseSpaMusic(reset = false) {
    ++this.spaMusicRequest; this.spaMusic?.pause(); if (reset && this.spaMusic) this.spaMusic.currentTime = 0;
    if (this.spaMusicGain && this.context) { this.spaMusicGain.gain.cancelScheduledValues(this.context.currentTime); this.spaMusicGain.gain.setValueAtTime(0, this.context.currentTime); }
    this.mixEnvironment();
  }

  effect(kind: 'pour' | 'sip' | 'crackle' | 'burn') {
    if (!this.context || !this.master || !this.noise || this.muted || !this.background) return;
    const t = this.context.currentTime; const source = this.context.createBufferSource(); source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = kind === 'burn' ? 'highpass' : 'bandpass';
    filter.frequency.value = kind === 'pour' ? 1800 : kind === 'crackle' ? 1100 : kind === 'burn' ? 600 : 700;
    const gain = this.context.createGain(); gain.gain.setValueAtTime(0, t);
    if (kind === 'burn') {
      gain.gain.linearRampToValueAtTime(.55, t + .05);
      gain.gain.exponentialRampToValueAtTime(.001, t + 1.1);
      filter.frequency.exponentialRampToValueAtTime(2200, t + .9);
    } else if (kind === 'crackle') {
      gain.gain.linearRampToValueAtTime(.35, t + .04);
      gain.gain.exponentialRampToValueAtTime(.001, t + .9);
    } else {
      gain.gain.linearRampToValueAtTime(.7, t + .1);
      gain.gain.exponentialRampToValueAtTime(.001, t + (kind === 'pour' ? 2 : .6));
    }
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(); source.stop(t + 2.5);
  }
  stop() {
    if (this.birdTimer) { window.clearTimeout(this.birdTimer); this.birdTimer = null; }
    this.setCrackle(false);
    this.pauseMusic(true); this.pauseSpaMusic(true); window.speechSynthesis?.cancel(); this.ambience?.pause(); void this.context?.suspend();
  }
}
export const audio = new Soundscape();
window.speechSynthesis?.cancel();
if (import.meta.hot) import.meta.hot.dispose(() => { audio.stop(); void audio.context?.close(); });
