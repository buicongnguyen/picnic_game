// Event VFX for both stages: a soft flash, a shockwave ring on the cloth, twinkling stars, light rays
// and dust puffs. Each is one picture baked once (white, tinted per colour on demand) and drawn from a
// small fixed pool, so an idle frame costs nothing and a busy one a handful of drawImage calls.
// Reduced motion skips them all. lantern-vfx3d.js draws the same events with three.js sprites.

const TAU = Math.PI * 2;
function canvas(size, paint) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); if (g) paint(g, size / 2);
  return c;
}
/** The white pictures, baked once and shared by both stages (3D wraps them in CanvasTextures). */
let baked = null;
export function vfxPictures() {
  return baked ??= {
    glow: canvas(128, (g, r) => { const d = g.createRadialGradient(r, r, 0, r, r, r); d.addColorStop(0, 'rgba(255,255,255,1)'); d.addColorStop(0.25, 'rgba(255,255,255,0.55)'); d.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = d; g.fillRect(0, 0, r * 2, r * 2); }),
    ring: canvas(128, (g, r) => { const d = g.createRadialGradient(r, r, r * 0.55, r, r, r); d.addColorStop(0, 'rgba(255,255,255,0)'); d.addColorStop(0.7, 'rgba(255,255,255,0.9)'); d.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = d; g.fillRect(0, 0, r * 2, r * 2); }),
    star: canvas(64, (g, r) => {
      const d = g.createRadialGradient(r, r, 0, r, r, r * 0.5); d.addColorStop(0, 'rgba(255,255,255,1)'); d.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = d; g.fillRect(0, 0, r * 2, r * 2); g.fillStyle = '#fff';
      g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, k = i % 2 ? 0.13 : 1; g.lineTo(r + Math.cos(a) * r * k, r + Math.sin(a) * r * k); } g.fill();
    }),
    rays: canvas(256, (g, r) => {
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * TAU, w = 0.07 + (i % 3) * 0.03, d = g.createRadialGradient(r, r, 0, r, r, r);
        d.addColorStop(0, 'rgba(255,255,255,0.8)'); d.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = d; g.beginPath(); g.moveTo(r, r); g.arc(r, r, r * (0.75 + (i % 2) * 0.25), a - w, a + w); g.fill();
      }
    }),
    puff: canvas(64, (g, r) => { const d = g.createRadialGradient(r, r, 0, r, r, r); d.addColorStop(0, 'rgba(255,255,255,0.85)'); d.addColorStop(0.6, 'rgba(255,255,255,0.35)'); d.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = d; g.fillRect(0, 0, r * 2, r * 2); }),
  };
}

/** The effect recipes, in world units and seconds, shared by both drawers. */
export const RECIPES = {
  merge: big => [
    {kind: 'glow', size: 0.9 + big * 0.35, grow: 0.6, life: 0.35, alpha: 0.9},
    {kind: 'ring', size: 0.4, grow: 1.6 + big * 0.5, life: 0.5, alpha: 0.85, flat: true},
    ...Array.from({length: 3 + big}, (_, i) => ({kind: 'star', size: 0.26 + (i % 2) * 0.1, grow: 0.3, life: 0.55 + i * 0.06, alpha: 1, spread: 0.45 + big * 0.12, lift: 0.25, spin: 3, delay: i * 0.04})),
  ],
  lit: () => [
    {kind: 'rays', size: 1.6, grow: 0.9, life: 1.3, alpha: 0.75, spin: 0.6},
    {kind: 'glow', size: 1.4, grow: 0.5, life: 0.8, alpha: 0.9},
    ...Array.from({length: 5}, (_, i) => ({kind: 'star', size: 0.22, grow: 0.2, life: 0.8, alpha: 1, spread: 0.6, lift: 0.4, spin: 2, delay: 0.08 + i * 0.07})),
  ],
  serve: () => [
    {kind: 'glow', size: 1.1, grow: 0.5, life: 0.45, alpha: 0.8},
    {kind: 'ring', size: 0.35, grow: 1.2, life: 0.45, alpha: 0.7, flat: true},
    ...Array.from({length: 3}, (_, i) => ({kind: 'star', size: 0.2, grow: 0.2, life: 0.6, alpha: 1, spread: 0.4, lift: 0.5, spin: 3, delay: i * 0.06})),
  ],
  land: () => Array.from({length: 4}, (_, i) => ({kind: 'puff', size: 0.16, grow: 0.45, life: 0.45, alpha: 0.45, spread: 0.22, lift: 0, flat: true, delay: i * 0.02})),
};
const MAX = 40;
const ease = k => 1 - (1 - k) * (1 - k);

