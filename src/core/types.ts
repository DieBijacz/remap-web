export type Listener<T = any> = (payload: T) => void;

export interface ClockTick {
  dt: number; // delta time in seconds
  now: number; // timestamp in ms
}

export type Scene = {
  start?: () => void;
  stop?: () => void;
  update?: (tick: ClockTick) => void;
  render?: (ctx: CanvasRenderingContext2D) => void;
};
