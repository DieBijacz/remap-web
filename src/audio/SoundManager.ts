interface Sound {
  buffer: AudioBuffer;
  baseVolume: number;
}

export class SoundManager {
  private context: AudioContext;
  private sounds: Map<string, Sound> = new Map();
  private masterVolume = 1;

  constructor() {
    this.context = new AudioContext();
  }

  async loadSound(name: string, url: string, baseVolume = 1) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

      this.sounds.set(name, {
        buffer: audioBuffer,
        baseVolume
      });
    } catch (err) {
      console.error(`Failed to load sound ${name}:`, err);
    }
  }

  play(name: string, volumeMod = 1) {
    const sound = this.sounds.get(name);
    if (!sound) return;

    // Create source and gain nodes
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();

    // Connect nodes
    source.buffer = sound.buffer;
    source.connect(gain);
    gain.connect(this.context.destination);

    // Set volume
    gain.gain.value = sound.baseVolume * this.masterVolume * volumeMod;

    // Play
    source.start(0);
  }

  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }
}