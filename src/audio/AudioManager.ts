interface Sound {
  buffer: AudioBuffer;
  gain: number;
}

export class AudioManager {
  private context: AudioContext;
  private sounds = new Map<string, Sound>();
  private gainNode: GainNode;

  constructor(masterVolume = 1) {
    this.context = new AudioContext();
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
    this.setVolume(masterVolume);
  }

  async load(name: string, url: string, gain = 1) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.sounds.set(name, { buffer: audioBuffer, gain });
    } catch (err) {
      console.error(`Failed to load sound ${name}:`, err);
    }
  }

  play(name: string) {
    const sound = this.sounds.get(name);
    if (!sound) return;

    const source = this.context.createBufferSource();
    source.buffer = sound.buffer;

    const gainNode = this.context.createGain();
    gainNode.gain.value = sound.gain;

    source.connect(gainNode);
    gainNode.connect(this.gainNode);

    source.start(0);
  }

  setVolume(value: number) {
    this.gainNode.gain.value = Math.max(0, Math.min(1, value));
  }
}