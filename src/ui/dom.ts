export function qs<T extends Element = Element>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector(sel) as T | null;
}

export function qsa<T extends Element = Element>(sel: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll(sel)) as T[];
}

export function create<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, text?: string) {
  const el = document.createElement(tag);
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign((el as HTMLElement).style, v);
    else el.setAttribute(k, String(v));
  }
  if (text) el.textContent = text;
  return el;
}