/** A fixed pool of live effects; each slot knows where it started and where it drifts to. */
export class VfxPool {
  constructor() { this.slots = Array.from({length: MAX}, () => ({on: false})); this.time = 0; this.quiet = false; }
  /** Start a recipe at world point (x, y, z). Returns how many slots it took. */
  play(name, x, y, z, color = '#ffe08a', arg = 0) {
    if (this.quiet) return 0;
    let used = 0;
    for (const r of RECIPES[name](arg)) {
      const s = this.slots.find(o => !o.on) || this.slots.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
      const a = Math.random() * TAU, d = (r.spread || 0) * (0.5 + Math.random() * 0.5);
      Object.assign(s, r, {on: true, color: r.kind === 'puff' ? '#fff4e0' : color, x, y, z, dx: Math.cos(a) * d, dz: Math.sin(a) * d * (r.flat ? 1 : 0.4), dy: (r.lift || 0) * (0.6 + Math.random() * 0.6),
        age: -(r.delay || 0), rot: Math.random() * TAU, spin: (r.spin || 0) * (Math.random() < 0.5 ? -1 : 1), flat: !!r.flat});
      used++;
    }
    return used;
  }
  update(dt) {
    let live = 0;
    for (const s of this.slots) { if (!s.on) continue; s.age += dt; s.rot += s.spin * dt; if (s.age >= s.life) s.on = false; else live++; }
    return live;
  }
  /** Progress of a slot: k 0..1 (null while waiting on its delay), position, size and alpha. */
  state(s, out) {
    if (s.age < 0) return null;
    const k = s.age / s.life, e = ease(k);
    out.x = s.x + s.dx * e; out.y = s.y + s.dy * e; out.z = s.z + s.dz * e;
    out.size = s.size * (1 + s.grow * e) * (s.kind === 'star' ? Math.sin(Math.min(1, k * 1.4) * Math.PI) + 0.15 : 1);
    out.alpha = s.alpha * (s.kind === 'star' ? 1 - k * k : (1 - k) * (1 - k));
    return out;
  }
}

/** The light stage's drawer: world points through the bake camera, one drawImage per live slot. */
export class Vfx2D {
  constructor() { this.pool = new VfxPool(); this.tinted = new Map(); this.o = {}; }
  tint(kind, color) {
    const key = kind + color;
    let c = this.tinted.get(key);
    if (!c) {
      const src = vfxPictures()[kind]; c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const g = c.getContext('2d');
      if (g) { g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); }
      if (this.tinted.size > 48) this.tinted.clear();
      this.tinted.set(key, c);
    }
    return c;
  }
  /** project(x, y, z) -> image px {x, y}; unit(x, y, z) -> image px per world unit. Returns drawImage calls. */
  draw(ctx, view, dpr, project, unit) {
    let calls = 0;
    for (const s of this.pool.slots) {
      if (!s.on) continue;
      const st = this.pool.state(s, this.o);
      if (!st || st.alpha < 0.01) continue;
      const p = project(st.x, st.y, st.z), px = (p.x * view.s + view.x) * dpr, py = (p.y * view.s + view.y) * dpr;
      const r = st.size * unit(st.x, st.y, st.z) * view.s * dpr / 2, img = this.tint(s.kind, s.color), c = Math.cos(s.rot), n = Math.sin(s.rot);
      ctx.globalCompositeOperation = s.kind === 'puff' ? 'source-over' : 'lighter';
      ctx.globalAlpha = Math.min(1, st.alpha);
      ctx.setTransform(c, n * (s.flat ? 0.5 : 1), -n, c * (s.flat ? 0.5 : 1), px, py); // flat ones lie on the cloth
      ctx.drawImage(img, -r, -r, r * 2, r * 2);
      calls++;
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return calls;
  }
}
