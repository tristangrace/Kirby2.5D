import * as THREE from 'three';
import { SpriteEntity } from './SpriteEntity.js';
import { getKirbySpriteSheet } from '../gfx/sprites/KirbySprite.js';

const _move = new THREE.Vector3();

/** Kirby. Walks around the level under keyboard control. */
export class Player extends SpriteEntity {
  static type = 'player';

  constructor(game, opts) {
    super(game, opts, getKirbySpriteSheet());
    this.speed = 4.2; // world units per second
    this.radius = 0.28; // collision footprint
    this.maxStep = 0.55; // largest height change that can be walked over
    this.blinkTimer = 2;
    this.velocity = new THREE.Vector3();

    const h = game.level?.heightAt(this.position.x, this.position.z);
    if (h != null) this.position.y = this.groundY = h;
  }

  update(dt) {
    const { input, iso, level } = this.game;

    const axis = input.axis();
    const moving = axis.x !== 0 || axis.y !== 0;
    if (moving) {
      _move.set(0, 0, 0).addScaledVector(iso.groundRight, axis.x).addScaledVector(iso.groundForward, axis.y);
      this.velocity.copy(_move).multiplyScalar(this.speed);
      this.tryMove(this.velocity.x * dt, this.velocity.z * dt);
      if (axis.x !== 0) this.facing = Math.sign(axis.x);
      this.setAnimation('walk');
    } else {
      this.velocity.set(0, 0, 0);
      if (this.animName !== 'blink') this.setAnimation('idle');
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.setAnimation('blink', true);
        this.blinkTimer = 2 + Math.random() * 3;
      }
    }

    // Follow the ground with a little smoothing so ledges read as a hop, not a snap.
    const h = level.heightAt(this.position.x, this.position.z);
    if (h != null) {
      this.groundY = h;
      this.position.y += (h - this.position.y) * Math.min(1, 14 * dt);
    }

    super.update(dt);
  }

  onAnimationEnd(name) {
    if (name === 'blink') this.setAnimation('idle');
  }

  /** Axis-separated move so sliding along walls works. */
  tryMove(dx, dz) {
    const level = this.game.level;
    const from = level.heightAt(this.position.x, this.position.z) ?? this.position.y;
    if (dx !== 0 && this.canOccupy(this.position.x + dx, this.position.z, from)) this.position.x += dx;
    if (dz !== 0 && this.canOccupy(this.position.x, this.position.z + dz, from)) this.position.z += dz;
  }

  canOccupy(x, z, fromHeight) {
    const r = this.radius;
    const level = this.game.level;
    return (
      level.isWalkable(x - r, z - r, fromHeight, this.maxStep) &&
      level.isWalkable(x + r, z - r, fromHeight, this.maxStep) &&
      level.isWalkable(x - r, z + r, fromHeight, this.maxStep) &&
      level.isWalkable(x + r, z + r, fromHeight, this.maxStep)
    );
  }
}
