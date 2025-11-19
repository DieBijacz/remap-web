import type { RGBColor } from '../config/colorPresets';

const CONFIG_KEY = 'remap:config';

export type Config = {
  palette?: string;
  volume?: number;
  initialTime?: number;
  maxTimeBonus?: number;
  timeBonusMode?: 'classic' | 'endurance' | 'hybrid';
  bonusWindow?: number;
  ringRadiusFactor?: number;
  menuSymbolCount?: number;
  menuSymbolBaseSizeVW?: number;
  menuSymbolSizeVariancePct?: number;
  menuSymbolGrowthMultiplier?: number;
  menuSymbolSpeedMultiplier?: number;
  minTimeBonus?: number;
  mechanicInterval?: number;
  difficulty?: 'easy' | 'medium' | 'hard' | 'progressive';
  mechanicRandomize?: boolean;
  symbolScale?: number;
  symbolStroke?: number;
  uiFontScale?: number;
  memoryPreviewDuration?: number;
  particlesPerScore?: number;
  particlesPersist?: boolean;
  scoreRayThickness?: number;
  scoreRayCount?: number;
  scoreRayIntensity?: number;
  mechanicEnableRemap?: boolean;
  mechanicEnableMemory?: boolean;
  mechanicEnableJoystick?: boolean;
  mechanicEnableMatchColor?: boolean;
  mechanicEnableMatchShape?: boolean;
  nameEntryMode?: 'slots' | 'keyboard';
  symbolTheme?: 'classic' | 'pacman';
  symbolColors?: RGBColor[];
};

export default class ConfigStore {
  save(cfg: Config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  load(): Config {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Config;
    } catch (e) {
      return {};
    }
  }
}


