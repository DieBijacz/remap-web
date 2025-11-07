import keymap, { type Action } from './Keymap';

export type ActionHandler = (action: Action, event?: KeyboardEvent) => void;

export default class InputRouter {
  private handler: ActionHandler;
  private el: HTMLElement | Document;

  constructor(handler: ActionHandler, el: HTMLElement | Document = document) {
    this.handler = handler;
    this.el = el;
    this.onKey = this.onKey.bind(this);
    this.el.addEventListener('keydown', this.onKey as EventListener);
  }

  private onKey(e: KeyboardEvent) {
    const action = (keymap[e.code] ?? keymap[e.key]) as Action | undefined;
    if (!action) {
      return;
    }
    this.handler(action, e);
    e.preventDefault();
  }

  destroy() {
    this.el.removeEventListener('keydown', this.onKey as EventListener);
  }
}
