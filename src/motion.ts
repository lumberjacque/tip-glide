import type { Point } from "./geometry.js";

// Exact CSS cubic-bezier(0.23, 1, 0.32, 1), inverted along its time axis.
export function easeOut(time: number): number {
  let t = time;
  for (let i = 0; i < 7; i++) {
    const x = 3 * (1 - t) ** 2 * t * 0.23 + 3 * (1 - t) * t ** 2 * 0.32 + t ** 3;
    const slope =
      3 * (1 - t) ** 2 * 0.23 + 6 * (1 - t) * t * (0.32 - 0.23) + 3 * t ** 2 * (1 - 0.32);
    if (slope < 1e-6) break;
    t = Math.max(0, Math.min(1, t - (x - time) / slope));
  }
  return 1 - (1 - t) ** 3;
}

/** Measure a travel path once; frame sampling allocates only the resulting point. */
export function createPathSampler(path: Point[]): (progress: number) => Point {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y));
  const total = lengths.reduce((sum, n) => sum + n, 0);
  return (progress) => {
    let remaining = total * progress;
    for (let i = 0; i < lengths.length; i++) {
      const length = lengths[i]!;
      if (remaining <= length || i === lengths.length - 1) {
        const p = length ? remaining / length : 1,
          a = path[i]!,
          b = path[i + 1]!;
        return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
      }
      remaining -= length;
    }
    return path[0]!;
  };
}

export function along(path: Point[], progress: number): Point {
  return createPathSampler(path)(progress);
}
