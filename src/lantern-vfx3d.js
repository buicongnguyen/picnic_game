// The 3D clearing's drawer for lantern-vfx.js: the same pool of effects as sprites (and flat quads on the
// cloth for rings and dust), additive and depth-tested but never depth-writing. Only live slots are
// visible, so an idle frame adds no draw calls.
import * as THREE from 'three';
import {VfxPool, vfxPictures} from './lantern-vfx.js';

export class Vfx3D {
  constructor() {
    this.pool = new VfxPool(); this.group = new THREE.Group(); this.group.name = 'vfx'; this.o = {};
    const pics = vfxPictures(), tex = {};
    for (const [k, c] of Object.entries(pics)) { tex[k] = new THREE.CanvasTexture(c); tex[k].colorSpace = THREE.SRGBColorSpace; }
    const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.views = this.pool.slots.map(() => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false}));
      const flat = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({map: tex.ring, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false}));
      sprite.renderOrder = flat.renderOrder = 6; sprite.visible = flat.visible = false;
      this.group.add(sprite, flat);
      return {sprite, flat};
    });
    this.tex = tex;
  }
  play(name, at, color, arg) { return this.pool.play(name, at.x, at.y, at.z, color, arg); }
  update(dt, quiet) {
    this.pool.quiet = quiet;
    this.pool.update(dt);
    for (let i = 0; i < this.pool.slots.length; i++) {
      const s = this.pool.slots[i], v = this.views[i], st = s.on ? this.pool.state(s, this.o) : null;
      const obj = s.flat ? v.flat : v.sprite, other = s.flat ? v.sprite : v.flat;
      other.visible = false;
      if (!st || st.alpha < 0.01) { obj.visible = false; continue; }
      const m = obj.material;
      if (m.userData.kind !== s.kind) { m.map = this.tex[s.kind]; m.blending = s.kind === 'puff' ? THREE.NormalBlending : THREE.AdditiveBlending; m.needsUpdate = true; m.userData.kind = s.kind; }
      m.color.set(s.color); if (s.kind !== 'puff') m.color.multiplyScalar(1.6); // past tone mapping, so they glow obj.material.opacity = Math.min(1, st.alpha);
      obj.position.set(st.x, st.y + (s.flat ? 0.02 : 0), st.z);
      if (s.flat) { obj.scale.set(st.size, 1, st.size); obj.rotation.y = s.rot; } else { obj.scale.setScalar(st.size); obj.material.rotation = s.rot; }
      obj.visible = true;
    }
  }
}
