import type { Config as PersistentConfig } from '../../storage/ConfigStore';

export type SettingItem =
  | {
      type: 'number';
      key: keyof PersistentConfig;
      label: string;
      min: number;
      max: number;
      step: number;
      format: (value: number) => string;
    }
  | {
      type: 'label';
      label: string;
    }
  | {
      type: 'toggle';
      key: keyof PersistentConfig;
      label: string;
      format?: (value: boolean) => string;
    }
  | {
      type: 'cycle';
      key: keyof PersistentConfig;
      label: string;
      options: string[];
      format?: (value: string) => string;
    }
  | {
      type: 'action';
      action: 'resetHighscore';
      label: string;
      description?: string;
    }
  | {
      type: 'color';
      key: 'symbolColors';
      label: string;
      index: number;
      step?: number;
    }
  | {
      type: 'color';
      key: 'symbolColors';
      label: string;
      index: number;
      step?: number;
    };

export type SettingsTabKey = 'gameplay' | 'mechanics' | 'visual' | 'system';

export type SettingsSection = {
  key: string;
  label: string;
  items: SettingItem[];
};

export type SettingsSubTab = {
  key: string;
  label: string;
  items?: SettingItem[];
  sections?: SettingsSection[];
};

export type SettingsTab = {
  key: SettingsTabKey;
  label: string;
  items?: SettingItem[];
  subTabs?: SettingsSubTab[];
};

