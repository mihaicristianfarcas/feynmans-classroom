/* object3d: a solid object built from simple parts (boxes, cylinders, cones, spheres, tori, tubes),
 * drawn as SVG in the anatomy finish: paper-coloured faces shaded by a camera-locked light, crisp
 * outline and crease edges, one lit accent, a soft halo underneath. The reader orbits it by dragging,
 * takes it apart with the explode slider, hides the casing with the cutaway toggle, and taps a part
 * to read what it is. Parts can move with expressions (a piston's height, a crank's angle). */
import { evalNum } from "./expr.ts";
import { circle, line, type Pt, r1, text, textWidth } from "./svg.ts";
import type { FrameState, Object3DScene, Part, RenderOut, Tone } from "./types.ts";
import { HEIGHT, WIDTH } from "./types.ts";

type V3 = [number, number, number];
interface Mesh {
  v: V3[];
  f: number[][];
  /** Each edge with the faces that share it. */
  edges: { a: number; b: number; faces: number[] }[];
  convex: boolean;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Newell's method: a robust normal for any planar-ish polygon. */
function faceNormal(vs: V3[], face: number[]): V3 {
  let x = 0,
    y = 0,
    z = 0;
  for (let i = 0; i < face.length; i++) {
    const a = vs[face[i]],
      b = vs[face[(i + 1) % face.length]];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm([x, y, z]);
}

function withEdges(v: V3[], f: number[][], convex: boolean): Mesh {
  const map = new Map<string, { a: number; b: number; faces: number[] }>();
  f.forEach((face, fi) => {
    for (let i = 0; i < face.length; i++) {
      const a = face[i],
        b = face[(i + 1) % face.length];
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const e = map.get(key) || { a: Math.min(a, b), b: Math.max(a, b), faces: [] };
      e.faces.push(fi);
      map.set(key, e);
    }
  });
  return { v, f, edges: [...map.values()], convex };
}

function box(w: number, d: number, h: number): Mesh {
  const v: V3[] = [];
  for (let i = 0; i < 8; i++) v.push([(i & 1 ? 0.5 : -0.5) * w, (i & 2 ? 0.5 : -0.5) * d, (i & 4 ? 0.5 : -0.5) * h]);
  const f = [
    [4, 5, 7, 6],
    [0, 2, 3, 1],
    [1, 3, 7, 5],
    [0, 4, 6, 2],
    [2, 6, 7, 3],
    [0, 1, 5, 4],
  ];
  return withEdges(v, f, true);
}

/** A surface of revolution about z from a profile of [r, z] points (counter-clockwise in the r–z plane). */
function revolve(profile: [number, number][], n: number, closed: boolean, convex: boolean): Mesh {
  const v: V3[] = [];
  const rings: number[][] = profile.map(([r, z]) => {
    if (r < 1e-9) {
      v.push([0, 0, z]);
      const idx = v.length - 1;
      return new Array(n).fill(idx);
    }
    const ring: number[] = [];
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      v.push([r * Math.cos(a), r * Math.sin(a), z]);
      ring.push(v.length - 1);
    }
    return ring;
  });
  const f: number[][] = [];
  const count = closed ? profile.length : profile.length - 1;
  for (let k = 0; k < count; k++) {
    const A = rings[k],
      B = rings[(k + 1) % profile.length];
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      const quad = [A[j], A[j2], B[j2], B[j]];
      const face = quad.filter((x, i) => quad.indexOf(x) === i);
      if (face.length >= 3) f.push(face);
    }
  }
  return withEdges(v, f, convex);
}

function arc(cx: number, cz: number, r: number, a0: number, a1: number, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return out;
}

