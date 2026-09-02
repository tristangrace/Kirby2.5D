import * as THREE from 'three';
import { Entity } from './Entity.js';

/**
 * An entity drawn as a pixel-art billboard that always faces the camera,
 * anchored at its feet, with a blob shadow on the ground.
 *
 * Expects a sprite sheet of the shape produced by gfx/sprites/sheet.js:
 *   { width, height, animations: { name: { fps, loop, frames: [{ right, left }] } } }
 *
 * Also provides terrain-aware movement (`tryMove`) shared by Kirby and the
 * walking enemies: an entity may step up at most `maxStep`, drop at most
 * `maxDrop`, and only cross liquid while `airborne`.
 */
export class SpriteEntity extends Entity {
  constructor(game, opts, sheet) {
    super(game, opts);
    this.sheet = sheet;
    this.facing = 1; // 1 = right, -1 = left
    this.animName = null;
    this.frameIndex = 0;
    this.frameTime = 0;

    this.maxStep = 0.55;
    this.maxDrop = 0.55;
    this.airborne = false;
    this.visible = true;
    this.flashTimer = 0;

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

    const h = game.level?.heightAt(this.position.x, this.position.z);
    if (h != null) this.position.y = this.groundY = h;
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

  /** Briefly tint the sprite (hit feedback). */
  flash(color = '#ff6060', seconds = 0.15) {
    this.material.color.set(color);
    this.flashTimer = seconds;
  }

  /** Face left or right on screen from a world-space direction. */
  faceToward(dx, dz) {
    const sx = dx * this.game.iso.groundRight.x + dz * this.game.iso.groundRight.z;
    if (Math.abs(sx) > 1e-3) this.facing = sx > 0 ? 1 : -1;
  }

  /** World-space unit vector for "in front of me" (screen-right times facing). */
  facingDir(out) {
    return out.copy(this.game.iso.groundRight).multiplyScalar(this.facing);
  }

  // ---------------------------------------------------------------- movement

  /** May this entity's footprint corner rest over `tile`? */
  tileOk(tile) {
    if (!tile) return false;
    if (tile.liquid) return this.airborne;
    if (!tile.walkable) return false;
    if (this.airborne) return tile.height <= this.position.y + this.maxStep;
    const rise = tile.height - this.groundY;
    return rise <= this.maxStep && -rise <= this.maxDrop;
  }

  canOccupy(x, z) {
    const r = this.radius;
    const level = this.game.level;
    return (
      this.tileOk(level.tileAtWorld(x - r, z - r)) &&
      this.tileOk(level.tileAtWorld(x + r, z - r)) &&
      this.tileOk(level.tileAtWorld(x - r, z + r)) &&
      this.tileOk(level.tileAtWorld(x + r, z + r))
    );
  }

  /** Axis-separated move so sliding along walls works. Returns true if fully blocked. */
  tryMove(dx, dz) {
    let blockedX = false;
    let blockedZ = false;
    if (dx !== 0) {
      if (this.canOccupy(this.position.x + dx, this.position.z)) this.position.x += dx;
      else blockedX = true;
    }
    if (dz !== 0) {
      if (this.canOccupy(this.position.x, this.position.z + dz)) this.position.z += dz;
      else blockedZ = true;
    }
    return (dx === 0 || blockedX) && (dz === 0 || blockedZ) && (dx !== 0 || dz !== 0);
  }

  /** Re-read the ground height under the entity's centre. */
  refreshGround() {
    const h = this.game.level.heightAt(this.position.x, this.position.z);
    if (h != null) this.groundY = h;
    return this.groundY;
  }

  // ---------------------------------------------------------------- rendering

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
    this.mesh.visible = this.visible;

    this.shadow.position.set(this.position.x, this.groundY + 0.02, this.position.z);
    // Shadow shrinks as the entity rises so height reads on screen.
    const lift = Math.max(0, this.position.y - this.groundY);
    const s = Math.max(0.35, 1 - lift * 0.12);
    this.shadow.scale.set(s, s, 1);
    this.shadow.visible = this.visible;
  }

  update(dt) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.material.color.set('#ffffff');
    }
    this.advanceAnimation(dt);
    this.updateVisual();
  }
}