export const SETTINGS_TABS: SettingsTab[] = [
  {
    key: 'gameplay',
    label: 'Gameplay',
    items: [
      {
        type: 'number',
        key: 'initialTime',
        label: 'Starting Time',
        min: 20,
        max: 240,
        step: 5,
        format: (v) => `${Math.round(v)} s`
      },
      {
        type: 'number',
        key: 'maxTimeBonus',
        label: 'Max Time Bonus',
        min: 0.5,
        max: 6,
        step: 0.1,
        format: (v) => `${v.toFixed(1)} s`
      },
      {
        type: 'number',
        key: 'bonusWindow',
        label: 'Bonus Window',
        min: 0.5,
        max: 6,
        step: 0.1,
        format: (v) => `${v.toFixed(1)} s`
      },
      {
        type: 'cycle',
        key: 'difficulty',
        label: 'Difficulty',
        options: ['easy', 'medium', 'hard', 'progressive'],
        format: (value) => value.charAt(0).toUpperCase() + value.slice(1)
      }
    ]
  },
  {
    key: 'mechanics',
    label: 'Mechanics',
    items: [
      {
        type: 'number',
        key: 'mechanicInterval',
        label: 'Mechanic Interval',
        min: 3,
        max: 30,
        step: 1,
        format: (v) => `${Math.round(v)} hits`
      },
      {
        type: 'toggle',
        key: 'mechanicRandomize',
        label: 'Randomize Mechanics',
        format: (value) => (value ? 'On' : 'Off')
      },
      {
        type: 'toggle',
        key: 'mechanicEnableRemap',
        label: 'Remap Mechanic',
        format: (value) => (value ? 'On' : 'Off')
      },
      {
        type: 'toggle',
        key: 'mechanicEnableSpin',
        label: 'Spin Mechanic',
        format: (value) => (value ? 'On' : 'Off')
      },
      {
        type: 'toggle',
        key: 'mechanicEnableMemory',
        label: 'Memory Mechanic',
        format: (value) => (value ? 'On' : 'Off')
      },
      {
        type: 'number',
        key: 'memoryPreviewDuration',
        label: 'Memory Hide Delay',
        min: 0.2,
        max: 6,
        step: 0.1,
        format: (v) => `${v.toFixed(1)} s`
      },
      {
        type: 'toggle',
        key: 'mechanicEnableJoystick',
        label: 'Joystick Mechanic',
        format: (value) => (value ? 'On' : 'Off')
      }
    ]
  },
  {
    key: 'visual',
    label: 'Visual Effects',
    subTabs: [
      {
        key: 'symbols',
        label: 'Symbols',
        sections: [
          {
            key: 'general',
            label: 'General',
            items: [
              {
                type: 'number',
                key: 'ringRadiusFactor',
                label: 'Ring Radius',
                min: 0.08,
                max: 0.26,
                step: 0.01,
                format: (v) => `${Math.round(v * 100)}% width`
              },
              {
                type: 'cycle',
                key: 'symbolTheme',
                label: 'Symbol Theme',
                options: ['classic', 'pacman'],
                format: (value) => (value === 'pacman' ? 'Pac-Man' : 'Classic')
              },
              {
                type: 'label',
                label: 'Animated Menu'
              },
              {
                type: 'number',
                key: 'menuSymbolCount',
                label: 'Menu Symbols',
                min: 4,
                max: 60,
                step: 1,
                format: (v) => `${Math.round(v)}`
              },
              {
                type: 'number',
                key: 'symbolScale',
                label: 'Symbol Size',
                min: 0.6,
                max: 1.6,
                step: 0.05,
                format: (v) => `${Math.round(v * 100)}%`
              },
              {
                type: 'number',
                key: 'symbolStroke',
                label: 'Symbol Outline',
                min: 0.5,
                max: 1.8,
                step: 0.05,
                format: (v) => `${v.toFixed(2)}x`
              }
            ]
          },
          {
            key: 'colors',
            label: 'Colors',
            items: [
              {
                type: 'color',
                key: 'symbolColors',
                label: 'Red',
                index: 0,
                step: 5
              },
              {
                type: 'color',
                key: 'symbolColors',
                label: 'Magenta',
                index: 1,
                step: 5
              },
              {
                type: 'color',
                key: 'symbolColors',
                label: 'Cyan',
                index: 2,
                step: 5
              },
              {
                type: 'color',
                key: 'symbolColors',
                label: 'Dark Blue',
                index: 3,
                step: 5
              },
              {
                type: 'color',
                key: 'symbolColors',
                label: 'Gold',
                index: 4,
                step: 5
              },
              {
                type: 'color',
                key: 'symbolColors',
                label: 'Green',
                index: 5,
                step: 5
              },
              {
                type: 'color',
                key: 'symbolColors',
                label: 'Mint',
                index: 6,
                step: 5
              },
              {
                type: 'color',
                key: 'symbolColors',
                label: 'Amber',
                index: 7,
                step: 5
              },
              {
                type: 'color',
                key: 'symbolColors',
                label: 'Violet',
                index: 8,
                step: 5
              }
            ]
          }
        ]
      },
      {
        key: 'particles',
        label: 'Particles',
        items: [
          {
            type: 'number',
            key: 'particlesPerScore',
            label: 'Particles per Hit',
            min: 0,
            max: 20,
            step: 1,
            format: (v) => `${Math.round(v)}`
          },
          {
            type: 'toggle',
            key: 'particlesPersist',
            label: 'Keep Orbiting',
            format: (value) => (value ? 'On' : 'Off')
          }
        ]
      },
      {
        key: 'rays',
        label: 'Rays',
        items: [
          {
            type: 'number',
            key: 'scoreRayCount',
            label: 'Ray Lines',
            min: 0,
            max: 12,
            step: 1,
            format: (v) => `${Math.round(v)}`
          },
          {
            type: 'number',
            key: 'scoreRayThickness',
            label: 'Ray Thickness',
            min: 0.2,
            max: 3,
            step: 0.1,
            format: (v) => `${v.toFixed(1)}x`
          },
          {
            type: 'number',
            key: 'scoreRayIntensity',
            label: 'Ray Intensity',
            min: 0.3,
            max: 2.5,
            step: 0.1,
            format: (v) => `${v.toFixed(1)}x`
          }
        ]
      }
    ]
  },
  {
    key: 'system',
    label: 'System',
    items: [
      {
        type: 'number',
        key: 'uiFontScale',
        label: 'UI Font Scale',
        min: 0.5,
        max: 1.4,
        step: 0.05,
        format: (v) => `${Math.round(v * 100)}%`
      },
      {
        type: 'cycle',
        key: 'nameEntryMode',
        label: 'Name Entry',
        options: ['slots', 'keyboard'],
        format: (value) => (value === 'keyboard' ? 'On-screen Keyboard' : 'Letter Slots')
      },
      {
        type: 'action',
        action: 'resetHighscore',
        label: 'Reset Highscore',
        description: 'Press Enter to clear best score'
      }
    ]
  }
];

