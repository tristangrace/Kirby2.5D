import * as THREE from 'three';
import { SpriteEntity } from './SpriteEntity.js';

const _dir = new THREE.Vector3();

/**
 * Base class for things Kirby can fight. Handles being inhaled, taking
 * damage, dying in a puff, and a shared wander behaviour for walkers.
 *
 * Subclasses implement `behave(dt)` and set `hp`, `contactDamage`,
 * `inhalable`, `speed` and friends in their constructor.
 */
export class Enemy extends SpriteEntity {
  constructor(game, opts, sheet) {
    super(game, opts, sheet);
    this.team = 'enemy';
    this.hp = 1;
    this.contactDamage = 1;
    this.inhalable = true;
    this.speed = 1.4;
    this.radius = 0.32;
    this.height = 0.9;
    this.maxDrop = 0.55;

    this.inhalePull = null; // set by the player while inhaling: { x, y, z }
    this.beingInhaled = false;
    this.hurtTimer = 0;
    this.wanderDir = new THREE.Vector3();
    this.wanderTimer = 0;
    this.walking = false;
    this.facing = Math.random() < 0.5 ? -1 : 1;
  }

  update(dt) {
    if (this.inhalePull) {
      this.updateInhaled(dt);
    } else {
      this.beingInhaled = false;
      if (this.hurtTimer > 0) {
        this.hurtTimer -= dt;
        this.setAnimation('hurt');
      } else {
        this.behave(dt);
      }
    }
    this.inhalePull = null;
    if (!this.alive) return;
    super.update(dt);
  }

  /** Pulled toward Kirby's mouth. */
  updateInhaled(dt) {
    const p = this.inhalePull;
    this.beingInhaled = true;
    this.airborne = true;
    this.setAnimation(this.sheet.animations.inhaled ? 'inhaled' : 'hurt');
    _dir.set(p.x - this.position.x, p.y - this.position.y, p.z - this.position.z);
    const dist = _dir.length();
    if (dist < 0.35) {
      this.onSwallowed();
      return;
    }
    const step = Math.min(dist, 7 * dt);
    this.position.addScaledVector(_dir.normalize(), step);
    this.faceToward(-_dir.x, -_dir.z);
    this.refreshGround();
  }

  onSwallowed() {
    this.game.player?.onSwallow(this);
    this.game.events.emit('enemy:swallowed', this);
    this.destroy();
  }

  /** Overridden per enemy. */
  behave(dt) {}

  /**
   * Take damage. Returns false if the hit was ignored (lets a projectile pass
   * through instead of dying against something invulnerable).
   */
  hurt(amount, source) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash();
    if (this.hp <= 0) {
      this.die(source);
    } else {
      this.hurtTimer = 0.3;
      this.onHurt(amount, source);
    }
    return true;
  }

  onHurt(amount, source) {}

  die(source) {
    this.game.spawn('effect', { kind: 'poof', x: this.position.x, y: this.position.y + 0.2, z: this.position.z });
    this.game.events.emit('enemy:defeated', this);
    this.destroy();
  }

  // ---------------------------------------------------------------- helpers

  get player() {
    return this.game.player;
  }

  distanceToPlayer() {
    const p = this.player;
    return p && p.alive ? this.distanceXZ(p) : Infinity;
  }

  /** Unit vector toward Kirby on the ground plane (into `out`). */
  dirToPlayer(out) {
    const p = this.player;
    out.set(p.position.x - this.position.x, 0, p.position.z - this.position.z);
    return out.lengthSq() > 1e-6 ? out.normalize() : out.set(1, 0, 0);
  }

  /** Pick a fresh random heading. */
  randomHeading() {
    const a = Math.random() * Math.PI * 2;
    this.wanderDir.set(Math.cos(a), 0, Math.sin(a));
  }

  /**
   * Amble about: walk a random way for a while, pause, repeat. Turns around
   * when blocked by water, a ledge or the map edge.
   */
  wander(dt, { speed = this.speed, walkAnim = 'walk', idleAnim = 'idle' } = {}) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.walking = Math.random() < 0.65;
      this.wanderTimer = this.walking ? 0.8 + Math.random() * 1.8 : 0.5 + Math.random() * 1.2;
      if (this.walking) this.randomHeading();
    }
    if (this.walking) {
      const blocked = this.tryMove(this.wanderDir.x * speed * dt, this.wanderDir.z * speed * dt);
      if (blocked) {
        this.wanderDir.negate();
        this.wanderTimer = Math.min(this.wanderTimer, 0.6);
      }
      this.faceToward(this.wanderDir.x, this.wanderDir.z);
      this.setAnimation(walkAnim);
    } else {
      this.setAnimation(idleAnim);
    }
  }

  /** Walk straight at Kirby. Returns true if we got stuck. */
  chase(dt, speed = this.speed) {
    this.dirToPlayer(_dir);
    const blocked = this.tryMove(_dir.x * speed * dt, _dir.z * speed * dt);
    this.faceToward(_dir.x, _dir.z);
    return blocked;
  }

  /** Walkers stick to the ground. */
  stickToGround() {
    this.airborne = false;
    this.refreshGround();
    this.position.y = this.groundY;
  }
}
