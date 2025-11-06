import type { SymbolType } from './Symbols';

export interface SymbolProps {
  type: SymbolType;
  x: number;
  y: number;
  scale: number;
  isTarget?: boolean;
}

export class DOMSymbol {
  private element: HTMLDivElement;

  constructor(props: SymbolProps) {
    this.element = document.createElement('div');
    this.element.className = 'symbol';
    this.update(props);
    // append into the game container so symbols stay inside the 9:16 viewport
    const container = document.getElementById('game-container') || document.body;
    // ensure container is positioned so absolute children are aligned
    if (container && container instanceof HTMLElement) {
      container.style.position = container.style.position || 'relative';
    }
    container.appendChild(this.element);
  }

  update({ x, y, type, scale, isTarget }: SymbolProps) {
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;

    // Update symbol type and target state
    this.element.className = 'symbol ' + type;
    if (isTarget) {
      this.element.classList.add('target');
    } else {
      this.element.classList.remove('target');
    }

    // Always set transform to center and scale
    const transform = `translate(-50%, -50%) scale(${scale})`;
    this.element.style.transform = transform;
  }

  remove() {
    this.element.remove();
  }
}
