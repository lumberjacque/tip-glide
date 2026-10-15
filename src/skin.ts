import { clamp } from "./geometry.js";
import type { Point } from "./geometry.js";

interface OutlinePoint extends Point {
  tx: number;
  ty: number;
}
const fmt = (n: number) => Math.round(n * 100) / 100;

/** One contour for the body and its neck; the join stays tangent even on rounded corners. */
export function skin(
  width: number,
  height: number,
  radius: number,
  anchor: Point,
  blend: number,
): string {
  const r = Math.min(radius, width / 2, height / 2);
  const w = Math.max(0, width - r * 2),
    h = Math.max(0, height - r * 2),
    arc = (Math.PI * r) / 2;
  const lengths = [w, arc, h, arc, w, arc, h, arc];
  const perimeter = lengths.reduce((sum, n) => sum + n, 0);
  if (!perimeter) return "";
  const point = (distance: number): OutlinePoint => {
    let t = ((distance % perimeter) + perimeter) % perimeter;
    let index = 0;
    while (index < 7 && t > lengths[index]!) {
      t -= lengths[index]!;
      index++;
    }
    if (index === 0) return { x: r + t, y: 0, tx: 1, ty: 0 };
    if (index === 2) return { x: width, y: r + t, tx: 0, ty: 1 };
    if (index === 4) return { x: width - r - t, y: height, tx: -1, ty: 0 };
    if (index === 6) return { x: 0, y: height - r - t, tx: 0, ty: -1 };
    const angle = ((index - 1) * Math.PI) / 4 - Math.PI / 2 + t / Math.max(r, 0.001);
    const cx = index < 4 ? width - r : r,
      cy = index === 1 || index === 7 ? r : height - r;
    const cosine = Math.cos(angle),
      sine = Math.sin(angle);
    return {
      x: cx + cosine * r,
      y: cy + sine * r,
      tx: -sine,
      ty: cosine,
    };
  };
  // Project onto the rounded rectangle's inner box, then resolve one edge or corner.
  const cx = clamp(anchor.x, r, width - r),
    cy = clamp(anchor.y, r, height - r);
  let dx = anchor.x - cx,
    dy = anchor.y - cy;
  if (!dx && !dy) {
    const edges = [anchor.y, width - anchor.x, height - anchor.y, anchor.x];
    const side = edges.indexOf(Math.min(...edges));
    dx = side === 1 ? 1 : side === 3 ? -1 : 0;
    dy = side === 2 ? 1 : side === 0 ? -1 : 0;
  }
  let attachment: number;
  if (dx && dy) {
    const corner = dx > 0 ? (dy < 0 ? 1 : 3) : dy > 0 ? 5 : 7;
    const angle = Math.atan2(dy, dx) - (((corner - 1) * Math.PI) / 4 - Math.PI / 2);
    attachment =
      lengths.slice(0, corner).reduce((sum, n) => sum + n, 0) +
      ((angle + Math.PI * 2) % (Math.PI * 2)) * r;
  } else if (dy < 0) attachment = cx - r;
  else if (dx > 0) attachment = w + arc + cy - r;
  else if (dy > 0) attachment = w + h + arc * 2 + width - r - cx;
  else attachment = w * 2 + h + arc * 3 + height - r - cy;
  const closest = point(attachment);
  const best = Math.hypot(anchor.x - closest.x, anchor.y - closest.y);
  const half = Math.min(7 + blend * 6, perimeter / 10);
  const first = point(attachment + half);
  const path = [`M${fmt(first.x)} ${fmt(first.y)}`];
  let previous = first;
  const length = perimeter - half * 2,
    start = attachment + half,
    end = start + length;
  let offset = 0;
  // Exact lines and quarter-circle arcs need at most nine pieces, at any size.
  for (let i = 0; i < 16 && offset < end; i++) {
    const section = i % 8,
      nextOffset = offset + lengths[section]!;
    if (lengths[section]! > 0 && nextOffset > start && offset < end) {
      const next = point(Math.min(nextOffset, end));
      path.push(
        `${section % 2 ? `A${fmt(r)} ${fmt(r)} 0 0 1 ` : "L"}${fmt(next.x)} ${fmt(next.y)}`,
      );
      previous = next;
    }
    offset = nextOffset;
  }
  const center = closest,
    nx = center.ty,
    ny = -center.tx;
  const neckLength = Math.min(10, Math.max(0, best - 1));
  const tip = { x: center.x + nx * neckLength, y: center.y + ny * neckLength };
  if (blend === 0) path.push(`L${fmt(tip.x)} ${fmt(tip.y)}L${fmt(first.x)} ${fmt(first.y)}`);
  else {
    const shoulder = half * (0.35 + blend * 0.4),
      rounding = 0.5 + blend;
    path.push(
      `C${fmt(previous.x + previous.tx * shoulder)} ${fmt(previous.y + previous.ty * shoulder)} ${fmt(center.x + nx * neckLength * 0.4 - center.tx * half * 0.2)} ${fmt(center.y + ny * neckLength * 0.4 - center.ty * half * 0.2)} ${fmt(tip.x - center.tx * rounding - nx * rounding)} ${fmt(tip.y - center.ty * rounding - ny * rounding)}Q${fmt(tip.x)} ${fmt(tip.y)} ${fmt(tip.x + center.tx * rounding - nx * rounding)} ${fmt(tip.y + center.ty * rounding - ny * rounding)}C${fmt(center.x + nx * neckLength * 0.4 + center.tx * half * 0.2)} ${fmt(center.y + ny * neckLength * 0.4 + center.ty * half * 0.2)} ${fmt(first.x - first.tx * shoulder)} ${fmt(first.y - first.ty * shoulder)} ${fmt(first.x)} ${fmt(first.y)}`,
    );
  }
  return path.join("") + "Z";
}
