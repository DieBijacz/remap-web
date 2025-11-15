const MAZE_BLUEPRINT = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#*####.#####.##.#####.####*#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '######.##### ## #####.######',
  '######.##          ##.######',
  '######.## ######## ##.######',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#*..##................##..*#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################'
] as const;

const MAZE_GRID = MAZE_BLUEPRINT.map((row) => row.split('').map((cell) => cell === '#'));

export type PacmanMazeOptions = {
  opacity?: number;
  marginRatio?: number;
  color?: string;
  glowColor?: string;
};

export const drawPacmanMazeBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options?: PacmanMazeOptions
) => {
  const opacity = typeof options?.opacity === 'number' ? options.opacity : 1;
  if (opacity <= 0) {
    return;
  }

  const marginRatio = options?.marginRatio ?? 0.08;
  const cols = MAZE_GRID[0].length;
  const rows = MAZE_GRID.length;
  const margin = Math.min(width, height) * marginRatio;
  const availableWidth = Math.max(0, width - margin * 2);
  const availableHeight = Math.max(0, height - margin * 2);
  if (availableWidth <= 0 || availableHeight <= 0) {
    return;
  }
  const offsetX = (width - availableWidth) / 2;
  const offsetY = (height - availableHeight) / 2;
  const cellWidth = availableWidth / cols;
  const cellHeight = availableHeight / rows;
  const thickness = Math.max(2, Math.min(cellWidth, cellHeight) * 0.72);
  const halfThickness = thickness / 2;
  const color = options?.color ?? '#3d7bff';
  const glowColor = options?.glowColor ?? 'rgba(96, 165, 250, 0.75)';

  ctx.save();
  ctx.globalAlpha *= Math.min(1, Math.max(0, opacity));
  ctx.fillStyle = color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = Math.max(6, thickness * 0.9);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!MAZE_GRID[y][x]) continue;
      const centerX = offsetX + x * cellWidth + cellWidth / 2;
      const centerY = offsetY + y * cellHeight + cellHeight / 2;

      if (x + 1 < cols && MAZE_GRID[y][x + 1]) {
        ctx.fillRect(centerX, centerY - halfThickness, cellWidth, thickness);
      }
      if (y + 1 < rows && MAZE_GRID[y + 1][x]) {
        ctx.fillRect(centerX - halfThickness, centerY, thickness, cellHeight);
      }
      ctx.beginPath();
      ctx.arc(centerX, centerY, halfThickness, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
};