export function meshOf(part: Part): Mesh {
  const s = part.size;
  const g = (i: number, d: number) => (s[i] && s[i] > 0 ? s[i] : d);
  switch (part.shape) {
    case "box":
      return box(g(0, 1), g(1, 1), g(2, 1));
    case "plate":
      return box(g(0, 2), g(1, 2), g(2, 0.1));
    case "cylinder": {
      const r = g(0, 0.5),
        h = g(1, 1);
      return revolve(
        [
          [0, -h / 2],
          [r, -h / 2],
          [r, h / 2],
          [0, h / 2],
        ],
        32,
        false,
        true,
      );
    }
    case "cone": {
      const r = g(0, 0.5),
        h = g(1, 1),
        top = Math.max(0, s[2] || 0);
      return revolve(
        [
          [0, -h / 2],
          [r, -h / 2],
          [top, h / 2],
          [0, h / 2],
        ],
        32,
        false,
        true,
      );
    }
    case "prism": {
      const r = g(0, 0.5),
        h = g(1, 1),
        sides = Math.max(3, Math.min(12, Math.round(s[2] || 6)));
      return revolve(
        [
          [0, -h / 2],
          [r, -h / 2],
          [r, h / 2],
          [0, h / 2],
        ],
        sides,
        false,
        true,
      );
    }
    case "sphere": {
      const r = g(0, 0.5);
      return revolve(arc(0, 0, r, -Math.PI / 2, Math.PI / 2, 14), 28, false, true);
    }
    case "capsule": {
      const r = g(0, 0.3),
        h = Math.max(g(1, 1), 2 * r);
      const half = h / 2 - r;
      return revolve([...arc(0, -half, r, -Math.PI / 2, 0, 7), ...arc(0, half, r, 0, Math.PI / 2, 7)], 28, false, true);
    }
    case "torus": {
      const R = g(0, 0.6),
        r = Math.min(g(1, 0.15), R * 0.95);
      return revolve(arc(R, 0, r, 0, Math.PI * 2, 16).slice(0, 16), 36, true, false);
    }
    case "tube": {
      const r = g(0, 0.5),
        h = g(1, 1),
        wall = Math.min(g(2, r * 0.2), r * 0.95);
      return revolve(
        [
          [r - wall, -h / 2],
          [r, -h / 2],
          [r, h / 2],
          [r - wall, h / 2],
        ],
        32,
        true,
        false,
      );
    }
  }
  return box(1, 1, 1);
}

/* ---------------- transforms and camera ---------------- */

function rotation(rx: number, ry: number, rz: number): (p: V3) => V3 {
  const [a, b, c] = [rx, ry, rz].map((d) => (d * Math.PI) / 180);
  const ca = Math.cos(a),
    sa = Math.sin(a),
    cb = Math.cos(b),
    sb = Math.sin(b),
    cc = Math.cos(c),
    sc = Math.sin(c);
  return ([x, y, z]) => {
    // about x, then y, then z
    const y1 = y * ca - z * sa,
      z1 = y * sa + z * ca;
    const x2 = x * cb + z1 * sb,
      z2 = -x * sb + z1 * cb;
    return [x2 * cc - y1 * sc, x2 * sc + y1 * cc, z2];
  };
}

export interface Camera {
  R: V3;
  U: V3;
  D: V3;
}
export function camera(azimuth: number, elevation: number): Camera {
  const a = (azimuth * Math.PI) / 180,
    e = (elevation * Math.PI) / 180;
  const R: V3 = [-Math.sin(a), Math.cos(a), 0];
  const D: V3 = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
  return { R, U: cross(D, R), D };
}

interface Placed {
  part: Part;
  mesh: Mesh;
  world: V3[];
  min: V3;
  max: V3;
  center: V3;
}

function place(part: Part, mesh: Mesh, scope: FrameState["scope"], explode: number): Placed {
  const rot = rotation(
    evalNum(part.rotation[0], scope, 0),
    evalNum(part.rotation[1], scope, 0),
    evalNum(part.rotation[2], scope, 0),
  );
  const pos: V3 = [0, 1, 2].map((i) => evalNum(part.position[i], scope, 0) + part.explode[i] * explode) as V3;
  const world = mesh.v.map((p) => {
    const q = rot(p);
    return [q[0] + pos[0], q[1] + pos[1], q[2] + pos[2]] as V3;
  });
  const min: V3 = [Infinity, Infinity, Infinity],
    max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of world)
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  return { part, mesh, world, min, max, center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
}

