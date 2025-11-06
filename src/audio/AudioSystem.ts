export type PlayOptions = {
  gain?: number;
  playbackRate?: number;
  loop?: boolean;
};

type LoadedSound = {
  buffer: AudioBuffer;
  gain: number;
};

export class AudioSystem {
  private readonly context: AudioContext;
  private readonly masterGain: GainNode;
  private readonly sounds = new Map<string, LoadedSound>();

  constructor(masterVolume = 1) {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.setMasterVolume(masterVolume);
  }

  async load(name: string, url: string, gain = 1) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.sounds.set(name, { buffer: audioBuffer, gain });
    } catch (error) {
      console.error(`Failed to load sound ${name}:`, error);
    }
  }

  play(name: string, options: PlayOptions = {}) {
    const sound = this.sounds.get(name);
    if (!sound) return null;

    const source = this.context.createBufferSource();
    source.buffer = sound.buffer;
    source.loop = options.loop ?? false;
    if (options.playbackRate) {
      source.playbackRate.value = options.playbackRate;
    }

    const gainNode = this.context.createGain();
    const gain = options.gain ?? sound.gain;
    gainNode.gain.value = this.clampVolume(gain);

    source.connect(gainNode);
    gainNode.connect(this.masterGain);

    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => undefined);
    }

    source.start(0);
    return source;
  }

  setMasterVolume(value: number) {
    this.masterGain.gain.value = this.clampVolume(value);
  }

  private clampVolume(value: number) {
    return Math.max(0, Math.min(1, value));
  }
}
