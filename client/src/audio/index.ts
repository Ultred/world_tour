import { rand } from "../core/utils";

interface AudioState {
  enabled: boolean;
  music: boolean;
  sfx: boolean;
  musicVol: number;
  sfxVol: number;
}

interface ToneOpts {
  f: number;
  to?: number;
  /** seconds from now. */
  t?: number;
  /** absolute AudioContext time — used by the music scheduler. */
  at?: number;
  d?: number;
  a?: number;
  v?: number;
  type?: OscillatorType;
  lp?: number;
  dest?: AudioNode;
}

interface NoiseOpts {
  t?: number;
  d?: number;
  a?: number;
  v?: number;
  type?: BiquadFilterType;
  f?: number;
  to?: number;
  q?: number;
}

export interface AudioEngine {
  state: AudioState;
  unlock(): void;
  unlocked(): boolean;
  setEnabled(v: boolean): void;
  setMusic(v: boolean): void;
  setSfx(v: boolean): void;
  setMusicVol(v: number): void;
  setSfxVol(v: number): void;
  /** One letter tile popping in; pitch climbs a pentatonic scale so a word "plays" a little run. */
  tile(delay: number, i: number, soft: boolean, big: boolean): void;
  /** Bright chord when a word lands. */
  solve(delay: number, long: boolean): void;
  bonus(): void;
  wrong(): void;
  dupe(): void;
  shuffle(): void;
  /** Light-bulb "ting". */
  hint(): void;
  /** Trophy fanfare + coin. */
  featured(): void;
  /** Rising whoosh as the gift cascade starts. */
  gift(): void;
  /** Boom + big fanfare when every word is revealed. */
  finale(): void;
  /** Points count-up ticks. */
  giftBanner(dur: number): void;
  /** Firework: thump + fizz + crackle. */
  burst(scale?: number): void;
  confetti(): void;
  /** Board cleared jingle. */
  complete(): void;
  newBoard(): void;
  /** A new player takes #1. */
  rankUp(): void;
  /** Countdown blip — the round timer's last-10s warning. */
  tick(): void;
  /** Neutral percussive click for "answer locked in" (trivia) — deliberately non-melodic so it
   * can never read as a correct/wrong signal the way the tonal SFX would. */
  pick(): void;
  /** Buzzer when the round clock runs out. */
  timeUp(): void;
  /** Short duck of the music under the round-summary panel. */
  roundSummary(): void;
}

