export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'cancel'
  | 'pause'
  | 'settings';

const defaultKeymap: Record<string, Action> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Escape: 'cancel',
  Space: 'confirm',
  KeyP: 'pause',
  KeyO: 'settings',
  o: 'settings',
  O: 'settings'
};

export default defaultKeymap;