/** Back-to-front part order: separating axes between bounding boxes first, depth as the tie-break. */
function paintOrder(parts: Placed[], cam: Camera, screen: (p: V3) => Pt): Placed[] {
  const depth = (p: Placed) => dot3(p.center, cam.D);
  const boxes = parts.map((p) => {
    const corners: V3[] = [];
    for (let i = 0; i < 8; i++)
      corners.push([i & 1 ? p.max[0] : p.min[0], i & 2 ? p.max[1] : p.min[1], i & 4 ? p.max[2] : p.min[2]]);
    const s = corners.map(screen);
    return {
      x0: Math.min(...s.map((q) => q[0])),
      x1: Math.max(...s.map((q) => q[0])),
      y0: Math.min(...s.map((q) => q[1])),
      y1: Math.max(...s.map((q) => q[1])),
    };
  });
  const n = parts.length;
  const after = parts.map(() => [] as number[]);
  const indeg = new Array(n).fill(0);
  const eps = 1e-6;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = boxes[i],
        b = boxes[j];
      if (a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0) continue;
      const A = parts[i],
        B = parts[j];
      let first = -1;
      let gap = -Infinity;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(cam.D[k]) < 1e-3) continue;
        if (A.max[k] <= B.min[k] + eps) {
          const g = (B.min[k] - A.max[k]) * Math.abs(cam.D[k]) + Math.abs(cam.D[k]);
          if (g > gap) {
            gap = g;
            first = cam.D[k] > 0 ? i : j;
          }
        } else if (B.max[k] <= A.min[k] + eps) {
          const g = (A.min[k] - B.max[k]) * Math.abs(cam.D[k]) + Math.abs(cam.D[k]);
          if (g > gap) {
            gap = g;
            first = cam.D[k] > 0 ? j : i;
          }
        }
      }
      if (first < 0) first = depth(A) <= depth(B) ? i : j;
      const second = first === i ? j : i;
      after[first].push(second);
      indeg[second]++;
    }
  const order: Placed[] = [];
  const ready = parts.map((_, i) => i).filter((i) => indeg[i] === 0);
  const done = new Set<number>();
  while (order.length < n) {
    if (!ready.length) {
      // a cycle: release the farthest remaining part
      const rest = parts.map((_, i) => i).filter((i) => !done.has(i));
      rest.sort((x, y) => depth(parts[x]) - depth(parts[y]));
      ready.push(rest[0]);
      indeg[rest[0]] = 0;
    }
    ready.sort((x, y) => depth(parts[x]) - depth(parts[y]));
    const i = ready.shift()!;
    if (done.has(i)) continue;
    done.add(i);
    order.push(parts[i]);
    for (const j of after[i]) if (--indeg[j] === 0 && !done.has(j)) ready.push(j);
  }
  return order;
}

/* ---------------- render ---------------- */

const BRIGHT: Partial<Record<Tone, number>> = { hi: 0, mid: -0.08, lo: -0.2, faint: -0.28, lit: 0.06 };