// Real music tracks (client/src/audio/music/*.m4a) — Vite bundles these as hashed static
// assets automatically at build time; drop a new file in that folder and it's picked up with
// no code change here. Background music plays through this playlist instead of a synthesised
// loop. Effects (tile pops, solves, fanfares, etc.) stay Web Audio API — short synthesised
// sounds for every game event. Browsers only allow sound after a click/key press, so audio
// starts on the first interaction (or via the Sound button) via `unlock()`.
const musicModules = import.meta.glob("./music/*.{m4a,mp3}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const TRACK_URLS = Object.values(musicModules);

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function createAudioEngine(): AudioEngine {
  const state: AudioState = { enabled: true, music: true, sfx: true, musicVol: 0.3, sfxVol: 0.9 };
  let ctx: AudioContext | null = null;
  let master: GainNode, musicBus: GainNode, sfxBus: GainNode, noiseBuf: AudioBuffer;
  let musicEl: HTMLAudioElement | null = null;
  // Freshly shuffled each time we've played through the whole set, so background music cycles
  // through every track before any repeat instead of the old fixed 4-chord loop repeating from
  // the first bar every ~5 seconds.
  let playOrder: string[] = [];
  let playIndex = 0;

  const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
  const PENTA = [72, 74, 76, 79, 81]; // C major pentatonic: any run of tiles sounds pleasant

  const ready = () => !!ctx && ctx.state === "running" && state.enabled && state.sfx;

  // ---- building blocks ----
  function envGain(t0: number, a: number, d: number, v: number): GainNode {
    // quick attack (a), exponential fade until d
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    return g;
  }
  function tone({ f, to, t = 0, at, d = 0.2, a = 0.005, v = 0.2, type = "sine", lp, dest }: ToneOpts): void {
    const t0 = at ?? ctx!.currentTime + Math.max(0, t);
    const osc = ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + d);
    const g = envGain(t0, a, d, v);
    if (lp) {
      const fl = ctx!.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = lp;
      osc.connect(fl);
      fl.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(dest ?? sfxBus);
    osc.start(t0);
    osc.stop(t0 + d + 0.05);
  }
  function noise({ t = 0, d = 0.3, a = 0.01, v = 0.2, type = "bandpass", f = 1000, to, q = 1 }: NoiseOpts): void {
    const t0 = ctx!.currentTime + Math.max(0, t);
    const src = ctx!.createBufferSource();
    src.buffer = noiseBuf;
    const fl = ctx!.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t0);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t0 + d);
    const g = envGain(t0, a, d, v);
    src.connect(fl);
    fl.connect(g);
    g.connect(sfxBus);
    src.start(t0, Math.random());
    src.stop(t0 + d + 0.05);
  }
  function duck(sec = 2.5, level = 0.35): void {
    // dip the music while a big moment plays
    if (!ctx) return;
    const g = musicBus.gain;
    const t = ctx.currentTime;
    const base = state.music ? state.musicVol : 0;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(base * level, t, 0.08);
    g.setTargetAtTime(base, t + sec, 0.6);
  }
  const coin = (t: number) => {
    // "ka-ching"
    tone({ f: midi(95), t, d: 0.12, v: 0.12 });
    tone({ f: midi(100), t: t + 0.08, d: 0.55, v: 0.12 });
  };

  // ---- background music: real tracks, playlist-style ----
  function nextTrack(): void {
    if (!musicEl || !TRACK_URLS.length) return;
    if (playIndex >= playOrder.length) {
      playOrder = shuffle(TRACK_URLS);
      playIndex = 0;
    }
    musicEl.src = playOrder[playIndex++]!;
    if (state.music && state.enabled) void musicEl.play().catch(() => {});
  }
  function syncMusic(): void {
    const want = !!ctx && !!musicEl && state.music && state.enabled;
    if (want && musicEl!.paused) {
      if (!musicEl!.src) nextTrack();
      else void musicEl!.play().catch(() => {});
    }
    if (!want && musicEl && !musicEl.paused) musicEl.pause();
  }
  // ---- levels & lifecycle ----
  function applyLevels(): void {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(state.enabled ? 0.9 : 0, t, 0.05);
    musicBus.gain.setTargetAtTime(state.music ? state.musicVol : 0, t, 0.1);
    sfxBus.gain.setTargetAtTime(state.sfx ? state.sfxVol : 0, t, 0.05);
  }
  function unlock(): void {
    if (!ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
      const comp = ctx.createDynamicsCompressor(); // keeps stacked celebrations from clipping
      comp.connect(ctx.destination);
      master = ctx.createGain();
      master.connect(comp);
      musicBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      musicEl = new Audio();
      musicEl.crossOrigin = "anonymous";
      musicEl.addEventListener("ended", nextTrack);
      ctx.createMediaElementSource(musicEl).connect(musicBus);
    }
    void ctx.resume();
    applyLevels();
    syncMusic();
  }
  function setter<K extends keyof AudioState>(key: K) {
    return (v: AudioState[K]) => {
      state[key] = v;
      applyLevels();
      syncMusic();
    };
  }

  // ---- sound effects ----
  return {
    state,
    unlock,
    unlocked: () => !!ctx,
    setEnabled: setter("enabled"),
    setMusic: setter("music"),
    setSfx: setter("sfx"),
    setMusicVol: setter("musicVol"),
    setSfxVol: setter("sfxVol"),

    tile(delay, i, soft, big) {
      if (!ready()) return;
      const n = PENTA[i % PENTA.length]! + 12 * Math.floor(i / PENTA.length);
      const v = soft ? 0.09 : big ? 0.2 : 0.14;
      tone({ f: midi(n), t: delay, d: big ? 0.35 : 0.22, type: "triangle", v });
      tone({ f: midi(n + 12), t: delay, d: 0.12, v: v * 0.4 });
    },
    solve(delay, long) {
      if (!ready()) return;
      [79, 83, 86].forEach((n, i) => tone({ f: midi(n), t: delay + i * 0.045, d: 0.55, v: 0.11 }));
      if (long) [91, 95].forEach((n, i) => tone({ f: midi(n), t: delay + 0.15 + i * 0.07, d: 0.5, v: 0.08 }));
    },
    bonus() {
      if (!ready()) return;
      [88, 91, 95, 100].forEach((n, i) => tone({ f: midi(n), t: i * 0.07, d: 0.25, v: 0.14, type: "triangle" }));
    },
    wrong() {
      if (!ready()) return;
      tone({ f: 200, to: 110, d: 0.3, v: 0.22, type: "sawtooth", lp: 700 });
    },
    dupe() {
      if (!ready()) return;
      tone({ f: 330, to: 260, d: 0.14, v: 0.2, type: "triangle" });
    },
    shuffle() {
      if (!ready()) return;
      noise({ f: 500, to: 3500, q: 1.2, d: 0.4, a: 0.05, v: 0.4 });
      tone({ f: 300, to: 900, d: 0.35, v: 0.07 });
    },
    hint() {
      if (!ready()) return;
      tone({ f: midi(88), d: 0.5, v: 0.17 });
      tone({ f: midi(95), t: 0.07, d: 0.5, v: 0.11 });
    },
    featured() {
      if (!ready()) return;
      [72, 76, 79, 84].forEach((n, i) => tone({ f: midi(n), t: i * 0.1, d: 0.5, v: 0.06, type: "sawtooth", lp: 2600 }));
      [72, 76, 79, 84, 88].forEach((n) => tone({ f: midi(n), t: 0.45, d: 1.4, v: 0.07, type: "triangle" }));
      coin(0.6);
      duck(3);
    },
    gift() {
      if (!ready()) return;
      noise({ type: "highpass", f: 400, to: 7000, q: 0.8, d: 0.95, a: 0.8, v: 0.16 });
      tone({ f: 250, to: 1400, d: 0.95, a: 0.8, v: 0.09 });
    },
    finale() {
      if (!ready()) return;
      tone({ f: 110, to: 38, d: 0.8, v: 0.4 });
      noise({ type: "lowpass", f: 900, to: 80, d: 0.6, v: 0.25 });
      [72, 76, 79, 84, 88].forEach((n, i) => tone({ f: midi(n), t: 0.05 + i * 0.09, d: 0.6, v: 0.07, type: "sawtooth", lp: 2800 }));
      [72, 79, 84, 88, 91].forEach((n) => tone({ f: midi(n), t: 0.55, d: 1.6, v: 0.07, type: "triangle" }));
      coin(0.7);
      duck(3.5);
    },
    giftBanner(dur) {
      if (!ready()) return;
      tone({ f: midi(91), d: 0.6, v: 0.1 });
      for (let i = 0; i < 10; i++) {
        const n = PENTA[i % PENTA.length]! + 12 + 12 * Math.floor(i / PENTA.length);
        tone({ f: midi(n), t: (i * dur) / 10, d: 0.07, v: 0.08, type: "triangle" });
      }
    },
    burst(scale = 1) {
      if (!ready()) return;
      const s = Math.min(1, 0.4 + scale * 0.6);
      tone({ f: rand(140, 190), to: 45, d: 0.3, v: 0.3 * s });
      noise({ type: "lowpass", f: 2500, to: 200, q: 0.5, d: 0.35, v: 0.22 * s });
      tone({ f: rand(1800, 2600), to: rand(3200, 4200), t: 0.05, d: 0.25, v: 0.04 * s });
      for (let i = 0; i < 6; i++) noise({ t: rand(0.12, 0.6), d: 0.05, v: 0.05 * s, type: "highpass", f: rand(4000, 7000) });
    },
    confetti() {
      if (!ready()) return;
      noise({ type: "highpass", f: 5000, q: 0.5, d: 1.2, a: 0.1, v: 0.06 });
      for (let i = 0; i < 10; i++) tone({ f: rand(2200, 4200), t: rand(0, 1.2), d: 0.07, v: 0.05 });
    },
    complete() {
      if (!ready()) return;
      [72, 76, 79, 84, 88].forEach((n, i) => tone({ f: midi(n), t: i * 0.11, d: 0.5, v: 0.1, type: "triangle" }));
      [72, 79, 88].forEach((n) => tone({ f: midi(n), t: 0.6, d: 1.2, v: 0.07 }));
      duck(2);
    },
    newBoard() {
      if (!ready()) return;
      noise({ f: 2500, to: 400, q: 1, d: 0.5, a: 0.05, v: 0.3 });
      tone({ f: 660, to: 440, d: 0.3, v: 0.08, type: "triangle" });
    },
    rankUp() {
      if (!ready()) return;
      [79, 86, 91].forEach((n, i) => tone({ f: midi(n), t: i * 0.1, d: 0.4 + i * 0.05, v: 0.15 - i * 0.02 }));
    },
    tick() {
      if (!ready()) return;
      tone({ f: midi(84), d: 0.08, v: 0.14, type: "triangle" });
    },
    pick() {
      if (!ready()) return;
      noise({ type: "highpass", f: 3200, d: 0.04, a: 0.002, v: 0.14 });
    },
    timeUp() {
      if (!ready()) return;
      tone({ f: 220, to: 60, d: 0.6, v: 0.35, type: "sawtooth", lp: 900 });
      noise({ type: "lowpass", f: 700, to: 120, d: 0.5, v: 0.2 });
      duck(2.5);
    },
    roundSummary() {
      if (!ready()) return;
      duck(4);
    },
  };
}

export const audio: AudioEngine = createAudioEngine();
