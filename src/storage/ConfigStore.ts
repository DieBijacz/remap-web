const CONFIG_KEY = 'remap:config';

export type Config = {
  palette?: string;
  volume?: number;
  initialTime?: number;
  maxTimeBonus?: number;
  bonusWindow?: number;
  ringRadiusFactor?: number;
  minTimeBonus?: number;
  mechanicInterval?: number;
  mechanicRandomize?: boolean;
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