export function renderObject3D(spec: Object3DScene, state: FrameState, memo: Record<string, unknown>): RenderOut {
  const { scope, vis, focus } = state;
  memo.meshes ??= new Map(spec.parts.map((p) => [p.id, meshOf(p)]));
  const meshes = memo.meshes as Map<string, Mesh>;
  const cam = camera(state.view.azimuth, state.view.elevation);
  const explode = spec.explodable ? Math.max(0, Math.min(1, evalNum("explode", scope, 0))) : 0;
  const cut = !!evalNum("cutaway", scope, 0);

  // the frame: centre and radius of the assembled pose and of the fully apart pose; the camera
  // eases between them with the explode amount, so the object fills the card either way
  if (!memo.frame) {
    const bounds = (amount: number) => {
      const all = spec.parts.map((p) => place(p, meshes.get(p.id)!, scope, amount));
      const min = [0, 1, 2].map((i) => Math.min(...all.map((a) => a.min[i])));
      const max = [0, 1, 2].map((i) => Math.max(...all.map((a) => a.max[i])));
      return {
        center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] as V3,
        radius: Math.max(1e-3, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2),
      };
    };
    const rest = bounds(0);
    memo.frame = { rest, apart: spec.explodable ? bounds(1) : rest };
  }
  const frame = memo.frame as { rest: { center: V3; radius: number }; apart: { center: V3; radius: number } };
  const k = explode * explode * (3 - 2 * explode);
  const center: V3 = [0, 1, 2].map(
    (i) => frame.rest.center[i] + (frame.apart.center[i] - frame.rest.center[i]) * k,
  ) as V3;
  const radius = frame.rest.radius + (frame.apart.radius - frame.rest.radius) * k;
  const labelRoom = spec.labels ? 0.84 : 1;
  const scale = ((HEIGHT * 0.47) / radius) * labelRoom * Math.max(0.2, state.view.zoom || 1);
  const cx = WIDTH / 2 + (state.view.panX || 0) * WIDTH,
    cy = HEIGHT / 2 + 2 + (state.view.panY || 0) * HEIGHT;
  const screen = (p: V3): Pt => {
    const q = sub(p, center);
    return [cx + dot3(q, cam.R) * scale, cy - dot3(q, cam.U) * scale];
  };

  const placed: Placed[] = [];
  for (const part of spec.parts) {
    const o = vis(part.id) * (part.group ? vis(part.group) : 1);
    if (o <= 0.01) continue;
    if (part.when !== "" && !evalNum(part.when, scope, 1)) continue;
    if (cut && (spec.cutaway.includes(part.id) || (part.group && spec.cutaway.includes(part.group)))) continue;
    placed.push(place(part, meshes.get(part.id)!, scope, explode));
  }

  const L = norm([
    -0.45 * cam.R[0] + 0.8 * cam.U[0] + 0.55 * cam.D[0],
    -0.45 * cam.R[1] + 0.8 * cam.U[1] + 0.55 * cam.D[1],
    -0.45 * cam.R[2] + 0.8 * cam.U[2] + 0.55 * cam.D[2],
  ]);
  const out: string[] = [];

  // the halo: a soft shadow under the lowest point of what is drawn
  if (placed.length) {
    const zMin = Math.min(...placed.map((p) => p.min[2]));
    const xs = placed.flatMap((p) => [p.min[0], p.max[0]]),
      ys = placed.flatMap((p) => [p.min[1], p.max[1]]);
    const foot: V3[] = [
      [Math.min(...xs), Math.min(...ys), zMin],
      [Math.max(...xs), Math.min(...ys), zMin],
      [Math.max(...xs), Math.max(...ys), zMin],
      [Math.min(...xs), Math.max(...ys), zMin],
    ];
    const s = foot.map(screen);
    const hx = (Math.min(...s.map((p) => p[0])) + Math.max(...s.map((p) => p[0]))) / 2;
    const hy = Math.max(...s.map((p) => p[1]));
    const hw = (Math.max(...s.map((p) => p[0])) - Math.min(...s.map((p) => p[0]))) * 0.42;
    out.push(
      `<ellipse class="sc-halo" cx="${r1(hx)}" cy="${r1(hy - 2)}" rx="${r1(Math.max(10, hw))}" ry="${r1(Math.max(4, hw * 0.14))}"/>`,
    );
  }

  for (const p of paintOrder(placed, cam, screen)) {
    const { part, mesh, world } = p;
    const proj = world.map(screen);
    const normals = mesh.f.map((face) => faceNormal(world, face));
    const front = normals.map((nrm) => dot3(nrm, cam.D) > 1e-4);
    const lit =
      focus.has(part.id) || (!!part.group && focus.has(part.group)) || state.hover === part.id || part.tone === "lit";
    const tone: Tone = lit ? "lit" : part.tone;
    const lift = BRIGHT[tone] ?? -0.04;
    // features: silhouettes (one face front, one back), creases (sharp angle), open boundaries
    const feature = new Map<number, number[][]>();
    for (const e of mesh.edges) {
      const [f1, f2] = e.faces;
      let owner = -1;
      if (f2 === undefined) owner = front[f1] ? f1 : -1;
      else if (front[f1] !== front[f2]) owner = front[f1] ? f1 : f2;
      else if (front[f1] && dot3(normals[f1], normals[f2]) < 0.82) owner = f1;
      if (owner >= 0) {
        const list = feature.get(owner) || [];
        list.push([e.a, e.b]);
        feature.set(owner, list);
      }
    }
    const faces = mesh.f.map((_, i) => i).filter((i) => front[i]);
    if (!mesh.convex) faces.sort((a, b) => avgDepth(world, mesh.f[a], cam) - avgDepth(world, mesh.f[b], cam));
    const parts: string[] = [];
    for (const i of faces) {
      const nrm = normals[i];
      const lam = Math.max(0, dot3(nrm, L));
      const up = nrm[2];
      let b = 0.38 + 0.62 * lam + (up > 0.8 ? 0.1 : 0) + lift;
      b = Math.max(0, Math.min(1, b));
      const k = Math.round(b * 20) * 5;
      const d = `M${mesh.f[i].map((vi) => `${r1(proj[vi][0])} ${r1(proj[vi][1])}`).join("L")}Z`;
      parts.push(`<path d="${d}" class="sc-face" data-tone="${tone}" style="--b:${k}%"/>`);
      const edges = feature.get(i);
      if (edges)
        parts.push(
          `<path d="${edges.map(([a, c]) => `M${r1(proj[a][0])} ${r1(proj[a][1])}L${r1(proj[c][0])} ${r1(proj[c][1])}`).join("")}" class="sc-edge" data-tone="${tone}"/>`,
        );
    }
    const o = vis(part.id) * (part.group ? vis(part.group) : 1);
    out.push(
      `<g data-id="${part.id}"${o < 0.999 ? ` style="opacity:${r1(o * 100) / 100}"` : ""}>${parts.join("")}</g>`,
    );
  }

  /* labels with leader lines, in two columns beside the object */
  const wantLabels = spec.labels
    ? placed.filter((p) => p.part.label)
    : placed.filter((p) => p.part.label && (state.hover === p.part.id || focus.has(p.part.id)));
  if (wantLabels.length) {
    let x0 = Infinity,
      x1 = -Infinity;
    for (const p of placed)
      for (let i = 0; i < 8; i++) {
        const q = screen([i & 1 ? p.max[0] : p.min[0], i & 2 ? p.max[1] : p.min[1], i & 4 ? p.max[2] : p.min[2]]);
        x0 = Math.min(x0, q[0]);
        x1 = Math.max(x1, q[0]);
      }
    // at most nine names: the watched and main parts first, then the biggest
    const rank = (p: Placed) =>
      (focus.has(p.part.id) || state.hover === p.part.id
        ? 0
        : p.part.tone === "lit"
          ? 1
          : p.part.tone === "hi"
            ? 2
            : 3) *
        1e9 -
      (p.max[0] - p.min[0]) * (p.max[1] - p.min[1]) * (p.max[2] - p.min[2]);
    const items = [...wantLabels]
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 9)
      .map((p) => ({ p, at: screen(p.center), label: p.part.label }));
    // split by screen x, then even the sides out
    items.sort((a, b) => a.at[0] - b.at[0]);
    const mid = (x0 + x1) / 2;
    const left = items.filter((i) => i.at[0] < mid),
      right = items.filter((i) => i.at[0] >= mid);
    while (left.length > right.length + 1) right.unshift(left.pop()!);
    while (right.length > left.length + 1) left.push(right.shift()!);
    const column = (list: typeof items, side: -1 | 1) => {
      list.sort((a, b) => a.at[1] - b.at[1]);
      const widest = Math.max(...list.map((i) => textWidth(i.label, 11)));
      const x = side < 0 ? Math.max(12 + widest, x0 - 26) : Math.min(WIDTH - 12 - widest, x1 + 26);
      const gap = 17;
      let lastY = -Infinity;
      const ys = list.map((i) => {
        const y = Math.max(lastY + gap, Math.min(HEIGHT - 10, i.at[1] + 4));
        lastY = y;
        return y;
      });
      for (let k = ys.length - 1; k >= 0; k--) {
        const max = k === ys.length - 1 ? HEIGHT - 10 : ys[k + 1] - gap;
        if (ys[k] > max) ys[k] = max;
      }
      list.forEach((i, k) => {
        const y = ys[k];
        const lit = state.hover === i.p.part.id || focus.has(i.p.part.id);
        const end: Pt = [x + side * -4, y - 4];
        out.push(
          line([end, i.at], { tone: lit ? "lit" : "lo" }) +
            circle(i.at[0], i.at[1], 1.8, "solid", { tone: lit ? "lit" : "mid" }),
        );
        out.push(
          text(x, y, i.label, {
            size: 11,
            anchor: side < 0 ? "end" : "start",
            tone: lit ? "lit" : "mid",
            id: i.p.part.id,
            halo: true,
            italic: false,
          }),
        );
      });
    };
    if (left.length) column(left, -1);
    if (right.length) column(right, 1);
  }
  return { svg: out.join("") };
}

function avgDepth(world: V3[], face: number[], cam: Camera) {
  let s = 0;
  for (const i of face) s += dot3(world[i], cam.D);
  return s / face.length;
}
