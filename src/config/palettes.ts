export const PALETTES = {
  default: {
    bg: '#0b0f1a',
    fg: '#ffffff',
    accent: '#66d9ef',
  },
  retro: {
    bg: '#1b1b3a',
    fg: '#ffe66d',
    accent: '#ff6b6b',
  },
};

export type PaletteName = keyof typeof PALETTES;
