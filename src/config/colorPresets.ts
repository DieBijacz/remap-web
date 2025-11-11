export type RGBColor = { r: number; g: number; b: number };

export const clampColorValue = (value: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(255, Math.round(value)));
};

export const DEFAULT_SYMBOL_COLORS: RGBColor[] = [
  { r: 240, g: 72, b: 72 }, // red
  { r: 255, g: 113, b: 242 }, // magenta
  { r: 82, g: 219, b: 255 }, // cyan
  { r: 70, g: 96, b: 255 }, // dark blue
  { r: 255, g: 196, b: 78 }, // gold
  { r: 62, g: 214, b: 120 }, // green
  { r: 156, g: 255, b: 212 }, // mint
  { r: 255, g: 153, b: 92 }, // amber
  { r: 184, g: 134, b: 255 } // violet
];

export const cloneColor = (color: RGBColor): RGBColor => ({ r: color.r, g: color.g, b: color.b });

export const sanitizeSymbolColors = (colors?: RGBColor[] | null): RGBColor[] => {
  const fallback = DEFAULT_SYMBOL_COLORS.map(cloneColor);
  if (!Array.isArray(colors)) {
    return fallback;
  }
  return fallback.map((defaultColor, index) => {
    const source = colors[index];
    if (!source || typeof source !== 'object') {
      return cloneColor(defaultColor);
    }
    return {
      r: clampColorValue('r' in source ? Number((source as RGBColor).r) : defaultColor.r),
      g: clampColorValue('g' in source ? Number((source as RGBColor).g) : defaultColor.g),
      b: clampColorValue('b' in source ? Number((source as RGBColor).b) : defaultColor.b)
    };
  });
};

const toHex = (value: number) => clampColorValue(value).toString(16).padStart(2, '0');

export const rgbToHex = (color: RGBColor) => `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;

export const rgbToCss = (color: RGBColor, alpha = 1) =>
  `rgba(${clampColorValue(color.r)}, ${clampColorValue(color.g)}, ${clampColorValue(color.b)}, ${Math.max(0, Math.min(1, alpha))})`;

export const mixColors = (source: RGBColor, target: RGBColor, t: number): RGBColor => {
  const ratio = Math.max(0, Math.min(1, t));
  return {
    r: clampColorValue(source.r + (target.r - source.r) * ratio),
    g: clampColorValue(source.g + (target.g - source.g) * ratio),
    b: clampColorValue(source.b + (target.b - source.b) * ratio)
  };
};
