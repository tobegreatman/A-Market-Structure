export interface Pt {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function linePath(points: Pt[]): string {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

export function smoothPath(points: Pt[], tension = 0.18): string {
  if (points.length < 2) return points.length ? `M${points[0].x},${points[0].y}` : '';
  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

export function areaPath(points: Pt[], baseline: number, smooth = true): string {
  if (!points.length) return '';
  const top = smooth ? smoothPath(points) : linePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${top} L${last.x.toFixed(2)},${baseline.toFixed(2)} L${first.x.toFixed(2)},${baseline.toFixed(2)} Z`;
}

export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sx = cx + r * Math.cos(start);
  const sy = cy + r * Math.sin(start);
  const ex = cx + r * Math.cos(end);
  const ey = cy + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M${sx.toFixed(2)},${sy.toFixed(2)} A${r},${r} 0 ${large} 1 ${ex.toFixed(2)},${ey.toFixed(2)}`;
}

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range || 1));
  const fraction = (range || 1) / 10 ** exp;
  let nice: number;
  if (round) {
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
  } else {
    if (fraction <= 1) nice = 1;
    else if (fraction <= 2) nice = 2;
    else if (fraction <= 5) nice = 5;
    else nice = 10;
  }
  return nice * 10 ** exp;
}

/** 返回落在 [min,max] 内的整齐刻度 */
export function ticksBetween(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const step = niceNum((max - min) / count, true);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    out.push(Number(v.toFixed(6)));
    if (out.length > 12) break;
  }
  return out;
}

/**
 * Squarified treemap：按面积权重铺满矩形，保持接近正方形的长宽比。
 */
export function squarify<T extends { value: number }>(items: T[], rect: Rect): Array<T & Rect> {
  const out: Array<T & Rect> = [];
  const total = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return out;

  const scale = (rect.w * rect.h) / total;
  const remaining = items
    .filter((item) => item.value > 0)
    .map((item) => ({ item, area: item.value * scale }))
    .sort((a, b) => b.area - a.area);

  let x = rect.x;
  let y = rect.y;
  let w = rect.w;
  let h = rect.h;
  let row: Array<{ item: T; area: number }> = [];

  const worst = (candidate: Array<{ area: number }>, side: number) => {
    if (!candidate.length) return Number.POSITIVE_INFINITY;
    const sum = candidate.reduce((s, c) => s + c.area, 0);
    const max = Math.max(...candidate.map((c) => c.area));
    const min = Math.min(...candidate.map((c) => c.area));
    if (sum <= 0 || min <= 0 || side <= 0) return Number.POSITIVE_INFINITY;
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };

  const place = () => {
    if (!row.length) return;
    const sum = row.reduce((s, r) => s + r.area, 0);
    if (w >= h) {
      const colW = sum / h;
      let cursor = y;
      for (const r of row) {
        const itemH = r.area / colW;
        out.push({ ...r.item, x, y: cursor, w: colW, h: itemH });
        cursor += itemH;
      }
      x += colW;
      w -= colW;
    } else {
      const rowH = sum / w;
      let cursor = x;
      for (const r of row) {
        const itemW = r.area / rowH;
        out.push({ ...r.item, x: cursor, y, w: itemW, h: rowH });
        cursor += itemW;
      }
      y += rowH;
      h -= rowH;
    }
    row = [];
  };

  for (const entry of remaining) {
    const side = Math.min(w, h);
    if (row.length && worst([...row, entry], side) > worst(row, side)) place();
    row.push(entry);
  }
  place();
  return out;
}

export interface ForceSeedNode {
  id: string;
  weight: number;
  anchorX: number;
  anchorY: number;
}

export interface ForceSeedEdge {
  source: string;
  target: string;
}

/** 轻量力导向布局：斥力 + 弹簧 + 锚点引力，确定性初始化 */
export function forceLayout(
  nodes: ForceSeedNode[],
  edges: ForceSeedEdge[],
  width: number,
  height: number,
): Record<string, Pt> {
  const pos: Record<string, Pt> = {};
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  nodes.forEach((node) => {
    pos[node.id] = {
      x: node.anchorX * width + (rand() - 0.5) * width * 0.07,
      y: node.anchorY * height + (rand() - 0.5) * height * 0.12,
    };
  });

  const edgePairs = edges.filter((e) => pos[e.source] && pos[e.target]);
  const pad = 46;

  for (let iter = 0; iter < 260; iter++) {
    const cooling = 1 - iter / 300;
    const disp: Record<string, Pt> = {};
    nodes.forEach((n) => {
      disp[n.id] = { x: 0, y: 0 };
    });

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const pa = pos[a.id];
        const pb = pos[b.id];
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1) {
          dx = (rand() - 0.5) * 2;
          dy = (rand() - 0.5) * 2;
          dist2 = dx * dx + dy * dy;
        }
        const force = 2100 / dist2;
        const dist = Math.sqrt(dist2);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp[a.id].x += fx;
        disp[a.id].y += fy;
        disp[b.id].x -= fx;
        disp[b.id].y -= fy;
      }
    }

    for (const edge of edgePairs) {
      const pa = pos[edge.source];
      const pb = pos[edge.target];
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const desired = 92 + (1 - Math.min(1, dist / 300)) * 46;
      const force = (dist - desired) * 0.012;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp[edge.source].x += fx;
      disp[edge.source].y += fy;
      disp[edge.target].x -= fx;
      disp[edge.target].y -= fy;
    }

    nodes.forEach((n) => {
      const p = pos[n.id];
      const ax = n.anchorX * width;
      const ay = n.anchorY * height;
      disp[n.id].x += (ax - p.x) * 0.02;
      disp[n.id].y += (ay - p.y) * 0.02;
      p.x += disp[n.id].x * 0.55 * cooling;
      p.y += disp[n.id].y * 0.55 * cooling;
      p.x = Math.max(pad, Math.min(width - pad, p.x));
      p.y = Math.max(pad, Math.min(height - pad, p.y));
    });
  }

  return pos;
}
