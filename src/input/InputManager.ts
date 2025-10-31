export interface InputHandler {
  onKeyDown(e: KeyboardEvent): void;
}

export class InputManager {
  private handlers: Set<InputHandler> = new Set();

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.handlers.forEach(handler => handler.onKeyDown(e));
    });
  }

  addHandler(handler: InputHandler) {
    this.handlers.add(handler);
  }

  removeHandler(handler: InputHandler) {
    this.handlers.delete(handler);
  }
}