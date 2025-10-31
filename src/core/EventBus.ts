// prościutki pub/sub — starczy do łączenia UI z grą
type Listener<T> = (payload: T) => void;

export class EventBus<TMap extends Record<string, any>> {
  private listeners = new Map<keyof TMap, Set<Listener<any>>>();

  on<K extends keyof TMap>(type: K, fn: Listener<TMap[K]>) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
    return () => this.off(type, fn);
  }
  off<K extends keyof TMap>(type: K, fn: Listener<TMap[K]>) {
    this.listeners.get(type)?.delete(fn);
  }
  emit<K extends keyof TMap>(type: K, payload: TMap[K]) {
    this.listeners.get(type)?.forEach((fn) => fn(payload));
  }
}
