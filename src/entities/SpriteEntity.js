import * as THREE from 'three';
import { Entity } from './Entity.js';

/**
 * An entity drawn as a pixel-art billboard that always faces the camera,
 * anchored at its feet, with a blob shadow on the ground.
 *
 * Expects a sprite sheet of the shape produced by gfx/sprites/KirbySprite.js:
 *   { width, height, animations: { name: { fps, loop, frames: [{ right, left }] } } }
 */
export class SpriteEntity extends Entity {
  constructor(game, opts, sheet) {
    super(game, opts);
    this.sheet = sheet;
    this.facing = 1; // 1 = right, -1 = left
    this.animName = null;
    this.frameIndex = 0;
    this.frameTime = 0;

    const ppu = game.iso.pixelsPerUnit;
    this.spriteWidth = sheet.width / ppu;
    this.spriteHeight = sheet.height / ppu;

    this.material = new THREE.MeshBasicMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.spriteWidth, this.spriteHeight), this.material);
    this.mesh.frustumCulled = false;

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(this.spriteWidth * 0.46, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;

    this.setAnimation('idle');
  }

  onSpawn(scene) {
    scene.add(this.mesh, this.shadow);
    this.updateVisual();
  }

  onDespawn(scene) {
    scene.remove(this.mesh, this.shadow);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }

  setAnimation(name, restart = false) {
    if (this.animName === name && !restart) return;
    if (!this.sheet.animations[name]) throw new Error('Unknown animation: ' + name);
    this.animName = name;
    this.frameIndex = 0;
    this.frameTime = 0;
  }

  /** Hook for subclasses; fires when a non-looping animation finishes. */
  onAnimationEnd(name) {}

  advanceAnimation(dt) {
    const anim = this.sheet.animations[this.animName];
    const step = 1 / anim.fps;
    this.frameTime += dt;
    while (this.frameTime >= step) {
      this.frameTime -= step;
      if (this.frameIndex + 1 < anim.frames.length) {
        this.frameIndex++;
      } else if (anim.loop) {
        this.frameIndex = 0;
      } else {
        this.frameTime = 0;
        this.onAnimationEnd(this.animName);
        break;
      }
    }
  }

  updateVisual() {
    const iso = this.game.iso;
    const anim = this.sheet.animations[this.animName];
    const frame = anim.frames[Math.min(this.frameIndex, anim.frames.length - 1)];
    const map = this.facing < 0 ? frame.left : frame.right;
    if (this.material.map !== map) {
      const firstMap = !this.material.map;
      this.material.map = map;
      if (firstMap) this.material.needsUpdate = true;
    }

    // Feet on the (pixel-snapped) world position; centre pushed up the screen by
    // half the sprite height and nudged toward the camera to avoid z-fighting
    // with the ground the feet stand on.
    this.mesh.position.copy(this.position);
    iso.snapToPixelGrid(this.mesh.position);
    this.mesh.position.addScaledVector(iso.up, this.spriteHeight / 2).addScaledVector(iso.direction, 0.05);
    this.mesh.quaternion.copy(iso.camera.quaternion);

    this.shadow.position.set(this.position.x, this.groundY + 0.02, this.position.z);
  }

  update(dt) {
    this.advanceAnimation(dt);
    this.updateVisual();
  }
}
