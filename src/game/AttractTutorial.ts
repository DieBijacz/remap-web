export type AttractCardType = 'start' | 'objective' | 'controls' | 'mechanic' | 'time' | 'bonus' | 'leaderboard';

export type AttractMechanic =
  | 'remap'
  | 'memory'
  | 'joystick'
  | 'match';

export type AttractCard = {
  id: string;
  type: AttractCardType;
  headline: string;
  subline?: string;
  mechanic?: AttractMechanic;
  duration: number;
};

export function buildAttractCards(): AttractCard[] {
  return [
    {
      id: 'start',
      type: 'start',
      headline: 'Press Enter to play',
      subline: 'Match symbols to score',
      duration: 2.8
    },
    {
      id: 'objective',
      type: 'objective',
      headline: 'Match the center symbol',
      subline: 'Hit the arrow toward the match',
      duration: 4
    },
    {
      id: 'controls',
      type: 'controls',
      headline: 'Arrow pad selects symbols',
      subline: 'Enter starts & triggers bonus',
      duration: 3
    },
    {
      id: 'mechanic-remap',
      type: 'mechanic',
      mechanic: 'remap',
      headline: 'Remap: arrows swap',
      subline: 'Follow the shown mapping',
      duration: 2.4
    },
    {
      id: 'mechanic-memory',
      type: 'mechanic',
      mechanic: 'memory',
      headline: 'Memory: ring hides',
      subline: 'Remember the layout',
      duration: 2.4
    },
    {
      id: 'mechanic-joystick',
      type: 'mechanic',
      mechanic: 'joystick',
      headline: 'Joystick Flip',
      subline: 'Left / Right reverse',
      duration: 2.2
    },
    {
      id: 'mechanic-match',
      type: 'mechanic',
      mechanic: 'match',
      headline: 'Match Color / Shape',
      subline: 'Pick the glow or the shape',
      duration: 2.4
    },
    {
      id: 'time',
      type: 'time',
      headline: 'Fast hits add time',
      subline: 'Misses cost time',
      duration: 3
    },
    {
      id: 'bonus',
      type: 'bonus',
      headline: 'Fill ring, press Enter',
      subline: 'Bonus x2 rewards',
      duration: 3
    },
    {
      id: 'leaderboard',
      type: 'leaderboard',
      headline: 'Top scores',
      subline: 'Beat 4500 to place',
      duration: 3
    }
  ];
}
