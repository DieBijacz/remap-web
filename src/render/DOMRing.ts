export class DOMRing {
  private element: HTMLDivElement;

  constructor(x = 0, y = 0, radius = 20) {
    this.element = document.createElement('div');
    this.element.className = 'ring';
    this.setPosition(x, y);
    this.setSize(radius * 2);
    // append to game container so it stays within the game's 9:16 box
    const container = document.getElementById('game-container') || document.body;
    if (container && container instanceof HTMLElement) container.style.position = container.style.position || 'relative';
    container.appendChild(this.element);
  }

  setPosition(x: number, y: number) {
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  setSize(size: number) {
    this.element.style.width = `${size}px`;
    this.element.style.height = `${size}px`;
  }

  remove() {
    this.element.remove();
  }
}